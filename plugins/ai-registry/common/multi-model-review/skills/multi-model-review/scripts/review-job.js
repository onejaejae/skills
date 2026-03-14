#!/usr/bin/env node
/**
 * Multi-Model Code Review - Job Orchestrator
 *
 * Core logic for orchestrating parallel code reviews across multiple AI models.
 * Handles job creation, worker spawning, result collection, and merging.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync, spawnSync } = require('child_process');

// Cross-Review architecture modules
const {
    prepareAllPeerFindings,
    buildCrossReviewPrompt,
    parseCrossReviewResponse,
    shouldSkipCrossReview,
    createCrossReviewFindingsFile
} = require('../lib/debate-manager');

const {
    CONSENSUS_TYPE,
    CONFIDENCE_BADGES,
    VALIDATION_BADGES,
    buildConsensus,
    resolveDisputes,
    applyChairmanResolutions,
    buildFinalResults,
    calculateValidationScores,
    buildFinalResultsWithValidation
} = require('../lib/consensus-resolver');

const { comparePriority } = require('../lib/priority-sorter');
const { writeJsonAtomic, normalizePath } = require('../lib/fs-utils');
const { parseJsonFromOutput } = require('../lib/json-parser');
const { fetchDiff, fetchPrFileContents, fetchBranchFileContents } = require('../lib/diff-fetcher');
const {
    invokeChairmanWithFallback,
    integrateChairmanResults,
    enrichCommentsWithDetailedFields,
    calculatePriorityCounts,
    calculateCategoryCounts,
    calculateEfficiencyMetrics,
    isCommandAvailable,
    buildChairmanPrompt,
    summarizeReviewForChairman,
    detectPossibleDuplicates,
    shouldSkipChairman
} = require('../lib/chairman');

// ============================================================================
// Configuration & Constants
// ============================================================================

const DEFAULT_TIMEOUT = 180; // seconds

/**
 * Calculate dynamic timeout based on diff size
 * Larger diffs require more processing time for AI models.
 * Examples: 17KB → 146s, 132KB → 318s, 200KB → 420s
 */
function calculateTimeout(diffSizeBytes, configTimeout) {
    const MIN_TIMEOUT = 120;
    const BASE_TIMEOUT = 120;
    const SCALE_FACTOR = 1.5; // seconds per KB

    const diffSizeKB = diffSizeBytes / 1024;
    const dynamicTimeout = Math.ceil(BASE_TIMEOUT + diffSizeKB * SCALE_FACTOR);

    return Math.max(MIN_TIMEOUT, configTimeout || 0, dynamicTimeout);
}

// Adaptive polling configuration
const INITIAL_POLL_INTERVAL = 2000;  // Start at 2s
const MAX_POLL_INTERVAL = 10000;     // Max 10s (exponential backoff)

// Fast failure detection
const FAST_FAILURE_THRESHOLD = 10;   // seconds - if model fails within this, it's a fast failure

// Focus instructions removed - all models now review from all perspectives
// This enables cross-model consensus on the same issues

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse YAML file (simple parser for our config format)
 */
function parseYaml(content) {
    const yaml = require('yaml');
    return yaml.parse(content);
}

/**
 * Load configuration from YAML file
 */
function loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const content = fs.readFileSync(configPath, 'utf8');
    return parseYaml(content);
}

/**
 * Generate unique job ID
 */
function generateJobId() {
    const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '')
        .replace('T', '-')
        .slice(0, 15);
    const hash = crypto.randomBytes(3).toString('hex');
    return `review-${timestamp}-${hash}`;
}

/**
 * Sleep for ms milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build member-specific prompt
 *
 * @param {string} systemPrompt - Base system prompt template
 * @param {Object} member - Member configuration
 * @param {string} context - PR/branch context
 * @param {string} diff - Diff content
 * @returns {string} Complete prompt for the member
 */
function buildMemberPrompt(systemPrompt, member, context, diff, filesContext, stackGuidance) {
    return systemPrompt
        .replace('{{STACK_GUIDANCE}}', stackGuidance || '')
        .replace('{{CONTEXT}}', context)
        .replace('{{FILES_CONTEXT}}', filesContext || '')
        .replace('{{DIFF_CONTENT}}', diff);
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
    const result = { command: args[0] || 'help', options: {} };
    let i = 1;

    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const value = args[i + 1];
            if (value && !value.startsWith('--')) {
                result.options[key] = value;
                i += 2;
            } else {
                result.options[key] = true;
                i++;
            }
        } else {
            result.options.positional = result.options.positional || [];
            result.options.positional.push(arg);
            i++;
        }
    }

    return result;
}

// fetchDiff is now imported from ../lib/diff-fetcher.js
// isCommandAvailable is now imported from ../lib/chairman.js

// ============================================================================
// Worker Management
// ============================================================================

/**
 * Spawn a worker process for a member
 */
function spawnWorker(jobDir, member, config, diffSizeBytes) {
    const workerScript = path.join(__dirname, 'review-worker.js');
    const memberDir = path.join(jobDir, 'members', member.name);
    fs.mkdirSync(memberDir, { recursive: true });

    const configTimeout = config.review?.settings?.timeout || DEFAULT_TIMEOUT;
    const timeout = calculateTimeout(diffSizeBytes || 0, configTimeout);

    const workerArgs = [
        workerScript,
        '--job-dir', jobDir,
        '--member', member.name,
        '--command', member.command,
        '--timeout', String(timeout)
    ];

    // Write initial status
    writeJsonAtomic(path.join(memberDir, 'status.json'), {
        state: 'queued',
        startTime: null,
        endTime: null,
        exitCode: null,
        error: null
    });

    // Spawn detached worker
    // Remove CLAUDECODE env var to allow Claude CLI in nested context
    const { CLAUDECODE: _cc, ...workerEnv } = process.env;
    const child = spawn(process.execPath, workerArgs, {
        detached: true,
        stdio: 'ignore',
        env: workerEnv
    });
    child.unref();

    return { pid: child.pid, timeout };
}

// ============================================================================
// Job Commands
// ============================================================================

/**
 * Start a new review job
 */
async function cmdStart(options) {
    const {
        target,
        'target-type': targetType,
        config: configPath,
        'jobs-dir': jobsDir,
        focus,
        members: membersFilter,
        timeout: timeoutOverride
    } = options;

    // Load configuration
    const config = loadConfig(configPath);

    // Create job directory
    const jobId = generateJobId();
    const jobDir = path.join(jobsDir, jobId);
    fs.mkdirSync(path.join(jobDir, 'members'), { recursive: true });
    fs.mkdirSync(path.join(jobDir, 'prompts'), { recursive: true });

    // Fetch diff
    console.error(`Fetching diff from ${targetType}: ${target}...`);
    const { diff, metadata, source } = await fetchDiff(target, targetType);

    if (!diff || diff.trim().length === 0) {
        console.error('No changes to review');
        process.exit(0);
    }

    // Save diff and metadata
    fs.writeFileSync(path.join(jobDir, 'diff.patch'), diff);
    writeJsonAtomic(path.join(jobDir, 'metadata.json'), metadata);

    // Load system prompt template
    const systemPromptPath = path.join(__dirname, '..', 'prompts', 'system.md');
    const systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');

    // Prepare context
    const context = `
PR Title: ${metadata.title || 'N/A'}
Base Branch: ${metadata.baseRefName || metadata.baseBranch || 'develop'}
Head Branch: ${metadata.headRefName || metadata.headBranch || 'feature'}
Files Changed: ${metadata.files?.length || 'unknown'}
`.trim();

    // Fetch file contents for context (reduces false positives)
    const fileContextConfig = config.review?.file_context || {};
    let filesContext = '';

    if (fileContextConfig.enabled !== false) {
        console.error('Fetching file contents for context...');
        let fileContents = { files: [] };

        if (targetType === 'pr_url') {
            const match = target.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
            if (match) {
                const [, owner, repo, prNumber] = match;
                fileContents = fetchPrFileContents(owner, repo, prNumber, fileContextConfig);
            }
        } else if (targetType === 'branch') {
            const baseBranch = metadata.baseBranch || 'origin/main';
            fileContents = fetchBranchFileContents(target, baseBranch, fileContextConfig);
        }

        if (fileContents.files.length > 0) {
            const filesSections = fileContents.files.map(f => {
                const ext = path.extname(f.path).slice(1) || 'text';
                const truncNote = f.truncated ? ' (truncated)' : '';
                return `### ${f.path}${truncNote}\n\`\`\`${ext}\n${f.content}\n\`\`\``;
            });

            filesContext = `## 변경된 파일 전체 코드\n\n${filesSections.join('\n\n')}\n\n> 위 파일 내용은 변경된 파일의 전체 코드입니다. diff에서 변경된 부분을 리뷰할 때, 이 전체 코드를 참고하여 주변 맥락(import, 상위 함수, 에러 핸들링 구조, 프레임워크 사용 패턴)을 파악하세요.\n> 전체 코드에 이미 처리된 사항(에러 핸들링, 보안 조치 등)을 diff에서 다시 지적하지 마세요.`;
            console.error(`  - ${fileContents.files.length} file(s) loaded (${Math.round(filesContext.length / 1024)}KB)`);
        } else {
            console.error('  - No file contents loaded (disabled or fetch failed)');
        }
    }

    // Detect stack from changed file paths and load guidance
    const changedFilePaths = extractChangedFilePaths(diff);
    const detectedStack = detectStack(changedFilePaths);
    let stackGuidance = '';

    if (detectedStack === 'frontend' || detectedStack === 'mixed') {
        const frontendGuidancePath = path.join(__dirname, '..', 'prompts', 'frontend-guidance.md');
        if (fs.existsSync(frontendGuidancePath)) {
            stackGuidance += fs.readFileSync(frontendGuidancePath, 'utf8');
        }
    }
    if (detectedStack === 'backend' || detectedStack === 'mixed') {
        const backendGuidancePath = path.join(__dirname, '..', 'prompts', 'backend-guidance.md');
        if (fs.existsSync(backendGuidancePath)) {
            stackGuidance += (stackGuidance ? '\n\n' : '') + fs.readFileSync(backendGuidancePath, 'utf8');
        }
    }
    if (detectedStack === 'infra') {
        const infraGuidancePath = path.join(__dirname, '..', 'prompts', 'infra-guidance.md');
        if (fs.existsSync(infraGuidancePath)) {
            stackGuidance += (stackGuidance ? '\n\n' : '') + fs.readFileSync(infraGuidancePath, 'utf8');
        }
    }

    console.error(`Stack detected: ${detectedStack} (${changedFilePaths.length} files analyzed)`);

    // Save base prompt for reference
    const basePrompt = systemPrompt
        .replace('{{STACK_GUIDANCE}}', stackGuidance)
        .replace('{{CONTEXT}}', context)
        .replace('{{FILES_CONTEXT}}', filesContext)
        .replace('{{DIFF_CONTENT}}', diff);
    fs.writeFileSync(path.join(jobDir, 'prompt.txt'), basePrompt);

    // Filter members based on options
    let members = config.review?.members || [];

    if (membersFilter) {
        const allowedMembers = membersFilter.split(',').map(m => m.trim().toLowerCase());
        members = members.filter(m => allowedMembers.includes(m.name.toLowerCase()));
    }

    // Exclude chairman if configured
    const chairman = config.review?.synthesis?.chairman || 'claude';
    if (config.review?.settings?.exclude_chairman !== false) {
        members = members.filter(m => m.name.toLowerCase() !== chairman.toLowerCase());
    }

    // Filter available members (check if CLI is installed)
    const availableMembers = members.filter(m => {
        const available = isCommandAvailable(m.command);
        if (!available) {
            console.error(`Skipping ${m.name}: CLI not available`);
        }
        return available;
    });

    if (availableMembers.length === 0) {
        console.error('No available AI models to run review');
        process.exit(1);
    }

    // Apply timeout override
    if (timeoutOverride) {
        config.review = config.review || {};
        config.review.settings = config.review.settings || {};
        const parsed = parseInt(timeoutOverride, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            config.review.settings.timeout = parsed;
        }
    }

    // Create job.json
    const job = {
        id: jobId,
        state: 'running',
        target,
        targetType,
        source,
        createdAt: new Date().toISOString(),
        config: {
            members: availableMembers.map(m => m.name),
            timeout: config.review?.settings?.timeout || DEFAULT_TIMEOUT,
            focus: focus || 'all'
        },
        memberPids: {}
    };

    // Spawn workers in parallel with async file writes
    // This reduces spawn time from 3-5s to <1s by avoiding blocking I/O
    console.error(`Starting review with ${availableMembers.length} model(s): ${availableMembers.map(m => m.name).join(', ')}`);

    const diffSizeBytes = Buffer.byteLength(diff, 'utf8') + Buffer.byteLength(filesContext, 'utf8');
    const spawnPromises = availableMembers.map(async (member) => {
        // Build member-specific prompt with focus instructions, file context, and stack guidance
        const memberPrompt = buildMemberPrompt(systemPrompt, member, context, diff, filesContext, stackGuidance);

        // Write member-specific prompt file asynchronously
        const memberPromptPath = path.join(jobDir, 'prompts', `${member.name}.txt`);
        await fs.promises.writeFile(memberPromptPath, memberPrompt);

        const { pid, timeout } = spawnWorker(jobDir, member, config, diffSizeBytes);
        job.memberPids[member.name] = pid;

        // Log focus areas if configured
        const focusInfo = member.focus?.length ? ` [focus: ${member.focus.join(', ')}]` : '';
        console.error(`  - ${member.name} (PID: ${pid}, timeout: ${timeout}s)${focusInfo}`);

        return { member: member.name, pid };
    });

    await Promise.all(spawnPromises);

    writeJsonAtomic(path.join(jobDir, 'job.json'), job);

    // Output job directory for caller
    console.log(JSON.stringify({
        jobDir,
        jobId,
        members: availableMembers.map(m => m.name),
        state: 'running'
    }));
}

