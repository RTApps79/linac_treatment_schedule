// =========================================
// GLOBAL STATE & CONFIGURATION
// =========================================

let currentPatientData = null;
let currentFieldsList = [];
let selectedFieldIndex = 0;
// Set to store indices of completed fields
let treatedFieldIndices = new Set(); 

// UI Modes & Workflow State
let isReorderMode = false;
let isDeactivateMode = false;
let overrideRequired = false;
// States: PREVIEW, PREPARE, READY, BEAM_ON, RECORD
let workflowState = 'PREVIEW'; 
let isDelivering = false;
let deliveryAnimationId = null;

const TOLERANCES = { angle: 2.0, position: 0.5, mu: 2.0 };

// Mock MLC Data (fallback)
const MOCK_MLC_DATA = {
    'default': { BankA: Array(20).fill(15), BankB: Array(20).fill(15) }
};

// =========================================
// INITIALIZATION
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const fileName = params.get('file');

    if (!fileName) {
        console.error('No patient file.');
        document.getElementById('pt-name').textContent = 'Error: No File Found';
        return;
    }

    const cacheBuster = new Date().getTime();
    fetch(`data/${fileName}?v=${cacheBuster}`)
        .then(res => { if (!res.ok) throw new Error('Fetch failed.'); return res.json(); })
        .then(data => {
            currentPatientData = data;
            if (data.treatmentPlan && data.treatmentPlan.treatmentFields) {
                currentFieldsList = data.treatmentPlan.treatmentFields.map(f => ({...f, active: true}));
            }
            initializeTreatmentConsole(data);
        })
        .catch(err => { console.error(err); document.getElementById('pt-name').textContent = 'Error Loading Data'; });

    initializeButtons();
    initializeModals();
});


function initializeTreatmentConsole(patient) {
    document.getElementById('current-date').textContent = new Date().toLocaleString();
    const demo = patient.demographics || {};
    document.getElementById('pt-name').textContent = demo.name || 'N/A';
    document.getElementById('pt-id').textContent = patient.patientId || 'N/A';
    document.getElementById('pt-dob').textContent = demo.dob || 'N/A';
    const plan = patient.treatmentPlan || {};
    document.getElementById('pt-physician').textContent = plan.radOnc || 'N/A';
    document.getElementById('plan-id-header').textContent = plan.planId || 'Plan ID';

    populateFieldList();
    updateWorkflowUI();

    let deliveredFx = 0;
    if (patient.radiationOncologyData && patient.radiationOncologyData.treatmentDelivery) {
         deliveredFx = (patient.radiationOncologyData.treatmentDelivery.fractions || []).length;
    }
    document.getElementById('fx-counter').textContent = deliveredFx + 1;
    document.getElementById('fx-total').textContent = plan.prescription ? plan.prescription.numberOfFractions : '-';
}


// =========================================
// SIDEBAR FIELD LIST LOGIC
// =========================================

