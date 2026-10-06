/**
 * SERVICE 2: AI Compliance Inspection Agent
 * 
 * Features:
 * - Document sectioning and rule retrieval
 * - Evaluates sections against active SEC/FINRA rules
 * - Structured prompt execution with JSON repair and fault-tolerance
 * - Substring validator integration: Computes offsets {start, end} and discards ungrounded flags
 * - Caching by (documentId, promptVersion, modelId)
 * - Human-in-the-Loop Enforcer: Blocks AI from setting final approval status
 */

import rulesData from '../rules/complianceRules.json' with { type: 'json' };
import { sectionDocument } from './documentSectioner.js';
import { filterAndGroundFlags } from './substringValidator.js';
import { maskedLlmClient } from './maskedLlmClient.js';
import { inspectionCache } from './cacheService.js';
import { maskDocument, rehydrateText, getVaultMapping } from './piiMasker.js';

import { groqService } from './groqClient.js';

const PROMPT_VERSION = 'v2.1-grounded';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/**
 * Perform single-shot compliance evaluation on a document section
 */
export async function analyzeSection(sectionText, rules) {
  const detectedViolations = [];
  const lowerText = sectionText.toLowerCase();

  for (const rule of rules) {
    for (const rawPattern of rule.trigger_patterns) {
      const pattern = rawPattern.toLowerCase();
      let matchIdx = lowerText.indexOf(pattern);

      // Also check if pattern has "client" or person name that got masked to [client_1] for FINRA-2210 return guarantees
      if (matchIdx === -1 && rule.rule_id === 'FINRA-2210') {
        const guaranteeMaskedRegex = /guarantee(?:s|d)?\s+(?:\[client_\d+\]|[a-z]+)?\s*(?:an?\s+)?(?:\d+%|annual return|return|profit)/i;
        const gMatch = guaranteeMaskedRegex.exec(sectionText);
        if (gMatch && rawPattern.includes('guarantee')) {
          matchIdx = gMatch.index;
        }
      }

      if (matchIdx !== -1) {
        // Extract the full sentence surrounding the trigger pattern
        let sentenceStart = sectionText.lastIndexOf('.', matchIdx);
        sentenceStart = sentenceStart === -1 ? 0 : sentenceStart + 1;

        let sentenceEnd = sectionText.indexOf('.', matchIdx);
        sentenceEnd = sentenceEnd === -1 ? sectionText.length : sentenceEnd + 1;

        const passage = sectionText.substring(sentenceStart, sentenceEnd).trim();
        const lowerPassage = passage.toLowerCase();

        // CONTEXTUAL FILTER: Legitimate required disclaimers must NOT be flagged as violations!
        const isLegitimateDisclaimer = 
          (lowerPassage.includes('past performance') && (lowerPassage.includes('no guarantee') || lowerPassage.includes('does not guarantee'))) ||
          (lowerPassage.includes('diversification') && lowerPassage.includes('does not assure')) ||
          (lowerPassage.includes('not fdic insured') && lowerPassage.includes('securities investments are not bank deposits'));

        if (isLegitimateDisclaimer && rule.rule_id === 'FINRA-2210') {
          // This is a legally required protective disclaimer, not an illegal promise
          continue;
        }

        // Avoid duplicate flags for same passage and rule
        if (passage.length > 5 && !detectedViolations.some(v => v.rule_id === rule.rule_id && v.passage === passage)) {
          detectedViolations.push({
            rule_id: rule.rule_id,
            passage: passage,
            reason: `Violates ${rule.regulatory_body} standard: Contains prohibited phrasing. ${rule.description}`,
            severity: rule.severity
          });
        }
      }
    }
  }

  return detectedViolations;
}

/**
 * Malformed JSON repair utility
 */
export function repairJsonString(rawString) {
  try {
    return JSON.parse(rawString);
  } catch (err) {
    // Attempt markdown block stripping: ```json ... ```
    const cleaned = rawString.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      // Return null if unrepairable
      return null;
    }
  }
}

/**
 * Main Inspection Agent function
 */
