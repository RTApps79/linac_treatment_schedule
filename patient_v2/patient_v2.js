document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const fileName = params.get('file');

    if (!fileName) {
        document.getElementById('patient-name-header').textContent = 'Error: No Patient File';
        return;
    }

    fetch(`data/${fileName}`)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(patient => {
            document.getElementById('patient-name-header').textContent = `Chart: ${patient.demographics.name}`;

            // --- Populate All Dashboard Sections ---
            populateDemographics(patient);
            populatePlanSummary(patient);
            populateDeliverySection(patient);
            populateBillingSection(patient);
            initializeImagingSection(patient);
            populateHistorySection(patient);
        })
        .catch(error => {
            console.error('Error fetching patient details:', error);
            document.getElementById('patient-name-header').textContent = 'Error Loading Chart';
        });
});

// --- LEFT COLUMN FUNCTIONS ---
function populateDemographics(patient) {
    const container = document.getElementById('demographics-section');
    const demo = patient.demographics || {};
    const diagnosis = patient.diagnosis || {};
    
    container.innerHTML = `
        <h2>Patient Demographics</h2>
        <div class="card-content">
            <p><strong>Name:</strong> ${demo.name || 'N/A'}</p>
            <p><strong>MRN:</strong> ${patient.patientId || 'N/A'}</p>
            <p><strong>DOB:</strong> ${demo.dob || 'N/A'}</p>
            <p><strong>Diagnosis:</strong> ${diagnosis.primary || 'N/A'}</p>
            <p><strong>Stage:</strong> ${diagnosis.overallStage || 'N/A'}</p>
        </div>
    `;
}

function populatePlanSummary(patient) {
    const container = document.getElementById('plan-summary-section');
    const plan = patient.treatmentPlan || {};
    
    container.innerHTML = `
        <h2>Active Treatment Plan</h2>
        <div class="card-content">
            <p><strong>Plan ID:</strong> ${plan.planId || 'N/A'}</p>
            <p><strong>Site:</strong> ${plan.treatmentSite || 'N/A'}</p>
            <p><strong>Oncologist:</strong> ${plan.radOnc || 'N/A'}</p>
            <p><strong>Prescription:</strong> ${plan.rtRxDetails || 'N/A'}</p>
            <p><strong>Technique:</strong> ${plan.technique || '3D-CRT'}</p>
            <p><strong>Alerts:</strong></p>
            <ul>${(plan.therapistAlerts || ['None']).map(alert => `<li>${alert}</li>`).join('')}</ul>
        </div>
    `;
}

// --- MIDDLE COLUMN FUNCTIONS ---
function populateDeliverySection(patient) {
    const container = document.getElementById('delivery-section');
    const prescription = patient.treatmentPlan.prescription || {};
    const delivered = (patient.radiationOncologyData.treatmentDelivery.fractions || []).length;
    const total = prescription.numberOfFractions || 'N/A';

    container.innerHTML = `
        <div class="delivery-container">
            <div class="delivery-header">
                <h2>Daily Treatment Delivery</h2>
                <div id="fraction-counter">Fraction ${delivered + 1} / ${total}</div>
            </div>
            <div class="form-group">
                <label for="treatment-date">Date</label>
                <input type="date" id="treatment-date">
            </div>
            <div class="form-group">
                <label for="therapist-notes">Session Notes</label>
                <textarea id="therapist-notes" rows="3" placeholder="Enter notes..."></textarea>
            </div>
            <button id="record-treatment-btn" class="action-button">Record Treatment & Sign Off</button>
            <div id="delivery-confirmation" class="confirmation-message"></div>
        </div>
    `;
    document.getElementById('treatment-date').valueAsDate = new Date();
    
    const btn = document.getElementById('record-treatment-btn');
    btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = "Treatment Recorded";
        btn.style.backgroundColor = "#6c757d";
        const confirm = document.getElementById('delivery-confirmation');
        confirm.textContent = "Fraction recorded successfully.";
        confirm.style.display = "block";
    };
}

