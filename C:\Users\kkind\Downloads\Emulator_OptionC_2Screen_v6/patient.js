// ---- Study UI helper: allow the emulator to disable a button only after a scenario row is saved ----
let __RT_LAST_ACTION = null;

// Try to wire StudyUI.markScenarioStart() to a "Prepare" action/button if it exists in the emulator UI.
// Optional: if no Prepare button is found, the study still works (start time will remain blank or be set later).
function __rtWirePrepareStartMarker() {
    try {
        if (!window.StudyUI || typeof window.StudyUI.markScenarioStart !== 'function') return;

        const selectors = [
            '#prepare-btn',
            '#btn-prepare',
            '#prepare',
            '[data-action="prepare"]',
            '[data-testid="prepare"]'
        ];

        let btn = null;
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) { btn = el; break; }
        }

        // Fallback: look for a button with visible text "Prepare"
        if (!btn) {
            const candidates = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
            btn = candidates.find(el => ((el.textContent || el.value || '').trim().toLowerCase() === 'prepare')) || null;
        }

        if (!btn) return;
        if (btn.__rtStudyBound) return; // avoid double-binding
        btn.__rtStudyBound = true;

        btn.addEventListener('click', () => {
            window.StudyUI.markScenarioStart(false);
        }, true);
    } catch (e) {
        console.warn('Prepare→markScenarioStart wiring failed:', e);
    }
}


document.addEventListener('study:scenario-saved', (e) => {
    const action = __RT_LAST_ACTION;
    if (!action) return;
    try {
        if (action.msgEl) {
            action.msgEl.textContent = action.message || 'Saved.';
            action.msgEl.style.display = 'block';
        }
        if (action.btn) {
            action.btn.disabled = true;
            action.btn.style.backgroundColor = '#6c757d';
        }
    } finally {
        __RT_LAST_ACTION = null;
    }
});


// -----------------------------
// Study helper wiring (mode/version pills, Prepare modal, open Imaging screen)
// -----------------------------
function __rtGetMode() {
    try {
        if (window.StudyConfig && (window.StudyConfig.mode === 'study' || window.StudyConfig.mode === 'demo')) {
            return window.StudyConfig.mode;
        }
    } catch (e) {}
    return 'study';
}

function __rtSetHeaderPills() {
    const vPill = document.getElementById('emulator-version-pill');
    const mPill = document.getElementById('study-mode-pill');
    if (vPill) {
        const v = window.StudyConfig && window.StudyConfig.version ? window.StudyConfig.version : 'v?';
        const d = window.StudyConfig && window.StudyConfig.buildDate ? window.StudyConfig.buildDate : '';
        vPill.textContent = d ? `Emulator ${v} (${d})` : `Emulator ${v}`;
    }
    if (mPill) {
        const mode = __rtGetMode();
        mPill.textContent = mode === 'demo' ? 'Mode: Demo' : 'Mode: Study';
        mPill.classList.toggle('pill-demo', mode === 'demo');
        mPill.classList.toggle('pill-study', mode !== 'demo');
    }
}

function __rtWireOpenImagingButton(fileName) {
    const btn = document.getElementById('open-imaging-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const mode = __rtGetMode();
        const url = `imaging.html?file=${encodeURIComponent(fileName)}&mode=${encodeURIComponent(mode)}`;
        window.open(url, '_blank', 'noopener');
    });
}

