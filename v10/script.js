// script.js
// Scenario schedule page
(function () {
  function getMode() {
    try {
      if (window.StudyConfig && (window.StudyConfig.mode === 'study' || window.StudyConfig.mode === 'demo')) {
        return window.StudyConfig.mode;
      }

function normalizeScenarioPath(p) {
  if (!p) return '';
  const s = String(p).trim();
  if (!s) return '';
  // If already a relative/absolute path, keep it
  if (s.includes('/') || s.includes('\\')) return s;
  // Default to /data folder (matches repo structure)
  return `data/${s}`;
}

    } catch (e) {}
    const stored = (localStorage.getItem('rt_mode') || '').toLowerCase();
    return stored === 'demo' ? 'demo' : 'study';
  }

  function setMode(newMode) {
    const m = (newMode || '').toLowerCase();
    if (m !== 'study' && m !== 'demo') return;
    if (window.StudyConfig && typeof window.StudyConfig.setMode === 'function') {
      window.StudyConfig.setMode(m);
      return;
    }
    localStorage.setItem('rt_mode', m);
    // refresh with mode param
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('mode', m);
      window.location.href = u.toString();
    } catch (e) {
      window.location.reload();
    }
  }

  function parseCSV(text) {
    // Minimal CSV parser with support for quoted fields
    const rows = [];
    let row = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          row.push(cur.trim());
          cur = '';
        } else if (ch === '\n') {
          row.push(cur.trim());
          rows.push(row);
          row = [];
          cur = '';
        } else if (ch === '\r') {
          // ignore
        } else {
          cur += ch;
        }
      }
    }
    if (cur.length || row.length) {
      row.push(cur.trim());
      rows.push(row);
    }
    return rows;
  }

  function qs(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function buildActionButton(label, href, extraClass) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'action-button ' + (extraClass || '');
    return a;
  }

  function buildOpenBothButton(chartUrl, imagingUrl) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Open Both';
    btn.className = 'action-button';
    btn.addEventListener('click', () => {
      window.open(chartUrl, '_blank', 'noopener');
      window.open(imagingUrl, '_blank', 'noopener');
    });
    return btn;
  }

  function renderSchedule(scenarios) {
    const body = document.getElementById('schedule-body');
    if (!body) return;
    body.innerHTML = '';

    const mode = getMode();
    const admin = (qs('admin') || '').toLowerCase() === '1';

    scenarios.forEach(s => {
      const row = document.createElement('div');
      row.className = 'table-row';

      const scenarioLabel = s.ScenarioID || s.Scenario || s.scenario || '—';
      const site = s.TreatmentSite || s['Treatment Site'] || '—';
      const technique = s.Technique || '—';
      const imaging = s.Imaging_PaperCorrect || s.Imaging || '—';
      const fileNameRaw = s.ComputerJSON || s.File || s.file || '';
      const fileName = normalizeScenarioPath(fileNameRaw);

      const chartUrl = `patient.html?file=${encodeURIComponent(fileName)}&mode=${encodeURIComponent(mode)}`;
      const imagingUrl = `imaging.html?file=${encodeURIComponent(fileName)}&mode=${encodeURIComponent(mode)}`;

      row.innerHTML = `
        <div class="row-item">${scenarioLabel}</div>
        <div class="row-item">${site}</div>
        <div class="row-item">${technique}</div>
        <div class="row-item">${imaging}</div>
        <div class="row-item actions-cell"></div>
      `;

      const actionsCell = row.querySelector('.actions-cell');
      const actionWrap = document.createElement('div');
      actionWrap.className = 'action-group';

      if (fileName) {
        actionWrap.appendChild(buildActionButton('Chart', chartUrl));
        actionWrap.appendChild(buildActionButton('Imaging', imagingUrl));
        actionWrap.appendChild(buildOpenBothButton(chartUrl, imagingUrl));

        if (admin && s.PaperChartPDF) {
          const paperUrl = `paper_charts/${encodeURIComponent(s.PaperChartPDF)}`;
          actionWrap.appendChild(buildActionButton('Paper', paperUrl, 'paper-btn'));
        }
      } else {
        const span = document.createElement('span');
        span.textContent = 'Missing file';
        actionWrap.appendChild(span);
      }

      actionsCell.appendChild(actionWrap);
      body.appendChild(row);
    });
  }


  function wireSearch(scenarios) {
    const input = document.getElementById('search-input');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = (input.value || '').trim().toLowerCase();
      if (!q) {
        renderSchedule(scenarios);
        wireSearch(scenarios);
        return;
      }
      const filtered = scenarios.filter(s => {
        const vals = [
          s.ScenarioID, s.Scenario, s.scenario,
          s.TreatmentSite, s['Treatment Site'],
          s.Technique,
          s.Imaging_PaperCorrect, s.Imaging,
          s.ComputerJSON
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return vals.includes(q);
      });
      renderSchedule(filtered);
    });
  }

  function fallbackScenarios() {
    // Minimal fallback list if CSV is missing
    return [
      { ScenarioID: 'A0', TreatmentSite: 'Femur (Palliation)', Technique: 'STATIC', Imaging_PaperCorrect: 'kV-kV', ComputerJSON: 'A0_computer_withErrors.json' },
      { ScenarioID: 'A1', TreatmentSite: 'Left Breast', Technique: '3DCRT', Imaging_PaperCorrect: 'kV-kV', ComputerJSON: 'A1_computer_withErrors.json' },
      { ScenarioID: 'A2', TreatmentSite: 'Pelvis/Prostate', Technique: 'VMAT', Imaging_PaperCorrect: 'CBCT', ComputerJSON: 'A2_computer_withErrors.json' },
      { ScenarioID: 'B0', TreatmentSite: 'Skeletal Spine', Technique: 'STATIC', Imaging_PaperCorrect: 'kV-kV', ComputerJSON: 'B0_computer_withErrors.json' },
      { ScenarioID: 'B1', TreatmentSite: 'Left Breast', Technique: '3DCRT', Imaging_PaperCorrect: 'kV-kV', ComputerJSON: 'B1_computer_withErrors.json' },
      { ScenarioID: 'B2', TreatmentSite: 'Pelvis/Prostate', Technique: 'VMAT', Imaging_PaperCorrect: 'CBCT', ComputerJSON: 'B2_computer_withErrors.json' }
    ];
  }

  function wireModeButtons() {
    const studyBtn = document.getElementById('mode-study');
    const demoBtn = document.getElementById('mode-demo');
    const current = document.getElementById('mode-current');

    const mode = getMode();
    if (current) current.textContent = mode === 'demo' ? '(Demo)' : '(Study)';

    if (studyBtn) {
      studyBtn.addEventListener('click', () => setMode('study'));
    }
    if (demoBtn) {
      demoBtn.addEventListener('click', () => setMode('demo'));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireModeButtons();

    fetch('Scenario_Manifest_v2.csv', { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('Missing manifest CSV');
        return r.text();
      })
      .then(csv => {
        const rows = parseCSV(csv);
        if (rows.length < 2) throw new Error('Manifest CSV appears empty');

        const header = rows[0];
        const items = rows.slice(1).filter(r => r.length && r.some(v => v && v.trim().length));

        const scenarios = items.map(r => {
          const obj = {};
          header.forEach((h, idx) => {
            obj[h] = r[idx] || '';
          });
          return obj;
        });

        renderSchedule(scenarios);
        wireSearch(scenarios);
      })
      .catch(err => {
        console.warn('Falling back to built-in scenario list:', err);
        const fallback = fallbackScenarios();
        renderSchedule(fallback);
        wireSearch(fallback);
      });
  });
})();
