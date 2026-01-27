import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Printer, CheckCircle, AlertCircle, RefreshCw, Settings, LayoutDashboard, Eye } from 'lucide-react';
import BarcodeInput from './components/BarcodeInput';
import './App.css';

const API_BASE_URL = 'http://localhost:5001';
const SAMPLE_INPUT = '1PABC12345678GS99SXYZ789012345678GSQ10';

function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // App State
  const [scanValue, setScanValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState({ type: 'idle', message: 'Ready to scan' });
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  
  // Settings (Persisted in localStorage)
  const [autoPrint, setAutoPrint] = useState(() => {
    return localStorage.getItem('autoPrint') === 'false' ? false : true;
  });
  const [printDelay, setPrintDelay] = useState(() => {
    return parseInt(localStorage.getItem('printDelay')) || 2;
  });

  // Label Settings
  const [labelSettings, setLabelSettings] = useState(() => {
    const saved = localStorage.getItem('labelSettings');
    return saved ? JSON.parse(saved) : {
      labelWidth: 100,
      labelHeight: 35,
      barcodeWidthModule: 0.2,
      barcodeHeight: 5,
      fontSize: 6,
      dmSize: 18,
      verticalSpacing: 9
    };
  });

  // Preview State
  const [currentLabel, setCurrentLabel] = useState(null);
  const [templateLabel, setTemplateLabel] = useState(null);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem('autoPrint', autoPrint);
    localStorage.setItem('printDelay', printDelay);
    localStorage.setItem('labelSettings', JSON.stringify(labelSettings));
  }, [autoPrint, printDelay, labelSettings]);

  // Fetch available printers on mount
  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/printers`);
        setPrinters(response.data.printers || []);
        setSelectedPrinter(response.data.default || '');
      } catch (error) {
        console.error('Failed to fetch printers:', error);
        setStatus({ type: 'error', message: 'Backend unreachable. Check server.' });
      }
    };
    fetchPrinters();
  }, []);

  // Update template label when settings change
  useEffect(() => {
    const timer = setTimeout(() => {
      updateTemplate();
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [labelSettings]);

  const updateTemplate = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/generate-label`, {
        raw_input: SAMPLE_INPUT,
        label_settings: labelSettings
      });
      if (response.data.success) {
        setTemplateLabel(response.data);
      }
    } catch (error) {
      console.error('Failed to update template:', error);
    }
  };

  const handlePrint = async (labelData) => {
    const labelToPrint = labelData || currentLabel;
    if (!labelToPrint || !labelToPrint.pdf_url) return;

    setIsLoading(true);
    setStatus({ type: 'loading', message: `Printing label...` });

    try {
      const response = await axios.post(`${API_BASE_URL}/api/print-label`, {
        pdf_url: labelToPrint.pdf_url,
        printer_name: selectedPrinter
      });

      if (response.data.success) {
        setStatus({ 
          type: 'success', 
          message: `Printed label for ${labelToPrint.parsed_data.part_no}` 
        });
      } else {
        setStatus({ type: 'error', message: response.data.error || 'Failed to print' });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      setStatus({ type: 'error', message: `Print Error: ${errorMsg}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLookup = async (value) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setStatus({ type: 'loading', message: `Generating label: ${value}` });
    setCurrentLabel(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/generate-label`, {
        raw_input: value,
        label_settings: labelSettings
      });

      if (response.data.success) {
        setCurrentLabel(response.data);
        setStatus({ type: 'idle', message: 'Label generated. Review preview.' });
        setScanValue(''); // Clear input

        if (autoPrint) {
          setStatus({ type: 'loading', message: `Waiting ${printDelay}s before auto-printing...` });
          setTimeout(() => {
            handlePrint(response.data);
          }, printDelay * 1000);
        }
      } else {
        setStatus({ type: 'error', message: response.data.error || 'Failed to generate label' });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      setStatus({ type: 'error', message: `Error: ${errorMsg}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`app-container ${status.type}`}>
      <header className="app-header">
        <div className="logo-section">
          <h1>Nokia Label Bridge</h1>
          <span className="version">v2.1</span>
        </div>
        
        <div className="printer-selector">
          <Printer size={18} />
          <select 
            value={selectedPrinter} 
            onChange={(e) => setSelectedPrinter(e.target.value)}
            disabled={isLoading}
          >
            {printers.length === 0 && <option>No printers found</option>}
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </header>

      <main className="app-main">
        <nav className="tab-nav">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} style={{marginRight: '8px'}} />
            Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} style={{marginRight: '8px'}} />
            Settings
          </button>
        </nav>

        {activeTab === 'dashboard' ? (
          <div className="dashboard-layout">
            <div className="left-panel">
              <div className="status-banner">
                {status.type === 'success' && <CheckCircle className="icon" />}
                {status.type === 'error' && <AlertCircle className="icon" />}
                {status.type === 'loading' && <RefreshCw className="icon spinning" />}
                <p>{status.message}</p>
              </div>

              <BarcodeInput 
                value={scanValue}
                onChange={setScanValue}
                onLookup={handleLookup}
                isLoading={isLoading}
              />

              <div className="instructions">
                <h3>Operator Instructions</h3>
                <ul>
                  <li>Ensure Brady printer is powered on and connected.</li>
                  <li>Scan the DataMatrix on the product label.</li>
                  <li>{autoPrint ? `System will wait ${printDelay}s then print.` : 'Review the preview then click Print.'}</li>
                  <li>If browser navigation occurs, check scanner configuration.</li>
                </ul>
              </div>
            </div>

            <div className="right-panel">
              <div className="preview-panel">
                <div className="preview-header">
                  <h3><Eye size={18} style={{verticalAlign: 'middle', marginRight: '8px'}} /> Label Preview</h3>
                  {currentLabel && (
                    <button 
                      className="print-btn" 
                      onClick={() => handlePrint()}
                      disabled={isLoading}
                    >
                      <Printer size={16} /> Print Now
                    </button>
                  )}
                </div>
                
                <div className="preview-container">
                  {currentLabel || templateLabel ? (
                    <iframe 
                      src={`${API_BASE_URL}${(currentLabel || templateLabel).pdf_url}#toolbar=0&navpanes=0&scrollbar=0`} 
                      className="preview-frame"
                      key={(currentLabel || templateLabel).pdf_url}
                      title="Label Preview"
                    />
                  ) : (
                    <div className="preview-placeholder">
                      <RefreshCw className="icon spinning" />
                      <p>Loading preview...</p>
                    </div>
                  )}
                </div>

                {(currentLabel || templateLabel) && (
                  <div className="parsed-details">
                    <div className="detail-item">
                      <span className="detail-label">Part Number</span>
                      <span className="detail-value">{(currentLabel || templateLabel).parsed_data.part_no}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Serial Number</span>
                      <span className="detail-value">{(currentLabel || templateLabel).parsed_data.serial_no}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Quantity</span>
                      <span className="detail-value">{(currentLabel || templateLabel).parsed_data.qty}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard-layout">
            <div className="settings-container left-panel">
              <div className="settings-left">
                <h2>System Settings</h2>
                
                <div className="setting-group">
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={autoPrint} 
                      onChange={(e) => setAutoPrint(e.target.checked)} 
                    />
                    Enable Auto-Printing
                  </label>
                  <p className="version">Automatically send to printer after scanning.</p>
                </div>

                <div className="setting-group">
                  <label>Printing Delay (seconds)</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="10" 
                    className="setting-input"
                    value={printDelay}
                    onChange={(e) => setPrintDelay(parseInt(e.target.value) || 0)}
                    disabled={!autoPrint}
                  />
                  <p className="version">Wait time before auto-print starts (0-10 seconds).</p>
                </div>

                <div className="setting-group">
                  <label>Default Printer</label>
                  <select 
                    className="setting-input"
                    value={selectedPrinter} 
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                  >
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <hr className="settings-divider" />
                
                <div className="label-settings-grid">
                  <h3>Label Layout Settings</h3>
                  
                  <div className="setting-item">
                    <label>Label Width (mm)</label>
                    <div className="slider-box">
                      <input 
                        type="range" min="50" max="150" step="1"
                        value={labelSettings.labelWidth}
                        onChange={(e) => setLabelSettings({...labelSettings, labelWidth: parseInt(e.target.value)})}
                      />
                      <span className="setting-val">{labelSettings.labelWidth}mm</span>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>Label Height (mm)</label>
                    <div className="slider-box">
                      <input 
                        type="range" min="20" max="80" step="1"
                        value={labelSettings.labelHeight}
                        onChange={(e) => setLabelSettings({...labelSettings, labelHeight: parseInt(e.target.value)})}
                      />
                      <span className="setting-val">{labelSettings.labelHeight}mm</span>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>Barcode Module Width</label>
                    <div className="slider-box">
                      <input 
                        type="range" min="0.1" max="0.4" step="0.01"
                        value={labelSettings.barcodeWidthModule}
                        onChange={(e) => setLabelSettings({...labelSettings, barcodeWidthModule: parseFloat(e.target.value)})}
                      />
                      <span className="setting-val">{labelSettings.barcodeWidthModule}mm</span>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>Barcode Height</label>
                    <div className="slider-box">
                      <input 
                        type="range" min="2" max="10" step="0.5"
                        value={labelSettings.barcodeHeight}
                        onChange={(e) => setLabelSettings({...labelSettings, barcodeHeight: parseFloat(e.target.value)})}
                      />
                      <span className="setting-val">{labelSettings.barcodeHeight}mm</span>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>Font Size (pt)</label>
                    <div className="slider-box">
                      <input 
                        type="range" min="4" max="12" step="0.5"
                        value={labelSettings.fontSize}
                        onChange={(e) => setLabelSettings({...labelSettings, fontSize: parseFloat(e.target.value)})}
                      />
                      <span className="setting-val">{labelSettings.fontSize}pt</span>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>DataMatrix Size</label>
                    <div className="slider-box">
                      <input 
                        type="range" min="10" max="30" step="1"
                        value={labelSettings.dmSize}
                        onChange={(e) => setLabelSettings({...labelSettings, dmSize: parseInt(e.target.value)})}
                      />
                      <span className="setting-val">{labelSettings.dmSize}mm</span>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>Vertical Spacing</label>
                    <div className="slider-box">
                      <input 
                        type="range" min="4" max="15" step="0.5"
                        value={labelSettings.verticalSpacing}
                        onChange={(e) => setLabelSettings({...labelSettings, verticalSpacing: parseFloat(e.target.value)})}
                      />
                      <span className="setting-val">{labelSettings.verticalSpacing}mm</span>
                    </div>
                  </div>

                  <div style={{marginTop: '20px'}}>
                    <button 
                      className="reset-btn"
                      onClick={() => setLabelSettings({
                        labelWidth: 100,
                        labelHeight: 35,
                        barcodeWidthModule: 0.2,
                        barcodeHeight: 5,
                        fontSize: 6,
                        dmSize: 18,
                        verticalSpacing: 9
                      })}
                    >
                      Reset to Defaults
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="right-panel">
              <div className="preview-panel">
                <div className="preview-header">
                  <h3>Live Preview</h3>
                </div>
                <div className="preview-container" style={{background: 'white', border: '1px solid var(--border)'}}>
                  {templateLabel ? (
                    <iframe 
                      src={`${API_BASE_URL}${templateLabel.pdf_url}#toolbar=0&navpanes=0&scrollbar=0`} 
                      className="preview-frame"
                      key={templateLabel.pdf_url}
                      title="Settings Preview"
                    />
                  ) : (
                    <div className="preview-placeholder">
                      <RefreshCw className="icon spinning" />
                      <p>Updating preview...</p>
                    </div>
                  )}
                </div>
                <p className="version" style={{marginTop: '1rem', textAlign: 'center'}}>
                  This preview shows how a sample label will look with the current settings.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Nokia Solutions and Networks - Scan-to-Print Station</p>
      </footer>
    </div>
  );
}

export default App;
