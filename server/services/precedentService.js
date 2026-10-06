/**
 * SERVICE 3: Read-Only Precedent Context Service
 * 
 * Features:
 * - Surfaces top 3 similar past compliance reviews based on vector similarity
 * - Includes historical officer decisions, tags, and guidance notes
 * - STRICT GUARDRAIL: Precedents are strictly read-only for officer UI display
 *   and NEVER injected into outbound LLM prompt context!
 */

import historicalPrecedents from '../precedents/historicalPrecedents.json' with { type: 'json' };

/**
 * Compute Term-Frequency vector for text
 */
function getTfVector(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const freq = new Map();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return freq;
}

/**
 * Compute Cosine Similarity between two term vectors
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const [w, countA] of vecA.entries()) {
    magA += countA * countA;
    if (vecB.has(w)) {
      dotProduct += countA * vecB.get(w);
    }
  }

  for (const countB of vecB.values()) {
    magB += countB * countB;
  }

  if (magA === 0 || magB === 0) return 0;
  return Number((dotProduct / (Math.sqrt(magA) * Math.sqrt(magB))).toFixed(3));
}

/**
 * Find top 3 most relevant historical precedents
 * 
 * @param {string} documentText 
 * @param {number} topK default 3
 * @returns {Array} Top matching historical precedent cases
 */
export function lookupPrecedents(documentText, topK = 3) {
  const docVector = getTfVector(documentText);

  const scoredPrecedents = historicalPrecedents.map(prec => {
    // Combine precedent title, tags, summary, and officer notes for similarity
    const precCorpus = `${prec.document_title} ${prec.tags.join(' ')} ${prec.summary_text} ${prec.officer_notes}`;
    const precVector = getTfVector(precCorpus);
    const score = cosineSimilarity(docVector, precVector);

    return {
      precedent_id: prec.precedent_id,
      document_title: prec.document_title,
      officer_name: prec.officer_name,
      decision: prec.decision,
      date: prec.date,
      tags: prec.tags,
      summary_text: prec.summary_text,
      officer_notes: prec.officer_notes,
      similarity_score: score,
      usage_guardrail: 'READ_ONLY_UI_DISPLAY_ONLY'
    };
  });

  // Sort by highest similarity score
  scoredPrecedents.sort((a, b) => b.similarity_score - a.similarity_score);

  return scoredPrecedents.slice(0, topK);
}
