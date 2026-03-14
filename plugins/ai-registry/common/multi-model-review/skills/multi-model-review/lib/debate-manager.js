/**
 * Multi-Model Code Review - Cross-Review Manager
 *
 * Manages cross-review context preparation and response parsing.
 * Handles Pass 1 results to generate cross-review contexts for Pass 2.
 */

const { extractJson } = require('./json-parser');

/**
 * Response action types for cross-review
 */
const CROSS_REVIEW_ACTIONS = {
    AGREE: 'AGREE',              // Valid finding, concur
    IGNORE: 'IGNORE',            // Not a real issue (with evidence)
    PRIORITY_ADJUST: 'PRIORITY_ADJUST' // Valid but different priority
};

/**
 * Format a member's review as compact summary
 *
 * @param {Object} result - Member's review result
 * @returns {Object} Compact summary { comments, summary, recommendation, commentCount }
 */
function formatReviewSummary(result) {
    if (!result.parsed) return { comments: [], summary: '' };

    const comments = (result.parsed.comments || []).map(c => {
        const message = c.message || '';
        return ({
            id: `${result.member}_${c.file}:${c.line}`,
            file: c.file,
            line: c.line,
            priority: c.priority,
            category: c.category,
            message: message.length > 200 ? message.slice(0, 200) + '...' : message
        });
    });

    return {
        summary: result.parsed.summary || '',
        recommendation: result.parsed.recommendation || 'COMMENT',
        comments,
        commentCount: comments.length
    };
}

// extractJson is now imported from ./json-parser.js

/**
 * Prepare all peer findings for cross-review
 *
 * @param {Array} pass1Results - Results from Pass 1 (all members)
 * @param {string} memberName - Name of the reviewing member
 * @param {Object} config - Configuration
 * @returns {Object|null} Cross-review context with peer findings
 */
function prepareAllPeerFindings(pass1Results, memberName, config) {
    const ownResult = pass1Results.find(r => r.member === memberName);
    const peerResults = pass1Results.filter(r => r.member !== memberName && r.parsed);

    if (!ownResult || peerResults.length === 0) {
        return null;
    }

    // Get scope priorities from config
    const scopePriorities = config.review?.cross_review?.scope?.priorities || ['P1', 'P2', 'P3'];

    // Format own review for reference (compact summary)
    const ownReview = formatReviewSummary(ownResult);

    // Collect ALL P1-P3 findings from peers (not just overlapping)
    const peerFindings = [];

    for (const peerResult of peerResults) {
        const comments = peerResult.parsed?.comments || [];

        for (const comment of comments) {
            // Only include findings within scope priorities
            if (!scopePriorities.includes(comment.priority)) {
                continue;
            }

            const category = comment.category || 'general';
            const findingId = `${peerResult.member}_${comment.file}:${comment.line}:${category}`;

            peerFindings.push({
                id: findingId,
                member: peerResult.member,
                file: comment.file,
                line: comment.line,
                priority: comment.priority,
                category,
                message: comment.message,
                suggestion: comment.suggestion
            });
        }
    }

    return {
        memberName,
        ownReview,
        peerFindings,
        peerModels: peerResults.map(r => r.member),
        stats: {
            totalPeerFindings: peerFindings.length,
            byPeer: peerResults.reduce((acc, r) => {
                acc[r.member] = (r.parsed?.comments || [])
                    .filter(c => scopePriorities.includes(c.priority)).length;
                return acc;
            }, {})
        }
    };
}

/**
 * Build cross-review prompt from template
 *
 * @param {string} template - Prompt template with placeholders
 * @param {string} modelName - Name of the reviewing model
 * @param {string} diff - Original diff content
 * @param {Object} context - Cross-review context from prepareAllPeerFindings
 * @param {Object} memberConfig - Member configuration (focus, strengths)
 * @returns {string} Complete cross-review prompt
 */
function buildCrossReviewPrompt(template, modelName, diff, context, memberConfig = {}) {
    // Format ALL peer findings as markdown (grouped by peer)
    const peerFindingsMd = formatAllPeerFindingsMarkdown(context.peerFindings);
    const ownReviewMd = formatOwnReviewMarkdown(context.ownReview);

    // Build per-finding evidence packets from diff
    const evidencePacketsMd = buildEvidencePackets(context.peerFindings, diff);

    return template
        .replaceAll('{{MODEL_NAME}}', modelName)
        .replaceAll('{{OWN_REVIEW}}', ownReviewMd)
        .replaceAll('{{EVIDENCE_PACKETS}}', evidencePacketsMd)
        .replaceAll('{{PEER_FINDINGS}}', peerFindingsMd);
}

/**
 * Format own Pass 1 review as markdown for cross-review context.
 *
 * @param {Object} ownReview - Own review summary from formatReviewSummary
 * @returns {string} Markdown representation
 */
