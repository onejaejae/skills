/**
 * Multi-Model Code Review - Chairman Module
 *
 * Handles Chairman AI synthesis: prompt building, execution, response parsing,
 * and result integration.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeJsonAtomic, normalizePath } = require('./fs-utils');
const { parseJsonFromOutput } = require('./json-parser');
const { comparePriority } = require('./priority-sorter');

/**
 * Parse a command string into program and args, respecting quoted arguments.
 */
function parseCommand(commandStr) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < commandStr.length; i++) {
        const char = commandStr[i];
        if (!inQuotes && (char === '"' || char === "'")) {
            inQuotes = true;
            quoteChar = char;
        } else if (inQuotes && char === quoteChar) {
            inQuotes = false;
            quoteChar = '';
        } else if (!inQuotes && char === ' ') {
            if (current) { parts.push(current); current = ''; }
        } else {
            current += char;
        }
    }
    if (current) parts.push(current);
    return { program: parts[0], args: parts.slice(1) };
}

// Prompts directory is always at a fixed location relative to this module
const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

/**
 * Summarize a single review result for Chairman input compression
 *
 * Reduces token usage by ~89% by converting full JSON to structured summary.
 *
 * @param {Object} result - Individual review result with parsed data
 * @returns {string} Compressed summary for Chairman
 */
function summarizeReviewForChairman(result) {
    const parsed = result.parsed;
    const comments = parsed.comments || [];

    const byPriority = {
        P1: comments.filter(c => c.priority === 'P1'),
        P2: comments.filter(c => c.priority === 'P2'),
        P3: comments.filter(c => c.priority === 'P3'),
        P4: comments.filter(c => c.priority === 'P4'),
        P5: comments.filter(c => c.priority === 'P5')
    };

    const formatCriticalIssues = (issues) => {
        if (issues.length === 0) return 'None';
        return issues.map(c => {
            const msg = c.message.length > 150 ? c.message.slice(0, 150) + '...' : c.message;
            return `- ${c.file}:${c.line} [${c.category || 'general'}] ${msg}`;
        }).join('\n');
    };

    const formatMinorIssues = (issues) => {
        if (issues.length === 0) return 'None';
        return issues.map(c => {
            const msg = c.message?.length > 80 ? c.message.slice(0, 77) + '...' : (c.message || '');
            return `- ${c.file}:${c.line} [${c.category || 'general'}] ${msg}`;
        }).join('\n');
    };

    return `## ${result.member}
**Summary:** ${parsed.summary || 'No major issues found'}
**Recommendation:** ${parsed.recommendation || 'COMMENT'}

### P1 Critical (${byPriority.P1.length}):
${formatCriticalIssues(byPriority.P1)}

### P2 Important (${byPriority.P2.length}):
${formatCriticalIssues(byPriority.P2)}

### P3 Suggestions (${byPriority.P3.length}):
${formatMinorIssues(byPriority.P3)}

### P4-P5 Minor (${byPriority.P4.length + byPriority.P5.length}):
${byPriority.P4.length + byPriority.P5.length} items (details available in full review)`;
}

/**
 * Detect possible duplicate findings across models on adjacent lines
 *
 * @param {Array} results - Individual review results
 * @returns {string} Hint section for Chairman (empty if no duplicates)
 */
function detectPossibleDuplicates(results) {
    const findings = [];
    for (const result of results) {
        if (!result.parsed?.comments) continue;
        for (const c of result.parsed.comments) {
            if (['P1', 'P2', 'P3'].includes(c.priority)) {
                findings.push({ member: result.member, ...c });
            }
        }
    }

    const duplicates = [];
    for (let i = 0; i < findings.length; i++) {
        for (let j = i + 1; j < findings.length; j++) {
            const a = findings[i], b = findings[j];
            if (a.member !== b.member
                && normalizePath(a.file) === normalizePath(b.file)
                && (a.category || 'general') === (b.category || 'general')
                && Math.abs((a.line || 0) - (b.line || 0)) <= 5) {
                duplicates.push({ a, b });
            }
        }
    }

    if (duplicates.length === 0) return '';

    let hint = '\n\n## \u26a0\ufe0f \uc911\ubcf5 \ud6c4\ubcf4 (\uc778\uc811 \ub77c\uc778 \ub3d9\uc77c \uce74\ud14c\uace0\ub9ac)\n\n';
    hint += '\uc544\ub798 \ubc1c\uacac\ub4e4\uc740 \uac19\uc740 \ud30c\uc77c, \uac19\uc740 \uce74\ud14c\uace0\ub9ac, \u00b15\uc904 \uc774\ub0b4\uc785\ub2c8\ub2e4. \ub3d9\uc77c \uc774\uc288\uc778\uc9c0 \ud655\uc778\ud558\uace0 \uc911\ubcf5\uc774\uba74 \ubcd1\ud569\ud558\uc138\uc694:\n\n';
    for (const { a, b } of duplicates) {
        const msgA = a.message?.slice(0, 60) || '';
        const msgB = b.message?.slice(0, 60) || '';
        hint += `- **${a.member}** ${a.file}:${a.line} "${msgA}"\n`;
        hint += `  **${b.member}** ${b.file}:${b.line} "${msgB}"\n\n`;
    }
    return hint;
}

