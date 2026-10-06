/**
 * SERVICE 1: PII Masking & Security Service (Zero-Leak Privacy Wall)
 * 
 * Features:
 * - Multi-entity detection: SSN, Email, Phone, Account, Address, Person Name, Person Dollar Amount
 * - Span-resolution logic to handle overlapping entity spans
 * - Stable per-document token mapping ([CLIENT_1], [SSN_1], [ACCOUNT_1], etc.)
 * - Secure server-side vault keyed by documentId
 * - Dynamic text rehydration
 * - Adversarial safe-list for financial entities (S&P 500, FINRA, SEC, NASDAQ, etc.)
 */

// Safe-list of financial, institutional, and geographical terms that must NEVER be masked as person names
const FINANCIAL_SAFELIST = new Set([
  'S&P 500', 'S&P', 'SP500', 'NASDAQ', 'DOW JONES', 'NYSE', 'FINRA', 'SEC', 'CFTC',
  'IRS', 'SIPC', 'FDIC', 'FEDERAL RESERVE', 'TREASURY', 'WALL STREET', 'BLOOMBERG',
  'UNITED STATES', 'NEW YORK', 'DELAWARE', 'CALIFORNIA', 'CHICAGO', 'LONDON',
  'AEGIS WEALTH PARTNERS', 'AEGIS CAPITAL', 'AEGIS WEALTH', 'VANGUARD', 'BLACKROCK',
  'FIDELITY', 'SCHWAB', 'MORGAN STANLEY', 'GOLDMAN SACHS', 'JPMORGAN',
  'INVESTMENT AGREEMENT', 'DISCLOSURE STATEMENT', 'ANNUAL REPORT', 'PROSPECTUS',
  'FORM ADV', 'FORM CRS', 'REGULATION BI', 'RULE 206', 'FINRA 2210'
]);

// Common first and last name heuristics and common name roots
const COMMON_FIRST_NAMES = new Set([
  'JANE', 'JOHN', 'SARAH', 'ROBERT', 'MICHAEL', 'DAVID', 'EMILY', 'JAMES',
  'MARY', 'WILLIAM', 'ELIZABETH', 'RICHARD', 'JOSEPH', 'THOMAS', 'PATRICIA',
  'CHRISTOPHER', 'DANIEL', 'MATTHEW', 'ANTHONY', 'DONALD', 'MARK', 'PAUL',
  'STEVEN', 'ANDREW', 'KENNETH', 'JOSHUA', 'KEVIN', 'BRIAN', 'GEORGE', 'EDWARD',
  'RONALD', 'TIMOTHY', 'JASON', 'JEFFREY', 'RYAN', 'JACOB', 'GARY', 'NICHOLAS',
  'ERIC', 'JONATHAN', 'STEPHEN', 'LARRY', 'JUSTIN', 'SCOTT', 'BRANDON', 'BENJAMIN',
  'SAMUEL', 'GREGORY', 'ALEXANDER', 'PATRICK', 'FRANK', 'RAYMOND', 'JACK', 'DENNIS',
  'JERRY', 'TYLER', 'AARON', 'JOSE', 'ADAM', 'NATHAN', 'HENRY', 'DOUGLAS', 'ZACHARY',
  'PETER', 'KYLE', 'WALTER', 'ETHAN', 'JEREMY', 'HAROLD', 'KEITH', 'CHRISTIAN',
  'ROGER', 'NOAH', 'GERALD', 'CARL', 'TERRY', 'SEAN', 'AUSTIN', 'ARTHUR', 'LAWRENCE',
  'JESSE', 'DYLAN', 'BRYAN', 'JOE', 'JORDAN', 'BILLY', 'BRUCE', 'ALBERT', 'WILLIE',
  'GABRIEL', 'LOGAN', 'ALAN', 'JUAN', 'WAYNE', 'ROY', 'RALPH', 'RANDY', 'EUGENE',
  'VINCENT', 'RUSSELL', 'LOUIS', 'BOBBY', 'PHILIP', 'JOHNNY', 'BOB', 'ALICE', 'CHARLIE'
]);

