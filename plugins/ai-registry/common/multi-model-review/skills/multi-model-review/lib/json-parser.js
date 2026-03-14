/**
 * Multi-Model Code Review - JSON Parser Utility
 *
 * Shared JSON extraction and parsing logic for AI model outputs.
 * Handles various output formats: raw JSON, markdown code blocks,
 * CLI envelope wrapping, and mixed text/JSON output.
 *
 * Uses string-aware brace matching to correctly handle JSON strings
 * containing braces (e.g., code snippets inside message fields).
 */

/**
 * Find matching closing brace with string-awareness.
 * Correctly skips braces inside JSON string values.
 *
 * @param {string} text - Input text
 * @param {number} startPos - Position of opening brace
 * @returns {number} Position of matching closing brace, or -1
 */
function findMatchingBrace(text, startPos) {
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startPos; i < text.length; i++) {
        const ch = text[i];

        if (escapeNext) { escapeNext = false; continue; }
        if (ch === '\\' && inString) { escapeNext = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Extract JSON from AI model output.
 *
 * Handles:
 * 1. Direct JSON output (starts with '{')
 * 2. CLI envelope: {"type":"result","result":"...actual JSON..."}
 * 3. Markdown code blocks: ```json ... ```
 * 4. JSON embedded in mixed text (finds largest valid JSON object)
 *
 * @param {string} output - Raw model output
 * @returns {string|null} JSON string or null if not found
 */
function extractJson(output) {
    const trimmed = output.trim();

    // 1. Try direct JSON parse (starts with '{')
    if (trimmed.startsWith('{')) {
        const endPos = findMatchingBrace(trimmed, 0);
        if (endPos !== -1) {
            const candidate = trimmed.slice(0, endPos + 1);

            // Unwrap CLI envelope: {"type":"result","result":"...actual JSON..."}
            try {
                const parsed = JSON.parse(candidate);
                if (parsed.type === 'result' && typeof parsed.result === 'string') {
                    return extractJson(parsed.result);
                }
                return candidate; // valid JSON
            } catch (e) {
                // Not valid JSON, fall through to other strategies
            }
        }
    }

    // 2. Try extracting from markdown code block
    const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        const candidate = codeBlockMatch[1].trim();
        try {
            JSON.parse(candidate);
            return candidate;
        } catch (e) {
            // Lazy match may truncate at nested code blocks (e.g. ```python inside JSON strings).
            // Try greedy match to capture the outermost code block.
            const greedyMatch = output.match(/```(?:json)?\s*([\s\S]*)```/);
            if (greedyMatch) {
                const greedyCandidate = greedyMatch[1].trim();
                try {
                    JSON.parse(greedyCandidate);
                    return greedyCandidate;
                } catch (e2) {
                    // Fall through to Stage 3 (brace matching)
                }
            }
        }
    }

    // 3. Fallback: find largest valid JSON object in text
    let bestCandidate = null;
    let bestLength = 0;
    let searchFrom = 0;

    while (searchFrom < output.length) {
        const bracePos = output.indexOf('{', searchFrom);
        if (bracePos === -1) break;

        const endPos = findMatchingBrace(output, bracePos);
        if (endPos === -1) break;

        const candidate = output.slice(bracePos, endPos + 1);
        if (candidate.length > bestLength) {
            try {
                JSON.parse(candidate);
                bestCandidate = candidate;
                bestLength = candidate.length;
            } catch (e) {
                // Not valid JSON, skip
            }
        }

        searchFrom = endPos + 1;
    }

    return bestCandidate;
}

/**
 * Parse JSON from AI model output.
 *
 * Higher-level function that extracts and parses JSON.
 * Throws if no valid JSON is found.
 *
 * @param {string} output - Raw model output
 * @returns {Object} Parsed JSON object
 * @throws {Error} If no valid JSON found
 */
function parseJsonFromOutput(output) {
    const jsonStr = extractJson(output);
    if (!jsonStr) {
        throw new Error('No valid JSON found in output');
    }
    return JSON.parse(jsonStr);
}

module.exports = {
    findMatchingBrace,
    extractJson,
    parseJsonFromOutput
};
