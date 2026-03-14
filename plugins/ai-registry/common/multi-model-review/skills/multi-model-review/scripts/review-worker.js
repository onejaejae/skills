#!/usr/bin/env node
/**
 * Multi-Model Code Review - Worker Process
 *
 * Executes a single AI model review in a detached process.
 * Reads prompt from job directory, invokes CLI, captures output.
 *
 * Supports:
 * - Standard review mode (Pass 1)
 * - Debate mode (Pass 2) - reads peer findings and generates debate response
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { writeJsonAtomic } = require('../lib/fs-utils');

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Update status file
 */
function updateStatus(statusPath, updates) {
    let status = {};
    if (fs.existsSync(statusPath)) {
        try {
            status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        } catch (e) {
            // Ignore parse errors
        }
    }
    Object.assign(status, updates);
    writeJsonAtomic(statusPath, status);
}

/**
 * Parse command string into program and args
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
            if (current) {
                parts.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current) {
        parts.push(current);
    }

    return {
        program: parts[0],
        args: parts.slice(1)
    };
}

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
    const result = {};
    let i = 0;

    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const value = args[i + 1];
            if (value && !value.startsWith('--')) {
                result[key] = value;
                i += 2;
            } else {
                result[key] = true;
                i++;
            }
        } else {
            i++;
        }
    }

    return result;
}

// ============================================================================
// Main Worker Logic
// ============================================================================

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const jobDir = args['job-dir'];
    const memberName = args['member'];
    const command = args['command'];
    const timeout = parseInt(args['timeout'] || '180', 10) * 1000; // convert to ms
    const debateMode = args['debate-mode'] === true || args['debate-mode'] === 'true';
    const crossReviewMode = args['cross-review-mode'] === true || args['cross-review-mode'] === 'true';

    if (!jobDir || !memberName || !command) {
        console.error('Missing required arguments: --job-dir, --member, --command');
        process.exit(1);
    }

    // Detect mode from flags or member name prefix
    const isDebate = debateMode || memberName.startsWith('debate_');
    const isCrossReview = crossReviewMode || memberName.startsWith('crossreview_');
    const actualMemberName = isDebate ? memberName.replace('debate_', '') :
                             isCrossReview ? memberName.replace('crossreview_', '') : memberName;

    // Determine working directory based on mode
    let memberDir;
    let promptPath;

    if (isCrossReview) {
        // Cross-Review mode: use cross-review directory
        memberDir = process.env.CROSS_REVIEW_DIR || path.join(jobDir, 'cross-review', actualMemberName);
        promptPath = path.join(memberDir, 'prompt.txt');
    } else if (isDebate) {
        // Debate mode: use debate directory
        memberDir = process.env.DEBATE_DIR || path.join(jobDir, 'debate', actualMemberName);
        promptPath = path.join(memberDir, 'prompt.txt');
    } else {
        // Standard mode: use members directory
        memberDir = path.join(jobDir, 'members', memberName);
        promptPath = path.join(jobDir, 'prompts', `${memberName}.txt`);
    }

    const statusPath = path.join(memberDir, 'status.json');
    const outputPath = path.join(memberDir, 'output.txt');
    const errorPath = path.join(memberDir, 'error.txt');

    // Ensure member directory exists
    fs.mkdirSync(memberDir, { recursive: true });

    // Update status to running
    updateStatus(statusPath, {
        state: 'running',
        startTime: new Date().toISOString(),
        pid: process.pid,
        mode: isCrossReview ? 'cross-review' : (isDebate ? 'debate' : 'review')
    });

    // Read prompt
    let prompt;
    try {
        if (fs.existsSync(promptPath)) {
            prompt = fs.readFileSync(promptPath, 'utf8');
        } else if (!isDebate && !isCrossReview) {
            // Fallback for standard mode only
            prompt = fs.readFileSync(path.join(jobDir, 'prompt.txt'), 'utf8');
        } else if (isCrossReview) {
            throw new Error(`Cross-review prompt not found: ${promptPath}`);
        } else {
            throw new Error(`Debate prompt not found: ${promptPath}`);
        }
    } catch (e) {
        updateStatus(statusPath, {
            state: 'error',
            endTime: new Date().toISOString(),
            error: `Failed to read prompt: ${e.message}`
        });
        process.exit(1);
    }

    // Log mode for debugging
    if (isCrossReview) {
        console.error(`[${actualMemberName}] Starting cross-review mode`);
    } else if (isDebate) {
        console.error(`[${actualMemberName}] Starting debate mode review`);
    }

    // Parse command
    const { program, args: cmdArgs } = parseCommand(command);

    // Build full command args (prompt delivered via stdin to avoid ARG_MAX limits)
    const fullArgs = [...cmdArgs];

    // Spawn the AI CLI with stdin pipe for prompt delivery
    let child;
    try {
        child = spawn(program, fullArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env
        });

        // Deliver prompt via stdin (avoids OS argument length limits ~128KB-2MB)
        child.stdin.write(prompt);
        child.stdin.end();
    } catch (e) {
        updateStatus(statusPath, {
            state: 'missing_cli',
            endTime: new Date().toISOString(),
            error: `Failed to spawn ${program}: ${e.message}`
        });
        process.exit(1);
    }

    // Collect output
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
        stdout += data.toString();
        // Write incrementally
        fs.writeFileSync(outputPath, stdout);
    });

    child.stderr.on('data', (data) => {
        stderr += data.toString();
        fs.writeFileSync(errorPath, stderr);
    });

    // Set timeout
    let timedOut = false;
    const timeoutId = timeout > 0 ? setTimeout(() => {
        timedOut = true;
        try {
            child.kill('SIGTERM');
        } catch (e) {
            // Process may have already exited
        }
    }, timeout) : null;

    // Wait for completion
    child.on('close', (code, signal) => {
        if (timeoutId) clearTimeout(timeoutId);

        // Write final output
        fs.writeFileSync(outputPath, stdout);
        fs.writeFileSync(errorPath, stderr);

        let state = 'done';
        if (timedOut) {
            state = 'timed_out';
        } else if (signal === 'SIGTERM') {
            state = 'canceled';
        } else if (code !== 0) {
            state = 'error';
        }

        updateStatus(statusPath, {
            state,
            endTime: new Date().toISOString(),
            exitCode: code,
            signal,
            error: state === 'error' ? `Process exited with code ${code}` : null
        });

        process.exit(code || 0);
    });

    child.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);

        updateStatus(statusPath, {
            state: err.code === 'ENOENT' ? 'missing_cli' : 'error',
            endTime: new Date().toISOString(),
            error: err.message
        });

        process.exit(1);
    });
}

main().catch((err) => {
    console.error('Worker error:', err);
    process.exit(1);
});
