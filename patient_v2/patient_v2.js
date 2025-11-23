document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const fileName = params.get('file');

    if (!fileName) {
        console.error('No patient file specified in URL.');
        document.getElementById('pt-name').textContent = 'Error: No File Found';
        return;
    }

    // Add a cache-buster to prevent loading stale JSON
    const cacheBuster = new Date().getTime();

    fetch(`data/${fileName}?v=${cacheBuster}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch patient data.');
            return response.json();
        })
        .then(patientData => {
            initializeTreatmentConsole(patientData);
        })
        .catch(error => {
            console.error(error);
            document.getElementById('pt-name').textContent = 'Error Loading Data';
        });

    initializeButtons();
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

    // B. Populate Field List & Select First Field
    const fields = plan.treatmentFields || [];
    populateFieldList(fields);

    // C. Update Fraction Counter
    let deliveredFx = 0;
    if (patient.radiationOncologyData && patient.radiationOncologyData.treatmentDelivery) {
         deliveredFx = (patient.radiationOncologyData.treatmentDelivery.fractions || []).length;
    }
    const totalFx = plan.prescription ? plan.prescription.numberOfFractions : '-';
    document.getElementById('fx-counter').textContent = deliveredFx + 1;
    document.getElementById('fx-total').textContent = totalFx;
}


function populateFieldList(fields) {
    const listContainer = document.getElementById('field-list-items');
    listContainer.innerHTML = ''; // Clear current list

    if (fields.length === 0) {
        listContainer.innerHTML = '<li style="padding: 10px; font-style: italic;">No fields defined in plan.</li>';
        // Clear BEV if no fields
        drawBEV(null);
        return;
    }

    fields.forEach((field, index) => {
        const li = document.createElement('li');
        if (index === 0) li.classList.add('active');
        
        li.innerHTML = `
            <span>${field.fieldName}</span>
            <span>0.0 / ${field.monitorUnits}</span>
        `;

        li.addEventListener('click', () => {
            listContainer.querySelectorAll('li').forEach(item => item.classList.remove('active'));
            li.classList.add('active');
            updateFieldParameters(field);
        });

        listContainer.appendChild(li);
    });

    // Trigger update for the first field initially
    updateFieldParameters(fields[0]);
}


function updateFieldParameters(field) {
    const formatVal = (val, fixed = 1) => (val !== undefined && val !== null) ? Number(val).toFixed(fixed) : '-';
    const formatText = (val) => (val !== undefined && val !== null) ? val : '-';

    // --- 1. Update BEAM Parameters (Red Container) ---
    document.getElementById('beam-type-plan').textContent = formatText(field.beamTypeDisplay);
    document.getElementById('beam-type-actual').textContent = formatText(field.beamTypeDisplay);

    document.getElementById('energy-plan').textContent = formatText(field.energyDisplay);
    document.getElementById('energy-actual').textContent = formatText(field.energyDisplay);

    const totalMU = formatVal(field.monitorUnits, 1);
    document.getElementById('mu-total-plan').textContent = totalMU;
    
    const muSplitContainer = document.getElementById('mu-split-actual');
    if (field.splitMU) {
        muSplitContainer.innerHTML = `
            <div class="mu-val">MU 1<br>${formatVal(field.splitMU.mu1, 1)}</div>
            <div class="mu-val">MU 2<br>${formatVal(field.splitMU.mu2, 1)}</div>
        `;
    } else {
        muSplitContainer.innerHTML = `<div class="mu-val">${totalMU}</div>`;
    }

    document.getElementById('dose-rate-plan').textContent = formatVal(field.doseRate, 0);
    document.getElementById('dose-rate-actual').textContent = formatVal(field.doseRate, 0);

    document.getElementById('time-plan').textContent = formatVal(field.estimatedTime_min, 2);
    document.getElementById('time-actual').textContent = formatVal(0.00, 2); 

    document.getElementById('wedge-plan').textContent = formatText(field.wedgeInfo);
    document.getElementById('wedge-actual').textContent = formatText(field.wedgeInfo);

    document.getElementById('bolus-plan').textContent = formatText(field.bolusInfo);
    document.getElementById('bolus-actual').textContent = formatText(field.bolusInfo);


    // --- 2. Update GEOMETRY Parameters (Yellow Container) ---
    document.getElementById('gantry-plan').textContent = formatText(field.gantryAngle);
    document.getElementById('gantry-actual').textContent = formatText(field.gantryAngle);

    document.getElementById('coll-plan').textContent = formatVal(field.collimatorAngle, 1);
    document.getElementById('coll-actual').textContent = formatVal(field.collimatorAngle, 1);

    document.getElementById('couch-rtn-plan').textContent = formatVal(field.couchAngle, 1);
    document.getElementById('couch-rtn-actual').textContent = formatVal(field.couchAngle, 1);

    const jaws = field.jawPositions_cm || {};
    document.getElementById('y1-plan').textContent = formatVal(jaws.Y1);
    document.getElementById('y1-actual').textContent = formatVal(jaws.Y1);
    document.getElementById('y2-plan').textContent = formatVal(jaws.Y2);
    document.getElementById('y2-actual').textContent = formatVal(jaws.Y2);
    document.getElementById('x1-plan').textContent = formatVal(jaws.X1);
    document.getElementById('x1-actual').textContent = formatVal(jaws.X1);
    document.getElementById('x2-plan').textContent = formatVal(jaws.X2);
    document.getElementById('x2-actual').textContent = formatVal(jaws.X2);

    const couch = field.couchCoordinates_cm || {};
    document.getElementById('couch-vrt-plan').textContent = formatVal(couch.vertical, 2);
    document.getElementById('couch-vrt-actual').textContent = formatVal(couch.vertical, 2);
    document.getElementById('couch-lng-plan').textContent = formatVal(couch.longitudinal, 2);
    document.getElementById('couch-lng-actual').textContent = formatVal(couch.longitudinal, 2);
    document.getElementById('couch-lat-plan').textContent = formatVal(couch.lateral, 2);
    document.getElementById('couch-lat-actual').textContent = formatVal(couch.lateral, 2);

    document.getElementById('couch-pitch-plan').textContent = formatVal(field.pitchAngle, 1);
    document.getElementById('couch-pitch-actual').textContent = formatVal(field.pitchAngle, 1);
    document.getElementById('couch-roll-plan').textContent = formatVal(field.rollAngle, 1);
    document.getElementById('couch-roll-actual').textContent = formatVal(field.rollAngle, 1);

    // --- 3. Update Beam's Eye View (BEV) ---
    drawBEV(field);
}

// --- MOCK DATA FOR MLC ---
// Since your JSON files don't have detailed MLC positions yet,
// we'll use this mock data for demonstration purposes.
const MOCK_MLC_DATA = {
    // Simple rectangular field
    'AP Femur': { BankA: Array(20).fill(5), BankB: Array(20).fill(5) },
    'PA Femur': { BankA: Array(20).fill(5), BankB: Array(20).fill(5) },
    // More complex shaped fields
    'SBRT Arc 1': { 
        BankA: [2,2,3,3,4,4,5,5,6,6,6,6,5,5,4,4,3,3,2,2], 
        BankB: [2,2,3,3,4,4,5,5,6,6,6,6,5,5,4,4,3,3,2,2] 
    },
    'SBRT Arc 2': {
        BankA: [6,6,5,5,4,4,3,3,2,2,2,2,3,3,4,4,5,5,6,6],
        BankB: [6,6,5,5,4,4,3,3,2,2,2,2,3,3,4,4,5,5,6,6]
    }
};


function drawBEV(field) {
    const canvas = document.getElementById('bev-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Ensure canvas resolution matches display size
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Scaling: Pixels per cm. Adjust as needed to fit view.
    const scale = width / 30; 

    // 1. Clear and Draw Background (Placeholder for DRR)
    ctx.clearRect(0, 0, width, height);
    // Draw a circular field limit
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.min(width, height) / 2 * 0.95, 0, 2 * Math.PI);
    ctx.fillStyle = '#333'; // Placeholder background color
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.stroke();
    
    if (!field) {
        ctx.fillStyle = '#eee';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("No Field Selected", centerX, centerY);
        return;
    }

    // 2. Draw Crosshairs (Isocenter)
    ctx.beginPath();
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)'; // Semi-transparent red
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Draw MLC Leaves based on data
    // Use mock data if available for the field name, otherwise default
    const mlcData = MOCK_MLC_DATA[field.fieldName] || { BankA: Array(20).fill(15), BankB: Array(20).fill(15) };
    const numLeaves = mlcData.BankA.length;
    const leafThickness = 1.0; // cm (simplified)
    const leafHeightPx = leafThickness * scale;
    
    // Calculate starting Y position to center the MLC bank
    const totalMlcHeightPx = numLeaves * leafHeightPx;
    let currentY = centerY - (totalMlcHeightPx / 2);

    ctx.fillStyle = 'rgba(80, 80, 80, 0.9)'; // Dark grey for leaves

    for (let i = 0; i < numLeaves; i++) {
        // Positions are distance from isocenter (midline)
        const posA_cm = mlcData.BankA[i];
        const posB_cm = mlcData.BankB[i];
        
        const posA_px = posA_cm * scale;
        const posB_px = posB_cm * scale;

        // Draw Bank A Leaf (Left side)
        // Draws from left edge up to the position
        ctx.fillRect(0, currentY, centerX - posA_px, leafHeightPx - 1); // -1 for slight gap

        // Draw Bank B Leaf (Right side)
        // Draws from position to the right edge
        ctx.fillRect(centerX + posB_px, currentY, width - (centerX + posB_px), leafHeightPx - 1);

        currentY += leafHeightPx;
    }
}


function initializeButtons() {
    // Wire up Workflow buttons for visual state change
    const workflowBtns = document.querySelectorAll('#workflow-bar .flow-step');
    workflowBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            workflowBtns.forEach(b => b.classList.remove('active-beam-on'));
            btn.classList.add('active-beam-on');
        });
    });

    // Wire up "Close Patient" button
    const closeBtn = document.getElementById('btn-close-patient');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.location.href = 'index_v2.html';
        });
    }

    // Wire up other toolbar buttons for logging
    const wiredBtns = document.querySelectorAll('.wired-btn, #btn-mlc-mode');
    wiredBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Use id or text content to identify the button
            const action = btn.id || btn.textContent;
            console.log(`Button clicked: ${action}`);
        });
    });
}

// Global State Variables
let currentPatientData = null;
let currentFieldsList = [];
let selectedFieldIndex = 0;
let isReorderMode = false;
let isDeactivateMode = false;
let overrideRequired = false;

// Define tolerances for parameter checks
const TOLERANCES = {
    angle: 2.0, // degrees (gantry, coll, couch, pitch, roll)
    position: 0.5, // cm (jaws, couch vrt/lng/lat)
    mu: 2.0 // monitor units
};

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const fileName = params.get('file');

    if (!fileName) {
        console.error('No patient file specified in URL.');
        document.getElementById('pt-name').textContent = 'Error: No File Found';
        return;
    }

    const cacheBuster = new Date().getTime();
    fetch(`data/${fileName}?v=${cacheBuster}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch patient data.');
            return response.json();
        })
        .then(patientData => {
            currentPatientData = patientData;
            // Initialize local field list from JSON data
            if (patientData.treatmentPlan && patientData.treatmentPlan.treatmentFields) {
                // Add a 'active' property to track deactivation state
                currentFieldsList = patientData.treatmentPlan.treatmentFields.map(f => ({...f, active: true}));
            }
            initializeTreatmentConsole(patientData);
        })
        .catch(error => {
            console.error(error);
            document.getElementById('pt-name').textContent = 'Error Loading Data';
        });

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

    // Populate field list using the local state variable
    populateFieldList();

    let deliveredFx = 0;
    if (patient.radiationOncologyData && patient.radiationOncologyData.treatmentDelivery) {
         deliveredFx = (patient.radiationOncologyData.treatmentDelivery.fractions || []).length;
    }
    const totalFx = plan.prescription ? plan.prescription.numberOfFractions : '-';
    document.getElementById('fx-counter').textContent = deliveredFx + 1;
    document.getElementById('fx-total').textContent = totalFx;
}


