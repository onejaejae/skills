/**
 * Multi-Model Code Review - File System Utilities
 *
 * Shared file system utilities used by both the orchestrator and workers.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Atomic JSON write - writes to temp file first, then renames
 * Prevents corruption from concurrent access or crashes.
 *
 * @param {string} filePath - Target file path
 * @param {Object} data - Data to serialize as JSON
 */
function writeJsonAtomic(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
}

/**
 * Normalize file path for consistent cross-model comparison.
 *
 * AI models may report paths differently:
 * - "./src/file.py" vs "src/file.py"
 * - "src/file.py" vs "/src/file.py"
 * - Windows backslashes vs forward slashes
 *
 * @param {string} filePath - File path from model output
 * @returns {string} Normalized path
 */
function normalizePath(filePath) {
    if (!filePath) return '';
    return filePath
        .replace(/\\/g, '/')       // Windows backslashes → forward slashes
        .replace(/^\.\//, '')       // Remove leading ./
        .replace(/^\/+/, '')        // Remove leading slashes
        .replace(/\/+/g, '/');      // Collapse multiple slashes
}

/**
 * Build a location key for cross-model finding comparison.
 * Uses normalized path + line number for consistent matching.
 *
 * @param {string} file - File path
 * @param {number} line - Line number
 * @param {string} [category] - Optional category
 * @returns {string} Normalized location key
 */
function buildLocationKey(file, line, category) {
    const normalized = normalizePath(file);
    if (category) {
        return `${normalized}:${line}:${category}`;
    }
    return `${normalized}:${line}`;
}

module.exports = {
    writeJsonAtomic,
    normalizePath,
    buildLocationKey
};