/**
 * Parse unified diff into per-file blocks with hunk metadata.
 *
 * @param {string} diff - Full unified diff text
 * @returns {Array<{filename: string, header: string, hunks: Array}>}
 */
function parseDiffIntoFileBlocks(diff) {
    const blocks = [];
    const fileRegex = /^diff --git/gm;
    const boundaries = [];
    let match;
    while ((match = fileRegex.exec(diff)) !== null) {
        boundaries.push(match.index);
    }

    for (let i = 0; i < boundaries.length; i++) {
        const start = boundaries[i];
        const end = i + 1 < boundaries.length ? boundaries[i + 1] : diff.length;
        const blockText = diff.slice(start, end);

        const filenameMatch = blockText.match(/^diff --git a\/(.+?) b\/(.+)/m);
        if (!filenameMatch) continue;
        const filename = filenameMatch[2];

        const firstHunkIdx = blockText.indexOf('\n@@');
        const header = firstHunkIdx >= 0 ? blockText.slice(0, firstHunkIdx) : blockText;

        const hunks = [];
        const hunkRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@.*$/gm;
        let hunkMatch;
        const hunkPositions = [];
        while ((hunkMatch = hunkRegex.exec(blockText)) !== null) {
            hunkPositions.push({
                index: hunkMatch.index,
                newStart: parseInt(hunkMatch[3]),
                newCount: parseInt(hunkMatch[4] || '1')
            });
        }

        for (let j = 0; j < hunkPositions.length; j++) {
            const hStart = hunkPositions[j].index;
            const hEnd = j + 1 < hunkPositions.length ? hunkPositions[j + 1].index : blockText.length;
            hunks.push({
                newStart: hunkPositions[j].newStart,
                newCount: hunkPositions[j].newCount,
                raw: blockText.slice(hStart, hEnd).trimEnd()
            });
        }

        blocks.push({ filename, header: header.trimEnd(), hunks });
    }

    return blocks;
}

/**
 * Extract only the diff hunks relevant to P1-P3 findings.
 *
 * Instead of sending the full diff (potentially thousands of lines),
 * this selects only the hunks that overlap with finding locations.
 *
 * @param {string} fullDiff - Complete unified diff
 * @param {Array} results - Individual review results containing findings
 * @param {number} [contextLines=20] - Extra line margin around each finding
 * @param {number} [maxChars=15000] - Hard cap on windowed diff size
 * @returns {string} Windowed diff with only relevant hunks
 */
function extractRelevantDiffHunks(fullDiff, results, contextLines = 20, maxChars = 15000) {
    if (!fullDiff || !results || results.length === 0) return fullDiff || '';

    // Collect P1-P3 finding locations
    const targets = [];
    for (const result of results) {
        for (const c of (result.parsed?.comments || [])) {
            if (['P1', 'P2', 'P3'].includes(c.priority)) {
                targets.push({ file: normalizePath(c.file), line: c.line || 0 });
            }
        }
    }

    if (targets.length === 0) return '';

    const fileBlocks = parseDiffIntoFileBlocks(fullDiff);

    // Match each target to its file block and collect relevant hunk indices
    const relevantBlocks = new Map();

    for (const target of targets) {
        const block = fileBlocks.find(b => {
            const norm = normalizePath(b.filename);
            return norm === target.file
                || target.file.endsWith(b.filename)
                || b.filename.endsWith(target.file);
        });
        if (!block) continue;

        const rangeStart = Math.max(1, target.line - contextLines);
        const rangeEnd = target.line + contextLines;

        for (let i = 0; i < block.hunks.length; i++) {
            const hunk = block.hunks[i];
            const hunkEnd = hunk.newStart + hunk.newCount;
            if (hunk.newStart <= rangeEnd && hunkEnd >= rangeStart) {
                if (!relevantBlocks.has(block.filename)) {
                    relevantBlocks.set(block.filename, { block, hunkIndices: new Set() });
                }
                relevantBlocks.get(block.filename).hunkIndices.add(i);
            }
        }
    }

    // Reassemble windowed diff
    const parts = [];
    for (const [, { block, hunkIndices }] of relevantBlocks) {
        parts.push(block.header);
        for (const idx of [...hunkIndices].sort((a, b) => a - b)) {
            parts.push(block.hunks[idx].raw);
        }
    }

    let windowed = parts.join('\n');

    if (windowed.length > maxChars) {
        windowed = windowed.slice(0, maxChars) + '\n... (diff truncated for Chairman)';
    }

    const totalFiles = fileBlocks.length;
    const includedFiles = relevantBlocks.size;
    const totalHunks = fileBlocks.reduce((sum, b) => sum + b.hunks.length, 0);
    const includedHunks = [...relevantBlocks.values()].reduce((sum, v) => sum + v.hunkIndices.size, 0);
    const reduction = fullDiff.length > 0
        ? Math.round((1 - windowed.length / fullDiff.length) * 100)
        : 0;

    console.error(`Diff windowing: ${includedFiles}/${totalFiles} files, ${includedHunks}/${totalHunks} hunks, ${reduction}% reduction (${fullDiff.length} → ${windowed.length} chars)`);

    return windowed;
}

