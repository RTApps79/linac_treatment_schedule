document.addEventListener('DOMContentLoaded', () => {
    // 1. Get Patient File from URL
    const params = new URLSearchParams(window.location.search);
    const fileName = params.get('file');

    if (!fileName) {
        console.error('No patient file specified in URL.');
        document.getElementById('pt-name').textContent = 'Error: No File Found';
        return;
    }

    // 2. Fetch Patient JSON Data
    fetch(`data/${fileName}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch patient data.');
            return response.json();
        })
        .then(patientData => {
            // 3. Initialize Console with Data
            initializeTreatmentConsole(patientData);
        })
        .catch(error => {
            console.error(error);
            document.getElementById('pt-name').textContent = 'Error Loading Data';
        });

    // 4. Wire up Bottom Ribbon Buttons
    initializeBottomRibbon();
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
        listContainer.innerHTML = '<li>No fields defined in plan.</li>';
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
    
    const beamType = formatText(field.beamTypeDisplay);
    document.getElementById('beam-type-plan').textContent = beamType;
    document.getElementById('beam-type-actual').textContent = beamType;

    const energy = formatText(field.energyDisplay);
    document.getElementById('energy-plan').textContent = energy;
    document.getElementById('energy-actual').textContent = energy;

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

    const doseRate = formatVal(field.doseRate, 0);
    document.getElementById('dose-rate-plan').textContent = doseRate;
    document.getElementById('dose-rate-actual').textContent = doseRate;

    const time = formatVal(field.estimatedTime_min, 2);
    document.getElementById('time-plan').textContent = time;
    document.getElementById('time-actual').textContent = formatVal(0.00, 2); 

    const wedge = formatText(field.wedgeInfo);
    document.getElementById('wedge-plan').textContent = wedge;
    document.getElementById('wedge-actual').textContent = wedge;

    const bolus = formatText(field.bolusInfo);
    document.getElementById('bolus-plan').textContent = bolus;
    document.getElementById('bolus-actual').textContent = bolus;


    // --- 2. Update GEOMETRY Parameters (Yellow Container) ---

    const gantry = formatText(field.gantryAngle);
    document.getElementById('gantry-plan').textContent = gantry;
    document.getElementById('gantry-actual').textContent = gantry;

    const coll = formatVal(field.collimatorAngle, 1);
    document.getElementById('coll-plan').textContent = coll;
    document.getElementById('coll-actual').textContent = coll;

    const couchRtn = formatVal(field.couchAngle, 1);
    document.getElementById('couch-rtn-plan').textContent = couchRtn;
    document.getElementById('couch-rtn-actual').textContent = couchRtn;

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

    // Couch Pitch & Roll (NEW)
    document.getElementById('couch-pitch-plan').textContent = formatVal(field.pitchAngle, 1);
    document.getElementById('couch-pitch-actual').textContent = formatVal(field.pitchAngle, 1);
    document.getElementById('couch-roll-plan').textContent = formatVal(field.rollAngle, 1);
    document.getElementById('couch-roll-actual').textContent = formatVal(field.rollAngle, 1);
}


function initializeBottomRibbon() {
    const closeBtn = document.getElementById('btn-close-patient');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.location.href = 'index_v2.html';
        });
    }

    const wiredBtns = document.querySelectorAll('.wired-btn');
    wiredBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            alert(`Action '${action}' triggered. Functionality not yet implemented.`);
        });
    });
}
