/**
 * Multi-Model Code Review - Consensus Resolver
 *
 * Handles consensus building and dispute resolution for the debate architecture.
 * Analyzes AGREE/DISAGREE/MISSED responses and resolves conflicts using
 * weight-based voting or chairman mediation.
 */

const { comparePriority, isCritical } = require('./priority-sorter');
const { normalizePath } = require('./fs-utils');

/**
 * Consensus types for findings
 */
const CONSENSUS_TYPE = {
    CONFIRMED: 'confirmed',      // Both models agree
    DISPUTED: 'disputed',        // Disagreement exists
    UNIQUE: 'unique',            // Only one model found
    ACKNOWLEDGED: 'acknowledged' // Unique but peer acknowledged via MISSED
};

/**
 * Hybrid voting result types for 3-model architecture
 */
const VOTING_RESULT = {
    UNANIMOUS: 'unanimous',      // 3/3 동의 - 즉시 확정
    MAJORITY: 'majority',        // 2/3 동의 - 즉시 확정
    DISPUTED: 'disputed',        // 의견 불일치 - 토론 필요
    UNIQUE: 'unique'             // 단일 모델 발견 - 검토 필요
};

/**
 * Confidence badge mapping for voting results
 */
const CONFIDENCE_BADGES = {
    unanimous: '⭐⭐⭐',
    majority: '⭐⭐',
    disputed: '⚡',
    unique: '📝'
};

/**
 * Validation badge mapping for cross-review results
 * Based on agreement ratio from peer reviews
 */
const VALIDATION_BADGES = {
    full: '⭐⭐⭐',      // 100% (all models agree)
    majority: '⭐⭐',    // 67%+ (2/3 agree)
    partial: '⭐',       // 34%+ (1/3+ agree)
    single: '📝'         // <34% (single model, not validated)
};

/**
 * Security-related keywords for tiebreaker logic
 */
const SECURITY_KEYWORDS = [
    'security', 'injection', 'xss', 'csrf', 'sql injection',
    'authorization', 'authentication', 'privilege', 'escalation',
    'rce', 'remote code', 'command injection', 'path traversal',
    'ssrf', 'xxe', 'deserialization', 'secret', 'credential',
    'hardcoded', 'sensitive', 'exposure', 'leak'
];

/**
 * Build consensus from Pass 1 results and debate responses
 *
 * @param {Array} pass1Results - Original review results from each model
 * @param {Array} debateResponses - Debate responses from each model
 * @param {Object} config - Configuration with member weights
 * @returns {Object} Consensus result with confirmed, disputed, and unique items
 */
function buildConsensus(pass1Results, debateResponses, config) {
    const memberWeights = buildWeightMap(config);

    // Index all findings by location key
    const findingIndex = indexFindings(pass1Results);

    // Process debate responses
    const agreements = [];
    const disputes = [];
    const acknowledgements = [];

    for (const debateResponse of debateResponses) {
        if (!debateResponse.parsed) continue;

        const debater = debateResponse.member;

        // Process agreements (AGREE responses)
        for (const response of debateResponse.parsed.responses || []) {
            if (response.action === 'AGREE') {
                agreements.push({
                    findingId: response.findingId || response.finding_id,
                    file: response.file,
                    line: response.line,
                    category: response.category,
                    agreedBy: debater,
                    reason: response.reason,
                    confidence: response.confidence,
                    // Preserve rich debate fields from normalizeResponses
                    evidence: response.evidence,
                    peerPriority: response.peerPriority,
                    myPriority: response.myPriority,
                    additionalContext: response.additionalContext
                });
            }
        }

        // Process enhancements (supplementary analysis from debate)
        const enhancements = debateResponse.parsed.enhancements || [];
        for (const enhancement of enhancements) {
            // Enhancements can provide additional context to existing findings
            // Store them for later merging into perspectives
            agreements.push({
                findingId: enhancement.finding_id || enhancement.findingId,
                file: enhancement.file,
                line: enhancement.line,
                agreedBy: debater,
                reason: enhancement.reason || enhancement.additional_analysis,
                confidence: enhancement.confidence,
                isEnhancement: true,
                additionalContext: enhancement.context || enhancement.additional_context
            });
        }

        // Process disagreements
        for (const disagreement of debateResponse.parsed.disagreements || []) {
            disputes.push({
                findingId: disagreement.findingId,
                file: disagreement.file,
                line: disagreement.line,
                category: disagreement.category,
                disputedBy: debater,
                peerPriority: disagreement.peerPriority,
                myPriority: disagreement.myPriority,
                reason: disagreement.reason,
                evidence: disagreement.evidence,
                suggestedResolution: disagreement.suggestedResolution
            });
        }

        // Process acknowledged missed items
        for (const missed of debateResponse.parsed.uniqueFindings || []) {
            acknowledgements.push({
                ...missed,
                acknowledgedBy: debater
            });
        }
    }

    // Categorize all findings
    const { confirmed, disputed, unique } = categorizeFindings(
        findingIndex,
        agreements,
        disputes,
        acknowledgements
    );

    // Calculate stats
    const stats = {
        totalFindings: Object.keys(findingIndex).length,
        confirmed: confirmed.length,
        disputed: disputed.length,
        unique: unique.length,
        acknowledged: unique.filter(u => u.acknowledged).length,
        agreementRate: calculateAgreementRate(confirmed, disputed)
    };

    return {
        confirmed,
        disputed,
        unique,
        stats,
        memberWeights
    };
}

/**
 * Build weight map from configuration
 *
 * @param {Object} config - Configuration with members
 * @returns {Object} Member name to weight map
 */
function buildWeightMap(config) {
    const weights = {};
    const members = config.review?.members || [];

    for (const member of members) {
        weights[member.name] = member.weight || 1.0;
    }

    return weights;
}

/**
 * Index all findings by location key for easy lookup
 * Uses file:line:category composite key to avoid merging different category issues
 *
 * @param {Array} pass1Results - Review results
 * @returns {Object} Index of findings by key
 */
function indexFindings(pass1Results) {
    const index = {};

    for (const result of pass1Results) {
        if (!result.parsed?.comments) continue;

        for (const comment of result.parsed.comments) {
            // Use composite key: normalizedFile:line:category to avoid merging different issues
            const category = comment.category || 'general';
            const normalizedFile = normalizePath(comment.file);
            const key = `${normalizedFile}:${comment.line}:${category}`;

            if (!index[key]) {
                index[key] = {
                    key,
                    file: normalizedFile,
                    line: comment.line,
                    category,
                    findings: []
                };
            }

            index[key].findings.push({
                member: result.member,
                priority: comment.priority,
                message: comment.message,
                suggestion: comment.suggestion,
                category,
                // Preserve detailed fields (legacy format)
                currentCode: comment.currentCode,
                concern: comment.concern,
                solution: comment.solution,
                benefit: comment.benefit,
                // Preserve reasoning object (new 5-step format)
                reasoning: comment.reasoning,
                confidence: comment.confidence
            });
        }
    }

    return index;
}

/**
 * Categorize findings into confirmed, disputed, or unique
 *
 * @param {Object} findingIndex - Indexed findings
 * @param {Array} agreements - Agreement responses
 * @param {Array} disputes - Dispute responses
 * @param {Array} acknowledgements - Acknowledged missed items
 * @returns {Object} Categorized findings
 */
