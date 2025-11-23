// =========================================
// GLOBAL STATE & CONFIGURATION
// =========================================

let currentPatientData = null;
// Holds the local state of fields (order, activation status, added imaging fields)
let currentFieldsList = [];
let selectedFieldIndex = 0;

// UI Mode States
let isReorderMode = false;
let isDeactivateMode = false;
let overrideRequired = false;

// Define tolerances for parameter checks (Plan vs Actual deviation allowed)
const TOLERANCES = {
    angle: 2.0,    // degrees (gantry, coll, couch, pitch, roll)
    position: 0.5, // cm (jaws, couch vrt/lng/lat)
    mu: 2.0        // monitor units
};

// Mock Data for MLC leaves (since JSON doesn't have detailed leaf positions yet)
const MOCK_MLC_DATA = {
    'AP Femur': { BankA: Array(20).fill(5), BankB: Array(20).fill(5) },
    'PA Femur': { BankA: Array(20).fill(5), BankB: Array(20).fill(5) },
    // More complex shaped fields for demo
    'SBRT Arc 1': { 
        BankA: [2,2,3,3,4,4,5,5,6,6,6,6,5,5,4,4,3,3,2,2], 
        BankB: [2,2,3,3,4,4,5,5,6,6,6,6,5,5,4,4,3,3,2,2] 
    },
    'SBRT Arc 2': {
        BankA: [6,6,5,5,4,4,3,3,2,2,2,2,3,3,4,4,5,5,6,6],
        BankB: [6,6,5,5,4,4,3,3,2,2,2,2,3,3,4,4,5,5,6,6]
    }
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
                currentFieldsList = patientData.treatmentPlan.treatmentFields.map(f => ({...f, active: true}));
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

    // C. Update Fraction Counter (Simulated based on delivery records length)
    let deliveredFx = 0;
    if (patient.radiationOncologyData && patient.radiationOncologyData.treatmentDelivery) {
         deliveredFx = (patient.radiationOncologyData.treatmentDelivery.fractions || []).length;
    }
    const totalFx = plan.prescription ? plan.prescription.numberOfFractions : '-';
    document.getElementById('fx-counter').textContent = deliveredFx + 1;
    document.getElementById('fx-total').textContent = totalFx;
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
        
        // Render Content based on field type (Imaging vs Treatment)
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

        // Enable Drag and Drop functionality
        li.draggable = true; 
        li.dataset.index = index;

        // --- Event Handlers ---

        // 1. Selection Click Handler
        li.addEventListener('click', (e) => {
            // Don't trigger selection if clicking directly on checkbox or drag handle
            if (e.target.classList.contains('field-checkbox') || e.target.classList.contains('drag-handle')) return;

            if (fieldItem.active) {
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
    // 1. Reset Tolerance/Override States
    overrideRequired = false;
    document.getElementById('tolerance-warning').style.display = 'none';
    document.getElementById('btn-override').disabled = true;
    document.querySelectorAll('.value-box').forEach(el => el.classList.remove('out-of-tolerance'));

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


    // --- 2. Update BEAM Parameters (Red Container) ---
    document.getElementById('beam-type-plan').textContent = formatText(field.beamTypeDisplay);
    document.getElementById('beam-type-actual').textContent = formatText(field.beamTypeDisplay);

    document.getElementById('energy-plan').textContent = formatText(field.energyDisplay);
    document.getElementById('energy-actual').textContent = formatText(field.energyDisplay);

    const totalMU = formatVal(field.monitorUnits, 1);
    document.getElementById('mu-total-plan').textContent = totalMU;
    document.getElementById('mu-actual-display').textContent = totalMU; 
    // checkTolerance('mu-total-plan', 'mu-actual-display', 'mu'); // Optional: Check MU tolerance

    document.getElementById('dose-rate-plan').textContent = formatVal(field.doseRate, 0);
    document.getElementById('dose-rate-actual').textContent = formatVal(field.doseRate, 0);

    document.getElementById('time-plan').textContent = formatVal(field.estimatedTime_min, 2);
    document.getElementById('time-actual').textContent = formatVal(0.00, 2); // Timer reset

    document.getElementById('wedge-plan').textContent = formatText(field.wedgeInfo);
    document.getElementById('wedge-actual').textContent = formatText(field.wedgeInfo);

    document.getElementById('bolus-plan').textContent = formatText(field.bolusInfo);
    document.getElementById('bolus-actual').textContent = formatText(field.bolusInfo);


    // --- 3. Update GEOMETRY Parameters & Check Tolerances (Yellow Container) ---
    
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

    // --- 4. Finalize Tolerance State ---
    if (overrideRequired) {
        document.getElementById('tolerance-warning').style.display = 'block';
        document.getElementById('btn-override').disabled = false;
    }

    // --- 5. Update Beam's Eye View ---
    drawBEV(field);
}


// =========================================
// BEAM'S EYE VIEW (Canvas Drawing)
// =========================================

function drawBEV(field) {
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
    ctx.fillStyle = '#333'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.stroke();
    
    // Handle cases with no field or imaging field selected
    if (!field || field.isImaging) { 
        ctx.fillStyle = '#eee'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
        ctx.fillText(field && field.isImaging ? "Imaging Field View" : "No Field Selected", centerX, centerY);
        return;
    }

    // 2. Draw Crosshairs (Isocenter)
    ctx.beginPath();
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)'; ctx.lineWidth = 1; ctx.stroke();

    // 3. Draw MLC Leaves based on mock data
    const mlcData = MOCK_MLC_DATA[field.fieldName] || { BankA: Array(20).fill(15), BankB: Array(20).fill(15) };
    const numLeaves = mlcData.BankA.length;
    const leafThickness_cm = 1.0; 
    const leafHeightPx = leafThickness_cm * scale;
    const totalMlcHeightPx = numLeaves * leafHeightPx;
    // Calculate starting Y position to center the MLC bank vertically
    let currentY = centerY - (totalMlcHeightPx / 2);

    ctx.fillStyle = 'rgba(80, 80, 80, 0.9)'; // Dark grey leaves
    for (let i = 0; i < numLeaves; i++) {
        // Positions are distance from isocenter (midline) in cm
        const posA_px = mlcData.BankA[i] * scale;
        const posB_px = mlcData.BankB[i] * scale;

        // Draw Bank A Leaf (Left side) - draws from left edge up to position
        ctx.fillRect(0, currentY, centerX - posA_px, leafHeightPx - 1);
        // Draw Bank B Leaf (Right side) - draws from position to right edge
        ctx.fillRect(centerX + posB_px, currentY, width - (centerX + posB_px), leafHeightPx - 1);

        currentY += leafHeightPx;
    }
}


// =========================================
// BUTTON & MODAL WIRING
// =========================================

function initializeButtons() {
    // Workflow Buttons (visual toggle only)
    const workflowBtns = document.querySelectorAll('#workflow-bar .flow-step');
    workflowBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            workflowBtns.forEach(b => b.classList.remove('active-beam-on'));
            btn.classList.add('active-beam-on');
        });
    });

    // Close Patient -> Return to Schedule index
    document.getElementById('btn-close-patient').addEventListener('click', () => {
        window.location.href = 'index_v2.html';
    });

    // --- Toolbar Tools ---

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

    // Add Button -> Opens Imaging Modal
    document.getElementById('btn-add').addEventListener('click', () => {
        document.getElementById('modal-add-imaging').style.display = 'block';
    });

    // Setup Notes Button -> Opens Notes Modal with data
    document.getElementById('btn-setup-notes').addEventListener('click', () => {
        const notes = (currentPatientData && currentPatientData.radiationOncologyData && currentPatientData.radiationOncologyData.ctSimulation) 
                      ? currentPatientData.radiationOncologyData.ctSimulation.setupInstructions 
                      : "No setup instructions found for this patient.";
        document.getElementById('setup-notes-content').textContent = notes;
        document.getElementById('modal-setup-notes').style.display = 'block';
    });

    // Tools Button -> Opens EMR Tools Modal
    document.getElementById('btn-tools').addEventListener('click', () => {
        document.getElementById('modal-emr-tools').style.display = 'block';
    });

    // Override Button -> Opens Confirmation Modal (if required)
    document.getElementById('btn-override').addEventListener('click', () => {
        if (overrideRequired) {
            document.getElementById('modal-override').style.display = 'block';
        }
    });

    // Acquire Button -> Simulates capturing parameters
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

    // Confirm Add Imaging Field
    document.getElementById('btn-confirm-add-imaging').addEventListener('click', () => {
        const modality = document.getElementById('imaging-type').value;
        const newImagingField = {
            fieldName: modality,
            isImaging: true,
            active: true
        };
        // Insert new field after currently selected one
        currentFieldsList.splice(selectedFieldIndex + 1, 0, newImagingField);
        populateFieldList(); // Re-render list
        document.getElementById('modal-add-imaging').style.display = 'none';
        showNotification(`${modality} added.`);
    });

    // Confirm Parameter Override
    document.getElementById('btn-confirm-override').addEventListener('click', () => {
        const therapistId = document.getElementById('therapist-id').value;
        if (therapistId.trim() === "") {
            alert("Please enter a Therapist ID to confirm.");
            return;
        }
        console.log(`Override confirmed byID: ${therapistId}`);
        
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

    // EMR Tool Tab Switching Logic
    const modalTabs = document.querySelectorAll('.modal-tab');
    modalTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            modalTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // Update content based on selected tab (placeholder logic)
            document.querySelector('.modal-tab-content p').textContent = `Displaying placeholder content for: ${tab.textContent}`;
        });
    });
}

// Helper to show temporary toast notifications
function showNotification(message) {
    const area = document.getElementById('notification-area');
    const note = document.createElement('div');
    note.className = 'notification';
    note.textContent = message;
    area.appendChild(note);
    // Remove notification after 3 seconds
    setTimeout(() => { area.removeChild(note); }, 3000);
}
