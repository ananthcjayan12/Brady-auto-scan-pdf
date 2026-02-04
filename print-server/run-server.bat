@echo off
echo ========================================
echo Brady Print Server - Development Mode
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH!
    echo Please install Python 3.8 or higher from https://www.python.org/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

echo [1/3] Checking Python installation...
python --version
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo [2/3] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment!
        pause
        exit /b 1
    )
    echo Virtual environment created successfully.
    echo.
    
    echo [3/3] Installing dependencies...
    call venv\Scripts\activate.bat
    pip install --upgrade pip
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
    echo Dependencies installed successfully.
    echo.
) else (
    echo [2/3] Virtual environment already exists.
    echo [3/3] Activating virtual environment...
    call venv\Scripts\activate.bat
    echo.
)

echo ========================================
echo Starting Brady Print Server...
echo ========================================
echo Server will be available at: http://localhost:5001
echo Press Ctrl+C to stop the server
echo.

REM Run the Flask app
python app.py

REM If the server stops, pause so user can see any errors
if errorlevel 1 (
    echo.
    echo ========================================
    echo Server stopped with errors!
    echo ========================================
    pause
)
