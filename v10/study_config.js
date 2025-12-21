// study_config.js
// Central place for emulator configuration (version stamping, study/demo mode).
// NOTE: Keep this file simple so it works on GitHub Pages (no build tooling required).
(function () {
  const DEFAULT_MODE = 'study'; // 'study' | 'demo'

  const params = new URLSearchParams(window.location.search);
  const urlMode = (params.get('mode') || '').toLowerCase();
  const storedMode = (localStorage.getItem('rt_mode') || '').toLowerCase();

  const normalizedMode =
    urlMode === 'demo' || urlMode === 'study'
      ? urlMode
      : storedMode === 'demo' || storedMode === 'study'
      ? storedMode
      : DEFAULT_MODE;

  const cfg = {
    version: 'v10.0.0',
    buildDate: '2025-12-21',
    mode: normalizedMode,
    setMode: function (newMode) {
      const m = (newMode || '').toLowerCase();
      if (m !== 'study' && m !== 'demo') return;
      cfg.mode = m;
      localStorage.setItem('rt_mode', m);
      // Soft refresh to apply mode-specific UI gating
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('mode', m);
        window.location.href = u.toString();
      } catch (e) {
        window.location.reload();
      }
    },
  };

  window.StudyConfig = cfg;
  window.APP_VERSION = cfg.version;
})();