function categorizeFindings(findingIndex, agreements, disputes, acknowledgements) {
    const confirmed = [];
    const disputed = [];
    const unique = [];

    // Create dispute lookup with composite key (normalized) + fallback keys
    const disputeKeys = new Set();
    for (const d of disputes) {
        const category = d.category || 'general';
        disputeKeys.add(`${normalizePath(d.file)}:${d.line}:${category}`);
        disputeKeys.add(`${normalizePath(d.file)}:${d.line}`);
    }

    // Create agreement lookup for peer validation
    // Key: normalizedFile:line:category (with file:line fallback)
    const agreementMap = new Map();
    for (const agreement of agreements) {
        if (agreement.file && agreement.line) {
            const baseKey = `${normalizePath(agreement.file)}:${agreement.line}`;
            const key = agreement.category
                ? `${baseKey}:${agreement.category}`
                : baseKey;
            if (!agreementMap.has(key)) {
                agreementMap.set(key, []);
            }
            // Also populate fallback (file:line only) if category-specific key is used
            if (key !== baseKey && !agreementMap.has(baseKey)) {
                agreementMap.set(baseKey, []);
            }
            agreementMap.get(key).push({
                agreedBy: agreement.agreedBy,
                reason: agreement.reason,
                confidence: agreement.confidence,
                // Preserve rich debate fields
                evidence: agreement.evidence,
                peerPriority: agreement.peerPriority,
                myPriority: agreement.myPriority,
                additionalContext: agreement.additionalContext,
                isEnhancement: agreement.isEnhancement
            });
        }
    }

    for (const [key, item] of Object.entries(findingIndex)) {
        const uniqueModels = new Set(item.findings.map(f => f.member));
        const uniqueModelCount = uniqueModels.size;
        const locationKey = `${item.file}:${item.line}:${item.category}`;
        const fallbackKey = `${item.file}:${item.line}`;

        // Check if peer agreed to this finding in debate
        const peerAgreements = agreementMap.get(locationKey) ||
                               agreementMap.get(fallbackKey) || [];
        const hasPeerAgreement = peerAgreements.length > 0;

        if (uniqueModelCount >= 2) {
            // Multiple models found this - check for disputes
            if (disputeKeys.has(key)) {
                // Priority disagreement - match using composite key
                const relatedDisputes = disputes.filter(d => {
                    const category = d.category || 'general';
                    return `${normalizePath(d.file)}:${d.line}:${category}` === key;
                });
                disputed.push({
                    ...item,
                    consensusType: CONSENSUS_TYPE.DISPUTED,
                    disputes: relatedDisputes,
                    peerAgreements
                });
            } else {
                // Confirmed consensus
                confirmed.push({
                    ...item,
                    consensusType: CONSENSUS_TYPE.CONFIRMED,
                    consensus: item.findings.length,
                    peerAgreements
                });
            }
        } else {
            // Single model found this - check for acknowledgement or agreement
            const isAcknowledged = acknowledgements.some(
                a => normalizePath(a.file) === item.file && a.line === item.line
            );

            // AGREE in debate also counts as acknowledgement
            const isAgreed = hasPeerAgreement;

            const acknowledged = isAcknowledged || isAgreed;

            unique.push({
                ...item,
                consensusType: acknowledged
                    ? CONSENSUS_TYPE.ACKNOWLEDGED
                    : CONSENSUS_TYPE.UNIQUE,
                acknowledged,
                foundBy: item.findings[0].member,
                // Include debate context if peer agreed
                peerAgreements: isAgreed ? peerAgreements : []
            });
        }
    }

    return { confirmed, disputed, unique };
}

/**
 * Calculate agreement rate
 *
 * @param {Array} confirmed - Confirmed findings
 * @param {Array} disputed - Disputed findings
 * @returns {string} Agreement rate percentage
 */
function calculateAgreementRate(confirmed, disputed) {
    const total = confirmed.length + disputed.length;
    if (total === 0) return '100%';

    const rate = Math.round((confirmed.length / total) * 100);
    return `${rate}%`;
}

/**
 * Resolve disputes using weight-based voting
 *
 * @param {Array} disputes - Disputed findings
 * @param {Object} config - Configuration with weights
 * @returns {Array} Resolved findings with final decisions
 */
function resolveDisputes(disputes, config) {
    const memberWeights = buildWeightMap(config);
    const resolutionStrategy = config.review?.debate?.resolution?.strategy || 'weighted';
    const anonymize = config.review?.debate?.resolution?.anonymize_sources || false;

    return disputes.map(dispute => {
        const resolution = resolutionStrategy === 'chairman'
            ? prepareForChairman(dispute, anonymize)
            : resolveByWeight(dispute, memberWeights);

        return {
            ...dispute,
            resolution
        };
    });
}

/**
 * Resolve a dispute using weight-based voting
 *
 * @param {Object} dispute - Disputed finding
 * @param {Object} memberWeights - Member weight map
 * @returns {Object} Resolution decision
 */
function resolveByWeight(dispute, memberWeights) {
    // Group findings by priority with weighted votes
    const priorityVotes = {};

    for (const finding of dispute.findings) {
        const priority = finding.priority;
        const weight = memberWeights[finding.member] || 1.0;

        if (!priorityVotes[priority]) {
            priorityVotes[priority] = { weight: 0, members: [] };
        }
        priorityVotes[priority].weight += weight;
        priorityVotes[priority].members.push(finding.member);
    }

    // Consider dispute information if available
    for (const d of dispute.disputes || []) {
        if (d.myPriority) {
            const weight = memberWeights[d.disputedBy] || 1.0;
            if (!priorityVotes[d.myPriority]) {
                priorityVotes[d.myPriority] = { weight: 0, members: [] };
            }
            priorityVotes[d.myPriority].weight += weight * 0.5; // Reduced weight for counter-opinion
        }
    }

    // Find highest weighted priority
    // Default to highest priority from findings if no votes (fallback for data errors)
    const defaultPriority = dispute.findings.length > 0
        ? dispute.findings.reduce((best, f) =>
            comparePriority(f.priority, best) < 0 ? f.priority : best, 'P5')
        : 'P3';
    let winningPriority = Object.keys(priorityVotes).length > 0 ? 'P5' : defaultPriority;
    let maxWeight = 0;

    for (const [priority, votes] of Object.entries(priorityVotes)) {
        // Prefer higher priority (P1 > P2) when weights are close
        const effectiveWeight = votes.weight + (5 - parseInt(priority[1])) * 0.1;

        if (effectiveWeight > maxWeight ||
            (effectiveWeight === maxWeight && comparePriority(priority, winningPriority) < 0)) {
            maxWeight = effectiveWeight;
            winningPriority = priority;
        }
    }

    // Security issues default to higher priority when ambiguous
    const isSecurityRelated = dispute.category === 'security' ||
        dispute.findings.some(f => {
            const msg = (f.message || '').toLowerCase();
            return SECURITY_KEYWORDS.some(keyword => msg.includes(keyword));
        });

    if (isSecurityRelated && !isCritical(winningPriority)) {
        // Bump up security issues that aren't already critical
        const priorities = ['P1', 'P2', 'P3', 'P4', 'P5'];
        const currentIdx = priorities.indexOf(winningPriority);
        if (currentIdx > 1) {
            winningPriority = priorities[currentIdx - 1];
        }
    }

    return {
        strategy: 'weighted',
        finalPriority: winningPriority,
        votes: priorityVotes,
        rationale: `Weighted vote: ${Object.entries(priorityVotes)
            .map(([p, v]) => `${p}: ${v.weight.toFixed(1)}`)
            .join(', ')}`
    };
}

/**
 * Prepare dispute for chairman resolution (with anonymization)
 *
 * @param {Object} dispute - Disputed finding
 * @param {boolean} anonymize - Whether to anonymize model names
 * @returns {Object} Prepared dispute for chairman
 */