function populateFieldList() {
    const listContainer = document.getElementById('field-list-items');
    listContainer.innerHTML = '';

    if (currentFieldsList.length === 0) {
        listContainer.innerHTML = '<li style="padding: 10px; font-style: italic;">No fields defined.</li>';
        drawBEV(null);
        updateFieldParameters(null);
        return;
    }

    // Ensure selected index is valid
    if (selectedFieldIndex >= currentFieldsList.length) selectedFieldIndex = 0;

    currentFieldsList.forEach((fieldItem, index) => {
        const li = document.createElement('li');
        // Set active class only if it's the selected index AND it's not deactivated
        if (index === selectedFieldIndex && fieldItem.active) li.classList.add('active');
        if (!fieldItem.active) li.classList.add('deactivated');
        
        if (fieldItem.isImaging) {
            li.classList.add('imaging-field');
            li.innerHTML = `
                <i class="fa-solid fa-bars drag-handle"></i>
                <input type="checkbox" class="field-checkbox" ${fieldItem.active ? 'checked' : ''}>
                <span><i class="fa-solid fa-camera icon"></i> ${fieldItem.fieldName}</span>
            `;
        } else {
            li.innerHTML = `
                <i class="fa-solid fa-bars drag-handle"></i>
                <input type="checkbox" class="field-checkbox" ${fieldItem.active ? 'checked' : ''}>
                <span>${fieldItem.fieldName}</span>
                <span style="margin-left: auto;">0.0 / ${fieldItem.monitorUnits}</span>
            `;
        }

        // Makes list sortable
        li.draggable = true; 
        li.dataset.index = index;

        // Click handler for selection
        li.addEventListener('click', (e) => {
            // Don't trigger selection if clicking checkbox or drag handle
            if (e.target.classList.contains('field-checkbox') || e.target.classList.contains('drag-handle')) return;

            if (fieldItem.active) {
                selectedFieldIndex = index;
                populateFieldList(); // Re-render to update active classes
            }
        });

        // Checkbox handler for deactivation
        const checkbox = li.querySelector('.field-checkbox');
        checkbox.addEventListener('change', (e) => {
             fieldItem.active = e.target.checked;
             // If deselected field was active, find a new active field
             if (!fieldItem.active && index === selectedFieldIndex) {
                 const nextActive = currentFieldsList.findIndex(f => f.active);
                 selectedFieldIndex = nextActive !== -1 ? nextActive : 0;
             }
             populateFieldList(); // Re-render to show deactivated state
        });

        // --- Drag and Drop Handlers ---
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
            // Move item in the array
            const itemToMove = currentFieldsList.splice(fromIndex, 1)[0];
            currentFieldsList.splice(toIndex, 0, itemToMove);
            // Update selected index if needed
            if (selectedFieldIndex === fromIndex) selectedFieldIndex = toIndex;
            populateFieldList(); // Re-render list in new order
        });
        // -----------------------------

        listContainer.appendChild(li);
    });

    // Trigger update for the currently selected, active field
    const selectedField = currentFieldsList[selectedFieldIndex];
    if (selectedField && selectedField.active) {
        updateFieldParameters(selectedField);
    } else {
         // Clear displays if no active field is selected
        updateFieldParameters(null);
    }
}


