/*
  Imaging Screen (2nd monitor)
  - Shows planning reference (DRR) and on-board imaging overlay
  - Allows couch shifts (VRT/LAT/LNG/PITCH)
  - Updates shared state with chart screen via localStorage + BroadcastChannel
*/

(() => {
  "use strict";

  const VERSION = "v6.1.0";
  const BUILD_DATE = "2025-12-19";

  function getQuery() {
    const p = new URLSearchParams(window.location.search);
    return {
      file: p.get("file") || "",
      cfg: p.get("cfg") || "",
    };
  }

  function deriveScenarioId(file) {
    const m = (file || "").match(/([A-Z]\d+)/);
    return m ? m[1] : "Scenario";
  }

  function stateKeyFor(scenarioId) {
    return `linac_state_${scenarioId}`;
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn("Unable to write localStorage", e);
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function numOr0(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function $(id) {
    return document.getElementById(id);
  }

  // Convert cm shifts to pixels for overlay transform.
  // Keep modest so users can see movement but not exaggerate.
  const PX_PER_CM = 18;

  class ImagingScreen {
    constructor({ file, cfg }) {
      this.file = file;
      this.cfg = cfg;
      this.scenarioId = deriveScenarioId(file);
      this.storageKey = stateKeyFor(this.scenarioId);
      this.bc = ("BroadcastChannel" in window) ? new BroadcastChannel("linac_sim") : null;

      this.shift = { vrt: 0, lat: 0, lng: 0, pitch: 0 };

      // Deterministic initial misalignment to mimic DRR ↔ kV overlay offsets
      this.jitter = this.computeJitter(this.scenarioId);

      this.bindUI();
      this.loadScenario();
      this.hydrateFromSharedState();
      this.setupListeners();

      this.setHeader();
    }

    setHeader() {
      const title = $("imaging-patient-title");
      if (title) title.textContent = `Image Guided Alignment — ${this.scenarioId}`;

      const ver = $("emulator-version-pill");
      if (ver) ver.textContent = `Emulator ${VERSION} (${BUILD_DATE})`;

      const mode = $("study-mode-pill");
      if (mode) mode.textContent = "Mode: Study";
    }

    computeJitter(seedStr) {
      // Deterministic pseudo-random generator so each scenario has a stable
      // initial overlay misalignment (important for reproducibility).
      const s = String(seedStr || '');
      let h = 2166136261; // FNV-1a
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      let x = (h >>> 0) || 123456789;
      const next01 = () => {
        // LCG
        x = (Math.imul(1664525, x) + 1013904223) >>> 0;
        return x / 4294967296;
      };
      const range = (min, max) => min + (max - min) * next01();

      return {
        x: Math.round(range(-40, 40)),
        y: Math.round(range(-30, 30)),
        rot: range(-1.2, 1.2),
        scale: range(0.99, 1.01),
      };
    }

    bindUI() {
      const openChart = $("open-chart-btn");
      if (openChart) {
        openChart.addEventListener("click", () => {
          const url = new URL("patient.html", window.location.href);
          url.searchParams.set("file", this.file);
          if (this.cfg) url.searchParams.set("cfg", this.cfg);
          window.open(url.toString(), "_blank", "noopener");
        });
      }

      // Opacity slider: controls overlay opacity
      const slider = $("overlay-opacity");
      if (slider) {
        slider.addEventListener("input", () => {
          // Slider is 0–100, opacity is 0–1
          const v = clamp(Number(slider.value) / 100, 0, 1);
          const overlay = $("overlay-image");
          if (overlay) overlay.style.opacity = String(v);
        });
      }

      // Increment buttons
      document.querySelectorAll(".control-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const axis = btn.getAttribute("data-axis") || "";
          const delta = numOr0(btn.getAttribute("data-delta"));
          this.nudgeAxis(axis, delta);
        });
      });

      const reset = $("reset-shifts");
      if (reset) reset.addEventListener("click", () => this.resetShifts());

      const apply = $("apply-shifts");
      if (apply) apply.addEventListener("click", () => this.applyShifts());
    }

    nudgeAxis(axis, delta) {
      const map = {
        x: { key: "lat", input: "shift-x" },
        y: { key: "vrt", input: "shift-y" },
        z: { key: "lng", input: "shift-z" },
        pitch: { key: "pitch", input: "shift-pitch" },
      };
      const spec = map[axis];
      if (!spec) return;
      const input = $(spec.input);
      if (!input) return;
      const next = numOr0(input.value) + delta;
      input.value = next.toFixed(1);
      this.syncShiftFromInputs();
      this.renderOverlayTransform();
    }

    syncShiftFromInputs() {
      this.shift.lat = numOr0($("shift-x")?.value);
      this.shift.vrt = numOr0($("shift-y")?.value);
      this.shift.lng = numOr0($("shift-z")?.value);
      this.shift.pitch = numOr0($("shift-pitch")?.value);
    }

    resetShifts() {
      ["shift-x", "shift-y", "shift-z", "shift-pitch"].forEach((id) => {
        const el = $(id);
        if (el) el.value = "0.0";
      });
      this.syncShiftFromInputs();
      this.renderOverlayTransform();
      this.updateSharedState(false);
    }

    applyShifts() {
      this.syncShiftFromInputs();
      this.renderOverlayTransform();
      this.updateSharedState(true);
    }

    renderOverlayTransform() {
      const overlay = $("overlay-image");
      if (!overlay) return;

      const j = this.jitter || { x: 0, y: 0, rot: 0, scale: 1 };

      // Map couch shifts into pixel translation. Note: this is a simple 2D mimic.
      // LAT shifts → X, VRT + LNG contribute to Y (stacked) for a visible effect.
      const x = (numOr0(this.shift.lat) * PX_PER_CM) + j.x;
      const y = (numOr0(this.shift.vrt) * PX_PER_CM) + (numOr0(this.shift.lng) * PX_PER_CM * 0.6) + j.y;
      const pitchDeg = numOr0(this.shift.pitch) + j.rot;
      const sc = j.scale || 1;

      overlay.style.transform = `translate(${x}px, ${y}px) rotate(${pitchDeg}deg) scale(${sc})`;
    }

    hydrateFromSharedState() {
      const st = readJSON(this.storageKey, null);
      if (!st || !st.couchShift) return;

      // pull current shift values
      const cs = st.couchShift;
      this.shift.vrt = numOr0(cs.vrt);
      this.shift.lat = numOr0(cs.lat);
      this.shift.lng = numOr0(cs.lng);
      this.shift.pitch = numOr0(cs.pitch);

      // populate inputs
      const set = (id, v) => {
        const el = $(id);
        if (el) el.value = Number(v).toFixed(1);
      };
      set("shift-y", this.shift.vrt);
      set("shift-x", this.shift.lat);
      set("shift-z", this.shift.lng);
      set("shift-pitch", this.shift.pitch);

      this.renderOverlayTransform();
    }

    updateSharedState(applied) {
      const st = readJSON(this.storageKey, {
        scenarioId: this.scenarioId,
        couchShift: { vrt: 0, lat: 0, lng: 0, pitch: 0 },
        appliedAt: null,
      });
      st.couchShift = {
        vrt: this.shift.vrt,
        lat: this.shift.lat,
        lng: this.shift.lng,
        pitch: this.shift.pitch,
      };
      st.appliedAt = applied ? new Date().toISOString() : st.appliedAt;

      writeJSON(this.storageKey, st);

      if (this.bc) {
        this.bc.postMessage({
          type: "STATE_UPDATE",
          scenarioId: this.scenarioId,
          couchShift: st.couchShift,
          appliedAt: st.appliedAt,
        });
      }
    }

    setupListeners() {
      // Listen to updates from the chart screen, in case it resets etc.
      window.addEventListener("storage", (ev) => {
        if (ev.key === this.storageKey) {
          this.hydrateFromSharedState();
        }
      });
      if (this.bc) {
        this.bc.addEventListener("message", (ev) => {
          const msg = ev.data;
          if (!msg || msg.type !== "STATE_UPDATE") return;
          if (msg.scenarioId !== this.scenarioId) return;
          this.hydrateFromSharedState();
        });
      }
    }

    async loadScenario() {
      try {
        const res = await fetch(this.file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Expected imaging
        const expected = data?.treatmentPlan?.imagingType || "—";
        const notes = data?.imagingNotes || data?.treatmentPlan?.imagingNotes || "—";

        const expEl = $("expected-imaging");
        if (expEl) expEl.textContent = expected;
        const notesEl = $("imaging-notes");
        if (notesEl) notesEl.textContent = notes;

        // Images
        // Prefer drrImage + kvImage (or cbctImage) from imagingData
        const imagingData = data?.imagingData || {};
        const drrPath = imagingData.drrImage || imagingData.referenceImage || "";
        const overlayPath = imagingData.kvImage || imagingData.cbctImage || imagingData.overlayImage || "";

        const drrEl = $("drr-image");
        if (drrEl && drrPath) drrEl.src = drrPath;
        const overlayEl = $("overlay-image");
        if (overlayEl && overlayPath) overlayEl.src = overlayPath;

        // Default opacity (slider is 0–100; CSS opacity is 0–1)
        const slider = $("overlay-opacity");
        if (overlayEl && slider) {
          const v = Number(slider.value);
          overlayEl.style.opacity = Number.isFinite(v) ? String(v / 100) : "0.5";
        }

      } catch (e) {
        console.error("Unable to load scenario JSON", e);
        const title = $("imaging-patient-title");
        if (title) title.textContent = `Imaging — Error Loading ${this.scenarioId}`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const q = getQuery();
    if (!q.file) {
      console.warn("No file parameter provided to imaging.html");
    }
    new ImagingScreen(q);
  });

})();
