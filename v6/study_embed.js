/* study_embed.js
   Option C: Embedded data-capture UI with auto-fill + CSV export.
   Depends on: study_capture.js (window.StudyCapture)

   Integration points:
   - Patient JSON context: dispatch event 'rt:patient-loaded' with {patient, fileName}
     OR call window.StudyUI.setPatientContext(patient, fileName)
   - Scenario start (optional): call window.StudyUI.markScenarioStart()
   - Scenario complete: call window.StudyUI.openScenario()
*/

(function () {
  'use strict';

  // ---- Utilities ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function nowISO() {
    return new Date().toISOString();
  }

  function getQS(name) {
    const p = new URLSearchParams(window.location.search);
    return p.get(name);
  }

  function safeStr(v) {
    return (v === null || v === undefined) ? '' : String(v);
  }

  function inferScenarioIdFromFile(fileName) {
    if (!fileName) return '';
    return String(fileName).replace(/\.json$/i, '');
  }

  function inferErrorsPresentFromName(name) {
    // Common patterns: MOD_0_errors, MOD_1_error, MOD_2_errors, 0_errors, 1_error, 2_errors
    if (!name) return '';
    const s = String(name);
    const m1 = s.match(/MOD_(\d+)_(?:error|errors)/i);
    if (m1) return parseInt(m1[1], 10);
    const m2 = s.match(/\b(\d+)_(?:error|errors)\b/i);
    if (m2) return parseInt(m2[1], 10);
    return '';
  }

  function inferConfigurationFromQS() {
    // Accept: cfg=H/V, config=horizontal/vertical, configuration=H/V
    const raw = getQS('cfg') || getQS('configuration') || getQS('config');
    if (!raw) return '';
    const v = raw.toLowerCase();
    if (v === 'h' || v.includes('horiz')) return 'Horizontal';
    if (v === 'v' || v.includes('vert')) return 'Vertical';
    return '';
  }

  function inferBolus(patient) {
    // Try a few possible keys; return '' if unknown
    if (!patient) return '';
    const tp = patient.treatmentPlan || {};
    const candidates = [
      tp.bolusRequired,
      tp.bolus,
      tp.bolusFlag,
      tp.requiresBolus
    ];
    for (const c of candidates) {
      if (c === true) return 'Yes';
      if (c === false) return 'No';
      if (typeof c === 'string' && c.trim() !== '') return c.trim();
    }
    return '';
  }

  function getFractionNumber(patient) {
    // If we have totalFractionsDelivered, assume today's fraction = +1
    if (!patient) return '';
    const td = patient.treatmentDelivery || patient.radiationOncologyData?.treatmentDelivery || {};
    const delivered = td.totalFractionsDelivered;
    if (typeof delivered === 'number') return delivered + 1;
    return '';
  }

  function getDefaultField(patient) {
    const fields = patient?.treatmentPlan?.treatmentFields || [];
    if (!fields.length) return null;
    return fields[0];
  }

  function kvp(label, value) {
    return `<span class="study-kvp"><strong>${label}:</strong> ${safeStr(value) || '—'}</span>`;
  }

  // ---- State ----
  const ctx = {
    patient: null,
    patientFile: null,
    scenarioStartedAt: null,
    scenarioEndedAt: null,
    lastConfiguration: inferConfigurationFromQS() || '',
  };

  const STORAGE_LAST_CFG = 'rt_study_last_cfg';
  try {
    const storedCfg = localStorage.getItem(STORAGE_LAST_CFG);
    if (storedCfg && !ctx.lastConfiguration) ctx.lastConfiguration = storedCfg;
  } catch (e) {}

  // ---- UI injection ----
  function ensureStudyCaptureLoaded() {
    if (!window.StudyCapture) {
      alert('StudyCapture library not loaded. Include study_capture.js before study_embed.js');
      return false;
    }
    return true;
  }

  function ensureUI() {
    if ($('#study-modal-overlay')) return;

    // Floating button
    const fab = document.createElement('button');
    fab.className = 'study-fab';
    fab.id = 'study-fab';
    fab.type = 'button';
    fab.textContent = 'Study Log';
    fab.title = 'Open study data entry / export';
    fab.addEventListener('click', () => {
      openScenario();
    });
    document.body.appendChild(fab);

    // Modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'study-modal-overlay';
    overlay.id = 'study-modal-overlay';
    overlay.innerHTML = `
      <div class="study-modal" role="dialog" aria-modal="true" aria-labelledby="study-title">
        <header>
          <h2 id="study-title">Study Data Capture</h2>
          <button class="study-close" type="button" id="study-close">Close</button>
        </header>
        <div class="study-content" id="study-content"></div>
        <div class="study-actions" id="study-actions">
          <div class="left">
            <button type="button" class="secondary" id="study-export">Export CSV</button>
            <button type="button" class="secondary" id="study-export-audit">Export Audit</button>
            <button type="button" id="study-setup">Participant Setup</button>
            <button type="button" class="danger" id="study-clear">Clear Session</button>
          </div>
          <div class="right">
            <button type="button" id="study-cancel">Cancel</button>
            <button type="button" class="primary" id="study-save">Save</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    $('#study-close').addEventListener('click', closeModal);
    $('#study-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Footer buttons
    $('#study-setup').addEventListener('click', renderSetup);
    $('#study-export').addEventListener('click', () => {
      if (!ensureStudyCaptureLoaded()) return;
      // Include optional columns by default; you can toggle to false if you prefer.
      window.StudyCapture.exportCSV({ includeOptional: true, filename: `rt_study_export_${new Date().toISOString().slice(0,10)}.csv` });
    });

    $('#study-export-audit').addEventListener('click', () => {
      if (!ensureStudyCaptureLoaded()) return;
      if (typeof window.StudyCapture.exportAuditCSV !== 'function') {
        alert('Audit export not available (StudyCapture.exportAuditCSV missing).');
        return;
      }
      window.StudyCapture.exportAuditCSV(`rt_audit_log_${new Date().toISOString().slice(0,10)}`);
    });
    $('#study-clear').addEventListener('click', () => {
      if (!ensureStudyCaptureLoaded()) return;
      const ok = confirm('Clear the current participant + all scenario rows from this browser?');
      if (!ok) return;
      window.StudyCapture.clearAll();
      ctx.scenarioStartedAt = null;
      renderSetup();
    });
  }

  function openModal() {
    ensureUI();
    const overlay = $('#study-modal-overlay');
    overlay.style.display = 'block';
  }

  function closeModal() {
    const overlay = $('#study-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ---- Rendering: Participant setup ----
  function renderSetup() {
    if (!ensureStudyCaptureLoaded()) return;
    openModal();

    const session = window.StudyCapture.loadSession();
    const p = session.participant || {};

    $('#study-title').textContent = 'Participant Setup (One-time)';

    const content = $('#study-content');
    content.innerHTML = `
      <div class="study-hint">
        Enter participant details once per session. These fields will auto-populate every scenario row in the export.
      </div>

      <div class="study-divider"></div>

      <div class="study-row study-row-3">
        <div class="study-field">
          <label>Subject ID <span class="study-required">*</span></label>
          <input id="p_subjectId" value="${safeStr(p.subjectId)}" placeholder="e.g., RT001" />
        </div>
        <div class="study-field">
          <label>Years of Experience</label>
          <input id="p_yearsExperience" value="${safeStr(p.yearsExperience)}" placeholder="e.g., 5" />
        </div>
        <div class="study-field">
          <label>Employment Status</label>
          <input id="p_employmentStatus" value="${safeStr(p.employmentStatus)}" placeholder="e.g., Full-time" />
        </div>
      </div>

      <div class="study-row study-row-3">
        <div class="study-field">
          <label>Education Level</label>
          <input id="p_educationLevel" value="${safeStr(p.educationLevel)}" placeholder="e.g., BS" />
        </div>
        <div class="study-field">
          <label>Has used an incident reporting system before</label>
          <select id="p_usedIncidentReporting">
            <option value="" ${p.usedIncidentReporting ? '' : 'selected'}>—</option>
            <option value="Yes" ${p.usedIncidentReporting === 'Yes' ? 'selected' : ''}>Yes</option>
            <option value="No" ${p.usedIncidentReporting === 'No' ? 'selected' : ''}>No</option>
          </select>
        </div>
        <div class="study-field">
          <label>Sex (F, M, NB, Prefer not to say)</label>
          <select id="p_sex">
            <option value="" ${p.sex ? '' : 'selected'}>—</option>
            <option value="F" ${p.sex === 'F' ? 'selected' : ''}>F</option>
            <option value="M" ${p.sex === 'M' ? 'selected' : ''}>M</option>
            <option value="NB" ${p.sex === 'NB' ? 'selected' : ''}>NB</option>
            <option value="Prefer not to say" ${p.sex === 'Prefer not to say' ? 'selected' : ''}>Prefer not to say</option>
          </select>
        </div>
      </div>

      <div class="study-divider"></div>

      <div class="study-inline">
        ${kvp('Current Patient', ctx.patient?.demographics?.name || '')}
        ${kvp('File', ctx.patientFile || '')}
        ${kvp('Suggested Config', ctx.lastConfiguration || '')}
      </div>

      <div class="study-hint">
        Tip: if you pass <code>?cfg=H</code> or <code>?cfg=V</code> in the URL, Configuration will auto-fill in scenario entries.
      </div>
    `;

    // Footer buttons
    $('#study-save').onclick = saveParticipant;
    $('#study-save').textContent = 'Save Participant';
  }

  function saveParticipant() {
    const subjectId = safeStr($('#p_subjectId').value).trim();
    if (!subjectId) {
      alert('Subject ID is required.');
      return;
    }

    const participant = {
      subjectId,
      yearsExperience: safeStr($('#p_yearsExperience').value).trim(),
      employmentStatus: safeStr($('#p_employmentStatus').value).trim(),
      educationLevel: safeStr($('#p_educationLevel').value).trim(),
      usedIncidentReporting: safeStr($('#p_usedIncidentReporting').value).trim(),
      sex: safeStr($('#p_sex').value).trim()
    };

    window.StudyCapture.saveParticipant(participant);
    closeModal();
  }

  // ---- Rendering: Scenario form ----
  function renderScenarioForm(prefill = {}) {
    if (!ensureStudyCaptureLoaded()) return;
    openModal();

    const session = window.StudyCapture.loadSession();
    const p = session.participant || {};
    if (!p.subjectId) {
      renderSetup();
      return;
    }

    const patient = ctx.patient || {};
    const scenarioId = prefill.scenarioId || inferScenarioIdFromFile(ctx.patientFile || getQS('file') || '');
    const errorsPresent = (prefill.errorsPresent !== undefined)
      ? prefill.errorsPresent
      : (patient.studyMeta?.errorsPresent ?? inferErrorsPresentFromName(scenarioId));

    const defaultCfg = prefill.configuration || ctx.lastConfiguration || inferConfigurationFromQS();

    // Patient context values (for reference, not exported)
    const patientName = patient.demographics?.name || '';
    const patientDOB = patient.demographics?.dob || '';
    const txSite = patient.treatmentPlan?.treatmentSite || '';
    const radOnc = patient.treatmentPlan?.radOnc || '';
    const alerts = (patient.treatmentPlan?.therapistAlerts || []).join(' | ');
    const bolus = inferBolus(patient);
    const fxNum = getFractionNumber(patient);
    const field0 = getDefaultField(patient);
    const fieldName = field0?.fieldName || '';
    const gantry = field0?.gantryAngle || field0?.gantryAngle_deg || '';

    $('#study-title').textContent = 'Scenario Entry (Short Form)';

    const content = $('#study-content');
    content.innerHTML = `
      <div class="study-inline">
        ${kvp('Subject', p.subjectId)}
        ${kvp('Patient', patientName)}
        ${kvp('DOB', patientDOB)}
        ${kvp('Site', txSite)}
        ${kvp('Rad Onc', radOnc)}
      </div>

      ${alerts ? `<div class="study-hint"><strong>Therapist alerts on screen:</strong> ${alerts}</div>` : ''}

      <div class="study-divider"></div>

      <div class="study-row study-row-4">
        <div class="study-field">
          <label>Configuration <span class="study-required">*</span></label>
          <select id="s_configuration">
            <option value="" ${defaultCfg ? '' : 'selected'}>—</option>
            <option value="Horizontal" ${defaultCfg === 'Horizontal' ? 'selected' : ''}>Horizontal</option>
            <option value="Vertical" ${defaultCfg === 'Vertical' ? 'selected' : ''}>Vertical</option>
          </select>
          <small>Tip: pass ?cfg=H or ?cfg=V in the URL to auto-fill.</small>
        </div>
        <div class="study-field">
          <label>Scenario ID <span class="study-required">*</span></label>
          <input id="s_scenarioId" value="${safeStr(scenarioId)}" />
          <small>Auto from file name when possible.</small>
        </div>
        <div class="study-field">
          <label># Errors Present</label>
          <input id="s_errorsPresent" type="number" min="0" step="1" value="${safeStr(errorsPresent)}" />
        </div>
        <div class="study-field">
          <label># of Errors Detected</label>
          <input id="s_errorsDetected" type="number" min="0" step="1" value="" />
        </div>
      </div>

      <div class="study-row study-row-4">
        <div class="study-field">
          <label>Errors Detected Correctly (1/0)</label>
          <select id="s_detectedCorrectly">
            <option value="" selected>—</option>
            <option value="1">1</option>
            <option value="0">0</option>
          </select>
          <small>Code after considering missed errors and false positives.</small>
        </div>
        <div class="study-field">
          <label>Confidence: Is ≥1 mismatch present? <span class="study-required">*</span></label>
          <div class="study-confidence-grid" id="s_confidenceGrid" aria-label="Confidence rating 1 to 6">
            <button type="button" class="study-conf-btn" data-raw="1"><div class="study-conf-n">1</div><div class="study-conf-t">Definitely no mismatch</div></button>
            <button type="button" class="study-conf-btn" data-raw="2"><div class="study-conf-n">2</div><div class="study-conf-t">Probably no mismatch</div></button>
            <button type="button" class="study-conf-btn" data-raw="3"><div class="study-conf-n">3</div><div class="study-conf-t">Leaning no mismatch</div></button>
            <button type="button" class="study-conf-btn" data-raw="4"><div class="study-conf-n">4</div><div class="study-conf-t">Leaning mismatch</div></button>
            <button type="button" class="study-conf-btn" data-raw="5"><div class="study-conf-n">5</div><div class="study-conf-t">Probably mismatch</div></button>
            <button type="button" class="study-conf-btn" data-raw="6"><div class="study-conf-n">6</div><div class="study-conf-t">Definitely mismatch</div></button>
          </div>
          <input id="s_confidence" type="hidden" value="" />
          <small>Stored as 0–100 for ROC: 1→0, 2→20, 3→40, 4→60, 5→80, 6→100.</small>
        </div>
        <div class="study-field">
          <label>GazeRecorder export file name <small>(optional)</small></label>
          <input id="s_gazeFile" value="" placeholder="e.g., RT001_H_SetA_S1.csv" />
        </div>
        <div class="study-field">
          <label>Scenario start timestamp <small>(optional)</small></label>
          <input id="s_startedAt" value="${safeStr(ctx.scenarioStartedAt || prefill.startedAt || '')}" placeholder="ISO timestamp" />
          <small>Use StudyUI.markScenarioStart() to auto-fill.</small>
        </div>
      </div>

      <div class="study-divider"></div>

      <div class="study-hint">
        <strong>On-screen reference values (not exported):</strong>
        ${kvp('Bolus', bolus)}
        ${kvp('Fraction (today)', fxNum)}
        ${kvp('Field', fieldName)}
        ${kvp('Gantry', gantry)}
      </div>

      <div class="study-divider"></div>

      <div class="study-row">
        <div class="study-field">
          <label>Situational Awareness (score 1=Correct, 0=Incorrect)</label>
          <div class="study-row">
            ${saSelect('sa_name', 'Patient name', patientName)}
            ${saSelect('sa_dob', 'DOB', patientDOB)}
            ${saSelect('sa_site', 'Treatment site / target anatomy', txSite)}
            ${saSelect('sa_special', 'Special considerations', alerts)}
            ${saSelect('sa_bolus', 'Bolus required', bolus)}
            ${saSelect('sa_fraction', 'Fraction number today', fxNum)}
            ${saSelect('sa_field', 'Current field being delivered', fieldName)}
            ${saSelect('sa_gantry', 'Gantry angle', gantry)}
          </div>
        </div>
        <div class="study-field">
          <label>SA rating scales (1-7)</label>
          <div class="study-row">
            ${ratingSelect('r_unstable', 'How unstable did the situation feel?')}
            ${ratingSelect('r_variability', 'How much variability occurred in tasks?')}
            ${ratingSelect('r_complexity', 'How complex was the situation overall?')}
            ${ratingSelect('r_alert', 'How alert and engaged were you?')}
            ${ratingSelect('r_spare', 'How much spare mental capacity did you feel you had?')}
            ${ratingSelect('r_focus', 'How well were you able to focus?')}
            ${ratingSelect('r_divide', 'How effectively did you divide your attention?')}
            ${ratingSelect('r_clarity', 'How clear and high-quality was the information?')}
            ${ratingSelect('r_quantity', 'How adequate and comprehensive was the quantity of information?')}
            ${ratingSelect('r_familiar', 'How familiar were you with the tasks presented?')}
          </div>
        </div>
      </div>

      <div class="study-divider"></div>

      <div class="study-row study-row-3">
        <div class="study-field">
          <label>NASA-TLX Mental Demand</label>
          <input id="tlx_mental" type="number" step="1" min="0" max="100" placeholder="0-100" />
        </div>
        <div class="study-field">
          <label>NASA-TLX Physical Demand</label>
          <input id="tlx_physical" type="number" step="1" min="0" max="100" placeholder="0-100" />
        </div>
        <div class="study-field">
          <label>NASA-TLX Temporal Demand</label>
          <input id="tlx_temporal" type="number" step="1" min="0" max="100" placeholder="0-100" />
        </div>
      </div>

      <div class="study-row study-row-2">
        <div class="study-field">
          <label>NASA-TLX Performance</label>
          <input id="tlx_performance" type="number" step="1" min="0" max="100" placeholder="0-100" />
        </div>
        <div class="study-field">
          <label>NASA-TLX Effort</label>
          <input id="tlx_effort" type="number" step="1" min="0" max="100" placeholder="0-100" />
        </div>
      </div>

      <div class="study-divider"></div>

      <div class="study-row study-row-3">
        <div class="study-field">
          <label>Eye Tracking Metrics: Fixation duration</label>
          <input id="eye_fixation" placeholder="e.g., mean ms" />
        </div>
        <div class="study-field">
          <label>Eye Tracking Metrics: Saccade frequency</label>
          <input id="eye_saccade" placeholder="e.g., per min" />
        </div>
        <div class="study-field">
          <label>Eye Tracking Metrics: Gaze patterns</label>
          <input id="eye_gaze" placeholder="e.g., notes or code" />
        </div>
      </div>

      <div class="study-divider"></div>
      <div class="study-hint">
        Saving will create one row in the export matching the Excel template columns.
      </div>
    `;

    initConfidenceButtons();

    $('#study-save').onclick = saveScenario;
    $('#study-save').textContent = 'Save Scenario Row';
  }


  // Confidence rating (1–6) mapped to 0–100 for ROC analyses
  const CONFIDENCE_MAP = { '1': 0, '2': 20, '3': 40, '4': 60, '5': 80, '6': 100 };

  function initConfidenceButtons() {
    const grid = $('#s_confidenceGrid');
    const hidden = $('#s_confidence');
    if (!grid || !hidden) return;

    const buttons = Array.from(grid.querySelectorAll('button[data-raw]'));

    // Clear any prior state (modal reuse)
    buttons.forEach((b) => b.classList.remove('active'));

    // Restore selection if a value is already present (e.g., modal reopened)
    const existing = safeStr(hidden.value).trim();
    if (existing !== '') {
      const raw = Object.keys(CONFIDENCE_MAP).find((k) => String(CONFIDENCE_MAP[k]) === String(existing));
      if (raw) {
        buttons.forEach((b) => b.classList.toggle('active', b.getAttribute('data-raw') === raw));
      }
    }

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-raw');
        const mapped = CONFIDENCE_MAP[raw];
        hidden.value = (mapped === undefined) ? '' : String(mapped);
        buttons.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  }

  function saSelect(id, label, truth) {
    const t = safeStr(truth).trim();
    const hint = t ? `Screen shows: ${t}` : 'Screen value not available in JSON';
    return `
      <div class="study-field">
        <label>${label}</label>
        <select id="${id}">
          <option value="" selected>—</option>
          <option value="1">1</option>
          <option value="0">0</option>
        </select>
        <small>${hint}</small>
      </div>
    `;
  }

  function ratingSelect(id, label) {
    let opts = '<option value="" selected>—</option>';
    for (let i = 1; i <= 7; i++) {
      opts += `<option value="${i}">${i}</option>`;
    }
    return `
      <div class="study-field">
        <label>${label}</label>
        <select id="${id}">${opts}</select>
      </div>
    `;
  }

  function saveScenario() {
    if (!ensureStudyCaptureLoaded()) return;

    const configuration = safeStr($('#s_configuration').value).trim();
    const scenarioId = safeStr($('#s_scenarioId').value).trim();
    if (!configuration || !scenarioId) {
      alert('Configuration and Scenario ID are required.');
      return;
    }

    const confidenceStr = safeStr($('#s_confidence').value).trim();
    if (confidenceStr === '') {
      alert('Confidence rating is required.');
      return;
    }

    // Persist last configuration for speed
    ctx.lastConfiguration = configuration;
    try { localStorage.setItem(STORAGE_LAST_CFG, configuration); } catch (e) {}

    const scenario = {
      configuration,
      scenarioId,
      errorsPresent: numOrBlank($('#s_errorsPresent').value),
      errorsDetected: numOrBlank($('#s_errorsDetected').value),
      detectedCorrectly: numOrBlank($('#s_detectedCorrectly').value),

      sa_name: numOrBlank($('#sa_name').value),
      sa_dob: numOrBlank($('#sa_dob').value),
      sa_site: numOrBlank($('#sa_site').value),
      sa_special: numOrBlank($('#sa_special').value),
      sa_bolus: numOrBlank($('#sa_bolus').value),
      sa_fraction: numOrBlank($('#sa_fraction').value),
      sa_field: numOrBlank($('#sa_field').value),
      sa_gantry: numOrBlank($('#sa_gantry').value),

      r_unstable: numOrBlank($('#r_unstable').value),
      r_variability: numOrBlank($('#r_variability').value),
      r_complexity: numOrBlank($('#r_complexity').value),
      r_alert: numOrBlank($('#r_alert').value),
      r_spare: numOrBlank($('#r_spare').value),
      r_focus: numOrBlank($('#r_focus').value),
      r_divide: numOrBlank($('#r_divide').value),
      r_clarity: numOrBlank($('#r_clarity').value),
      r_quantity: numOrBlank($('#r_quantity').value),
      r_familiar: numOrBlank($('#r_familiar').value),

      tlx_mental: numOrBlank($('#tlx_mental').value),
      tlx_physical: numOrBlank($('#tlx_physical').value),
      tlx_temporal: numOrBlank($('#tlx_temporal').value),
      tlx_performance: numOrBlank($('#tlx_performance').value),
      tlx_effort: numOrBlank($('#tlx_effort').value),

      eye_fixation: safeStr($('#eye_fixation').value).trim(),
      eye_saccade: safeStr($('#eye_saccade').value).trim(),
      eye_gaze: safeStr($('#eye_gaze').value).trim(),

      // Optional columns supported by StudyCapture
      gazeFile: safeStr($('#s_gazeFile').value).trim(),
      confidence: numOrBlank($('#s_confidence').value),
      startedAt: safeStr($('#s_startedAt').value).trim(),
      endedAt: (ctx.scenarioEndedAt || nowISO()),
      studyEntryId: `${scenarioId}_${configuration}_${Date.now()}`
    };

    window.StudyCapture.addScenario(scenario);

    // Notify the host UI (e.g., emulator "Record" button handler) that a scenario row was saved.
    // This lets the emulator show a confirmation message and disable the action button only after save.
    try {
      document.dispatchEvent(new CustomEvent('study:scenario-saved', { detail: { scenario } }));
    } catch (e) {}

    // Reset timer for next scenario
    ctx.scenarioStartedAt = null;
    ctx.scenarioEndedAt = null;

    closeModal();
  }

  function numOrBlank(v) {
    const s = safeStr(v).trim();
    if (!s) return '';
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  }

  // ---- Public API ----
  function openScenario() {
    if (!ensureStudyCaptureLoaded()) return;

    const session = window.StudyCapture.loadSession();
    if (!session.participant || !session.participant.subjectId) {
      renderSetup();
      return;
    }

    renderScenarioForm();
  }

  const StudyUI = {
    setPatientContext(patient, fileName) {
      ctx.patient = patient || null;
      ctx.patientFile = fileName || null;
    },
    markScenarioStart(force = false) {
      if (!ctx.scenarioStartedAt || force) {
        ctx.scenarioStartedAt = nowISO();
      }
      // Starting a new scenario invalidates any prior end marker
      ctx.scenarioEndedAt = null;
    },
    markScenarioEnd(force = false) {
      if (!ctx.scenarioEndedAt || force) {
        ctx.scenarioEndedAt = nowISO();
      }
      // If start wasn't marked (e.g., Prepare not clicked), backfill start
      if (!ctx.scenarioStartedAt) {
        ctx.scenarioStartedAt = ctx.scenarioEndedAt;
      }
    },
    openScenario,
    openSetup: renderSetup,
    exportCSV(includeOptional = true) {
      if (!ensureStudyCaptureLoaded()) return;
      window.StudyCapture.exportCSV({ includeOptional, filename: `rt_study_export_${new Date().toISOString().slice(0,10)}.csv` });
    }
  };

  window.StudyUI = StudyUI;
  // Convenience global function for the treatment emulator code to call.
  window.studyScenarioComplete = function (extra) {
    // extra can include configuration/scenarioId/errorsPresent if you want to override auto-inference
    renderScenarioForm(extra || {});
  };

  // ---- Listen for patient-loaded event (if you add it to patient.js) ----
  document.addEventListener('rt:patient-loaded', (e) => {
    const detail = e.detail || {};
    StudyUI.setPatientContext(detail.patient, detail.fileName);
  });

  // Provide a keyboard shortcut in case the floating button is hidden by other UI.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openScenario();
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      renderSetup();
    }
  });

  // Initialize
  ensureUI();

})();
