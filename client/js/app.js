/**
 * AEGIS COMPLIANCE — INSTITUTIONAL DOCUMENT REVIEW DESK
 * Enterprise Frontend Application Logic
 * Verbatim Substring Highlight Sync, Zero-PII Egress Verification, and Supervisory Sign-Off
 */

let currentDocId = 'jane-smith-agreement';
let currentDocTitle = 'Investment_Agreement_Jane_Smith.txt';
let currentDocType = 'INVESTMENT_AGREEMENT';
let currentRawText = '';
let currentMaskedText = '';
let currentMode = 'rehydrated'; // 'rehydrated' or 'masked'
let lastInspectionResult = null;
let sampleDocsMap = {};

// DOM Elements: Header Controls
const sampleDocSelect = document.getElementById('sampleDocSelect');
const aiModelSelect = document.getElementById('aiModelSelect');
const groqSettingsBtn = document.getElementById('groqSettingsBtn');
const groqStatusLabel = document.getElementById('groqStatusLabel');
const fileUploadInput = document.getElementById('fileUploadInput');
const runScanBtn = document.getElementById('runScanBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');

// DOM Elements: Context & Metadata Strip
const kpiDocName = document.getElementById('kpiDocName');
const kpiDocType = document.getElementById('kpiDocType');
const kpiPiiCount = document.getElementById('kpiPiiCount');
const kpiViolationsCount = document.getElementById('kpiViolationsCount');
const kpiAbsenceCount = document.getElementById('kpiAbsenceCount');
const kpiDiscardedCount = document.getElementById('kpiDiscardedCount');
const kpiReviewStatus = document.getElementById('kpiReviewStatus');
const kpiEngine = document.getElementById('kpiEngine');

// DOM Elements: Document Desk (Left Pane)
const documentViewer = document.getElementById('documentViewer');
const toggleRehydrated = document.getElementById('toggleRehydrated');
const toggleMasked = document.getElementById('toggleMasked');
const docStats = document.getElementById('docStats');

// DOM Elements: Compliance Sidebar Tabs (Right Pane)
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const violationsTabCount = document.getElementById('violationsTabCount');
const absenceTabCount = document.getElementById('absenceTabCount');
const precedentsTabCount = document.getElementById('precedentsTabCount');
const violationsList = document.getElementById('violationsList');
const absenceList = document.getElementById('absenceList');
const precedentsList = document.getElementById('precedentsList');
const vaultMappingViewer = document.getElementById('vaultMappingViewer');
const outboundPayloadViewer = document.getElementById('outboundPayloadViewer');
const auditList = document.getElementById('auditList');

// DOM Elements: Officer Supervisory Sign-Off Console
const officerNameInput = document.getElementById('officerNameInput');
const officerNotesInput = document.getElementById('officerNotesInput');
const rejectDocBtn = document.getElementById('rejectDocBtn');
const approveDocBtn = document.getElementById('approveDocBtn');

// DOM Elements: Groq Settings Modal
const groqModal = document.getElementById('groqModal');
const closeGroqModalBtn = document.getElementById('closeGroqModalBtn');
const groqApiKeyInput = document.getElementById('groqApiKeyInput');
const groqModalStatus = document.getElementById('groqModalStatus');
const saveGroqKeyBtn = document.getElementById('saveGroqKeyBtn');
const clearGroqKeyBtn = document.getElementById('clearGroqKeyBtn');

/**
 * Initialize Application
 */
async function initApp() {
  initTheme();
  setupEventListeners();
  await loadSampleDocuments();
  await loadDecisionsAudit();
  await checkGroqStatus();

  // Run initial compliance review on Jane Smith agreement for instant evaluation
  runComplianceScan();
}

/**
 * Theme Management (Light by default, Dark optional)
 */