function prepareForChairman(dispute, anonymize) {
    const modelNames = ['Model A', 'Model B', 'Model C', 'Model D'];
    const memberMap = {};
    let idx = 0;

    // Build anonymization map
    const anonymizeOrKeep = (name) => {
        if (!anonymize) return name;

        if (!memberMap[name]) {
            memberMap[name] = modelNames[idx++] || `Model ${idx}`;
        }
        return memberMap[name];
    };

    // Prepare anonymized opinions
    const opinions = dispute.findings.map(f => ({
        model: anonymizeOrKeep(f.member),
        priority: f.priority,
        reason: f.message
    }));

    // Add dispute counter-opinions
    for (const d of dispute.disputes || []) {
        opinions.push({
            model: anonymizeOrKeep(d.disputedBy),
            priority: d.myPriority,
            reason: d.reason,
            isCounterOpinion: true
        });
    }

    return {
        strategy: 'chairman',
        pendingResolution: true,
        opinions,
        anonymizationMap: anonymize ? memberMap : null
    };
}

/**
 * Apply chairman resolutions to disputed items
 *
 * @param {Array} disputes - Disputed findings with pending resolutions
 * @param {Array} chairmanResolutions - Chairman's decisions
 * @returns {Array} Resolved disputes
 */
function applyChairmanResolutions(disputes, chairmanResolutions) {
    return disputes.map((dispute, idx) => {
        const resolution = chairmanResolutions.find(
            r => r.dispute_id === idx + 1 ||
                 (normalizePath(r.file) === dispute.file && r.line === dispute.line)
        );

        if (resolution) {
            return {
                ...dispute,
                resolution: {
                    strategy: 'chairman',
                    finalPriority: resolution.final_priority || resolution.finalPriority,
                    decision: resolution.decision,
                    rationale: resolution.rationale,
                    evidence: resolution.diff_evidence || resolution.evidence
                }
            };
        }

        // Fallback if chairman didn't resolve this dispute
        return {
            ...dispute,
            resolution: {
                strategy: 'fallback',
                finalPriority: dispute.findings[0]?.priority || 'P3',
                rationale: 'No chairman resolution provided, using first model\'s priority'
            }
        };
    });
}

/**
 * Merge confirmed findings into final comments
 *
 * @param {Array} confirmed - Confirmed consensus findings
 * @returns {Array} Merged comments
 */
function mergeConfirmedFindings(confirmed) {
    return confirmed.map(item => {
        // Use highest priority among findings
        const priorities = item.findings.map(f => f.priority);
        priorities.sort(comparePriority);
        const finalPriority = priorities[0];

        // Collect all messages and pick the best one
        const messages = item.findings.map(f => f.message);
        const bestMessage = messages.reduce((best, msg) =>
            msg.length > best.length ? msg : best, messages[0]);

        // Collect suggestions
        const suggestion = item.findings.find(f => f.suggestion)?.suggestion;

        // Build model perspectives for display (from original findings)
        const modelPerspectives = item.findings.map(f => ({
            model: f.member,
            priority: f.priority,
            reason: f.message,
            role: 'finder'
        }));

        // Add peer agreement reasons from debate if available
        if (item.peerAgreements && item.peerAgreements.length > 0) {
            for (const agreement of item.peerAgreements) {
                // Find if this model already has a perspective
                const existing = modelPerspectives.find(p => p.model === agreement.agreedBy);
                if (existing) {
                    // Finder also reviewed in cross-review — add debate reason
                    if (agreement.reason) {
                        existing.debateReason = agreement.reason;
                        existing.detailedArgument = agreement.reason;
                    }
                    // Save cross-review action for display in peer review section
                    existing.crossReviewAction = agreement.action;
                    if (agreement.suggestedPriority) {
                        existing.suggestedPriority = agreement.suggestedPriority;
                    }
                    if (agreement.originalPriority) {
                        existing.originalPriority = agreement.originalPriority;
                    }
                    if (agreement.confidence) {
                        existing.confidence = agreement.confidence;
                    }
                    if (agreement.evidence) {
                        existing.evidence = agreement.evidence;
                    }
                    if (agreement.additionalContext) {
                        existing.additionalContext = agreement.additionalContext;
                    }
                } else {
                    // Non-finder peer review — add as new perspective
                    modelPerspectives.push({
                        model: agreement.agreedBy,
                        priority: agreement.priority,
                        reason: agreement.reason,
                        role: 'agreed',
                        action: agreement.action || 'AGREE',
                        confidence: agreement.confidence,
                        evidence: agreement.evidence,
                        suggestedPriority: agreement.suggestedPriority,
                        originalPriority: agreement.originalPriority
                    });
                }
            }
        }

        // Select best finding for reasoning (prefer one with reasoning object)
        const bestFinding = selectBestFinding(item.findings);

        return {
            file: item.file,
            line: item.line,
            priority: finalPriority,
            category: item.category,
            message: bestMessage,
            suggestion,
            // Preserve reasoning from best finding
            reasoning: bestFinding.reasoning,
            currentCode: bestFinding.currentCode,
            concern: bestFinding.concern,
            solution: bestFinding.solution,
            benefit: bestFinding.benefit,
            confidence: bestFinding.confidence,
            consensus: item.findings.length,
            sources: item.findings.map(f => f.member),
            debateOutcome: CONSENSUS_TYPE.CONFIRMED,
            modelPerspectives
        };
    });
}

/**
 * Merge unique findings (include if acknowledged or P1-P2)
 *
 * @param {Array} unique - Unique findings
 * @param {Object} config - Configuration
 * @returns {Array} Included unique comments
 */
function mergeUniqueFindings(unique, config) {
    const includeUnacknowledged = config.review?.debate?.include_unacknowledged_unique ?? true;

    return unique
        .filter(item => {
            // Always include acknowledged findings
            if (item.acknowledged) return true;

            // Always include critical findings (P1-P2)
            const priority = item.findings[0]?.priority;
            if (isCritical(priority)) return true;

            // Include based on config
            return includeUnacknowledged;
        })
        .map(item => {
            const finding = item.findings[0];

            // Build model perspectives including peer agreements from debate
            const modelPerspectives = [{
                model: finding.member,
                priority: finding.priority,
                reason: finding.message,
                role: 'finder'
            }];

            // Add peer agreement perspectives (from debate AGREE responses)
            if (item.peerAgreements && item.peerAgreements.length > 0) {
                for (const agreement of item.peerAgreements) {
                    modelPerspectives.push({
                        model: agreement.agreedBy,
                        priority: agreement.myPriority || finding.priority, // Use agreed priority if specified
                        reason: agreement.reason || '동의함',
                        confidence: agreement.confidence,
                        role: 'agreed',
                        // Preserve rich debate fields
                        detailedArgument: agreement.reason,
                        evidence: agreement.evidence,
                        additionalContext: agreement.additionalContext
                    });
                }
            }

            return {
                file: item.file,
                line: item.line,
                priority: finding.priority,
                category: item.category,
                message: finding.message,
                suggestion: finding.suggestion,
                // Preserve reasoning from finding
                reasoning: finding.reasoning,
                currentCode: finding.currentCode,
                concern: finding.concern,
                solution: finding.solution,
                benefit: finding.benefit,
                confidence: finding.confidence,
                consensus: item.acknowledged ? 1 + (item.peerAgreements?.length || 0) : 1,
                sources: item.acknowledged && item.peerAgreements?.length
                    ? [finding.member, ...item.peerAgreements.map(a => a.agreedBy)]
                    : [finding.member],
                debateOutcome: item.consensusType,
                foundBy: finding.member,
                modelPerspectives
            };
        });
}

/**
 * Merge disputed findings after resolution
 *
 * @param {Array} disputed - Resolved disputed findings
 * @returns {Array} Merged comments
 */
