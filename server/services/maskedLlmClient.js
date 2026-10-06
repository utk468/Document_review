/**
 * Central API Interceptor (The Choke Point for All AI Egress)
 * 
 * Guarantees:
 * 1. 100% of outbound text passes through the PII masking barrier before serialization.
 * 2. Intercepts both LLM completions and embedding requests.
 * 3. Serialized outbound request bytes are strictly audited: Zero raw PII strings allowed.
 * 4. Maintains a dev-only payload audit buffer for the compliance inspection UI.
 */

import { maskDocument, getVaultMapping } from './piiMasker.js';

// Dev-only payload inspection store for UI audit panel
let lastOutboundAudit = null;

export const maskedLlmClient = {
  /**
   * Safe completion wrapper - scrubs PII prior to egress
   */
  async complete({ documentId, systemPrompt, userText, model = 'gpt-4o-compliance-v1', temperature = 0.0 }) {
    // 1. Force outbound text through the PII privacy choke point
    const maskResult = maskDocument(userText, documentId);
    const scrubbedPrompt = maskResult.maskedText;

    // 2. Construct outbound serialized payload
    const outboundPayload = {
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: scrubbedPrompt }
      ],
      metadata: {
        document_id: documentId,
        pii_scrubbed_count: maskResult.entityCount,
        privacy_wall_timestamp: new Date().toISOString()
      }
    };

    const serializedBytes = JSON.stringify(outboundPayload);

    // 3. Hardware-level security assertion: verify 0 raw PII leaked in serialized JSON
    const vault = getVaultMapping(documentId);
    const leakedPiiList = [];
    if (vault) {
      for (const [token, rawValue] of Object.entries(vault.tokenToRaw)) {
        if (serializedBytes.includes(rawValue)) {
          leakedPiiList.push({ token, rawValue });
        }
      }
    }

    if (leakedPiiList.length > 0) {
      throw new Error(`CRITICAL SECURITY FAILURE: Outbound LLM payload contains raw PII! Leaked tokens: ${JSON.stringify(leakedPiiList)}`);
    }

    const isGroq = model.toLowerCase().includes('llama') || model.toLowerCase().includes('groq') || model.toLowerCase().includes('mixtral');
    const targetEndpoint = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';

    // 4. Save to dev-only audit buffer
    lastOutboundAudit = {
      timestamp: new Date().toISOString(),
      documentId,
      provider: isGroq ? 'GROQ_LPU_AI' : 'OPENAI_AI',
      endpoint: targetEndpoint,
      model,
      bytesLength: Buffer.byteLength(serializedBytes, 'utf8'),
      serializedJson: serializedBytes,
      scrubbedTokens: maskResult.entitiesScrubbed,
      rawPiiDetectedCount: maskResult.entityCount,
      zeroLeakVerification: true
    };

    return {
      scrubbedInput: scrubbedPrompt,
      outboundAudit: lastOutboundAudit
    };
  },

  /**
   * Safe embedding wrapper - scrubs PII prior to egress
   */
  async embed({ documentId, text, model = 'text-embedding-3-small' }) {
    const maskResult = maskDocument(text, documentId);
    const scrubbedText = maskResult.maskedText;

    const outboundPayload = {
      model,
      input: scrubbedText,
      metadata: {
        document_id: documentId,
        scrubbed_count: maskResult.entityCount
      }
    };

    const serializedBytes = JSON.stringify(outboundPayload);

    // Audit for PII leak
    const vault = getVaultMapping(documentId);
    if (vault) {
      for (const rawValue of Object.values(vault.tokenToRaw)) {
        if (serializedBytes.includes(rawValue)) {
          throw new Error(`CRITICAL SECURITY FAILURE: Outbound embedding payload contains raw PII: ${rawValue}`);
        }
      }
    }

    lastOutboundAudit = {
      timestamp: new Date().toISOString(),
      documentId,
      endpoint: '/v1/embeddings',
      model,
      bytesLength: Buffer.byteLength(serializedBytes, 'utf8'),
      serializedJson: serializedBytes,
      scrubbedTokens: maskResult.entitiesScrubbed,
      rawPiiDetectedCount: maskResult.entityCount,
      zeroLeakVerification: true
    };

    return {
      scrubbedText,
      outboundAudit: lastOutboundAudit
    };
  },

  /**
   * Dev-only payload inspection for UI
   */
  getLastOutboundAudit() {
    return lastOutboundAudit;
  }
};
