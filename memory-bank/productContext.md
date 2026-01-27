# Product Context

## Why this project exists?
In manufacturing and logistics environments, labels often need to be replicated or replaced. For Nokia products, these labels must comply with strict ISO-15434 standards. Manually creating these labels is error-prone and slow. The Nokia Label Compliance Bridge automates this by turning a single scan into a compliant, printed label.

## Problems it solves
- **Compliance Errors:** Manual entry of ISO-15434 control characters is nearly impossible and highly prone to error.
- **Scanner Interface Issues:** Barcode scanners often interfere with browser behavior by sending keyboard shortcuts, leading to accidental navigation or page refreshes.
- **Efficiency:** Reduces the label replication process from minutes to seconds.
- **Operational Consistency:** Ensures every printed label follows the exact required layout and data structure.

## How it should work
1. **The User scans** a raw Nokia DataMatrix barcode.
2. **The Frontend** captures the input while suppressing any "scanner noise" (keyboard shortcuts).
3. **The Backend** receives the raw string, parses it using regex, and "dirties" it by injecting the necessary ASCII control characters.
4. **The PDF Engine** (ReportLab) generates a label PDF with:
   - Human-readable Code128 barcodes for Part No, Serial No, and Qty.
   - A compliant DataMatrix containing the formatted string.
   - Standard text like "Nokia Solutions and Networks" and "MADE IN INDIA".
5. **The System** automatically sends the PDF to the designated Brady printer.

## User Experience Goals
- **Seamless Operation:** The user should only need to perform the scan; everything else happens automatically.
- **Focus Persistence:** The input field should remain focused at all times, even if the user clicks away, to ensure the next scan is always captured.
- **Immediate Feedback:** Clear visual indicators for success (green flash/message) and failure (red flash/error).