function updateFieldParameters(field) {
    // Reset states
    overrideRequired = false;
    document.getElementById('tolerance-warning').style.display = 'none';
    document.getElementById('btn-override').disabled = true;
    document.querySelectorAll('.value-box').forEach(el => el.classList.remove('out-of-tolerance'));

    const formatVal = (val, fixed = 1) => (val !== undefined && val !== null) ? Number(val).toFixed(fixed) : '-';
    const formatText = (val) => (val !== undefined && val !== null) ? val : '-';

    // Helper function to check tolerance and update UI
    const checkTolerance = (planId, actualId, type) => {
        const planEl = document.getElementById(planId);
        const actualEl = document.getElementById(actualId);
        
        // In a real scenario, 'actual' would come from machine feedback.
        // Here we simulate it by just using the plan value.
        // To test the tolerance logic, we can manually add a small offset here:
        // let actualVal = parseFloat(planEl.textContent) + (type === 'angle' ? 2.1 : 0); 
        let actualVal = parseFloat(planEl.textContent);

        actualEl.textContent = formatVal(actualVal, type === 'position' ? 2 : 1);

        if (!isNaN(actualVal)) {
             const planVal = parseFloat(planEl.textContent);
             const tolerance = TOLERANCES[type];
             if (Math.abs(planVal - actualVal) > tolerance) {
                 actualEl.classList.add('out-of-tolerance');
                 overrideRequired = true;
             }
        }
    };

    if (!field || field.isImaging) {
        // Clear all parameter displays if it's an imaging field or null
        document.querySelectorAll('.treatment-data-container .value-box:not(.highlighted)').forEach(el => el.textContent = '-');
        document.getElementById('mu-total-plan').textContent = '-';
        document.getElementById('mu-actual-display').textContent = '-';
        drawBEV(null);
        return;
    }


    // --- 1. Update BEAM Parameters ---
    document.getElementById('beam-type-plan').textContent = formatText(field.beamTypeDisplay);
    document.getElementById('beam-type-actual').textContent = formatText(field.beamTypeDisplay);
    document.getElementById('energy-plan').textContent = formatText(field.energyDisplay);
    document.getElementById('energy-actual').textContent = formatText(field.energyDisplay);

    const totalMU = formatVal(field.monitorUnits, 1);
    document.getElementById('mu-total-plan').textContent = totalMU;
    document.getElementById('mu-actual-display').textContent = totalMU; // Simulated actual
    // checkTolerance('mu-total-plan', 'mu-actual-display', 'mu'); // Simulating check

    document.getElementById('dose-rate-plan').textContent = formatVal(field.doseRate, 0);
    document.getElementById('dose-rate-actual').textContent = formatVal(field.doseRate, 0);
    document.getElementById('time-plan').textContent = formatVal(field.estimatedTime_min, 2);
    document.getElementById('time-actual').textContent = formatVal(0.00, 2); 
    document.getElementById('wedge-plan').textContent = formatText(field.wedgeInfo);
    document.getElementById('wedge-actual').textContent = formatText(field.wedgeInfo);
    document.getElementById('bolus-plan').textContent = formatText(field.bolusInfo);
    document.getElementById('bolus-actual').textContent = formatText(field.bolusInfo);

    // --- 2. Update GEOMETRY Parameters & Check Tolerances ---
    // Parsing complex angle strings if necessary (e.g., ranges for arcs)
    const parseAngle = (val) => {
        if (typeof val === 'string' && val.includes('-')) return parseFloat(val.split('-')[0]);
        return parseFloat(val);
    }

    document.getElementById('gantry-plan').textContent = formatText(field.gantryAngle);
    // For tolerance check, we use a parsed numeric value
    // document.getElementById('gantry-plan').dataset.numericValue = parseAngle(field.gantryAngle);
    checkTolerance('gantry-plan', 'gantry-actual', 'angle');

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
    if (overrideRequired) {
        document.getElementById('tolerance-warning').style.display = 'block';
        document.getElementById('btn-override').disabled = false;
    }

    // --- 4. Update BEAM's Eye View ---
    drawBEV(field);
}

