/**
 * Multi-Tier Result Cache for Compliance Inspections
 * Keyed by: (documentId, promptVersion, modelId)
 */

class InspectionCache {
  constructor() {
    this.cache = new Map();
  }

  generateKey(documentId, promptVersion = 'v1.2', modelId = 'gpt-4o-compliance-v1') {
    return `${documentId}:${promptVersion}:${modelId}`;
  }

  get(documentId, promptVersion, modelId) {
    const key = this.generateKey(documentId, promptVersion, modelId);
    return this.cache.get(key) || null;
  }

  set(documentId, promptVersion, modelId, result) {
    const key = this.generateKey(documentId, promptVersion, modelId);
    this.cache.set(key, {
      ...result,
      cachedAt: new Date().toISOString()
    });
  }

  clear() {
    this.cache.clear();
  }
}

export const inspectionCache = new InspectionCache();
