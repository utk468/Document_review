/**
 * Unified API Routes for Compliance Review System
 */

import express from 'express';
import multer from 'multer';
import rulesData from '../rules/complianceRules.json' with { type: 'json' };
import { maskDocument, rehydrateText, getVaultMapping } from '../services/piiMasker.js';
import { maskedLlmClient } from '../services/maskedLlmClient.js';
import { inspectDocument } from '../services/inspectionAgent.js';
import { evaluateAbsence } from '../services/absenceEngine.js';
import { lookupPrecedents } from '../services/precedentService.js';
import { auditLogger } from '../services/auditLogger.js';
import { groqService } from '../services/groqClient.js';

const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Built-in Sample Documents for One-Click Officer Review
const SAMPLE_DOCUMENTS = {
  'jane-smith-agreement': {
    id: 'jane-smith-agreement',
    title: 'Investment_Agreement_Jane_Smith.txt',
    type: 'INVESTMENT_AGREEMENT',
    text: `Investment Agreement for Jane Smith (SSN: 987-65-4321, Account #AC-99120).
Address: 123 Wall Street, Suite 400, New York, NY 10005. Contact: jane.smith@example.com, (555) 123-4567. Initial portfolio deposit amounting to $1,500,000.

We guarantee Jane Smith an 18% annual return on investment without any market risk.
Our proprietary trading strategy eliminates volatility and ensures astronomical gains.
All advisory services are managed under personal discretion.`
  },
  'alpha-growth-brochure': {
    id: 'alpha-growth-brochure',
    title: 'Horizon_Alpha_Growth_Brochure.txt',
    type: 'MARKETING_BROCHURE',
    text: `Horizon Alpha Growth Fund Investor Brochure.
Advisor: Robert Miller, Contact: r.miller@horizonfunds.com, (212) 555-8833.
Managed for Client Name: John Doe (Account #AC-44109).

This fund is designed to skyrocket your capital with limitless upside and pure upside performance.
Historical 10x gains without disclosing net fees show our superior algorithm.
Simulated backtest proves our model portfolio generated 25% annual return with zero risk.`
  },
  'wealth-newsletter': {
    id: 'wealth-newsletter',
    title: 'Private_Wealth_Quarterly_Newsletter.txt',
    type: 'NEWSLETTER',
    text: `Private Wealth Advisory - Quarterly Tax & Wealth Insights.
Authored by Chief Strategist David Vance.

Act immediately before regulators close this off-book opportunity.
Our exclusive in-house fund guarantees a completely tax-exempt guarantee and avoids all IRS taxes.
Wire directly to personal account to bypass compliance verification.`
  },
  'compliant-agreement': {
    id: 'compliant-agreement',
    title: 'Compliant_Wealth_Management_Agreement.txt',
    type: 'INVESTMENT_AGREEMENT',
    text: `Investment Advisory Agreement for Client: Sarah Connor (SSN: 321-54-9876, Account #AC-11204).
Contact: sarah.connor@example.com, (415) 555-9012. Portfolio balance of $250,000.

Advisory services provided by Aegis Wealth Partners, a Registered Investment Adviser with the U.S. Securities and Exchange Commission (SEC). Registration does not imply a certain level of skill or training.

All investments involve risk of loss, including the possible loss of principal invested. Diversification does not assure profit or protect against loss.

Past performance is no guarantee of future results. Investment value and returns will fluctuate, and investors may lose money.`
  }
};

// 1. Get Compliance Rules
router.get('/rules', (req, res) => {
  res.json({ rules: rulesData, total: rulesData.length });
});

// 2. Get Sample Documents
router.get('/documents/samples', (req, res) => {
  const samples = Object.values(SAMPLE_DOCUMENTS).map(d => ({
    id: d.id,
    title: d.title,
    type: d.type,
    text: d.text,
    length: d.text.length
  }));
  res.json({ samples });
});

// 3. Document Upload (File or Raw Text)
router.post('/documents/upload', upload.single('file'), (req, res) => {
  let text = '';
  let filename = 'Uploaded_Document.txt';
  let documentType = req.body.documentType || 'INVESTMENT_AGREEMENT';

  if (req.file) {
    filename = req.file.originalname;
    text = req.file.buffer.toString('utf8');
  } else if (req.body.text) {
    text = req.body.text;
    filename = req.body.title || 'Pasted_Document.txt';
  } else {
    return res.status(400).json({ error: 'No file or document text provided' });
  }

  const documentId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  res.json({
    documentId,
    title: filename,
    documentType,
    text,
    charLength: text.length
  });
});

// 4. Service 1 PII Masking Preview Endpoint
router.post('/documents/mask', (req, res) => {
  const { documentId = 'preview-doc', text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing text to mask' });
  }

  const result = maskDocument(text, documentId);
  res.json(result);
});