/**
 * Wait for job completion with adaptive polling and real-time status output
 *
 * Features:
 * - Fast failure detection: warns immediately if model fails within 10s (likely CLI/auth issue)
 * - Real-time status output: shows model completion/failure as it happens
 * - Exponential backoff: reduces polling from ~180 calls to ~15 calls for 3-min job
 * - Cross-Review mode: waits for Pass 1 → Cross-Review (Pass 2) → completion
 *
 * Uses exponential backoff to reduce I/O:
 * - Starts at INITIAL_POLL_INTERVAL (2s)
 * - Increases by 1.5x each iteration
 * - Caps at MAX_POLL_INTERVAL (10s)
 */
async function cmdWait(options) {
    const jobDir = options['job-dir'];
    const rawTimeout = parseInt(options.timeout || '300', 10);
    const timeout = (Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 300) * 1000; // convert to ms

    if (!fs.existsSync(jobDir)) {
        throw new Error(`Job directory not found: ${jobDir}`);
    }

    // Load config
    // Priority: --config option > script directory > fallback default
    const configPath = options.config || path.join(__dirname, '..', 'review.config.yaml');
    let config = { review: {} };
    if (fs.existsSync(configPath)) {
        config = loadConfig(configPath);
        console.error(`Config loaded from: ${configPath}`);
    } else {
        console.error(`[WARNING] Config not found: ${configPath}, using defaults`);
    }

    const crossReviewEnabled = config.review?.cross_review?.enabled;

    const startTime = Date.now();
    let pollInterval = INITIAL_POLL_INTERVAL;

    // Track reported statuses to avoid duplicate output
    const reportedStatuses = new Map(); // memberName -> lastReportedState
    const fastFailureWarned = new Set(); // members we've warned about

    // Wait for Pass 1 completion
    console.error('Pass 1: 독립 리뷰 대기 중...');

    while (true) {
        const status = getJobStatus(jobDir);

        // Real-time status output for each member
        for (const [memberName, memberStatus] of Object.entries(status.members || {})) {
            const lastReported = reportedStatuses.get(memberName);

            // Skip if already reported this state
            if (lastReported === memberStatus.state) continue;

            // Detect fast failure (model failed within FAST_FAILURE_THRESHOLD seconds)
            if (memberStatus.state === 'error' && !fastFailureWarned.has(memberName)) {
                const memberStartTime = memberStatus.startTime ? new Date(memberStatus.startTime) : null;
                const memberEndTime = memberStatus.endTime ? new Date(memberStatus.endTime) : null;

                if (memberStartTime && memberEndTime) {
                    const duration = (memberEndTime - memberStartTime) / 1000;
                    if (duration <= FAST_FAILURE_THRESHOLD) {
                        console.error(`⚠️  빠른 실패 감지: ${memberName} (${duration.toFixed(1)}초 내 에러)`);
                        console.error(`   → CLI 설치 또는 인증 문제일 수 있음`);
                        if (memberStatus.error) {
                            console.error(`   → 에러: ${memberStatus.error.substring(0, 100)}`);
                        }
                        fastFailureWarned.add(memberName);
                    }
                }
            }

            // Report state changes
            if (memberStatus.state === 'done') {
                const duration = memberStatus.startTime && memberStatus.endTime
                    ? ((new Date(memberStatus.endTime) - new Date(memberStatus.startTime)) / 1000).toFixed(1)
                    : '?';
                console.error(`✓ ${memberName} 완료 (${duration}초)`);
            } else if (memberStatus.state === 'error' && lastReported !== 'error') {
                if (!fastFailureWarned.has(memberName)) {
                    console.error(`✗ ${memberName} 에러: ${memberStatus.error || '알 수 없는 에러'}`);
                }
            } else if (memberStatus.state === 'running' && lastReported !== 'running') {
                console.error(`⏳ ${memberName} 실행 중...`);
            } else if (memberStatus.state === 'timed_out') {
                console.error(`⏱️  ${memberName} 타임아웃`);
            } else if (memberStatus.state === 'missing_cli') {
                console.error(`⚠️  ${memberName} CLI 없음`);
            }

            reportedStatuses.set(memberName, memberStatus.state);
        }

        // Check if Pass 1 is complete
        if (status.overallState === 'done' || status.overallState === 'error' || status.overallState === 'partial') {
            // If cross-review is enabled and we have at least partial success, proceed
            if (crossReviewEnabled && (status.overallState === 'done' || status.overallState === 'partial')) {
                console.error('\nPass 1 완료.');

                // Collect Pass 1 results for cross-review
                const pass1Results = await collectPass1Results(jobDir, status);

                // Cross-Review mode: ALL P1-P3 findings are reviewed by all models
                console.error('Cross-Review 모드: 교차 검토 시작...');

                // Check if cross-review should be skipped
                const skipCheck = shouldSkipCrossReview(pass1Results, config);

                if (skipCheck.skip) {
                    console.error(`\n교차 검토 생략: ${skipCheck.reason}`);
                    status.crossReviewSkipped = true;
                    status.crossReviewSkipReason = skipCheck.reason;
                } else {
                    // Count total findings in scope
                    const scopePriorities = config.review?.cross_review?.scope?.priorities || ['P1', 'P2', 'P3'];
                    const totalFindings = pass1Results.reduce((sum, r) => {
                        const comments = r.parsed?.comments || [];
                        return sum + comments.filter(c => scopePriorities.includes(c.priority)).length;
                    }, 0);

                    console.error(`\nPass 2: 교차 검토 시작 (${totalFindings}건 P1-P3 발견)...`);

                    const crossReviewInfo = await startCrossReviewPass(jobDir, pass1Results, config);

                    if (!crossReviewInfo.skipped) {
                        // Wait for cross-review completion
                        const crossReviewTimeout = (config.review?.cross_review?.timeout || 120) * 1000;
                        const crossReviewStatus = await waitForCrossReviewPass(jobDir, crossReviewTimeout);

                        if (crossReviewStatus.done) {
                            console.error('\nPass 2 교차 검토 완료. 신뢰도 점수 계산 중...');
                            status.crossReviewCompleted = true;
                            status.crossReviewSkipped = crossReviewStatus.skipped;
                        } else {
                            console.error('\nPass 2 타임아웃. Pass 1 결과만 사용.');
                            status.crossReviewCompleted = false;
                            status.crossReviewTimeout = true;
                        }
                    } else {
                        console.error(`\n교차 검토 생략: ${crossReviewInfo.reason}`);
                        status.crossReviewSkipped = true;
                        status.crossReviewSkipReason = crossReviewInfo.reason;
                    }

                    status.crossReviewMode = true;
                }
            }

            console.log(JSON.stringify(status));
            return;
        }

        if (Date.now() - startTime >= timeout) {
            status.overallState = 'timeout';
            console.error(`⏱️  전체 타임아웃 (${timeout/1000}초)`);
            console.log(JSON.stringify(status));
            return;
        }

        await sleep(pollInterval);

        // Exponential backoff: increase interval by 1.5x, capped at MAX_POLL_INTERVAL
        pollInterval = Math.min(Math.floor(pollInterval * 1.5), MAX_POLL_INTERVAL);
    }
}

/**
 * Collect Pass 1 results for cross-review
 *
 * @param {string} jobDir - Job directory
 * @param {Object} status - Job status
 * @returns {Array} Pass 1 results
 */
async function collectPass1Results(jobDir, status) {
    const results = [];
    const membersDir = path.join(jobDir, 'members');

    for (const [memberName, memberStatus] of Object.entries(status.members || {})) {
        if (memberStatus.state !== 'done') {
            results.push({
                member: memberName,
                status: memberStatus.state,
                raw: null,
                parsed: null,
                failureReason: memberStatus.state // 'timed_out', 'error', 'missing_cli' etc.
            });
            continue;
        }

        const outputPath = path.join(membersDir, memberName, 'output.txt');
        if (!fs.existsSync(outputPath)) {
            results.push({
                member: memberName,
                status: memberStatus.state,
                raw: null,
                parsed: null,
                failureReason: 'output_missing'
            });
            continue;
        }

        const output = fs.readFileSync(outputPath, 'utf8');

        let parsed = null;
        try {
            parsed = sanitizeReviewOutput(parseJsonFromOutput(output));
        } catch (e) {
            console.error(`Pass 1 결과 파싱 실패 (${memberName}): ${e.message}`);
        }

        results.push({
            member: memberName,
            status: memberStatus.state,
            raw: output,
            parsed,
            failureReason: parsed ? null : 'parse_failure'
        });
    }

    return results;
}

/**
 * Get job status
 *
 * Terminal states for individual members: done, error, timed_out, canceled, missing_cli
 * Overall states:
 * - 'running': at least one member still in progress
 * - 'done': all members completed successfully
 * - 'partial': all members finished, but some had errors
 */
function getJobStatus(jobDir) {
    const jobJsonPath = path.join(jobDir, 'job.json');
    if (!fs.existsSync(jobJsonPath)) {
        return { overallState: 'unknown', error: 'job.json not found' };
    }

    const job = JSON.parse(fs.readFileSync(jobJsonPath, 'utf8'));
    const membersDir = path.join(jobDir, 'members');
    const memberStatuses = {};

    let allDone = true;
    let hasError = false;
    let successCount = 0;

    for (const memberName of job.config.members) {
        const statusPath = path.join(membersDir, memberName, 'status.json');
        if (fs.existsSync(statusPath)) {
            const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            memberStatuses[memberName] = status;

            const TERMINAL_STATES = ['done', 'error', 'timed_out', 'canceled', 'missing_cli'];
            if (!TERMINAL_STATES.includes(status.state)) {
                allDone = false;
            }
            if (status.state === 'error' || status.state === 'timed_out' || status.state === 'missing_cli') {
                hasError = true;
            }
            if (status.state === 'done') {
                successCount++;
            }
        } else {
            memberStatuses[memberName] = { state: 'pending' };
            allDone = false;
        }
    }

    let overallState = 'running';
    if (allDone) {
        // If we have at least one success, it's partial (can still get results)
        // If all failed, it's error
        if (hasError) {
            overallState = successCount > 0 ? 'partial' : 'error';
        } else {
            overallState = 'done';
        }
    }

    return {
        jobId: job.id,
        overallState,
        members: memberStatuses,
        config: job.config,
        successCount,
        totalCount: job.config.members.length
    };
}

/**
 * Status command
 */
async function cmdStatus(options) {
    const jobDir = options['job-dir'];
    const status = getJobStatus(jobDir);
    console.log(JSON.stringify(status, null, 2));
}

// parseJsonFromOutput is now imported from ../lib/json-parser.js

/**
 * Sanitize parsed review comments - ensure required fields have defaults
 */
function sanitizeReviewOutput(parsed) {
    if (!parsed || typeof parsed !== 'object') return parsed;

    if (Array.isArray(parsed.comments)) {
        parsed.comments = parsed.comments.map(c => ({
            ...c,
            file: c.file || 'unknown',
            line: c.line || 0,
            priority: ['P1', 'P2', 'P3', 'P4', 'P5'].includes(c.priority) ? c.priority : 'P5',
            message: c.message || '',
            category: c.category || 'general'
        }));
    } else {
        parsed.comments = [];
    }

    if (!parsed.summary) parsed.summary = '';
    if (!parsed.recommendation) parsed.recommendation = 'COMMENT';

    return parsed;
}

