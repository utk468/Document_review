/**
 * SERVICE 2: Anti-Hallucination Substring Validator (The Verbatim Choke Point)
 * 
 * Guarantees:
 * 1. Verifies rule_id exists in the authorized rules registry.
 * 2. Verifies passage exists VERBATIM as a substring in the document text.
 * 3. Computes exact character offsets { start: X, end: Y } for UI highlight rendering.
 * 4. Automatically DISCARDS any hallucinated or ungrounded flags.
 */

import rulesData from '../rules/complianceRules.json' with { type: 'json' };

const activeRuleMap = new Map(rulesData.map(r => [r.rule_id, r]));

/**
 * Validate a candidate flag against source document text and rule database.
 * 
 * @param {Object} flag - { rule_id, passage, reason, severity }
 * @param {string} documentText - The reference document text
 * @returns {Object} { isValid: boolean, validatedFlag?: Object, discardReason?: string }
 */
export function validateFlag(flag, documentText) {
  if (!flag || !flag.passage || !flag.rule_id) {
    return {
      isValid: false,
      discardReason: 'Malformed flag: missing rule_id or passage'
    };
  }

  // 1. Verify Rule ID exists in active system rule database
  const rule = activeRuleMap.get(flag.rule_id);
  if (!rule) {
    return {
      isValid: false,
      discardReason: `Hallucinated rule ID: "${flag.rule_id}" does not exist in compliance rules registry`
    };
  }

  const cleanPassage = flag.passage.trim();

  // 2. Anti-Hallucination Substring Check: Must be 100% verbatim in source text
  const startIndex = documentText.indexOf(cleanPassage);

  if (startIndex === -1) {
    return {
      isValid: false,
      discardReason: `Hallucinated quote: Passage "${cleanPassage}" not found verbatim in source document`
    };
  }

  const endIndex = startIndex + cleanPassage.length;

  // 3. Return grounded validated flag with verified character offsets
  return {
    isValid: true,
    validatedFlag: {
      flag_id: `FLAG-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      rule_id: flag.rule_id,
      rule_name: rule.name,
      regulatory_body: rule.regulatory_body,
      severity: flag.severity || rule.severity,
      passage: cleanPassage,
      reason: flag.reason || rule.description,
      offsets: {
        start: startIndex,
        end: endIndex
      },
      char_length: cleanPassage.length,
      grounded_status: 'VERBATIM_VERIFIED',
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Batch filter flags through anti-hallucination choke point
 * Discards ungrounded flags and records audit log
 */
export function filterAndGroundFlags(rawFlags, documentText) {
  const verifiedFlags = [];
  const discardedFlags = [];

  for (const raw of rawFlags) {
    const result = validateFlag(raw, documentText);
    if (result.isValid) {
      verifiedFlags.push(result.validatedFlag);
    } else {
      discardedFlags.push({
        candidate: raw,
        discardReason: result.discardReason,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Sort verified flags by start offset for sequential UI rendering
  verifiedFlags.sort((a, b) => a.offsets.start - b.offsets.start);

  return {
    verifiedFlags,
    discardedFlags,
    totalEvaluated: rawFlags.length,
    groundedRate: rawFlags.length > 0 ? (verifiedFlags.length / rawFlags.length) : 1.0
  };
}
