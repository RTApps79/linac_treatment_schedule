// patient.js
// Patient console & study-capture hooks (Option C)
//
// Key behaviors:
// - Loads patient/scenario JSON via ?file=<name>.json
// - Supports single-view mode via ?view=delivery|imaging|plan|summary
// - "Prepare" marks scenario start (StudyUI.markScenarioStart)
// - "Record" marks scenario end (StudyUI.markScenarioEnd) and opens the Study UI
// - "Record" is hard-gated until all fields are marked treated

// -------------------- Utilities --------------------
function getParam(name, defaultValue = null) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) ?? defaultValue;
}

function safeStr(v) {
  return v === undefined || v === null ? '' : String(v);
}

function escHtml(s) {
  return safeStr(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtNum(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return safeStr(v);
  return n.toFixed(digits);
}

function fmtMU(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return safeStr(v);
  // MU often shown with 1 decimal
  return n.toFixed(1);
}

function isTruthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'yes';
}

// -------------------- Data Loading --------------------
async function loadPatientData(fileName) {
  // Allow passing full relative path (e.g., data/A1.json)
  const path = fileName;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load scenario file: ${path} (${res.status})`);
  return await res.json();
}

// -------------------- Rendering --------------------
function renderSummaryTab(patient) {
  return `
    <div class="tab-panel">
      <div class="card">
        <h2>Patient Summary</h2>
        <div class="info-grid">
          <div><strong>Name:</strong> ${escHtml(patient.name)}</div>
          <div><strong>ID:</strong> ${escHtml(patient.id)}</div>
          <div><strong>DOB:</strong> ${escHtml(patient.dob)}</div>
          <div><strong>Diagnosis:</strong> ${escHtml(patient.diagnosis)}</div>
          <div><strong>Physician:</strong> ${escHtml(patient.physician)}</div>
          <div><strong>Plan ID:</strong> ${escHtml(patient.treatmentPlan?.planId)}</div>
          <div><strong>Treatment Site:</strong> ${escHtml(patient.treatmentPlan?.treatmentSite)}</div>
          <div><strong>Technique:</strong> ${escHtml(patient.treatmentPlan?.technique)}</div>
          <div><strong>Fraction:</strong> ${escHtml(patient.currentFraction)} of ${escHtml(patient.treatmentPlan?.totalFractions)}</div>
        </div>
      </div>

      <div class="card">
        <h3>Prescription & Setup</h3>
        <div class="info-grid">
          <div><strong>Dose per fraction:</strong> ${escHtml(patient.prescription?.dosePerFraction_cGy)} cGy</div>
          <div><strong>Total dose:</strong> ${escHtml(patient.prescription?.totalDose_cGy)} cGy</div>
          <div><strong>Energy:</strong> ${escHtml(patient.prescription?.energy)}</div>
          <div><strong>Imaging:</strong> ${escHtml(patient.prescription?.imagingType)}</div>
          <div><strong>Bolus:</strong> ${escHtml(patient.prescription?.bolus)}</div>
          <div><strong>Notes:</strong> ${escHtml(patient.prescription?.notes)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderImagingTab(patient) {
  const drr = patient.imagingData?.drrImage ? `images/${patient.imagingData.drrImage}` : '';
  const kv = patient.imagingData?.kvImage ? `images/${patient.imagingData.kvImage}` : '';
  const notes = patient.imagingData?.matchNotes || 'No match notes provided.';

  // A simplified look that resembles common IGRT alignment layouts.
  return `
    <div class="tab-panel">
      <div class="card imaging-card">
        <div class="imaging-layout">
          <aside class="imaging-controls">
            <h2>Image Guided Alignment</h2>
            <div class="control-group">
              <div class="control-title">Couch Shifts (cm)</div>
              <div class="shift-row"><span>VRT</span><input class="mini-input" value="${escHtml(patient.imagingData?.couchShifts?.VRT ?? '0.0')}"></div>
              <div class="shift-row"><span>LAT</span><input class="mini-input" value="${escHtml(patient.imagingData?.couchShifts?.LAT ?? '0.0')}"></div>
              <div class="shift-row"><span>LNG</span><input class="mini-input" value="${escHtml(patient.imagingData?.couchShifts?.LNG ?? '0.0')}"></div>
            </div>
            <div class="control-group">
              <div class="control-title">Rotation (°)</div>
              <div class="shift-row"><span>PITCH</span><input class="mini-input" value="${escHtml(patient.imagingData?.couchShifts?.PITCH ?? '0.0')}"></div>
            </div>
            <button class="btn btn-primary" type="button" disabled>Apply Shifts</button>
            <div class="match-notes">
              <strong>Notes:</strong>
              <div>${escHtml(notes)}</div>
            </div>
          </aside>

          <section class="imaging-view">
            <div class="image-row">
              <div class="image-panel">
                <div class="image-title">Reference (DRR/CT)</div>
                <div class="image-frame">
                  ${drr ? `<img src="${escHtml(drr)}" alt="Reference image">` : '<div class="image-placeholder">No DRR image</div>'}
                  <div class="crosshair"></div>
                </div>
              </div>
              <div class="image-panel">
                <div class="image-title">On-board (kV/CBCT)</div>
                <div class="image-frame">
                  ${kv ? `<img src="${escHtml(kv)}" alt="On-board image">` : '<div class="image-placeholder">No kV/CBCT image</div>'}
                  <div class="crosshair"></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderPlanDetailsTab(patient) {
  const fields = Array.isArray(patient.treatmentFields) ? patient.treatmentFields : [];

  return `
    <div class="tab-panel">
      <div class="card">
        <h2>Treatment Plan Details</h2>
        <div class="info-grid">
          <div><strong>Plan ID:</strong> ${escHtml(patient.treatmentPlan?.planId)}</div>
          <div><strong>Site:</strong> ${escHtml(patient.treatmentPlan?.treatmentSite)}</div>
          <div><strong>Technique:</strong> ${escHtml(patient.treatmentPlan?.technique)}</div>
          <div><strong>Fraction:</strong> ${escHtml(patient.currentFraction)} of ${escHtml(patient.treatmentPlan?.totalFractions)}</div>
          <div><strong>Imaging:</strong> ${escHtml(patient.prescription?.imagingType)}</div>
          <div><strong>Bolus:</strong> ${escHtml(patient.prescription?.bolus)}</div>
        </div>
      </div>

      <div class="card">
        <h3>Fields / Beams</h3>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Technique</th>
              <th>Energy (MV)</th>
              <th>MU</th>
              <th>Gantry</th>
              <th>Collimator</th>
            </tr>
          </thead>
          <tbody>
            ${fields.map(f => `
              <tr>
                <td>${escHtml(f.fieldName)}</td>
                <td>${escHtml(f.technique)}</td>
                <td>${escHtml(f.energy_MV)}</td>
                <td>${escHtml(f.monitorUnits)}</td>
                <td>${escHtml(f.gantryAngle)}</td>
                <td>${escHtml(f.collimatorAngle)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderBillingTab(patient) {
  return `
    <div class="tab-panel">
      <div class="card">
        <h2>Record (Study Questions)</h2>
        <p>This button is repurposed for the study. In clinical use, this area would show billing/CPT details.</p>
        <div class="note">In study mode, the questionnaire is launched from the console Record stage.</div>
      </div>
    </div>
  `;
}

function renderTherapyAlerts(patient) {
  const alerts = Array.isArray(patient.therapyAlerts) ? patient.therapyAlerts : [];
  if (!alerts.length) return '<div class="console-alerts empty">No therapist alerts.</div>';
  return `
    <div class="console-alerts">
      <div class="console-alerts-title">Therapist Alerts</div>
      <ul>
        ${alerts.map(a => `<li>${escHtml(a)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderConsoleDeliveryTab(patient) {
  const fields = Array.isArray(patient.treatmentFields) ? patient.treatmentFields : [];
  const fracText = `Fx: ${escHtml(patient.currentFraction)} of ${escHtml(patient.treatmentPlan?.totalFractions)}`;
  const planId = escHtml(patient.treatmentPlan?.planId);

  return `
    <div class="console-ui" id="console-ui">
      <div class="console-header">
        <div class="console-title">Treatment <span class="console-subtitle">Record and Verify mode</span></div>
        <div class="console-header-right">
          <div class="console-user">Primary User: <strong>hup</strong></div>
          <div class="console-orientation">Patient Orientation: <strong>Head First, Supine</strong></div>
        </div>
      </div>

      <div class="console-main">
        <aside class="console-sidebar">
          <div class="console-patient">
            <div class="patient-line"><strong>Name:</strong> ${escHtml(patient.name)}</div>
            <div class="patient-line"><strong>ID:</strong> ${escHtml(patient.id)}</div>
            <div class="patient-line"><strong>DOB:</strong> ${escHtml(patient.dob)}</div>
            <div class="patient-line"><strong>Rad. Onc:</strong> ${escHtml(patient.physician)}</div>
          </div>

          <div class="console-dose">
            <div class="dose-header">
              <div class="dose-plan">${planId}</div>
              <div class="dose-frac">${fracText}</div>
            </div>

            <ul class="field-list" id="field-list">
              ${fields.map((f, idx) => {
                const muTot = fmtMU(f.monitorUnits);
                return `
                  <li class="field-item ${idx === 0 ? 'selected' : ''}" data-field-idx="${idx}">
                    <span class="field-name">${escHtml(f.fieldName)}</span>
                    <span class="field-mu" id="field-mu-${idx}">0.0 / ${muTot}</span>
                    <span class="field-check" id="field-check-${idx}"></span>
                  </li>
                `;
              }).join('')}
            </ul>

            <div class="console-mini">
              <div><strong>Site:</strong> ${escHtml(patient.treatmentPlan?.treatmentSite)}</div>
              <div><strong>Imaging:</strong> ${escHtml(patient.prescription?.imagingType)}</div>
              <div><strong>Bolus:</strong> ${escHtml(patient.prescription?.bolus)}</div>
            </div>
          </div>
        </aside>

        <section class="console-video">
          <div class="video-surface">
            <div class="video-label">Privacy Shade</div>
            <div class="video-placeholder">(Treatment room video feed)</div>
          </div>
          <div class="console-instructions" id="console-instructions">To begin, click Prepare.</div>
        </section>
      </div>

      <div class="console-stagebar" id="console-stagebar">
        <button class="stage-btn active" data-stage="preview" type="button">Preview</button>
        <button class="stage-btn" data-stage="prepare" type="button">Prepare</button>
        <button class="stage-btn" data-stage="ready" type="button" disabled>Ready</button>
        <button class="stage-btn" data-stage="beam" type="button" disabled>Beam On</button>
        <button class="stage-btn" data-stage="record" type="button" disabled>Record</button>
      </div>

      <div class="console-panels">
        <div class="console-panel" id="beam-panel">
          <div class="panel-title">Beam</div>
          <div class="panel-grid">
            <div class="panel-col">
              <div class="panel-col-title">Plan</div>
              <div class="kv-row"><span>Beam Type</span><span id="beam-plan-type">-</span></div>
              <div class="kv-row"><span>Energy</span><span id="beam-plan-energy">-</span></div>
              <div class="kv-row"><span>MU</span><span id="beam-plan-mu">-</span></div>
              <div class="kv-row"><span>Dose/Fx (cGy)</span><span id="beam-plan-dose">-</span></div>
              <div class="kv-row"><span>Bolus</span><span id="beam-plan-bolus">-</span></div>
            </div>
            <div class="panel-col">
              <div class="panel-col-title">Actual</div>
              <div class="kv-row"><span>Beam Type</span><span id="beam-act-type">-</span></div>
              <div class="kv-row"><span>Energy</span><span id="beam-act-energy">-</span></div>
              <div class="kv-row"><span>MU</span><span id="beam-act-mu">-</span></div>
              <div class="kv-row"><span>Dose/Fx (cGy)</span><span id="beam-act-dose">-</span></div>
              <div class="kv-row"><span>Bolus</span><span id="beam-act-bolus">-</span></div>
            </div>
          </div>
        </div>

        <div class="console-panel" id="geom-panel">
          <div class="panel-title">Geometry</div>
          <div class="panel-grid">
            <div class="panel-col">
              <div class="panel-col-title">Plan</div>
              <div class="kv-row"><span>Gantry</span><span id="geom-plan-gantry">-</span></div>
              <div class="kv-row"><span>Collimator</span><span id="geom-plan-coll">-</span></div>
              <div class="kv-row"><span>Jaw Y1</span><span id="geom-plan-y1">-</span></div>
              <div class="kv-row"><span>Jaw Y2</span><span id="geom-plan-y2">-</span></div>
              <div class="kv-row"><span>Jaw X1</span><span id="geom-plan-x1">-</span></div>
              <div class="kv-row"><span>Jaw X2</span><span id="geom-plan-x2">-</span></div>
            </div>
            <div class="panel-col">
              <div class="panel-col-title">Actual</div>
              <div class="kv-row"><span>Gantry</span><span id="geom-act-gantry">-</span></div>
              <div class="kv-row"><span>Collimator</span><span id="geom-act-coll">-</span></div>
              <div class="kv-row"><span>Jaw Y1</span><span id="geom-act-y1">-</span></div>
              <div class="kv-row"><span>Jaw Y2</span><span id="geom-act-y2">-</span></div>
              <div class="kv-row"><span>Jaw X1</span><span id="geom-act-x1">-</span></div>
              <div class="kv-row"><span>Jaw X2</span><span id="geom-act-x2">-</span></div>
            </div>
          </div>
        </div>

        <div class="console-panel" id="bev-panel">
          <div class="panel-title">Beam's Eye View</div>
          <div class="bev-box">
            <div class="bev-placeholder">(MLC/BEV display)</div>
          </div>
        </div>

        ${renderTherapyAlerts(patient)}
      </div>

      <!-- Prepare checklist modal -->
      <div class="modal-overlay hidden" id="prepare-modal">
        <div class="modal">
          <div class="modal-title">Daily Treatment Verification</div>
          <div class="modal-body">
            <label class="modal-check"><input type="checkbox" class="prepare-check"> Patient ID & Face Photo Verified</label>
            <label class="modal-check"><input type="checkbox" class="prepare-check"> Plan & Treatment Site Confirmed</label>
            <label class="modal-check"><input type="checkbox" class="prepare-check"> Immobilization/Indexing Correct</label>
            <label class="modal-check"><input type="checkbox" class="prepare-check"> Machine Clearance Visually Verified</label>
            <label class="modal-check"><input type="checkbox" class="prepare-check"> Therapist Alerts Reviewed</label>
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" id="prepare-confirm" type="button" disabled>Confirm Ready</button>
            <button class="btn btn-danger" id="prepare-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>

    </div>
  `;
}

// -------------------- Console Interaction Logic --------------------
function initConsole(patient, fileName) {
  const fields = Array.isArray(patient.treatmentFields) ? patient.treatmentFields : [];
  const state = {
    selectedFieldIdx: 0,
    stage: 'preview',
    prepared: false,
    deliveryComplete: false,
    deliveredMU: fields.map(() => 0),
    scenarioStartMarked: false,
    scenarioEndMarked: false
  };

  function audit(event, detail = {}) {
    if (window.StudyCapture && typeof window.StudyCapture.auditEvent === 'function') {
      window.StudyCapture.auditEvent(event, {
        t: new Date().toISOString(),
        fileName,
        ...detail
      });
    }
  }

  function setInstruction(text) {
    const el = document.getElementById('console-instructions');
    if (el) el.textContent = text;
  }

  function setStage(stage) {
    state.stage = stage;
    const stagebar = document.getElementById('console-stagebar');
    if (!stagebar) return;
    [...stagebar.querySelectorAll('.stage-btn')].forEach(btn => {
      const s = btn.dataset.stage;
      btn.classList.toggle('active', s === stage);
    });
  }

  function enableStage(stage, enabled) {
    const btn = document.querySelector(`.stage-btn[data-stage="${stage}"]`);
    if (btn) btn.disabled = !enabled;
  }

  function updateFieldSelection(idx) {
    state.selectedFieldIdx = idx;
    const list = document.getElementById('field-list');
    if (list) {
      [...list.querySelectorAll('.field-item')].forEach(li => {
        li.classList.toggle('selected', Number(li.dataset.fieldIdx) === idx);
      });
    }
    updatePanels();
  }

  function updatePanels() {
    const f = fields[state.selectedFieldIdx] || {};

    // Beam panel
    const beamType = f.technique || patient.treatmentPlan?.technique || '-';
    const energy = f.energy_MV != null ? `${f.energy_MV}X` : (patient.prescription?.energy || '-');
    const mu = f.monitorUnits != null ? fmtMU(f.monitorUnits) : '-';
    const doseFx = patient.prescription?.dosePerFraction_cGy ?? '-';
    const bolus = patient.prescription?.bolus ?? '-';

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = safeStr(val);
    };

    setText('beam-plan-type', beamType);
    setText('beam-plan-energy', energy);
    setText('beam-plan-mu', mu);
    setText('beam-plan-dose', doseFx);
    setText('beam-plan-bolus', bolus);

    // For now, "Actual" mirrors the displayed (computer) values.
    // (If you later add a second dataset for machine actuals, you can diverge here.)
    setText('beam-act-type', beamType);
    setText('beam-act-energy', energy);
    setText('beam-act-mu', mu);
    setText('beam-act-dose', doseFx);
    setText('beam-act-bolus', bolus);

    // Geometry panel
    const setGeom = (prefix, obj) => {
      setText(`${prefix}-gantry`, obj.gantryAngle ?? '-');
      setText(`${prefix}-coll`, obj.collimatorAngle ?? '-');
      setText(`${prefix}-y1`, obj.jawY1 ?? '-');
      setText(`${prefix}-y2`, obj.jawY2 ?? '-');
      setText(`${prefix}-x1`, obj.jawX1 ?? '-');
      setText(`${prefix}-x2`, obj.jawX2 ?? '-');
    };

    setGeom('geom-plan', f);
    setGeom('geom-act', f);
  }

  function updateFieldProgress(idx) {
    const f = fields[idx];
    if (!f) return;

    const muTotal = Number(f.monitorUnits) || 0;
    const muDelivered = state.deliveredMU[idx] || 0;

    const muEl = document.getElementById(`field-mu-${idx}`);
    if (muEl) muEl.textContent = `${fmtMU(muDelivered)} / ${fmtMU(muTotal)}`;

    const checkEl = document.getElementById(`field-check-${idx}`);
    if (checkEl) checkEl.textContent = muDelivered >= muTotal ? '✓' : '';
  }

  function updateAllProgress() {
    for (let i = 0; i < fields.length; i++) updateFieldProgress(i);
  }

  function showPrepareModal(show) {
    const modal = document.getElementById('prepare-modal');
    if (!modal) return;
    modal.classList.toggle('hidden', !show);
  }

  function wirePrepareModal() {
    const modal = document.getElementById('prepare-modal');
    if (!modal) return;

    const checks = [...modal.querySelectorAll('.prepare-check')];
    const confirmBtn = document.getElementById('prepare-confirm');
    const cancelBtn = document.getElementById('prepare-cancel');

    const sync = () => {
      const allChecked = checks.every(c => c.checked);
      if (confirmBtn) confirmBtn.disabled = !allChecked;
    };

    checks.forEach(c => c.addEventListener('change', sync));
    sync();

    confirmBtn?.addEventListener('click', () => {
      state.prepared = true;
      audit('prepare_confirm');
      showPrepareModal(false);
      setStage('ready');
      enableStage('ready', true);
      enableStage('beam', true);
      setInstruction('Click Beam On to deliver all fields.');
    });

    cancelBtn?.addEventListener('click', () => {
      audit('prepare_cancel');
      showPrepareModal(false);
      // Leave stage as-is
    });
  }

  function simulateDeliveryFast() {
    // Mark all remaining fields as treated nearly instantly (keeps task time focused on verification).
    for (let i = 0; i < fields.length; i++) {
      const muTotal = Number(fields[i].monitorUnits) || 0;
      state.deliveredMU[i] = muTotal;
    }
    updateAllProgress();
    state.deliveryComplete = true;
    enableStage('record', true);
    setInstruction('Delivery complete. Click Record to finish the scenario.');
  }

  function wireStagebar() {
    const stagebar = document.getElementById('console-stagebar');
    if (!stagebar) return;

    stagebar.addEventListener('click', (e) => {
      const btn = e.target.closest('.stage-btn');
      if (!btn) return;
      const stage = btn.dataset.stage;
      if (btn.disabled) return;

      if (stage === 'preview') {
        setStage('preview');
        setInstruction('To begin, click Prepare.');
        audit('stage_preview');
        return;
      }

      if (stage === 'prepare') {
        setStage('prepare');
        audit('stage_prepare');

        if (!state.scenarioStartMarked && window.StudyUI) {
          window.StudyUI.markScenarioStart();
          state.scenarioStartMarked = true;
          audit('scenario_start_marked');
        }

        // Unlock Ready when prep is complete
        showPrepareModal(true);
        setInstruction('Complete the verification checklist.');
        enableStage('ready', true);
        return;
      }

      if (stage === 'ready') {
        setStage('ready');
        audit('stage_ready');
        if (!state.prepared) {
          // Force checklist if they haven't confirmed
          showPrepareModal(true);
          setInstruction('Complete the verification checklist.');
        } else {
          setInstruction('Click Beam On to deliver all fields.');
        }
        return;
      }

      if (stage === 'beam') {
        setStage('beam');
        audit('stage_beam');
        if (!state.prepared) {
          showPrepareModal(true);
          setInstruction('Complete the verification checklist.');
          return;
        }
        simulateDeliveryFast();
        return;
      }

      if (stage === 'record') {
        setStage('record');
        audit('stage_record');
        if (!state.deliveryComplete) {
          setInstruction('Complete delivery before recording.');
          return;
        }
        if (!state.scenarioEndMarked && window.StudyUI) {
          window.StudyUI.markScenarioEnd();
          state.scenarioEndMarked = true;
          audit('scenario_end_marked');
        }
        // Open the study scenario form
        if (window.StudyUI) {
          window.StudyUI.openScenario();
        } else if (typeof window.studyScenarioComplete === 'function') {
          // fallback
          window.studyScenarioComplete({});
        } else {
          alert('Study UI not loaded.');
        }
        return;
      }
    });
  }

  function wireFieldList() {
    const list = document.getElementById('field-list');
    if (!list) return;
    list.addEventListener('click', (e) => {
      const li = e.target.closest('.field-item');
      if (!li) return;
      const idx = Number(li.dataset.fieldIdx);
      if (!Number.isFinite(idx)) return;
      updateFieldSelection(idx);
      audit('field_select', { idx, fieldName: fields[idx]?.fieldName });
    });
  }

  // Initial UI state
  updatePanels();
  updateAllProgress();
  enableStage('prepare', true);
  enableStage('ready', false);
  enableStage('beam', false);
  enableStage('record', false);
  setStage('preview');
  setInstruction('To begin, click Prepare.');

  wireFieldList();
  wirePrepareModal();
  wireStagebar();

  // Expose for debugging
  window.__consoleState = state;
}

// -------------------- Page Setup --------------------
async function setupPatientPage() {
  const fileName = getParam('file');
  const view = (getParam('view') || 'summary').toLowerCase();

  if (!fileName) {
    document.getElementById('patient-name').textContent = 'No patient file specified.';
    document.getElementById('tab-content').innerHTML = '<div class="card">Missing ?file= parameter.</div>';
    return;
  }

  try {
    const patient = await loadPatientData(fileName);

    // Populate header
    document.getElementById('patient-name').textContent = patient.name || 'Patient';
    document.getElementById('patient-id').textContent = `ID: ${patient.id || ''}`;

    // Provide patient context to StudyUI
    document.dispatchEvent(new CustomEvent('rt:patient-loaded', {
      detail: { patient, fileName }
    }));

    // If view param is present, hide tabs/header for a "monitor" view.
    if (getParam('view')) {
      document.body.classList.add('single-view');
    }

    const tabsContainer = document.getElementById('tabs');
    const tabContent = document.getElementById('tab-content');

    const tabs = [
      { id: 'summary', label: 'Summary', render: () => renderSummaryTab(patient) },
      { id: 'delivery', label: 'Treatment', render: () => renderConsoleDeliveryTab(patient) },
      { id: 'imaging', label: 'Imaging', render: () => renderImagingTab(patient) },
      { id: 'plan', label: 'Plan', render: () => renderPlanDetailsTab(patient) },
      { id: 'billing', label: 'Record', render: () => renderBillingTab(patient) }
    ];

    // Render tab buttons (unless in single-view)
    if (!document.body.classList.contains('single-view')) {
      tabsContainer.innerHTML = tabs.map(t => `
        <button class="tab-btn" data-tab="${t.id}">${t.label}</button>
      `).join('');
    } else {
      // Hide the tab row entirely in single-view
      tabsContainer.innerHTML = '';
      tabsContainer.style.display = 'none';
    }

    function renderTab(tabId) {
      const tab = tabs.find(t => t.id === tabId) || tabs[0];

      // Update active button
      if (!document.body.classList.contains('single-view')) {
        [...tabsContainer.querySelectorAll('.tab-btn')].forEach(btn => {
          btn.classList.toggle('active', btn.dataset.tab === tab.id);
        });
      }

      tabContent.innerHTML = tab.render();

      // Console interaction wiring when delivery tab is shown
      if (tab.id === 'delivery') {
        initConsole(patient, fileName);
      }
    }

    // Tab click handler
    if (!document.body.classList.contains('single-view')) {
      tabsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        renderTab(btn.dataset.tab);
      });
    }

    // Determine initial tab
    const allowed = new Set(tabs.map(t => t.id));
    const initialTab = allowed.has(view) ? view : 'summary';
    renderTab(initialTab);

  } catch (err) {
    console.error(err);
    document.getElementById('tab-content').innerHTML = `
      <div class="card">
        <h2>Error loading patient</h2>
        <p>${escHtml(err.message)}</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', setupPatientPage);