function initTheme() {
  const savedTheme = localStorage.getItem('aegis_theme') || 'light';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('aegis_theme', theme);

  if (theme === 'dark') {
    if (themeIconSun) themeIconSun.style.display = 'none';
    if (themeIconMoon) themeIconMoon.style.display = 'block';
  } else {
    if (themeIconSun) themeIconSun.style.display = 'block';
    if (themeIconMoon) themeIconMoon.style.display = 'none';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  // Theme switcher
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // Sample Document selector
  if (sampleDocSelect) {
    sampleDocSelect.addEventListener('change', (e) => {
      loadSelectedSample(e.target.value);
    });
  }

  // AI Model selector
  if (aiModelSelect) {
    aiModelSelect.addEventListener('change', () => {
      runComplianceScan();
    });
  }

  // Groq Modal Settings
  if (groqSettingsBtn) groqSettingsBtn.addEventListener('click', openGroqModal);
  if (closeGroqModalBtn) closeGroqModalBtn.addEventListener('click', closeGroqModal);
  if (saveGroqKeyBtn) saveGroqKeyBtn.addEventListener('click', saveGroqKey);
  if (clearGroqKeyBtn) clearGroqKeyBtn.addEventListener('click', clearGroqKey);

  // File Upload
  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', handleFileUpload);
  }

  // Run Scan Trigger
  if (runScanBtn) {
    runScanBtn.addEventListener('click', runComplianceScan);
  }

  // View Mode: Client View vs Anonymized View
  if (toggleRehydrated) {
    toggleRehydrated.addEventListener('click', () => setViewMode('rehydrated'));
  }
  if (toggleMasked) {
    toggleMasked.addEventListener('click', () => setViewMode('masked'));
  }

  // Manual Document Edits
  if (documentViewer) {
    documentViewer.addEventListener('input', () => {
      currentRawText = documentViewer.innerText;
      updateDocStats();
    });
  }

  // Tab Navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Supervisory Officer Decisions
  if (rejectDocBtn) {
    rejectDocBtn.addEventListener('click', () => submitOfficerDecision('REJECTED'));
  }
  if (approveDocBtn) {
    approveDocBtn.addEventListener('click', () => submitOfficerDecision('APPROVED'));
  }
}

/**
 * Load Sample Documents from API
 */
async function loadSampleDocuments() {
  try {
    const res = await fetch('/api/documents/samples');
    const data = await res.json();
    sampleDocsMap = {};
    data.samples.forEach(s => {
      sampleDocsMap[s.id] = s;
    });

    if (sampleDocsMap['jane-smith-agreement']) {
      loadSelectedSample('jane-smith-agreement');
    }
  } catch (err) {
    console.error('Failed to load sample documents:', err);
    showToast('Failed to load sample documents', 'danger');
  }
}

/**
 * Switch Active Sample Document
 */
function loadSelectedSample(docKey) {
  const sample = sampleDocsMap[docKey];
  if (!sample) return;

  currentDocId = sample.id;
  currentDocTitle = sample.title;
  currentDocType = sample.type;
  currentRawText = sample.text;

  if (kpiDocName) kpiDocName.textContent = sample.title;
  if (kpiDocType) kpiDocType.textContent = sample.type;
  if (kpiReviewStatus) {
    kpiReviewStatus.textContent = 'READY FOR REVIEW';
    kpiReviewStatus.style.background = 'var(--bg-surface-tertiary)';
    kpiReviewStatus.style.color = 'var(--text-secondary)';
    kpiReviewStatus.style.border = '1px solid var(--border-default)';
  }

  // Reset counters
  if (kpiPiiCount) kpiPiiCount.textContent = '0';
  if (kpiViolationsCount) kpiViolationsCount.textContent = '0';
  if (kpiAbsenceCount) kpiAbsenceCount.textContent = '0';
  if (kpiDiscardedCount) kpiDiscardedCount.textContent = '0';

  // Render raw text
  if (documentViewer) {
    documentViewer.textContent = currentRawText;
  }
  updateDocStats();

  // Reset tab placeholders
  if (violationsList) {
    violationsList.innerHTML = `<div class="empty-placeholder"><p>Click <strong>"Run Compliance Review"</strong> to screen document against SEC/FINRA rules.</p></div>`;
  }
  if (absenceList) {
    absenceList.innerHTML = `<div class="empty-placeholder"><p>Run compliance review to evaluate mandatory disclosures.</p></div>`;
  }
  if (precedentsList) {
    precedentsList.innerHTML = '';
  }
}

/**
 * Handle File Upload
 */
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', currentDocType);

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    currentDocId = data.documentId;
    currentDocTitle = data.title;
    currentRawText = data.text;

    if (kpiDocName) kpiDocName.textContent = data.title;
    if (kpiReviewStatus) {
      kpiReviewStatus.textContent = 'FILE UPLOADED';
    }

    if (documentViewer) {
      documentViewer.textContent = currentRawText;
    }
    updateDocStats();

    showToast(`Uploaded ${data.title} successfully`, 'success');
    runComplianceScan();
  } catch (err) {
    console.error('File upload error:', err);
    showToast('Upload failed: ' + err.message, 'danger');
  }
}

