# Compliance Inspection AI — Empirical Evaluation Benchmark Report

Generated at: 2026-10-06T15:46:56.601Z  
Corpus Size: **25 Test Documents** (including 6 Clean Controls and 19 Adversarial/Planted Violation Documents)  
Evaluated Rules: **10 SEC/FINRA Compliance Rules**

---

## 📊 Summary Performance Metrics

| Metric | Score | Target Standard | Status |
|---|---|---|---|
| **Macro Precision** | **100.0%** | $\ge 95.0\%$ | ✅ PASS |
| **Macro Recall** | **100.0%** | $\ge 95.0\%$ | ✅ PASS |
| **Macro F1-Score** | **100.0%** | $\ge 95.0\%$ | ✅ PASS |
| **Clean Control Accuracy** | **100.0%** | $100.0\%$ | ✅ PASS |
| **Absence Engine Accuracy** | **100.0%** | $\ge 90.0\%$ | ✅ PASS |
| **Verbatim Quote Grounding** | **100.0%** | $100.0\%$ | ✅ PASS |

---

## 📋 Per-Rule Precision & Recall Matrix

| Rule ID | Severity | TP | FP | FN | TN | Precision | Recall | F1-Score |
|---|---|---|---|---|---|---|---|---|
| `FINRA-2210` | **CRITICAL** | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| `SEC-RULE-206` | **CRITICAL** | 2 | 0 | 0 | 23 | 100.0% | 100.0% | 100.0% |
| `FINRA-2210-BAL` | **HIGH** | 4 | 0 | 0 | 21 | 100.0% | 100.0% | 100.0% |
| `SEC-MARKETING-PERF` | **HIGH** | 3 | 0 | 0 | 22 | 100.0% | 100.0% | 100.0% |
| `SEC-REG-BI` | **HIGH** | 3 | 0 | 0 | 22 | 100.0% | 100.0% | 100.0% |
| `CFTC-4.41` | **HIGH** | 2 | 0 | 0 | 23 | 100.0% | 100.0% | 100.0% |
| `FINRA-3280` | **CRITICAL** | 2 | 0 | 0 | 23 | 100.0% | 100.0% | 100.0% |
| `SEC-FEES-101` | **MEDIUM** | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| `FINRA-TAX-WARN` | **MEDIUM** | 2 | 0 | 0 | 23 | 100.0% | 100.0% | 100.0% |
| `FINRA-2010` | **HIGH** | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |

---

## 🛡️ Anti-Hallucination & Absence Choke Point Verification

1. **Anti-Hallucination Substring Validator**:
   - 100% of rendered flags matched source text verbatim.
   - Character offsets verified for precision highlight positioning.
   - Discarded ungrounded flags automatically.

2. **Absence Engine**:
   - Accurately flagged missing `DISC-09` (Past Performance), `DISC-02` (Loss of Principal), and `DISC-12` (Tax Counsel) disclosures.
   - Computed semantic distance scores between target text and candidate passages.

3. **Precedent Context Guardrail**:
   - Confirmed precedent cases are strictly read-only for officer UI context and never injected into detection prompts.
