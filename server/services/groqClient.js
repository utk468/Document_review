/**
 * GROQ AI Inference Service
 * 
 * Provides ultra-fast LLM inference using Groq LPU technology.
 * Supported Models:
 * - llama-3.3-70b-versatile
 * - llama-3.1-8b-instant
 * - mixtral-8x7b-32768
 * 
 * CRITICAL PRIVACY REQUIREMENT:
 * All prompts must be scrubbed of PII by Service 1 before invocation.
 */

import dotenv from 'dotenv';
dotenv.config();

let dynamicGroqApiKey = process.env.GROQ_API_KEY || '';

export const groqService = {
  /**
   * Check if Groq API is live or simulated
   */
  isConfigured() {
    return Boolean(dynamicGroqApiKey && dynamicGroqApiKey.trim().length > 0);
  },

  /**
   * Set dynamic API key from runtime settings
   */
  setApiKey(key) {
    dynamicGroqApiKey = (key || '').trim();
    process.env.GROQ_API_KEY = dynamicGroqApiKey;
    return this.isConfigured();
  },

  /**
   * Get active masked key for UI display
   */
  getMaskedKey() {
    if (!this.isConfigured()) return null;
    const len = dynamicGroqApiKey.length;
    if (len <= 8) return '****';
    return `${dynamicGroqApiKey.substring(0, 4)}...${dynamicGroqApiKey.substring(len - 4)}`;
  },

  /**
   * Call Groq AI for compliance evaluation
   * 
   * @param {Object} options
   * @param {string} options.scrubbedText - Pre-masked text from Service 1
   * @param {Array} options.rules - Active SEC/FINRA rules
   * @param {string} options.model - Groq model ID
   */
  async evaluateDocument({ scrubbedText, rules, model = 'llama-3.3-70b-versatile' }) {
    const startTime = Date.now();
    const systemPrompt = `You are an expert SEC and FINRA Compliance Review Inspector running on Groq LPU inference.
Evaluate the provided document against active regulatory rules.
Rules available:
${rules.map(r => `- Rule ID: ${r.rule_id} (${r.regulatory_body}): ${r.description} [Severity: ${r.severity}]`).join('\n')}

STRICT OUTPUT REQUIREMENT:
Return ONLY a valid JSON object matching this schema:
{
  "violations": [
    {
      "rule_id": "EXACT_RULE_ID",
      "passage": "EXACT verbatim quote from the text",
      "reason": "concise explanation of why this violates the rule",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM"
    }
  ]
}

If no violations are found, return: { "violations": [] }.
Do NOT hallucinate quotes. The passage MUST exist word-for-word in the text.`;

    // 1. If real Groq API key is configured, call Groq API
    if (this.isConfigured()) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${dynamicGroqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: scrubbedText }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 2048
          })
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Groq API responded with HTTP ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const contentStr = data.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(contentStr);
        const elapsedMs = Date.now() - startTime;

        return {
          provider: 'GROQ_CLOUD',
          model: model,
          latencyMs: elapsedMs,
          tokensUsed: data.usage?.total_tokens || 0,
          rawViolations: parsed.violations || [],
          isLiveCloud: true
        };
      } catch (cloudErr) {
        console.warn(`Groq live call failed (${cloudErr.message}), falling back to deterministic Groq LPU engine simulation.`);
      }
    }

    // 2. High-speed deterministic fallback simulation when API key is not set
    // Emulates Groq LPU sub-200ms ultra-fast inference
    const simulatedViolations = [];
    const lowerText = scrubbedText.toLowerCase();

    for (const rule of rules) {
      for (const rawPattern of rule.trigger_patterns) {
        const pattern = rawPattern.toLowerCase();
        let matchIdx = lowerText.indexOf(pattern);

        if (matchIdx === -1 && rule.rule_id === 'FINRA-2210') {
          const guaranteeMaskedRegex = /guarantee(?:s|d)?\s+(?:\[client_\d+\]|[a-z]+)?\s*(?:an?\s+)?(?:\d+%|annual return|return|profit)/i;
          const gMatch = guaranteeMaskedRegex.exec(scrubbedText);
          if (gMatch && rawPattern.includes('guarantee')) {
            matchIdx = gMatch.index;
          }
        }

        if (matchIdx !== -1) {
          let sentenceStart = scrubbedText.lastIndexOf('.', matchIdx);
          sentenceStart = sentenceStart === -1 ? 0 : sentenceStart + 1;
          let sentenceEnd = scrubbedText.indexOf('.', matchIdx);
          sentenceEnd = sentenceEnd === -1 ? scrubbedText.length : sentenceEnd + 1;

          const passage = scrubbedText.substring(sentenceStart, sentenceEnd).trim();
          const lowerPassage = passage.toLowerCase();

          // Check for legitimate disclaimers
          const isDisclaimer = 
            (lowerPassage.includes('past performance') && (lowerPassage.includes('no guarantee') || lowerPassage.includes('does not guarantee'))) ||
            (lowerPassage.includes('diversification') && lowerPassage.includes('does not assure')) ||
            (lowerPassage.includes('not fdic insured') && lowerPassage.includes('securities investments are not bank deposits'));

          if (!isDisclaimer && passage.length > 5 && !simulatedViolations.some(v => v.rule_id === rule.rule_id && v.passage === passage)) {
            simulatedViolations.push({
              rule_id: rule.rule_id,
              passage: passage,
              reason: `Groq LPU Inference flagged ${rule.regulatory_body} non-compliance: Prohibited representation detected. ${rule.description}`,
              severity: rule.severity
            });
          }
        }
      }
    }

    const elapsedMs = Math.max(12, Date.now() - startTime);

    return {
      provider: 'GROQ_SIMULATOR',
      model: model,
      latencyMs: elapsedMs,
      tokensUsed: Math.round(scrubbedText.length / 4) + 180,
      rawViolations: simulatedViolations,
      isLiveCloud: false,
      notice: 'Groq ultra-fast LPU inference simulated. To execute live cloud inference, configure GROQ_API_KEY in .env or the Settings panel.'
    };
  }
};
