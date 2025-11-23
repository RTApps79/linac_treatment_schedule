document.addEventListener('DOMContentLoaded', () => {
    // 1. Determine which patient file to load
    // For this demo, we hardcode one file. In a real app, this would come from the URL or a selection screen.
    const patientFile = 'Alice_Brown_SkeletalExtremity.json';

    // 2. Fetch and load the data
    fetch(`data/${patientFile}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load patient data');
            return response.json();
        })
        .then(patientData => {
            // 3. Initialize the interface with the loaded data
            initializeInterface(patientData);
        })
        .catch(error => {
            console.error(error);
            document.getElementById('sidebar-patient-info').innerHTML = `<div style="color: red;">Error loading data.</div>`;
        });
});

function initializeInterface(patient) {
    // A. Populate Sidebar Patient Info
    populatePatientInfo(patient);

    // B. Populate Fields List & Set Active Field
    const fields = patient.treatmentPlan.treatmentFields || [];
    populateFieldsList(fields);

    // C. Initialize Tabs Functionality
    initializeTabs();

    // Update Date
    document.getElementById('current-date').textContent = new Date().toLocaleDateString();
}

function populatePatientInfo(patient) {
    const container = document.getElementById('sidebar-patient-info');
    const demo = patient.demographics;
    container.innerHTML = `
        <p><span class="patient-label">ID</span> ${patient.patientId}</p>
        <p><span class="patient-label">Name</span> <strong>${demo.name}</strong></p>
        <p><span class="patient-label">DOB</span> ${demo.dob}</p>
        <p><span class="patient-label">Rad Onc</span> ${patient.treatmentPlan.radOnc.split(' ').pop()}</p>
    `;
}

function populateFieldsList(fields) {
    const listContainer = document.getElementById('fields-list');
    listContainer.innerHTML = ''; // Clear existing

    fields.forEach((field, index) => {
        const item = document.createElement('div');
        // Make the first field active by default
        item.className = `field-item ${index === 0 ? 'active-field' : ''}`;
        item.innerHTML = `
            <i class="fa-solid fa-tag"></i>
            <span>${field.fieldName}</span>
            ${index === 0 ? `<span class="mu-display">0.0 / ${field.monitorUnits}</span>` : ''}
            <i class="fa-solid fa-check check-icon"></i>
        `;

        // Add click handler to switch active field
        item.addEventListener('click', () => {
            document.querySelectorAll('.field-item').forEach(fi => {
                fi.classList.remove('active-field');
                const muDisplay = fi.querySelector('.mu-display');
                if (muDisplay) muDisplay.remove();
            });
            item.classList.add('active-field');
             // Add MU display to new active field
             const muSpan = document.createElement('span');
             muSpan.className = 'mu-display';
             muSpan.textContent = `0.0 / ${field.monitorUnits}`;
             item.insertBefore(muSpan, item.querySelector('.check-icon'));
             
            // Update parameter tabs with the newly selected field's data
            updateParameters(field);
        });

        listContainer.appendChild(item);
    });

    // Initial parameter update for the first field
    if (fields.length > 0) {
        updateParameters(fields[0]);
    }
}

function updateParameters(field) {
    // --- Update Beam Tab ---
    document.getElementById('energy-plan').textContent = field.energy_MV + 'x';
    // Simulate "Actual" matching "Plan"
    document.getElementById('energy-actual').textContent = field.energy_MV + 'x';
    
    document.getElementById('mu-plan').textContent = field.monitorUnits;
    // Reset actual MU and progress bar for the new field
    document.getElementById('mu-actual').textContent = '0.0';
    document.querySelector('.mu-progress-fill').style.width = '0%';

    // --- Update Geometry Tab ---
    // Helper to handle ranges (e.g., "180-0") vs single angles
    const formatAngle = (angle) => angle.toString().includes('-') ? angle : parseFloat(angle).toFixed(1);

    const gantry = formatAngle(field.gantryAngle);
    document.getElementById('gantry-plan').textContent = gantry;
    document.getElementById('gantry-actual').textContent = gantry;

    const coll = formatAngle(field.collimatorAngle);
    document.getElementById('coll-plan').textContent = coll;
    document.getElementById('coll-actual').textContent = coll;

    const couch = formatAngle(field.couchAngle);
    document.getElementById('couch-rtn-plan').textContent = couch;
    document.getElementById('couch-rtn-actual').textContent = couch;

    // Jaws
    const jaws = field.jawPositions_cm;
    document.getElementById('y1-plan').textContent = jaws.Y1.toFixed(1);
    document.getElementById('y1-actual').textContent = jaws.Y1.toFixed(1);
    document.getElementById('y2-plan').textContent = jaws.Y2.toFixed(1);
    document.getElementById('y2-actual').textContent = jaws.Y2.toFixed(1);
    document.getElementById('x1-plan').textContent = jaws.X1.toFixed(1);
    document.getElementById('x1-actual').textContent = jaws.X1.toFixed(1);
    document.getElementById('x2-plan').textContent = jaws.X2.toFixed(1);
    document.getElementById('x2-actual').textContent = jaws.X2.toFixed(1);
}

function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Deactivate all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // Activate clicked
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
}