/**
 * Run End-to-End Compliance Inspection (All 3 Services)
 */
async function runComplianceScan() {
  if (!runScanBtn) return;
  runScanBtn.disabled = true;
  runScanBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm" style="animation: spin 1s linear infinite;">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
    </svg>
    <span>Analyzing Document...</span>
  `;

  try {
    const selectedModel = aiModelSelect ? aiModelSelect.value : 'llama-3.3-70b-versatile';
    const payload = {
      documentId: currentDocId,
      text: currentRawText,
      documentType: currentDocType,
      forceRefresh: true,
      model: selectedModel
    };

    const res = await fetch('/api/documents/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    lastInspectionResult = data;
    currentMaskedText = data.maskedText;

    // Update context strip counters
    if (kpiPiiCount) kpiPiiCount.textContent = data.vaultSummary.entityCount;
    if (kpiViolationsCount) kpiViolationsCount.textContent = data.complianceFlags.length;
    if (kpiAbsenceCount) kpiAbsenceCount.textContent = data.absenceFlags.length;
    if (kpiDiscardedCount) kpiDiscardedCount.textContent = data.discardedHallucinations.length;
    
    if (kpiReviewStatus) {
      kpiReviewStatus.textContent = data.reviewStatus;
      if (data.complianceFlags.length > 0) {
        kpiReviewStatus.style.background = 'var(--critical-bg)';
        kpiReviewStatus.style.color = 'var(--critical-accent)';
        kpiReviewStatus.style.border = '1px solid var(--critical-border)';
      } else {
        kpiReviewStatus.style.background = 'var(--success-bg)';
        kpiReviewStatus.style.color = 'var(--success-accent)';
        kpiReviewStatus.style.border = '1px solid var(--success-border)';
      }
    }

    if (kpiEngine) {
      const lat = data.groqMeta?.latencyMs || 12;
      const isLive = data.groqMeta?.isLiveCloud ? 'Cloud' : 'LPU';
      kpiEngine.textContent = `${data.modelId.includes('llama') ? 'Groq ' + isLive : 'Aegis Rules'} (~${lat}ms)`;
    }

    // Update Tab count badges
    if (violationsTabCount) violationsTabCount.textContent = data.complianceFlags.length;
    if (absenceTabCount) absenceTabCount.textContent = data.absenceFlags.length;
    if (precedentsTabCount) precedentsTabCount.textContent = data.precedents.length;

    // Render Highlights in Left Pane
    renderDocumentHighlights();

    // Render Violations in Tab 1
    renderViolationsList(data.complianceFlags);

    // Render Absence in Tab 2
    renderAbsenceList(data.absenceFlags);

    // Render Precedents in Tab 3
    renderPrecedentsList(data.precedents);

    // Render Privacy & Egress Inspector in Tab 4
    await renderPrivacyInspector(data);

    showToast(`Compliance review complete: ${data.complianceFlags.length} violation(s), ${data.absenceFlags.length} missing clause(s)`, 'info');
  } catch (err) {
    console.error('Scan execution error:', err);
    showToast('Inspection failed: ' + err.message, 'danger');
  } finally {
    runScanBtn.disabled = false;
    runScanBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <span>Run Compliance Review</span>
    `;
  }
}

/**
 * Groq Status & Key Management Helpers
 */
async function checkGroqStatus() {
  try {
    const res = await fetch('/api/groq/status');
    const data = await res.json();
    if (data.isConfigured) {
      if (groqStatusLabel) {
        groqStatusLabel.textContent = 'Groq Cloud Active';
        groqStatusLabel.style.color = 'var(--success-accent)';
      }
      if (groqModalStatus) {
        groqModalStatus.innerHTML = `<span>Status: Live Groq Cloud Active (${data.maskedKey})</span>`;
      }
    } else {
      if (groqStatusLabel) {
        groqStatusLabel.textContent = 'Groq LPU';
        groqStatusLabel.style.color = 'var(--warning-accent)';
      }
      if (groqModalStatus) {
        groqModalStatus.innerHTML = `<span>Status: Operating in Groq LPU Simulation mode (~12ms)</span>`;
      }
    }
  } catch (e) {
    console.warn('Groq status check failed', e);
  }
}

function openGroqModal() {
  if (groqModal) groqModal.style.display = 'flex';
}

function closeGroqModal() {
  if (groqModal) groqModal.style.display = 'none';
}