// --- MOCK MLC DATA (Keep existing mock data) ---
const MOCK_MLC_DATA = {
    'AP Femur': { BankA: Array(20).fill(5), BankB: Array(20).fill(5) },
    'PA Femur': { BankA: Array(20).fill(5), BankB: Array(20).fill(5) },
    'SBRT Arc 1': { BankA: [2,2,3,3,4,4,5,5,6,6,6,6,5,5,4,4,3,3,2,2], BankB: [2,2,3,3,4,4,5,5,6,6,6,6,5,5,4,4,3,3,2,2] },
    'SBRT Arc 2': { BankA: [6,6,5,5,4,4,3,3,2,2,2,2,3,3,4,4,5,5,6,6], BankB: [6,6,5,5,4,4,3,3,2,2,2,2,3,3,4,4,5,5,6,6] }
};

// --- keep existing drawBEV function ---
function drawBEV(field) {
    const canvas = document.getElementById('bev-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = width / 30; 

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.min(width, height) / 2 * 0.95, 0, 2 * Math.PI);
    ctx.fillStyle = '#333'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.stroke();
    
    if (!field || field.isImaging) { // Don't draw BEV for imaging fields
        ctx.fillStyle = '#eee'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
        ctx.fillText(field && field.isImaging ? "Imaging Field" : "No Field Selected", centerX, centerY);
        return;
    }

    ctx.beginPath();
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)'; ctx.lineWidth = 1; ctx.stroke();

    const mlcData = MOCK_MLC_DATA[field.fieldName] || { BankA: Array(20).fill(15), BankB: Array(20).fill(15) };
    const numLeaves = mlcData.BankA.length;
    const leafThickness = 1.0; 
    const leafHeightPx = leafThickness * scale;
    const totalMlcHeightPx = numLeaves * leafHeightPx;
    let currentY = centerY - (totalMlcHeightPx / 2);

    ctx.fillStyle = 'rgba(80, 80, 80, 0.9)';
    for (let i = 0; i < numLeaves; i++) {
        const posA_px = mlcData.BankA[i] * scale;
        const posB_px = mlcData.BankB[i] * scale;
        ctx.fillRect(0, currentY, centerX - posA_px, leafHeightPx - 1);
        ctx.fillRect(centerX + posB_px, currentY, width - (centerX + posB_px), leafHeightPx - 1);
        currentY += leafHeightPx;
    }
}


