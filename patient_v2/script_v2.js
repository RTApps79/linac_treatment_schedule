document.addEventListener('DOMContentLoaded', () => {
const patientFiles = [
     'James_Wilson_PelvisProstate.json',
     'Linda_Jones_ThoraxIMRT.json',
     'Jane_Smith_SVCS.json',
     'Robert_Miller_ThoraxSBRT.json',
     'George_Harris_SkeletalSpine.json',
     'Alice_Brown_SkeletalExtremity.json',
     // Other files omitted for brevity as they aren't used in the main list generation loop in the original code
];
const scheduleBody = document.getElementById('schedule-body');
    scheduleBody.innerHTML = ''; // Clear the "Loading..." message

    const fetchPromises = patientFiles.map(file =>
        fetch(`data/${file}`).then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok for ${file}`);
            }
            return response.json();
        })
    );

    Promise.all(fetchPromises)
        .then(patients => {
            patients.sort((a, b) => a.demographics.name.localeCompare(b.demographics.name));

            let time = 9; // Start time
            patients.forEach((patient, index) => {
                const appointmentTime = `${time + Math.floor(index / 4)}:${(index % 4) * 15}`.padStart(5, '0');
                const patientFileName = patientFiles.find(f => f.toLowerCase().includes(patient.demographics.name.split(' ')[0].toLowerCase()));

                const row = document.createElement('div');
                row.className = 'table-row';

                // UPDATED LINK TO point to patient_v2.html
                const patientLink = `patient_v2.html?file=${patientFileName}`;

                const primaryDiagnosis = (patient.diagnosis && patient.diagnosis.primary) ? patient.diagnosis.primary : 'N/A';

                row.innerHTML = `
                    <div class="row-item">${appointmentTime}am</div>
                    <div class="row-item patient-name"><a href="${patientLink}">${patient.demographics.name} (${patient.patientId})</a></div>
                    <div class="row-item">${primaryDiagnosis}</div>
                    <div class="row-item">${patient.treatmentPlan.radOnc}</div>
                    <div class="row-item">${patient.treatmentPlan.treatmentSite}</div>
                    <div class="row-item">Checked In</div>
                `;
                scheduleBody.appendChild(row);
            });
        })
        .catch(error => {
            console.error('Error fetching patient data:', error);
            scheduleBody.innerHTML = `<div class="table-row"><div class="row-item" style="color: red; text-align: center;">Failed to load patient data.</div></div>`;
        });
});
