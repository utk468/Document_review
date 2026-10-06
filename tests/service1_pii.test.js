/**
 * SERVICE 1 TEST SUITE: PII Masking, Interceptor & Zero-Leak Verification
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskDocument, rehydrateText, isSafeListed, detectPiiEntities } from '../server/services/piiMasker.js';
import { maskedLlmClient } from '../server/services/maskedLlmClient.js';

describe('Service 1: PII Masking & Privacy Wall', () => {

  it('correctly detects and masks SSN, Email, Phone, Account Number, Address, and Client Name', () => {
    const rawDoc = `Investment Agreement for Jane Smith (SSN: 987-65-4321, Account #AC-99120).
Address: 123 Wall Street, Suite 400, New York, NY 10005. Contact: jane.smith@example.com, (555) 123-4567. Initial portfolio deposit amounting to $1,500,000.`;

    const result = maskDocument(rawDoc, 'test-doc-1');

    assert.ok(result.maskedText.includes('[CLIENT_1]'), 'Should contain [CLIENT_1]');
    assert.ok(result.maskedText.includes('[SSN_1]'), 'Should contain [SSN_1]');
    assert.ok(result.maskedText.includes('[ACCOUNT_1]'), 'Should contain [ACCOUNT_1]');
    assert.ok(result.maskedText.includes('[EMAIL_1]'), 'Should contain [EMAIL_1]');
    assert.ok(result.maskedText.includes('[PHONE_1]'), 'Should contain [PHONE_1]');
    assert.ok(result.maskedText.includes('[ADDRESS_1]'), 'Should contain [ADDRESS_1]');
    assert.ok(result.maskedText.includes('[AMOUNT_1]'), 'Should contain [AMOUNT_1]');

    // Assert raw values do NOT exist in maskedText
    assert.ok(!result.maskedText.includes('Jane Smith'), 'Raw name must not appear');
    assert.ok(!result.maskedText.includes('987-65-4321'), 'Raw SSN must not appear');
    assert.ok(!result.maskedText.includes('AC-99120'), 'Raw account must not appear');
    assert.ok(!result.maskedText.includes('jane.smith@example.com'), 'Raw email must not appear');
    assert.ok(!result.maskedText.includes('1,500,000'), 'Raw amount must not appear');
  });

  it('safeguards non-PII financial industry terms from being masked', () => {
    const financialTerms = [
      'S&P 500', 'NASDAQ', 'FINRA', 'SEC', 'NYSE', 'CFTC',
      'Aegis Wealth Partners', 'Vanguard', 'BlackRock'
    ];

    for (const term of financialTerms) {
      assert.ok(isSafeListed(term), `Term "${term}" should be recognized on the safe-list`);
    }

    const textWithFinancialTerms = 'The S&P 500 and NASDAQ index portfolios are regulated by FINRA and the SEC.';
    const result = maskDocument(textWithFinancialTerms, 'test-safelist');

    assert.ok(result.maskedText.includes('S&P 500'), 'S&P 500 must survive unmasked');
    assert.ok(result.maskedText.includes('NASDAQ'), 'NASDAQ must survive unmasked');
    assert.ok(result.maskedText.includes('FINRA'), 'FINRA must survive unmasked');
    assert.ok(result.maskedText.includes('SEC'), 'SEC must survive unmasked');
  });

  it('maintains stable per-document token mapping for repeated entities', () => {
    const docWithRepeats = 'Jane Smith signed the contract. We guarantee Jane Smith an 18% return. Jane Smith accepted.';
    const result = maskDocument(docWithRepeats, 'test-repeats');

    // Should only have [CLIENT_1], never [CLIENT_2] or [CLIENT_3]
    assert.ok(result.maskedText.includes('[CLIENT_1]'));
    assert.ok(!result.maskedText.includes('[CLIENT_2]'));
    const tokenOccurrences = (result.maskedText.match(/\[CLIENT_1\]/g) || []).length;
    assert.strictEqual(tokenOccurrences, 3, 'Jane Smith should map to [CLIENT_1] all 3 times');
  });

  it('rehydrates masked tokens back to original values seamlessly', () => {
    const raw = 'Investment Agreement for Jane Smith (SSN: 987-65-4321).';
    const maskRes = maskDocument(raw, 'test-rehydrate');
    const rehydrated = rehydrateText(maskRes.maskedText, 'test-rehydrate');

    assert.strictEqual(rehydrated, raw, 'Rehydrated text must match original exactly');
  });

  it('INTEGRATION TEST: Outbound API Interceptor asserts ZERO raw PII in serialized request bytes', async () => {
    const sensitiveDoc = 'Client: Jane Smith, SSN: 987-65-4321, Account #AC-99120. Investment return guaranteed.';
    
    // Call masked LLM client interceptor
    const { scrubbedInput, outboundAudit } = await maskedLlmClient.complete({
      documentId: 'test-interceptor-bytes',
      systemPrompt: 'Evaluate compliance.',
      userText: sensitiveDoc
    });

    const serializedBytes = outboundAudit.serializedJson;

    // Strict hardware assertion: Zero raw PII in serialized JSON string
    assert.ok(!serializedBytes.includes('Jane Smith'), 'No raw name in serialized bytes');
    assert.ok(!serializedBytes.includes('987-65-4321'), 'No raw SSN in serialized bytes');
    assert.ok(!serializedBytes.includes('AC-99120'), 'No raw account in serialized bytes');

    // Tokens must be present
    assert.ok(serializedBytes.includes('[CLIENT_1]'));
    assert.ok(serializedBytes.includes('[SSN_1]'));
    assert.ok(serializedBytes.includes('[ACCOUNT_1]'));
    assert.strictEqual(outboundAudit.zeroLeakVerification, true);
  });
});
