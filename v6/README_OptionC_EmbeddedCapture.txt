Option C: Embedded data capture + auto-fill + CSV export

Files added:
- study_capture.js   (data model + CSV export; matches your Excel template columns)
- study_embed.js     (embedded modal UI, auto-fill, keyboard shortcuts)
- study_embed.css    (modal styles)

Drop-in integration steps:
1) Include CSS (patient.html <head>):
   <link rel="stylesheet" href="study_embed.css">

2) Include scripts (before patient.js):
   <script src="study_capture.js"></script>
   <script src="study_embed.js"></script>
   <script src="patient.js"></script>

3) Provide patient context (auto-fill):
   After you load the patient JSON (the on-screen values), call:
     window.StudyUI.setPatientContext(patient, fileName);
   and/or dispatch:
     document.dispatchEvent(new CustomEvent('rt:patient-loaded', {detail:{patient, fileName}}));

   (This patch is already included in the modified patient.js provided.)

4) Timer (recommended):
   When a scenario begins (e.g., when the therapist clicks Prepare to start verification), call:
     window.StudyUI.markScenarioStart();

   Note: the included patient.js also attempts to auto-bind a button named "Prepare" (or ids like #prepare-btn) to markScenarioStart().
   If your emulator uses different markup, add the call directly in your Prepare handler.

   When the scenario ends at the console (your workflow uses the Record button), call:
     window.StudyUI.markScenarioEnd();

5) Scenario completion (opens questions + saves row):
   After the end marker, open the Scenario Entry form:
     window.studyScenarioComplete();

   You may optionally override auto-fill values:
     window.studyScenarioComplete({
       configuration: 'Horizontal',
       scenarioId: 'Jane_Smith_MOD_2_errors',
       errorsPresent: 2,
       startedAt: '2026-01-01T12:34:56.000Z'
     });

6) Manual fallback:
   - Click the floating "Study Log" button (bottom-right) to open the Scenario Entry form.
   - Keyboard shortcuts:
       Ctrl+Shift+L  => open Scenario Entry
       Ctrl+Shift+P  => open Participant Setup

Export:
- Click "Export CSV" in the modal footer to download a CSV with template columns + optional extras.
- Excel can open the CSV and you can paste/import into your master workbook.

Notes:
- Data are stored in the browser (localStorage) until exported or cleared.
- To clear the session, click "Clear Session".


Update (v2): Confidence rating UI uses 6 labeled buttons (1–6) mapped to 0–100 behind the scenes.
The exported column is 'Confidence mismatch exists (0-100)' with values {0,20,40,60,80,100}.

Update (v5): Export now includes an auto-computed optional column 'Console task time (sec)'.
This value is computed as (Scenario end timestamp - Scenario start timestamp) in seconds
(rounded to 2 decimals), reflecting console task time from Prepare → Record.