// Chairman functions are now imported from ../lib/chairman.js
// (summarizeReviewForChairman, detectPossibleDuplicates, buildChairmanPrompt,
//  executeChairman, parseChairmanResponse, invokeChairman, invokeChairmanWithFallback,
//  integrateChairmanResults, enrichCommentsWithDetailedFields,
//  calculatePriorityCounts, calculateCategoryCounts, calculateEfficiencyMetrics)

/**
 * Check if all workers approved (for skip_chairman_on_approve)
 *
 * @param {Array} results - Individual worker results
 * @returns {boolean} True if all workers recommend APPROVE
 */
function allWorkersApproved(results) {
    const validResults = results.filter(r => r.parsed?.recommendation);
    if (validResults.length === 0) return false;

    return validResults.every(r =>
        r.parsed.recommendation === 'APPROVE'
    );
}

/**
 * AI-based review synthesis (Chairman) - Main entry point
 *
 * @param {Array} results - Review results from each model
 * @param {Object} config - Configuration object
 * @param {string} jobDir - Job directory path
 * @param {Object} timingInfo - Timing information per model (optional)
 * @returns {Object} Synthesized results
 */
async function synthesizeWithChairman(results, config, jobDir, timingInfo = {}) {
    // First, do algorithmic merge to have a fallback (with config for weights)
    const merged = mergeResults(results, config);
    merged.individualResults = results; // Preserve for Chairman

    // Smart skip: check if Chairman is needed
    const skipResult = shouldSkipChairman(results, config);
    if (skipResult.skip) {
        console.error(`Chairman skipped: ${skipResult.reason}`);
        merged.stats = merged.stats || {};
        merged.stats.strategy = 'merge';
        merged.stats.chairmanSkipped = skipResult.reason;
        merged.stats.efficiency = calculateEfficiencyMetrics(
            results, merged.comments || [], timingInfo, config
        );
        return merged;
    }

    // Invoke Chairman with fallback
    const { fallback, results: finalResults, reason, error } = await invokeChairmanWithFallback(
        jobDir, merged, config, timingInfo
    );

    if (fallback) {
        console.error(`Using fallback merge (reason: ${reason}${error ? ', error: ' + error : ''})`);

        // Add efficiency metrics for fallback case too
        if (finalResults.stats && !finalResults.stats.efficiency) {
            finalResults.stats.efficiency = calculateEfficiencyMetrics(
                results, finalResults.comments || [], timingInfo, config
            );
        }
    }

    return finalResults;
}


// ============================================================================
// Cross-Review Mode Functions
// ============================================================================

/**
 * Start Cross-Review pass (Pass 2) - ALL P1-P3 findings reviewed
 *
 * Each model reviews ALL P1-P3 findings from other models.
 * This provides validation scores for every finding.
 *
 * @param {string} jobDir - Job directory path
 * @param {Array} pass1Results - Results from Pass 1
 * @param {Object} config - Configuration object
 * @returns {Object} Cross-review job info
 */
async function startCrossReviewPass(jobDir, pass1Results, config) {
    const crossReviewDir = path.join(jobDir, 'cross-review');
    fs.mkdirSync(crossReviewDir, { recursive: true });

    // Check if cross-review should be skipped
    const skipCheck = shouldSkipCrossReview(pass1Results, config);
    if (skipCheck.skip) {
        writeJsonAtomic(path.join(crossReviewDir, 'skip.json'), {
            skipped: true,
            reason: skipCheck.reason,
            timestamp: new Date().toISOString()
        });
        return { skipped: true, reason: skipCheck.reason };
    }

    // Load cross-review prompt template
    const crossReviewPromptPath = path.join(__dirname, '..', 'prompts', 'cross-review.md');
    const crossReviewTemplate = fs.readFileSync(crossReviewPromptPath, 'utf8');

    // Load original diff
    const diffPath = path.join(jobDir, 'diff.patch');
    const diff = fs.existsSync(diffPath)
        ? fs.readFileSync(diffPath, 'utf8')
        : '';

    // Get members participating (only those who completed Pass 1)
    const completedMembers = pass1Results.filter(r => r.parsed);

    if (completedMembers.length < 2) {
        const memberDetails = pass1Results.map(r => ({
            member: r.member,
            status: r.status,
            eligible: !!r.parsed,
            failureReason: r.failureReason || null,
            outputSize: r.raw ? r.raw.length : 0
        }));
        const detail = `${completedMembers.length}/${pass1Results.length} members produced valid JSON`;

        console.error(`Not enough members for cross-review: ${detail}`);
        for (const m of memberDetails) {
            if (!m.eligible) {
                console.error(`  - ${m.member}: ${m.failureReason} (output: ${m.outputSize} bytes)`);
            }
        }

        writeJsonAtomic(path.join(crossReviewDir, 'skip.json'), {
            skipped: true,
            reason: 'insufficient_members',
            detail,
            members: memberDetails,
            timestamp: new Date().toISOString()
        });
        return { skipped: true, reason: 'insufficient_members' };
    }

    // Prepare and spawn cross-review workers
    const crossReviewPids = {};
    const timeout = config.review?.cross_review?.timeout || 120;

    for (const memberResult of completedMembers) {
        const memberName = memberResult.member;
        const memberConfig = config.review?.members?.find(m => m.name === memberName);

        // Create cross-review context (ALL peer findings)
        const crossReviewContext = prepareAllPeerFindings(pass1Results, memberName, config);

        if (!crossReviewContext || crossReviewContext.peerFindings.length === 0) {
            console.error(`  - ${memberName} 교차 검토 스킵 (검토할 peer 발견 없음)`);
            continue;
        }

        const memberCrossReviewDir = path.join(crossReviewDir, memberName);
        fs.mkdirSync(memberCrossReviewDir, { recursive: true });

        // Write cross-review context for worker
        writeJsonAtomic(path.join(memberCrossReviewDir, 'cross_review_context.json'), crossReviewContext);

        // Build cross-review prompt
        const crossReviewPrompt = buildCrossReviewPrompt(
            crossReviewTemplate,
            memberName,
            diff,
            crossReviewContext,
            memberConfig
        );

        // Write cross-review prompt
        fs.writeFileSync(path.join(memberCrossReviewDir, 'prompt.txt'), crossReviewPrompt);

        // Spawn cross-review worker
        const pid = spawnCrossReviewWorker(jobDir, memberName, memberConfig, timeout);
        crossReviewPids[memberName] = pid;

        console.error(`  - ${memberName} 교차 검토 시작 (${crossReviewContext.peerFindings.length}건 검토)`);
    }

    if (Object.keys(crossReviewPids).length === 0) {
        console.error('No members have peer findings to cross-review');
        writeJsonAtomic(path.join(crossReviewDir, 'skip.json'), {
            skipped: true,
            reason: 'no_members_with_findings',
            timestamp: new Date().toISOString()
        });
        return { skipped: true, reason: 'no_members_with_findings' };
    }

    // Update job with cross-review info
    const jobJsonPath = path.join(jobDir, 'job.json');
    const job = JSON.parse(fs.readFileSync(jobJsonPath, 'utf8'));
    job.crossReviewState = 'running';
    job.crossReviewPids = crossReviewPids;
    job.crossReviewStartTime = new Date().toISOString();
    job.crossReviewMode = true;
    writeJsonAtomic(jobJsonPath, job);

    return {
        skipped: false,
        crossReviewMode: true,
        members: Object.keys(crossReviewPids),
        pids: crossReviewPids
    };
}

/**
 * Spawn a cross-review worker process
 *
 * @param {string} jobDir - Job directory
 * @param {string} memberName - Member name
 * @param {Object} memberConfig - Member configuration
 * @param {number} timeout - Timeout in seconds
 * @returns {number} Process ID
 */
function spawnCrossReviewWorker(jobDir, memberName, memberConfig, timeout) {
    const workerScript = path.join(__dirname, 'review-worker.js');
    const crossReviewDir = path.join(jobDir, 'cross-review', memberName);

    // Use the same command as the member
    const command = memberConfig?.command || 'claude -p';

    const workerArgs = [
        workerScript,
        '--job-dir', jobDir,
        '--member', `crossreview_${memberName}`,
        '--command', command,
        '--timeout', String(timeout),
        '--cross-review-mode'
    ];

    // Write initial status
    writeJsonAtomic(path.join(crossReviewDir, 'status.json'), {
        state: 'queued',
        startTime: null,
        endTime: null,
        exitCode: null,
        error: null
    });

    // Spawn detached worker
    // Remove CLAUDECODE env var to allow Claude CLI in nested context
    const { CLAUDECODE: _cc2, ...crossEnv } = process.env;
    const child = spawn(process.execPath, workerArgs, {
        detached: true,
        stdio: 'ignore',
        env: {
            ...crossEnv,
            CROSS_REVIEW_DIR: crossReviewDir
        }
    });
    child.unref();

    return child.pid;
}

/**
 * Wait for cross-review pass completion
 *
 * @param {string} jobDir - Job directory
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Object} Cross-review status
 */
async function waitForCrossReviewPass(jobDir, timeout = 180000) {
    const crossReviewDir = path.join(jobDir, 'cross-review');
    const startTime = Date.now();
    let pollInterval = INITIAL_POLL_INTERVAL;
    const reportedDone = new Set();

    // Check if cross-review was skipped
    const skipPath = path.join(crossReviewDir, 'skip.json');
    if (fs.existsSync(skipPath)) {
        return { done: true, skipped: true };
    }

    while (Date.now() - startTime < timeout) {
        const entries = fs.readdirSync(crossReviewDir, { withFileTypes: true });
        const memberDirs = entries.filter(e => e.isDirectory());

        let allDone = true;
        let completedCount = 0;

        for (const dir of memberDirs) {
            const statusPath = path.join(crossReviewDir, dir.name, 'status.json');
            if (!fs.existsSync(statusPath)) {
                allDone = false;
                continue;
            }

            const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            const TERMINAL_STATES = ['done', 'error', 'timed_out', 'canceled'];
            if (TERMINAL_STATES.includes(status.state)) {
                completedCount++;
                if (status.state === 'done' && !reportedDone.has(dir.name)) {
                    console.error(`✓ ${dir.name} 교차 검토 완료`);
                    reportedDone.add(dir.name);
                }
            } else {
                allDone = false;
            }
        }

        if (allDone && memberDirs.length > 0) {
            return { done: true, skipped: false, completedCount };
        }

        await sleep(pollInterval);
        pollInterval = Math.min(Math.floor(pollInterval * 1.5), MAX_POLL_INTERVAL);
    }

    console.error('⏱️ 교차 검토 패스 타임아웃');
    return { done: false, timeout: true };
}

/**
 * Collect cross-review results from Pass 2
 *
 * @param {string} jobDir - Job directory
 * @returns {Object} Cross-review responses
 */
async function collectCrossReviewResults(jobDir) {
    const crossReviewDir = path.join(jobDir, 'cross-review');

    // Check if cross-review was skipped
    const skipPath = path.join(crossReviewDir, 'skip.json');
    if (fs.existsSync(skipPath)) {
        const skipInfo = JSON.parse(fs.readFileSync(skipPath, 'utf8'));
        return { skipped: true, reason: skipInfo.reason };
    }

    const results = [];
    const entries = fs.readdirSync(crossReviewDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const memberName = entry.name;
        const memberCrossReviewDir = path.join(crossReviewDir, memberName);
        const outputPath = path.join(memberCrossReviewDir, 'output.txt');
        const statusPath = path.join(memberCrossReviewDir, 'status.json');

        if (!fs.existsSync(outputPath) || !fs.existsSync(statusPath)) continue;

        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

        // Accept 'done' and 'timed_out' with valid output (model may have
        // produced results before the timeout signal was delivered)
        if (status.state !== 'done' && status.state !== 'timed_out') continue;

        const output = fs.readFileSync(outputPath, 'utf8');
        const parsed = parseCrossReviewResponse(output);

        // Skip if timed_out but no valid votes were produced
        if (status.state === 'timed_out' && (!parsed || !parsed.crossReviewVotes?.length)) {
            console.error(`⚠️ ${memberName} 교차 검토 타임아웃 (유효 결과 없음)`);
            continue;
        }
        if (status.state === 'timed_out') {
            console.error(`⚠️ ${memberName} 교차 검토 타임아웃이나 유효 결과 ${parsed.crossReviewVotes.length}건 수집`);
        }

        results.push({
            member: memberName,
            status: status.state,
            raw: output,
            parsed
        });
    }

    return { skipped: false, results };
}


// ============================================================================
// Cross-Review Architecture Synthesis Functions
// ============================================================================

