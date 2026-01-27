---
description: How to build the print server executable for Windows locally
---

1. Go to the print-server directory
```bash
cd print-server
```

2. (Optional) Create and activate a virtual environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies
```bash
pip install -r requirements.txt
pip install pyinstaller
```

4. Build the executable using PyInstaller
// turbo
5. Run the following command to build
```bash
pyinstaller --onedir --name BradyPrintBridge app.py
```

6. The executable will be available in the `dist/BradyPrintBridge` folder.
