# Nokia Label Compliance Bridge (v2.1)

## Project Overview
The Nokia Label Compliance Bridge is a "Scan-to-Print" workstation solution designed to automate the replication of Nokia product labels. The system bridges the gap between raw product scans and ISO-15434 compliant labels required for Nokia products.

## Core Requirements
- **Automated Scanning:** Capture raw DataMatrix scans from Nokia products.
- **Data Parsing:** Extract Part Number, Serial Number, and Quantity from raw scan strings.
- **ISO-15434 Compliance:** Inject mandatory ASCII control characters (`{RS}`, `{GS}`, `{EOT}`) into the DataMatrix content.
- **Label Generation:** Dynamically generate PDF labels containing human-readable barcodes (Code128) and the compliant DataMatrix.
- **Automated Printing:** Seamlessly send generated PDFs to a Brady printer using native OS commands.
- **Scanner Noise Suppression:** Implement strict frontend input handling to prevent browser navigation/shortcuts triggered by barcode scanners acting as keyboards.

## Key Goals
- Streamline the label replication process.
- Ensure 100% compliance with ISO-15434 standards for DataMatrix barcodes.
- Provide a robust, focus-persistent user interface for high-volume scanning environments.
- Reuse proven architecture from the `pdf_print_brady` project.