function mergeDisputedFindings(disputed) {
    return disputed.map(item => {
        const resolution = item.resolution;
        const finalPriority = resolution?.finalPriority || item.findings[0]?.priority;

        // Collect all messages
        const messages = item.findings.map(f => f.message);
        const bestMessage = messages.reduce((best, msg) =>
            msg.length > best.length ? msg : best, messages[0]);

        // Build model perspectives with their original priorities and roles
        // Role: 'finder' for original discovery, 'disputed' for counter-opinion
        const modelPerspectives = item.findings.map((f, idx) => ({
            model: f.member,
            priority: f.priority,
            reason: f.message,
            role: idx === 0 ? 'finder' : 'finder' // All finders in Pass 1
        }));

        // Add dispute counter-opinions to perspectives with role info
        for (const d of item.disputes || []) {
            const existing = modelPerspectives.find(p => p.model === d.disputedBy);
            if (existing) {
                existing.counterPriority = d.myPriority;
                existing.counterReason = d.reason;
                existing.evidence = d.evidence;
                existing.role = 'disputed'; // Changed role to disputed since they disagreed
                // Preserve detailed argument for rich display
                existing.detailedArgument = d.reason;
                if (d.additionalContext) {
                    existing.additionalContext = d.additionalContext;
                }
            } else {
                // If disputer wasn't in original findings, add them
                modelPerspectives.push({
                    model: d.disputedBy,
                    priority: d.myPriority,
                    reason: d.reason,
                    evidence: d.evidence,
                    role: 'disputed',
                    // Preserve detailed argument
                    detailedArgument: d.reason,
                    additionalContext: d.additionalContext
                });
            }
        }

        // Select best finding for reasoning
        const bestFinding = selectBestFinding(item.findings);

        return {
            file: item.file,
            line: item.line,
            priority: finalPriority,
            category: item.category,
            message: bestMessage,
            suggestion: item.findings.find(f => f.suggestion)?.suggestion,
            // Preserve reasoning from best finding
            reasoning: bestFinding.reasoning,
            currentCode: bestFinding.currentCode,
            concern: bestFinding.concern,
            solution: bestFinding.solution,
            benefit: bestFinding.benefit,
            confidence: bestFinding.confidence,
            consensus: item.findings.length,
            sources: item.findings.map(f => f.member),
            debateOutcome: CONSENSUS_TYPE.DISPUTED,
            modelPerspectives,
            resolution: {
                strategy: resolution?.strategy,
                rationale: resolution?.rationale,
                decision: resolution?.decision, // Winner model name
                evidence: resolution?.evidence
            }
        };
    });
}

/**
 * Build final results from consensus
 *
 * @param {Object} consensus - Consensus result from buildConsensus
 * @param {Object} config - Configuration
 * @returns {Object} Final merged results
 */
function buildFinalResults(consensus, config) {
    // Resolve disputes if not already resolved
    const resolvedDisputed = consensus.disputed[0]?.resolution
        ? consensus.disputed
        : resolveDisputes(consensus.disputed, config);

    // Merge all findings
    const confirmedComments = mergeConfirmedFindings(consensus.confirmed);
    const uniqueComments = mergeUniqueFindings(consensus.unique, config);
    const disputedComments = mergeDisputedFindings(resolvedDisputed);

    // Combine and sort
    const allComments = [...confirmedComments, ...uniqueComments, ...disputedComments];
    allComments.sort((a, b) => comparePriority(a.priority, b.priority));

    // Build debate highlights
    const debateHighlights = buildDebateHighlights(
        confirmedComments,
        disputedComments,
        uniqueComments
    );

    return {
        comments: allComments,
        debateStats: {
            confirmed: consensus.stats.confirmed,
            disputed: consensus.stats.disputed,
            unique: consensus.stats.unique,
            acknowledged: consensus.stats.acknowledged,
            agreementRate: consensus.stats.agreementRate
        },
        debateHighlights
    };
}

/**
 * Build debate highlights for display
 *
 * @param {Array} confirmed - Confirmed comments
 * @param {Array} disputed - Disputed comments
 * @param {Array} unique - Unique comments
 * @returns {Object} Debate highlights
 */
function buildDebateHighlights(confirmed, disputed, unique) {
    // Key consensus: confirmed items sorted by priority
    const keyConsensus = confirmed
        .filter(c => c.consensus >= 2)
        .sort((a, b) => comparePriority(a.priority, b.priority))
        .slice(0, 5)
        .map(c => ({
            file: c.file,
            line: c.line,
            priority: c.priority,
            category: c.category,
            sources: c.sources,
            perspectives: c.modelPerspectives
        }));

    // Resolved disputes: items that had disagreement
    const resolvedDisputes = disputed
        .filter(d => d.resolution?.rationale)
        .map(d => ({
            file: d.file,
            line: d.line,
            priority: d.priority,
            category: d.category,
            perspectives: d.modelPerspectives,
            resolution: d.resolution
        }));

    // Unique contributions by model
    const uniqueByModel = {};
    for (const u of unique) {
        const model = u.foundBy || u.sources?.[0];
        if (model) {
            if (!uniqueByModel[model]) {
                uniqueByModel[model] = [];
            }
            uniqueByModel[model].push({
                file: u.file,
                line: u.line,
                priority: u.priority,
                category: u.category,
                message: u.message
            });
        }
    }

    return {
        keyConsensus,
        resolvedDisputes,
        uniqueByModel
    };
}

// ============================================================================
// Hybrid Voting Functions (Round 1)
// ============================================================================

/**
 * Classify findings by voting for Hybrid architecture
 *
 * Implements 2/3 majority voting:
 * - 3/3 동의 → UNANIMOUS (즉시 확정, 높은 신뢰도)
 * - 2/3 동의 → MAJORITY (즉시 확정, 중간 신뢰도)
 * - 1/3 또는 불일치 → DISPUTED (토론 필요)
 * - 단일 모델 → UNIQUE (검토 필요)
 *
 * @param {Array} pass1Results - Results from Pass 1 (all members)
 * @param {Object} config - Configuration with hybrid settings
 * @returns {Object} Classified findings { confirmed, disputed, unique, stats }
 */
