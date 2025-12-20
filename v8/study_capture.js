/* study_capture.js
   Lightweight, dependency-free study data capture + CSV export.
   Designed to match your Excel template columns (37) and optionally include extra linking fields.
*/
(function () {
  'use strict';

  // Exact column names from "Data Collection Template" sheet
  const TEMPLATE_COLUMNS = [
    "Subject ID",
    "Years of Experience",
    "Employment Status",
    "Education Level",
    "Has used an incident reporting system before",
    "Sex (F, M, NB, Prefer not to say)",
    "Configuration",
    "Scenario ID",
    "# Errors Present",
    "# of Errors Detected",
    "Errors Detected Correctly (1= Yes , 0=No)",
    "What is the patient’s name?  (1 = Correct, 0 = Incorrect)",
    "What is the patient’s date of birth?  (1 = Correct, 0 = Incorrect)",
    "What is the treatment site or target anatomy? (1 = Correct, 0 = Incorrect)",
    "Are there any special considerations for this patient (e.g., pacemakers, physician notes)? (1 = Correct, 0 = Incorrect)",
    "Is any bolus material required for this treatment?  (1 = Correct, 0 = Incorrect)",
    "What fraction number is being delivered today?  (1 = Correct, 0 = Incorrect)",
    "What is the current treatment field being delivered? (1 = Correct, 0 = Incorrect)",
    "What is the gantry angle?  (1 = Correct, 0 = Incorrect)",
    "How unstable did the situation feel? Rating (1-7)",
    "How much variability occurred in tasks? Rating (1-7)",
    "How complex was the situation overall? Rating (1-7)",
    "How alert and engaged were you? Rating (1-7)",
    "How much spare mental capacity did you feel you had? Rating (1-7)",
    "How well were you able to focus? Rating (1-7)",
    "How effectively did you divide your attention? Rating (1-7)",
    "How clear and high-quality was the information? Rating (1-7)",
    "How adequate and comprehensive was the quantity of information? Rating (1-7)",
    "How familiar were you with the tasks presented? Rating (1-7)",
    "NASA-TLX Mental Demand",
    "NASA-TLX Physical Demand",
    "NASA-TLX Temporal Demand",
    "NASA-TLX Performance",
    "NASA-TLX Effort",
    "Eye Tracking Metrics: Fixation duration",
    "Eye Tracking Metrics: Saccade frequency",
    "Eye Tracking Metrics: Gaze patterns"
  ];

  // Optional columns (not in your current template) — helpful for ROC + file linking.
  const OPTIONAL_COLUMNS = [
    'Emulator Version',
    'Emulator Build Date',
    'Mode',
    "Study Entry ID",
    "GazeRecorder export file name",
    "Confidence mismatch exists (0-100)",
    "Scenario start timestamp",
    "Scenario end timestamp",
    "Console task time (sec)"
  ];

  const STORAGE_KEY = "rt_study_session_v1";
  const AUDIT_KEY = "rt_study_audit_log_v1";


  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { participant: {}, scenarios: [] };
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return { participant: {}, scenarios: [] };
      obj.participant = obj.participant || {};
      obj.scenarios = Array.isArray(obj.scenarios) ? obj.scenarios : [];
      return obj;
    } catch (e) {
      console.warn("Could not load session; starting new.", e);
      return { participant: {}, scenarios: [] };
    }
  }

  function saveSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  
  function loadAudit() {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveAudit(events) {
    try {
      localStorage.setItem(AUDIT_KEY, JSON.stringify(events || []));
    } catch (e) {}
  }

  function __rtLogAuditEvent(eventName, details) {
    const entry = {
      ts_iso: new Date().toISOString(),
      event: eventName || "event",
      mode: (() => { try { return (window.StudyConfig && window.StudyConfig.mode) || ""; } catch(e){ return ""; } })(),
      emulator_version: (() => { try { return (window.StudyConfig && window.StudyConfig.version) || ""; } catch(e){ return ""; } })(),
      emulator_build_date: (() => { try { return (window.StudyConfig && window.StudyConfig.buildDate) || ""; } catch(e){ return ""; } })(),
      details: details || {}
    };

    const events = loadAudit();
    events.push(entry);
    saveAudit(events);
  }

  function __rtExportAuditCSV({ filename = "rt_audit_log.csv" } = {}) {
    const events = loadAudit();
    const header = ["Timestamp ISO", "Event", "Mode", "Emulator Version", "Emulator Build Date", "Details (JSON)"];

    const rows = events.map(e => ({
      "Timestamp ISO": e.ts_iso,
      "Event": e.event,
      "Mode": e.mode,
      "Emulator Version": e.emulator_version,
      "Emulator Build Date": e.emulator_build_date,
      "Details (JSON)": JSON.stringify(e.details || {})
    }));

    const csv = toCSV(rows, header);
    downloadText(filename, csv);
  }

function csvEscape(value) {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    // Wrap if contains comma, quote, or newline
    if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
    return escaped;
  }

  function toCSV(rows, header) {
    const out = [];
    out.push(header.map(csvEscape).join(","));
    for (const row of rows) {
      out.push(header.map((h) => csvEscape(row[h])).join(","));
    }
    return out.join("\n");
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Compute console task time (Prepare → Record) in seconds.
  // Returns a number rounded to 2 decimal places, or '' if timestamps are missing/invalid.
  function computeTaskTimeSeconds(startISO, endISO) {
    const startMs = Date.parse(startISO);
    const endMs = Date.parse(endISO);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '';
    const sec = (endMs - startMs) / 1000;
    if (!Number.isFinite(sec)) return '';
    // Guard against negative durations (e.g., clock/time entry issues)
    const clamped = Math.max(0, sec);
    return Math.round(clamped * 100) / 100;
  }

  function mergeRow(participant, scenario) {
    // Participant fields (cols 1–6)
    const row = {};
    row["Subject ID"] = participant.subjectId || "";
    row["Years of Experience"] = participant.yearsExperience || "";
    row["Employment Status"] = participant.employmentStatus || "";
    row["Education Level"] = participant.educationLevel || "";
    row["Has used an incident reporting system before"] = participant.usedIncidentReporting || "";
    row["Sex (F, M, NB, Prefer not to say)"] = participant.sex || "";

    // Scenario fields (cols 7–37)
    row["Configuration"] = scenario.configuration || "";
    row["Scenario ID"] = scenario.scenarioId || "";
    row["# Errors Present"] = scenario.errorsPresent ?? "";
    row["# of Errors Detected"] = scenario.errorsDetected ?? "";
    row["Errors Detected Correctly (1= Yes , 0=No)"] = scenario.detectedCorrectly ?? "";

    // SA (12–19)
    row["What is the patient’s name?  (1 = Correct, 0 = Incorrect)"] = scenario.sa_name ?? "";
    row["What is the patient’s date of birth?  (1 = Correct, 0 = Incorrect)"] = scenario.sa_dob ?? "";
    row["What is the treatment site or target anatomy? (1 = Correct, 0 = Incorrect)"] = scenario.sa_site ?? "";
    row["Are there any special considerations for this patient (e.g., pacemakers, physician notes)? (1 = Correct, 0 = Incorrect)"] = scenario.sa_special ?? "";
    row["Is any bolus material required for this treatment?  (1 = Correct, 0 = Incorrect)"] = scenario.sa_bolus ?? "";
    row["What fraction number is being delivered today?  (1 = Correct, 0 = Incorrect)"] = scenario.sa_fraction ?? "";
    row["What is the current treatment field being delivered? (1 = Correct, 0 = Incorrect)"] = scenario.sa_field ?? "";
    row["What is the gantry angle?  (1 = Correct, 0 = Incorrect)"] = scenario.sa_gantry ?? "";

    // Ratings (20–29)
    row["How unstable did the situation feel? Rating (1-7)"] = scenario.r_unstable ?? "";
    row["How much variability occurred in tasks? Rating (1-7)"] = scenario.r_variability ?? "";
    row["How complex was the situation overall? Rating (1-7)"] = scenario.r_complexity ?? "";
    row["How alert and engaged were you? Rating (1-7)"] = scenario.r_alert ?? "";
    row["How much spare mental capacity did you feel you had? Rating (1-7)"] = scenario.r_spare ?? "";
    row["How well were you able to focus? Rating (1-7)"] = scenario.r_focus ?? "";
    row["How effectively did you divide your attention? Rating (1-7)"] = scenario.r_divide ?? "";
    row["How clear and high-quality was the information? Rating (1-7)"] = scenario.r_clarity ?? "";
    row["How adequate and comprehensive was the quantity of information? Rating (1-7)"] = scenario.r_quantity ?? "";
    row["How familiar were you with the tasks presented? Rating (1-7)"] = scenario.r_familiar ?? "";

    // NASA TLX (30–34)
    row["NASA-TLX Mental Demand"] = scenario.tlx_mental ?? "";
    row["NASA-TLX Physical Demand"] = scenario.tlx_physical ?? "";
    row["NASA-TLX Temporal Demand"] = scenario.tlx_temporal ?? "";
    row["NASA-TLX Performance"] = scenario.tlx_performance ?? "";
    row["NASA-TLX Effort"] = scenario.tlx_effort ?? "";

    // Eye metrics (35–37)
    row["Eye Tracking Metrics: Fixation duration"] = scenario.eye_fixation ?? "";
    row["Eye Tracking Metrics: Saccade frequency"] = scenario.eye_saccade ?? "";
    row["Eye Tracking Metrics: Gaze patterns"] = scenario.eye_gaze ?? "";

    // Optional
    row["Study Entry ID"] = scenario.studyEntryId || "";
    row["GazeRecorder export file name"] = scenario.gazeFile || "";
    row["Confidence mismatch exists (0-100)"] = scenario.confidence ?? "";
    row["Scenario start timestamp"] = scenario.startedAt || "";
    row["Scenario end timestamp"] = scenario.endedAt || "";
    row["Console task time (sec)"] = computeTaskTimeSeconds(scenario.startedAt, scenario.endedAt);

    // Version stamping (helps trace exactly what build created the data export)
    try {
      const cfg = window.StudyConfig || {};
      row["Emulator Version"] = cfg.version || "";
      row["Emulator Build Date"] = cfg.buildDate || "";
      row["Mode"] = cfg.mode || "";
    } catch (e) {
      row["Emulator Version"] = "";
      row["Emulator Build Date"] = "";
      row["Mode"] = "";
    }

    return row;
  }

  // Public API
  const StudyCapture = {
    TEMPLATE_COLUMNS,
    OPTIONAL_COLUMNS,
    loadSession,
    saveParticipant(participantObj) {
      const session = loadSession();
      session.participant = participantObj || {};
      saveSession(session);
      return session;
    },
    addScenario(scenarioObj) {
      const session = loadSession();
      session.scenarios.push(scenarioObj || {});
      saveSession(session);
      return session;
    },
    clearAll() {
      localStorage.removeItem(STORAGE_KEY);
      __rtLogAuditEvent("clear_all", {});
    },
    logEvent(eventName, details) { __rtLogAuditEvent(eventName, details); },
    exportAuditCSV({ filename = "rt_audit_log.csv" } = {}) { __rtExportAuditCSV({ filename }); },

    exportCSV({ includeOptional = false, filename = "rt_study_export.csv" } = {}) {
      const session = loadSession();
      const header = includeOptional ? TEMPLATE_COLUMNS.concat(OPTIONAL_COLUMNS) : TEMPLATE_COLUMNS;
      const rows = session.scenarios.map((scn) => mergeRow(session.participant, scn));
      const csv = toCSV(rows, header);
      __rtLogAuditEvent("export_csv", { rows: rows.length, includeOptional });
      downloadText(filename, csv);
    }
  };

  // Attach globally
  window.StudyCapture = StudyCapture;
})();