function __rtWirePrepareModal() {
    const openBtn = document.getElementById('prepare-open-btn');
    const overlay = document.getElementById('prepare-modal');
    const closeBtn = document.getElementById('prepare-close');
    const cancelBtn = document.getElementById('prepare-cancel');
    const confirmBtn = document.getElementById('prepare-confirm');
    const checks = Array.from(document.querySelectorAll('.prep-check'));

    if (!openBtn || !overlay) return;

    // State
    window.__rtScenarioStarted = window.__rtScenarioStarted || false;

    const updateConfirmEnabled = () => {
        if (!confirmBtn) return;
        const allChecked = checks.length ? checks.every(c => c.checked) : true;
        confirmBtn.disabled = !allChecked;
    };

    const open = () => {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        updateConfirmEnabled();
    };

    const close = () => {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
    };

    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    checks.forEach(c => c.addEventListener('change', updateConfirmEnabled));

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            window.__rtScenarioStarted = true;

            // Mark scenario start (used for task time computation)
            if (window.StudyUI && typeof window.StudyUI.markScenarioStart === 'function') {
                window.StudyUI.markScenarioStart();
            }

            // Audit log
            if (window.StudyCapture && typeof window.StudyCapture.logEvent === 'function') {
                window.StudyCapture.logEvent('scenario_start', { file: window.__rtActiveFileName || '' });
            }

            // Enable end-marker button (Capture Codes / Record) if present
            const captureBtn = document.getElementById('capture-codes-btn');

    // Study-mode gating: disable end-marker until Prepare is confirmed
    try {
        const mode = __rtGetMode();
        if (mode !== 'demo' && !window.__rtScenarioStarted) {
            captureBtn.disabled = true;
            captureBtn.title = 'Disabled until Prepare is confirmed.';
        }
    } catch (e) {}

            if (captureBtn) captureBtn.disabled = false;
            captureBtn.title = '';

            close();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    __rtSetHeaderPills();
    __rtWirePrepareModal();
    const params = new URLSearchParams(window.location.search);
    const fileName = params.get('file');

    if (!fileName) {
        document.getElementById('patient-name-header').textContent = 'Error: No Patient File';
        return;
    }

    __rtWireOpenImagingButton(fileName);
    window.__rtActiveFileName = fileName;

    fetch(`data/${fileName}`)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(patient => {
            document.getElementById('patient-name-header').textContent = `Chart: ${patient.demographics.name}`;

            // ---- Study capture context (Option C) ----
            try {
                window.__RT_CURRENT_PATIENT = patient;
                window.__RT_CURRENT_PATIENT_FILE = fileName;
                if (window.StudyUI && typeof window.StudyUI.setPatientContext === 'function') {
                    window.StudyUI.setPatientContext(patient, fileName);
                }
                document.dispatchEvent(new CustomEvent('rt:patient-loaded', { detail: { patient: patient, fileName: fileName } }));
            } catch (e) {
                console.warn('Study context dispatch failed:', e);
            }


            // --- Populate All Tab Panes ---
            populateSummaryTab(patient);
            populateDeliveryTab(patient);
            populateBillingTab(patient);
            populatePlanTab(patient);
            initializeImagingTab(patient);
            populateRecordsTab(patient);
            populateDemographicsTab(patient);

            // Attempt to bind Prepare→ScenarioStart after dynamic UI is rendered
            __rtWirePrepareStartMarker();

            // --- Tab Switching Logic ---
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabPanes = document.querySelectorAll('.tab-pane');
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    tabPanes.forEach(pane => pane.classList.remove('active'));
                    button.classList.add('active');
                    document.getElementById(button.dataset.tab).classList.add('active');
                });
            });
        })
        .catch(error => {
            console.error('Error fetching patient details:', error);
            document.getElementById('patient-name-header').textContent = 'Error Loading Chart';
        });
});