function populateFieldList() {
    const listContainer = document.getElementById('field-list-items');
    listContainer.innerHTML = '';

    if (currentFieldsList.length === 0) {
        listContainer.innerHTML = '<li style="padding: 10px; font-style: italic;">No fields defined.</li>';
        updateFieldParameters(null);
        return;
    }

    if (selectedFieldIndex >= currentFieldsList.length) selectedFieldIndex = 0;

    currentFieldsList.forEach((fieldItem, index) => {
        const li = document.createElement('li');
        if (index === selectedFieldIndex && fieldItem.active) li.classList.add('active');
        if (!fieldItem.active) li.classList.add('deactivated');
        if (treatedFieldIndices.has(index)) li.classList.add('treated');
        
        let iconHtml = fieldItem.isImaging ? '<i class="fa-solid fa-camera icon"></i>' : '';
        let muDisplay = fieldItem.isImaging ? '' : `<span style="margin-left: auto;">0.0 / ${fieldItem.monitorUnits}</span>`;

        li.innerHTML = `
            <i class="fa-solid fa-bars drag-handle"></i>
            <input type="checkbox" class="field-checkbox" ${fieldItem.active ? 'checked' : ''}>
            ${iconHtml}
            <span class="field-name-span">${fieldItem.fieldName}</span>
            ${muDisplay}
            <i class="fa-solid fa-circle-check treated-icon"></i>
        `;

        if (fieldItem.isImaging) li.classList.add('imaging-field');

        li.draggable = true; li.dataset.index = index;

        li.addEventListener('click', (e) => {
            if (e.target.classList.contains('field-checkbox') || e.target.classList.contains('drag-handle')) return;
            if (fieldItem.active && !isDelivering) {
                selectedFieldIndex = index;
                populateFieldList(); 
            }
        });

        const checkbox = li.querySelector('.field-checkbox');
        checkbox.addEventListener('change', (e) => {
             fieldItem.active = e.target.checked;
             if (!fieldItem.active && index === selectedFieldIndex) {
                 const nextActive = currentFieldsList.findIndex(f => f.active);
                 selectedFieldIndex = nextActive !== -1 ? nextActive : 0;
             }
             populateFieldList(); 
        });

        // Drag and drop handlers (omitted for brevity, same as previous version)
        li.addEventListener('dragstart', (e) => { if(!isReorderMode) {e.preventDefault(); return;} e.dataTransfer.setData('text/plain', index); li.style.opacity = '0.5'; });
        li.addEventListener('dragend', () => { li.style.opacity = '1'; });
        li.addEventListener('dragover', (e) => { e.preventDefault(); });
        li.addEventListener('drop', (e) => { e.preventDefault(); if(!isReorderMode) return; const fromIdx = parseInt(e.dataTransfer.getData('text/plain')); const toIdx = index; const item = currentFieldsList.splice(fromIdx, 1)[0]; currentFieldsList.splice(toIdx, 0, item); if(selectedFieldIndex === fromIdx) selectedFieldIndex = toIdx; populateFieldList(); });


        listContainer.appendChild(li);
    });

    const selectedField = currentFieldsList[selectedFieldIndex];
    updateFieldParameters(selectedField && selectedField.active ? selectedField : null);
}


// =========================================
// MAIN CONTENT UPDATE LOGIC
// =========================================

function updateFieldParameters(field) {
    // Reset States if not delivering
    if (!isDelivering) {
        overrideRequired = false;
        document.getElementById('tolerance-warning').style.display = 'none';
        document.getElementById('btn-override').disabled = true;
        document.querySelectorAll('.value-box').forEach(el => el.classList.remove('out-of-tolerance'));
        document.querySelector('.mu-progress-fill').style.width = '0%';
        document.getElementById('mu-actual-display').textContent = '0.0';
    }

    const formatVal = (val, fixed = 1) => (val !== undefined && val !== null) ? Number(val).toFixed(fixed) : '-';
    const formatText = (val) => (val !== undefined && val !== null) ? val : '-';

    if (!field || field.isImaging) {
        document.querySelectorAll('.treatment-data-container .value-box:not(.highlighted)').forEach(el => el.textContent = '-');
        document.getElementById('mu-total-plan').textContent = '-';
        drawBEV(null);
        return;
    }

    // Update Plan Values
    document.getElementById('beam-type-plan').textContent = formatText(field.beamTypeDisplay);
    document.getElementById('energy-plan').textContent = formatText(field.energyDisplay);
    document.getElementById('mu-total-plan').textContent = formatVal(field.monitorUnits, 1);
    document.getElementById('dose-rate-plan').textContent = formatVal(field.doseRate, 0);
    document.getElementById('time-plan').textContent = formatVal(field.estimatedTime_min, 2);
    document.getElementById('wedge-plan').textContent = formatText(field.wedgeInfo);
    document.getElementById('bolus-plan').textContent = formatText(field.bolusInfo);
    document.getElementById('gantry-plan').textContent = formatText(field.gantryAngle);
    document.getElementById('coll-plan').textContent = formatVal(field.collimatorAngle, 1);
    document.getElementById('couch-rtn-plan').textContent = formatVal(field.couchAngle, 1);
    const jaws = field.jawPositions_cm || {};
    document.getElementById('y1-plan').textContent = formatVal(jaws.Y1); document.getElementById('y2-plan').textContent = formatVal(jaws.Y2);
    document.getElementById('x1-plan').textContent = formatVal(jaws.X1); document.getElementById('x2-plan').textContent = formatVal(jaws.X2);
    const couch = field.couchCoordinates_cm || {};
    document.getElementById('couch-vrt-plan').textContent = formatVal(couch.vertical, 2);
    document.getElementById('couch-lng-plan').textContent = formatVal(couch.longitudinal, 2);
    document.getElementById('couch-lat-plan').textContent = formatVal(couch.lateral, 2);
    document.getElementById('couch-pitch-plan').textContent = formatVal(field.pitchAngle, 1);
    document.getElementById('couch-roll-plan').textContent = formatVal(field.rollAngle, 1);

    // Update Actuals (Simulated match for now)
    if (!isDelivering) {
        document.getElementById('beam-type-actual').textContent = formatText(field.beamTypeDisplay);
        document.getElementById('energy-actual').textContent = formatText(field.energyDisplay);
        document.getElementById('dose-rate-actual').textContent = formatVal(field.doseRate, 0);
        document.getElementById('time-actual').textContent = '0.00';
        document.getElementById('wedge-actual').textContent = formatText(field.wedgeInfo);
        document.getElementById('bolus-actual').textContent = formatText(field.bolusInfo);
        document.getElementById('gantry-actual').textContent = formatText(field.gantryAngle);
        document.getElementById('coll-actual').textContent = formatVal(field.collimatorAngle, 1);
        document.getElementById('couch-rtn-actual').textContent = formatVal(field.couchAngle, 1);
        document.getElementById('y1-actual').textContent = formatVal(jaws.Y1); document.getElementById('y2-actual').textContent = formatVal(jaws.Y2);
        document.getElementById('x1-actual').textContent = formatVal(jaws.X1); document.getElementById('x2-actual').textContent = formatVal(jaws.X2);
        document.getElementById('couch-vrt-actual').textContent = formatVal(couch.vertical, 2);
        document.getElementById('couch-lng-actual').textContent = formatVal(couch.longitudinal, 2);
        document.getElementById('couch-lat-actual').textContent = formatVal(couch.lateral, 2);
        document.getElementById('couch-pitch-actual').textContent = formatVal(field.pitchAngle, 1);
        document.getElementById('couch-roll-actual').textContent = formatVal(field.rollAngle, 1);
    }

    drawBEV(field);
}


