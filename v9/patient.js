/*
  LINAC Treatment Console (Chart screen)
  - ARIA-like UI with Preview / Prepare / Ready / Beam On / Record
  - Uses scenario JSON (file=? query param)
  - Shares couch shift state with imaging screen via localStorage + BroadcastChannel
  - Integrates StudyUI (study_embed.js) for participant Qs + CSV export
*/

(() => {
  "use strict";

  const VERSION = "v6.1.0";
  const BUILD_DATE = "2025-12-19";

  // ---------- Utils ----------
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function format1(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
    return Number(n).toFixed(1);
  }

  function safeText(el, txt) {
    if (!el) return;
    el.textContent = txt;
  }

  function getQuery() {
    const p = new URLSearchParams(window.location.search);
    const file = p.get("file") || "";
    const cfg = p.get("cfg") || p.get("config") || "";
    return { p, file, cfg };
  }

  function deriveScenarioId(file) {
    // Typical: data/A2_computer_withErrors.json
    const m = (file || "").match(/([A-Z]\d+)/);
    return m ? m[1] : "UNKNOWN";
  }

  function deriveErrorPresent(file) {
    const f = (file || "").toLowerCase();
    if (!f) return null;
    if (f.includes("noerrors")) return false;
    if (f.includes("witherrors")) return true;
    // Fall back: assume error-present if not explicitly "noErrors"
    return null;
  }

  function techniqueLabel(technique) {
    const t = (technique || "").toUpperCase();
    if (t.includes("VMAT")) return "VMAT";
    if (t.includes("IMRT")) return "IMRT";
    if (t.includes("3D")) return "3DCRT";
    if (t.includes("STATIC")) return "STATIC";
    return technique || "STATIC";
  }

  // ---------- Gantry angle helpers (used for VMAT simulation) ----------
  function normDeg(d) {
    const n = Number(d);
    if (!Number.isFinite(n)) return 0;
    return ((n % 360) + 360) % 360;
  }

  function parseGantryPlan(field) {
    const ga = field?.gantryAngle;

    if (typeof ga === "number") {
      const a = normDeg(ga);
      return { isArc: false, startDeg: a, endDeg: a, raw: ga };
    }

    const s = String(ga ?? "").trim();
    if (!s) {
      return { isArc: false, startDeg: 0, endDeg: 0, raw: ga };
    }

    if (s.includes("-")) {
      const parts = s.split("-").map((x) => x.trim());
      const start = normDeg(parseFloat(parts[0] || "0"));
      const end = normDeg(parseFloat(parts[1] || "0"));
      return { isArc: true, startDeg: start, endDeg: end, raw: s };
    }

    const n = parseFloat(s);
    if (Number.isFinite(n)) {
      const a = normDeg(n);
      return { isArc: false, startDeg: a, endDeg: a, raw: s };
    }

    return { isArc: false, startDeg: 0, endDeg: 0, raw: s };
  }

  function inferArcDirection(field) {
    const name = String(field?.fieldName || "").toUpperCase();
    if (name.includes("CCW")) return "ccw";
    if (name.includes("CW")) return "cw";
    return "cw"; // safe default for demo/simulation
  }

  function cwDistanceDeg(startDeg, endDeg) {
    // Clockwise is treated as decreasing angle
    return (startDeg - endDeg + 360) % 360;
  }

  function ccwDistanceDeg(startDeg, endDeg) {
    // Counter-clockwise is treated as increasing angle
    return (endDeg - startDeg + 360) % 360;
  }

  function maybeForceLongArc(distanceDeg) {
    // In several clinical systems, a "full" arc may be represented by nearly-equal start/end angles.
    // If the computed travel is very small, interpret as a long wrap-around arc for realism.
    if (distanceDeg <= 5) return 360 - distanceDeg;
    return distanceDeg;
  }

  function computeArcAngleDeg(startDeg, endDeg, dir, progress01) {
    // Interpolate gantry rotation between start and end. For the special case where
    // start/end are within a few degrees (e.g., "180-179"), we assume the intent is
    // a near-full rotation and therefore use the *long* path (which requires flipping
    // direction so that we still end at the specified endpoint).
    const p = clamp(Number(progress01) || 0, 0, 1);

    const cwDist = cwDistanceDeg(startDeg, endDeg);
    const ccwDist = ccwDistanceDeg(startDeg, endDeg);

    let chosenDir = dir === "ccw" ? "ccw" : "cw";
    let dist = chosenDir === "ccw" ? ccwDist : cwDist;

    // If the preferred direction would move only 1–2°, flip to the long arc.
    if (dist <= 5) {
      chosenDir = chosenDir === "ccw" ? "cw" : "ccw";
      dist = chosenDir === "ccw" ? ccwDist : cwDist;
    }

    const delta = dist * p;
    const raw = chosenDir === "ccw" ? Number(startDeg) + delta : Number(startDeg) - delta;
    return normDeg(raw);
  }

  function beamTypeLabel(field) {
    const tech = techniqueLabel(field?.technique);
    if (tech === "VMAT") return "ARC (VMAT)";
    if (tech === "IMRT") return "IMRT";
    if (tech === "3DCRT") return "STATIC (3DCRT)";
    return "STATIC (Static Photon)";
  }

  function energyLabel(field) {
    const mv = field?.energy_MV;
    if (mv === null || mv === undefined) return "—";
    // Display like 6X
    const n = Number(mv);
    if (!Number.isFinite(n)) return String(mv);
    return `${n}X`;
  }

  function isIMRTLike(field) {
    const t = techniqueLabel(field?.technique);
    return t === "IMRT" || t === "VMAT";
  }

  function stateKey(scenarioId) {
    return `linac_state_${scenarioId}`;
  }

  // ---------- Shared state between windows ----------
  class SharedState {
    constructor(scenarioId) {
      this.scenarioId = scenarioId;
      this.key = stateKey(scenarioId);
      this.bc = null;
      try {
        this.bc = new BroadcastChannel("linac_sim");
      } catch {
        this.bc = null;
      }

      window.addEventListener("storage", (e) => {
        if (e.key === this.key) {
          this._emit();
        }
      });

      if (this.bc) {
        this.bc.addEventListener("message", (ev) => {
          if (ev?.data?.type === "state" && ev?.data?.scenarioId === this.scenarioId) {
            this._emit(ev.data.state);
          }
        });
      }

      this.listeners = new Set();
    }

    read() {
      try {
        const raw = localStorage.getItem(this.key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    write(state) {
      try {
        localStorage.setItem(this.key, JSON.stringify(state));
      } catch {
        // ignore
      }
      if (this.bc) {
        try {
          this.bc.postMessage({ type: "state", scenarioId: this.scenarioId, state });
        } catch {
          // ignore
        }
      }
      this._emit(state);
    }

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    _emit(forcedState = null) {
      const st = forcedState || this.read();
      for (const fn of this.listeners) {
        try {
          fn(st);
        } catch {
          // ignore listener errors
        }
      }
    }
  }

  // ---------- MLC Animator ----------
  class MLCAnimator {
    constructor(mlcCanvas, bevCanvas) {
      this.canvas = mlcCanvas;
      this.ctx = mlcCanvas?.getContext ? mlcCanvas.getContext("2d") : null;
      this.bevCanvas = bevCanvas;
      this.bevCtx = bevCanvas?.getContext ? bevCanvas.getContext("2d") : null;
      this._raf = null;
      this._t0 = 0;
      this._running = false;
      this._field = null;
      this._progress = 0;
    }

    setField(field) {
      this._field = field;
      this._progress = 0;
      this.render(0);
    }

    setProgress(pct) {
      this._progress = clamp(pct, 0, 1);
      this.render(this._progress);
    }

    start() {
      if (this._running) return;
      this._running = true;
      this._t0 = performance.now();
      const tick = () => {
        if (!this._running) return;
        this.render(this._progress, performance.now() - this._t0);
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }

    stop() {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
    }

    render(progressPct = 0, elapsedMs = 0) {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = "#101418";
      ctx.fillRect(0, 0, w, h);

      // Field frame
      const margin = 24;
      const fw = w - margin * 2;
      const fh = h - margin * 2;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(margin, margin, fw, fh);

      const field = this._field || {};
      const imrtLike = isIMRTLike(field);

      // Determine jaws (cm) -> map to aperture region inside frame
      const jawX1 = Number(field?.jawX1 ?? -5);
      const jawX2 = Number(field?.jawX2 ?? 5);
      const jawY1 = Number(field?.jawY1 ?? -7.5);
      const jawY2 = Number(field?.jawY2 ?? 7.5);

      // Normalize jaws to [-10..10] range for display
      const nx1 = clamp((jawX1 + 10) / 20, 0, 1);
      const nx2 = clamp((jawX2 + 10) / 20, 0, 1);
      const ny1 = clamp((jawY1 + 10) / 20, 0, 1);
      const ny2 = clamp((jawY2 + 10) / 20, 0, 1);

      const ax = margin + nx1 * fw;
      const bx = margin + nx2 * fw;
      const ay = margin + (1 - ny2) * fh;
      const by = margin + (1 - ny1) * fh;

      // Outside jaws shading
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(margin, margin, fw, ay - margin);
      ctx.fillRect(margin, by, fw, margin + fh - by);
      ctx.fillRect(margin, ay, ax - margin, by - ay);
      ctx.fillRect(bx, ay, margin + fw - bx, by - ay);

      // Aperture region
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(ax, ay, bx - ax, by - ay);

      if (imrtLike) {
        // Draw moving MLC leaves inside jaws
        const nLeaves = 46;
        const leafH = (by - ay) / nLeaves;
        const centerX = (ax + bx) / 2;
        const usableW = (bx - ax);

        // Deterministic seed from field name
        const seedStr = String(field?.fieldName || field?.name || "field");
        let seed = 0;
        for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;

        const phaseBase = (seed % 628) / 100; // 0..6.28
        const t = (elapsedMs / 1000) * 1.8 + phaseBase;

        for (let i = 0; i < nLeaves; i++) {
          const y0 = ay + i * leafH;
          const y1 = y0 + leafH;

          // base opening proportion
          const base = 0.24 + 0.06 * Math.sin((i * 0.37) + phaseBase);
          const dyn = 0.10 * Math.sin(t + i * 0.21) * (0.35 + 0.65 * progressPct);
          const open = clamp(base + dyn, 0.06, 0.44);

          const leftEdge = centerX - (open * usableW) / 2;
          const rightEdge = centerX + (open * usableW) / 2;

          // left leaf
          ctx.fillStyle = "rgba(200,200,200,0.62)";
          ctx.fillRect(ax, y0, leftEdge - ax, leafH * 0.92);

          // right leaf
          ctx.fillRect(rightEdge, y0, bx - rightEdge, leafH * 0.92);

          // leaf borders
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(leftEdge, y0);
          ctx.lineTo(leftEdge, y1);
          ctx.moveTo(rightEdge, y0);
          ctx.lineTo(rightEdge, y1);
          ctx.stroke();
        }
      } else {
        // Static aperture cue
        ctx.strokeStyle = "rgba(0,255,120,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(ax, ay, bx - ax, by - ay);
      }

      // Crosshair
      ctx.strokeStyle = "rgba(255,0,0,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin + fw / 2, margin);
      ctx.lineTo(margin + fw / 2, margin + fh);
      ctx.moveTo(margin, margin + fh / 2);
      ctx.lineTo(margin + fw, margin + fh / 2);
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "14px Arial";
      ctx.fillText(`${beamTypeLabel(field)}  |  ${energyLabel(field)}  |  ${techniqueLabel(field?.technique)}`, margin + 6, margin - 6);

      // Render BEV (simplified)
      if (this.bevCtx && this.bevCanvas) {
        this._renderBEV(ax, ay, bx, by, imrtLike, progressPct, elapsedMs, field);
      }
    }

    _renderBEV(ax, ay, bx, by, imrtLike, progressPct, elapsedMs, field) {
      const ctx = this.bevCtx;
      const w = this.bevCanvas.width;
      const h = this.bevCanvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0b0e12";
      ctx.fillRect(0, 0, w, h);

      // Circle
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) * 0.44;
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // crosshair
      ctx.strokeStyle = "rgba(255,0,0,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();

      // simple MLC bars
      if (imrtLike) {
        const n = 18;
        const barH = (r * 2) / n;
        const t = (elapsedMs / 1000) * 1.8;
        for (let i = 0; i < n; i++) {
          const y = cy - r + i * barH;
          const base = 0.22 + 0.06 * Math.sin(i * 0.5);
          const dyn = 0.10 * Math.sin(t + i * 0.7) * (0.35 + 0.65 * progressPct);
          const open = clamp(base + dyn, 0.06, 0.44);
          const left = cx - (open * r);
          const right = cx + (open * r);

          ctx.fillStyle = "rgba(200,200,200,0.55)";
          ctx.fillRect(cx - r, y, left - (cx - r), barH * 0.9);
          ctx.fillRect(right, y, (cx + r) - right, barH * 0.9);
        }
      } else {
        ctx.strokeStyle = "rgba(0,255,120,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - r * 0.55, cy - r * 0.55, r * 1.1, r * 1.1);
      }

      // Caption
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "12px Arial";
      ctx.fillText(techniqueLabel(field?.technique) || "STATIC", 8, h - 10);
    }
  }

  // ---------- Main controller ----------
  class LinacConsole {
    constructor({ scenario, file, cfg }) {
      this.scenario = scenario;
      this.file = file;
      this.cfg = cfg || "";
      this.scenarioId = deriveScenarioId(file);
      this.errorPresent = deriveErrorPresent(file);

      const tp = (scenario && typeof scenario === "object") ? (scenario.treatmentPlan || {}) : {};
      const fieldsFromTP = Array.isArray(tp.treatmentFields) ? tp.treatmentFields : null;
      const fieldsFromTop = Array.isArray(scenario?.treatmentFields) ? scenario.treatmentFields : null;
      this.fields = fieldsFromTP || fieldsFromTop || [];
      this.activeFieldIndex = 0;
      this.deliveredMU = this.fields.map(() => 0);
      this.fieldDone = this.fields.map(() => false);

      this.stage = "preview";
      this.isDelivering = false;

      // VMAT gantry rotation simulation (only active during delivery of a VMAT arc)
      // { fieldIndex, startDeg, endDeg, dir, currentDeg }
      this._gantrySim = null;

      this.shared = new SharedState(this.scenarioId);
      this.currentShifts = { VRT: 0, LAT: 0, LNG: 0, PITCH: 0, ROLL: 0 };

      this._wireDom();
      this._initSharedState();
      this._renderStatic();
      this._renderFieldList();
      this._selectField(0);
      this._setStage("preview");

      this.shared.onChange((st) => {
        if (!st) return;
        if (st.couchShifts) {
          this.currentShifts = { ...this.currentShifts, ...st.couchShifts };
          this._renderTables();
        }
      });

      // periodic clock
      setInterval(() => {
        const now = new Date();
        safeText(qs("#console-datetime"), now.toLocaleString());
      }, 1000);
    }

    _wireDom() {
      // Top
      safeText(qs("#primary-user"), "hup");

      // Buttons
      qs("#btn-open-imaging")?.addEventListener("click", () => this._openImagingWindow());

      qs("#btn-preview")?.addEventListener("click", () => this._setStage("preview"));
      qs("#btn-prepare")?.addEventListener("click", () => this._handlePrepare());
      qs("#btn-ready")?.addEventListener("click", () => this._handleReady());
      qs("#btn-beam-on")?.addEventListener("click", () => this._handleBeamOn());
      qs("#btn-record")?.addEventListener("click", () => this._handleRecord());

      // Study log helpers
      qs("#btn-study-log")?.addEventListener("click", () => {
        if (window.StudyUI?.openSetup) window.StudyUI.openSetup();
      });
      qs("#btn-export")?.addEventListener("click", () => {
        if (window.StudyUI?.exportCSV) window.StudyUI.exportCSV();
      });
      qs("#btn-clear")?.addEventListener("click", () => {
        if (window.StudyUI?.clearAll) window.StudyUI.clearAll();
      });

      // Canvas animator
      this.mlc = new MLCAnimator(qs("#mlc-canvas"), qs("#bev-canvas"));
    }

    _initSharedState() {
      // Initialize shared state if missing
      const st = this.shared.read();
      if (!st) {
        this.shared.write({
          scenarioId: this.scenarioId,
          file: this.file,
          couchShifts: { ...this.currentShifts },
          lastUpdated: Date.now(),
          version: VERSION,
        });
      }
    }

    _renderStatic() {
      // Patient card
      const d = this.scenario?.demographics || {};
      safeText(qs("#pt-name"), d.name || "—");
      safeText(qs("#pt-id"), d.patientId || this.scenario?.patientId || "—");
      safeText(qs("#pt-dob"), d.dob || "—");

      const tp = this.scenario?.treatmentPlan || {};
      safeText(qs("#pt-radonc"), tp.radOnc || "—");

      // Plan & fraction
      const planName = tp.planId || tp.planName || (tp.prescription ? (tp.prescription.site || "") : "") || this.scenarioId;
      safeText(qs("#plan-id"), planName);

      const fx = tp.prescription?.fraction || "";
      const totalFx = tp.prescription?.totalFractions || "";
      const fxText = (fx && totalFx) ? `Fx: ${fx} of ${totalFx}` : (totalFx ? `Fx: 1 of ${totalFx}` : "");
      safeText(qs("#fraction-info"), fxText || "—");

      safeText(qs("#patient-orientation"), tp.patientOrientation || "Head First, Supine");

      // Center message
      safeText(qs("#center-message"), "To begin, click Prepare.");
    }

    _renderFieldList() {
      const ul = qs("#field-list");
      if (!ul) return;
      ul.innerHTML = "";

      this.fields.forEach((f, idx) => {
        const li = document.createElement("li");
        li.className = "field-item";
        li.dataset.index = String(idx);

        const icon = document.createElement("div");
        icon.className = "field-icon";

        const name = document.createElement("div");
        name.className = "field-name";
        name.textContent = f.fieldName || f.name || `Field ${idx + 1}`;

        const prog = document.createElement("div");
        prog.className = "field-progress";
        const mu = Number(f.monitorUnits ?? 0);
        prog.textContent = `${format1(this.deliveredMU[idx])} / ${format1(mu)}`;

        li.appendChild(icon);
        li.appendChild(name);
        li.appendChild(prog);

        li.addEventListener("click", () => this._selectField(idx));
        ul.appendChild(li);
      });

      this._updateFieldListStyles();
    }

    _updateFieldListStyles() {
      const items = qsa(".field-item");
      items.forEach((li) => {
        const idx = Number(li.dataset.index);
        li.classList.toggle("active", idx === this.activeFieldIndex);
        const icon = qs(".field-icon", li);
        if (icon) {
          icon.classList.toggle("done", !!this.fieldDone[idx]);
        }
        const prog = qs(".field-progress", li);
        if (prog) {
          const mu = Number(this.fields[idx]?.monitorUnits ?? 0);
          prog.textContent = `${format1(this.deliveredMU[idx])} / ${format1(mu)}`;
        }
      });
    }

    _selectField(idx) {
      this.activeFieldIndex = clamp(idx, 0, Math.max(0, this.fields.length - 1));
      this._updateFieldListStyles();
      const field = this.fields[this.activeFieldIndex] || {};
      this.mlc.setField(field);
      this._renderTables();
    }

    _renderTables() {
      const field = this.fields[this.activeFieldIndex] || {};

      // Beam table
      const beamRows = [];
      beamRows.push(["Beam Type", beamTypeLabel(field), this.isDelivering ? beamTypeLabel(field) : "—"]);
      beamRows.push(["Energy Type", energyLabel(field), this.isDelivering ? energyLabel(field) : "—"]);

      const planMU = Number(field.monitorUnits ?? 0);
      const actualMU = Number(this.deliveredMU[this.activeFieldIndex] ?? 0);
      beamRows.push(["MU", format1(planMU), format1(actualMU)]);

      const doseRate = Number(field.doseRate ?? 600);
      beamRows.push(["Dose Rate", String(doseRate), this.isDelivering ? String(doseRate) : "—"]);

      const timeMin = doseRate > 0 ? (planMU / doseRate) : 0;
      beamRows.push(["Time (min)", timeMin ? timeMin.toFixed(2) : "0.00", this.isDelivering ? (actualMU / doseRate).toFixed(2) : "—"]);

      beamRows.push(["Wedge", field.wedge || "None", this.isDelivering ? (field.wedge || "None") : "—"]);
      beamRows.push(["Bolus", field.bolus || "None", this.isDelivering ? (field.bolus || "None") : "—"]);

      this._fillTable("#beam-tbody", beamRows);

      // Geometry table
      // NOTE: VMAT arcs can specify gantry ranges like "180-179"; we parse those so the
      // plan column always has a value and the actual column can rotate during Beam On.
      const gp = parseGantryPlan(field);
      const planGantry = Number.isFinite(gp?.startDeg) ? gp.startDeg : 0;
      const planColl = Number(field.collimatorAngle ?? 0);
      const planCouch = Number(field.couchRot ?? 0);

      const planVrt = Number(field.couchVrt ?? 0);
      const planLng = Number(field.couchLng ?? 0);
      const planLat = Number(field.couchLat ?? 0);

      const actualVrt = planVrt + Number(this.currentShifts.VRT ?? 0);
      const actualLng = planLng + Number(this.currentShifts.LNG ?? 0);
      const actualLat = planLat + Number(this.currentShifts.LAT ?? 0);

      // If a VMAT arc is/was delivered, keep an "actual" gantry value for display.
      // During Beam On we continuously update this via this._gantrySim.
      let actualGantry = Number.isFinite(Number(field._gantryActualDeg))
        ? normDeg(Number(field._gantryActualDeg))
        : planGantry;

      if (this._gantrySim && this._gantrySim.fieldIndex === this.currentFieldIndex && this.isDelivering) {
        const g = Number(this._gantrySim.currentDeg);
        if (Number.isFinite(g)) actualGantry = normDeg(g);
      }

      const geomRows = [];

      // Geometry rows (include jaws for a more realistic console view)
      geomRows.push(["Gantry Rtn", format1(planGantry), format1(actualGantry)]);
      geomRows.push(["Coll Rtn", format1(planColl), format1(planColl)]);
      geomRows.push(["Couch Rtn", format1(planCouch), format1(planCouch)]);

      // Jaws (Y1/Y2/X1/X2) – console-verifiable geometry parameters
      const jawY1 = Number.isFinite(Number(field.jawY1)) ? Number(field.jawY1) : Number(field.jawPositions_cm?.Y1 ?? 0);
      const jawY2 = Number.isFinite(Number(field.jawY2)) ? Number(field.jawY2) : Number(field.jawPositions_cm?.Y2 ?? 0);
      const jawX1 = Number.isFinite(Number(field.jawX1)) ? Number(field.jawX1) : Number(field.jawPositions_cm?.X1 ?? 0);
      const jawX2 = Number.isFinite(Number(field.jawX2)) ? Number(field.jawX2) : Number(field.jawPositions_cm?.X2 ?? 0);
      geomRows.push(["Y1 (cm)", format1(jawY1), format1(jawY1)]);
      geomRows.push(["Y2 (cm)", format1(jawY2), format1(jawY2)]);
      geomRows.push(["X1 (cm)", format1(jawX1), format1(jawX1)]);
      geomRows.push(["X2 (cm)", format1(jawX2), format1(jawX2)]);

      geomRows.push(["Couch Vrt", format1(planVrt), format1(actualVrt)]);
      geomRows.push(["Couch Lng", format1(planLng), format1(actualLng)]);
      geomRows.push(["Couch Lat", format1(planLat), format1(actualLat)]);
      geomRows.push(["Pitch (°)", format1(field.couchPitch ?? 0), format1(Number(field.couchPitch ?? 0) + Number(this.currentShifts.PITCH ?? 0))]);
      geomRows.push(["Roll (°)", format1(field.couchRoll ?? 0), format1(Number(field.couchRoll ?? 0) + Number(this.currentShifts.ROLL ?? 0))]);

      this._fillTable("#geom-tbody", geomRows);

      // Update MLC progress
      const pct = planMU > 0 ? (actualMU / planMU) : 0;
      this.mlc.setProgress(pct);
    }

    _fillTable(tbodySel, rows) {
      const tbody = qs(tbodySel);
      if (!tbody) return;
      tbody.innerHTML = "";
      for (const [k, plan, actual] of rows) {
        const tr = document.createElement("tr");
        const tdK = document.createElement("td");
        tdK.className = "k";
        tdK.textContent = k;
        const tdP = document.createElement("td");
        tdP.textContent = plan;
        const tdA = document.createElement("td");
        tdA.textContent = actual;
        tr.appendChild(tdK);
        tr.appendChild(tdP);
        tr.appendChild(tdA);
        tbody.appendChild(tr);
      }
    }

    _setStage(stage) {
      this.stage = stage;

      // Active button
      qsa(".wf-btn").forEach((b) => b.classList.toggle("active", b.dataset.stage === stage));

      // Enable/disable logic
      const btnReady = qs("#btn-ready");
      const btnBeam = qs("#btn-beam-on");
      const btnRecord = qs("#btn-record");

      if (stage === "preview") {
        if (btnReady) btnReady.disabled = true;
        if (btnBeam) btnBeam.disabled = true;
        if (btnRecord) btnRecord.disabled = true;
        safeText(qs("#center-message"), "To begin, click Prepare.");
      }

      if (stage === "ready") {
        if (btnReady) btnReady.disabled = false;
        if (btnBeam) btnBeam.disabled = false;
        safeText(qs("#center-message"), "Ready. Review parameters, then click Beam On.");
      }

      if (stage === "beamOn") {
        if (btnReady) btnReady.disabled = true;
        if (btnBeam) btnBeam.disabled = true;
        safeText(qs("#center-message"), "Treatment in progress...");
      }

      if (stage === "record") {
        if (btnRecord) btnRecord.disabled = false;
        safeText(qs("#center-message"), "Treatment complete. Click Record to answer study questions.");
      }

      // Render tables may depend on isDelivering
      this._renderTables();
    }

    _openImagingWindow() {
      const url = new URL("imaging.html", window.location.href);
      url.searchParams.set("file", this.file);
      if (this.cfg) url.searchParams.set("cfg", this.cfg);
      window.open(url.toString(), `${this.scenarioId}_imaging`, "noopener,noreferrer");
    }

    _handlePrepare() {
      // Checklist modal. Must check all to continue.
      const modalRoot = qs("#modal-root");
      if (!modalRoot) return;

      const items = [
        "Patient ID verified",
        "Plan & treatment site confirmed",
        "Immobilization / indexing correct",
        "Machine clearance visually verified",
        "Therapist alerts reviewed",
      ];

      modalRoot.innerHTML = "";

      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";

      const modal = document.createElement("div");
      modal.className = "modal";

      const title = document.createElement("div");
      title.className = "modal-title";
      title.textContent = "Daily Treatment Verification";

      const list = document.createElement("div");
      list.className = "modal-list";

      const checks = [];
      items.forEach((txt, i) => {
        const row = document.createElement("label");
        row.className = "modal-item";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.index = String(i);
        checks.push(cb);

        const span = document.createElement("span");
        span.textContent = txt;

        row.appendChild(cb);
        row.appendChild(span);
        list.appendChild(row);
      });

      const actions = document.createElement("div");
      actions.className = "modal-actions";

      const btnConfirm = document.createElement("button");
      btnConfirm.className = "modal-btn";
      btnConfirm.textContent = "Confirm Ready";
      btnConfirm.disabled = true;

      const btnCancel = document.createElement("button");
      btnCancel.className = "modal-btn danger";
      btnCancel.textContent = "Cancel";

      const updateConfirm = () => {
        const all = checks.every((c) => c.checked);
        btnConfirm.disabled = !all;
      };
      checks.forEach((c) => c.addEventListener("change", updateConfirm));

      btnCancel.addEventListener("click", () => {
        modalRoot.innerHTML = "";
      });

      btnConfirm.addEventListener("click", () => {
        modalRoot.innerHTML = "";

        // Mark scenario start here (user requested)
        if (window.StudyUI?.markScenarioStart) {
          window.StudyUI.markScenarioStart({ scenarioId: this.scenarioId, file: this.file, cfg: this.cfg || "" });
        }

        // Enable Ready + Beam On
        const btnReady = qs("#btn-ready");
        if (btnReady) btnReady.disabled = false;

        const btnBeam = qs("#btn-beam-on");
        if (btnBeam) btnBeam.disabled = false;

        this._setStage("ready");
      });

      actions.appendChild(btnConfirm);
      actions.appendChild(btnCancel);

      modal.appendChild(title);
      modal.appendChild(list);
      modal.appendChild(actions);

      backdrop.appendChild(modal);
      modalRoot.appendChild(backdrop);

      // Also set stage
      qsa(".wf-btn").forEach((b) => b.classList.toggle("active", b.dataset.stage === "prepare"));
      safeText(qs("#center-message"), "Complete verification checklist.");
    }

    _handleReady() {
      // Soft stage; beam-on already enabled from Prepare
      this._setStage("ready");
    }

    async _handleBeamOn() {
      if (this.isDelivering) return;
      if (!this.fields.length) return;
      this.isDelivering = true;
      this._setStage("beamOn");
      this.mlc.start();

      // Deliver all treatment fields sequentially; imaging fields are "instant"
      for (let i = 0; i < this.fields.length; i++) {
        this._selectField(i);
        const f = this.fields[i];

        // Initialize gantry rotation simulation for VMAT-style arc definitions.
        // If the gantry angle is specified as a range (e.g., "180-179"), we rotate
        // the ACTUAL gantry angle during Beam On.
        const gp = parseGantryPlan(f);
        if (gp.isArc) {
          this._gantrySim = {
            fieldIndex: i,
            startDeg: gp.startDeg,
            endDeg: gp.endDeg,
            dir: inferArcDirection(f),
            currentDeg: gp.startDeg,
          };
          // Persist the displayed "actual" gantry value for this field.
          f._gantryActualDeg = gp.startDeg;
        } else {
          this._gantrySim = null;
          f._gantryActualDeg = gp.startDeg;
        }

        const isImagingField = (f?.type || "").toLowerCase().includes("imaging") || (f?.imagingModality);
        const muTotal = Number(f.monitorUnits ?? 0);

        if (isImagingField || muTotal <= 0) {
          this.deliveredMU[i] = muTotal;
          this.fieldDone[i] = true;
          this._updateFieldListStyles();
          this._renderTables();
          await this._sleep(250);
          continue;
        }

        // Simulate MU delivery
        const doseRate = Number(f.doseRate ?? 600); // MU/min
        const sec = doseRate > 0 ? (muTotal / doseRate) * 60 : 5;
        const simSeconds = clamp(sec, 2.5, 10); // cap to keep study moving

        const steps = Math.max(15, Math.floor(simSeconds * 20));
        for (let s = 0; s <= steps; s++) {
          const frac = s / steps;

          // VMAT: update the simulated actual gantry angle as MU is delivered
          if (this._gantrySim && this._gantrySim.fieldIndex === i) {
            this._gantrySim.currentDeg = computeArcAngleDeg(
              this._gantrySim.startDeg,
              this._gantrySim.endDeg,
              this._gantrySim.dir,
              frac
            );
            f._gantryActualDeg = this._gantrySim.currentDeg;
          }

          this.deliveredMU[i] = muTotal * frac;
          this._updateFieldListStyles();
          this._renderTables();
          await this._sleep((simSeconds * 1000) / steps);
        }

        this.deliveredMU[i] = muTotal;
        this.fieldDone[i] = true;
        this._updateFieldListStyles();
        this._renderTables();
        await this._sleep(250);
      }

      this.isDelivering = false;
      this.mlc.stop();

      // Enable Record
      const btnRecord = qs("#btn-record");
      if (btnRecord) btnRecord.disabled = false;
      this._setStage("record");
    }

    _handleRecord() {
      // Guard: only after all fields done
      const allDone = this.fieldDone.every(Boolean);
      if (!allDone) {
        safeText(qs("#center-message"), "Complete all fields before recording.");
        return;
      }

      // Open study scenario form
      if (typeof window.studyScenarioComplete === "function") {
        window.studyScenarioComplete({
          scenarioId: this.scenarioId,
          scenarioFile: this.file,
          configuration: this.cfg || "",
          errorPresent: this.errorPresent,
          version: VERSION,
        });
      } else if (window.StudyUI?.openScenario) {
        window.StudyUI.openScenario({ scenarioId: this.scenarioId, configuration: this.cfg || "" });
      }

      safeText(qs("#center-message"), "Study questions opened. When finished, export CSV.");
    }

    _sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  // ---------- Boot ----------
  async function boot() {
    const { file, cfg } = getQuery();
    if (!file) {
      document.body.innerHTML = `<div style="padding:16px;color:#fff;">Missing scenario file (?file=...)</div>`;
      return;
    }

    let scenario = null;
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      scenario = await res.json();
    } catch (e) {
      document.body.innerHTML = `<div style="padding:16px;color:#fff;">Failed to load scenario: ${String(e)}</div>`;
      return;
    }

    // Version stamping hint
    window.__LINAC_EMULATOR_VERSION__ = VERSION;
    window.__LINAC_EMULATOR_BUILD_DATE__ = BUILD_DATE;

    // Initialize StudyUI if present
    if (window.StudyUI?.setVersion) {
      window.StudyUI.setVersion({ version: VERSION, buildDate: BUILD_DATE });
    }

    new LinacConsole({ scenario, file, cfg });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
