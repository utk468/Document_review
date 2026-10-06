/**
 * SERVICE 3 TEST SUITE: Absence Engine, Precedent Context & Guardrail Verification
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAbsence, computeSemanticDistance } from '../server/services/absenceEngine.js';
import { lookupPrecedents } from '../server/services/precedentService.js';
import { inspectDocument } from '../server/services/inspectionAgent.js';

describe('Service 3: Absence Engine & Precedent Context Service', () => {

  it('detects omitted mandatory legal disclosures and computes semantic distance score', () => {
    // Document with zero disclaimers
    const docWithoutDisclaimers = 'Investment Agreement for Jane Smith. We guarantee 18% return without risk.';
    const absenceFlags = evaluateAbsence(docWithoutDisclaimers, 'INVESTMENT_AGREEMENT');

    // Should flag missing DISC-09 (Past Performance) and DISC-02 (Risk of Loss)
    const discIds = absenceFlags.map(f => f.disclosure_id);
    assert.ok(discIds.includes('DISC-09'), 'Must flag missing DISC-09');
    assert.ok(discIds.includes('DISC-02'), 'Must flag missing DISC-02');

    // Each absence flag must contain semantic distance score
    for (const flag of absenceFlags) {
      assert.ok(typeof flag.semantic_distance_score === 'number');
      assert.ok(flag.semantic_distance_score >= 0.0 && flag.semantic_distance_score <= 1.0);
      assert.ok(flag.closest_text_passage.length > 0);
    }
  });

  it('marks disclosure as satisfied when mandatory clause is present', () => {
    const docWithDisclaimer = `Investment Agreement for Robert Taylor.
All investments involve risk of loss, including the possible loss of principal invested.
Past performance is no guarantee of future results. Investment value and returns will fluctuate, and investors may lose money.
Advisory services provided by Aegis Wealth Partners, a Registered Investment Adviser with the U.S. Securities and Exchange Commission (SEC). Registration does not imply a certain level of skill or training.`;

    const absenceFlags = evaluateAbsence(docWithDisclaimer, 'INVESTMENT_AGREEMENT');

    // All disclosures are satisfied!
    assert.strictEqual(absenceFlags.length, 0, 'Compliant document should have 0 missing disclosures');
  });

  it('retrieves top 3 relevant precedents via vector similarity with historical officer notes', () => {
    const queryDoc = 'We guarantee an 18% annual return on investment without any market risk.';
    const topPrecedents = lookupPrecedents(queryDoc, 3);

    assert.strictEqual(topPrecedents.length, 3);
    // Highest match should be Doc #8812 (Jane Smith agreement / return guarantee precedent)
    assert.strictEqual(topPrecedents[0].precedent_id, 'PREC-8812');
    assert.ok(topPrecedents[0].officer_notes.includes('Violates FINRA-2210'));
    assert.strictEqual(topPrecedents[0].decision, 'REJECTED');
    assert.ok(topPrecedents[0].similarity_score > 0);
  });

  it('GUARDRAIL TEST: Verifies precedent text is strictly read-only and NEVER injected into detection prompt', async () => {
    const doc = 'We guarantee Jane Smith an 18% return.';
    const precedents = lookupPrecedents(doc, 3);

    // Verify precedent structure explicitly enforces read-only badge
    for (const prec of precedents) {
      assert.strictEqual(prec.usage_guardrail, 'READ_ONLY_UI_DISPLAY_ONLY');
    }

    // Inspect document and verify outbound LLM prompt contains ZERO precedent text
    const result = await inspectDocument({
      documentId: 'guardrail-check',
      rawText: doc,
      forceRefresh: true
    });

    const outboundAudit = result.privacyWall.outboundAudit;
    const outboundPromptText = outboundAudit.serializedJson;

    // Check that historical precedent officer names/notes are NOT in outbound prompt
    assert.ok(!outboundPromptText.includes('Officer Bob Martinez'), 'Precedent officer name must not leak into prompt');
    assert.ok(!outboundPromptText.includes('Doc #8812'), 'Precedent document ID must not leak into prompt');
    assert.ok(!outboundPromptText.includes('Officer Michael Chang'), 'Precedent context must not bias model prompt');
  });
});
