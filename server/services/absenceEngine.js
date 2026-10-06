/**
 * SERVICE 3: Disclosure-by-Absence Engine
 * 
 * Features:
 * - Evaluates document against mandatory required disclosures by document type
 * - Flags missing disclosures that traditional keyword search cannot find
 * - Extends flag schema for passage-less flags:
 *   - Identifies closest text passage found
 *   - Computes semantic distance score (0.0 = perfect match, 1.0 = completely absent)
 */

import mandatoryDisclosures from '../rules/mandatoryDisclosures.json' with { type: 'json' };

/**
 * Tokenize and normalize text into word set
 */
function tokenize(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

/**
 * Compute Jaccard / Cosine semantic distance between two texts
 * Returns value between 0.0 (identical) and 1.0 (completely distant/disjoint)
 */
export function computeSemanticDistance(textA, textB) {
  const setA = tokenize(textA);
  const setB = tokenize(textB);

  if (setA.size === 0 || setB.size === 0) return 1.0;

  let intersectionCount = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      intersectionCount++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionCount;
  const similarity = unionSize > 0 ? (intersectionCount / unionSize) : 0;

  // Distance = 1 - similarity
  return Number((1 - similarity).toFixed(3));
}

/**
 * Find closest passage in the document to a required disclosure
 */
export function findClosestPassage(documentText, requiredText) {
  // Split document into sentences/clauses
  const sentences = documentText
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length === 0) {
    return {
      closestPassage: documentText.slice(0, 100),
      bestDistance: 1.0
    };
  }

  let minDistance = 1.0;
  let closest = sentences[0];

  for (const sentence of sentences) {
    const dist = computeSemanticDistance(sentence, requiredText);
    if (dist < minDistance) {
      minDistance = dist;
      closest = sentence;
    }
  }

  return {
    closestPassage: closest,
    bestDistance: minDistance
  };
}

/**
 * Check document for missing mandatory disclosures
 * 
 * @param {string} documentText 
 * @param {string} documentType e.g. "INVESTMENT_AGREEMENT", "MARKETING_BROCHURE"
 * @returns {Array} List of absence flags
 */
export function evaluateAbsence(documentText, documentType = 'INVESTMENT_AGREEMENT') {
  const requiredList = mandatoryDisclosures[documentType] || mandatoryDisclosures['INVESTMENT_AGREEMENT'];
  const lowerDoc = documentText.toLowerCase();
  const absenceFlags = [];

  for (const item of requiredList) {
    // Check if key required concepts are present
    let keywordMatchCount = 0;
    for (const kw of item.keywords) {
      if (lowerDoc.includes(kw.toLowerCase())) {
        keywordMatchCount++;
      }
    }

    const { closestPassage, bestDistance } = findClosestPassage(documentText, item.required_text);

    // If keywords match is low or best distance is high, disclosure is considered MISSING
    const isPresent = keywordMatchCount >= Math.min(2, item.keywords.length) && bestDistance < 0.65;

    if (!isPresent) {
      absenceFlags.push({
        flag_id: `ABSENCE-${item.disclosure_id}`,
        type: 'MISSING_DISCLOSURE',
        disclosure_id: item.disclosure_id,
        name: item.name,
        severity: item.severity,
        description: item.description,
        required_text: item.required_text,
        closest_text_passage: closestPassage,
        semantic_distance_score: bestDistance, // e.g. 0.88 means absent
        status: 'OMITTED_MANDATORY_CLAUSE',
        remediation: `Insert required ${item.name} clause: "${item.required_text}"`
      });
    }
  }

  return absenceFlags;
}