/**
 * Determine review verdict based on comment priorities
 * @param {Array} comments - Review comments
 * @returns {string} APPROVE | COMMENT | REQUEST_CHANGES
 */
function determineVerdict(comments) {
    if (!comments || comments.length === 0) {
        return 'APPROVE';
    }

    const hasP1 = comments.some(c => c.priority === 'P1');
    const hasConfirmedP2 = comments.some(c =>
        c.priority === 'P2' && c.consensus >= 2
    );

    if (hasP1 || hasConfirmedP2) {
        return 'REQUEST_CHANGES';
    }

    const hasP2 = comments.some(c => c.priority === 'P2');
    const hasP3 = comments.some(c => c.priority === 'P3');

    if (hasP2 || hasP3) {
        return 'COMMENT';
    }

    return 'APPROVE';
}

/**
 * Get outcome label for display
 * @param {Object} comment - Comment object
 * @returns {string} Localized label
 */
function getOutcomeLabel(comment) {
    switch (comment.debateOutcome) {
        case 'confirmed':
            return '합의';
        case 'disputed':
            return '분쟁 해결';
        case 'acknowledged':
            return '인정됨';
        case 'unique':
            return '고유 발견';
        default:
            if (comment.consensus >= 2) {
                return `${comment.consensus}개 모델`;
            }
            return '단독';
    }
}

/**
 * Synthesize results with Cross-Review architecture
 *
 * Cross-Review flow:
 * 1. Pass 1: Independent reviews
 * 2. Pass 2: Cross-review of ALL P1-P3 findings
 * 3. Synthesis: Calculate validation scores and merge
 *
 * @param {Array} pass1Results - Results from Pass 1
 * @param {Object} crossReviewResults - Results from Pass 2 cross-review
 * @param {Object} config - Configuration
 * @param {string} jobDir - Job directory
 * @param {Object} timingInfo - Timing information
 * @returns {Object} Final synthesized results
 */
async function synthesizeWithCrossReview(pass1Results, crossReviewResults, config, jobDir, timingInfo = {}) {
    // First, do standard consensus building from Pass 1
    const consensus = buildConsensus(pass1Results, [], config);

    // Calculate validation scores from cross-review responses
    let validationScores = {};
    if (!crossReviewResults.skipped && crossReviewResults.results?.length > 0) {
        validationScores = calculateValidationScores(
            crossReviewResults.results,
            pass1Results,
            config
        );

        // Save validation scores for debugging
        const validationPath = path.join(jobDir, 'validation_scores.json');
        writeJsonAtomic(validationPath, validationScores);

        console.error(`📊 신뢰도 점수 계산 완료: ${Object.keys(validationScores).length}건`);
    }

    // Build final results with validation
    const finalResults = buildFinalResultsWithValidation(consensus, validationScores, config);

    // Generate cross-review specific summary
    const executiveSummary = generateCrossReviewSummary(
        consensus.stats,
        finalResults.crossReviewStats
    );

    // Determine verdict
    const verdict = determineVerdict(finalResults.comments);

    const algorithmicResult = {
        executiveSummary,
        chairmanVerdict: verdict,
        verdictRationale: `Cross-Review 아키텍처: ${finalResults.crossReviewStats?.validated || 0}건 검증됨, ${finalResults.crossReviewStats?.ignored || 0}건 기각됨`,
        comments: finalResults.comments,
        debateStats: finalResults.debateStats,
        crossReviewStats: finalResults.crossReviewStats,
        debateHighlights: finalResults.debateHighlights,
        stats: {
            totalComments: finalResults.comments?.length || 0,
            byPriority: calculatePriorityCounts(finalResults.comments || []),
            modelsUsed: pass1Results.filter(r => r.parsed).map(r => r.member),
            synthesizedBy: 'cross_review',
            strategy: 'cross_review',
            efficiency: calculateEfficiencyMetrics(pass1Results, finalResults.comments || [], timingInfo, config)
        },
        recommendation: verdict
    };

    // Pass 4: Chairman 최종 검증 (strategy가 ai_merge일 때만)
    const strategy = config.review?.synthesis?.strategy || 'merge';
    if (strategy !== 'ai_merge') {
        return algorithmicResult;
    }

    // Smart skip: check if Chairman is needed based on cross-review quality
    const skipResult = shouldSkipChairman(pass1Results, config, {
        crossReviewStats: finalResults.crossReviewStats,
        comments: finalResults.comments
    });
    if (skipResult.skip) {
        console.error(`Pass 4: Chairman 스킵 - ${skipResult.reason}`);
        algorithmicResult.stats = algorithmicResult.stats || {};
        algorithmicResult.stats.chairmanSkipped = skipResult.reason;
        return algorithmicResult;
    }

    console.error('Pass 4: Chairman 최종 검증 시작...');

    // Chairman에게 전달할 데이터 준비
    algorithmicResult.individualResults = pass1Results;

    const { fallback, results: chairmanResult } = await invokeChairmanWithFallback(
        jobDir, algorithmicResult, config, timingInfo
    );

    if (fallback) {
        console.error('Chairman fallback → 알고리즘 결과 사용');
        return algorithmicResult;
    }

    // Cross-review 데이터 보존하며 Chairman 결과 통합
    chairmanResult.crossReviewStats = finalResults.crossReviewStats;
    chairmanResult.debateStats = finalResults.debateStats;
    chairmanResult.debateHighlights = finalResults.debateHighlights;

    // 각 comment에 cross-review validation 데이터 복원
    restoreCrossReviewValidation(chairmanResult.comments, finalResults.comments);

    // strategy 표시 업데이트
    chairmanResult.stats.synthesizedBy = 'chairman_cross_review';

    return chairmanResult;
}

/**
 * Restore cross-review validation data on Chairman comments.
 * Chairman restructures comments, losing validation/crossReviewValidated fields.
 * Match by file:line to restore original cross-review data.
 *
 * @param {Array} chairmanComments - Comments from Chairman result
 * @param {Array} crossReviewComments - Comments from cross-review algorithmic result
 */
function restoreCrossReviewValidation(chairmanComments, crossReviewComments) {
    if (!chairmanComments || !crossReviewComments) return;

    // Build index from original cross-review comments (normalized paths)
    // Uses category-specific key with file:line fallback
    const validationIndex = {};
    // Also build a file:category → [{line, data}] index for fuzzy line matching
    const fileCategoryIndex = {};
    for (const c of crossReviewComments) {
        const normalizedFile = normalizePath(c.file);
        const baseKey = `${normalizedFile}:${c.line}`;
        const category = c.category || 'general';
        const key = `${baseKey}:${category}`;
        const data = {
            validation: c.validation,
            crossReviewValidated: c.crossReviewValidated,
            modelPerspectives: c.modelPerspectives,
            sources: c.sources,
            foundBy: c.foundBy,
            debateOutcome: c.debateOutcome
        };
        validationIndex[key] = data;
        if (!validationIndex[baseKey]) {
            validationIndex[baseKey] = data;
        }
        // Index by file:category for fuzzy line matching
        const fcKey = `${normalizedFile}:${category}`;
        if (!fileCategoryIndex[fcKey]) fileCategoryIndex[fcKey] = [];
        fileCategoryIndex[fcKey].push({ line: c.line, data });
    }

    // Restore onto Chairman comments (normalized paths)
    const LINE_FUZZY_RANGE = 15;
    for (const c of chairmanComments) {
        const normalizedFile = normalizePath(c.file);
        const baseKey = `${normalizedFile}:${c.line}`;
        const category = c.category || 'general';
        const key = `${baseKey}:${category}`;
        let original = validationIndex[key] || validationIndex[baseKey];

        // Fuzzy match: chairman may change line numbers during merge.
        // Find closest cross-review comment in same file+category within range.
        if (!original && c.line) {
            const fcKey = `${normalizedFile}:${category}`;
            const candidates = fileCategoryIndex[fcKey] || [];
            // Also try without category
            if (candidates.length === 0) {
                const fcKeyGeneral = `${normalizedFile}:general`;
                candidates.push(...(fileCategoryIndex[fcKeyGeneral] || []));
            }
            let bestMatch = null;
            let bestDist = Infinity;
            for (const cand of candidates) {
                const dist = Math.abs(cand.line - c.line);
                if (dist <= LINE_FUZZY_RANGE && dist < bestDist) {
                    bestDist = dist;
                    bestMatch = cand.data;
                }
            }
            original = bestMatch;
        }

        if (original) {
            // Always prefer cross-review validation data over chairman's
            // Chairman often strips these or returns empty arrays/objects
            c.validation = (original.validation && Object.keys(original.validation).length > 0)
                ? original.validation
                : c.validation;
            c.crossReviewValidated = original.crossReviewValidated ?? c.crossReviewValidated;
            c.modelPerspectives = (original.modelPerspectives && original.modelPerspectives.length > 0)
                ? original.modelPerspectives
                : c.modelPerspectives;
            // Always restore original sources — chairman may hallucinate
            // model names (e.g. "cross-review" instead of actual model names)
            c.sources = original.sources;
            c.foundBy = original.foundBy || c.foundBy;
            c.debateOutcome = original.debateOutcome || c.debateOutcome;
        }
    }
}

/**
 * Synthesize using only Pass 1 results (no cross-review)
 *
 * @param {Array} pass1Results - Results from Pass 1
 * @param {Object} config - Configuration
 * @param {Object} timingInfo - Timing information
 * @returns {Object} Synthesized results
 */
function synthesizePass1Only(pass1Results, config, timingInfo = {}) {
    // Build consensus from Pass 1 only
    const consensus = buildConsensus(pass1Results, [], config);
    const finalResults = buildFinalResults(consensus, config);

    // Generate summary
    const executiveSummary = `Pass 1 결과: ${consensus.stats.confirmed}건 합의, ${consensus.stats.unique}건 고유 발견`;

    // Determine verdict
    const verdict = determineVerdict(finalResults.comments);

    return {
        executiveSummary,
        chairmanVerdict: verdict,
        verdictRationale: 'Pass 1 결과만 사용 (Cross-Review 스킵됨)',
        comments: finalResults.comments,
        debateStats: finalResults.debateStats,
        stats: {
            totalComments: finalResults.comments?.length || 0,
            byPriority: calculatePriorityCounts(finalResults.comments || []),
            modelsUsed: pass1Results.filter(r => r.parsed).map(r => r.member),
            synthesizedBy: 'pass1_only',
            strategy: 'pass1_only',
            efficiency: calculateEfficiencyMetrics(pass1Results, finalResults.comments || [], timingInfo, config)
        },
        recommendation: verdict
    };
}

/**
 * Generate summary for Cross-Review architecture results
 *
 * @param {Object} debateStats - Debate statistics
 * @param {Object} crossReviewStats - Cross-review statistics
 * @returns {string} Executive summary
 */
function generateCrossReviewSummary(debateStats, crossReviewStats) {
    const parts = [];

    // Total findings
    const total = crossReviewStats?.totalFindings || 0;
    if (total > 0) {
        parts.push(`총 ${total}건의 발견에 대해 교차 검토 수행`);
    }

    // Validated findings
    const validated = crossReviewStats?.validated || 0;
    if (validated > 0) {
        parts.push(`${validated}건이 동료 검증을 통과 (67%+ 동의)`);
    }

    // Ignored findings
    const ignored = crossReviewStats?.ignored || 0;
    if (ignored > 0) {
        parts.push(`${ignored}건이 과잉 지적으로 판단됨`);
    }

    // Average validation score
    const avgScore = crossReviewStats?.averageValidationScore || 0;
    if (avgScore > 0) {
        parts.push(`평균 신뢰도 점수: ${avgScore}%`);
    }

    // Confirmed multi-model findings
    const confirmed = debateStats?.confirmed || 0;
    if (confirmed > 0) {
        parts.push(`${confirmed}건이 여러 모델에 의해 독립적으로 발견됨`);
    }

    return parts.join('. ') + '.';
}

/**
 * Results command - collect and merge results
 */
