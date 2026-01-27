# Technical Context

## Tech Stack
- **Frontend:** React 18 (Vite), Lucide Icons.
- **Backend:** Python 3.x, Flask.
- **PDF Generation:** ReportLab.
- **OS Integration:** `pypiwin32` (for Windows printer discovery).

## Development Setup
- **Backend Port:** `5001`
- **Frontend Port:** Managed by Vite (typically `5173`).
- **Required Python Packages:**
  - `flask`
  - `flask-cors`
  - `reportlab`
  - `pypiwin32` (Windows only)

## Technical Constraints
- **Scanner Emulation:** The system must handle hardware scanners emulating HID Keyboards.
- **OS Dependency:** Printing logic varies between Windows (`powershell` / `win32print`) and Unix (`lpr`).
- **Compliance:** DataMatrix barcodes must strictly follow ISO-15434 with specific ASCII control codes.
- **Browser Security:** Global key listeners are necessary to intercept scanner-generated navigation events.

## Dependencies
- **ReportLab:** Essential for drawing both 1D (Code128) and 2D (DataMatrix) barcodes and text on custom-sized PDF canvases.
- **Native OS Commands:**
  - `powershell` on Windows for `Start-Process -Verb PrintTo`.
  - `lpr` on Linux/Mac.

## Tool Usage Patterns
- **Backend Services:** `NokiaLabelService` for logic, `PrintService` for IO.
- **Frontend Components:** `BarcodeInput` with `useEffect` for focus management and key filtering.