// NEW FUNCTION to populate the detailed delivery history
function populateDeliveryHistory(patient) {
    const container = document.getElementById('delivery-history-section');
    let fractions = [];
    let totalFractions = 'N/A';

    // Safely navigate the JSON structure to find fractions
    if (patient.radiationOncologyData && 
        patient.radiationOncologyData.treatmentDelivery && 
        Array.isArray(patient.radiationOncologyData.treatmentDelivery.fractions)) {
        fractions = patient.radiationOncologyData.treatmentDelivery.fractions;
    }

    // Get total fractions from the prescription or from the first fraction record
    if (patient.treatmentPlan && patient.treatmentPlan.prescription && patient.treatmentPlan.prescription.numberOfFractions) {
        totalFractions = patient.treatmentPlan.prescription.numberOfFractions;
    } else if (fractions.length > 0 && fractions[0].totalFractions) {
        totalFractions = fractions[0].totalFractions;
    }

    const deliveredCount = fractions.length;

    let tableRows = fractions.length > 0 ? fractions.map(fx => `
        <tr>
            <td>${fx.fractionNumber}</td>
            <td>${fx.date}</td>
            <td>${fx.machine || 'N/A'}</td>
            <td>${fx.igrtMatchQuality || 'N/A'}</td>
            <td>${fx.therapistInitials || 'N/A'}</td>
        </tr>
    `).join('') : '<tr><td colspan="5">No fractions delivered yet.</td></tr>';

    container.innerHTML = `
        <h2>Treatment Delivery History</h2>
        <div class="card-content">
            <p><strong>Progress:</strong> ${deliveredCount} of ${totalFractions} fractions delivered.</p>
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Fx #</th>
                        <th>Date</th>
                        <th>Machine</th>
                        <th>IGRT Result</th>
                        <th>Therapists</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
}
function populateBillingSection(patient) {
    const container = document.getElementById('billing-section');
    const charges = patient.cptCharges || [];
    const dailyCodes = charges.filter(c => c.frequency && c.frequency.toLowerCase().includes('daily'));

    let tableRows = dailyCodes.length ? dailyCodes.map(code => `
        <tr>
            <td><input type="checkbox" checked></td>
            <td>${code.code}</td>
            <td>${code.description}</td>
        </tr>
    `).join('') : `<tr><td colspan="3">No daily codes found.</td></tr>`;

    container.innerHTML = `
        <div class="billing-container">
             <div class="delivery-header">
                <h2>Daily Charge Capture</h2>
            </div>
            <div id="cpt-table-container">
                <table>
                    <thead><tr><th>Select</th><th>CPT</th><th>Description</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            <button id="capture-codes-btn" class="action-button">Capture Selected Charges</button>
            <div id="billing-confirmation" class="confirmation-message"></div>
        </div>
    `;

    const btn = document.getElementById('capture-codes-btn');
    btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = "Charges Captured";
        btn.style.backgroundColor = "#6c757d";
        const confirm = document.getElementById('billing-confirmation');
        confirm.textContent = "Charges submitted successfully.";
        confirm.style.display = "block";
    };
}

// --- RIGHT COLUMN FUNCTIONS ---
function initializeImagingSection(patient) {
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
    }

    const inputs = {
        x: document.getElementById('x-axis'),
        y: document.getElementById('y-axis'),
        z: document.getElementById('z-axis'),
        pitch: document.getElementById('pitch-axis')
    };

    let shifts = { x: 0, y: 0, z: 0, pitch: 0 };
    // Simulate initial misalignment
    let initialRandomShifts = {
        x: (Math.random() * 1.5 - 0.75).toFixed(1),
        y: (Math.random() * 1.5 - 0.75).toFixed(1),
        z: 0, pitch: 0
    };

    function applyTransform() {
        // Multiplied by 20 for better visualization scaling
        const totalX = (parseFloat(shifts.x) + parseFloat(initialRandomShifts.x)) * 20;
        const totalY = (parseFloat(shifts.y) + parseFloat(initialRandomShifts.y)) * 20;
        overlay.style.transform = `translate(${totalX}px, ${totalY}px) rotate(${shifts.pitch}deg)`;
    }

    function updateDisplay() {
        for (const axis in shifts) {
            if (inputs[axis]) inputs[axis].value = shifts[axis].toFixed(1);
        }
        applyTransform();
    }
    
    // Initialize
    updateDisplay();

    opacitySlider.addEventListener('input', (e) => {
        overlay.style.opacity = e.target.value / 100;
    });

    controlBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const axis = e.target.dataset.axis;
            const dir = parseInt(e.target.dataset.dir, 10);
            // Use smaller steps for pitch
            const step = (axis === 'pitch') ? 0.5 : 0.1; 
            
            shifts[axis] += dir * step;
            // Clamp values
            if (shifts[axis] > 5.0) shifts[axis] = 5.0;
            if (shifts[axis] < -5.0) shifts[axis] = -5.0;

            updateDisplay();
            shiftConfirmation.style.display = 'none';
            applyBtn.disabled = false;
        });
    });

    resetBtn.addEventListener('click', () => {
        shifts = { x: 0, y: 0, z: 0, pitch: 0 };
        updateDisplay();
        shiftConfirmation.style.display = 'none';
        applyBtn.disabled = false;
    });

    applyBtn.addEventListener('click', () => {
        const appliedText = `Shifts Applied: VRT=${shifts.y.toFixed(1)}, LAT=${shifts.x.toFixed(1)}, LNG=${shifts.z.toFixed(1)}, PITCH=${shifts.pitch.toFixed(1)}°`;
        shiftConfirmation.textContent = appliedText;
        shiftConfirmation.style.display = 'block';
        applyBtn.disabled = true;
    });
    
    // Image Dragging Logic
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
        // Scaling factor to make dragging feel right
        const dx = (e.clientX - startPos.x) / 20; 
        const dy = (e.clientY - startPos.y) / 20;
        shifts.x += dx;
        shifts.y += dy;
        startPos.x = e.clientX;
        startPos.y = e.clientY;
        updateDisplay();
        shiftConfirmation.style.display = 'none';
        applyBtn.disabled = false;
    });
}

function populateHistorySection(patient) {
    const container = document.getElementById('history-section');
    const records = patient.radiationOncologyData.treatmentDelivery.fractions || [];
    
    let recordsHTML = records.length ? `
        <div class="records-table">
            <div class="records-header">
                <div>#</div><div>Date</div><div>Notes</div>
            </div>
            ${records.map(fx => `
                <div class="records-row">
                    <div>${fx.fractionNumber}</div>
                    <div>${fx.date}</div>
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fx.sideEffects || fx.notes || '-'}</div>
                </div>
            `).join('')}
        </div>` : '<p class="card-content">No treatment records yet.</p>';

    container.innerHTML = `
        <h2>Treatment History</h2>
        ${recordsHTML}
    `;
}