function formatOwnReviewMarkdown(ownReview) {
    if (!ownReview) {
        return '_Pass 1 요약 없음_';
    }

    const lines = [];
    lines.push(`- 요약: ${ownReview.summary || 'N/A'}`);
    lines.push(`- 권고: ${ownReview.recommendation || 'COMMENT'}`);
    lines.push(`- 발견 건수: ${ownReview.commentCount || 0}`);

    if (!ownReview.comments || ownReview.comments.length === 0) {
        return lines.join('\n');
    }

    lines.push('');
    lines.push('주요 발견:');
    for (const c of ownReview.comments.slice(0, 10)) {
        lines.push(`- ${c.file}:${c.line} [${c.priority}] ${c.message}`);
    }
    if (ownReview.comments.length > 10) {
        lines.push(`- ... 외 ${ownReview.comments.length - 10}건`);
    }

    return lines.join('\n');
}

/**
 * Format all peer findings as markdown (for cross-review prompt)
 *
 * @param {Array} peerFindings - All peer findings
 * @returns {string} Markdown representation
 */
function formatAllPeerFindingsMarkdown(peerFindings) {
    if (!peerFindings || peerFindings.length === 0) {
        return '_검토할 발견 사항 없음_';
    }

    // Group by peer
    const byPeer = {};
    for (const f of peerFindings) {
        if (!byPeer[f.member]) {
            byPeer[f.member] = [];
        }
        byPeer[f.member].push(f);
    }

    const lines = [];

    for (const [peerName, findings] of Object.entries(byPeer)) {
        lines.push(`### ${peerName}의 발견 사항 (${findings.length}건)\n`);

        for (const f of findings) {
            lines.push(`#### ${f.id}`);
            lines.push(`- **파일:** ${f.file}:${f.line}`);
            lines.push(`- **우선순위:** ${f.priority}`);
            lines.push(`- **카테고리:** ${f.category}`);
            lines.push(`- **메시지:** ${f.message}`);
            if (f.suggestion) {
                lines.push(`- **제안:** ${f.suggestion}`);
            }
            lines.push('');
        }

        lines.push('---\n');
    }

    return lines.join('\n');
}

/**
 * Build per-finding evidence packets from diff
 *
 * Extracts targeted diff hunks for each finding so cross-reviewers
 * can verify claims against actual code changes.
 *
 * @param {Array} peerFindings - Peer findings to create evidence for
 * @param {string} diff - Full unified diff content
 * @returns {string} Markdown with per-finding diff hunks
 */
function buildEvidencePackets(peerFindings, diff) {
    if (!diff || !peerFindings?.length) return '_코드 증거 없음_';

    const hunks = parseDiffHunks(diff);
    if (hunks.length === 0) return '_diff 파싱 결과 없음_';

    const packets = [];
    const seen = new Set(); // deduplicate same file:line across findings

    for (const finding of peerFindings) {
        const key = `${finding.file}:${finding.line}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const relevantHunk = findRelevantHunk(hunks, finding.file, finding.line);
        if (relevantHunk) {
            packets.push(`#### ${finding.id}\n**파일:** \`${finding.file}:${finding.line}\`\n\`\`\`diff\n${relevantHunk}\n\`\`\``);
        } else {
            packets.push(`#### ${finding.id}\n**파일:** \`${finding.file}:${finding.line}\`\n_해당 라인의 diff hunk를 찾을 수 없음 (변경되지 않은 파일이거나 라인 범위 밖)_`);
        }
    }

    return packets.join('\n\n');
}

/**
 * Parse unified diff into file-level hunk objects
 *
 * @param {string} diff - Unified diff string
 * @returns {Array<{file: string, hunks: Array<{startLine: number, endLine: number, content: string}>}>}
 */
function parseDiffHunks(diff) {
    if (!diff) return [];

    const files = [];
    let currentFile = null;
    let currentHunk = null;

    const lines = diff.split('\n');

    for (const line of lines) {
        // Match file header: diff --git a/path b/path or --- a/path or +++ b/path
        const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
        if (fileMatch) {
            currentFile = { file: fileMatch[1], hunks: [] };
            files.push(currentFile);
            continue;
        }

        // Match hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch && currentFile) {
            const startLine = parseInt(hunkMatch[1], 10);
            const count = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
            currentHunk = {
                startLine,
                endLine: startLine + count - 1,
                content: line
            };
            currentFile.hunks.push(currentHunk);
            continue;
        }

        // Accumulate hunk content
        if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
            currentHunk.content += '\n' + line;
        }
    }

    return files;
}

/**
 * Find the most relevant diff hunk for a finding's file and line
 *
 * @param {Array} parsedFiles - Output from parseDiffHunks
 * @param {string} findingFile - File path from finding (e.g. "src/api.js")
 * @param {number} findingLine - Line number from finding
 * @param {number} margin - Lines margin for matching (default 15)
 * @returns {string|null} Relevant hunk content or null
 */