// =========================================
// WORKFLOW & DELIVERY LOGIC
// =========================================

function updateWorkflowUI() {
    const steps = document.querySelectorAll('#workflow-bar .flow-step');
    steps.forEach(s => {
        s.className = 'flow-step'; // Reset
    });

    const statusText = document.getElementById('machine-status-text');

    switch(workflowState) {
        case 'PREVIEW':
            document.getElementById('btn-preview').classList.add('workflow-active');
            statusText.textContent = "To begin, click Prepare.";
            break;
        case 'PREPARE':
            document.getElementById('btn-prepare').classList.add('workflow-active');
            statusText.textContent = "Completing pre-treatment checks...";
            break;
        case 'READY':
            document.getElementById('btn-ready').classList.add('workflow-ready-green');
            statusText.textContent = "Ready for Beam On.";
            break;
        case 'BEAM_ON':
            document.getElementById('btn-beam-on').classList.add('workflow-beam-on-red');
            statusText.textContent = "BEAM ON - DELIVERING TREATMENT";
            break;
        case 'RECORD':
            document.getElementById('btn-record').classList.add('workflow-active');
             statusText.textContent = "Treatment complete. Proceed to Record.";
            break;
    }
}


function runBeamDeliverySimulation(field, fieldIndex) {
    isDelivering = true;
    workflowState = 'BEAM_ON';
    updateWorkflowUI();
    disableToolbar(true);

    const totalMU = field.monitorUnits;
    let currentMU = 0;
    // Calculate MU increment per frame for approx 5 seconds duration at 60fps
    const muPerFrame = totalMU / (5 * 60); 
    const startTime = Date.now();
    const estimatedTimeSec = (field.estimatedTime_min || 0.5) * 60;

    function animateDelivery() {
        currentMU += muPerFrame;
        const elapsedSec = (Date.now() - startTime) / 1000;

        if (currentMU >= totalMU) {
            // Finish Delivery
            currentMU = totalMU;
            isDelivering = false;
            cancelAnimationFrame(deliveryAnimationId);
            
            treatedFieldIndices.add(fieldIndex);
            workflowState = 'READY'; // Go back to ready state for next field
            
            // Check if all active treatment fields are done
            const allActiveTreated = currentFieldsList
                .filter(f => f.active && !f.isImaging)
                .every((f, idx) => treatedFieldIndices.has(idx));
            
            if (allActiveTreated) {
                workflowState = 'RECORD';
            }

            updateWorkflowUI();
            populateFieldList(); // Update treated icon
            disableToolbar(false);
            showNotification(`Field '${field.fieldName}' Completed.`);
        } else {
            // Continue Animation
            deliveryAnimationId = requestAnimationFrame(animateDelivery);
        }

        // Update UI during delivery
        document.getElementById('mu-actual-display').textContent = currentMU.toFixed(1);
        const progress = (currentMU / totalMU) * 100;
        document.querySelector('.mu-progress-fill').style.width = `${progress}%`;
        document.getElementById('time-actual').textContent = (elapsedSec / 60).toFixed(2);
        
        // Redraw BEV with animation flags
        drawBEV(field, true, progress/100);
    }

    deliveryAnimationId = requestAnimationFrame(animateDelivery);
}