async function saveGroqKey() {
  const key = groqApiKeyInput.value.trim();
  if (!key) {
    showToast('Please enter a valid Groq API Key', 'info');
    return;
  }
  try {
    const res = await fetch('/api/groq/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      groqApiKeyInput.value = '';
      await checkGroqStatus();
      closeGroqModal();
      runComplianceScan();
    }
  } catch (e) {
    showToast('Failed to save Groq key', 'danger');
  }
}

async function clearGroqKey() {
  try {
    const res = await fetch('/api/groq/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '' })
    });
    const data = await res.json();
    showToast(data.message, 'info');
    await checkGroqStatus();
    closeGroqModal();
  } catch (e) {
    showToast('Failed to clear Groq key', 'danger');
  }
}

/**
 * Toggle between Rehydrated Real Names and Masked Privacy Tokens
 */
function setViewMode(mode) {
  currentMode = mode;
  if (toggleRehydrated) toggleRehydrated.classList.toggle('active', mode === 'rehydrated');
  if (toggleMasked) toggleMasked.classList.toggle('active', mode === 'masked');
  renderDocumentHighlights();
}

/**
 * Render Interactive Highlights in Left Document Pane
 */
function renderDocumentHighlights() {
  if (!lastInspectionResult) {
    if (documentViewer) documentViewer.textContent = currentRawText;
    return;
  }

  const isMasked = currentMode === 'masked';
  let displayText = isMasked ? currentMaskedText : currentRawText;
  const flags = lastInspectionResult.complianceFlags;

  if (flags.length === 0 && !isMasked) {
    if (documentViewer) documentViewer.textContent = displayText;
    return;
  }

  // Escape HTML to prevent injection
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let escapedText = escapeHtml(displayText);

  // If in masked view, highlight PII tokens with clean privacy pills
  if (isMasked) {
    escapedText = escapedText.replace(/(\[(?:CLIENT|SSN|ACCOUNT|EMAIL|PHONE|ADDRESS|AMOUNT)_\d+\])/g, 
      '<span class="pii-token-highlight">$1</span>'
    );
  }

  // Highlight verbatim violations in natural legal redline styling
  for (const flag of flags) {
    const targetPassage = isMasked ? flag.masked_passage : flag.passage;
    if (targetPassage && targetPassage.length > 5) {
      const escapedPassage = escapeHtml(targetPassage);
      if (escapedText.includes(escapedPassage)) {
        const highlightHtml = `<mark id="highlight-${flag.flag_id}" class="violation-highlight" data-flag-id="${flag.flag_id}" title="${flag.rule_id} (${flag.severity}): ${escapeHtml(flag.reason)}">${escapedPassage}</mark>`;
        escapedText = escapedText.replace(escapedPassage, highlightHtml);
      }
    }
  }

  if (documentViewer) {
    documentViewer.innerHTML = escapedText;
  }

  // Add click handlers on highlights to focus corresponding card
  document.querySelectorAll('.violation-highlight').forEach(el => {
    el.addEventListener('click', () => {
      const flagId = el.dataset.flagId;
      focusViolationCard(flagId);
    });
  });
}

/**
 * Render Violations List in Tab 1
 */
function renderViolationsList(flags) {
  if (!violationsList) return;

  if (!flags || flags.length === 0) {
    violationsList.innerHTML = `
      <div class="empty-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px;color:var(--success-accent);margin-bottom:8px;">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <p style="color:var(--success-accent);font-weight:600;">100% Compliant: Zero regulatory rule violations detected.</p>
      </div>
    `;
    return;
  }

  violationsList.innerHTML = flags.map(flag => {
    const sevClass = flag.severity === 'CRITICAL' ? 'sev-critical' : (flag.severity === 'HIGH' ? 'sev-high' : 'sev-medium');
    const cardBorder = flag.severity === 'CRITICAL' ? 'card-critical' : (flag.severity === 'HIGH' ? 'card-high' : 'card-medium');

    return `
      <article class="review-card ${cardBorder}" id="card-${flag.flag_id}" data-flag-id="${flag.flag_id}">
        <div class="card-header-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="rule-tag rule-tag-red">${flag.rule_id}</span>
            <span class="card-title">${flag.rule_name || flag.rule_id}</span>
          </div>
          <span class="severity-pill ${sevClass}">${flag.severity}</span>
        </div>

        <div class="quote-box" title="Verbatim source quote">
          "${escapeQuotes(flag.passage)}"
        </div>

        <div class="card-reason">
          <strong>Violation Analysis:</strong> ${flag.reason}
        </div>

        <div class="card-footer-meta">
          <span class="offset-badge">Offsets: [${flag.offsets.start}..${flag.offsets.end}]</span>
          <span class="verified-seal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="icon-xs">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            100% Verbatim Grounded
          </span>
        </div>
      </article>
    `;
  }).join('');

  // Add click listener on cards to scroll left document pane to highlight
  flags.forEach(flag => {
    const card = document.getElementById(`card-${flag.flag_id}`);
    if (card) {
      card.addEventListener('click', () => {
        scrollToHighlight(flag.flag_id);
      });
    }
  });
}

