// imaging.js
// Standalone imaging screen (meant for the second monitor)

(function () {
  function getMode() {
    try {
      if (window.StudyConfig && (window.StudyConfig.mode === 'study' || window.StudyConfig.mode === 'demo')) {
        return window.StudyConfig.mode;
      }
    } catch (e) {}
    return 'study';
  }

  function setHeaderPills() {
    const vPill = document.getElementById('emulator-version-pill');
    const mPill = document.getElementById('study-mode-pill');
    if (vPill) {
      const v = window.StudyConfig && window.StudyConfig.version ? window.StudyConfig.version : 'v?';
      const d = window.StudyConfig && window.StudyConfig.buildDate ? window.StudyConfig.buildDate : '';
      vPill.textContent = d ? `Emulator ${v} (${d})` : `Emulator ${v}`;
    }
    if (mPill) {
      const mode = getMode();
      mPill.textContent = mode === 'demo' ? 'Mode: Demo' : 'Mode: Study';
      mPill.classList.toggle('pill-demo', mode === 'demo');
      mPill.classList.toggle('pill-study', mode !== 'demo');
    }
  }

  function getFileParam() {
    const params = new URLSearchParams(window.location.search);
    return params.get('file');
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function setupViewerControls() {
    const overlay = document.getElementById('overlay-image');
    const opacity = document.getElementById('overlay-opacity');
    const xInput = document.getElementById('shift-x');
    const yInput = document.getElementById('shift-y');
    const zInput = document.getElementById('shift-z');
    const pitchInput = document.getElementById('shift-pitch');

    const applyBtn = document.getElementById('apply-shifts');
    const resetBtn = document.getElementById('reset-shifts');

    // Scale factor: 1.0 cm shift -> 18 px on screen (tunable)
    const CM_TO_PX = 18;

    function applyTransform() {
      if (!overlay) return;

      const x = parseFloat(xInput.value || '0') || 0;
      const y = parseFloat(yInput.value || '0') || 0;
      const pitch = parseFloat(pitchInput.value || '0') || 0;

      const tx = x * CM_TO_PX;
      const ty = -y * CM_TO_PX; // invert so +VRT moves up visually

      overlay.style.transform = `translate(${tx}px, ${ty}px) rotate(${pitch}deg)`;
    }

    if (opacity && overlay) {
      opacity.addEventListener('input', () => {
        overlay.style.opacity = opacity.value;
      });
      overlay.style.opacity = opacity.value;
    }

    // Nudge buttons
    document.querySelectorAll('button[data-axis][data-delta]').forEach(btn => {
      btn.addEventListener('click', () => {
        const axis = btn.getAttribute('data-axis');
        const delta = parseFloat(btn.getAttribute('data-delta'));
        if (axis === 'x') {
          xInput.value = (parseFloat(xInput.value || '0') + delta).toFixed(1);
        } else if (axis === 'y') {
          yInput.value = (parseFloat(yInput.value || '0') + delta).toFixed(1);
        } else if (axis === 'z') {
          zInput.value = (parseFloat(zInput.value || '0') + delta).toFixed(1);
        } else if (axis === 'pitch') {
          pitchInput.value = (parseFloat(pitchInput.value || '0') + delta).toFixed(1);
        }
      });
    });

    if (applyBtn) applyBtn.addEventListener('click', applyTransform);
    if (resetBtn) resetBtn.addEventListener('click', () => {
      xInput.value = '0.0';
      yInput.value = '0.0';
      zInput.value = '0.0';
      pitchInput.value = '0.0';
      applyTransform();
    });

    // Apply once at load
    applyTransform();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setHeaderPills();

    const fileName = getFileParam();
    if (!fileName) {
      alert('No patient file specified. Return to schedule and select a scenario.');
      return;
    }

    // Wire open chart button
    const chartBtn = document.getElementById('open-chart-btn');
    if (chartBtn) {
      chartBtn.addEventListener('click', () => {
        const mode = getMode();
        const url = `patient.html?file=${encodeURIComponent(fileName)}&mode=${encodeURIComponent(mode)}`;
        window.open(url, '_blank', 'noopener');
      });
    }

    fetch(`data/${fileName}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load patient data: ${r.status}`);
        return r.json();
      })
      .then(patient => {
        const name = patient.name || 'Unknown';
        const id = patient.id || '—';
        document.title = `Imaging – ${name}`;
        setText('imaging-patient-title', `Image Guided Alignment — ${name} (${id})`);

        const expected = (patient.treatmentPlan && (patient.treatmentPlan.imagingType || patient.treatmentPlan.imaging)) || '—';
        setText('expected-imaging', expected);

        const notes = (patient.treatmentPlan && patient.treatmentPlan.notes) || (patient.imagingData && patient.imagingData.notes) || '—';
        setText('imaging-notes', notes);

        const drr = patient.imagingData && patient.imagingData.drrImage ? patient.imagingData.drrImage : null;
        const kv = patient.imagingData && patient.imagingData.kvImage ? patient.imagingData.kvImage : null;

        const drrEl = document.getElementById('drr-image');
        const kvEl = document.getElementById('overlay-image');

        if (drrEl) drrEl.src = drr ? `images/${drr}` : '';
        if (kvEl) kvEl.src = kv ? `images/${kv}` : '';

        setupViewerControls();
      })
      .catch(err => {
        console.error(err);
        alert('Error loading imaging scenario. Check console for details.');
      });
  });
})();