/**
 * Build Chairman prompt with windowed diff and compressed individual reviews
 *
 * @param {string} jobDir - Job directory path
 * @param {Object} mergedResults - Merged results with individualResults
 * @returns {string} Full prompt for Chairman
 */
function buildChairmanPrompt(jobDir, mergedResults) {
    const promptPath = path.join(PROMPTS_DIR, 'chairman-synthesis.md');

    if (!fs.existsSync(promptPath)) {
        throw new Error('Chairman synthesis prompt not found: ' + promptPath);
    }

    const promptTemplate = fs.readFileSync(promptPath, 'utf8');

    const diffPath = path.join(jobDir, 'diff.patch');
    const fullDiff = fs.existsSync(diffPath)
        ? fs.readFileSync(diffPath, 'utf8')
        : '';

    // Window diff to only include hunks around P1-P3 findings
    const diff = extractRelevantDiffHunks(
        fullDiff,
        mergedResults.individualResults || [],
        20,    // ±20 lines context around each finding
        15000  // max 15K chars safety budget
    );

    const individualReviews = mergedResults.individualResults
        .filter(r => r.parsed)
        .map(summarizeReviewForChairman)
        .join('\n\n---\n\n');

    const duplicateHints = detectPossibleDuplicates(mergedResults.individualResults);
    const reviewSection = individualReviews + duplicateHints;

    let crossReviewContext = '';
    if (mergedResults.crossReviewStats) {
        crossReviewContext = formatCrossReviewContextForChairman(mergedResults);
    }

    return promptTemplate
        .replace('{{DIFF_CONTENT}}', diff)
        .replace('{{DIFF}}', diff)
        .replace('{{INDIVIDUAL_REVIEWS}}', reviewSection)
        .replace('{{REVIEW_RESULTS}}', reviewSection)
        .replace('{{CROSS_REVIEW_CONTEXT}}', crossReviewContext);
}

/**
 * Format cross-review context for Chairman prompt
 */