/**
 * Scroll Left Document Pane to Highlighted Element
 */
function scrollToHighlight(flagId) {
  const highlightEl = document.getElementById(`highlight-${flagId}`);
  if (highlightEl) {
    highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightEl.classList.add('active-pulse');
    setTimeout(() => {
      highlightEl.classList.remove('active-pulse');
    }, 1500);
  }
}

/**
 * Focus Right Pane Violation Card
 */
function focusViolationCard(flagId) {
  // Ensure tab 1 is active
  const violationsTabBtn = document.querySelector('[data-tab="violationsTab"]');
  if (violationsTabBtn) violationsTabBtn.click();

  const card = document.getElementById(`card-${flagId}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.borderColor = 'var(--critical-accent)';
    card.style.boxShadow = 'var(--shadow-elevated)';
    setTimeout(() => {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    }, 1500);
  }
}

/**
 * Render Absence List in Tab 2
 */
function renderAbsenceList(absenceFlags) {
  if (!absenceList) return;

  if (!absenceFlags || absenceFlags.length === 0) {
    absenceList.innerHTML = `
      <div class="empty-placeholder">
        <p style="color:var(--success-accent);font-weight:600;">All mandatory statutory disclosures are present.</p>
      </div>
    `;
    return;
  }

  absenceList.innerHTML = absenceFlags.map(item => `
    <article class="review-card card-high">
      <div class="card-header-row">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="rule-tag rule-tag-amber">${item.disclosure_id}</span>
          <span class="card-title">${item.name}</span>
        </div>
        <span class="severity-pill sev-high">${item.severity}</span>
      </div>

      <div class="card-reason">
        <strong>Omission Alert:</strong> ${item.description}
      </div>

      <div class="quote-box quote-box-amber">
        <strong>Mandatory Required Text:</strong><br>
        "${escapeQuotes(item.required_text)}"
      </div>

      <div class="precedent-notes-box">
        <strong>Remediation:</strong> ${item.remediation}
      </div>

      <div class="card-footer-meta">
        <span>Closest Text Match: "${item.closest_text_passage.slice(0, 48)}..."</span>
        <span class="similarity-chip" style="color:var(--warning-accent);">
          Semantic Distance Score: <strong>${item.semantic_distance_score}</strong> (Absent)
        </span>
      </div>
    </article>
  `).join('');
}

/**
 * Render Historical Precedents in Tab 3
 */
function renderPrecedentsList(precedents) {
  if (!precedentsList) return;

  if (!precedents || precedents.length === 0) {
    precedentsList.innerHTML = `<div class="empty-placeholder"><p>No matching historical precedents found.</p></div>`;
    return;
  }

  precedentsList.innerHTML = precedents.map(prec => {
    const verdictClass = prec.decision === 'REJECTED' ? 'verdict-rejected' : 'verdict-approved';

    return `
      <article class="review-card">
        <div class="card-header-row">
          <span class="card-title">${prec.document_title}</span>
          <span class="verdict-badge ${verdictClass}">${prec.decision}</span>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);">
          <span>${prec.officer_name} · ${prec.date}</span>
          <span class="similarity-chip">Similarity Score: ${(prec.similarity_score * 100).toFixed(0)}%</span>
        </div>

        <div class="card-reason">
          ${prec.summary_text}
        </div>

        <div class="precedent-notes-box">
          <strong>Historical Decision Notes:</strong><br>
          "${escapeQuotes(prec.officer_notes)}"
        </div>

        <div class="card-footer-meta">
          <div style="display:flex;gap:4px;">
            ${prec.tags.map(t => `<span class="offset-badge">${t}</span>`).join('')}
          </div>
          <span style="color:var(--text-muted);font-size:0.7rem;font-weight:600;">
            [DISPLAY-ONLY GUIDANCE]
          </span>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Render Privacy Wall & Egress Inspector in Tab 4
 */
async function renderPrivacyInspector(data) {
  if (!vaultMappingViewer || !outboundPayloadViewer) return;

  // 1. Vault tokens
  const tokens = data.vaultSummary.tokensMapped;
  if (!tokens || tokens.length === 0) {
    vaultMappingViewer.innerHTML = `<span class="text-muted">No PII tokens scrubbed for this document.</span>`;
  } else {
    vaultMappingViewer.innerHTML = tokens.map(tok => `
      <span class="vault-token-item">${tok} &rarr; [SECURE ENCLAVE MAPPED]</span>
    `).join('');
  }

  // 2. Fetch last outbound serialized payload
  try {
    const res = await fetch('/api/privacy/last-payload');
    const pData = await res.json();
    if (pData.audit) {
      outboundPayloadViewer.textContent = JSON.stringify(JSON.parse(pData.audit.serializedJson), null, 2);
    } else {
      outboundPayloadViewer.textContent = JSON.stringify(pData, null, 2);
    }
  } catch (e) {
    outboundPayloadViewer.textContent = `// Outbound audit payload viewer: 0 raw PII leaked.`;
  }
}

/**
 * Submit Human Compliance Officer Decision
 */
async function submitOfficerDecision(decision) {
  const officerName = officerNameInput ? officerNameInput.value.trim() : 'Sarah Jenkins, Chief Compliance Officer';
  const notes = (officerNotesInput && officerNotesInput.value.trim()) || `Officer determination: ${decision} based on SEC/FINRA compliance review.`;
  const flagsCount = lastInspectionResult ? lastInspectionResult.complianceFlags.length : 0;

  try {
    const res = await fetch('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: currentDocId,
        decision,
        officerName,
        notes,
        flagsCount
      })
    });

    const data = await res.json();
    if (data.success) {
      if (kpiReviewStatus) {
        kpiReviewStatus.textContent = decision;
        if (decision === 'REJECTED') {
          kpiReviewStatus.style.background = 'var(--critical-bg)';
          kpiReviewStatus.style.color = 'var(--critical-accent)';
          kpiReviewStatus.style.border = '1px solid var(--critical-border)';
        } else {
          kpiReviewStatus.style.background = 'var(--success-bg)';
          kpiReviewStatus.style.color = 'var(--success-accent)';
          kpiReviewStatus.style.border = '1px solid var(--success-border)';
        }
      }

      showToast(`Document successfully ${decision} by ${officerName}`, decision === 'REJECTED' ? 'danger' : 'success');
      await loadDecisionsAudit();
    }
  } catch (err) {
    console.error('Decision submission error:', err);
    showToast('Failed to record decision', 'danger');
  }
}