function disableToolbar(disabled) {
     document.querySelectorAll('.status-tool-bar button').forEach(btn => btn.disabled = disabled);
     // Always ensure close button is usable if not delivering
     if(!disabled) document.getElementById('btn-close-patient').disabled = false;
}


// =========================================
// BEAM'S EYE VIEW (Canvas Drawing)
// =========================================

function drawBEV(field, isAnimating = false, progress = 0) {
    const canvas = document.getElementById('bev-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
    const width = canvas.width; const height = canvas.height;
    const centerX = width / 2; const centerY = height / 2;
    const scale = width / 30; 

    ctx.clearRect(0, 0, width, height);
    
    // Background/DRR Placeholder
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.min(width, height) / 2 * 0.95, 0, 2 * Math.PI);
    ctx.fillStyle = isAnimating ? '#442222' : '#333'; // Red tint during delivery
    ctx.fill(); ctx.strokeStyle = '#555'; ctx.stroke();
    
    if (!field || field.isImaging) { 
        ctx.fillStyle = '#eee'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
        ctx.fillText(field && field.isImaging ? "Imaging View" : "No Field Selected", centerX, centerY);
        return;
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    ctx.strokeStyle = isAnimating ? 'rgba(255, 255, 50, 0.8)' : 'rgba(255, 50, 50, 0.6)';
    ctx.lineWidth = 1; ctx.stroke();

    // Dynamic Wedge Simulation (animating Y1 jaw)
    const hasWedge = field.wedgeInfo && field.wedgeInfo !== 'None';
    const jaws = field.jawPositions_cm || {Y1:-5, Y2:5, X1:-5, X2:5};
    let currentY1 = jaws.Y1;
    
    if (hasWedge && isAnimating) {
        // Simulate Y1 moving from closed (near center) to open position based on progress
        const startY1 = -1; 
        currentY1 = startY1 + (progress * (jaws.Y1 - startY1));
        // Update label display during animation
        document.getElementById('y1-actual').textContent = currentY1.toFixed(1);
    }

    // Draw Jaws (as a clipping region or semi-transparent overlay)
    ctx.fillStyle = 'rgba(40, 40, 40, 0.8)'; // Dark jaw material
    const y1_px = centerY + (currentY1 * scale);
    const y2_px = centerY - (jaws.Y2 * scale);
    const x1_px = centerX + (jaws.X1 * scale);
    const x2_px = centerX - (jaws.X2 * scale);

    // Top/Bottom Jaws (Y)
    ctx.fillRect(0, 0, width, y2_px); // Top block
    ctx.fillRect(0, y1_px, width, height - y1_px); // Bottom block
    // Left/Right Jaws (X)
    ctx.fillRect(0, y2_px, x1_px, y1_px - y2_px); // Left block
    ctx.fillRect(x2_px, y2_px, width - x2_px, y1_px - y2_px); // Right block


    // Draw MLC Leaves
    const mlcData = MOCK_MLC_DATA[field.fieldName] || MOCK_MLC_DATA['default'];
    const numLeaves = mlcData.BankA.length;
    const leafHeightPx = 1.0 * scale;
    let currentY = centerY - ((numLeaves * leafHeightPx) / 2);

    ctx.fillStyle = 'rgba(90, 90, 90, 0.95)'; // Leaf color
    for (let i = 0; i < numLeaves; i++) {
        let posA_cm = mlcData.BankA[i];
        let posB_cm = mlcData.BankB[i];

        // IMRT Simulation: Add random noise to leaf positions during animation
        if (isAnimating && !hasWedge && field.beamTypeDisplay.includes('DYNAMIC')) {
             const noise = (Math.random() - 0.5) * 0.8; // +/- 0.4cm random movement
             posA_cm = Math.max(0, posA_cm + noise);
             posB_cm = Math.max(0, posB_cm + noise);
        }

        const posA_px = posA_cm * scale;
        const posB_px = posB_cm * scale;

        // Only draw if within open jaw area (simplified check)
        if (currentY > y2_px && currentY < y1_px) {
             ctx.fillRect(x1_px, currentY, centerX - posA_px - x1_px, leafHeightPx - 0.5);
             ctx.fillRect(centerX + posB_px, currentY, x2_px - (centerX + posB_px), leafHeightPx - 0.5);
        }
        currentY += leafHeightPx;
    }
}


// =========================================
// BUTTON & MODAL WIRING
// =========================================

function initializeButtons() {
    // Workflow Buttons
    document.getElementById('btn-prepare').addEventListener('click', () => {
        if (workflowState !== 'PREVIEW') return;
        document.getElementById('modal-prepare-checklist').style.display = 'block';
        workflowState = 'PREPARE';
        updateWorkflowUI();
    });

    document.getElementById('btn-beam-on').addEventListener('click', () => {
        if (workflowState !== 'READY') return;
        const selectedField = currentFieldsList[selectedFieldIndex];
        if (!selectedField || selectedField.isImaging || !selectedField.active || treatedFieldIndices.has(selectedFieldIndex)) {
             showNotification("Select an active, untreated treatment field.");
             return;
        }
        if (overrideRequired) {
             showNotification("Cannot treat: Parameters out of tolerance. Override required.");
             return;
        }
        // Start Simulation
        runBeamDeliverySimulation(selectedField, selectedFieldIndex);
    });

    document.getElementById('btn-record').addEventListener('click', () => {
        if (workflowState !== 'RECORD') return;
        
        // Double check that all active treatment fields are treated
        const activeTreatmentFields = currentFieldsList.filter(f => f.active && !f.isImaging);
        const allTreated = activeTreatmentFields.length > 0 && activeTreatmentFields.every(f => {
            // Find original index of this field
            const originalIdx = currentFieldsList.indexOf(f);
            return treatedFieldIndices.has(originalIdx);
        });

        if (!allTreated) {
             showNotification("Complete treatments for all active fields before recording.");
             return;
        }
        
        populateCPTModal();
        document.getElementById('modal-cpt-capture').style.display = 'block';
    });


    // --- Standard Toolbar Buttons ---
    document.getElementById('btn-close-patient').addEventListener('click', () => { window.location.href = 'index_v2.html'; });

    document.getElementById('btn-reorder').addEventListener('click', (e) => {
        isReorderMode = !isReorderMode; e.target.classList.toggle('active-tool', isReorderMode);
        document.getElementById('field-list-items').classList.toggle('reorder-mode', isReorderMode);
    });

    document.getElementById('btn-deactivate').addEventListener('click', (e) => {
        isDeactivateMode = !isDeactivateMode; e.target.classList.toggle('active-tool', isDeactivateMode);
        document.getElementById('field-list-items').classList.toggle('deactivate-mode', isDeactivateMode);
        document.getElementById('btn-remove').disabled = !isDeactivateMode;
    });

    document.getElementById('btn-remove').addEventListener('click', () => {
        currentFieldsList = currentFieldsList.filter(f => f.active);
        treatedFieldIndices.clear(); // Reset treated status on list change for simplicity in demo
        if (selectedFieldIndex >= currentFieldsList.length) selectedFieldIndex = 0;
        populateFieldList();
    });

    document.getElementById('btn-add').addEventListener('click', () => document.getElementById('modal-add-imaging').style.display = 'block');
    document.getElementById('btn-setup-notes').addEventListener('click', () => document.getElementById('modal-setup-notes').style.display = 'block');
    document.getElementById('btn-tools').addEventListener('click', () => document.getElementById('modal-emr-tools').style.display = 'block');
    document.getElementById('btn-override').addEventListener('click', () => { if (overrideRequired) document.getElementById('modal-override').style.display = 'block'; });
    
    const btnAcquire = document.getElementById('btn-acquire');
    btnAcquire.addEventListener('click', () => { showNotification("Parameters Acquired."); btnAcquire.disabled = true; });
}


function initializeModals() {
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'));
    });

    // Prepare Checklist Logic
    const checklistItems = document.querySelectorAll('#modal-prepare-checklist input[type="checkbox"]');
    const confirmPrepareBtn = document.getElementById('btn-confirm-prepare');
    checklistItems.forEach(item => {
        item.addEventListener('change', () => {
            const allChecked = Array.from(checklistItems).every(i => i.checked);
            confirmPrepareBtn.disabled = !allChecked;
        });
    });

    confirmPrepareBtn.addEventListener('click', () => {
        document.getElementById('modal-prepare-checklist').style.display = 'none';
        workflowState = 'READY';
        updateWorkflowUI();
        showNotification("Pre-treatment checks complete. Machine READY.");
    });


    // CPT Capture Logic
    document.getElementById('btn-submit-cpt').addEventListener('click', () => {
        document.getElementById('modal-cpt-capture').style.display = 'none';
        showNotification("Charges Submitted. Treatment session closed.");
        // Reset for demo purposes
        setTimeout(() => { window.location.href = 'index_v2.html'; }, 2000);
    });


    // Add Imaging Confirm
    document.getElementById('btn-confirm-add-imaging').addEventListener('click', () => {
        const modality = document.getElementById('imaging-type').value;
        currentFieldsList.splice(selectedFieldIndex + 1, 0, { fieldName: modality, isImaging: true, active: true });
        populateFieldList();
        document.getElementById('modal-add-imaging').style.display = 'none';
    });

    // Override Confirm
    document.getElementById('btn-confirm-override').addEventListener('click', () => {
        if (document.getElementById('therapist-id').value.trim() === "") return alert("Enter ID.");
        overrideRequired = false;
        document.getElementById('tolerance-warning').style.display = 'none';
        document.getElementById('btn-override').disabled = true;
        document.querySelectorAll('.value-box.out-of-tolerance').forEach(el => el.classList.remove('out-of-tolerance'));
        document.getElementById('modal-override').style.display = 'none';
        document.getElementById('therapist-id').value = '';
        showNotification("Override Confirmed.");
    });

    // EMR Tool Tabs
    const modalTabs = document.querySelectorAll('.modal-tab');
    modalTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            modalTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.modal-tab-container').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).style.display = 'block';
        });
    });
}

