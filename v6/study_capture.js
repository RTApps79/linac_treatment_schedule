// study_capture.js
// Lightweight local capture + CSV export for the console emulator.
// Designed for GitHub Pages (no backend). Data are stored in browser localStorage in STUDY mode.
//
// v6 enhancements:
// - app/version stamping
// - STUDY vs DEMO mode (DEMO does not persist to localStorage)
// - audit log + separate audit export
// - "console task time (sec)" computed per scenario (already)

(() => {
  const APP_VERSION = 'v6.0.0';
  const STORAGE_KEY = 'rt_study_capture_v6';

  // Mode: 'study' (persist) or 'demo' (no persistence)
  let _mode = 'study';

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJsonParse(str, fallback) {
    try {
      const v = JSON.parse(str);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function defaultState() {
    return {
      meta: {
        app_version: APP_VERSION,
        mode: _mode,
        created_at: nowIso(),
      },
      participant: null,
      patientContext: null,
      scenarios: [],
      auditLog: [],
    };
  }

  function load() {
    // In DEMO mode we always start clean.
    if (_mode === 'demo') return defaultState();

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();

    const state = safeJsonParse(raw, defaultState());
    // Migrate / stamp
    state.meta = state.meta || {};
    state.meta.app_version = APP_VERSION;
    state.meta.mode = _mode;
    state.scenarios = Array.isArray(state.scenarios) ? state.scenarios : [];
    state.auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
    return state;
  }

  function save(state) {
    state.meta = state.meta || {};
    state.meta.app_version = APP_VERSION;
    state.meta.mode = _mode;

    if (_mode === 'demo') return; // no persistence
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setMode(mode) {
    _mode = (mode === 'demo') ? 'demo' : 'study';
    // Stamp mode into stored state (if any)
    const s = load();
    s.meta.mode = _mode;
    save(s);
  }

  function getMode() {
    return _mode;
  }

  function getVersion() {
    return APP_VERSION;
  }

  function setParticipant(participantObj) {
    const state = load();
    state.participant = participantObj;
    save(state);
    logEvent('participant_set', { participant_id: participantObj?.participantId || '' });
  }

  function setPatientContext(ctx) {
    const state = load();
    state.patientContext = ctx;
    save(state);
    logEvent('patient_context_set', { file: ctx?.fileName || '' });
  }

  function logEvent(eventName, details = {}) {
    const state = load();
    state.auditLog.push({
      ts: nowIso(),
      event: eventName,
      ...details,
      app_version: APP_VERSION,
      mode: _mode,
    });
    save(state);
  }

  function recordScenarioStart(extra = {}) {
    const state = load();
    const scenarioId = extra.scenarioId || `S${state.scenarios.length + 1}`;

    // Create a scenario row if one doesn't exist yet
    let row = state.scenarios.find(r => r.scenarioId === scenarioId);
    if (!row) {
      row = {
        scenarioId,
        startedAt: null,
        endedAt: null,
        consoleTaskTimeSec: null,
        // form fields
        confidenceRating_raw: null,
        confidenceRating_0_100: null,
        discrepanciesReportedCount: null,
        falsePositiveCount: null,
        sart_score: null,
        nasa_tlx_score: null,
        notes: '',
      };
      state.scenarios.push(row);
    }

    row.startedAt = row.startedAt || nowIso();
    save(state);

    logEvent('scenario_start', { scenario_id: scenarioId, ...extra });
    return scenarioId;
  }

  function recordScenarioEnd(extra = {}) {
    const state = load();
    const scenarioId = extra.scenarioId || (state.scenarios[state.scenarios.length - 1]?.scenarioId) || 'S1';

    let row = state.scenarios.find(r => r.scenarioId === scenarioId);
    if (!row) {
      row = { scenarioId };
      state.scenarios.push(row);
    }

    row.endedAt = nowIso();

    // Compute console task time if start is present
    if (row.startedAt) {
      const startMs = Date.parse(row.startedAt);
      const endMs = Date.parse(row.endedAt);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
        row.consoleTaskTimeSec = Math.round((endMs - startMs) / 1000);
      }
    }

    save(state);
    logEvent('scenario_end', { scenario_id: scenarioId, ...extra });
    return scenarioId;
  }

  function updateScenarioRow(scenarioId, updates) {
    const state = load();
    let row = state.scenarios.find(r => r.scenarioId === scenarioId);
    if (!row) {
      row = { scenarioId };
      state.scenarios.push(row);
    }
    Object.assign(row, updates);
    save(state);
    logEvent('scenario_updated', { scenario_id: scenarioId, keys: Object.keys(updates || {}) });
  }

  function clearAll() {
    logEvent('clear_all', {});
    if (_mode === 'demo') {
      // nothing persisted; just clear in-memory via a new default state
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildMainCSV(state) {
    const rows = [];

    // Header rows (meta + participant)
    const meta = state.meta || {};
    rows.push(['app_version', meta.app_version || APP_VERSION]);
    rows.push(['mode', meta.mode || _mode]);
    rows.push(['exported_at', nowIso()]);
    rows.push([]);

    const p = state.participant || {};
    rows.push(['participantId', p.participantId || '']);
    rows.push(['yearsExperience', p.yearsExperience || '']);
    rows.push(['primaryPractice', p.primaryPractice || '']);
    rows.push([]);

    // Scenario table
    const headers = [
      'scenarioId',
      'startedAt',
      'endedAt',
      'consoleTaskTimeSec',
      'confidenceRating_raw',
      'confidenceRating_0_100',
      'discrepanciesReportedCount',
      'falsePositiveCount',
      'sart_score',
      'nasa_tlx_score',
      'notes',
      'patient_file',
      'app_version',
      'mode'
    ];
    rows.push(headers);

    for (const r of (state.scenarios || [])) {
      rows.push(headers.map(h => {
        if (h === 'patient_file') return state.patientContext?.fileName || '';
        if (h === 'app_version') return APP_VERSION;
        if (h === 'mode') return _mode;
        return r?.[h] ?? '';
      }));
    }

    return rows.map(row => row.map(csvEscape).join(',')).join('\n');
  }

  function buildAuditCSV(state) {
    const headers = ['ts', 'event', 'scenario_id', 'stage', 'field', 'detail', 'app_version', 'mode'];
    const rows = [headers];
    for (const e of (state.auditLog || [])) {
      rows.push(headers.map(h => e?.[h] ?? ''));
    }
    return rows.map(row => row.map(csvEscape).join(',')).join('\n');
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  
  function exportCSV({ includeOptional = true, filename } = {}) {
    // includeOptional is reserved for future use; v6 exports always include the full schema.
    logEvent('export_csv', { filename: filename || '' });
    const state = load();
    const csv = buildMainCSV(state);
    if (filename) {
      downloadText(filename, csv);
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `study_capture_${APP_VERSION}_${stamp}`;
    downloadText(`${base}.csv`, csv);
  }

  function exportAuditCSV({ filename } = {}) {
    logEvent('export_audit_csv', { filename: filename || '' });
    const state = load();
    const csv = buildAuditCSV(state);
    if (filename) {
      downloadText(filename, csv);
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `study_audit_${APP_VERSION}_${stamp}`;
    downloadText(`${base}.csv`, csv);
  }

function downloadCSV() {
    const state = load();
    const mainCSV = buildMainCSV(state);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `study_capture_${APP_VERSION}_${stamp}`;
    downloadText(`${base}.csv`, mainCSV);
  }

  function downloadAuditCSV() {
    const state = load();
    const auditCSV = buildAuditCSV(state);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `study_audit_${APP_VERSION}_${stamp}`;
    downloadText(`${base}.csv`, auditCSV);
  }

  // Public API
  window.StudyCapture = {
    // meta
    getVersion,
    setMode,
    getMode,

    // context
    setParticipant,
    setPatientContext,

    // audit
    logEvent,

    // scenarios
    recordScenarioStart,
    recordScenarioEnd,
    updateScenarioRow,

    // export / reset
    exportCSV,
    exportAuditCSV,
    downloadCSV,
    downloadAuditCSV,
    clearAll,

    // internal (for debugging)
    _load: load,
  };
})();
