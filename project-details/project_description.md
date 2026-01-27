
# Project Specification: Nokia Label Compliance Bridge (v2.1)

## 1. Executive Summary

This project aims to build a **"Scan-to-Print"** workstation that automates the replication of Nokia product labels. The system will read a raw DataMatrix scan, parse the data, inject missing ISO-15434 control characters (`{RS}`, `{GS}`, `{EOT}`), and immediately generate and print a compliant label using a Brady printer.

**Key Architecture:** We will reuse the **Flask Backend + React Frontend** architecture from the `pdf_print_brady` repository.

* **Reused Components:** Printer discovery, OS-level print command execution (Win32/LPR), and React project structure.
* **New Components:** A `NokiaLabelService` in Python for parsing/PDF generation, and a `BarcodeInput` React component with aggressive key suppression.

## 2. Technical Stack

* **Frontend:** React 18 (Vite) + Lucide Icons.
* **Backend:** Python 3 + Flask (running on `localhost:5001`).
* **PDF Generation:** `reportlab` (Python library for drawing barcodes and text).
* **Printing:** Native OS commands (`powershell` for Windows, `lpr` for Linux/Mac).

---

## 3. Backend Implementation (`/print-server`)

The backend will have a single primary endpoint: `/api/generate-and-print`.

### **3.1 Parsing Logic (The "Dirtying" Process)**

The raw input from the scanner is a continuous alphanumeric string. The backend must parse it and then "dirty" it with invisible control characters.

* **Input Format:** `1P[PartNo]S[SerialNo]Q[Quantity]...`
* *Example:* `1P475773A.102SUK2545A0499Q1`


* **Required Regex Logic:**
* Extract Part Number: `r'1P(.*?)(?=S|Q|$)'`
* Extract Serial Number: `r'S(.*?)(?=Q|1P|$)'`
* Extract Quantity: `r'Q(.*?)(?=S|1P|$)'`



### **3.2 ASCII Injection (ISO-15434 Compliance)**

The output DataMatrix string must follow this exact structure using ASCII control codes:

* **Header:** `[)>` + `{RS}` + `06` + `{GS}`
* **Data:** `1P`... `{GS}` `S`... `{GS}` `Q`...
* **Footer:** `{RS}` + `{EOT}`

**ASCII Reference:**

* `{RS}` (Record Separator) = `chr(30)`
* `{GS}` (Group Separator) = `chr(29)`
* `{EOT}` (End of Transmission) = `chr(4)`

### **3.3 Label Generation (ReportLab)**

Instead of editing an existing PDF, we will generate a new one from scratch.

* **Canvas Size:** Set to match Brady label size (approx 100mm x 35mm).
* **Visual Layout:**
* **Right Side:** Generate the DataMatrix using the *formatted* string (with hidden ASCII chars).
* **Left Side:** Generate human-readable Code128 barcodes for the individual fields (Part No, Serial No, Qty).
* **Text:** Add static text "Nokia Solutions and Networks", "Made in India", etc.



---

## 4. Frontend Implementation (`/frontend`)

The frontend will be a simplified version of the previous dashboard, focused entirely on the scanning workflow.

### **4.1 Scanner Input Handling (CRITICAL)**

Barcode scanners often act as "Keyboards" and can send unwanted keystrokes (like `Alt`, `Shift`, or `Ctrl`) combined with characters, which can trigger browser shortcuts (e.g., `Alt+Left Arrow` triggers "Back", `Ctrl+P` triggers print dialog).

**Requirement:** The frontend must implement a **Global Key Filter** to block these navigation shortcuts while keeping the input field focused.

**Reference Implementation (`BarcodeInput.jsx`):**
Use this exact logic to suppress "Scanner Noise" and prevent page redirects:

