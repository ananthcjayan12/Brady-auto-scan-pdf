# Progress

## What Works
- **Backend Architecture:** Flask server with modular services for parsing, PDF generation, and printing.
- **Parsing Logic:** Reliable regex extraction of Part No, Serial No, and Qty from Nokia raw strings.
- **ISO-15434 Compliance:** Successful injection of ASCII control characters (30, 29, 4) into DataMatrix content.
- **Frontend Input Handling:** `BarcodeInput` component effectively blocks scanner-generated shortcuts and maintains focus.
- **Dashboard UI:** Clean, reactive interface with real-time feedback.
- **Printer Discovery:** Cross-platform printer listing and selection.

## What's Left to Build

### Integration & Hardware Testing
- [ ] Verify physical print quality on Brady printer.
- [ ] Test with a wide range of real Nokia product barcodes.
- [ ] Refine PDF coordinates if label alignment is off on physical stock.

### Potential Enhancements
- [x] Full-width dashboard layout.
- [x] Label preview screen.
- [x] Configurable printing delay.
- [x] Auto-printing toggle.
- [x] Granular label layout settings (dimensions, barcodes, fonts).
- [x] Dynamic barcode scaling to prevent overflow.
- [ ] Print history log in the UI.
- [ ] Manual override/edit feature for parsed fields before printing.
- [ ] Support for additional label templates.

## Current Status
The project has reached its **v2.2 milestone** with the addition of layout fixes, settings, and preview capabilities.

## Known Issues
- `lpr` on Unix requires a default printer or specific selection to work; returns 500 error if not configured.

## Evolution of Project Decisions
- **2026-01-27:** Migrated to `createBarcodeDrawing` for DataMatrix to ensure cross-version compatibility in ReportLab.
- **2026-01-27:** Implemented global key capture phase listener to intercept scanner-generated navigation events before the browser acts on them.
