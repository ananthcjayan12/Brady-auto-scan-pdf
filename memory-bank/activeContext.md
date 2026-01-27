# Active Context

## Current Work Focus
- Finalizing the initial implementation of the Nokia Label Compliance Bridge.
- Documenting the system architecture and implementation details in the memory bank.

## Recent Changes
- **Layout Overhaul:** Fixed half-screen issue by implementing a full-width, two-column grid layout for the dashboard.
- **Settings System:** 
    - Added a "Settings" tab with persistent storage (localStorage).
    - Implemented "Auto-Printing" toggle.
    - Added "Printing Delay" (0-10s) to allow operators to review scans before auto-printing.
    - **Label Layout Settings:** Added granular control over label dimensions, barcode sizes, font sizes, and spacing.
- **Overflow Fix:** Implemented dynamic scaling for Code128 barcodes to prevent layout overflow with long serial numbers.
- **Label Preview:** 
    - Developed a real-time preview panel using an `<iframe>` to display generated PDFs.
    - Added display of parsed Part No, Serial No, and Quantity alongside the preview.
- **Backend API Enhancement:**
    - Refactored `/api/generate-and-print` and added `/api/generate-label`, `/api/print-label`, and `/api/label/<filename>` to support preview workflows.
- **Project Structure:** Created separate `/print-server` (Flask) and `/frontend` (React/Vite) directories.
- **Backend Implementation:** 
    - Integrated `app.py` and `services.py`.
    - Implemented `NokiaLabelService` with regex parsing for Nokia scan strings.
    - Implemented ISO-15434 compliant DataMatrix generation using `reportlab.graphics.barcode.createBarcodeDrawing`.
    - Implemented `PrintService` for OS-level printing (Windows/Unix).
- **Frontend Implementation:**
    - Developed `BarcodeInput` component with global key filtering and auto-refocus.

## Next Steps
- Verify printer output on physical hardware (Brady printer).
- Adjust PDF coordinates if label alignment is off on physical stock.
- Add logging for printed labels (history) if requested.

## Active Decisions and Considerations
- **DataMatrix Generation:** Switched to `createBarcodeDrawing('ECC200DataMatrix', ...)` for better compatibility across different `reportlab` versions.
- **Frontend Focus:** The 2-second refocus interval is balanced to provide good UX while ensuring the input is never lost for long.
- **Error Handling:** Backend returns 500 with descriptive error messages when printing fails (e.g., no default printer on Unix), which is displayed in the frontend status banner.
