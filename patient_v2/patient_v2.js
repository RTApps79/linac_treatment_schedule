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