function classifyByVoting(pass1Results, config) {
    const hybridConfig = config.review?.hybrid || {};
    const votingThreshold = hybridConfig.voting_threshold || 0.67;
    const minVoters = hybridConfig.min_voters || 2;
    const totalModels = pass1Results.filter(r => r.parsed).length;

    // Index all findings by location key (file:line:category)
    const findingIndex = {};

    for (const result of pass1Results) {
        if (!result.parsed?.comments) continue;

        for (const comment of result.parsed.comments) {
            const category = comment.category || 'general';
            const normalizedFile = normalizePath(comment.file);
            const key = `${normalizedFile}:${comment.line}:${category}`;

            if (!findingIndex[key]) {
                findingIndex[key] = {
                    key,
                    file: normalizedFile,
                    line: comment.line,
                    category,
                    findings: [],
                    priorities: {},
                    voters: new Set()
                };
            }

            findingIndex[key].findings.push({
                member: result.member,
                priority: comment.priority,
                message: comment.message,
                suggestion: comment.suggestion,
                category,
                // Preserve detailed fields (legacy format)
                currentCode: comment.currentCode,
                concern: comment.concern,
                solution: comment.solution,
                benefit: comment.benefit,
                // Preserve reasoning object (new 5-step format)
                reasoning: comment.reasoning,
                confidence: comment.confidence
            });

            findingIndex[key].voters.add(result.member);

            // Track priority votes
            const priority = comment.priority;
            if (!findingIndex[key].priorities[priority]) {
                findingIndex[key].priorities[priority] = [];
            }
            findingIndex[key].priorities[priority].push(result.member);
        }
    }

    // Classify each finding by voting result
    const confirmed = [];   // UNANIMOUS or MAJORITY
    const disputed = [];    // Priority disagreement
    const unique = [];      // Single model finding

    for (const [key, item] of Object.entries(findingIndex)) {
        const voterCount = item.voters.size;
        const votingRatio = voterCount / totalModels;

        if (voterCount === 1) {
            // Single model found this - UNIQUE
            unique.push({
                ...item,
                votingResult: VOTING_RESULT.UNIQUE,
                confidence: CONFIDENCE_BADGES.unique,
                voterCount,
                totalModels,
                foundBy: item.findings[0].member
            });
        } else if (voterCount >= minVoters && votingRatio >= votingThreshold) {
            // Check if priority agrees
            const priorityVotes = Object.entries(item.priorities);
            const dominantPriority = getDominantPriority(priorityVotes, voterCount);

            if (dominantPriority.agreementRatio >= votingThreshold) {
                // Priority agreement - CONFIRMED
                const isUnanimous = voterCount === totalModels &&
                                   dominantPriority.agreementRatio === 1;

                confirmed.push({
                    ...item,
                    votingResult: isUnanimous ? VOTING_RESULT.UNANIMOUS : VOTING_RESULT.MAJORITY,
                    confidence: isUnanimous ? CONFIDENCE_BADGES.unanimous : CONFIDENCE_BADGES.majority,
                    consensusPriority: dominantPriority.priority,
                    voterCount,
                    totalModels,
                    agreementRatio: dominantPriority.agreementRatio
                });
            } else {
                // Priority disagreement - DISPUTED (needs debate)
                disputed.push({
                    ...item,
                    votingResult: VOTING_RESULT.DISPUTED,
                    confidence: CONFIDENCE_BADGES.disputed,
                    priorityVotes: item.priorities,
                    voterCount,
                    totalModels,
                    needsDebate: true
                });
            }
        } else {
            // Not enough votes - treat as disputed
            disputed.push({
                ...item,
                votingResult: VOTING_RESULT.DISPUTED,
                confidence: CONFIDENCE_BADGES.disputed,
                voterCount,
                totalModels,
                needsDebate: true,
                reason: 'insufficient_votes'
            });
        }
    }

    // Calculate stats
    const stats = {
        totalFindings: Object.keys(findingIndex).length,
        confirmed: confirmed.length,
        disputed: disputed.length,
        unique: unique.length,
        unanimousCount: confirmed.filter(c => c.votingResult === VOTING_RESULT.UNANIMOUS).length,
        majorityCount: confirmed.filter(c => c.votingResult === VOTING_RESULT.MAJORITY).length,
        agreementRate: calculateVotingAgreementRate(confirmed, disputed),
        debateReduction: calculateDebateReduction(confirmed, disputed, unique)
    };

    return {
        confirmed,
        disputed,
        unique,
        stats,
        votingConfig: {
            threshold: votingThreshold,
            minVoters,
            totalModels
        }
    };
}

/**
 * Get dominant priority from votes
 *
 * @param {Array} priorityVotes - Array of [priority, voters] pairs
 * @param {number} totalVoters - Total number of voters
 * @returns {Object} { priority, count, agreementRatio }
 */
function getDominantPriority(priorityVotes, totalVoters) {
    if (priorityVotes.length === 0) {
        return { priority: 'P3', count: 0, agreementRatio: 0 };
    }

    // Sort by count (descending), then by priority (ascending for tie-break)
    const sorted = priorityVotes.sort((a, b) => {
        const countDiff = b[1].length - a[1].length;
        if (countDiff !== 0) return countDiff;
        // Tie-break: prefer higher priority (P1 > P2)
        return comparePriority(a[0], b[0]);
    });

    const [dominantPriority, voters] = sorted[0];
    return {
        priority: dominantPriority,
        count: voters.length,
        agreementRatio: voters.length / totalVoters,
        voters
    };
}

/**
 * Calculate voting agreement rate
 *
 * @param {Array} confirmed - Confirmed findings
 * @param {Array} disputed - Disputed findings
 * @returns {string} Agreement rate as percentage
 */
function calculateVotingAgreementRate(confirmed, disputed) {
    const total = confirmed.length + disputed.length;
    if (total === 0) return '100%';

    const rate = Math.round((confirmed.length / total) * 100);
    return `${rate}%`;
}

/**
 * Calculate debate reduction percentage
 *
 * Measures how much debate is reduced by Hybrid voting:
 * - Full debate: all findings would be debated
 * - Hybrid: only disputed findings need debate
 *
 * @param {Array} confirmed - Confirmed (no debate needed)
 * @param {Array} disputed - Disputed (debate needed)
 * @param {Array} unique - Unique (no debate possible)
 * @returns {string} Reduction percentage
 */
function calculateDebateReduction(confirmed, disputed, unique) {
    const total = confirmed.length + disputed.length + unique.length;
    if (total === 0) return '0%';

    // In full debate mode, all multi-model findings would be debated
    const wouldDebate = confirmed.length + disputed.length;
    if (wouldDebate === 0) return '100%';

    // In hybrid mode, only disputed are debated
    const reduction = Math.round(((wouldDebate - disputed.length) / wouldDebate) * 100);
    return `${reduction}%`;
}

/**
 * Filter findings for debate based on voting results
 *
 * Only returns findings that need debate (DISPUTED status).
 * Confirmed (UNANIMOUS/MAJORITY) and UNIQUE are excluded.
 *
 * @param {Object} votingResults - Results from classifyByVoting
 * @param {Object} config - Configuration
 * @returns {Array} Findings that need debate
 */
function filterFindingsForHybridDebate(votingResults, config) {
    const { disputed } = votingResults;

    // Apply additional filters if configured
    const scopePriorities = config.review?.debate?.scope?.priorities || ['P1', 'P2', 'P3'];

    return disputed.filter(item => {
        // Check if any finding has a priority in scope
        return item.findings.some(f => scopePriorities.includes(f.priority));
    });
}

/**
 * Merge voting results into final output format
 *
 * @param {Object} votingResults - Results from classifyByVoting
 * @param {Object} config - Configuration
 * @returns {Array} Merged comments ready for output
 */
function mergeVotingResults(votingResults, config) {
    const { confirmed, disputed, unique } = votingResults;
    const comments = [];

    // Process confirmed findings
    for (const item of confirmed) {
        const bestFinding = selectBestFinding(item.findings);
        comments.push({
            file: item.file,
            line: item.line,
            priority: item.consensusPriority || bestFinding.priority,
            category: item.category,
            message: bestFinding.message,
            suggestion: bestFinding.suggestion,
            // Legacy detailed fields
            currentCode: bestFinding.currentCode,
            concern: bestFinding.concern,
            solution: bestFinding.solution,
            benefit: bestFinding.benefit,
            // New reasoning object (5-step format)
            reasoning: bestFinding.reasoning,
            consensus: item.voterCount,
            sources: [...item.voters],
            votingResult: item.votingResult,
            confidence: bestFinding.confidence || item.confidence,
            debateOutcome: CONSENSUS_TYPE.CONFIRMED,
            modelPerspectives: item.findings.map(f => ({
                model: f.member,
                priority: f.priority,
                reason: f.message,
                role: 'finder'
            }))
        });
    }

    // Process disputed findings (will be resolved by debate or chairman)
    for (const item of disputed) {
        const bestFinding = selectBestFinding(item.findings);
        comments.push({
            file: item.file,
            line: item.line,
            priority: bestFinding.priority,
            category: item.category,
            message: bestFinding.message,
            suggestion: bestFinding.suggestion,
            // Legacy detailed fields
            currentCode: bestFinding.currentCode,
            concern: bestFinding.concern,
            solution: bestFinding.solution,
            benefit: bestFinding.benefit,
            // New reasoning object (5-step format)
            reasoning: bestFinding.reasoning,
            consensus: item.voterCount,
            sources: [...item.voters],
            votingResult: item.votingResult,
            confidence: bestFinding.confidence || item.confidence,
            debateOutcome: CONSENSUS_TYPE.DISPUTED,
            needsDebate: true,
            priorityVotes: item.priorityVotes,
            modelPerspectives: item.findings.map(f => ({
                model: f.member,
                priority: f.priority,
                reason: f.message,
                role: 'finder'
            }))
        });
    }

    // Process unique findings
    for (const item of unique) {
        const finding = item.findings[0];
        comments.push({
            file: item.file,
            line: item.line,
            priority: finding.priority,
            category: item.category,
            message: finding.message,
            suggestion: finding.suggestion,
            // Legacy detailed fields
            currentCode: finding.currentCode,
            concern: finding.concern,
            solution: finding.solution,
            benefit: finding.benefit,
            // New reasoning object (5-step format)
            reasoning: finding.reasoning,
            consensus: 1,
            sources: [finding.member],
            votingResult: item.votingResult,
            confidence: finding.confidence || item.confidence,
            debateOutcome: CONSENSUS_TYPE.UNIQUE,
            foundBy: finding.member,
            modelPerspectives: [{
                model: finding.member,
                priority: finding.priority,
                reason: finding.message,
                role: 'finder'
            }]
        });
    }

    // Sort by priority
    comments.sort((a, b) => comparePriority(a.priority, b.priority));

    return comments;
}