function findRelevantHunk(parsedFiles, findingFile, findingLine, margin = 15) {
    if (!findingFile || !findingLine) return null;

    const line = parseInt(findingLine, 10);
    if (isNaN(line)) return null;

    // Find matching file (try exact match first, then suffix match)
    let fileEntry = parsedFiles.find(f => f.file === findingFile);
    if (!fileEntry) {
        // Try suffix match (finding might use shorter path)
        fileEntry = parsedFiles.find(f => f.file.endsWith(findingFile) || findingFile.endsWith(f.file));
    }
    if (!fileEntry) return null;

    // Find hunk that contains or is nearest to the finding line
    let bestHunk = null;
    let bestDistance = Infinity;

    for (const hunk of fileEntry.hunks) {
        // Check if line is within hunk range (with margin)
        if (line >= hunk.startLine - margin && line <= hunk.endLine + margin) {
            const distance = Math.max(0, line < hunk.startLine ? hunk.startLine - line : line - hunk.endLine);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestHunk = hunk;
            }
        }
    }

    if (!bestHunk) return null;

    // Trim hunk to relevant portion if very large (keep ~30 lines around target)
    const hunkLines = bestHunk.content.split('\n');
    if (hunkLines.length <= 40) return bestHunk.content;

    // Find approximate position in hunk and extract surrounding context
    const targetOffset = line - bestHunk.startLine;
    const start = Math.max(0, targetOffset - 15);
    const end = Math.min(hunkLines.length, targetOffset + 15);
    return hunkLines.slice(start, end).join('\n');
}

/**
 * Check if cross-review should be skipped
 *
 * @param {Array} pass1Results - Results from Pass 1
 * @param {Object} config - Configuration
 * @returns {Object} { skip: boolean, reason: string }
 */
function shouldSkipCrossReview(pass1Results, config) {
    const crossReviewConfig = config.review?.cross_review || {};

    // Check if cross-review is enabled
    if (!crossReviewConfig.enabled) {
        return { skip: true, reason: 'cross_review_disabled' };
    }

    // Check minimum member count
    const validResults = pass1Results.filter(r => r.parsed);
    if (validResults.length < 2) {
        return { skip: true, reason: 'insufficient_members' };
    }

    // Get scope priorities
    const scopePriorities = crossReviewConfig.scope?.priorities || ['P1', 'P2', 'P3'];

    // Count findings in scope
    const totalFindings = pass1Results.reduce((sum, r) => {
        const comments = r.parsed?.comments || [];
        return sum + comments.filter(c => scopePriorities.includes(c.priority)).length;
    }, 0);

    if (totalFindings === 0) {
        return { skip: true, reason: 'no_findings_in_scope' };
    }

    return { skip: false, reason: null };
}

/**
 * Parse cross-review response from model output
 *
 * @param {string} output - Raw model output
 * @returns {Object} Parsed cross-review response
 */
function parseCrossReviewResponse(output) {
    // Try to extract JSON from output
    const jsonMatch = extractJson(output);
    if (!jsonMatch) {
        return {
            error: 'No valid JSON found in cross-review response',
            raw: output
        };
    }

    try {
        const parsed = JSON.parse(jsonMatch);

        // Validate and normalize response structure
        return normalizeCrossReviewResponse(parsed);
    } catch (e) {
        return {
            error: `Failed to parse cross-review response: ${e.message}`,
            raw: output
        };
    }
}

/**
 * Normalize cross-review response to standard structure
 *
 * @param {Object} parsed - Parsed JSON response
 * @returns {Object} Normalized response
 */
function normalizeCrossReviewResponse(parsed) {
    const votes = parsed.crossReviewVotes || parsed.votes || [];

    return {
        reviewer: parsed.reviewer || 'unknown',
        crossReviewVotes: votes.map(v => ({
            findingId: v.finding_id || v.findingId || v.id,
            action: v.action || 'AGREE',
            reasoning: v.reasoning || v.reason || '',  // reasoning 우선, reason fallback
            reason: v.reason || v.reasoning || '',      // 하위 호환
            confidence: v.confidence || 'medium',
            evidence: v.evidence,
            originalPriority: v.original_priority || v.originalPriority,
            suggestedPriority: v.suggested_priority || v.suggestedPriority
        })),
        summary: parsed.summary || '',
        stats: parsed.stats || null
    };
}

/**
 * Create cross-review findings file for worker
 *
 * @param {Array} pass1Results - Results from Pass 1
 * @param {string} memberName - Current member (excluded)
 * @param {Object} config - Configuration
 * @returns {Object} Peer findings for file write
 */
function createCrossReviewFindingsFile(pass1Results, memberName, config) {
    const context = prepareAllPeerFindings(pass1Results, memberName, config);
    if (!context) return null;

    return {
        memberName,
        ownReview: context.ownReview,
        peerFindings: context.peerFindings,
        peerModels: context.peerModels,
        stats: context.stats,
        generatedAt: new Date().toISOString()
    };
}

module.exports = {
    CROSS_REVIEW_ACTIONS,
    prepareAllPeerFindings,
    buildCrossReviewPrompt,
    buildEvidencePackets,
    parseDiffHunks,
    findRelevantHunk,
    parseCrossReviewResponse,
    shouldSkipCrossReview,
    createCrossReviewFindingsFile
};