function populateCPTModal() {
    const container = document.getElementById('cpt-list-container');
    container.innerHTML = '';
    const charges = currentPatientData.cptCharges || [];
    if (charges.length === 0) {
        container.innerHTML = '<p>No standard charges found for this plan.</p>';
        return;
    }
    charges.forEach(cpt => {
        // Auto-select daily codes
        const isDaily = cpt.frequency && cpt.frequency.toLowerCase().includes('daily');
        container.innerHTML += `
            <label class="checklist-item">
                <input type="checkbox" checked> 
                <strong>${cpt.code}</strong> - ${cpt.description}
            </label>
        `;
    });
}

// Helper function for Populating EMR Data (called during init)
function populateEMRData(patient) {
    // 1. Setup Notes
    const notes = (patient.radiationOncologyData && patient.radiationOncologyData.ctSimulation) 
                  ? patient.radiationOncologyData.ctSimulation.setupInstructions : "No instructions.";
    document.getElementById('setup-notes-content').textContent = notes;

    // 2. Patient Info Tab
    const demo = patient.demographics || {};
    const infoTab = document.getElementById('tab-patient-info');
    infoTab.innerHTML = `
        <div class="info-group"><h3>Demographics</h3>
            <p><strong>Address:</strong> ${demo.address || '-'}</p>
            <p><strong>Phone:</strong> ${demo.phone || '-'}</p>
            <p><strong>Insurance:</strong> ${demo.insurance || '-'}</p>
            <p><strong>Emergency:</strong> ${demo.emergencyContact || '-'}</p>
        </div>
        <div class="info-group"><h3>General History</h3>
            <p><strong>Baseline Status:</strong> ${patient.diagnosis?.baselineStatus || '-'}</p>
            <p><strong>Comorbidities:</strong> ${patient.diagnosis?.comorbidities || '-'}</p>
            <p><strong>Relevant History:</strong> ${patient.diagnosis?.relevantHistory || '-'}</p>
        </div>
    `;

    // 3. Diagnosis Tab
    const diag = patient.diagnosis || {};
    const diagTab = document.getElementById('tab-diagnosis');
    diagTab.innerHTML = `
        <div class="info-group"><h3>Primary Diagnosis</h3>
            <p><strong>Dx:</strong> ${diag.primary || '-'}</p>
            <p><strong>Location:</strong> ${diag.location || '-'}</p>
            <p><strong>Stage:</strong> ${diag.overallStage || '-'} (${diag.tnmStage || '-'})</p>
        </div>
        <div class="info-group"><h3>Pathology</h3>
            <ul>${(diag.pathologyFindings || []).map(f => `<li>${f}</li>`).join('')}</ul>
        </div>
    `;
}


function showNotification(message) {
    const area = document.getElementById('notification-area');
    const note = document.createElement('div'); note.className = 'notification'; note.textContent = message;
    area.appendChild(note); setTimeout(() => { area.removeChild(note); }, 3000);
}