function populateSummaryTab(patient) {
    const summaryPane = document.getElementById('summary');
    const diagnosis = patient.diagnosis || {};
    const treatmentPlan = patient.treatmentPlan || {};
    const demographics = patient.demographics || {};
    summaryPane.innerHTML = `
        <div class="patient-grid-container">
            <div class="grid-column">
                <div class="detail-card">
                    <h2>Plan Overview</h2>
                    <div class="card-content">
                        <p><strong>Oncologist:</strong> ${treatmentPlan.radOnc || 'N/A'}</p>
                        <p><strong>Site:</strong> ${treatmentPlan.treatmentSite || 'N/A'}</p>
                        <p><strong>Rx:</strong> ${treatmentPlan.rtRxDetails || 'N/A'}</p>
                    </div>
                </div>
                <div class="detail-card">
                    <h2>Therapist Alerts</h2>
                    <div class="card-content">
                        <ul>${(treatmentPlan.therapistAlerts || ['None']).map(alert => `<li>${alert}</li>`).join('')}</ul>
                    </div>
                </div>
            </div>
            <div class="grid-column">
                 <div class="detail-card">
                    <h2>Patient Info</h2>
                    <div class="card-content">
                        <p><strong>Patient ID:</strong> ${patient.patientId || 'N/A'}</p>
                        <p><strong>DOB:</strong> ${demographics.dob || 'N/A'}</p>
                    </div>
                </div>
                <div class="detail-card">
                    <h2>Diagnosis</h2>
                    <div class="card-content">
                        <p><strong>Primary:</strong> ${diagnosis.primary || 'N/A'}</p>
                        <p><strong>Stage:</strong> ${diagnosis.overallStage || 'N/A'}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function populateDeliveryTab(patient) {
    const deliveryPane = document.getElementById('delivery');
    const plan = patient.treatmentPlan || {};
    const prescription = plan.prescription || {};
    const deliveryData = patient.radiationOncologyData || {};
    const treatmentDelivery = deliveryData.treatmentDelivery || {};
    const fractions = treatmentDelivery.fractions || [];
    const totalFractions = prescription.numberOfFractions || 'N/A';
    const deliveredFractions = fractions.length;
    
    deliveryPane.innerHTML = `
        <div class="delivery-container">
            <div class="delivery-header">
                <h2>Record Treatment Delivery</h2>
                <div id="fraction-counter">Fraction ${deliveredFractions + 1} of ${totalFractions}</div>
            </div>
            <div class="form-group">
                <label for="treatment-date">Treatment Date</label>
                <input type="date" id="treatment-date" name="treatment-date">
            </div>
            <div class="form-group">
                <label for="therapist-notes">Therapist Notes / Side Effects</label>
                <textarea id="therapist-notes" rows="4" placeholder="Enter notes for today's session..."></textarea>
            </div>
            <button id="record-treatment-btn" class="action-button">Record Treatment</button>
            <div id="delivery-confirmation" class="confirmation-message"></div>
        </div>
    `;
    
    document.getElementById('treatment-date').valueAsDate = new Date();
    const recordBtn = document.getElementById('record-treatment-btn');
    recordBtn.onclick = (evt) => {
        evt.preventDefault();
        const confirmationMsg = document.getElementById('delivery-confirmation');

        // Open the embedded study questions when the user clicks "Record".
        // The button is disabled only after the participant saves the scenario row.
        __RT_LAST_ACTION = {
            btn: recordBtn,
            msgEl: confirmationMsg,
            message: `Study responses saved. Fraction ${deliveredFractions + 1} recorded.`
        };

        // Mark the natural end of the scenario at the moment the participant clicks Record.
        try { if (window.StudyUI && typeof window.StudyUI.markScenarioEnd === 'function') window.StudyUI.markScenarioEnd(false); } catch (e) {}

        if (window.studyScenarioComplete && typeof window.studyScenarioComplete === 'function') {
            window.studyScenarioComplete({});
        } else if (window.StudyUI && typeof window.StudyUI.openScenario === 'function') {
            window.StudyUI.openScenario();
        } else {
            alert('Study questions UI is not loaded. Ensure study_capture.js and study_embed.js are included.');
        }
    };
}

function populateBillingTab(patient) {
    const billingPane = document.getElementById('billing');
    const charges = patient.cptCharges || [];
    const dailyCodes = charges.filter(c => c.frequency && c.frequency.toLowerCase().includes('daily'));
    let tableHTML = `
        <table>
            <thead>
                <tr><th>Capture</th><th>CPT Code</th><th>Description</th></tr>
            </thead>
            <tbody>`;
    if (dailyCodes.length > 0) {
        dailyCodes.forEach(code => {
            tableHTML += `<tr>
                <td><input type="checkbox" checked></td>
                <td>${code.code}</td>
                <td>${code.description}</td>
            </tr>`;
        });
    } else {
        tableHTML += `<tr><td colspan="3">No daily CPT codes found.</td></tr>`;
    }
    tableHTML += `</tbody></table>`;
    
    billingPane.innerHTML = `
        <div class="billing-container">
            <h2>CPT Code Capture for Today's Session</h2>
            <div id="cpt-table-container">${tableHTML}</div>
            <button id="capture-codes-btn" class="action-button">Capture Selected Codes</button>
            <div id="billing-confirmation" class="confirmation-message"></div>
        </div>
    `;
    
    const captureBtn = document.getElementById('capture-codes-btn');

    // Study-mode gating: disable end-marker until Prepare is confirmed
    try {
        const mode = __rtGetMode();
        if (mode !== 'demo' && !window.__rtScenarioStarted) {
            captureBtn.disabled = true;
            captureBtn.title = 'Disabled until Prepare is confirmed.';
        }
    } catch (e) {}

    captureBtn.onclick = (evt) => {
        evt.preventDefault();
        const confirmationMsg = document.getElementById('billing-confirmation');

        // If you prefer using the Billing/CPT workflow step as the study prompt, this button can also open the questions.
        __RT_LAST_ACTION = {
            btn: captureBtn,
            msgEl: confirmationMsg,
            message: 'Study responses saved.'
        };

        // Audit log
        try {
            if (window.StudyCapture && typeof window.StudyCapture.logEvent === 'function') {
                window.StudyCapture.logEvent('record_clicked', {
                    file: window.__rtActiveFileName || '',
                    patientId: patient.patientId || patient.id || '',
                    patientName: patient.demographics?.name || patient.name || ''
                });
            }
        } catch (e) {}

        // Mark the natural end of the scenario at the moment the participant clicks Record/Capture.
        try { if (window.StudyUI && typeof window.StudyUI.markScenarioEnd === 'function') window.StudyUI.markScenarioEnd(false); } catch (e) {}

        if (window.studyScenarioComplete && typeof window.studyScenarioComplete === 'function') {
            window.studyScenarioComplete({});
        } else if (window.StudyUI && typeof window.StudyUI.openScenario === 'function') {
            window.StudyUI.openScenario();
        } else {
            alert('Study questions UI is not loaded. Ensure study_capture.js and study_embed.js are included.');
        }
    };
}

function populatePlanTab(patient) {
    const planPane = document.getElementById('plan');
    const treatmentPlan = patient.treatmentPlan || {};
    const fields = treatmentPlan.treatmentFields || [];
    let fieldsHTML = fields.map(field => `
        <div class="field-details">
            <h4>${field.fieldName || 'N/A'} (${field.technique || 'N/A'})</h4>
            <p><strong>Energy:</strong> ${field.energy_MV} MV | <strong>MU:</strong> ${field.monitorUnits}</p>
            <p><strong>Gantry:</strong> ${field.gantryAngle}° | <strong>Collimator:</strong> ${field.collimatorAngle}°</p>
            <p><strong>Jaws (cm):</strong> X1:${field.jawPositions_cm.X1}, X2:${field.jawPositions_cm.X2}, Y1:${field.jawPositions_cm.Y1}, Y2:${field.jawPositions_cm.Y2}</p>
        </div>
    `).join('');
    planPane.innerHTML = `
        <div class="detail-card full-width">
            <h2>Detailed Treatment Plan</h2>
            <div class="card-content">
                <p><strong>Radiation Oncologist:</strong> ${treatmentPlan.radOnc || 'N/A'}</p>
                <p><strong>Prescription:</strong> ${treatmentPlan.rtRxDetails || 'N/A'}</p>
                ${fieldsHTML}
            </div>
        </div>
    `;
}

function populateRecordsTab(patient) {
    const recordsPane = document.getElementById('records');
    const deliveryData = patient.radiationOncologyData || {};
    const treatmentDelivery = deliveryData.treatmentDelivery || {};
    const records = treatmentDelivery.fractions || [];
    let recordsHTML = records.length > 0 ? `
        <div class="records-table">
            <div class="records-header">
                <div>#</div><div>Date</div><div>Side Effects / Notes</div>
            </div>
            ${records.map(fx => `
                <div class="records-row">
                    <div>${fx.fractionNumber}</div>
                    <div>${fx.date}</div>
                    <div>${fx.sideEffects || fx.notes || 'None noted'}</div>
                </div>
            `).join('')}
        </div>` : '<p>No treatment records found.</p>';
    recordsPane.innerHTML = `
        <div class="detail-card full-width">
            <h2>Treatment Records & History</h2>
            <div class="card-content">${recordsHTML}</div>
        </div>
    `;
}

function populateDemographicsTab(patient) {
    const demoPane = document.getElementById('demographics');
    const demographics = patient.demographics || {};
    demoPane.innerHTML = `
        <div class="detail-card full-width">
            <h2>Full Demographics Details</h2>
            <div class="card-content">
                <p><strong>Patient ID:</strong> ${patient.patientId || 'N/A'}</p>
                <p><strong>Name:</strong> ${demographics.name || 'N/A'}</p>
                <p><strong>DOB:</strong> ${demographics.dob || 'N/A'}</p>
                <p><strong>Address:</strong> ${demographics.address || 'N/A'}</p>
                <p><strong>Phone:</strong> ${demographics.phone || 'N/A'}</p>
                <p><strong>Referring MD:</strong> ${demographics.referringPhysician || 'N/A'}</p>
            </div>
        </div>
    `;
}

function initializeImagingTab(patient) {
    const drrImage = document.getElementById('drr-image');
    const overlay = document.getElementById('kv-image-overlay');
    const opacitySlider = document.getElementById('opacity-slider');
    const controlBtns = document.querySelectorAll('.control-btn');
    const resetBtn = document.getElementById('reset-shifts');
    const applyBtn = document.getElementById('apply-shifts');
    const shiftConfirmation = document.getElementById('shift-confirmation');

    if (patient.imagingData && drrImage && overlay) {
        drrImage.src = `images/${patient.imagingData.drrImage}`;
        overlay.src = `images/${patient.imagingData.kvImage}`;
    } else {
        console.error("Image elements or imagingData not found for this patient.");
    }

    const inputs = {
        x: document.getElementById('x-axis'),
        y: document.getElementById('y-axis'),
        z: document.getElementById('z-axis'),
        pitch: document.getElementById('pitch-axis')
    };

    let shifts = { x: 0, y: 0, z: 0, pitch: 0 };
    let initialRandomShifts = {
        x: (Math.random() * 2 - 1).toFixed(1),
        y: (Math.random() * 2 - 1).toFixed(1),
        z: (Math.random() * 2 - 1).toFixed(1),
        pitch: (Math.random() * 2 - 1).toFixed(1)
    };

    function applyTransform() {
        const totalX = (parseFloat(shifts.x) + parseFloat(initialRandomShifts.x)) * 10;
        const totalY = (parseFloat(shifts.y) + parseFloat(initialRandomShifts.y)) * 10;
        overlay.style.transform = `translate(${totalX}px, ${totalY}px) rotate(${shifts.pitch}deg)`;
    }

    function updateDisplay() {
        for (const axis in shifts) {
            if (inputs[axis]) {
                inputs[axis].value = shifts[axis].toFixed(1);
            }
        }
        applyTransform();
    }
    
    applyTransform();

    opacitySlider.addEventListener('input', (e) => {
        overlay.style.opacity = e.target.value / 100;
    });

    controlBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const axis = e.target.dataset.axis;
            const dir = parseInt(e.target.dataset.dir, 10);
            const step = (axis === 'pitch') ? 0.1 : 0.1;
            
            shifts[axis] += dir * step;
            if (shifts[axis] > 5.0) shifts[axis] = 5.0;
            if (shifts[axis] < -5.0) shifts[axis] = -5.0;

            updateDisplay();
            shiftConfirmation.style.display = 'none';
        });
    });

    resetBtn.addEventListener('click', () => {
        shifts = { x: 0, y: 0, z: 0, pitch: 0 };
        updateDisplay();
        shiftConfirmation.style.display = 'none';
        applyBtn.disabled = false;
    });

    applyBtn.addEventListener('click', () => {
        const appliedShifts = `Shifts Applied: VRT=${shifts.y.toFixed(1)}, LAT=${shifts.x.toFixed(1)}, LNG=${shifts.z.toFixed(1)}, PITCH=${shifts.pitch.toFixed(1)}°`;
        shiftConfirmation.textContent = appliedShifts;
        shiftConfirmation.style.display = 'block';
        applyBtn.disabled = true;
    });
    
    let isDragging = false;
    let startPos = { x: 0, y: 0 };
    overlay.addEventListener('mousedown', (e) => {
        isDragging = true;
        startPos.x = e.clientX;
        startPos.y = e.clientY;
        overlay.style.cursor = 'grabbing';
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        overlay.style.cursor = 'grab';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = (e.clientX - startPos.x) / 10;
        const dy = (e.clientY - startPos.y) / 10;
        shifts.x += dx;
        shifts.y += dy;
        startPos.x = e.clientX;
        startPos.y = e.clientY;
        updateDisplay();
        shiftConfirmation.style.display = 'none';
    });
}
