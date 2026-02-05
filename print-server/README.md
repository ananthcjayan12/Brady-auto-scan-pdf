# Brady Print Server - Development Guide

This directory contains the Brady Print Server backend application.

## 🚀 Quick Start (Windows)

### Option 1: Using the Batch File (Easiest)

1. **Double-click `run-server.bat`**
2. First run will automatically:
   - Create a virtual environment
   - Install all dependencies
   - Start the server
3. Server will be available at `http://localhost:5001`

### Option 2: Manual Setup

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
```

## 📦 Building Releases

### Build Development Package

This creates a portable package with source code and setup scripts:

1. Go to GitHub Actions
2. Run workflow: **Build Dev Package**
3. Download `BradyPrintServer-Dev.zip` from the release

### Build Production Executable

This creates a standalone `.exe` file:

1. Go to GitHub Actions
2. Run workflow: **Build Print Server**
3. Download `BradyPrintBridge-Windows.zip` from the release

Or build locally:

```bash
# Install PyInstaller
pip install pyinstaller

# Build executable
pyinstaller --onedir --name BradyPrintBridge --collect-submodules reportlab app.py

# Output will be in dist/BradyPrintBridge/
```

## 📁 Project Structure

```
print-server/
├── app.py              # Flask application and API endpoints
├── services.py         # Label generation and printing logic
├── requirements.txt    # Python dependencies
├── run-server.bat      # Windows launcher script
├── temp_labels/        # Generated PDF labels (auto-created)
└── venv/              # Virtual environment (auto-created)
```

## 🔧 Making Changes

1. Edit `app.py` or `services.py`
2. Stop the server (Ctrl+C)
3. Run `run-server.bat` again to test

## 🐛 Testing the Print Fix

The recent fix changed the printing method to avoid the "Access is denied" error:

**Old Method**: Direct device context manipulation (required admin privileges)  
**New Method**: `win32ui.CreateDC()` with GDI printing (no admin required)

To test:
1. Run the server
2. Try printing a label through the API
3. Check logs for: `INFO:services:Print job sent successfully to [printer name]`

**Note**: On Mac/Linux, the "print" function will open the PDF in the default viewer for testing purposes. Production Windows systems will use actual GDI printing.

## 📡 API Endpoints

- `GET /health` - Health check
- `GET /api/printers` - List available printers
- `POST /api/generate-label` - Generate a label PDF
  ```json
  {
    "raw_input": "[)>RS06GS1P...GS...RSEOT",
    "label_settings": { ... }
  }
  ```
- `POST /api/print-label` - Print a generated label
  ```json
  {
    "pdf_url": "/api/label/label_xxx.pdf",
    "printer_name": "Brady Printer"
  }
  ```
- `POST /api/generate-and-print` - Generate and print in one step
  ```json
  {
    "raw_input": "[)>RS06GS1P...GS...RSEOT",
    "printer_name": "Brady Printer",
    "label_settings": { ... }
  }
  ```

## 🔍 Troubleshooting

### "Access is denied" error when printing
- **Fixed!** The new code uses `ShellExecute` which doesn't require admin privileges
- Make sure the printer is properly installed and configured in Windows

### Port 5001 already in use
- Change the port in `app.py` (last line): `app.run(host='0.0.0.0', port=5002, debug=True)`

### Dependencies won't install
- Make sure you have internet connection
- Try: `pip install --upgrade pip` first
- On Windows, `pywin32` requires Visual C++ redistributables

### Virtual environment issues
- Delete the `venv` folder
- Run `run-server.bat` again (it will recreate everything)

## 📝 Dependencies

- **Flask** - Web framework for the API server
- **Flask-CORS** - Cross-origin resource sharing support
- **ReportLab** - PDF generation and barcode creation
- **PyMuPDF (fitz)** - PDF to image conversion for printing
- **Pillow** - Image processing and manipulation
- **pywin32** - Windows API access for GDI printing (Windows only)
  - Includes: `win32print`, `win32ui`, `win32con`, `PIL.ImageWin`
  - Required for direct printer access without admin privileges

### Why These Dependencies?

The printing system works by:
1. **ReportLab** creates Nokia labels with barcodes and DataMatrix
2. **PyMuPDF** converts the PDF to a high-quality image (300 DPI)
3. **Pillow** processes and scales the image
4. **pywin32** sends the image directly to the printer using Windows GDI

This approach avoids needing admin privileges and works with all printer types.

## 🔐 Security Notes

- This server runs on `0.0.0.0:5001` (accessible from network)
- CORS is enabled for all origins (development mode)
- For production, consider:
  - Restricting CORS origins
  - Adding authentication
  - Using HTTPS
  - Running behind a reverse proxy

## 📚 Related Documentation

- [Flask Documentation](https://flask.palletsprojects.com/)
- [ReportLab User Guide](https://www.reportlab.com/docs/reportlab-userguide.pdf)
- [pywin32 Documentation](https://github.com/mhammond/pywin32)