```javascript
import { useRef, useEffect, useState } from 'react';

function BarcodeInput({ value, onChange, onLookup, isLoading }) {
    const inputRef = useRef(null);
    const debounceTimerRef = useRef(null);

    useEffect(() => {
        // Auto-focus input on mount and updates
        const focusInput = () => {
            if (inputRef.current && !isLoading) {
                // Prevent scrolling when focusing
                inputRef.current.focus({ preventScroll: true });
            }
        };

        focusInput();

        // Refocus loop for reliable continuous scanning
        const interval = setInterval(() => {
            if (document.activeElement !== inputRef.current && !isLoading) {
                focusInput();
            }
        }, 2000); // Check every 2s if we lost focus

        return () => clearInterval(interval);
    }, [isLoading, value]); 

    // Global Filter for Scanner Noise (prevents redirects/shortcuts)
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            // Block navigation keys commonly sent by scanners
            
            // Block Alt+ArrowLeft (Browser Back) - CRITICAL
            if (e.altKey && (e.keyCode === 37 || e.key === 'ArrowLeft')) {
                console.log('Blocked Alt+ArrowLeft (browser back)');
                e.preventDefault(); e.stopPropagation(); return false;
            }

            // Block Alt+ArrowRight (Browser Forward)
            if (e.altKey && (e.keyCode === 39 || e.key === 'ArrowRight')) {
                e.preventDefault(); e.stopPropagation(); return false;
            }
            
            // Block standalone modifiers often sent by scanners as "noise"
            if (['Shift', 'Alt', 'Control', 'Insert'].includes(e.key)) {
                 // Only block if they are standalone (not part of a valid combo we need)
                 // e.preventDefault(); 
            }
        };

        // Capture phase (true) ensures we catch it before the browser does
        document.addEventListener('keydown', handleGlobalKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleGlobalKeyDown, true);
        };
    }, []);

    // Debounced Auto-Submit logic
    useEffect(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        if (value && value.trim().length >= 5) {
            debounceTimerRef.current = setTimeout(() => {
                onLookup(value);
            }, 500); // 500ms delay to wait for scan to complete
        }
        return () => clearTimeout(debounceTimerRef.current);
    }, [value]);

    return (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <input
                ref={inputRef}
                type="text"
                className="input"
                autoFocus
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={isLoading}
                placeholder="Scan DataMatrix..."
            />
        </div>
    );
}
export default BarcodeInput;

```

### **4.2 Data Flow**

1. **Idle State:** User sees "Ready to Scan". Input is focused.
2. **Scan Action:** Scanner types `1P475...` into the input.
3. **Auto-Submit:** The `useEffect` debounce detects the input has stopped changing (500ms).
4. **API Call:** Frontend POSTs to `/api/generate-and-print`.
5. **Result:**
* **Success:** Flash green message "Printed [PartNo]". Clear input.
* **Error:** Flash red message. **Keep input focused** so user can try again without clicking.



---

## 5. Developer Action Plan

### **Step 1: Backend Setup**

1. Copy the `app.py` and `services.py` logic (provided separately).
2. Install dependencies: `pip install flask flask-cors reportlab pypiwin32`.
3. Ensure `reportlab` is installed for PDF generation.

### **Step 2: Frontend Setup**

1. Create `BarcodeInput.jsx` using the strict key-suppression code above.
2. Update the main App component to use `BarcodeInput`.
3. Ensure the API call sends `{ "raw_input": value, "printer_name": selectedPrinter }`.

### **Step 3: Verification**

1. **Key Blocking Test:** Open the app and manually press `Alt + Left Arrow`. The browser **must not** go back.
2. **Focus Test:** Click outside the input box. Wait 2 seconds. The focus **must return** to the input box automatically.
3. **End-to-End:** Scan a sample barcode. Verify the printer outputs a label with the correct layout.


Here is the updated section to be added to the technical specification. This covers the setup of **GitHub Actions** for automatically deploying the frontend to Cloudflare and building the Windows executable for the backend.

Add this as **Section 6** in your project documentation.

---

## 6. CI/CD & Deployment Automation

To automate the delivery of this application, we will set up two GitHub Action workflows: one for the **Frontend** (Cloudflare Pages) and one for the **Backend** (Windows EXE generation).