function initializeButtons() {
    // Workflow buttons
    const workflowBtns = document.querySelectorAll('#workflow-bar .flow-step');
    workflowBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            workflowBtns.forEach(b => b.classList.remove('active-beam-on'));
            btn.classList.add('active-beam-on');
        });
    });

    // Close Patient
    document.getElementById('btn-close-patient').addEventListener('click', () => {
        window.location.href = 'index_v2.html';
    });

    // --- Toolbar Button Functionality ---

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
        document.getElementById('btn-remove').disabled = !isDeactivateMode;
    });

    // Remove Button
    document.getElementById('btn-remove').addEventListener('click', () => {
        // Filter out inactive fields
        currentFieldsList = currentFieldsList.filter(f => f.active);
        // Reset selected index if current selection was removed
        if (selectedFieldIndex >= currentFieldsList.length) selectedFieldIndex = 0;
        populateFieldList();
    });

    // Add Button -> Opens Modal
    document.getElementById('btn-add').addEventListener('click', () => {
        document.getElementById('modal-add-imaging').style.display = 'block';
    });

    // Setup Notes Button -> Opens Modal
    document.getElementById('btn-setup-notes').addEventListener('click', () => {
        const notes = (currentPatientData && currentPatientData.radiationOncologyData && currentPatientData.radiationOncologyData.ctSimulation) 
                      ? currentPatientData.radiationOncologyData.ctSimulation.setupInstructions 
                      : "No setup instructions found.";
        document.getElementById('setup-notes-content').textContent = notes;
        document.getElementById('modal-setup-notes').style.display = 'block';
    });

    // Tools Button -> Opens Modal
    document.getElementById('btn-tools').addEventListener('click', () => {
        document.getElementById('modal-emr-tools').style.display = 'block';
    });

    // Override Button -> Opens Modal
    document.getElementById('btn-override').addEventListener('click', () => {
        if (overrideRequired) {
            document.getElementById('modal-override').style.display = 'block';
        }
    });

    // Acquire Button -> Captures parameters
    const btnAcquire = document.getElementById('btn-acquire');
    btnAcquire.addEventListener('click', () => {
        showNotification("Parameters Acquired & Saved.");
        btnAcquire.disabled = true; // Disable until new changes happen
        // In a real app, this would save the 'actual' values to the backend state.
    });

    // Apply/Cancel placeholder logging
    document.getElementById('btn-apply').addEventListener('click', () => console.log('Apply clicked'));
    document.getElementById('btn-cancel').addEventListener('click', () => console.log('Cancel clicked'));
}


