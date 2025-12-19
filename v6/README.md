# Radiation Therapy Emulator (2‑Screen)

This folder is a **static (no-build) web emulator** intended to run on **GitHub Pages** or any simple web server.

## What’s in here

- `index.html` – **Scenario Schedule** (launch point)
- `patient.html` + `patient.js` – **Patient Chart** screen (Monitor 1)
- `imaging.html` + `imaging.js` – **Imaging / Alignment** screen (Monitor 2)
- `data/` – Scenario JSON files (computer/with-errors)
- `paper_charts/` – Printable paper chart PDFs (for PI / admin use)
- `images/` – Imaging assets referenced by JSON (`imagingData.drrImage`, `imagingData.kvImage`)
- `study_capture.js` + `study_embed.js` – Study overlay, capture + CSV export
- `study_config.js` – Version + mode (Study/Demo) config

## Running locally

From this folder:

```bash
python -m http.server 8000
```

Then open:

- `http://localhost:8000/index.html`

## Running on GitHub Pages

Commit all files to your repo (root is easiest), enable GitHub Pages, then open:

- `https://<org>.github.io/<repo>/index.html`

## Two-screen workflow

From the schedule page:

- **Chart** opens `patient.html?file=...`
- **Imaging** opens `imaging.html?file=...`
- **Open Both** opens both pages (two new tabs/windows)

You can drag each window/tab to separate monitors.

## Study vs Demo mode

- **Study mode**: forces a “Prepare” confirmation before the participant can click **Record / Capture Codes** (end marker).
- **Demo mode**: no gating.

Mode is saved in `localStorage` and also passed via URL as `?mode=study|demo`.

## Study capture + export

On the Patient Chart screen:

1. Click **Prepare** (header) and confirm checklist (this stamps the **scenario start time**).
2. When done, go to **Billing (CPT)** and click **Capture Codes** (this stamps the **scenario end time** and opens post-scenario questions).

Export:
- Click **Export CSV** in the Study overlay.
- Click **Export Audit** to download an audit log.

The CSV includes:
- start/end timestamps
- **Console task time (sec)** (computed)
- **Emulator Version / Build Date / Mode** (version stamping)

## Admin paper charts

To show “Paper” buttons on the schedule page, open:

- `index.html?admin=1`

(You can keep this off for participants.)