### **6.1. Prerequisites (GitHub Secrets)**

Before pushing these files, go to your GitHub Repository → **Settings** → **Secrets and variables** → **Actions** and add:

1. `CLOUDFLARE_API_TOKEN`: Your Cloudflare API Token (with "Edit Cloudflare Pages" permissions).
2. `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID.

### **6.2. Frontend Workflow: Deploy to Cloudflare**

**File Path:** `.github/workflows/deploy-frontend.yml`

This workflow triggers on every push to `main`. It builds the React application and pushes the `dist` folder to Cloudflare Pages.

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Dependencies
        working-directory: ./frontend
        run: npm ci

      - name: Build
        working-directory: ./frontend
        run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          # Project Name updated for this specific Nokia project
          projectName: nokia-label-bridge 
          directory: ./frontend/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}

```

### **6.3. Backend Workflow: Build Windows EXE**

**File Path:** `.github/workflows/build-backend.yml`

This workflow is manual (`workflow_dispatch`). When triggered, it spins up a Windows runner, installs Python & Poppler, compiles the Flask server into a `.exe` using PyInstaller, and creates a **GitHub Release** with the zip file attached.

**Note:** Ensure your backend dependencies are listed in `print-server/requirements.txt` (or update the YAML below to match your filename).

```yaml
name: Build Print Server (Windows EXE)

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-windows:
    name: Build Windows EXE
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Dependencies
        working-directory: ./print-server
        run: |
          # Using requirements.txt as per standard project structure
          pip install -r requirements.txt
          pip install pyinstaller

      - name: Install Poppler (for pdf2image)
        run: |
          # Download poppler for Windows to handle PDF rendering
          $popplerUrl = "https://github.com/oschwartz10612/poppler-windows/releases/download/v24.02.0-0/Release-24.02.0-0.zip"
          Invoke-WebRequest -Uri $popplerUrl -OutFile poppler.zip
          Expand-Archive -Path poppler.zip -DestinationPath C:\poppler
          # Add to PATH for this session
          $env:PATH = "C:\poppler\poppler-24.02.0\Library\bin;" + $env:PATH
          # Verify installation
          pdftoppm -v

      - name: Build EXE (Folder Mode)
        working-directory: ./print-server
        env:
          PATH: C:\poppler\poppler-24.02.0\Library\bin;${{ env.PATH }}
        run: |
          # --onedir creates a folder (less likely to trigger antivirus than --onefile)
          # We bundle Poppler binaries inside the app so users don't need to install it
          pyinstaller --onedir --name NokiaLabelBridge `
            --add-binary "C:\poppler\poppler-24.02.0\Library\bin\*;poppler" `
            app.py

      - name: Create Zip Bundle
        working-directory: ./print-server/dist
        run: |
          Compress-Archive -Path NokiaLabelBridge -DestinationPath NokiaLabelBridge-Windows.zip

      - name: Upload Windows Artifact
        uses: actions/upload-artifact@v4
        with:
          name: NokiaLabelBridge-Windows
          path: ./print-server/dist/NokiaLabelBridge-Windows.zip

  create-release:
    needs: [build-windows]
    runs-on: ubuntu-latest
    
    steps:
      - name: Download Windows Artifact
        uses: actions/download-artifact@v4
        with:
          name: NokiaLabelBridge-Windows
          path: ./artifacts/

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: v${{ github.run_number }}
          name: Release v${{ github.run_number }}
          body: |
            Automated build for Nokia Label Compliance Bridge.
            
            ## Downloads
            
            | File | Description |
            |------|-------------|
            | **NokiaLabelBridge-Windows.zip** | 🪟 **Download This** - Extract and run `NokiaLabelBridge.exe` inside. No Python required. |
            
            ### How to run:
            1. Download and Extract the ZIP.
            2. Open the folder `NokiaLabelBridge`.
            3. Double-click **`NokiaLabelBridge.exe`**.
            4. Keep the window open to ensure the Print Server is active.
          files: |
            ./artifacts/*.zip
          draft: false
          prerelease: false

```