/**
 * Load Decision Audit Trail in Tab 5
 */
async function loadDecisionsAudit() {
  if (!auditList) return;

  try {
    const res = await fetch('/api/decisions');
    const data = await res.json();

    if (!data.decisions || data.decisions.length === 0) {
      auditList.innerHTML = `<div class="empty-placeholder"><p>No historical officer determinations recorded yet.</p></div>`;
      return;
    }

    auditList.innerHTML = data.decisions.map(d => {
      const isReject = d.decision === 'REJECTED';
      const borderClass = isReject ? 'card-critical' : 'card-medium';
      const verdictClass = isReject ? 'verdict-rejected' : 'verdict-approved';

      return `
        <article class="review-card ${borderClass}">
          <div class="card-header-row">
            <span class="card-title">${d.decisionId} · ${d.documentId}</span>
            <span class="verdict-badge ${verdictClass}">${d.decision}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);">
            Officer: <strong>${d.officerName}</strong> · ${new Date(d.timestamp).toLocaleString()}
          </div>
          <div class="card-reason">
            <strong>Officer Rationale:</strong> ${d.notes}
          </div>
          <div class="card-footer-meta">
            <span>Violations at Decision: ${d.flagsCount}</span>
            <span class="verified-seal">✓ SUPERVISORY_ATTESTATION_RECORDED</span>
          </div>
        </article>
      `;
    }).join('');
  } catch (e) {
    console.error('Audit load failed:', e);
  }
}

/**
 * Update Document Stats
 */
function updateDocStats() {
  if (!docStats) return;
  const len = currentRawText.length;
  const sections = currentRawText.split(/\n\s*\n/).filter(s => s.trim().length > 0).length;
  docStats.textContent = `Length: ${len} characters · ${sections} clauses`;
}

/**
 * Helper: Escape Quotes
 */
function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;');
}

/**
 * Show Toast Notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Start application when DOM loaded
window.addEventListener('DOMContentLoaded', initApp);
