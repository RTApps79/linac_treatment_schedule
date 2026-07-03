# RadTherapyApps Enterprise — Unified Simulated Center

This consolidation build uses the **Simulated Radiation Center** as the main application shell.

## Included modules

- Native 3D Simulated Radiation Center
- Native new-patient consult, patient education, CT simulation, planning/QA, clinic operations and treatment workflow activities
- RT Workflow Suite
- DICOM MPR Alignment Lab
- Integrated OIS / IGRT Practice Hub
- LINAC Treatment Console

## How integration works

The center owns the active patient and opens each simulator inside a fullscreen Learning Station.
A lightweight `postMessage` bridge sends the active patient context into every module.

Supported messages:

- `RTA_CONTEXT`
- `RTA_MODULE_READY`
- `RTA_REQUEST_CONTEXT`
- `RTA_MODULE_EVENT`

The initial bridge also reports selected completion events back to the center, including IGRT approval and completed fractions.

## Run locally

Browser security commonly blocks iframe modules when HTML is opened with `file://`.

### Windows

Double-click `start-server.bat`, then open:

`http://localhost:8000/`

### macOS / Linux

Run:

```bash
./start-server.sh
```

Then open:

`http://localhost:8000/`

## Adding another simulator

1. Copy its HTML file into `modules/`.
2. Add one entry to the `STATIONS` registry in `index.html`.
3. Optionally add the module bridge script used by the other modules.
4. Add it to `platform-manifest.json`.

## Educational-use notice

This platform is a teaching emulator. It is not a medical device and must not be used for clinical decisions or patient treatment.
