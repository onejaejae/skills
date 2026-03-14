/**
 * Multi-Model Code Review - Priority Sorter
 *
 * Utilities for sorting and comparing review priorities.
 */

/**
 * Priority order mapping (lower number = higher priority)
 */
const PRIORITY_ORDER = {
    P1: 0,
    P2: 1,
    P3: 2,
    P4: 3,
    P5: 4
};

/**
 * Priority labels
 */
const PRIORITY_LABELS = {
    P1: '반드시 수정',
    P2: '수정 권장',
    P3: '검토 필요',
    P4: '개선 고려',
    P5: '참고'
};

/**
 * Priority colors for terminal/markdown
 */
const PRIORITY_COLORS = {
    P1: '#ff0000', // Red
    P2: '#ff8c00', // Orange
    P3: '#ffd700', // Yellow
    P4: '#00bfff', // Light blue
    P5: '#808080'  // Gray
};

/**
 * Compare two priorities
 * Returns negative if a is higher priority, positive if b is higher
 *
 * @param {string} a - First priority
 * @param {string} b - Second priority
 * @returns {number} Comparison result
 */
function comparePriority(a, b) {
    const orderA = PRIORITY_ORDER[a] ?? 5;
    const orderB = PRIORITY_ORDER[b] ?? 5;
    return orderA - orderB;
}

/**
 * Sort comments by priority (P1 first, then P2, etc.)
 * Secondary sort by file path and line number
 *
 * @param {Array} comments - Array of comments to sort
 * @returns {Array} Sorted array (mutates original)
 */
function sortByPriority(comments) {
    return comments.sort((a, b) => {
        // Primary: priority
        const priorityDiff = comparePriority(a.priority, b.priority);
        if (priorityDiff !== 0) return priorityDiff;

        // Secondary: file path
        const fileDiff = (a.file || '').localeCompare(b.file || '');
        if (fileDiff !== 0) return fileDiff;

        // Tertiary: line number
        return (a.line || 0) - (b.line || 0);
    });
}

/**
 * Sort comments by consensus (more models agree = higher)
 * Secondary sort by priority
 *
 * @param {Array} comments - Array of comments to sort
 * @returns {Array} Sorted array (mutates original)
 */
function sortByConsensus(comments) {
    return comments.sort((a, b) => {
        // Primary: consensus (descending)
        const consensusDiff = (b.consensus || 1) - (a.consensus || 1);
        if (consensusDiff !== 0) return consensusDiff;

        // Secondary: priority
        return comparePriority(a.priority, b.priority);
    });
}

/**
 * Get priority label
 *
 * @param {string} priority - Priority code (P1-P5)
 * @returns {string} Human-readable label
 */
function getPriorityLabel(priority) {
    return PRIORITY_LABELS[priority] || priority;
}

/**
 * Get priority color
 *
 * @param {string} priority - Priority code (P1-P5)
 * @returns {string} Color code
 */
function getPriorityColor(priority) {
    return PRIORITY_COLORS[priority] || '#808080';
}

/**
 * Get priority emoji for markdown/slack
 *
 * @param {string} priority - Priority code (P1-P5)
 * @returns {string} Emoji
 */
function getPriorityEmoji(priority) {
    const emojis = {
        P1: '🔴',
        P2: '🟠',
        P3: '🟡',
        P4: '🔵',
        P5: '⚪'
    };
    return emojis[priority] || '⚪';
}

/**
 * Check if a priority is critical (P1 or P2)
 *
 * @param {string} priority - Priority code
 * @returns {boolean}
 */
function isCritical(priority) {
    return priority === 'P1' || priority === 'P2';
}

/**
 * Check if a priority is actionable (P1, P2, or P3)
 *
 * @param {string} priority - Priority code
 * @returns {boolean}
 */
function isActionable(priority) {
    return priority === 'P1' || priority === 'P2' || priority === 'P3';
}

/**
 * Filter comments by priority threshold
 *
 * @param {Array} comments - Comments to filter
 * @param {string} minPriority - Minimum priority to include (e.g., 'P3' includes P1, P2, P3)
 * @returns {Array} Filtered comments
 */
function filterByPriority(comments, minPriority) {
    const threshold = PRIORITY_ORDER[minPriority] ?? 5;
    return comments.filter(c => (PRIORITY_ORDER[c.priority] ?? 5) <= threshold);
}

/**
 * Get summary counts by priority
 *
 * @param {Array} comments - Comments to count
 * @returns {Object} Counts by priority
 */
function countByPriority(comments) {
    const counts = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };

    for (const comment of comments) {
        if (counts[comment.priority] !== undefined) {
            counts[comment.priority]++;
        }
    }

    return counts;
}

module.exports = {
    PRIORITY_ORDER,
    PRIORITY_LABELS,
    PRIORITY_COLORS,
    comparePriority,
    sortByPriority,
    sortByConsensus,
    getPriorityLabel,
    getPriorityColor,
    getPriorityEmoji,
    isCritical,
    isActionable,
    filterByPriority,
    countByPriority
};
