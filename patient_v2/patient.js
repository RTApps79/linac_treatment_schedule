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

            // --- Populate All Sections ---
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
                <textarea id="therapist-notes" rows="3"></textarea>
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
        document.getElementById('delivery-confirmation').textContent = "Fraction recorded successfully.";
        document.getElementById('delivery-confirmation').style.display = "block";
    };
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
        document.getElementById('billing-confirmation').textContent = "Charges submitted successfully.";
        document.getElementById('billing-confirmation').style.display = "block";
    };
}

// --- RIGHT COLUMN FUNCTIONS ---
function initializeImagingSection(patient) {
    // This function remains largely the same, just targeting the elements 
    // that are now permanently in the HTML.
    const drrImage = document.getElementById('drr-image');
    const overlay = document.getElementById('kv-image-overlay');
    // ... (rest of the imaging logic: sliders, buttons, dragging) ...
    // Ensure you copy the full logic from your original initializeImagingTab function here.
    // For brevity in this response, I'm indicating where it goes.
    
    if (patient.imagingData) {
        drrImage.src = `images/${patient.imagingData.drrImage}`;
        overlay.src = `images/${patient.imagingData.kvImage}`;
    }

    // Re-initialize your event listeners for opacity, shifts, reset, and apply here.
    // Refer back to your original code for the complete implementation of this function.
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
