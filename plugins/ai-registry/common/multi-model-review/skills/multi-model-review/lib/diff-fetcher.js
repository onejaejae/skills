/**
 * Multi-Model Code Review - Diff Fetcher
 *
 * Handles fetching diffs from GitHub PRs and local branches.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CMD_TIMEOUT_MS = 30_000;

/**
 * Detect base branch for local branch comparison.
 * Priority:
 * 1) origin/HEAD symbolic ref (e.g. origin/main)
 * 2) common remote branches (origin/main, origin/master, origin/develop)
 * 3) fallback to origin/main
 *
 * @returns {string} base branch ref
 */
function detectBaseBranch() {
    const headRefResult = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
        encoding: 'utf8'
    });
    if (headRefResult.status === 0 && headRefResult.stdout.trim()) {
        return headRefResult.stdout.trim();
    }

    const candidates = ['origin/main', 'origin/master', 'origin/develop'];
    for (const candidate of candidates) {
        const verify = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/${candidate}`], {
            encoding: 'utf8'
        });
        if (verify.status === 0) {
            return candidate;
        }
    }

    return 'origin/main';
}

/**
 * Fetch diff from GitHub PR or local branch
 *
 * @param {string} target - PR URL or branch name
 * @param {string} targetType - 'pr_url' or 'branch'
 * @returns {Object} { diff, metadata, source }
 */
async function fetchDiff(target, targetType) {
    try {
        if (targetType === 'pr_url') {
            return fetchPrDiff(target);
        } else if (targetType === 'branch') {
            return fetchBranchDiff(target);
        } else {
            throw new Error(`Unknown target type: ${targetType}`);
        }
    } catch (error) {
        throw new Error(`Failed to fetch diff: ${error.message}`);
    }
}

/**
 * Fetch diff from a GitHub PR URL
 */
function fetchPrDiff(target) {
    const match = target.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
        throw new Error(`Invalid PR URL: ${target}`);
    }
    const [, owner, repo, prNumber] = match;

    // Input validation - prevent shell metacharacters
    if (!/^[a-zA-Z0-9._-]+$/.test(owner)) {
        throw new Error(`Invalid repository owner: ${owner}`);
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
        throw new Error(`Invalid repository name: ${repo}`);
    }

    // Fetch diff using gh CLI (spawnSync to avoid shell injection)
    const diffResult = spawnSync('gh', ['pr', 'diff', prNumber, '--repo', `${owner}/${repo}`], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: CMD_TIMEOUT_MS
    });
    if (diffResult.status !== 0) {
        throw new Error(`gh pr diff failed: ${diffResult.stderr || 'unknown error'}`);
    }

    // Fetch PR metadata
    const metadataResult = spawnSync('gh', [
        'pr', 'view', prNumber, '--repo', `${owner}/${repo}`,
        '--json', 'title,body,files,author,baseRefName,headRefName'
    ], { encoding: 'utf8', timeout: CMD_TIMEOUT_MS });
    if (metadataResult.status !== 0) {
        throw new Error(`gh pr view failed: ${metadataResult.stderr || 'unknown error'}`);
    }

    return {
        diff: diffResult.stdout,
        metadata: JSON.parse(metadataResult.stdout),
        source: 'github_pr'
    };
}

/**
 * Fetch diff from a local branch
 */
function fetchBranchDiff(target) {
    // Input validation - prevent shell metacharacters in branch name
    if (!/^[a-zA-Z0-9._\/-]+$/.test(target)) {
        throw new Error(`Invalid branch name: ${target}`);
    }

    const baseBranch = detectBaseBranch();
    const diffResult = spawnSync('git', ['diff', `${baseBranch}...${target}`], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: CMD_TIMEOUT_MS
    });
    if (diffResult.status !== 0) {
        throw new Error(`git diff failed: ${diffResult.stderr || 'unknown error'}`);
    }

    const logResult = spawnSync('git', ['log', `${baseBranch}..${target}`, '--oneline'], {
        encoding: 'utf8',
        timeout: CMD_TIMEOUT_MS
    });
    const logOutput = logResult.status === 0 ? logResult.stdout : '';
    const trimmedLog = logOutput.trim();

    return {
        diff: diffResult.stdout,
        metadata: {
            title: `Review: ${target}`,
            commits: trimmedLog ? trimmedLog.split('\n').length : 0,
            baseBranch,
            headBranch: target
        },
        source: 'local_branch'
    };
}

/**
 * Check if a file path matches any of the exclude patterns.
 *
 * @param {string} filePath - File path to check
 * @param {string[]} patterns - Glob-like patterns (e.g. "*.lock", "package-lock.json")
 * @returns {boolean} true if file should be excluded
 */
function matchesExcludePattern(filePath, patterns) {
    const fileName = path.basename(filePath);
    for (const pattern of patterns) {
        if (pattern === fileName) return true;
        if (pattern.startsWith('*.') && fileName.endsWith(pattern.slice(1))) return true;
        if (pattern.includes('*.') && pattern.includes('.')) {
            // Handle patterns like "*.generated.*"
            const parts = pattern.split('*').filter(Boolean);
            if (parts.every(part => fileName.includes(part))) return true;
        }
    }
    return false;
}

/**
 * Truncate file content to fit within max size, keeping head and tail.
 *
 * @param {string} content - File content
 * @param {number} maxSize - Maximum character count
 * @returns {{ content: string, truncated: boolean }}
 */
function truncateContent(content, maxSize) {
    if (content.length <= maxSize) {
        return { content, truncated: false };
    }
    const headSize = Math.floor(maxSize * 0.7);
    const tailSize = maxSize - headSize - 50; // 50 chars for truncation notice
    const head = content.slice(0, headSize);
    const tail = content.slice(-tailSize);
    const omitted = content.length - headSize - tailSize;
    return {
        content: `${head}\n\n... (${omitted} characters omitted) ...\n\n${tail}`,
        truncated: true
    };
}

/**
 * Fetch full file contents for changed files in a GitHub PR.
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} prNumber - PR number
 * @param {Object} config - file_context config section
 * @returns {{ files: Array<{ path: string, content: string, truncated: boolean }> }}
 */
function fetchPrFileContents(owner, repo, prNumber, config) {
    const maxFileSize = config.max_file_size || 30000;
    const maxTotalSize = config.max_total_size || 200000;
    const excludePatterns = config.exclude_patterns || [];

    // Get file list with additions count for prioritization
    const filesResult = spawnSync('gh', [
        'api', `repos/${owner}/${repo}/pulls/${prNumber}/files`,
        '--paginate', '--jq', '.[].filename'
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: CMD_TIMEOUT_MS });

    if (filesResult.status !== 0) {
        console.error(`Warning: Failed to fetch PR file list: ${filesResult.stderr}`);
        return { files: [] };
    }

    const filePaths = filesResult.stdout.trim().split('\n').filter(Boolean);

    // Get the head SHA for fetching file contents
    const shaResult = spawnSync('gh', [
        'pr', 'view', prNumber, '--repo', `${owner}/${repo}`,
        '--json', 'headRefOid', '--jq', '.headRefOid'
    ], { encoding: 'utf8', timeout: CMD_TIMEOUT_MS });

    if (shaResult.status !== 0) {
        console.error(`Warning: Failed to fetch head SHA: ${shaResult.stderr}`);
        return { files: [] };
    }
    const headSha = shaResult.stdout.trim();

    const files = [];
    let totalSize = 0;

    for (const filePath of filePaths) {
        // Skip excluded patterns
        if (matchesExcludePattern(filePath, excludePatterns)) continue;

        // Skip binary-likely extensions
        if (/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i.test(filePath)) continue;

        // Check total size budget
        if (totalSize >= maxTotalSize) break;

        // Fetch file content
        const contentResult = spawnSync('gh', [
            'api', `repos/${owner}/${repo}/contents/${filePath}?ref=${headSha}`,
            '--jq', '.content'
        ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: CMD_TIMEOUT_MS });

        if (contentResult.status !== 0) continue;

        // Decode base64 content from GitHub API
        const base64Content = contentResult.stdout.trim();
        if (!base64Content || base64Content === 'null') continue;

        let content;
        try {
            content = Buffer.from(base64Content, 'base64').toString('utf8');
        } catch (e) {
            continue;
        }

        // Truncate if needed
        const remainingBudget = maxTotalSize - totalSize;
        const effectiveMax = Math.min(maxFileSize, remainingBudget);
        const { content: finalContent, truncated } = truncateContent(content, effectiveMax);

        files.push({ path: filePath, content: finalContent, truncated });
        totalSize += finalContent.length;
    }

    return { files };
}

/**
 * Fetch full file contents for changed files in a local branch.
 *
 * @param {string} branchName - Branch name
 * @param {string} baseBranch - Base branch for comparison
 * @param {Object} config - file_context config section
 * @returns {{ files: Array<{ path: string, content: string, truncated: boolean }> }}
 */
function fetchBranchFileContents(branchName, baseBranch, config) {
    const maxFileSize = config.max_file_size || 30000;
    const maxTotalSize = config.max_total_size || 200000;
    const excludePatterns = config.exclude_patterns || [];

    // Get list of changed files
    const namesResult = spawnSync('git', ['diff', '--name-only', `${baseBranch}...${branchName}`], {
        encoding: 'utf8',
        timeout: CMD_TIMEOUT_MS
    });

    if (namesResult.status !== 0) {
        console.error(`Warning: Failed to get changed file names: ${namesResult.stderr}`);
        return { files: [] };
    }

    const filePaths = namesResult.stdout.trim().split('\n').filter(Boolean);
    const files = [];
    let totalSize = 0;

    for (const filePath of filePaths) {
        if (matchesExcludePattern(filePath, excludePatterns)) continue;
        if (/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i.test(filePath)) continue;
        if (totalSize >= maxTotalSize) break;

        // Read from local filesystem
        if (!fs.existsSync(filePath)) continue;

        let content;
        try {
            content = fs.readFileSync(filePath, 'utf8');
        } catch (e) {
            continue;
        }

        const remainingBudget = maxTotalSize - totalSize;
        const effectiveMax = Math.min(maxFileSize, remainingBudget);
        const { content: finalContent, truncated } = truncateContent(content, effectiveMax);

        files.push({ path: filePath, content: finalContent, truncated });
        totalSize += finalContent.length;
    }

    return { files };
}

module.exports = {
    fetchDiff,
    detectBaseBranch,
    fetchPrFileContents,
    fetchBranchFileContents,
    matchesExcludePattern,
    truncateContent
};