/**
 * Select best finding from multiple model findings
 *
 * Criteria:
 * 1. Highest priority
 * 2. Longest message (more detailed)
 * 3. Has suggestion
 *
 * @param {Array} findings - Findings from multiple models
 * @returns {Object} Best finding
 */
function selectBestFinding(findings) {
    if (findings.length === 0) return {};
    if (findings.length === 1) return findings[0];

    return findings.reduce((best, current) => {
        // Prefer higher priority
        if (comparePriority(current.priority, best.priority) < 0) {
            return current;
        }
        if (comparePriority(current.priority, best.priority) > 0) {
            return best;
        }

        // Prefer finding with reasoning object (5-step analysis)
        const currentHasReasoning = !!current.reasoning;
        const bestHasReasoning = !!best.reasoning;
        if (currentHasReasoning && !bestHasReasoning) return current;
        if (!currentHasReasoning && bestHasReasoning) return best;

        // Same priority - prefer longer/more detailed content
        const reasoningLen = (r) => r ? (
            (r.currentCode || '').length +
            (r.rootCause || '').length +
            (r.impact || '').length +
            (r.solution || '').length +
            (r.benefit || '').length
        ) : 0;

        const currentLen = (current.message || '').length +
                          (current.concern || '').length +
                          (current.solution || '').length +
                          reasoningLen(current.reasoning);
        const bestLen = (best.message || '').length +
                       (best.concern || '').length +
                       (best.solution || '').length +
                       reasoningLen(best.reasoning);

        if (currentLen > bestLen) return current;
        if (currentLen < bestLen) return best;

        // Prefer one with suggestion
        if (current.suggestion && !best.suggestion) return current;

        return best;
    });
}

// ============================================================================
// Cross-Review Validation Functions
// ============================================================================

/**
 * Calculate validation scores from cross-review responses
 *
 * Processes AGREE/IGNORE/PRIORITY_ADJUST votes from all reviewers
 * and computes a validation score for each finding.
 *
 * @param {Array} crossReviewResponses - Responses from cross-review pass
 * @param {Array} pass1Results - Original findings from Pass 1
 * @param {Object} config - Configuration
 * @returns {Object} Validation scores by finding key
 */
function calculateValidationScores(crossReviewResponses, pass1Results, config) {
    const validationScores = {};
    const successfulReviewers = crossReviewResponses.filter(r => r.parsed && !r.parsed.error);
    const requireAllVotes = config?.review?.cross_review?.require_all_votes === true;

    // Index only cross-review scope findings from Pass 1 (P1-P3 by default)
    const scopePriorities = config?.review?.cross_review?.scope?.priorities || ['P1', 'P2', 'P3'];
    const findingIndex = {};
    for (const result of pass1Results) {
        if (!result.parsed?.comments) continue;

        for (const comment of result.parsed.comments) {
            if (!scopePriorities.includes(comment.priority)) continue;
            const category = comment.category || 'general';
            const normalizedFile = normalizePath(comment.file);
            const key = `${result.member}_${normalizedFile}:${comment.line}:${category}`;

            findingIndex[key] = {
                key,
                member: result.member,
                file: normalizedFile,
                line: comment.line,
                priority: comment.priority,
                category,
                message: comment.message,
                votes: {
                    agree: [],
                    ignore: [],
                    priorityAdjust: []
                }
            };
        }
    }

    // Process cross-review votes
    for (const response of crossReviewResponses) {
        if (!response.parsed?.crossReviewVotes) continue;

        const reviewer = response.member;

        for (const vote of response.parsed.crossReviewVotes) {
            const findingId = vote.findingId;
            if (!findingIndex[findingId]) continue;

            const finding = findingIndex[findingId];
            const voteData = {
                reviewer,
                reason: vote.reason,
                confidence: vote.confidence,
                evidence: vote.evidence
            };

            switch (vote.action) {
                case 'AGREE':
                    finding.votes.agree.push(voteData);
                    break;
                case 'IGNORE':
                    finding.votes.ignore.push(voteData);
                    break;
                case 'PRIORITY_ADJUST':
                    finding.votes.priorityAdjust.push({
                        ...voteData,
                        originalPriority: vote.originalPriority,
                        suggestedPriority: vote.suggestedPriority
                    });
                    break;
            }
        }
    }

    // Calculate validation score for each finding
    for (const [key, finding] of Object.entries(findingIndex)) {
        const agreeCount = finding.votes.agree.length;
        const ignoreCount = finding.votes.ignore.length;
        const adjustCount = finding.votes.priorityAdjust.length;
        const explicitVotes = agreeCount + ignoreCount + adjustCount;

        // Per-finding potential reviewers (exclude the finder from successful reviewers)
        const potentialReviewers = successfulReviewers
            .filter(r => r.member !== finding.member)
            .length;
        const denominator = requireAllVotes
            ? potentialReviewers
            : (explicitVotes > 0 ? explicitVotes : potentialReviewers);
        const missingVotes = Math.max(0, potentialReviewers - explicitVotes);

        // Agreement includes AGREE and PRIORITY_ADJUST (they agree issue exists)
        const positiveVotes = agreeCount + adjustCount;
        const validationRatio = denominator > 0
            ? positiveVotes / denominator
            : 0;

        // Determine validation badge
        let validationBadge;
        if (validationRatio >= 1.0) {
            validationBadge = VALIDATION_BADGES.full;
        } else if (validationRatio >= 0.67) {
            validationBadge = VALIDATION_BADGES.majority;
        } else if (validationRatio >= 0.34) {
            validationBadge = VALIDATION_BADGES.partial;
        } else {
            validationBadge = VALIDATION_BADGES.single;
        }

        validationScores[key] = {
            findingKey: key,
            finder: finding.member,
            agreeCount,
            ignoreCount,
            adjustCount,
            missingVotes,
            totalReviewers: potentialReviewers,
            explicitVotes,
            requireAllVotes,
            validationRatio,
            validationScore: Math.round(validationRatio * 100),
            validationBadge,
            peerReviews: [
                ...finding.votes.agree.map(v => ({ ...v, action: 'AGREE' })),
                ...finding.votes.ignore.map(v => ({ ...v, action: 'IGNORE' })),
                ...finding.votes.priorityAdjust.map(v => ({ ...v, action: 'PRIORITY_ADJUST' }))
            ]
        };
    }

    return validationScores;
}

/**
 * Merge unique findings with validation information
 *
 * Enhanced version of mergeUniqueFindings that includes
 * cross-review validation data.
 *
 * @param {Array} unique - Unique findings
 * @param {Object} validationScores - Validation scores from calculateValidationScores
 * @param {Object} config - Configuration
 * @returns {Array} Merged unique comments with validation
 */