function initializeModals() {
    // Close buttons for all modals
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        });
    });

    // Close modal when clicking outside content
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // --- Specific Modal Actions ---

    // Confirm Add Imaging
    document.getElementById('btn-confirm-add-imaging').addEventListener('click', () => {
        const modality = document.getElementById('imaging-type').value;
        const newImagingField = {
            fieldName: modality,
            isImaging: true,
            active: true
        };
        // Insert after currently selected field
        currentFieldsList.splice(selectedFieldIndex + 1, 0, newImagingField);
        populateFieldList();
        document.getElementById('modal-add-imaging').style.display = 'none';
        showNotification(`${modality} added.`);
    });

    // Confirm Override
    document.getElementById('btn-confirm-override').addEventListener('click', () => {
        const therapistId = document.getElementById('therapist-id').value;
        if (therapistId.trim() === "") {
            alert("Please enter a Therapist ID to confirm.");
            return;
        }
        console.log(`Override confirmed by: ${therapistId}`);
        // Clear warning state
        overrideRequired = false;
        document.getElementById('tolerance-warning').style.display = 'none';
        document.getElementById('btn-override').disabled = true;
        document.querySelectorAll('.value-box.out-of-tolerance').forEach(el => el.classList.remove('out-of-tolerance'));
        document.getElementById('modal-override').style.display = 'none';
        showNotification("Override Confirmed. Treatment Enabled.");
        document.getElementById('therapist-id').value = ''; // Clear input
    });

    // EMR Tool Tabs functionality
    const modalTabs = document.querySelectorAll('.modal-tab');
    modalTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            modalTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector('.modal-tab-content p').textContent = `Displaying content for: ${tab.textContent}`;
        });
    });
}

// Helper for showing temporary notifications
function showNotification(message) {
    const area = document.getElementById('notification-area');
    const note = document.createElement('div');
    note.className = 'notification';
    note.textContent = message;
    area.appendChild(note);
    // Remove after animation finishes (3s)
    setTimeout(() => { area.removeChild(note); }, 3000);
}
