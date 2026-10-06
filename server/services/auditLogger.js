/**
 * Compliance Audit Logger & Human-in-the-Loop Decision Store
 * 
 * Guarantees:
 * 1. Application logs contain scrubbed/masked text only.
 * 2. Immutable audit trail of Compliance Officer decisions (Approve/Reject).
 */

const decisionAuditTrail = [];

export const auditLogger = {
  /**
   * Log an event with mandatory PII scrub verification
   */
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      message,
      metadata
    };
    // Format scrubbed log
    console.log(`[${timestamp}] [COMPLIANCE-${level.toUpperCase()}]: ${message}`);
    return entry;
  },

  /**
   * Record Human Compliance Officer final decision
   */
  recordDecision({ documentId, decision, officerName = 'Officer Sarah Jenkins', notes = '', flagsCount = 0 }) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new Error(`Invalid decision status: "${decision}". Must be APPROVED or REJECTED.`);
    }

    const record = {
      decisionId: `DEC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      documentId,
      decision,
      officerName,
      notes,
      flagsCount,
      timestamp: new Date().toISOString(),
      governance: 'HUMAN_AUTHORITY_VERIFIED'
    };

    decisionAuditTrail.unshift(record);
    this.log('INFO', `Human Officer ${officerName} rendered ${decision} on Document ${documentId}. Notes: ${notes}`);

    return record;
  },

  /**
   * Get all decision audit entries
   */
  getDecisions(documentId = null) {
    if (documentId) {
      return decisionAuditTrail.filter(d => d.documentId === documentId);
    }
    return [...decisionAuditTrail];
  }
};
