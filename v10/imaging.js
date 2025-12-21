/**
 * imaging.js — IGRT alignment screen (DRR + kV overlay)
 *
 * v10 updates:
 * - Uses the SAME shared state mechanism as patient.js (localStorage + BroadcastChannel)
 * - kV starts overlaid on DRR with a deterministic "misalignment" (seeded by scenarioId)
 * - Arrow buttons + numeric inputs move the overlay in real-time
 * - Apply Shifts commits couchShifts to shared state so the chart/console updates Geometry → Actual
 */

(() => {
  "use strict";

  const PX_PER_CM = 18;         // visual scale: 1 cm ≈ 18 px
  const PITCH_DEG_PER_INPUT = 1; // 1° input => 1° overlay rotation (visual only)
  const VRT_SCALE_PER_CM = 0.006; // 1 cm VRT => ~0.6% scale (visual "magnification")

  // ---------- Shared utilities ----------
  function getQuery() {
    const params = new URLSearchParams(window.location.search);
    const o = {};
    for (const [k, v] of params.entries()) o[k] = v;
    return o;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function numOr0(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function deriveScenarioId(fileParam) {
    const base = String(fileParam || "").split(/[\/]/).pop();
    return base.replace(/\.json$/i, "") || "unknown";
  }

  // Deterministic hash (32-bit)
  function stableHash(str) {
    let h = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---------- Shared state (must match patient.js) ----------
  class SharedState {
    constructor(scenarioId) {
      this.key = `linac-study:${scenarioId}`;
      this.bc = null;
      this.listeners = new Set();

      if ("BroadcastChannel" in window) {
        try {
          this.bc = new BroadcastChannel("linac-study");
          this.bc.addEventListener("message", (ev) => {
            if (ev?.data?.type === "state") this._emit();
          });
        } catch (e) {
          this.bc = null;
        }
      }

      window.addEventListener("storage", (e) => {
        if (e.key === this.key) this._emit();
      });
    }

    get() {
      try {
        const raw = localStorage.getItem(this.key);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return (obj && typeof obj === "object") ? obj : {};
      } catch {
        return {};
      }
    }

    set(patch, opts = { merge: true }) {
      const cur = this.get();
      const next = (opts?.merge === false) ? (patch || {}) : { ...cur, ...(patch || {}) };
      try {
        localStorage.setItem(this.key, JSON.stringify(next));
      } catch (e) {
        console.warn("Failed to write shared state", e);
      }
      if (this.bc) {
        try { this.bc.postMessage({ type: "state" }); } catch {}
      }
      this._emit(next);
    }

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    _emit(forced) {
      const st = forced || this.get();
      for (const fn of this.listeners) {
        try { fn(st); } catch (e) { console.error(e); }
      }
    }
  }

  // ---------- Imaging screen ----------
  class ImagingScreen {
    constructor(q) {
      this.file = q.file || "";
      this.mode = q.mode || "study";
      this.scenarioId = deriveScenarioId(this.file);

      this.shared = new SharedState(this.scenarioId);

      // Alignment values (cm / degrees)
      this.shift = { VRT: 0, LAT: 0, LNG: 0, PITCH: 0 };

      // Base misalignment (px / degrees) — deterministic per scenario
      this.base = this._seedBaseMisalignment(this.scenarioId);

      this._wireUI();
      this._wireSharedState();
      this._loadScenario();
    }

    _seedBaseMisalignment(id) {
      const hx = stableHash(id + ":x");
      const hy = stableHash(id + ":y");
      const hr = stableHash(id + ":r");
      const hs = stableHash(id + ":s");

      // +-20 px translation, +-1.2° rotation, +-1.2% scale
      const x = ((hx % 41) - 20);
      const y = ((hy % 41) - 20);
      const rot = (((hr % 13) - 6) * 0.2);
      const scale = 1 + ((((hs % 25) - 12) / 1000)); // ~0.988..1.012

      return { x, y, rot, scale };
    }

    _wireSharedState() {
      this.shared.onChange((st) => {
        // Keep screen inputs aligned to last applied couch shifts (if any)
        const cs = st?.couchShifts || null;
        if (!cs) return;
        this.shift = {
          VRT: numOr0(cs.VRT),
          LAT: numOr0(cs.LAT),
          LNG: numOr0(cs.LNG),
          PITCH: numOr0(cs.PITCH),
        };
        this._syncInputs();
        this._renderOverlayTransform();
        this._setStatusLine(`Shifts applied: VRT=${this.shift.VRT.toFixed(1)}, LAT=${this.shift.LAT.toFixed(1)}, LNG=${this.shift.LNG.toFixed(1)}, PITCH=${this.shift.PITCH.toFixed(1)}°`);
      });

      // Hydrate initial
      const init = this.shared.get();
      if (init?.couchShifts) {
        const cs = init.couchShifts;
        this.shift = { VRT: numOr0(cs.VRT), LAT: numOr0(cs.LAT), LNG: numOr0(cs.LNG), PITCH: numOr0(cs.PITCH) };
      }
      this._syncInputs();
    }

    _wireUI() {
      // Header labels
      const title = $("imagingTitle");
      const scenarioLabel = $("scenarioLabel");
      if (scenarioLabel) scenarioLabel.textContent = this.scenarioId;
      const ver = $("imagingMeta");
      if (ver) ver.textContent = `Emulator ${window?.APP_VERSION || "v10"} | Mode: ${this.mode}`;

      // Opacity slider
      const slider = $("overlayOpacity");
      const overlayEl = $("overlayImage");
      if (slider && overlayEl) {
        slider.addEventListener("input", () => {
          const v = Number(slider.value);
          overlayEl.style.opacity = Number.isFinite(v) ? String(v / 100) : "0.5";
        });
      }

      // Nudge buttons
      document.querySelectorAll(".nudge").forEach((btn) => {
        btn.addEventListener("click", () => {
          const axis = btn.getAttribute("data-axis");
          const delta = Number(btn.getAttribute("data-delta"));
          if (!axis || !Number.isFinite(delta)) return;

          if (axis === "VRT") this.shift.VRT = +(this.shift.VRT + delta).toFixed(1);
          if (axis === "LAT") this.shift.LAT = +(this.shift.LAT + delta).toFixed(1);
          if (axis === "LNG") this.shift.LNG = +(this.shift.LNG + delta).toFixed(1);
          if (axis === "PITCH") this.shift.PITCH = +(this.shift.PITCH + delta).toFixed(1);

          this._syncInputs();
          this._renderOverlayTransform();
        });
      });

      // Numeric inputs
      const bindInput = (id, key) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("input", () => {
          this.shift[key] = numOr0(el.value);
          this._renderOverlayTransform();
        });
      };
      bindInput("vrtValue", "VRT");
      bindInput("latValue", "LAT");
      bindInput("lngValue", "LNG");
      bindInput("pitchValue", "PITCH");

      // Reset
      const resetBtn = $("btnReset");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          this.shift = { VRT: 0, LAT: 0, LNG: 0, PITCH: 0 };
          this._syncInputs();
          this._renderOverlayTransform();
          this._setStatusLine("Reset shifts (not applied).");
        });
      }

      // Apply shifts (commit to chart/console)
      const applyBtn = $("btnApply");
      if (applyBtn) {
        applyBtn.addEventListener("click", () => {
          this.shared.set({
            couchShifts: { ...this.shift },
            couchShiftsAppliedAt: new Date().toISOString(),
          });
          this._setStatusLine(`Shifts applied: VRT=${this.shift.VRT.toFixed(1)}, LAT=${this.shift.LAT.toFixed(1)}, LNG=${this.shift.LNG.toFixed(1)}, PITCH=${this.shift.PITCH.toFixed(1)}°`);
        });
      }

      // Initial render
      this._renderOverlayTransform();
    }

    _syncInputs() {
      const set = (id, v) => { const el = $(id); if (el) el.value = Number(v).toFixed(1); };
      set("vrtValue", this.shift.VRT);
      set("latValue", this.shift.LAT);
      set("lngValue", this.shift.LNG);
      set("pitchValue", this.shift.PITCH);
    }

    _setStatusLine(txt) {
      const el = $("shiftStatus");
      if (el) el.textContent = txt;
    }

    _renderOverlayTransform() {
      const overlayEl = $("overlayImage");
      if (!overlayEl) return;

      // Base misalignment + user couch shifts
      const x = this.base.x + (this.shift.LAT * PX_PER_CM);
      const y = this.base.y + (this.shift.LNG * PX_PER_CM);

      // Pitch: small rotation cue (visual)
      const rot = this.base.rot + (this.shift.PITCH * PITCH_DEG_PER_INPUT);

      // VRT: simulate "magnification" change with a tiny scale factor
      const scale = this.base.scale * (1 + (this.shift.VRT * VRT_SCALE_PER_CM));

      overlayEl.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`;
    }

    async _loadScenario() {
      if (!this.file) return;

      try {
        const res = await fetch(this.file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Expected imaging + notes
        const expected = data?.treatmentPlan?.imagingType || data?.treatmentPlan?.imaging || "—";
        const notes = data?.treatmentPlan?.imagingNotes || data?.imagingNotes || "—";
        const expEl = $("expectedImaging");
        if (expEl) expEl.textContent = expected;
        const notesEl = $("expectedNotes");
        if (notesEl) notesEl.textContent = notes;

        // Images
        const imagingData = data?.imagingData || {};
        const drrPath = imagingData.drrImage || imagingData.referenceImage || "";
        const overlayPath = imagingData.kvImage || imagingData.cbctImage || imagingData.overlayImage || "";

        const drrEl = $("drrImage");
        const overlayEl = $("overlayImage");

        if (drrEl && drrPath) drrEl.src = drrPath;
        if (overlayEl && overlayPath) overlayEl.src = overlayPath;

        // Ensure kV starts overlaid on DRR (with seeded misalignment)
        this._renderOverlayTransform();

      } catch (e) {
        console.error("Unable to load scenario JSON", e);
        const title = $("imagingTitle");
        const scenarioLabel = $("scenarioLabel");
        if (scenarioLabel) scenarioLabel.textContent = `Error Loading ${this.scenarioId}`;
        this._setStatusLine(`Failed to load scenario: ${String(e?.message || e)}`);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const q = getQuery();
    new ImagingScreen(q);
  });

})();
