/**
 * SERVICE 2 TEST SUITE: Compliance Inspection & Anti-Hallucination Substring Validator
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFlag, filterAndGroundFlags } from '../server/services/substringValidator.js';
import { sectionDocument } from '../server/services/documentSectioner.js';
import { inspectDocument } from '../server/services/inspectionAgent.js';

describe('Service 2: AI Compliance Inspection & Anti-Hallucination Validator', () => {

  const sampleDoc = 'We guarantee Jane Smith an 18% annual return on investment without any market risk.';

  it('validates grounded verbatim flag and computes exact character offsets', () => {
    const candidateFlag = {
      rule_id: 'FINRA-2210',
      passage: 'We guarantee Jane Smith an 18% annual return on investment without any market risk.',
      reason: 'Prohibits return guarantees.',
      severity: 'CRITICAL'
    };

    const res = validateFlag(candidateFlag, sampleDoc);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.validatedFlag.rule_id, 'FINRA-2210');
    assert.strictEqual(res.validatedFlag.offsets.start, 0);
    assert.strictEqual(res.validatedFlag.offsets.end, sampleDoc.length);
    assert.strictEqual(res.validatedFlag.grounded_status, 'VERBATIM_VERIFIED');
  });

  it('automatically DISCARDS flags with hallucinated/ungrounded passages', () => {
    const hallucinatedFlag = {
      rule_id: 'FINRA-2210',
      passage: 'This passage is completely fabricated by an LLM and does not exist in the source.',
      reason: 'False flag.',
      severity: 'CRITICAL'
    };

    const res = validateFlag(hallucinatedFlag, sampleDoc);

    assert.strictEqual(res.isValid, false);
    assert.ok(res.discardReason.includes('Hallucinated quote'));
  });

  it('automatically DISCARDS flags with invalid/hallucinated rule IDs', () => {
    const fakeRuleFlag = {
      rule_id: 'RULE-DOES-NOT-EXIST-777',
      passage: 'We guarantee Jane Smith an 18% annual return',
      reason: 'Rule does not exist.'
    };

    const res = validateFlag(fakeRuleFlag, sampleDoc);

    assert.strictEqual(res.isValid, false);
    assert.ok(res.discardReason.includes('Hallucinated rule ID'));
  });

  it('batch filter separates verified grounded flags from discarded hallucinations', () => {
    const rawCandidates = [
      {
        rule_id: 'FINRA-2210',
        passage: 'We guarantee Jane Smith an 18% annual return on investment without any market risk.'
      },
      {
        rule_id: 'FINRA-2210',
        passage: 'Completely fake line that should be discarded immediately.'
      }
    ];

    const result = filterAndGroundFlags(rawCandidates, sampleDoc);

    assert.strictEqual(result.verifiedFlags.length, 1);
    assert.strictEqual(result.discardedFlags.length, 1);
    assert.strictEqual(result.totalEvaluated, 2);
    assert.strictEqual(result.groundedRate, 0.5);
  });

  it('document sectioner splits text into paragraphs while preserving global offsets', () => {
    const multiParaText = `Paragraph 1: Welcome to the investment overview.\n\nParagraph 2: We promise risk-free execution.`;
    const sections = sectionDocument(multiParaText);

    assert.strictEqual(sections.length, 2);
    assert.strictEqual(sections[0].text, 'Paragraph 1: Welcome to the investment overview.');
    assert.strictEqual(sections[0].start, 0);
    assert.ok(sections[1].start > sections[0].end);
  });

  it('HUMAN-IN-THE-LOOP ENFORCER: Blocks AI from setting final approval status', async () => {
    const docText = 'We guarantee Jane Smith an 18% annual return on investment without any market risk.';
    const result = await inspectDocument({
      documentId: 'hitl-test',
      rawText: docText,
      forceRefresh: true
    });

    // AI must only return PENDING_OFFICER_REVIEW, never APPROVED or REJECTED
    assert.strictEqual(result.review_status, 'PENDING_OFFICER_REVIEW');
    assert.ok(result.humanInTheLoopNotice.includes('Human Officer review required'));
  });
});