function mergeUniqueFindingsWithValidation(unique, validationScores, config) {
    const includeUnacknowledged = config.review?.debate?.include_unacknowledged_unique ?? true;
    const validationThreshold = config.review?.cross_review?.validation_threshold ?? 0.67;

    return unique
        .filter(item => {
            const finding = item.findings[0];
            const category = item.category || 'general';
            const normalizedFile = normalizePath(item.file);
            const key = `${finding.member}_${normalizedFile}:${item.line}:${category}`;
            const validation = validationScores[key];

            // Always include if validation score meets threshold
            if (validation && validation.validationRatio >= validationThreshold) {
                return true;
            }

            // Always include acknowledged findings
            if (item.acknowledged) return true;

            // Always include critical findings (P1-P2)
            const priority = finding?.priority;
            if (priority === 'P1' || priority === 'P2') return true;

            // Include based on config
            return includeUnacknowledged;
        })
        .map(item => {
            const finding = item.findings[0];
            const category = item.category || 'general';
            const normalizedFile = normalizePath(item.file);
            const key = `${finding.member}_${normalizedFile}:${item.line}:${category}`;
            const validation = validationScores[key];

            // Build model perspectives including peer reviews from cross-review
            const modelPerspectives = [{
                model: finding.member,
                priority: finding.priority,
                reason: finding.message,
                role: 'finder'
            }];

            // Add peer review perspectives from cross-review
            if (validation?.peerReviews) {
                for (const review of validation.peerReviews) {
                    if (review.action === 'AGREE') {
                        modelPerspectives.push({
                            model: review.reviewer,
                            priority: finding.priority,
                            reason: review.reason || '동의함',
                            confidence: review.confidence,
                            role: 'agreed',
                            action: 'AGREE'
                        });
                    } else if (review.action === 'IGNORE') {
                        modelPerspectives.push({
                            model: review.reviewer,
                            reason: review.reason,
                            evidence: review.evidence,
                            role: 'ignored',
                            action: 'IGNORE'
                        });
                    } else if (review.action === 'PRIORITY_ADJUST') {
                        modelPerspectives.push({
                            model: review.reviewer,
                            priority: review.suggestedPriority,
                            originalPriority: review.originalPriority,
                            reason: review.reason,
                            role: 'adjusted',
                            action: 'PRIORITY_ADJUST'
                        });
                    }
                }
            }

            // Determine final consensus count based on validation
            const agreedCount = validation
                ? validation.agreeCount + validation.adjustCount
                : 0;
            const finalConsensus = 1 + agreedCount; // finder + agreed reviewers

            // Upgrade debateOutcome to confirmed when validation passes threshold
            const validatedByPeers = validation && validation.validationRatio >= validationThreshold;

            return {
                file: item.file,
                line: item.line,
                priority: finding.priority,
                category: item.category,
                message: finding.message,
                suggestion: finding.suggestion,
                // Preserve reasoning from finding
                reasoning: finding.reasoning,
                currentCode: finding.currentCode,
                concern: finding.concern,
                solution: finding.solution,
                benefit: finding.benefit,
                confidence: finding.confidence,
                consensus: finalConsensus,
                sources: validation
                    ? [finding.member, ...validation.peerReviews
                        .filter(r => r.action === 'AGREE' || r.action === 'PRIORITY_ADJUST')
                        .map(r => r.reviewer)]
                    : [finding.member],
                debateOutcome: validatedByPeers
                    ? CONSENSUS_TYPE.CONFIRMED
                    : item.consensusType,
                crossReviewValidated: validatedByPeers || false,
                foundBy: finding.member,
                modelPerspectives,
                // Cross-review validation info
                validation: validation ? {
                    score: validation.validationScore,
                    badge: validation.validationBadge,
                    agreeCount: validation.agreeCount,
                    ignoreCount: validation.ignoreCount,
                    adjustCount: validation.adjustCount,
                    totalReviewers: validation.totalReviewers
                } : null
            };
        });
}

/**
 * Deduplicate semantically similar findings on nearby lines.
 *
 * When Chairman is unavailable (fallback merge), the same conceptual issue
 * may appear as multiple entries because models report it with different
 * categories (security vs quality) or slightly different line numbers.
 *
 * Heuristic: same file, within ±5 lines, ≥40% code-identifier overlap
 * → absorb the lower-priority duplicate into the higher-priority one.
 *
 * @param {Array} comments - All merged comments
 * @returns {Array} Deduplicated comments
 */
function deduplicateNearbyFindings(comments) {
    if (comments.length <= 1) return comments;

    const LINE_PROXIMITY = 5;
    const OVERLAP_THRESHOLD = 0.4;

    // Extract English code identifiers (variable names, types, fields)
    const extractCodeIds = (text) => {
        if (!text) return new Set();
        const matches = text.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
        const stopWords = new Set([
            'the', 'and', 'for', 'are', 'that', 'this', 'with', 'from',
            'has', 'have', 'not', 'was', 'were', 'but', 'can', 'will',
            'class', 'def', 'return', 'import', 'None', 'True', 'False',
            'if', 'else', 'elif', 'or', 'in', 'is', 'str', 'int', 'bool',
            'null', 'undefined', 'const', 'let', 'var', 'function', 'async'
        ]);
        return new Set(
            matches
                .filter(m => m.length >= 3 && !stopWords.has(m))
                .map(m => m.toLowerCase())
        );
    };

    // min-set overlap: intersection / min(|A|, |B|)
    const minSetOverlap = (setA, setB) => {
        if (setA.size === 0 || setB.size === 0) return 0;
        const intersection = [...setA].filter(x => setB.has(x)).length;
        return intersection / Math.min(setA.size, setB.size);
    };

    // Group by file
    const byFile = new Map();
    for (let i = 0; i < comments.length; i++) {
        const file = normalizePath(comments[i].file);
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file).push(i);
    }

    const absorbed = new Set();

    for (const [, indices] of byFile) {
        // Sort by line for efficient proximity check
        indices.sort((a, b) => (comments[a].line || 0) - (comments[b].line || 0));

        for (let i = 0; i < indices.length; i++) {
            if (absorbed.has(indices[i])) continue;
            const a = comments[indices[i]];
            const aIds = extractCodeIds(
                (a.message || '') + ' ' + (a.suggestion || '')
            );

            for (let j = i + 1; j < indices.length; j++) {
                if (absorbed.has(indices[j])) continue;
                const b = comments[indices[j]];

                const lineDiff = Math.abs((a.line || 0) - (b.line || 0));
                if (lineDiff > LINE_PROXIMITY) break; // sorted, no more nearby

                const bIds = extractCodeIds(
                    (b.message || '') + ' ' + (b.suggestion || '')
                );
                const overlap = minSetOverlap(aIds, bIds);

                // Same category on adjacent lines is a strong dedup signal,
                // especially for Korean-language messages with few English identifiers.
                const sameCategory = (a.category || 'general') === (b.category || 'general');
                const effectiveThreshold = sameCategory ? 0.15 : OVERLAP_THRESHOLD;

                if (overlap >= effectiveThreshold) {
                    // Absorb b into a: keep higher priority, longer message
                    if (comparePriority(b.priority, a.priority) < 0) {
                        a.priority = b.priority;
                    }
                    if ((b.message || '').length > (a.message || '').length) {
                        a.message = b.message;
                    }
                    // Merge categories
                    if (a.category !== b.category) {
                        a.mergedCategories = [
                            ...new Set([a.category, b.category, ...(a.mergedCategories || [])])
                        ];
                    }
                    // Preserve reasoning/solution from richer finding
                    if (!a.reasoning && b.reasoning) {
                        a.reasoning = b.reasoning;
                        a.currentCode = a.currentCode || b.currentCode;
                        a.concern = a.concern || b.concern;
                        a.solution = a.solution || b.solution;
                        a.benefit = a.benefit || b.benefit;
                    }
                    // Track dedup
                    if (!a.deduplicatedFrom) a.deduplicatedFrom = [];
                    a.deduplicatedFrom.push({
                        priority: b.priority,
                        category: b.category,
                        message: (b.message || '').slice(0, 80)
                    });
                    absorbed.add(indices[j]);
                }
            }
        }
    }

    const result = comments.filter((_, i) => !absorbed.has(i));

    if (absorbed.size > 0) {
        console.error(
            `Dedup: absorbed ${absorbed.size} duplicate finding(s), ` +
            `${comments.length} → ${result.length}`
        );
    }

    return result;
}

