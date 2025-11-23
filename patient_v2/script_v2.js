document.addEventListener('DOMContentLoaded', () => {
    // This array MUST match the exact filenames in your 'data' folder.
    // Updated with the files from your recent uploads.
    const patientFiles = [
         'Alice_Brown_SkeletalExtremity.json',
         'James_Wilson_PelvisProstate.json',
         'Jane_Smith_SVCS.json',
         'George_Harris_SkeletalSpine.json',
         'Linda_Jones_ThoraxIMRT.json',
         'Robert_Miller_ThoraxSBRT.json'
    ];

    const scheduleBody = document.getElementById('schedule-body');
    scheduleBody.innerHTML = ''; // Clear the "Loading..." message

    // Create a promise for each file fetch
    const fetchPromises = patientFiles.map(file =>
        // Ensure the path 'data/' matches your actual folder structure
        fetch(`data/${file}`).then(response => {
            if (!response.ok) {
                // Helpful error message if a file isn't found
                throw new Error(`Failed to load ${file} (404 Not Found)`);
            }
            return response.json();
        }).then(data => {
            // Attach the source filename to the data object for linking later
            data._sourceFilename = file;
            return data;
        })
    );

    // When all files are fetched, populate the table
    Promise.all(fetchPromises)
        .then(patients => {
            // Sort patients alphabetically by name
            patients.sort((a, b) => {
                const nameA = a.demographics?.name || 'ZZZ';
                const nameB = b.demographics?.name || 'ZZZ';
                return nameA.localeCompare(nameB);
            });

            let timeBase = 9 * 60; // Start time 9:00 AM in minutes from midnight
            
            patients.forEach((patient, index) => {
                // Calculate appointment time (15-minute intervals)
                const appointmentMins = timeBase + (index * 15);
                const hours = Math.floor(appointmentMins / 60);
                const mins = appointmentMins % 60;
                // Format time as HH:MMam/pm
                const timeString = `${hours > 12 ? hours - 12 : hours}:${mins.toString().padStart(2, '0')}${hours >= 12 ? 'pm' : 'am'}`;

                const row = document.createElement('div');
                row.className = 'table-row';

                // Link to the new patient view layout
                // Uses the filename we attached earlier
                const patientLink = `patient_v2.html?file=${patient._sourceFilename}`;

                // Safely access data fields with fallbacks
                const demo = patient.demographics || {};
                const plan = patient.treatmentPlan || {};
                const diagnosis = patient.diagnosis || {};

                const patientName = demo.name || 'Unknown';
                const patientId = patient.patientId || 'N/A';
                const primaryDiagnosis = diagnosis.primary || 'N/A';
                const radOnc = plan.radOnc || 'N/A';
                const site = plan.treatmentSite || 'N/A';

                row.innerHTML = `
                    <div class="row-item appointment-time">${timeString}</div>
                    <div class="row-item patient-name"><a href="${patientLink}">${patientName} (${patientId})</a></div>
                    <div class="row-item">${primaryDiagnosis}</div>
                    <div class="row-item">${radOnc}</div>
                    <div class="row-item">${site}</div>
                    <div class="row-item status-cell"><span class="status-indicator status-checked-in">Checked In</span></div>
                `;
                scheduleBody.appendChild(row);
            });
        })
        .catch(error => {
            console.error('Error fetching patient data:', error);
            // Display an error message on the page if loading fails
            scheduleBody.innerHTML = `
                <div class="table-row" style="display: block; text-align: center; padding: 20px; color: #dc3545;">
                    <strong>Failed to load patient schedule.</strong><br>
                    <small>Check console for details (likely missing files in 'data' folder).</small>
                </div>
            `;
        });
});