function formatCrossReviewContextForChairman(mergedResults) {
    const stats = mergedResults.crossReviewStats;
    const comments = mergedResults.comments || [];

    const lines = [];
    lines.push('\n## \uad50\ucc28 \uac80\ud1a0 \uacb0\uacfc (Pass 2-3)\n');
    lines.push(`- \ucd1d \uac80\uc99d \ub300\uc0c1: ${stats.totalFindings}\uac74`);
    lines.push(`- \ub3d9\ub8cc \uac80\uc99d \ud1b5\uacfc: ${stats.validated}\uac74`);
    lines.push(`- \ub3d9\ub8cc \uae30\uac01: ${stats.ignored}\uac74`);
    lines.push(`- \ud3c9\uade0 \uc2e0\ub8b0\ub3c4: ${stats.averageValidationScore}%\n`);

    const validated = comments.filter(c => c.crossReviewValidated);
    if (validated.length > 0) {
        lines.push('### \uac80\uc99d\ub41c \ubc1c\uacac (\ub3d9\ub8cc 67%+ \ub3d9\uc758)');
        for (const c of validated) {
            lines.push(`- ${c.file}:${c.line} [${c.priority}] ${(c.message || '').slice(0, 80)}`);
        }
        lines.push('');
    }

    const unvalidated = comments.filter(c =>
        ['P1', 'P2', 'P3'].includes(c.priority) && !c.crossReviewValidated
    );
    if (unvalidated.length > 0) {
        lines.push('### \ubbf8\uac80\uc99d \ubc1c\uacac (\ub3d9\ub8cc \uac80\uc99d \ubbf8\ud1b5\uacfc)');
        for (const c of unvalidated) {
            const ignoreNote = c.validation?.ignoreCount > 0
                ? ` (${c.validation.ignoreCount}\uba85 \uae30\uac01)` : '';
            lines.push(`- ${c.file}:${c.line} [${c.priority}] ${(c.message || '').slice(0, 80)}${ignoreNote}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Execute Chairman CLI command
 *
 * @param {string} prompt - Full prompt for Chairman
 * @param {Object} config - Configuration object
 * @returns {string} Chairman output
 */
function executeChairman(prompt, config) {
    const chairman = config.review?.synthesis?.chairman || 'claude';
    const chairmanMember = config.review?.members?.find(
        m => m.name.toLowerCase() === chairman.toLowerCase()
    );
    const command = chairmanMember?.command || 'claude -p';
    const timeout = (config.review?.synthesis?.chairman_timeout ||
                     config.review?.synthesis?.timeout || 120) * 1000;

    // Parse command into program and args (quote-aware, avoids shell injection)
    const { program, args } = parseCommand(command);

    // Deliver prompt via stdin to avoid ARG_MAX limits
    // Remove CLAUDECODE env var to allow Claude CLI in nested context
    const { CLAUDECODE: _cc, ...chairmanEnv } = process.env;
    const result = spawnSync(program, args, {
        input: prompt,
        encoding: 'utf8',
        timeout: timeout,
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: chairmanEnv
    });

    if (result.error) {
        throw new Error(`Chairman execution failed: ${result.error.message}`);
    }

    if (result.status !== 0) {
        const stderr = result.stderr?.slice(0, 500) || '';
        throw new Error(`Chairman exited with code ${result.status}: ${stderr}`);
    }

    return result.stdout;
}

/**
 * Parse Chairman response and validate structure
 *
 * @param {string} output - Raw Chairman output
 * @returns {Object} Parsed and validated JSON
 */
function parseChairmanResponse(output) {
    const parsed = parseJsonFromOutput(output);

    if (!parsed.comments) {
        parsed.comments = [];
    }

    for (const comment of parsed.comments) {
        if (!comment.sources) {
            comment.sources = [comment.source || 'unknown'];
        }
        if (typeof comment.consensus !== 'number') {
            comment.consensus = comment.sources.length;
        }
    }

    if (!parsed.disputed) {
        parsed.disputed = [];
    }

    if (!parsed.synthesisStats && !parsed.synthesis_notes) {
        parsed.synthesisStats = {
            duplicatesMerged: 0,
            conflictsResolved: parsed.disputed.length,
            prioritiesAdjusted: 0
        };
    }

    if (parsed.synthesis_notes && !parsed.synthesisStats) {
        parsed.synthesisStats = {
            duplicatesMerged: parsed.synthesis_notes.duplicates_merged || 0,
            conflictsResolved: parsed.synthesis_notes.conflicts_resolved || 0,
            prioritiesAdjusted: parsed.synthesis_notes.priorities_adjusted || 0
        };
    }

    return parsed;
}

/**
 * Invoke Chairman for final synthesis
 *
 * @param {string} jobDir - Job directory path
 * @param {Object} mergedResults - Merged results with individualResults
 * @param {Object} config - Configuration object
 * @returns {Object} Chairman synthesis results
 */
async function invokeChairman(jobDir, mergedResults, config) {
    const chairman = config.review?.synthesis?.chairman || 'claude';
    console.error(`Invoking Chairman (${chairman}) for final synthesis...`);

    const prompt = buildChairmanPrompt(jobDir, mergedResults);

    // Save chairman prompt for debugging
    const chairmanPromptPath = path.join(jobDir, 'prompts', 'chairman.txt');
    fs.mkdirSync(path.dirname(chairmanPromptPath), { recursive: true });
    fs.writeFileSync(chairmanPromptPath, prompt);

    const output = executeChairman(prompt, config);

    // Save chairman output
    const chairmanDir = path.join(jobDir, 'members', 'chairman');
    fs.mkdirSync(chairmanDir, { recursive: true });
    fs.writeFileSync(path.join(chairmanDir, 'output.txt'), output);

    const chairmanResults = parseChairmanResponse(output);

    writeJsonAtomic(path.join(chairmanDir, 'results.json'), chairmanResults);

    console.error('Chairman synthesis completed successfully');
    return chairmanResults;
}

/**
 * Check if a CLI command is available
 */
function isCommandAvailable(command) {
    if (typeof command !== 'string' || !command.trim()) return false;
    const program = command.trim().split(/\s+/)[0];
    try {
        const result = spawnSync('which', [program], { stdio: 'pipe' });
        return result.status === 0;
    } catch {
        return false;
    }
}

/**
 * Invoke Chairman with fallback handling
 *
 * @param {string} jobDir - Job directory path
 * @param {Object} merged - Merged results
 * @param {Object} config - Configuration object
 * @param {Object} timingInfo - Timing information per model
 * @returns {Object} Result with fallback indicator
 */
async function invokeChairmanWithFallback(jobDir, merged, config, timingInfo) {
    const chairman = config.review?.synthesis?.chairman || 'claude';
    const chairmanMember = config.review?.members?.find(
        m => m.name.toLowerCase() === chairman.toLowerCase()
    );

    const chairmanCommand = chairmanMember?.command || 'claude -p';
    if (!isCommandAvailable(chairmanCommand)) {
        console.error(`Chairman CLI (${chairman}) not available, using algorithmic merge`);
        return { fallback: true, results: merged, reason: 'cli_not_available' };
    }

    const MAX_CHAIRMAN_ATTEMPTS = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_CHAIRMAN_ATTEMPTS; attempt++) {
        try {
            const chairmanStartTime = Date.now();
            const chairmanResults = await invokeChairman(jobDir, merged, config);
            const chairmanDuration = (Date.now() - chairmanStartTime) / 1000;

            const workerTimes = Object.values(timingInfo);
            const maxWorkerTime = workerTimes.length > 0 ? Math.max(...workerTimes) : 0;
            const fullTimingInfo = {
                ...timingInfo,
                chairman: chairmanDuration,
                parallelTime: maxWorkerTime + chairmanDuration,
                totalCombined: workerTimes.reduce((a, b) => a + b, 0) + chairmanDuration
            };

            return {
                fallback: false,
                results: integrateChairmanResults(merged, chairmanResults, fullTimingInfo, config)
            };
        } catch (error) {
            lastError = error;

            // Only retry on parse-related errors (not CLI execution or timeout failures)
            const isParseError = error.message.includes('No valid JSON found')
                || error.message.includes('Unexpected token')
                || error.message.includes('Unterminated string');

            if (isParseError && attempt < MAX_CHAIRMAN_ATTEMPTS) {
                console.error(`Chairman attempt ${attempt} failed (parse error): ${error.message}`);
                console.error('Retrying Chairman synthesis...');
                continue;
            }
            break;
        }
    }

    console.error(`Chairman error: ${lastError.message}`);
    console.error('Falling back to algorithmic merge...');

    merged.stats = merged.stats || {};
    merged.stats.synthesisError = lastError.message;
    merged.stats.strategy = 'merge_fallback';

    return {
        fallback: true,
        results: merged,
        error: lastError.message,
        reason: 'execution_error'
    };
}

/**
 * Integrate Chairman results with merged results
 */
function integrateChairmanResults(mergedResults, chairmanResults, timingInfo, config) {
    const modelsUsed = mergedResults.stats?.modelsUsed ||
                       mergedResults.individualResults?.map(r => r.member) || [];

    const efficiency = calculateEfficiencyMetrics(
        mergedResults.individualResults || [],
        chairmanResults.comments || [],
        timingInfo,
        config
    );

    const votingComments = mergedResults.comments || [];

    const enrichedComments = enrichCommentsWithDetailedFields(
        chairmanResults.comments || [],
        mergedResults.individualResults || [],
        votingComments
    );

    // Preserve P4/P5 from algorithmic merge when Chairman omits them
    const chairmanHasP4P5 = enrichedComments.some(c =>
        c.priority === 'P4' || c.priority === 'P5'
    );
    if (!chairmanHasP4P5 && votingComments.length > 0) {
        const p4p5 = votingComments.filter(c =>
            c.priority === 'P4' || c.priority === 'P5'
        );
        if (p4p5.length > 0) {
            enrichedComments.push(...p4p5);
            console.error(`Preserved ${p4p5.length} P4/P5 finding(s) from algorithmic merge`);
        }
    }

    // Remove P4 findings that duplicate a Chairman P1-P3 finding
    // Strategy 1: same file, same category, within ±10 lines
    // Strategy 2: same pattern across different files (message keyword similarity)
    const LINE_PROXIMITY = 10;
    const chairmanFindings = enrichedComments.filter(c =>
        ['P1', 'P2', 'P3'].includes(c.priority)
    );

    // Build keyword set from P1-P3 messages for cross-file dedup
    // Strip backticks and Korean particles before extraction
    const stripMarkdownAndParticles = (text) => {
        return text.replace(/`/g, '')  // remove backticks
                   .replace(/[은는이가을를에의로도만과와](?=\s|$|[,.])/g, '') // remove Korean particles at word boundaries
                   .toLowerCase();
    };
    const p1p3Keywords = chairmanFindings.map(cf => {
        const msg = stripMarkdownAndParticles(cf.message || '');
        // Extract key phrases: split on common delimiters and take words >1 char
        return msg.split(/[\s,.\-—:;()"']+/).filter(w => w.length > 1);
    });

    const beforeDedup = enrichedComments.length;
    const finalComments = enrichedComments.filter(c => {
        if (c.priority !== 'P4') return true;
        const cFile = normalizePath(c.file);
        const cCat = c.category || 'general';

        // Strategy 1: same file proximity
        const sameFileMatch = chairmanFindings.some(cf =>
            normalizePath(cf.file) === cFile
            && (cf.category || 'general') === cCat
            && Math.abs((cf.line || 0) - (c.line || 0)) <= LINE_PROXIMITY
        );
        if (sameFileMatch) return false;

        // Strategy 2: cross-file pattern match (≥3 shared keywords)
        const p4Words = stripMarkdownAndParticles(c.message || '')
            .split(/[\s,.\-—:;()"']+/).filter(w => w.length > 1);
        const crossFileMatch = p1p3Keywords.some(cfWords => {
            const shared = p4Words.filter(w => cfWords.includes(w));
            return shared.length >= 3;
        });
        return !crossFileMatch;
    });
    if (finalComments.length < beforeDedup) {
        console.error(`Cross-priority dedup: ${beforeDedup} → ${finalComments.length}`);
    }

    // Reclassify praise P4 items to P5
    // Strategy 1: explicit praise words
    const praisePatterns = /좋습니다|잘\s*(되어|작성|구현|설계|확보)|충실합니다|올바르게|적절합니다|훌륭|우수|깔끔|good\s+pattern|well\s+(done|implemented|structured|designed)|excellent|great/i;
    // Strategy 2: P4 without any code change suggestion (no reasoning.solution and no suggestion)
    let praiseReclassified = 0;
    for (const c of finalComments) {
        if (c.priority !== 'P4') continue;
        const hasExplicitPraise = praisePatterns.test(c.message || '');
        const hasNoCodeChange = !c.reasoning?.solution && !c.suggestion;
        if (hasExplicitPraise || hasNoCodeChange) {
            c.priority = 'P5';
            praiseReclassified++;
        }
    }
    if (praiseReclassified > 0) {
        console.error(`Praise reclassified: ${praiseReclassified} P4 → P5`);
    }

    return {
        executiveSummary: chairmanResults.executiveSummary || chairmanResults.summary,
        chairmanVerdict: chairmanResults.chairmanVerdict || chairmanResults.recommendation,
        verdictRationale: chairmanResults.verdictRationale,
        modelSummaries: chairmanResults.modelSummaries ||
                        mergedResults.summaries ||
                        mergedResults.individualResults
                            ?.filter(r => r.parsed?.summary)
                            .map(r => ({ member: r.member, summary: r.parsed.summary })) ||
                        [],
        comments: finalComments,
        disputed: chairmanResults.disputed || [],
        crossReviewStats: mergedResults.crossReviewStats || null,
        debateStats: mergedResults.debateStats || null,
        debateHighlights: mergedResults.debateHighlights || null,
        stats: {
            totalComments: enrichedComments.length,
            byPriority: calculatePriorityCounts(enrichedComments),
            byCategory: calculateCategoryCounts(enrichedComments),
            modelsUsed: modelsUsed,
            synthesizedBy: mergedResults.crossReviewStats ? 'chairman_cross_review' : 'chairman',
            synthesis: chairmanResults.synthesisStats || chairmanResults.synthesis_notes || {
                duplicatesMerged: 0,
                conflictsResolved: 0,
                prioritiesAdjusted: 0
            },
            strategy: 'ai_merge',
            efficiency
        },
        recommendation: chairmanResults.chairmanVerdict || chairmanResults.recommendation
    };
}

/**
 * Enrich Chairman comments with detailed fields from original model outputs
 */
function enrichCommentsWithDetailedFields(chairmanComments, individualResults, votingComments) {
    const detailedFieldsMap = new Map();

    for (const result of individualResults) {
        if (!result.parsed?.comments) continue;

        for (const comment of result.parsed.comments) {
            const key = `${normalizePath(comment.file)}:${comment.line}`;

            const reasoning = comment.reasoning || {};
            const hasDetailed = comment.currentCode || comment.concern || comment.solution || comment.benefit ||
                                reasoning.currentCode || reasoning.rootCause || reasoning.solution || reasoning.benefit;
            if (hasDetailed) {
                if (!detailedFieldsMap.has(key)) {
                    detailedFieldsMap.set(key, {
                        currentCode: comment.currentCode || reasoning.currentCode,
                        concern: comment.concern || reasoning.rootCause,
                        solution: comment.solution || reasoning.solution,
                        benefit: comment.benefit || reasoning.benefit,
                        impact: reasoning.impact,
                        reasoning: reasoning
                    });
                }
            }
        }
    }

    const perspectivesMap = new Map();
    const debateOutcomeMap = new Map();
    const resolutionMap = new Map();

    for (const comment of votingComments || []) {
        const key = `${normalizePath(comment.file)}:${comment.line}`;
        if (comment.modelPerspectives && comment.modelPerspectives.length > 0) {
            perspectivesMap.set(key, comment.modelPerspectives);
        }
        if (comment.debateOutcome) {
            debateOutcomeMap.set(key, comment.debateOutcome);
        }
        if (comment.resolution) {
            resolutionMap.set(key, comment.resolution);
        }
    }

    // Fuzzy lookup: exact match first, then ±5 lines
    const fuzzyLookup = (map, file, line) => {
        const normFile = normalizePath(file);
        const exactKey = `${normFile}:${line}`;
        if (map.has(exactKey)) return map.get(exactKey);
        for (let delta = 1; delta <= 5; delta++) {
            const keyUp = `${normFile}:${line - delta}`;
            const keyDown = `${normFile}:${line + delta}`;
            if (map.has(keyUp)) return map.get(keyUp);
            if (map.has(keyDown)) return map.get(keyDown);
        }
        return undefined;
    };

    return chairmanComments.map(comment => {
        const key = `${normalizePath(comment.file)}:${comment.line}`;
        const detailedFields = fuzzyLookup(detailedFieldsMap, comment.file, comment.line);
        const modelPerspectives = perspectivesMap.get(key);
        const debateOutcome = debateOutcomeMap.get(key);
        const resolution = resolutionMap.get(key);

        const preferLonger = (chairmanVal, originalVal) => {
            if (!originalVal) return chairmanVal;
            if (!chairmanVal) return originalVal;
            const hasNewlines = originalVal.includes('\n') && !chairmanVal.includes('\n');
            const isLonger = originalVal.length > chairmanVal.length * 1.5;
            return (hasNewlines || isLonger) ? originalVal : chairmanVal;
        };

        let enrichedReasoning;
        if (comment.reasoning) {
            enrichedReasoning = {
                ...comment.reasoning,
                currentCode: preferLonger(comment.reasoning.currentCode, detailedFields?.currentCode),
                rootCause: preferLonger(comment.reasoning.rootCause, detailedFields?.concern),
                solution: preferLonger(comment.reasoning.solution, detailedFields?.solution),
                benefit: preferLonger(comment.reasoning.benefit, detailedFields?.benefit),
                impact: preferLonger(comment.reasoning.impact, detailedFields?.impact)
            };
        } else if (detailedFields) {
            enrichedReasoning = {
                currentCode: detailedFields.currentCode,
                rootCause: detailedFields.concern,
                impact: detailedFields.impact,
                solution: detailedFields.solution,
                benefit: detailedFields.benefit
            };
        }

        return {
            ...comment,
            currentCode: preferLonger(comment.currentCode, detailedFields?.currentCode),
            concern: preferLonger(comment.concern, detailedFields?.concern),
            solution: preferLonger(comment.solution, detailedFields?.solution),
            benefit: preferLonger(comment.benefit, detailedFields?.benefit),
            reasoning: enrichedReasoning,
            modelPerspectives: comment.modelPerspectives || modelPerspectives || [],
            debateOutcome: comment.debateOutcome || debateOutcome,
            resolution: comment.resolution || resolution
        };
    });
}

/**
 * Calculate priority counts from comments
 */
function calculatePriorityCounts(comments) {
    const counts = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
    for (const comment of comments) {
        if (counts[comment.priority] !== undefined) {
            counts[comment.priority]++;
        }
    }
    return counts;
}

/**
 * Calculate category counts from comments
 */
function calculateCategoryCounts(comments) {
    const counts = { security: 0, performance: 0, quality: 0, testing: 0, docs: 0 };
    for (const comment of comments) {
        if (comment.category && counts[comment.category] !== undefined) {
            counts[comment.category]++;
        }
    }
    return counts;
}

/**
 * Calculate efficiency metrics for multi-model review
 */
function calculateEfficiencyMetrics(results, comments, timingInfo, config) {
    const uniqueByModel = {};
    for (const r of results) {
        if (r.parsed) {
            uniqueByModel[r.member] = 0;
        }
    }

    let sharedFindings = 0;

    for (const comment of comments) {
        const sources = comment.sources || [comment.source || 'unknown'];

        if (comment.consensus >= 2 || sources.length >= 2) {
            sharedFindings++;
        } else if (sources.length === 1) {
            const model = sources[0];
            if (uniqueByModel[model] !== undefined) {
                uniqueByModel[model]++;
            }
        }
    }

    const maxUniqueByOneModel = Math.max(...Object.values(uniqueByModel), 0);
    const bestSingleModelTotal = maxUniqueByOneModel + sharedFindings;
    const multiModelTotal = comments.length;

    const gain = bestSingleModelTotal > 0
        ? Math.round((multiModelTotal - bestSingleModelTotal) / bestSingleModelTotal * 100)
        : (multiModelTotal > 0 ? 100 : 0);

    const consensusRate = comments.length > 0
        ? `${Math.round(sharedFindings / comments.length * 100)}%`
        : '0%';

    const focusByModel = {};
    if (config?.review?.members) {
        for (const member of config.review.members) {
            if (member.focus?.length) {
                focusByModel[member.name] = member.focus;
            }
        }
    }

    return {
        uniqueByModel,
        sharedFindings,
        consensusRate,
        timing: timingInfo || {},
        coverageGain: `${gain > 0 ? '+' : ''}${gain}%`,
        focusByModel
    };
}

/**
 * Determine whether Chairman (Pass 4) can be skipped.
 *
 * Skip conditions (all must be true when smart_skip.enabled):
 *  1. Cross-review validation rate >= threshold (default 80%)
 *  2. No unresolved critical (P1/P2) disputes
 *  3. All models recommend APPROVE (if skip_chairman_on_approve)
 *
 * @param {Array} results - Pass 1 individual review results
 * @param {Object} config - review.config.yaml parsed object
 * @param {Object} [crossReviewData] - { crossReviewStats, comments }
 * @returns {{ skip: boolean, reason: string }}
 */
function shouldSkipChairman(results, config, crossReviewData) {
    const synthesis = config.review?.synthesis || {};
    const smartSkip = synthesis.smart_skip || {};

    // skip_chairman_on_approve: all models APPROVE → skip
    if (synthesis.skip_chairman_on_approve) {
        const allApprove = results.every(r =>
            (r.parsed?.recommendation || '').toUpperCase() === 'APPROVE'
        );
        if (allApprove) {
            return { skip: true, reason: '전원 APPROVE - Chairman 불필요' };
        }
    }

    // smart_skip disabled → always run Chairman
    if (!smartSkip.enabled) {
        return { skip: false, reason: 'smart_skip disabled' };
    }

    const threshold = smartSkip.validation_threshold || 80;
    const maxCritical = smartSkip.max_unresolved_critical ?? 0;

    // If cross-review data is provided (Pass 2-3 completed)
    if (crossReviewData) {
        const stats = crossReviewData.crossReviewStats || {};
        const validationRate = typeof stats.validationRate === 'number'
            ? stats.validationRate
            : (stats.totalFindings > 0
                ? Math.round((stats.validated / stats.totalFindings) * 100)
                : 0);
        const comments = crossReviewData.comments || [];

        // Count unresolved P1/P2 that are not cross-review validated
        const unresolvedCritical = comments.filter(c => {
            const p = c.priority;
            return (p === 'P1' || p === 'P2') && !c.crossReviewValidated;
        }).length;

        if (validationRate >= threshold && unresolvedCritical <= maxCritical) {
            return {
                skip: true,
                reason: `검증률 ${validationRate}% >= ${threshold}%, 미검증 P1/P2 ${unresolvedCritical}건 <= ${maxCritical}건`
            };
        }

        return {
            skip: false,
            reason: `검증률 ${validationRate}% 또는 미검증 P1/P2 ${unresolvedCritical}건이 기준 미달`
        };
    }

    // Fallback: no cross-review data (legacy path)
    return { skip: false, reason: 'cross-review 데이터 없음' };
}

module.exports = {
    summarizeReviewForChairman,
    detectPossibleDuplicates,
    parseDiffIntoFileBlocks,
    extractRelevantDiffHunks,
    buildChairmanPrompt,
    executeChairman,
    parseChairmanResponse,
    invokeChairman,
    invokeChairmanWithFallback,
    integrateChairmanResults,
    enrichCommentsWithDetailedFields,
    calculatePriorityCounts,
    calculateCategoryCounts,
    calculateEfficiencyMetrics,
    isCommandAvailable,
    shouldSkipChairman
};
