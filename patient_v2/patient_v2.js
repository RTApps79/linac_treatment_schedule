// =========================================
// GLOBAL STATE & CONFIGURATION
// =========================================

let currentPatientData = null;
// Holds the local state of fields (order, activation status, added imaging fields)
let currentFieldsList = [];
let selectedFieldIndex = 0;
// Set to store indices of completed fields by their original index
let treatedFieldIndices = new Set(); 

// UI Modes & Workflow State
let isReorderMode = false;
let isDeactivateMode = false;
let overrideRequired = false;
// States: PREVIEW, PREPARE, READY, BEAM_ON, RECORD
let workflowState = 'PREVIEW'; 
let isDelivering = false;
let deliveryAnimationId = null;

// Define tolerances for parameter checks (Plan vs Actual deviation allowed)
const TOLERANCES = {
    angle: 2.0,    // degrees (gantry, coll, couch, pitch, roll)
    position: 0.5, // cm (jaws, couch vrt/lng/lat)
    mu: 2.0        // monitor units
};

// Mock MLC Data (fallback and specific shapes)
// Coordinates are X positions in cm. Bank A is Left (negative), Bank B is Right (positive).
const MOCK_MLC_DATA = {
    // Default open field (leaves retracted)
    'default': { 
        BankA: Array(40).fill(-20), 
        BankB: Array(40).fill(20) 
    },
    // Generic shape for static fields like Hip/Femur/Pelvis (based on provided image)
    // Central leaves open wide, outer leaves closed in.
    'Static_Shaped_Generic': {
        BankA: [-2,-2,-2,-3,-4,-5,-6,-7,-8,-9,-10,-10,-10,-10,-10,-10,-10,-10,-9,-8,-7,-6,-5,-4,-3,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2],
        BankB: [ 2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 10, 10, 10, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
    }
};


// CPT Code Definitions mapping for display
const CPT_MAP = {
    '77300': 'Basic Radiation Dosimetry Calculation',
    '77334': 'Treatment Devices, Complex',
    '77336': 'Continuing Medical Physics Consultation',
    '77370': 'Special Medical Radiation Physics Consultation',
    '77385': 'Intensity Modulated Radiation Therapy (IMRT) Delivery, Simple',
    '77386': 'Intensity Modulated Radiation Therapy (IMRT) Delivery, Complex',
    '77387': 'Guidance for Localization of Target Volume for Delivery of Radiation Treatment Delivery, Includes Intrafraction Tracking',
    '77401': 'Radiation Treatment Delivery, Superficial and/or Orthovoltage',
    '77402': 'Radiation Treatment Delivery, >1 MeV; Simple',
    '77407': 'Radiation Treatment Delivery, >1 MeV; Intermediate',
    '77412': 'Radiation Treatment Delivery, >1 MeV; Complex',
    '77427': 'Radiation Treatment Management, 5 Treatments',
    'G6001': 'Ultrasonic Guidance for Placement of Radiation Therapy Fields',
    'G6002': 'Stereotactic Body Radiation Therapy, Treatment Delivery, Per Fraction to 1 or More Lesions, Including Image Guidance'
};

// =========================================
// INITIALIZATION
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Get Patient File from URL
    const params = new URLSearchParams(window.location.search);
    const fileName = params.get('file');

    if (!fileName) {
        console.error('No patient file specified in URL.');
        document.getElementById('pt-name').textContent = 'Error: No File Found';
        // In a real app, redirect back to schedule
        return;
    }

    // 2. Fetch Data with Cache Busting
    const cacheBuster = new Date().getTime();
    fetch(`data/${fileName}?v=${cacheBuster}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch patient data.');
            return response.json();
        })
        .then(patientData => {
            currentPatientData = patientData;
            // Initialize local field list state from fetched JSON data
            if (patientData.treatmentPlan && patientData.treatmentPlan.treatmentFields) {
                // Add an 'active' property to track deactivation state locally
                // Store original index for tracking treated status accurately even after reordering
                currentFieldsList = patientData.treatmentPlan.treatmentFields.map((f, idx) => ({...f, active: true, originalIndex: idx}));
            }
            // 3. Initialize UI
            initializeTreatmentConsole(patientData);
        })
        .catch(error => {
            console.error(error);
            document.getElementById('pt-name').textContent = 'Error Loading Data';
        });

    // 4. Wire up interactive elements
    initializeButtons();
    initializeModals();
});


function initializeTreatmentConsole(patient) {
    // A. Populate Header & Patient Info Sidebar
    document.getElementById('current-date').textContent = new Date().toLocaleString();
    
    const demo = patient.demographics || {};
    document.getElementById('pt-name').textContent = demo.name || 'N/A';
    document.getElementById('pt-id').textContent = patient.patientId || 'N/A';
    document.getElementById('pt-dob').textContent = demo.dob || 'N/A';
    
    const plan = patient.treatmentPlan || {};
    document.getElementById('pt-physician').textContent = plan.radOnc || 'N/A';
    document.getElementById('plan-id-header').textContent = plan.planId || 'Plan ID';

    // B. Populate the sidebar field list based on current state
    populateFieldList();

    // C. Update Workflow UI State
    updateWorkflowUI();

    // D. Populate EMR Data Tabs and Setup Notes
    populateEMRData(patient);

    // E. Update Fraction Counter
    let deliveredFx = 0;
    if (patient.radiationOncologyData && patient.radiationOncologyData.treatmentDelivery) {
         deliveredFx = (patient.radiationOncologyData.treatmentDelivery.fractions || []).length;
    }
    
    // Determine Total Fractions from JSON data strings (e.g., "5 fx")
    let totalFx = '-';
    if (plan.fractionation) {
         const match = plan.fractionation.match(/(\d+)/);
         if (match) totalFx = match[1];
    } else if (plan.prescription && plan.prescription.numberOfFractions) {
         totalFx = plan.prescription.numberOfFractions;
    }

    document.getElementById('fx-counter').textContent = deliveredFx + 1;
    document.getElementById('fx-total').textContent = totalFx;
}

// Helper to populate data in Modals (Tools & Setup Notes)
function populateEMRData(patient) {
    // 1. Setup Notes Modal Content
    const notes = patient.treatmentPlan?.setupInstructions || 
                  patient.radiationOncologyData?.ctSimulation?.setupInstructions || 
                  "No setup instructions recorded found.";
    document.getElementById('setup-notes-content').textContent = notes;

    // 2. Tools Modal - Patient Info Tab
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

    // 3. Tools Modal - Diagnosis Tab
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


// =========================================
// SIDEBAR FIELD LIST LOGIC
// =========================================

function populateFieldList() {
    const listContainer = document.getElementById('field-list-items');
    listContainer.innerHTML = ''; // Clear current DOM list

    if (currentFieldsList.length === 0) {
        listContainer.innerHTML = '<li style="padding: 10px; font-style: italic;">No fields defined.</li>';
        // Clear main displays
        updateFieldParameters(null);
        return;
    }

    // Ensure selected index is valid after potential removals
    if (selectedFieldIndex >= currentFieldsList.length) selectedFieldIndex = 0;

    currentFieldsList.forEach((fieldItem, index) => {
        const li = document.createElement('li');
        
        // Set styling classes based on state
        if (index === selectedFieldIndex && fieldItem.active) li.classList.add('active');
        if (!fieldItem.active) li.classList.add('deactivated');
        // Check if this field's original index is in the treated set
        if (fieldItem.originalIndex !== undefined && treatedFieldIndices.has(fieldItem.originalIndex)) {
            li.classList.add('treated');
        }
        
        // Render Content based on field type (Imaging vs Treatment)
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

        // Enable Drag and Drop functionality
        li.draggable = true; 
        li.dataset.index = index;

        // --- Event Handlers ---

        // 1. Selection Click Handler
        li.addEventListener('click', (e) => {
            // Don't trigger selection if clicking directly on checkbox or drag handle
            if (e.target.classList.contains('field-checkbox') || e.target.classList.contains('drag-handle')) return;

            // Prevent changing selection while delivering
            if (fieldItem.active && !isDelivering) {
                selectedFieldIndex = index;
                populateFieldList(); // Re-render to update active classes
            }
        });

        // 2. Deactivation Checkbox Handler
        const checkbox = li.querySelector('.field-checkbox');
        checkbox.addEventListener('change', (e) => {
             fieldItem.active = e.target.checked;
             // If the deselected field was the active one, find a new active field
             if (!fieldItem.active && index === selectedFieldIndex) {
                 const nextActiveIndex = currentFieldsList.findIndex(f => f.active);
                 selectedFieldIndex = nextActiveIndex !== -1 ? nextActiveIndex : 0;
             }
             populateFieldList(); // Re-render to show deactivated styling
        });

        // 3. Drag and Drop Handlers (for Reorder Mode)
        li.addEventListener('dragstart', (e) => {
            if (!isReorderMode) { e.preventDefault(); return; }
            e.dataTransfer.setData('text/plain', index);
            li.style.opacity = '0.5';
        });
        li.addEventListener('dragend', () => { li.style.opacity = '1'; });
        li.addEventListener('dragover', (e) => { e.preventDefault(); }); // Necessary to allow dropping
        li.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!isReorderMode) return;
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = index;
            
            // Reorder the state array
            const itemToMove = currentFieldsList.splice(fromIndex, 1)[0];
            currentFieldsList.splice(toIndex, 0, itemToMove);
            
            // Update selected index if the selected item moved
            if (selectedFieldIndex === fromIndex) selectedFieldIndex = toIndex;
            
            populateFieldList(); // Re-render list in new order
        });

        listContainer.appendChild(li);
    });

    // Trigger parameter update for the currently selected, active field
    const selectedField = currentFieldsList[selectedFieldIndex];
    if (selectedField && selectedField.active) {
        updateFieldParameters(selectedField);
    } else {
         // Clear displays if no active field is selected
        updateFieldParameters(null);
    }
}


// =========================================
// MAIN CONTENT UPDATE LOGIC (Red/Yellow Containers)
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

    // Helper: Check tolerance between plan and actual, update UI if failed
    const checkTolerance = (planId, actualId, type) => {
        const planEl = document.getElementById(planId);
        const actualEl = document.getElementById(actualId);
        
        // --- SIMULATION FOR DEMONSTRATION ---
        // In a real system, 'actual' comes from the machine. 
        // Here, we simulate a slight deviation to test the tolerance logic.
        // We add a small offset to the plan value to create the "actual" value.
        let offset = 0;
        // Uncomment next line to force tolerance failures on angles for testing:
        // if (type === 'angle' && parseFloat(planEl.textContent) !== 0) offset = 2.1; 
        
        let actualVal = parseFloat(planEl.textContent) + offset;

        // Display simulated actual value
        actualEl.textContent = formatVal(actualVal, type === 'position' ? 2 : 1);

        // Perform check
        if (!isNaN(actualVal)) {
             const planVal = parseFloat(planEl.textContent);
             const tolerance = TOLERANCES[type];
             if (Math.abs(planVal - actualVal) > tolerance) {
                 actualEl.classList.add('out-of-tolerance');
                 overrideRequired = true;
             }
        }
    };

    // Handle null or imaging fields (clear displays)
    if (!field || field.isImaging) {
        document.querySelectorAll('.treatment-data-container .value-box:not(.highlighted)').forEach(el => el.textContent = '-');
        document.getElementById('mu-total-plan').textContent = '-';
        document.getElementById('mu-actual-display').textContent = '-';
        drawBEV(null);
        return;
    }


    // --- 1. Update BEAM Parameters (Red Container) ---
    document.getElementById('beam-type-plan').textContent = formatText(field.beamTypeDisplay);
    document.getElementById('energy-plan').textContent = formatText(field.energyDisplay);

    const totalMU = formatVal(field.monitorUnits, 1);
    document.getElementById('mu-total-plan').textContent = totalMU;
    // If not delivering, reset actual display. If delivering, the animation loop handles this.
    if (!isDelivering) {
         document.getElementById('mu-actual-display').textContent = '0.0'; 
    }

    document.getElementById('dose-rate-plan').textContent = formatVal(field.doseRate, 0);
    document.getElementById('time-plan').textContent = formatVal(field.estimatedTime_min, 2);

    document.getElementById('wedge-plan').textContent = formatText(field.wedgeInfo);
    document.getElementById('bolus-plan').textContent = formatText(field.bolusInfo);


    // --- 2. Update GEOMETRY Parameters & Check Tolerances (Yellow Container) ---
    
    document.getElementById('gantry-plan').textContent = formatText(field.gantryAngle);
    // Only check tolerance on numeric angles, skip ranges like "180-0"
    if (!isNaN(parseFloat(field.gantryAngle))) {
         checkTolerance('gantry-plan', 'gantry-actual', 'angle');
    } else {
         document.getElementById('gantry-actual').textContent = formatText(field.gantryAngle);
    }

    document.getElementById('coll-plan').textContent = formatVal(field.collimatorAngle, 1);
    checkTolerance('coll-plan', 'coll-actual', 'angle');

    document.getElementById('couch-rtn-plan').textContent = formatVal(field.couchAngle, 1);
    checkTolerance('couch-rtn-plan', 'couch-rtn-actual', 'angle');

    const jaws = field.jawPositions_cm || {};
    document.getElementById('y1-plan').textContent = formatVal(jaws.Y1); checkTolerance('y1-plan', 'y1-actual', 'position');
    document.getElementById('y2-plan').textContent = formatVal(jaws.Y2); checkTolerance('y2-plan', 'y2-actual', 'position');
    document.getElementById('x1-plan').textContent = formatVal(jaws.X1); checkTolerance('x1-plan', 'x1-actual', 'position');
    document.getElementById('x2-plan').textContent = formatVal(jaws.X2); checkTolerance('x2-plan', 'x2-actual', 'position');

    const couch = field.couchCoordinates_cm || {};
    document.getElementById('couch-vrt-plan').textContent = formatVal(couch.vertical, 2); checkTolerance('couch-vrt-plan', 'couch-vrt-actual', 'position');
    document.getElementById('couch-lng-plan').textContent = formatVal(couch.longitudinal, 2); checkTolerance('couch-lng-plan', 'couch-lng-actual', 'position');
    document.getElementById('couch-lat-plan').textContent = formatVal(couch.lateral, 2); checkTolerance('couch-lat-plan', 'couch-lat-actual', 'position');

    document.getElementById('couch-pitch-plan').textContent = formatVal(field.pitchAngle, 1); checkTolerance('couch-pitch-plan', 'couch-pitch-actual', 'angle');
    document.getElementById('couch-roll-plan').textContent = formatVal(field.rollAngle, 1); checkTolerance('couch-roll-plan', 'couch-roll-actual', 'angle');

    // --- 3. Finalize Tolerance State ---
    if (overrideRequired && !isDelivering) {
        document.getElementById('tolerance-warning').style.display = 'block';
        document.getElementById('btn-override').disabled = false;
    }

    // --- 4. Update Beam's Eye View ---
    // If delivering, the animation loop handles drawing.
    if (!isDelivering) {
         drawBEV(field);
    }
}


// =========================================
// WORKFLOW & DELIVERY LOGIC
// =========================================

function updateWorkflowUI() {
    // Reset all steps
    const steps = document.querySelectorAll('#workflow-bar .flow-step');
    steps.forEach(s => {
        s.className = 'flow-step'; // Removes active/green/red classes
    });

    const statusText = document.getElementById('machine-status-text');

    // Apply styling based on current state
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
             statusText.textContent = "Treatment session complete. Proceed to Record.";
            break;
    }
}


function runBeamDeliverySimulation(field) {
    isDelivering = true;
    workflowState = 'BEAM_ON';
    updateWorkflowUI();
    disableToolbar(true); // Lock UI during delivery

    const totalMU = field.monitorUnits;
    let currentMU = 0;
    // Calculate MU increment per frame for approx 5 seconds duration at 60fps
    const muPerFrame = totalMU / (5 * 60); 
    const startTime = Date.now();

    function animateDelivery() {
        currentMU += muPerFrame;
        const elapsedSec = (Date.now() - startTime) / 1000;

        if (currentMU >= totalMU) {
            // --- Finish Delivery ---
            currentMU = totalMU;
            isDelivering = false;
            cancelAnimationFrame(deliveryAnimationId);
            
            // Mark original index as treated
            if (field.originalIndex !== undefined) {
                 treatedFieldIndices.add(field.originalIndex);
            }
            
            workflowState = 'READY'; // Go back to ready state for next field
            
            // Check if all active treatment (non-imaging) fields are done
            const allActiveTreated = currentFieldsList
                .filter(f => f.active && !f.isImaging)
                .every(f => treatedFieldIndices.has(f.originalIndex));
            
            if (allActiveTreated) {
                workflowState = 'RECORD';
            }

            updateWorkflowUI();
            populateFieldList(); // Update treated icon
            disableToolbar(false); // Unlock UI
            showNotification(`Field '${field.fieldName}' Completed.`);
            
            // Final update to ensure UI shows 100% completion state
            updateFieldParameters(field);

        } else {
            // --- Continue Animation ---
            // Update UI during delivery
            document.getElementById('mu-actual-display').textContent = currentMU.toFixed(1);
            const progress = (currentMU / totalMU) * 100;
            document.querySelector('.mu-progress-fill').style.width = `${progress}%`;
            document.getElementById('time-actual').textContent = (elapsedSec / 60).toFixed(2);
            
            // Redraw BEV with animation flags
            drawBEV(field, true, progress/100);

            deliveryAnimationId = requestAnimationFrame(animateDelivery);
        }
    }

    // Start the animation loop
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

    // Set canvas resolution match display size
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    // Scaling factor (pixels per cm) - adjust as needed fit view
    const scale = width / 30; 

    // 1. Clear and Draw Background (Placeholder for DRR image)
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    // Draw circular field limit
    ctx.arc(centerX, centerY, Math.min(width, height) / 2 * 0.95, 0, 2 * Math.PI);
    ctx.fillStyle = isAnimating ? '#442222' : '#333'; // Red tint during delivery
    ctx.fill(); ctx.strokeStyle = '#555'; ctx.stroke();
    
    // Handle cases with no field or imaging field selected
    if (!field || field.isImaging) { 
        ctx.fillStyle = '#eee'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
        ctx.fillText(field && field.isImaging ? "Imaging View" : "No Field Selected", centerX, centerY);
        document.getElementById('mlc-mode-display').textContent = "MLC: N/A";
        return;
    }

    // 2. Draw Crosshairs (Isocenter)
    ctx.beginPath();
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    ctx.strokeStyle = isAnimating ? 'rgba(255, 255, 50, 0.8)' : 'rgba(255, 50, 50, 0.6)';
    ctx.lineWidth = 1; ctx.stroke();

    // --- Dynamic Wedge Simulation (animating Y1 jaw) ---
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

    // --- Draw Jaws (as a clipping region or semi-transparent overlay) ---
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

    // --- Draw Jaw Labels (X1, X2, Y1, Y2) ---
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Light grey text
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    
    if (y2_px > 10) { ctx.textBaseline = 'bottom'; ctx.fillText("Y2", centerX, y2_px - 5); }
    if (y1_px < height - 10) { ctx.textBaseline = 'top'; ctx.fillText("Y1", centerX, y1_px + 5); }
    if (x1_px > 10) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText("X1", x1_px - 5, centerY); }
    if (x2_px < width - 10) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText("X2", x2_px + 5, centerY); }


    // --- Draw MLC Leaves ---
    const isDynamicMLC = field.beamTypeDisplay && field.beamTypeDisplay.includes('DYNAMIC');
    // Identify fields that require specific static shapes based on keywords
    const isComplexStatic = ['Hip', 'Femur', 'Pelvis'].some(keyword => field.fieldName.includes(keyword));

    let mlcData;
    let numLeaves = 40; // Default number of leaves
    const leafHeightPx = 1.0 * scale;
    const totalMlcHeightPx = numLeaves * leafHeightPx;
    let currentY = centerY - (totalMlcHeightPx / 2);

    // Determine MLC Data Source based on field type
    if (isDynamicMLC) {
        // Dynamic: Use default open leaves as base, will add noise later
        mlcData = MOCK_MLC_DATA['default'];
    } else if (isComplexStatic) {
        // Complex Static: Use specific shaped data (e.g., for Hip/Femur)
        mlcData = MOCK_MLC_DATA['Static_Shaped_Generic'];
    } else {
        // Simple Static: Will align with jaws, no mock data array needed
        mlcData = null; 
    }

    // Update MLC Mode display
    document.getElementById('mlc-mode-display').textContent = `MLC: ${isDynamicMLC ? 'Dynamic (IMRT/VMAT)' : 'Static'}`;

    ctx.fillStyle = 'rgba(90, 90, 90, 0.95)'; // Leaf color

    for (let i = 0; i < numLeaves; i++) {
        let posA_cm, posB_cm; // X-coordinates in cm (neg=left, pos=right)

        if (isDynamicMLC) {
             // Base position + random noise during animation
             posA_cm = mlcData.BankA[i];
             posB_cm = mlcData.BankB[i];
             if (isAnimating && !hasWedge) {
                 const noise = (Math.random() - 0.5) * 0.8; 
                 posA_cm += noise; posB_cm += noise;
             }
        } else if (isComplexStatic && mlcData) {
             // Static Shape: Use predefined positions, NO animation noise
             posA_cm = mlcData.BankA[i];
             posB_cm = mlcData.BankB[i];
        } else {
             // Simple Static: Align exactly with X Jaws
             posA_cm = jaws.X1;
             posB_cm = jaws.X2;
        }

        const posA_px = centerX + (posA_cm * scale); // Convert X-coord to pixels
        const posB_px = centerX + (posB_cm * scale);

        // Only draw if within open Y jaw area (simplified visibility check)
        if (currentY > y2_px && currentY < y1_px) {
             // Draw Bank A Leaf (Left side) - from left edge to posA_px
             ctx.fillRect(0, currentY, posA_px, leafHeightPx - 0.5);
             // Draw Bank B Leaf (Right side) - from posB_px to right edge
             ctx.fillRect(posB_px, currentY, width - posB_px, leafHeightPx - 0.5);
        }
        currentY += leafHeightPx;
    }
}


// =========================================
// BUTTON & MODAL WIRING
// =========================================

function initializeButtons() {
    // --- Workflow Buttons ---
    
    // 1. Prepare Button -> Opens Checklist
    document.getElementById('btn-prepare').addEventListener('click', () => {
        if (workflowState !== 'PREVIEW') return;
        // Reset checklist state
        document.querySelectorAll('#modal-prepare-checklist input[type="checkbox"]').forEach(ck => ck.checked = false);
        document.getElementById('btn-confirm-prepare').disabled = true;
        
        document.getElementById('modal-prepare-checklist').style.display = 'block';
        workflowState = 'PREPARE';
        updateWorkflowUI();
    });

    // 2. Beam On Button -> Starts Delivery Simulation
    document.getElementById('btn-beam-on').addEventListener('click', () => {
        if (workflowState !== 'READY') return;
        
        const selectedField = currentFieldsList[selectedFieldIndex];
        
        // Validation checks before beam on
        if (!selectedField || selectedField.isImaging || !selectedField.active) {
             showNotification("Select an active treatment field.");
             return;
        }
        if (selectedField.originalIndex !== undefined && treatedFieldIndices.has(selectedField.originalIndex)) {
             showNotification("Field already treated.");
             return;
        }
        if (overrideRequired) {
             showNotification("Cannot treat: Parameters out of tolerance.");
             return;
        }

        // Start Simulation
        runBeamDeliverySimulation(selectedField);
    });

    // 3. Record Button -> Opens CPT Capture
    document.getElementById('btn-record').addEventListener('click', () => {
        if (workflowState !== 'RECORD') return;
        
        // Final verification that all active treatment fields are treated
        const activeTreatmentFields = currentFieldsList.filter(f => f.active && !f.isImaging);
        const allTreated = activeTreatmentFields.length > 0 && activeTreatmentFields.every(f => treatedFieldIndices.has(f.originalIndex));

        if (!allTreated) {
             showNotification("Complete treatments for all active fields before recording.");
             return;
        }
        
        populateCPTModal();
        document.getElementById('modal-cpt-capture').style.display = 'block';
    });


    // --- Standard Toolbar Buttons ---
    document.getElementById('btn-close-patient').addEventListener('click', () => { window.location.href = 'index_v2.html'; });

    // Reorder Mode Toggle
    document.getElementById('btn-reorder').addEventListener('click', (e) => {
        isReorderMode = !isReorderMode;
        e.target.classList.toggle('active-tool', isReorderMode);
        document.getElementById('field-list-items').classList.toggle('reorder-mode', isReorderMode);
    });

    // Deactivate Mode Toggle
    document.getElementById('btn-deactivate').addEventListener('click', (e) => {
        isDeactivateMode = !isDeactivateMode;
        e.target.classList.toggle('active-tool', isDeactivateMode);
        document.getElementById('field-list-items').classList.toggle('deactivate-mode', isDeactivateMode);
        // Enable 'Remove' button only when in deactivate mode
        document.getElementById('btn-remove').disabled = !isDeactivateMode;
    });

    // Remove Button (Removes inactive fields from local state)
    document.getElementById('btn-remove').addEventListener('click', () => {
        currentFieldsList = currentFieldsList.filter(f => f.active);
        // Reset selection if needed
        if (selectedFieldIndex >= currentFieldsList.length) selectedFieldIndex = 0;
        populateFieldList(); // Re-render
    });

    document.getElementById('btn-add').addEventListener('click', () => document.getElementById('modal-add-imaging').style.display = 'block');
    document.getElementById('btn-setup-notes').addEventListener('click', () => document.getElementById('modal-setup-notes').style.display = 'block');
    document.getElementById('btn-tools').addEventListener('click', () => document.getElementById('modal-emr-tools').style.display = 'block');
    
    // Override Button
    document.getElementById('btn-override').addEventListener('click', () => {
        if (overrideRequired) {
            document.getElementById('modal-override').style.display = 'block';
        }
    });

    // Acquire Button
    const btnAcquire = document.getElementById('btn-acquire');
    btnAcquire.addEventListener('click', () => {
        showNotification("Parameters Acquired & Saved.");
        btnAcquire.disabled = true; // Disable until next field change
    });

    // Placeholder actions for Apply/Cancel
    document.getElementById('btn-apply').addEventListener('click', () => console.log('Apply clicked'));
    document.getElementById('btn-cancel').addEventListener('click', () => console.log('Cancel clicked'));
}


function initializeModals() {
    // Generic Close logic for all modals
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        });
    });

    // Close modal if clicking outside content area
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // --- Specific Modal Actions ---

    // 1. Prepare Checklist Logic
    const checklistItems = document.querySelectorAll('#modal-prepare-checklist input[type="checkbox"]');
    const confirmPrepareBtn = document.getElementById('btn-confirm-prepare');
    
    checklistItems.forEach(item => {
        item.addEventListener('change', () => {
            // Enable confirm button only if ALL checkboxes are checked
            const allChecked = Array.from(checklistItems).every(i => i.checked);
            confirmPrepareBtn.disabled = !allChecked;
        });
    });

    confirmPrepareBtn.addEventListener('click', () => {
        document.getElementById('modal-prepare-checklist').style.display = 'none';
        workflowState = 'READY'; // Advance workflow state
        updateWorkflowUI();
        showNotification("Pre-treatment checks complete. Machine READY.");
    });


    // 2. CPT Capture Logic
    document.getElementById('btn-submit-cpt').addEventListener('click', () => {
        document.getElementById('modal-cpt-capture').style.display = 'none';
        showNotification("Charges Submitted. Treatment session closed.");
        // Redirect back to schedule after a short delay
        setTimeout(() => { window.location.href = 'index_v2.html'; }, 2000);
    });


    // 3. Confirm Add Imaging Field
    document.getElementById('btn-confirm-add-imaging').addEventListener('click', () => {
        const modality = document.getElementById('imaging-type').value;
        // Create new imaging field structure
        const newImagingField = {
            fieldName: modality,
            isImaging: true,
            active: true,
            // No originalIndex implies it was added during session
        };
        // Insert new field after currently selected one
        currentFieldsList.splice(selectedFieldIndex + 1, 0, newImagingField);
        populateFieldList(); // Re-render list
        document.getElementById('modal-add-imaging').style.display = 'none';
        showNotification(`${modality} added.`);
    });

    // 4. Confirm Parameter Override
    document.getElementById('btn-confirm-override').addEventListener('click', () => {
        const therapistId = document.getElementById('therapist-id').value;
        if (therapistId.trim() === "") {
            alert("Please enter a Therapist ID to confirm.");
            return;
        }
        console.log(`Override confirmed by ID: ${therapistId}`);
        
        // Reset tolerance warning states
        overrideRequired = false;
        document.getElementById('tolerance-warning').style.display = 'none';
        document.getElementById('btn-override').disabled = true;
        document.querySelectorAll('.value-box.out-of-tolerance').forEach(el => el.classList.remove('out-of-tolerance'));
        
        // Close modal and clear input
        document.getElementById('modal-override').style.display = 'none';
        document.getElementById('therapist-id').value = ''; 
        showNotification("Override Confirmed. Treatment Enabled.");
    });

    // 5. EMR Tool Tab Switching Logic
    const modalTabs = document.querySelectorAll('.modal-tab');
    modalTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all tabs and hide content containers
            modalTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.modal-tab-container').forEach(c => c.style.display = 'none');
            
            // Activate clicked tab and show corresponding content
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).style.display = 'block';
        });
    });
}


function populateCPTModal() {
    const container = document.getElementById('cpt-list-container');
    container.innerHTML = ''; // Clear previous content

    // Get billing codes string from plan (e.g., "77402, 77387")
    const billingCodesStr = currentPatientData.treatmentPlan?.billingCodes || "";
    
    if (!billingCodesStr) {
        container.innerHTML = '<p>No standard billing codes found for this plan.</p>';
        return;
    }

    // Split string into array of codes
    const codes = billingCodesStr.split(',').map(c => c.trim()).filter(c => c);

    if (codes.length === 0) {
        container.innerHTML = '<p>No valid billing codes found.</p>';
        return;
    }

    // Generate checklist items for each code
    codes.forEach(code => {
        const description = CPT_MAP[code] || 'Description not found';
        container.innerHTML += `
            <label class="checklist-item">
                <input type="checkbox" checked> 
                <strong>${code}</strong> - ${description}
            </label>
        `;
    });
}
