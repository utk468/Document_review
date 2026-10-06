# PII Masker: Architecture, Security Guarantees & Known Limitations

## 🛡️ Security Architecture & Threat Model

The **Service 1 PII Security & Masking Service** acts as an impassable zero-leak privacy barrier between the Compliance Review application server and any third-party Large Language Model (OpenAI, Anthropic, Google Gemini) or vector embedding provider.

### Core Guarantees:
1. **Outbound Interceptor Choke Point:** All AI requests route through `maskedLlmClient.complete()` and `maskedLlmClient.embed()`.
2. **Zero Raw PII Egress Assertion:** Every serialized outbound HTTP request byte array is audited at runtime. If any raw PII mapped in the session vault is detected in outbound bytes, the system aborts with a hardware-level security exception.
3. **Per-Document Stable Token Mapping:** Replaces client identifiers with deterministic tokens (`[CLIENT_1]`, `[SSN_1]`, `[ACCOUNT_1]`, `[EMAIL_1]`, `[PHONE_1]`, `[ADDRESS_1]`, `[AMOUNT_1]`). Identical entities across paragraphs retain stable tokens to preserve LLM reasoning continuity.
4. **Isolated Server-Side Vault:** The token-to-raw mapping dictionary is stored in an ephemeral, memory-safe enclave keyed by `documentId` and is never logged to application logs or returned in model egress payloads.

---

## 🔍 Supported Entity Categories & Detection Heuristics

| Entity Type | Detection Mechanism | Example Raw Input | Token Replacement | Safe-List Protection |
|---|---|---|---|---|
| **Social Security Number** | Strict Regex Pattern `\d{3}[-\s]\d{2}[-\s]\d{4}` | `987-65-4321` | `[SSN_1]` | None (Never valid non-PII) |
| **Email Address** | RFC 5322 Email Regex | `jane.smith@example.com` | `[EMAIL_1]` | None |
| **Phone Number** | North American / International E.164 | `(555) 123-4567` | `[PHONE_1]` | None |
| **Account Numbers** | Context-anchored `Account #`, `Acct:`, `#AC-` | `#AC-99120` | `[ACCOUNT_1]` | Avoids generic numbers |
| **Street Addresses** | Street suffix heuristics & ZIP code matching | `123 Wall Street, Suite 400` | `[ADDRESS_1]` | Avoids institutional addresses |
| **Person Names** | Contextual title prefixes & capitalization NER | `Jane Smith`, `John Doe` | `[CLIENT_1]` | Financial Safelist applies |
| **Client Amounts** | Context-bound dollar balances | `deposit amounting to $1,500,000` | `[AMOUNT_1]` | Avoids index levels & fees |

---

## ⚡ Financial Safe-List (Non-PII Entity Protection)

To avoid destructive over-masking of industry terminology, the engine enforces a strict Financial Safe-List. The following terms are **never** masked as person names or client entities:
- **Indices & Exchanges:** `S&P 500`, `NASDAQ`, `DOW JONES`, `NYSE`, `Russell 2000`
- **Regulators & Standard Bodies:** `SEC`, `FINRA`, `CFTC`, `IRS`, `SIPC`, `FDIC`, `Federal Reserve`
- **Institutional Entities:** `Aegis Wealth Partners`, `Vanguard`, `BlackRock`, `Fidelity`, `Schwab`, `Morgan Stanley`
- **Regulatory Rules:** `Rule 206`, `FINRA 2210`, `Regulation BI`, `Form ADV`, `Form CRS`

---

## ⚠️ Known Limitations & Edge Cases

While the heuristic and regex pipeline achieves high detection recall on standard financial documents, compliance teams must understand the following edge cases:

1. **Uncapitalized or Informal Names in Messy OCR:**
   - *Scenario:* OCR scans producing lowercase names (e.g. `jane smith` without capitalization).
   - *Mitigation:* The system captures names preceded by labels (e.g. `Client: jane smith`, `Agreement for jane smith`), but standalone lowercase names may evade heuristics unless enhanced with a full Python Presidio / Spacy transformer pipeline in production.

2. **Foreign National Identification Numbers:**
   - *Scenario:* Non-US national IDs (e.g. UK National Insurance numbers, European IBANs, Canadian SINs).
   - *Mitigation:* In the current release, SSNs and standard US account formats are prioritized. Enterprise deployments should enable regional Presidio recognizer packs for global jurisdictions.

3. **Homoglyphs and Visual Evasion:**
   - *Scenario:* Malicious inputs replacing Latin characters with visually identical Cyrillic characters (e.g. Cyrillic `а` in `Јаnе Ѕmіth`).
   - *Mitigation:* Handled via input normalization in the red-teaming security suite (`normalizeHomoglyphs()`).

4. **PII Embedded Inside Complex Media (Images / Scanned PDFs):**
   - *Scenario:* Raw text extracted from multi-column tables or scanned stamp images where whitespace interleaving breaks regex boundaries.
   - *Mitigation:* Documents should be passed through a layout-aware document pre-processor before reaching the masking choke point.

5. **Disambiguation of Public Figures vs. Private Clients:**
   - *Scenario:* A document quoting public officials (e.g. *"Federal Reserve Chairman Jerome Powell stated..."*).
   - *Mitigation:* Names following recognized public leadership titles are filtered via the institutional safe-list, but unusual contexts may trigger tokenization as `[CLIENT_n]`. This preserves client privacy without impeding compliance rule evaluation.