// In-memory secure server-side vault: documentId -> { tokenToRaw, rawToToken, entities }
const secureVault = new Map();

/**
 * Detect all PII candidate spans in text
 */
export function detectPiiEntities(text) {
  const matches = [];

  // 1. Social Security Numbers (SSN): 987-65-4321, 987 65 4321
  const ssnRegex = /\b(\d{3}[-\s]\d{2}[-\s]\d{4})\b/g;
  let match;
  while ((match = ssnRegex.exec(text)) !== null) {
    matches.push({
      type: 'SSN',
      raw: match[1],
      start: match.index,
      end: match.index + match[1].length,
      priority: 100
    });
  }

  // 2. Email addresses
  const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
  while ((match = emailRegex.exec(text)) !== null) {
    matches.push({
      type: 'EMAIL',
      raw: match[1],
      start: match.index,
      end: match.index + match[1].length,
      priority: 95
    });
  }

  // 3. Phone numbers: (555) 123-4567, 555-123-4567, +1-555-123-4567
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
  while ((match = phoneRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    matches.push({
      type: 'PHONE',
      raw: raw,
      start: match.index,
      end: match.index + raw.length,
      priority: 90
    });
  }

  // 4. Account Numbers: #AC-99120, Account #AC-99120, AC-99120, Acct: 10928374
  const accountRegex = /(?:Account\s*(?:#|No\.?|Number:?)?\s*|Acct\s*(?:#|No\.?|:)?\s*|#AC-)([A-Z0-9-]{5,15})\b|(#AC-\d+)\b/gi;
  while ((match = accountRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    matches.push({
      type: 'ACCOUNT',
      raw: raw,
      start: match.index,
      end: match.index + raw.length,
      priority: 85
    });
  }

  // 5. Street Addresses (e.g. 123 Wall Street, Suite 400 or 742 Evergreen Terrace)
  const addressRegex = /\b\d{1,5}\s+[A-Z][a-zA-Z0-9.\s]+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Suite\s*\d+|Apt\s*\d+)(?:,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})?/g;
  while ((match = addressRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    matches.push({
      type: 'ADDRESS',
      raw: raw,
      start: match.index,
      end: match.index + raw.length,
      priority: 75
    });
  }

  // 6. Person-Associated Dollar Balances / Amounts
  // e.g. "deposit of $1,500,000", "balance: $250,000", "wire $50,000"
  const amountRegex = /(?:balance|deposit|portfolio value|wire|transfer|assets of|sum of)\s*(?:is|of|amounting to)?\s*(\$[\d,]+(?:\.\d{2})?)/gi;
  while ((match = amountRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    const startIdx = match.index + match[0].indexOf(raw);
    matches.push({
      type: 'AMOUNT',
      raw: raw,
      start: startIdx,
      end: startIdx + raw.length,
      priority: 70
    });
  }

  // 7. Person Names (contextual titles & capitalized two/three-word names)
  // Contextual titles: Mr./Mrs./Ms./Dr./Client:
  const titleNameRegex = /(?:(?:Mr\.|Mrs\.|Ms\.|Dr\.|Client(?:\s+Name)?[:\s]+|Agreement\s+for\s+|Advisor:\s*))\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g;
  while ((match = titleNameRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    if (!isSafeListed(raw)) {
      const startIdx = match.index + match[0].indexOf(raw);
      matches.push({
        type: 'CLIENT',
        raw: raw,
        start: startIdx,
        end: startIdx + raw.length,
        priority: 80
      });
    }
  }

  // General 2-word proper noun names where first word matches known first names
  const generalNameRegex = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g;
  while ((match = generalNameRegex.exec(text)) !== null) {
    const fullName = match[0].trim();
    const firstName = match[1].toUpperCase();
    if (COMMON_FIRST_NAMES.has(firstName) && !isSafeListed(fullName)) {
      matches.push({
        type: 'CLIENT',
        raw: fullName,
        start: match.index,
        end: match.index + fullName.length,
        priority: 65
      });
    }
  }

  return resolveOverlappingSpans(matches);
}

/**
 * Check if a term is in the financial safe-list
 */
export function isSafeListed(term) {
  const normalized = term.trim().toUpperCase();
  if (FINANCIAL_SAFELIST.has(normalized)) return true;
  for (const safe of FINANCIAL_SAFELIST) {
    if (normalized.includes(safe) || safe.includes(normalized)) return true;
  }
  return false;
}

/**
 * Span-resolution logic for overlapping entities
 * Prefers higher priority and longer span
 */
export function resolveOverlappingSpans(spans) {
  if (spans.length === 0) return [];

  // Sort by start index asc, then priority desc, then length desc
  spans.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.end - b.start) - (a.end - a.start);
  });

  const nonOverlapping = [];
  let lastEnd = -1;

  for (const span of spans) {
    if (span.start >= lastEnd) {
      nonOverlapping.push(span);
      lastEnd = span.end;
    } else {
      // Overlapping! Compare priorities
      const prev = nonOverlapping[nonOverlapping.length - 1];
      if (span.priority > prev.priority) {
        // Replace previous with this span
        nonOverlapping[nonOverlapping.length - 1] = span;
        lastEnd = span.end;
      }
    }
  }

  return nonOverlapping;
}

/**
 * Mask PII in document text and store mapping table in secure server vault
 */
export function maskDocument(text, documentId = 'default') {
  const spans = detectPiiEntities(text);

  // Retrieve or create per-document mapping store
  let vaultEntry = secureVault.get(documentId);
  if (!vaultEntry) {
    vaultEntry = {
      tokenToRaw: {},
      rawToToken: {},
      counters: {
        CLIENT: 0,
        SSN: 0,
        EMAIL: 0,
        PHONE: 0,
        ACCOUNT: 0,
        ADDRESS: 0,
        AMOUNT: 0
      },
      entities: []
    };
    secureVault.set(documentId, vaultEntry);
  }

  // Sort spans in descending order of start position so replacements do not alter earlier indices
  const sortedSpans = [...spans].sort((a, b) => b.start - a.start);
  let maskedText = text;
  const recordedEntities = [];

  for (const span of sortedSpans) {
    const rawVal = text.substring(span.start, span.end);
    let token = vaultEntry.rawToToken[rawVal];

    if (!token) {
      vaultEntry.counters[span.type] = (vaultEntry.counters[span.type] || 0) + 1;
      token = `[${span.type}_${vaultEntry.counters[span.type]}]`;
      vaultEntry.rawToToken[rawVal] = token;
      vaultEntry.tokenToRaw[token] = rawVal;
    }

    recordedEntities.push({
      type: span.type,
      raw: rawVal,
      token: token,
      start: span.start,
      end: span.end
    });

    // Replace in masked text
    maskedText = maskedText.substring(0, span.start) + token + maskedText.substring(span.end);
  }

  vaultEntry.entities = recordedEntities.reverse();

  return {
    documentId,
    maskedText,
    entityCount: spans.length,
    entitiesScrubbed: vaultEntry.entities.map(e => ({
      type: e.type,
      token: e.token,
      charLength: e.raw.length
      // Notice: raw value is NOT leaked here for third-party exposure
    }))
  };
}

/**
 * Rehydrate masked tokens back to original PII on server/UI boundary
 */
export function rehydrateText(maskedText, documentId = 'default') {
  const vaultEntry = secureVault.get(documentId);
  if (!vaultEntry) return maskedText;

  let rehydrated = maskedText;
  for (const [token, raw] of Object.entries(vaultEntry.tokenToRaw)) {
    rehydrated = rehydrated.replaceAll(token, raw);
  }
  return rehydrated;
}

/**
 * Get internal vault mapping for authorized admin/rehydration requests only
 */
export function getVaultMapping(documentId) {
  const entry = secureVault.get(documentId);
  if (!entry) return null;
  return {
    tokenToRaw: { ...entry.tokenToRaw },
    entityCount: Object.keys(entry.tokenToRaw).length
  };
}

/**
 * Clear vault for document
 */
export function clearVault(documentId) {
  secureVault.delete(documentId);
}