async function cmdResults(options) {
    const jobDir = options['job-dir'];
    const format = options.format || 'json';
    const synthesisOverride = options.synthesis;

    const jobJsonPath = path.join(jobDir, 'job.json');
    if (!fs.existsSync(jobJsonPath)) {
        throw new Error(`Job not found: ${jobDir}`);
    }

    const job = JSON.parse(fs.readFileSync(jobJsonPath, 'utf8'));
    const membersDir = path.join(jobDir, 'members');

    // Load config for synthesis settings
    // Priority: --config option > script directory > fallback default
    const configPath = options.config || path.join(__dirname, '..', 'review.config.yaml');
    let config = { review: { synthesis: {} } };
    if (fs.existsSync(configPath)) {
        config = loadConfig(configPath);
    } else {
        console.error(`[WARNING] Config not found: ${configPath}, using defaults`);
    }

    const results = [];
    const timingInfo = {};

    for (const memberName of job.config.members) {
        const outputPath = path.join(membersDir, memberName, 'output.txt');
        const statusPath = path.join(membersDir, memberName, 'status.json');

        if (!fs.existsSync(outputPath)) continue;

        const status = fs.existsSync(statusPath)
            ? JSON.parse(fs.readFileSync(statusPath, 'utf8'))
            : { state: 'unknown' };

        if (status.state !== 'done') continue;

        // Collect timing info from status
        if (status.startTime && status.endTime) {
            const duration = (new Date(status.endTime) - new Date(status.startTime)) / 1000;
            timingInfo[memberName] = parseFloat(duration.toFixed(1));
        }

        const output = fs.readFileSync(outputPath, 'utf8');

        // Try to parse as JSON
        let parsed = null;
        try {
            parsed = parseJsonFromOutput(output);
        } catch (e) {
            console.error(`Failed to parse JSON from ${memberName}: ${e.message}`);
        }

        results.push({
            member: memberName,
            status: status.state,
            raw: output,
            parsed
        });
    }

    // Check for Cross-Review mode
    const crossReviewDir = path.join(jobDir, 'cross-review');
    const crossReviewMode = fs.existsSync(crossReviewDir);

    // Determine synthesis strategy (CLI override takes precedence)
    const strategy = synthesisOverride || config.review?.synthesis?.strategy || 'merge';

    // Apply strategy override to config so downstream functions see it
    if (synthesisOverride) {
        config.review = config.review || {};
        config.review.synthesis = config.review.synthesis || {};
        config.review.synthesis.strategy = synthesisOverride;
    }

    let merged;

    if (crossReviewMode) {
        // Cross-Review mode: use validation scores from peer reviews
        console.error('Synthesizing with Cross-Review Architecture...');

        const crossReviewResults = await collectCrossReviewResults(jobDir);

        if (!crossReviewResults.skipped && crossReviewResults.results?.length > 0) {
            merged = await synthesizeWithCrossReview(results, crossReviewResults, config, jobDir, timingInfo);
        } else {
            // Cross-review was skipped, use Pass 1 results only
            console.error(`Cross-review incomplete (${crossReviewResults.reason || 'no results'}), using Pass 1 only`);
            merged = synthesizePass1Only(results, config, timingInfo);
        }
    } else if (strategy === 'ai_merge') {
        console.error('Synthesizing with Chairman (AI)...');
        merged = await synthesizeWithChairman(results, config, jobDir, timingInfo);
    } else {
        // Default: algorithmic merge (now with config for weights)
        merged = mergeResults(results, config);
        merged.stats = merged.stats || {};
        merged.stats.strategy = 'merge';

        // Add efficiency metrics for non-AI merge too
        merged.stats.efficiency = calculateEfficiencyMetrics(
            results, merged.comments || [], timingInfo, config
        );
    }

    if (format === 'markdown') {
        const markdown = formatAsMarkdown(merged, job, config);

        // Save to git project root's .claude/reviews/ directory
        const { execSync } = require('child_process');
        let projectRoot;
        try {
            projectRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
        } catch {
            projectRoot = process.cwd();
        }
        const reviewsDir = path.join(projectRoot, '.claude', 'reviews');
        fs.mkdirSync(reviewsDir, { recursive: true });
        const reviewPath = path.join(reviewsDir, `REVIEW-${path.basename(jobDir)}.md`);
        fs.writeFileSync(reviewPath, markdown, 'utf8');

        // Calculate stats for summary
        const priorityCounts = merged.stats?.byPriority || {};
        if (Object.keys(priorityCounts).length === 0 && merged.comments) {
            for (const comment of merged.comments) {
                priorityCounts[comment.priority] = (priorityCounts[comment.priority] || 0) + 1;
            }
        }
        const p1Count = priorityCounts['P1'] || 0;
        const p2Count = priorityCounts['P2'] || 0;
        const p3PlusCount = (priorityCounts['P3'] || 0) + (priorityCounts['P4'] || 0);

        // Terminal output: summary only
        console.log(`\n✅ 리뷰 완료!`);
        console.log(`📄 결과 파일: ${reviewPath}`);
        console.log(`\n📊 요약: P1: ${p1Count} | P2: ${p2Count} | P3+: ${p3PlusCount}`);
        console.log(`💡 Tip: VSCode에서 열어 마크다운 프리뷰로 확인하세요 (Cmd+Shift+V)`);
    } else {
        console.log(JSON.stringify(merged, null, 2));
    }
}

/**
 * Merge results from multiple models
 *
 * Improvements implemented:
 * 1. Weight system: Uses member weights from config for weighted consensus
 * 2. Tiered consensus boost: 2 models = +1 level, 3+ models = +2 levels
 * 3. Boost limit: P2 and above cannot be boosted to prevent false must-fix
 * 4. Category in key: Same line different category issues are now separated
 *
 * @param {Array} results - Individual model results
 * @param {Object} config - Optional configuration with member weights
 * @returns {Object} Merged results
 */
function mergeResults(results, config = null) {
    // Build member weight map from config
    const memberWeights = {};
    if (config?.review?.members) {
        for (const member of config.review.members) {
            memberWeights[member.name] = member.weight || 1.0;
        }
    }

    // Key now includes category to separate different issues on same line
    const commentMap = new Map(); // key: "normalizedFile:line:category"
    let summaries = [];
    let recommendations = [];

    for (const result of results) {
        if (!result.parsed) continue;

        if (result.parsed.summary) {
            summaries.push({ member: result.member, summary: result.parsed.summary });
        }

        if (result.parsed.recommendation) {
            recommendations.push(result.parsed.recommendation);
        }

        for (const comment of (result.parsed.comments || [])) {
            // Include category in key to separate different issues on same line
            const category = comment.category || 'general';
            const key = `${normalizePath(comment.file)}:${comment.line}:${category}`;

            if (commentMap.has(key)) {
                const existing = commentMap.get(key);

                // Keep higher priority
                if (comparePriority(comment.priority, existing.priority) < 0) {
                    existing.priority = comment.priority;
                }

                // Merge messages if different
                if (!existing.messages) {
                    existing.messages = [existing.message];
                    existing.sources = [existing.source];
                }
                if (!existing.messages.includes(comment.message)) {
                    existing.messages.push(comment.message);
                }

                existing.sources.push(result.member);
                existing.consensus = existing.sources.length;

                // Calculate weighted consensus
                existing.weightedConsensus = existing.sources.reduce(
                    (sum, s) => sum + (memberWeights[s] || 1.0), 0
                );
            } else {
                const weight = memberWeights[result.member] || 1.0;
                commentMap.set(key, {
                    ...comment,
                    category, // Ensure category is set
                    source: result.member,
                    sources: [result.member],
                    consensus: 1,
                    weightedConsensus: weight
                });
            }
        }
    }

    // Sort by priority
    const comments = Array.from(commentMap.values())
        .sort((a, b) => comparePriority(a.priority, b.priority));

    // Tiered consensus boost with weight consideration
    // - weightedConsensus >= 2.0 (or consensus >= 2): +1 level boost
    // - consensus >= 3: +2 levels boost
    // - Items at boost_limit priority or above are NOT boosted
    // - Default P2: P1/P2 are already critical, only P3-P5 get boosted
    const boostLimit = config?.review?.settings?.boost_limit || 'P2';
    const boostLimitIndex = ['P1', 'P2', 'P3', 'P4', 'P5'].indexOf(boostLimit);

    for (const comment of comments) {
        const currentIdx = ['P1', 'P2', 'P3', 'P4', 'P5'].indexOf(comment.priority);

        // Skip boosting if priority is already at or above boost limit
        if (currentIdx <= boostLimitIndex) {
            continue;
        }

        // Determine boost amount based on consensus
        let boostAmount = 0;
        if (comment.consensus >= 3) {
            // 3+ models agree: +2 levels (e.g., P4 → P2)
            boostAmount = 2;
        } else if (comment.weightedConsensus >= 2.0 || comment.consensus >= 2) {
            // 2 models agree or weighted consensus >= 2.0: +1 level
            boostAmount = 1;
        }

        if (boostAmount > 0) {
            // Calculate new index, but don't go past boost limit
            const newIdx = Math.max(currentIdx - boostAmount, boostLimitIndex + 1);

            if (newIdx < currentIdx) {
                comment.originalPriority = comment.priority;
                comment.priority = ['P1', 'P2', 'P3', 'P4', 'P5'][newIdx];
                comment.boosted = true;
                comment.boostAmount = currentIdx - newIdx;
            }
        }
    }

    // Determine overall recommendation
    let recommendation = 'COMMENT';
    if (recommendations.includes('REQUEST_CHANGES')) {
        recommendation = 'REQUEST_CHANGES';
    } else if (recommendations.every(r => r === 'APPROVE') && recommendations.length > 0) {
        recommendation = 'APPROVE';
    }

    // Generate stats with new metrics
    const consensusIssues = comments.filter(c => c.consensus >= 2).length;
    const soloIssues = comments.filter(c => c.consensus === 1).length;
    const boostedCount = comments.filter(c => c.boosted).length;

    const stats = {
        totalComments: comments.length,
        byPriority: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
        byCategory: { security: 0, performance: 0, quality: 0, testing: 0, docs: 0 },
        modelsUsed: results.filter(r => r.parsed).map(r => r.member),
        // New metrics for effectiveness measurement
        consensusIssues,      // Issues found by 2+ models
        soloIssues,           // Issues found by only 1 model
        boostedCount,         // Number of issues that were priority-boosted
        memberWeights         // Weight configuration used
    };

    for (const comment of comments) {
        if (stats.byPriority[comment.priority] !== undefined) {
            stats.byPriority[comment.priority]++;
        }
        if (comment.category && stats.byCategory[comment.category] !== undefined) {
            stats.byCategory[comment.category]++;
        }
    }

    return {
        summary: summaries.map(s => `[${s.member}] ${s.summary}`).join('\n'),
        comments,
        recommendation,
        stats
    };
}

/**
 * Get the majority suggested priority from PRIORITY_ADJUST perspectives
 *
 * @param {Array} perspectives - modelPerspectives array
 * @returns {string|null} Most frequently suggested priority, or null
 */