// 5. Groq AI Status & Settings
router.get('/groq/status', (req, res) => {
  res.json({
    isConfigured: groqService.isConfigured(),
    maskedKey: groqService.getMaskedKey(),
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Groq: Llama 3.3 70B Versatile', speed: 'Ultra-Fast (~150ms)', context: '128k' },
      { id: 'llama-3.1-8b-instant', name: 'Groq: Llama 3.1 8B Instant', speed: 'Lightning (~80ms)', context: '128k' },
      { id: 'mixtral-8x7b-32768', name: 'Groq: Mixtral 8x7B 32k', speed: 'High (~200ms)', context: '32k' },
      { id: 'aegis-native-grounded', name: 'Aegis Native Rule Engine', speed: 'Deterministic Real-time', context: 'Native' }
    ]
  });
});

router.post('/groq/key', (req, res) => {
  const { apiKey } = req.body;
  const ok = groqService.setApiKey(apiKey);
  res.json({
    success: true,
    isConfigured: ok,
    maskedKey: groqService.getMaskedKey(),
    message: ok ? 'Groq Cloud API Key saved and activated!' : 'Groq API Key cleared, switched to LPU simulation mode.'
  });
});

// 6. Full End-to-End Compliance Inspection (All 3 Services + Groq AI)
router.post('/documents/inspect', async (req, res) => {
  try {
    const {
      documentId = 'doc-inspect',
      text,
      documentType = 'INVESTMENT_AGREEMENT',
      forceRefresh = false,
      model = 'llama-3.3-70b-versatile'
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing text to inspect' });
    }

    // SERVICE 1: Masking
    const maskResult = maskDocument(text, documentId);

    // SERVICE 2: Inspection & Verbatim Substring Validation (Powered by Groq / Grounded Agent)
    const inspectionResult = await inspectDocument({
      documentId,
      rawText: text,
      documentType,
      forceRefresh,
      model
    });

    // SERVICE 3: Absence Engine (Missing Disclosures)
    const absenceFlags = evaluateAbsence(text, documentType);

    // SERVICE 3: Precedent Lookup (Vector Similarity)
    const precedents = lookupPrecedents(text, 3);

    // Dynamic Server Vault status
    const vault = getVaultMapping(documentId);

    // Build unified response payload
    const responsePayload = {
      documentId,
      documentType,
      modelId: model,
      groqMeta: inspectionResult.groqMeta,
      originalText: text,
      maskedText: maskResult.maskedText,
      vaultSummary: {
        entityCount: maskResult.entityCount,
        entitiesScrubbed: maskResult.entitiesScrubbed,
        tokensMapped: vault ? Object.keys(vault.tokenToRaw) : []
      },
      inspectionSummary: inspectionResult.analysisSummary,
      complianceFlags: inspectionResult.flags,
      discardedHallucinations: inspectionResult.discardedHallucinations,
      absenceFlags: absenceFlags,
      precedents: precedents,
      humanInTheLoopNotice: inspectionResult.humanInTheLoopNotice,
      reviewStatus: inspectionResult.review_status,
      timestamp: new Date().toISOString()
    };

    res.json(responsePayload);
  } catch (err) {
    console.error('Inspection error:', err);
    res.status(500).json({ error: 'Inspection failure', details: err.message });
  }
});

// 6. Dev-Only Outbound LLM Payload Inspector
router.get('/privacy/last-payload', (req, res) => {
  const audit = maskedLlmClient.getLastOutboundAudit();
  if (!audit) {
    return res.json({
      status: 'No outbound AI calls made yet',
      audit: null
    });
  }
  res.json({
    status: 'AUDITED_ZERO_RAW_PII_LEAK',
    audit
  });
});

// 7. Human Officer Decision (Approve / Reject)
router.post('/decision', (req, res) => {
  const { documentId, decision, officerName, notes, flagsCount } = req.body;
  if (!documentId || !decision) {
    return res.status(400).json({ error: 'Missing documentId or decision' });
  }

  try {
    const record = auditLogger.recordDecision({
      documentId,
      decision,
      officerName,
      notes,
      flagsCount
    });
    res.json({ success: true, record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Get Decision Audit Trail
router.get('/decisions', (req, res) => {
  const { documentId } = req.query;
  const history = auditLogger.getDecisions(documentId);
  res.json({ decisions: history });
});

// 9. Rehydrate endpoint
router.post('/documents/rehydrate', (req, res) => {
  const { maskedText, documentId } = req.body;
  if (!maskedText || !documentId) {
    return res.status(400).json({ error: 'Missing maskedText or documentId' });
  }
  const rehydrated = rehydrateText(maskedText, documentId);
  res.json({ rehydrated });
});

export default router;