export async function inspectDocument({
  documentId,
  rawText,
  documentType = 'INVESTMENT_AGREEMENT',
  forceRefresh = false,
  model = DEFAULT_MODEL,
  injectMockHallucination = false // For adversarial test suite demonstration
}) {
  // 1. Check cache first
  if (!forceRefresh) {
    const cached = inspectionCache.get(documentId, PROMPT_VERSION, model);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  // 2. Pass document through Service 1 Privacy Wall (Outbound Interceptor)
  const systemPrompt = `You are an expert SEC/FINRA Compliance Inspection Agent. Evaluate the provided document text against compliance rules. Return only valid JSON adhering to the specified schema.`;
  const { scrubbedInput, outboundAudit } = await maskedLlmClient.complete({
    documentId,
    systemPrompt,
    userText: rawText,
    model
  });

  // 3. Section the masked document
  const sections = sectionDocument(scrubbedInput);

  // 4. Evaluate document against active compliance rules
  const candidateRawFlags = [];
  const isGroqModel = model.toLowerCase().includes('llama') || model.toLowerCase().includes('groq') || model.toLowerCase().includes('mixtral');
  let groqExecutionMeta = null;

  if (isGroqModel) {
    const groqResult = await groqService.evaluateDocument({
      scrubbedText: scrubbedInput,
      rules: rulesData,
      model
    });
    candidateRawFlags.push(...(groqResult.rawViolations || []));
    groqExecutionMeta = {
      provider: groqResult.provider,
      model: groqResult.model,
      latencyMs: groqResult.latencyMs,
      tokensUsed: groqResult.tokensUsed,
      isLiveCloud: groqResult.isLiveCloud,
      notice: groqResult.notice
    };
  } else {
    for (const sec of sections) {
      const flagsForSec = await analyzeSection(sec.text, rulesData);
      candidateRawFlags.push(...flagsForSec);
    }
  }

  // 5. In adversarial testing mode, inject a hallucinated flag to test discarding
  if (injectMockHallucination) {
    candidateRawFlags.push({
      rule_id: 'FINRA-2210',
      passage: 'This sentence is an ungrounded hallucination not present in the original document.',
      reason: 'AI hallucinated false claim.',
      severity: 'CRITICAL'
    });
    candidateRawFlags.push({
      rule_id: 'NON-EXISTENT-RULE-999',
      passage: scrubbedInput.substring(0, 20),
      reason: 'AI hallucinated nonexistent rule ID.',
      severity: 'HIGH'
    });
  }

  // 6. Anti-Hallucination Substring Validator (The Choke Point)
  // Run on masked text first to ground verbatim in scrubbed text
  const maskedValidation = filterAndGroundFlags(candidateRawFlags, scrubbedInput);

  // 7. Dynamic Rehydration of flags for Frontend Officer View
  const vault = getVaultMapping(documentId);
  const rehydratedFlags = maskedValidation.verifiedFlags.map(flag => {
    const rehydratedPassage = rehydrateText(flag.passage, documentId);
    const rehydratedReason = rehydrateText(flag.reason, documentId);

    // Calculate exact character offsets in the original rawText
    const rawStart = rawText.indexOf(rehydratedPassage);
    const rawEnd = rawStart !== -1 ? rawStart + rehydratedPassage.length : -1;

    return {
      ...flag,
      passage: rehydratedPassage,
      reason: rehydratedReason,
      masked_passage: flag.passage,
      offsets: {
        start: rawStart !== -1 ? rawStart : flag.offsets.start,
        end: rawEnd !== -1 ? rawEnd : flag.offsets.end
      },
      masked_offsets: flag.offsets
    };
  });

  // 8. Human-in-the-Loop Enforcer:
  // Strictly block AI from setting final approval status!
  const finalAnalysisPayload = {
    documentId,
    documentType,
    promptVersion: PROMPT_VERSION,
    modelId: model,
    humanInTheLoopNotice: 'Human Officer review required. AI is legally prohibited from issuing final approval.',
    review_status: 'PENDING_OFFICER_REVIEW', // Blocked from APPROVED or REJECTED
    analysisSummary: {
      totalSectionsEvaluated: sections.length,
      candidateFlagsFound: candidateRawFlags.length,
      verifiedGroundedFlags: rehydratedFlags.length,
      hallucinationsDiscarded: maskedValidation.discardedFlags.length,
      groundedAccuracyRate: `${(maskedValidation.groundedRate * 100).toFixed(1)}%`
    },
    flags: rehydratedFlags,
    discardedHallucinations: maskedValidation.discardedFlags,
    groqMeta: groqExecutionMeta,
    privacyWall: {
      outboundAudit,
      tokenMappingAvailable: vault ? vault.entityCount > 0 : false
    },
    timestamp: new Date().toISOString()
  };

  // 9. Store in cache
  inspectionCache.set(documentId, PROMPT_VERSION, model, finalAnalysisPayload);

  return finalAnalysisPayload;
}