function getMajorityAdjustedPriority(perspectives) {
    const adjusted = perspectives.filter(p =>
        p.action === 'PRIORITY_ADJUST' || p.role === 'adjusted'
    );
    if (adjusted.length === 0) return null;
    const priorities = adjusted.map(p => p.suggestedPriority || p.priority).filter(Boolean);
    if (priorities.length === 0) return null;
    const counts = {};
    for (const p of priorities) counts[p] = (counts[p] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Format Cross-Review Dialogue for a comment
 *
 * Displays validation scores and peer review opinions:
 * - Validation score badge (⭐⭐⭐, ⭐⭐, ⭐, 📝)
 * - Peer reviews: AGREE/IGNORE with reasons
 *
 * @param {Object} comment - Comment with validation and modelPerspectives
 * @returns {Array} Lines for the cross-review dialogue
 */
function formatCrossReviewDialogue(comment) {
    const lines = [];

    const MAX_REASON_LENGTH = 800;

    function truncate(text, max) {
        if (!text) return '';
        const cleaned = text.replace(/\n/g, ' ');
        return cleaned.length > max ? cleaned.slice(0, max - 3) + '...' : cleaned;
    }

    // Get validation info
    const validation = comment.validation;
    const validationBadge = validation?.badge || VALIDATION_BADGES.single;
    const agreeCount = validation?.agreeCount || 0;
    const ignoreCount = validation?.ignoreCount || 0;
    const finder = comment.foundBy || comment.sources?.[0] || 'unknown';

    // Distinguish truly confirmed (2+ independent finders in Pass 1) from
    // validation-upgraded unique (1 finder + peers agreed in cross-review).
    // foundBy is set only for unique findings; truly confirmed has no foundBy.
    const isTrulyConfirmed = comment.sources?.length >= 2 && !comment.foundBy;
    const isValidatedUnique = comment.sources?.length >= 2 && !!comment.foundBy;
    const isConfirmed = isTrulyConfirmed || isValidatedUnique;

    const adjustCount = validation?.adjustCount || 0;

    // For truly confirmed findings (independently found by multiple models)
    if (isTrulyConfirmed) {
        const hasAnyPeerVotes = validation &&
            (validation.agreeCount > 0 || validation.ignoreCount > 0 || (validation.adjustCount || 0) > 0);
        // Also check if finders have cross-review comments (debateReason)
        const allPerspectives = comment.modelPerspectives || [];
        const hasFinderCrossReviews = allPerspectives.some(p => p.role === 'finder' && p.debateReason);
        if (comment.crossReviewValidated || hasAnyPeerVotes || hasFinderCrossReviews) {
            // Has cross-review data → fall through to show dialogue
        } else {
            // Genuinely independent finding with no cross-review votes
            const models = comment.sources.join(', ');
            lines.push(`> ${comment.sources.length}개 모델 독립 발견 (${models})\n`);
            return lines;
        }
    }

    // For unique findings with no peer votes, show compact one-liner
    if (!isConfirmed && agreeCount === 0 && ignoreCount === 0 && adjustCount === 0) {
        lines.push(`> ${VALIDATION_BADGES.single} ${finder} 단독 발견\n`);
        return lines;
    }

    // Collect peer reviews
    const perspectives = comment.modelPerspectives || [];
    let peerReviews;
    if (isTrulyConfirmed) {
        // For truly confirmed: show all perspectives that have review data
        // (debateReason for finders, or action/reason for non-finders)
        const sourceSet = new Set(comment.sources || []);
        peerReviews = perspectives.filter(p => {
            // Non-finder peers (cross-review votes from consensus-resolver)
            if (!sourceSet.has(p.model)) return true;
            // Finders with cross-review comments (debateReason or action+reason)
            if (sourceSet.has(p.model) && (p.debateReason || p.reason || p.action)) return true;
            return false;
        });
    } else {
        // For unique/validated-unique: exclude only the original finder
        peerReviews = perspectives.filter(p =>
            p.model !== finder
        );
    }

    // Pre-render peer review entries to check if any have valid actions
    const peerEntries = [];
    for (const review of peerReviews) {
        let action, reason;
        if (review.role === 'finder' && review.debateReason) {
            action = review.crossReviewAction || 'AGREE';
            reason = truncate(review.debateReason, MAX_REASON_LENGTH);
        } else {
            action = review.action || review.role;
            reason = truncate(review.reason, MAX_REASON_LENGTH);
        }

        if (action === 'AGREE' || review.role === 'agreed') {
            peerEntries.push(`✅ **${review.model}** (동의)`);
            peerEntries.push(`> ${reason}\n`);
        } else if (action === 'IGNORE' || review.role === 'ignored') {
            peerEntries.push(`❌ **${review.model}** (과잉 지적)`);
            peerEntries.push(`> ${reason}`);
            if (review.evidence) {
                peerEntries.push(`> 증거: \`${truncate(review.evidence, MAX_REASON_LENGTH)}\``);
            }
            peerEntries.push('');
        } else if (action === 'PRIORITY_ADJUST' || review.role === 'adjusted') {
            const suggested = review.suggestedPriority || review.priority;
            const original = review.originalPriority;
            const adjustLabel = (original && suggested && original !== suggested)
                ? `(${original} → ${suggested})`
                : '(우선순위 조정)';
            peerEntries.push(`🔄 **${review.model}** ${adjustLabel}`);
            peerEntries.push(`> ${reason}\n`);
        }
    }

    // Only show full cross-review dialogue if peer entries exist
    if (peerEntries.length === 0) {
        if (isTrulyConfirmed) {
            const models = comment.sources.join(', ');
            lines.push(`> ${comment.sources.length}개 모델 독립 발견 (${models})\n`);
        } else {
            lines.push(`> ${VALIDATION_BADGES.single} ${finder} 단독 발견\n`);
        }
        return lines;
    }

    lines.push(`#### 🔍 교차 검토\n`);
    if (isTrulyConfirmed) {
        const models = comment.sources.join(', ');
        lines.push(`**독립 발견:** ${models} (${comment.sources.length}개 모델)\n`);
    } else {
        lines.push(`**발견:** ${finder} (${comment.priority})\n`);
    }
    lines.push('**동료 검토:**\n');
    lines.push(...peerEntries);

    // Show missing peer reviewers (models that should have reviewed but didn't)
    const allMembers = comment._allMembers || [];
    if (allMembers.length > 0) {
        const reviewedModels = new Set(peerReviews.map(p => p.model));
        const finderModels = isTrulyConfirmed
            ? new Set(comment.sources || [])
            : new Set([finder]);
        const missingPeers = allMembers.filter(m =>
            !finderModels.has(m) && !reviewedModels.has(m)
        );
        if (missingPeers.length > 0) {
            for (const mp of missingPeers) {
                lines.push(`⚠️ **${mp}** (교차 검토 미참여)\n`);
            }
        }
    }

    return lines;
}

// ============================================================================
// Round 3: Actionable Guide Format
// ============================================================================

/**
 * Security-related keywords for risk detection
 */
const SECURITY_RISK_KEYWORDS = [
    'injection', 'sql injection', 'xss', 'csrf', 'ssrf', 'xxe',
    'authentication', 'authorization', 'privilege', 'escalation',
    'credential', 'password', 'token', 'secret', 'api key', 'hardcoded',
    'sensitive', 'exposure', 'leak', 'vulnerable', 'security',
    'rce', 'command injection', 'path traversal', 'deserialization'
];

/**
 * Format the "Actionable Guide" section (Round 3)
 *
 * Classifies issues by action required:
 * 1. 🚨 즉시 수정 (보안/안정성) - P1 또는 보안 관련 P2
 * 2. ⚠️ PR 전 수정 권장 - P2 + 합의
 * 3. 💬 팀 논의 필요 - 분쟁 이슈
 * 4. 📌 참고 사항 - 고유 발견, P4-P5
 *
 * @param {Object} merged - Merged results
 * @returns {Array} Lines for the actionable guide section
 */
/**
 * Classify consensus level for a comment.
 * Handles confirmed findings (independently found by 2+ models) where
 * all sources are finders and no peer reviewers remain.
 *
 * @returns {'unanimous'|'majority'|'unique'}
 */
function classifyConsensus(comment) {
    const isConfirmed = comment.sources?.length >= 2;

    if (isConfirmed) {
        const sourceSet = new Set(comment.sources || []);
        const perspectives = comment.modelPerspectives || [];
        const peerReviews = perspectives.filter(p =>
            p.role !== 'finder' && !sourceSet.has(p.model)
        );

        // All models are sources — unanimous by definition
        if (peerReviews.length === 0) return 'unanimous';

        // Sources + check if all remaining peers agree
        const peerAgreeCount = peerReviews.filter(p =>
            p.action === 'AGREE' || p.role === 'agreed'
        ).length;
        if (peerAgreeCount >= peerReviews.length) return 'unanimous';
        return 'majority'; // 2+ models found independently = at least majority
    }

    // Not confirmed — standard validation check
    const v = comment.validation;
    if (!v) return 'unique';

    const agreeCount = v.agreeCount || 0;
    const totalReviewers = v.totalReviewers || 0;

    if (agreeCount >= totalReviewers && totalReviewers > 0) return 'unanimous';
    if (agreeCount > 0) return 'majority';
    return 'unique';
}

function formatCrossReviewSummary(comments) {
    const lines = [];
    if (comments.length === 0) return lines;

    // Classify P1-P3 findings by cross-review outcome
    const crossReviewTargets = comments.filter(c =>
        ['P1', 'P2', 'P3'].includes(c.priority)
    );
    const totalCR = crossReviewTargets.length;

    if (totalCR === 0) {
        // No P1-P3 findings — just show priority counts
        lines.push('## 📊 리뷰 요약\n');
        const priorityCounts = {};
        for (const c of comments) {
            priorityCounts[c.priority] = (priorityCounts[c.priority] || 0) + 1;
        }
        const parts = ['P1', 'P2', 'P3', 'P4']
            .filter(p => priorityCounts[p])
            .map(p => `${p}: ${priorityCounts[p]}`);
        lines.push(`**우선순위별:** ${parts.join(' | ')}\n`);
        return lines;
    }

    // Count by consensus level (uses classifyConsensus to handle confirmed findings)
    const unanimousCount = crossReviewTargets.filter(c => classifyConsensus(c) === 'unanimous').length;
    const majorityCount = crossReviewTargets.filter(c => classifyConsensus(c) === 'majority').length;
    const uniqueCount = crossReviewTargets.filter(c => classifyConsensus(c) === 'unique').length;
    const confirmedCount = crossReviewTargets.filter(c => c.debateOutcome === 'confirmed').length;
    const disputedCount = crossReviewTargets.filter(c => c.debateOutcome === 'disputed').length;
    // Items independently found by 2+ models are inherently verified (no debateOutcome needed)
    const independentlyFoundCount = crossReviewTargets.filter(c =>
        (c.sources?.length >= 2) && !c.debateOutcome
    ).length;
    const verifiedCount = confirmedCount + disputedCount + independentlyFoundCount;
    const verificationRate = totalCR > 0
        ? Math.round((verifiedCount / totalCR) * 100)
        : 100;

    // P4 count
    const p4Count = comments.filter(c => c.priority === 'P4').length;

    lines.push('## 교차 검토 요약\n');
    lines.push(`**교차 검증률:** ${verificationRate}% (${verifiedCount}/${totalCR}건)\n`);

    if (verificationRate < 30 && totalCR > 2) {
        lines.push(`> ⚠️ 대부분의 발견이 교차 검증되지 않았습니다. 주요 이슈는 직접 확인을 권장합니다.\n`);
    }

    // Consensus breakdown table
    lines.push('| 구분 | 건수 |');
    lines.push('|------|------|');
    if (unanimousCount > 0) lines.push(`| ⭐⭐⭐ 전원 합의 | ${unanimousCount} |`);
    if (majorityCount > 0) lines.push(`| ⭐⭐ 다수 동의 | ${majorityCount} |`);
    if (uniqueCount > 0) lines.push(`| 📝 단독 발견 | ${uniqueCount} |`);
    lines.push('');

    // Priority distribution
    const priorityCounts = {};
    for (const c of comments) {
        priorityCounts[c.priority] = (priorityCounts[c.priority] || 0) + 1;
    }
    const parts = ['P1', 'P2', 'P3', 'P4']
        .filter(p => priorityCounts[p])
        .map(p => `${p}: ${priorityCounts[p]}`);
    lines.push(`**우선순위별:** ${parts.join(' | ')}\n`);

    return lines;
}

function formatActionableGuide(merged) {
    const lines = [];
    const comments = merged.comments || [];

    if (comments.length === 0) return lines;

    // Only show 🚨 즉시 수정 section (P1 or security P2)
    // Other categories (PR 전 수정, 팀 논의, 참고) are redundant with detailed comments
    const immediateAction = [];

    for (const c of comments) {
        const isSecurityRelated = isSecurity(c);
        if (c.priority === 'P1' || (c.priority === 'P2' && isSecurityRelated)) {
            immediateAction.push(c);
        }
    }

    if (immediateAction.length === 0) return lines;

    lines.push('## 🚨 즉시 수정 (보안/안정성)\n');

    for (const c of immediateAction) {
        const shortPath = shortenFilePath(c.file);
        const confidenceMap = { high: '🔴', medium: '🟡', low: '🟢' };
        const confidenceBadge = confidenceMap[c.confidence] || '';
        const riskLabel = isSecurity(c) ? ' 🔐' : '';

        lines.push(`**${c.priority}${riskLabel}** \`${shortPath}:${c.line}\` ${confidenceBadge}`);

        // 간략한 메시지
        const msg = c.message?.length > 100 ? c.message.slice(0, 97) + '...' : c.message;
        lines.push(`- **이슈:** ${msg}`);

        // Quick Fix 제안 (있으면)
        if (c.solution || c.suggestion) {
            const fix = c.solution || c.suggestion;
            const fixPreview = fix.length > 80 ? fix.slice(0, 77) + '...' : fix;
            lines.push(`- **Quick Fix:** \`${fixPreview.replace(/\n/g, ' ')}\``);
        }

        // 합의 정보
        if (c.consensus >= 2) {
            if (c.crossReviewValidated) {
                lines.push(`- **교차 검증:** ${c.sources?.join(' → ') || c.consensus + '개 모델'}`);
            } else {
                lines.push(`- **합의:** ${c.sources?.join(' + ') || c.consensus + '개 모델'}`);
            }
        }

        lines.push('');
    }

    return lines;
}

/**
 * Check if a comment is security-related
 *
 * @param {Object} comment - Comment object
 * @returns {boolean} True if security-related
 */
function isSecurity(comment) {
    if (comment.category === 'security') return true;

    const text = ((comment.message || '') + ' ' + (comment.concern || '')).toLowerCase();
    return SECURITY_RISK_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * Format the "Priority Evolution" section showing boost history
 *
 * @param {Object} merged - Merged results with boosted comments
 * @returns {Array} Lines for the priority evolution section
 */
function formatPriorityEvolution(merged) {
    const lines = [];

    // Find boosted comments
    const boostedComments = (merged.comments || []).filter(c => c.boosted);

    if (boostedComments.length === 0) return lines;

    lines.push('## 우선순위 변경 이력\n');

    lines.push('| 위치 | 원래 | 최종 | 사유 |');
    lines.push('|------|------|------|------|');

    for (const comment of boostedComments) {
        // Shorten file path for display
        const shortFile = shortenFilePath(comment.file);
        const location = `${shortFile}:${comment.line}`;
        const original = comment.originalPriority || '?';
        const final = comment.priority;
        const boostAmount = comment.boostAmount || 1;

        // Determine reason based on consensus
        let reason;
        if (comment.consensus >= 3) {
            reason = `${comment.consensus}개 모델 합의 (+${boostAmount})`;
        } else if (comment.consensus >= 2) {
            reason = `${comment.consensus}개 모델 합의 (+${boostAmount})`;
        } else if (comment.weightedConsensus >= 2.0) {
            reason = `가중 합의 ${comment.weightedConsensus.toFixed(1)} (+${boostAmount})`;
        } else {
            reason = `합의 부스트 (+${boostAmount})`;
        }

        lines.push(`| ${location} | ${original} | ${final} | ${reason} |`);
    }

    lines.push('');

    // Check for security tiebreaker
    const securityBoosted = boostedComments.filter(c =>
        c.category === 'security' || c.message?.toLowerCase().includes('security')
    );
    if (securityBoosted.length > 0) {
        lines.push('### 보안 타이브레이커 적용\n');
        for (const c of securityBoosted.slice(0, 3)) {
            const shortFile = shortenFilePath(c.file);
            lines.push(`- **${shortFile}:${c.line}**: 보안 기본값으로 ${c.priority} 적용`);
        }
        lines.push('');
    }

    return lines;
}

/**
 * Shorten file path for display
 * Shows last 2 directory components + filename
 *
 * @param {string} filePath - Full file path
 * @returns {string} Shortened path
 */
function shortenFilePath(filePath) {
    if (!filePath) return filePath;

    const parts = filePath.split('/');
    if (parts.length <= 3) return filePath;

    // Take last 3 parts (2 dirs + filename)
    return parts.slice(-3).join('/');
}

/**
 * Get output configuration from config
 *
 * @param {Object} config - Configuration object
 * @returns {Object} Output settings with defaults
 */
function getOutputConfig(config) {
    const output = config?.review?.output || {};
    return {
        verbosity: output.verbosity || 'standard',
        // showValueProposition: disabled by default (불필요한 섹션)
        showValueProposition: output.show_value_proposition === true,
        showCrossReviewHighlights: output.show_cross_review_highlights !== false,
        showPriorityEvolution: output.show_priority_evolution !== false,
        showModelPerspectives: output.show_model_perspectives !== false
    };
}

/**
 * Format results as markdown (with Chairman support)
 */
function formatAsMarkdown(merged, job, config = {}) {
    const lines = [];
    const outputConfig = getOutputConfig(config);

    lines.push('# 멀티모델 코드 리뷰 결과\n');
    lines.push(`**PR/브랜치:** ${job.target}`);

    // Show models with their focus areas
    const modelsUsed = merged.stats?.modelsUsed || [];
    const focusByModel = merged.stats?.efficiency?.focusByModel || {};
    const modelDescriptions = modelsUsed.map(m => {
        const focus = focusByModel[m];
        return focus?.length ? `${m} (${focus.join(', ')})` : m;
    });
    lines.push(`**참여 모델:** ${modelDescriptions.join(', ')}`);

    // Warn about missing models
    const configuredMembers = config.review?.members?.map(m => m.name) || [];
    const missingModels = configuredMembers.filter(m => !modelsUsed.includes(m));
    if (missingModels.length > 0) {
        lines.push(`> ⚠️ ${missingModels.join(', ')} 미참여 — 교차 검증이 제한적입니다`);
    }

    // Show verdict with appropriate label based on synthesis strategy
    const verdict = merged.chairmanVerdict || merged.recommendation;
    const isChairmanSynthesis = merged.stats?.strategy === 'ai_merge'
        || merged.stats?.synthesizedBy === 'chairman'
        || merged.stats?.synthesizedBy === 'chairman_cross_review';
    const verdictLabel = isChairmanSynthesis ? '의장 판정' : '종합 판정';
    lines.push(`**${verdictLabel}:** ${verdict}\n`);

    // Executive Summary
    if (merged.executiveSummary) {
        const summaryLabel = isChairmanSynthesis ? '요약 (의장)' : '요약 (교차 검토)';
        lines.push(`## ${summaryLabel}\n`);
        // Split executiveSummary by \n for structured display (P2 (N건): ...\nP3 (N건): ...)
        const summaryLines = merged.executiveSummary.split('\n').filter(l => l.trim());
        for (const sl of summaryLines) {
            lines.push(`> ${sl}`);
        }
        lines.push('');
        if (merged.verdictRationale) {
            lines.push(`**판정 근거:** ${merged.verdictRationale}\n`);
        }
    } else if (merged.summary) {
        // Fallback to regular summary
        lines.push('## 요약\n');
        lines.push(merged.summary + '\n');
    }

    // === OUTPUT ORDER ===
    // 1. 요약 (위에서 처리됨)
    // 2. 🚨 즉시 수정 (P1 또는 보안 P2만)
    // 3. 교차 검토 요약 (합의/분쟁/고유 + 통계)
    // 4. 상세 코멘트 (P1~P5)

    // Actionable Guide - 🚨 즉시 수정만 표시
    lines.push(...formatActionableGuide(merged));

    // Cross-review summary section
    const comments = merged.comments || [];
    lines.push(...formatCrossReviewSummary(comments));

    lines.push('## 📝 리뷰 코멘트\n');

    // Inject allMembers into each comment for cross-review completeness check
    const allMembers = config.review?.members?.map(m => m.name) || [];
    const byPriority = {};
    for (const comment of (merged.comments || [])) {
        comment._allMembers = allMembers;
        if (!byPriority[comment.priority]) {
            byPriority[comment.priority] = [];
        }
        byPriority[comment.priority].push(comment);
    }

    for (const priority of ['P1', 'P2', 'P3', 'P4']) {
        const commentList = byPriority[priority];
        if (!commentList || commentList.length === 0) continue;

        lines.push(`## ${priority} - ${getPriorityLabel(priority)}\n`);

        for (const comment of commentList) {
            // Use formatDetailedComment for rich context output
            lines.push(...formatDetailedComment(comment));
        }
    }

    // Strategy info at the end
    if (merged.stats?.strategy) {
        lines.push(`*통합 전략: ${merged.stats.strategy}*`);
        if (merged.stats.synthesisError) {
            lines.push(`*폴백 사유: ${merged.stats.synthesisError}*`);
        }
        if (merged.stats.chairmanSkipped) {
            lines.push(`*의장 생략: ${merged.stats.chairmanSkipped}*`);
        }
    }

    return lines.join('\n');
}

function getPriorityLabel(priority) {
    const labels = {
        P1: '🚨 반드시 수정',
        P2: '⚠️ 수정 권장',
        P3: '💡 검토 필요',
        P4: '📌 개선 고려',
        P5: '📝 참고'
    };
    return labels[priority] || priority;
}

/**
 * Detect programming language from file extension
 *
 * @param {string} filePath - File path
 * @returns {string} Language identifier for code blocks
 */
function detectLanguage(filePath) {
    if (!filePath) return '';

    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'jsx': 'javascript',
        'java': 'java',
        'go': 'go',
        'rs': 'rust',
        'rb': 'ruby',
        'php': 'php',
        'cs': 'csharp',
        'cpp': 'cpp',
        'c': 'c',
        'h': 'c',
        'hpp': 'cpp',
        'kt': 'kotlin',
        'swift': 'swift',
        'scala': 'scala',
        'sql': 'sql',
        'sh': 'bash',
        'bash': 'bash',
        'zsh': 'bash',
        'yaml': 'yaml',
        'yml': 'yaml',
        'json': 'json',
        'xml': 'xml',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'md': 'markdown'
    };

    return langMap[ext] || '';
}

/**
 * Extract changed file paths from a unified diff string.
 *
 * @param {string} diff - Unified diff content
 * @returns {string[]} Array of file paths found in diff headers
 */
function extractChangedFilePaths(diff) {
    if (!diff) return [];
    const paths = [];
    const regex = /^diff --git a\/(.+?) b\/(.+)$/gm;
    let match;
    while ((match = regex.exec(diff)) !== null) {
        paths.push(match[2]);
    }
    return [...new Set(paths)];
}

/**
 * Detect the tech stack (frontend/backend/mixed/generic) from changed file paths.
 *
 * Scoring: extension match → +2, path segment match → +1
 * Result: infraRatio >= 0.5 → 'infra', frontendRatio >= 0.75 → 'frontend',
 *         backendRatio >= 0.75 → 'backend', both > 0 → 'mixed', all 0 → 'generic'
 *
 * @param {string[]} filePaths - Array of changed file paths
 * @returns {'frontend'|'backend'|'mixed'|'infra'|'generic'} Detected stack
 */
function detectStack(filePaths) {
    if (!filePaths || filePaths.length === 0) return 'generic';

    const FRONTEND_EXTS = new Set(['jsx', 'tsx', 'vue', 'svelte', 'css', 'scss', 'sass', 'less', 'html']);
    const BACKEND_EXTS = new Set(['py', 'java', 'go', 'rs', 'rb', 'php', 'cs', 'kt', 'scala', 'swift', 'sql', 'prisma']);
    const INFRA_EXTS = new Set(['tf', 'hcl', 'tfvars']);
    const INFRA_FILES = new Set(['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore', 'Jenkinsfile', 'Makefile']);
    const FRONTEND_PATHS = ['components/', 'pages/', 'views/', 'hooks/', 'styles/', 'public/', 'client/'];
    const BACKEND_PATHS = ['api/', 'routes/', 'controllers/', 'services/', 'models/', 'middleware/', 'server/'];
    const INFRA_PATHS = ['terraform/', 'infra/', '.github/workflows/', 'deploy/', 'monitoring/', 'k8s/', 'helm/', 'ansible/'];

    let frontendScore = 0;
    let backendScore = 0;
    let infraScore = 0;
    let totalFiles = 0;

    for (const filePath of filePaths) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const fileName = path.basename(filePath);
        const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

        // Infra scoring — check before skipping non-code files
        // because infra files often have yaml/env/json extensions
        if (INFRA_EXTS.has(ext)) {
            infraScore += 2;
            totalFiles++;
            continue;
        }
        if (INFRA_FILES.has(fileName)) {
            infraScore += 2;
            totalFiles++;
            continue;
        }
        let infraPathMatched = false;
        for (const ip of INFRA_PATHS) {
            if (normalizedPath.includes(ip)) {
                infraScore += 1;
                infraPathMatched = true;
                break;
            }
        }
        if (infraPathMatched) {
            totalFiles++;
            continue;
        }

        if (!ext) continue;

        // Skip non-code files (only after infra check)
        if (['md', 'json', 'yaml', 'yml', 'toml', 'lock', 'txt', 'gitignore', 'env'].includes(ext)) continue;

        totalFiles++;

        // Extension-based scoring (+2)
        if (FRONTEND_EXTS.has(ext)) {
            frontendScore += 2;
            continue;
        }
        if (BACKEND_EXTS.has(ext)) {
            backendScore += 2;
            continue;
        }

        // Path-based scoring for ambiguous extensions (js, ts, etc.) (+1)
        let matched = false;
        for (const fp of FRONTEND_PATHS) {
            if (normalizedPath.includes(fp)) {
                frontendScore += 1;
                matched = true;
                break;
            }
        }
        if (!matched) {
            for (const bp of BACKEND_PATHS) {
                if (normalizedPath.includes(bp)) {
                    backendScore += 1;
                    break;
                }
            }
        }
    }

    const totalScore = frontendScore + backendScore + infraScore;
    if (totalScore === 0) return 'generic';

    // Infra takes priority — if ≥50% of score is infra, classify as infra
    const infraRatio = infraScore / totalScore;
    if (infraRatio >= 0.5) return 'infra';

    const appScore = frontendScore + backendScore;
    if (appScore === 0) return 'generic';
    const frontendRatio = frontendScore / appScore;
    const backendRatio = backendScore / appScore;

    if (frontendRatio >= 0.75) return 'frontend';
    if (backendRatio >= 0.75) return 'backend';
    return 'mixed';
}

/**
 * Format a detailed comment with rich context (P1-P3)
 *
 * New output format with 5-step reasoning chain:
 * - currentCode: The actual problematic code
 * - rootCause: Why this is a problem
 * - impact: What can happen
 * - solution: How to fix it
 * - benefit: Why this solution works
 *
 * @param {Object} comment - Comment object with reasoning or legacy fields
 * @returns {Array} Lines for the detailed comment
 */

/**
 * Check if text looks like code (starts with common code patterns)
 */
function looksLikeCode(text) {
    if (!text) return false;
    // Strip leading backticks/quotes that Chairman sometimes wraps around code
    const stripped = text.replace(/^[`'"]+/, '');
    // General programming patterns
    const codePatterns = /^(import |export |const |let |var |function |class |def |async |return |if |for |while |try |switch |from |await |new |this\.|self\.|db\.|app\.|router\.|\/\/|#|{|\[|<[a-zA-Z])/m;
    if (codePatterns.test(text) || codePatterns.test(stripped)) return true;
    // Infra/DevOps patterns: shell, HCL, YAML, Docker
    const infraPatterns = /^(gcloud |terraform |kubectl |docker |printf |echo |set |apt-get |curl |npm |yarn |pip |export |chmod |mkdir |sudo |bash |sh |- name:|- run:|apiVersion:|services:|volumes:|resources:|variable\s+"|resource\s+"|output\s+"|provider\s+"|data\s+"|--[a-z])/m;
    if (infraPatterns.test(text)) return true;
    // Multi-line with line continuations (shell-style backslash)
    if (text.includes('\\\n')) return true;
    // Contains common code punctuation patterns
    if (/[{}\[\]();]/.test(text) && text.includes('\n')) return true;
    return false;
}

/**
 * Clean solution field by stripping leading/trailing explanation text,
 * keeping only the code portion.
 */
function cleanSolutionField(solution) {
    if (!solution) return solution;

    // Strip wrapping backticks Chairman sometimes adds (e.g. `const x = ...` 형태로 ...)
    let cleaned0 = solution;
    const backtickWrapped = cleaned0.match(/^`([^`]+)`\s*(.*)$/s);
    if (backtickWrapped) {
        const codeInside = backtickWrapped[1];
        const trailing = (backtickWrapped[2] || '').trim();
        // If the backtick-wrapped part looks like code, use it; discard trailing explanation
        if (looksLikeCode(codeInside) || /[{}\[\]();=]/.test(codeInside)) {
            cleaned0 = codeInside;
            if (!trailing) return cleaned0;
            // trailing is likely explanation text — drop it
            return cleaned0;
        }
    }

    const lines = cleaned0.split('\n');
    if (lines.length < 2) return cleaned0;

    // Strip leading explanation (text ending with colon + newline + code)
    const firstLine = lines[0].trim();
    const isLeadingExplanation = /[:：。.]\s*$/.test(firstLine) && !looksLikeCode(firstLine);
    const rest = lines.slice(1).join('\n');

    let cleaned = cleaned0;
    if (isLeadingExplanation && looksLikeCode(rest)) {
        cleaned = rest.trim();
    }

    // Strip trailing explanation (code lines followed by non-code text)
    const cleanedLines = cleaned.split('\n');
    if (cleanedLines.length >= 2) {
        let lastCodeIdx = -1;
        for (let i = cleanedLines.length - 1; i >= 0; i--) {
            const line = cleanedLines[i].trim();
            if (!line) continue;
            if (looksLikeCode(line) || /^[}\]);]/.test(line) || /[;,{}\[\]()=>]$/.test(line)) {
                lastCodeIdx = i;
                break;
            }
        }
        if (lastCodeIdx >= 0 && lastCodeIdx < cleanedLines.length - 1) {
            const trailing = cleanedLines.slice(lastCodeIdx + 1).join('\n').trim();
            if (trailing && !looksLikeCode(trailing)) {
                cleaned = cleanedLines.slice(0, lastCodeIdx + 1).join('\n').trim();
            }
        }
    }
    return cleaned || cleaned0;
}

function formatDetailedComment(comment) {
    const lines = [];
    const lang = detectLanguage(comment.file);
    const shortPath = shortenFilePath(comment.file);

    // Extract reasoning (new format) or fall back to legacy fields
    const reasoning = comment.reasoning || {};
    const currentCode = reasoning.currentCode || comment.currentCode;
    const rootCause = reasoning.rootCause || comment.concern;
    const impact = reasoning.impact;
    const rawSolution = reasoning.solution || comment.solution;
    const solution = cleanSolutionField(rawSolution);
    const benefit = reasoning.benefit || comment.benefit;

    // Header with emoji based on priority
    const priorityEmoji = {
        P1: '🚨',
        P2: '⚠️',
        P3: '💡',
        P4: '📌',
        P5: '📝'
    };
    const emoji = priorityEmoji[comment.priority] || '';

    // Badge removed from header — cross-review section already shows confidence
    const consensusBadge = '';

    // Outcome label for priority adjustments
    let outcomeLabel = '';
    if (comment.debateOutcome === 'disputed' && comment.resolution?.finalPriority) {
        outcomeLabel = ` → ${comment.resolution.finalPriority}`;
    }

    const headerMsg = (comment.message || '').replace(/\n/g, ' ');
    lines.push(`### ${emoji} ${comment.priority} - ${headerMsg}${consensusBadge}${outcomeLabel}\n`);
    lines.push(`**파일**: \`${shortPath}:${comment.line}\`\n`);

    // Check if this is a P1-P3 issue with detailed fields
    const hasDetailedFields = ['P1', 'P2', 'P3', 'P4'].includes(comment.priority) &&
                              (currentCode || rootCause || solution);

    if (hasDetailedFields) {
        // Narrative format for P1-P3 with logical flow connectors

        // 1. Problem Code
        if (currentCode) {
            lines.push('**문제 코드:**');
            lines.push('```' + lang);
            lines.push(currentCode);
            lines.push('```\n');
        }

        // 2. Root Cause (narrative connector)
        if (rootCause) {
            lines.push(`**이 코드가 문제인 이유** -- ${rootCause}\n`);
        }

        // 3. Impact (consequence connector)
        if (impact) {
            lines.push('**이 상태로 배포되면:**');
            if (impact.includes('\n')) {
                const impactLines = impact.split('\n').map(s => s.trim()).filter(Boolean);
                for (const impactItem of impactLines) {
                    const normalized = impactItem.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
                    lines.push(`- ${normalized}`);
                }
            } else {
                lines.push(`- ${impact}`);
            }
            lines.push('');
        }

        // 4. Solution (action connector)
        if (solution) {
            lines.push('**따라서 다음과 같이 수정합니다:**');
            if (looksLikeCode(solution) || solution.includes('\n')) {
                // Multi-line or code-like: always wrap in code fences
                lines.push('```' + lang);
                lines.push(solution);
                lines.push('```\n');
            } else {
                // Single-line explanation text — render as inline code
                lines.push('`' + solution + '`\n');
            }
        } else if (comment.suggestion) {
            lines.push('**따라서 다음과 같이 수정합니다:**');
            const isCode = comment.suggestion.includes('\n') ||
                           comment.suggestion.includes('import ') ||
                           comment.suggestion.includes('function ') ||
                           comment.suggestion.includes('const ') ||
                           comment.suggestion.includes('class ') ||
                           comment.suggestion.includes('def ') ||
                           comment.suggestion.includes('return ');
            if (isCode) {
                lines.push('```' + lang);
                lines.push(comment.suggestion);
                lines.push('```\n');
            } else {
                lines.push(comment.suggestion + '\n');
            }
        }

        // 5. Benefit (validation connector)
        if (benefit) {
            lines.push(`**이 수정이 문제를 해결하는 이유:** ${benefit}\n`);
        }

    } else {
        // Compact format for P4-P5 or comments without detailed fields

        // Category and source info
        const sources = comment.sources || [comment.source || 'unknown'];
        const outcomeLabel = getOutcomeLabel(comment);
        lines.push(`**카테고리:** ${comment.category || 'general'} | **발견:** ${sources.join(', ')} | **결과:** ${outcomeLabel}\n`);

        // Main message (if not already in header)
        if (comment.message) {
            lines.push(comment.message);
        }

        // Suggestion if present
        if (comment.suggestion) {
            lines.push('**제안:**');
            const isCode = comment.suggestion.includes('\n') ||
                           comment.suggestion.includes('import ') ||
                           comment.suggestion.includes('function ') ||
                           comment.suggestion.includes('const ') ||
                           comment.suggestion.includes('class ');
            if (isCode) {
                lines.push('```' + lang);
                lines.push(comment.suggestion);
                lines.push('```');
            } else {
                lines.push(comment.suggestion);
            }
            lines.push('');
        }
    }

    // Inline dialogue - skip for P4-P5 (noise reduction), show for P1-P3
    const showDialogue = ['P1', 'P2', 'P3'].includes(comment.priority);
    if (showDialogue && comment.validation) {
        lines.push(...formatCrossReviewDialogue(comment));
    }

    lines.push('\n---\n');

    return lines;
}

/**
 * Cancel command
 */
async function cmdCancel(options) {
    const jobDir = options['job-dir'];

    const jobJsonPath = path.join(jobDir, 'job.json');
    if (!fs.existsSync(jobJsonPath)) {
        throw new Error(`Job not found: ${jobDir}`);
    }

    const job = JSON.parse(fs.readFileSync(jobJsonPath, 'utf8'));

    // Kill all member processes
    for (const [memberName, pid] of Object.entries(job.memberPids || {})) {
        try {
            process.kill(pid, 'SIGTERM');
            console.error(`Killed ${memberName} (PID: ${pid})`);
        } catch (e) {
            // Process may have already exited
        }

        // Update status
        const statusPath = path.join(jobDir, 'members', memberName, 'status.json');
        if (fs.existsSync(statusPath)) {
            const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            if (status.state === 'running' || status.state === 'queued') {
                status.state = 'canceled';
                status.endTime = new Date().toISOString();
                writeJsonAtomic(statusPath, status);
            }
        }
    }

    job.state = 'canceled';
    writeJsonAtomic(jobJsonPath, job);

    console.log(JSON.stringify({ status: 'canceled', jobId: job.id }));
}

/**
 * Cross-review command - re-run Pass 2 on existing Pass 1 results
 */
async function cmdCrossReview(options) {
    const jobDir = options['job-dir'];
    if (!jobDir || !fs.existsSync(jobDir)) {
        throw new Error('Usage: review-job.js cross-review --job-dir <JOB_DIR>');
    }

    const configPath = options.config || path.join(__dirname, '..', 'review.config.yaml');
    const config = loadConfig(configPath);

    // Build status from existing member directories
    const membersDir = path.join(jobDir, 'members');
    if (!fs.existsSync(membersDir)) {
        throw new Error(`Members directory not found: ${membersDir}`);
    }

    const memberDirs = fs.readdirSync(membersDir).filter(f =>
        fs.existsSync(path.join(membersDir, f, 'status.json'))
    );

    const status = { members: {} };
    for (const m of memberDirs) {
        status.members[m] = JSON.parse(
            fs.readFileSync(path.join(membersDir, m, 'status.json'), 'utf8')
        );
    }

    // Collect pass1 results
    const pass1Results = await collectPass1Results(jobDir, status);

    // Clear existing cross-review dir
    const crossReviewDir = path.join(jobDir, 'cross-review');
    if (fs.existsSync(crossReviewDir)) {
        fs.rmSync(crossReviewDir, { recursive: true });
    }

    // Ensure job.json exists
    const jobJsonPath = path.join(jobDir, 'job.json');
    if (!fs.existsSync(jobJsonPath)) {
        writeJsonAtomic(jobJsonPath, {
            id: path.basename(jobDir),
            state: 'running',
            target: 'cross-review-test',
            targetType: 'test',
            config: { members: memberDirs },
            memberPids: {}
        });
    }

    // Run cross-review
    const result = await startCrossReviewPass(jobDir, pass1Results, config);
    console.log(JSON.stringify(result, null, 2));
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
    const { command, options } = parseArgs(process.argv.slice(2));

    try {
        switch (command) {
            case 'start':
                await cmdStart(options);
                break;
            case 'wait':
                await cmdWait(options);
                break;
            case 'status':
                await cmdStatus(options);
                break;
            case 'results':
                await cmdResults(options);
                break;
            case 'cancel':
                await cmdCancel(options);
                break;
            case 'cross-review':
                await cmdCrossReview(options);
                break;
            case 'help':
            default:
                console.log('Usage: review-job.js <command> [options]');
                console.log('Commands: start, wait, status, results, cancel, cross-review');
                break;
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