/**
 * Build final results with cross-review validation
 *
 * Enhanced version of buildFinalResults that incorporates
 * cross-review validation scores.
 *
 * @param {Object} consensus - Consensus result from buildConsensus
 * @param {Object} validationScores - Validation scores from calculateValidationScores
 * @param {Object} config - Configuration
 * @returns {Object} Final merged results with validation
 */
function buildFinalResultsWithValidation(consensus, validationScores, config) {
    // Resolve disputes if not already resolved
    const resolvedDisputed = consensus.disputed[0]?.resolution
        ? consensus.disputed
        : resolveDisputes(consensus.disputed, config);

    // Merge all findings with validation
    const confirmedComments = mergeConfirmedFindingsWithValidation(
        consensus.confirmed,
        validationScores
    );
    const uniqueComments = mergeUniqueFindingsWithValidation(
        consensus.unique,
        validationScores,
        config
    );
    const disputedComments = mergeDisputedFindingsWithValidation(
        resolvedDisputed,
        validationScores
    );

    // Combine, deduplicate nearby similar findings, and sort
    let allComments = [...confirmedComments, ...uniqueComments, ...disputedComments];
    allComments = deduplicateNearbyFindings(allComments);
    allComments.sort((a, b) => comparePriority(a.priority, b.priority));

    // Build debate highlights
    const debateHighlights = buildDebateHighlights(
        confirmedComments,
        disputedComments,
        uniqueComments
    );

    // Calculate cross-review stats
    const crossReviewStats = calculateCrossReviewStats(validationScores);

    return {
        comments: allComments,
        debateStats: {
            confirmed: consensus.stats.confirmed,
            disputed: consensus.stats.disputed,
            unique: consensus.stats.unique,
            acknowledged: consensus.stats.acknowledged,
            agreementRate: consensus.stats.agreementRate
        },
        crossReviewStats,
        debateHighlights
    };
}

/**
 * Merge confirmed findings with validation info
 *
 * @param {Array} confirmed - Confirmed consensus findings
 * @param {Object} validationScores - Validation scores
 * @returns {Array} Merged comments with validation
 */
function mergeConfirmedFindingsWithValidation(confirmed, validationScores) {
    const baseResults = mergeConfirmedFindings(confirmed);

    return baseResults.map(comment => {
        // Find validation for this finding (using normalized paths)
        const normalizedFile = normalizePath(comment.file);
        const key = comment.sources.map(s => {
            const category = comment.category || 'general';
            return `${s}_${normalizedFile}:${comment.line}:${category}`;
        }).find(k => validationScores[k]);

        const validation = key ? validationScores[key] : null;
        const validatedByPeers = validation && validation.validationRatio >= 0.67;

        // Enrich modelPerspectives with cross-review peer reviews
        if (validation?.peerReviews && comment.modelPerspectives) {
            for (const review of validation.peerReviews) {
                // Check if reviewer is already a finder (confirmed finding case)
                const existingFinder = comment.modelPerspectives.find(
                    p => p.model === review.reviewer && p.role === 'finder'
                );
                if (existingFinder) {
                    // Finder also cross-reviewed — enrich existing perspective
                    existingFinder.debateReason = review.reason || '동의함';
                    existingFinder.crossReviewAction = review.action;
                    if (review.suggestedPriority) {
                        existingFinder.suggestedPriority = review.suggestedPriority;
                    }
                    if (review.originalPriority) {
                        existingFinder.originalPriority = review.originalPriority;
                    }
                    if (review.confidence) {
                        existingFinder.confidence = review.confidence;
                    }
                    if (review.evidence) {
                        existingFinder.evidence = review.evidence;
                    }
                } else if (review.action === 'AGREE') {
                    comment.modelPerspectives.push({
                        model: review.reviewer,
                        priority: comment.priority,
                        reason: review.reason || '동의함',
                        confidence: review.confidence,
                        role: 'agreed',
                        action: 'AGREE'
                    });
                } else if (review.action === 'IGNORE') {
                    comment.modelPerspectives.push({
                        model: review.reviewer,
                        reason: review.reason,
                        evidence: review.evidence,
                        role: 'ignored',
                        action: 'IGNORE'
                    });
                } else if (review.action === 'PRIORITY_ADJUST') {
                    comment.modelPerspectives.push({
                        model: review.reviewer,
                        priority: review.suggestedPriority,
                        originalPriority: review.originalPriority,
                        reason: review.reason,
                        role: 'adjusted',
                        action: 'PRIORITY_ADJUST'
                    });
                }
            }
        }

        return {
            ...comment,
            validation: validation ? {
                score: validation.validationScore,
                badge: validation.validationBadge,
                agreeCount: validation.agreeCount,
                ignoreCount: validation.ignoreCount,
                adjustCount: validation.adjustCount,
                totalReviewers: validation.totalReviewers
            } : null,
            crossReviewValidated: validatedByPeers || false
        };
    });
}

/**
 * Merge disputed findings with validation info
 *
 * @param {Array} disputed - Disputed findings
 * @param {Object} validationScores - Validation scores
 * @returns {Array} Merged comments with validation
 */
function mergeDisputedFindingsWithValidation(disputed, validationScores) {
    const baseResults = mergeDisputedFindings(disputed);

    return baseResults.map(comment => {
        // Find validation for this finding (using normalized paths)
        const normalizedFile = normalizePath(comment.file);
        const key = comment.sources.map(s => {
            const category = comment.category || 'general';
            return `${s}_${normalizedFile}:${comment.line}:${category}`;
        }).find(k => validationScores[k]);

        const validation = key ? validationScores[key] : null;

        return {
            ...comment,
            validation: validation ? {
                score: validation.validationScore,
                badge: validation.validationBadge,
                agreeCount: validation.agreeCount,
                ignoreCount: validation.ignoreCount,
                adjustCount: validation.adjustCount,
                totalReviewers: validation.totalReviewers
            } : null
        };
    });
}

/**
 * Calculate cross-review statistics
 *
 * @param {Object} validationScores - Validation scores
 * @returns {Object} Cross-review statistics
 */
function calculateCrossReviewStats(validationScores) {
    const scores = Object.values(validationScores);

    if (scores.length === 0) {
        return {
            totalFindings: 0,
            validated: 0,
            ignored: 0,
            averageValidationScore: 0
        };
    }

    const validated = scores.filter(s => s.validationRatio >= 0.67).length;
    const ignored = scores.filter(s => s.ignoreCount > s.agreeCount).length;
    const avgScore = scores.reduce((sum, s) => sum + s.validationScore, 0) / scores.length;

    return {
        totalFindings: scores.length,
        validated,
        ignored,
        averageValidationScore: Math.round(avgScore)
    };
}

module.exports = {
    CONSENSUS_TYPE,
    VOTING_RESULT,
    CONFIDENCE_BADGES,
    VALIDATION_BADGES,
    buildConsensus,
    classifyByVoting,
    filterFindingsForHybridDebate,
    mergeVotingResults,
    resolveDisputes,
    applyChairmanResolutions,
    mergeConfirmedFindings,
    mergeUniqueFindings,
    mergeDisputedFindings,
    buildFinalResults,
    buildWeightMap,
    prepareForChairman,
    buildDebateHighlights,
    // Cross-review functions
    calculateValidationScores,
    mergeUniqueFindingsWithValidation,
    buildFinalResultsWithValidation,
    calculateCrossReviewStats,
    deduplicateNearbyFindings
};
