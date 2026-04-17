import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Printer, CheckCircle, AlertCircle, RefreshCw, Settings, LayoutDashboard, Eye } from 'lucide-react';
import BarcodeInput from './components/BarcodeInput';
import './App.css';

const API_BASE_URL = 'http://localhost:5001';
const SAMPLE_INPUT = '1P475773A.102SUK2545A0499Q14LIN18VLENOK';

const getDefaultLabelSettings = () => ({
  labelWidth: 100,
  labelHeight: 38,
  barcodeWidthModule: 0.3,
  amidMappings: [
    { partNo: '475773A.102', amidCode: 'AMID' },
    { partNo: '477066A.101', amidCode: 'AMXB' }
  ],
  layout: {
    nokiaLogo: { x: -2.3, y: -1.5, w: 24.63, h: 9.87 },
    nokiaText: { x: 28.0, y: 0.1, fontSize: 14 },
    amidText: { x: 77.0, y: 5.9, fontSize: 14 },
    ceMark: { x: 62.0, y: 7.0, w: 10.09, h: 9.83 },
    ukcaMark: { x: 73.0, y: 20.0, w: 10.01, h: 10.0 },
    barcode1: { x: 2.0, y: 6.6, h: 5.0, fontSize: 10, label: '1P' },
    barcode2: { x: 2.0, y: 17.0, h: 5.0, fontSize: 10, label: 'S' },
    barcode3: { x: 2.0, y: 28.0, h: 4.0, fontSize: 10, label: 'Q' },
    dmBarcode: { x: 75.0, y: 12.5, size: 18.0 },
    footer: { x: 85.0, y: 35.0, fontSize: 8 }
  }
});

const normalizeMapValue = (value = '') => value.toUpperCase().replace(/\s+/g, '');

const hydrateLabelSettings = () => {
  const defaults = getDefaultLabelSettings();
  const saved = localStorage.getItem('labelSettings');
  if (!saved) return defaults;

  try {
    const parsed = JSON.parse(saved);
    const mergedLayout = Object.fromEntries(
      Object.entries(defaults.layout).map(([key, defaultLayout]) => [
        key,
        { ...defaultLayout, ...(parsed.layout?.[key] || {}) }
      ])
    );

    return {
      ...defaults,
      ...parsed,
      amidMappings: Array.isArray(parsed.amidMappings)
        ? parsed.amidMappings.map((mapping = {}) => ({
            partNo: normalizeMapValue(mapping.partNo || ''),
            amidCode: normalizeMapValue(mapping.amidCode || '')
          }))
        : defaults.amidMappings,
      layout: mergedLayout
    };
  } catch (error) {
    console.error('Failed to parse saved settings:', error);
    return defaults;
  }
};

function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('dashboard');

  // App State
  const [scanValue, setScanValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState({ type: 'idle', message: 'Ready to scan' });
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    return localStorage.getItem('selectedPrinter') || '';
  });

  // Settings (Persisted in localStorage)
  const [autoPrint, setAutoPrint] = useState(() => {
    return localStorage.getItem('autoPrint') === 'false' ? false : true;
  });
  const [printDelay, setPrintDelay] = useState(() => {
    return parseInt(localStorage.getItem('printDelay')) || 2;
  });

  // Label Settings
  const [labelSettings, setLabelSettings] = useState(hydrateLabelSettings);

  // Preview State
  const [currentLabel, setCurrentLabel] = useState(null);
  const [templateLabel, setTemplateLabel] = useState(null);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem('autoPrint', autoPrint);
    localStorage.setItem('printDelay', printDelay);
    localStorage.setItem('selectedPrinter', selectedPrinter);
    localStorage.setItem('labelSettings', JSON.stringify(labelSettings));
  }, [autoPrint, printDelay, selectedPrinter, labelSettings]);

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

  const updateLayout = (key, entry, val) => {
    setLabelSettings(prev => ({
      ...prev,
      layout: {
        ...prev.layout,
        [key]: {
          ...prev.layout[key],
          [entry]: val
        }
      }
    }));
  };

  const updateAmidMapping = (index, key, value) => {
    setLabelSettings(prev => ({
      ...prev,
      amidMappings: prev.amidMappings.map((mapping, mappingIndex) =>
        mappingIndex === index
          ? { ...mapping, [key]: normalizeMapValue(value) }
          : mapping
      )
    }));
  };

  const addAmidMapping = () => {
    setLabelSettings(prev => ({
      ...prev,
      amidMappings: [...prev.amidMappings, { partNo: '', amidCode: '' }]
    }));
  };

  const removeAmidMapping = (index) => {
    setLabelSettings(prev => ({
      ...prev,
      amidMappings: prev.amidMappings.filter((_, mappingIndex) => mappingIndex !== index)
    }));
  };

  const ControlGroup = ({ title, itemKey, fields }) => (
    <div className="control-group-card">
      <h4 className="control-group-title">{title}</h4>
      <div className="control-fields-grid">
        {fields.map(f => (
          <div className="control-field" key={f.key}>
            <label>{f.label}</label>
            <div className="control-input-box">
              <input
                type="number"
                step={f.step || 0.1}
                value={labelSettings.layout[itemKey][f.key]}
                onChange={(e) => updateLayout(itemKey, f.key, parseFloat(e.target.value) || 0)}
              />
              <span className="unit">{f.unit || 'mm'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`app-container ${status.type}`}>
      <header className="app-header">
        <div className="logo-section">
          <h1>Nokia Label Bridge</h1>
          <span className="version">v2.4</span>
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
            <LayoutDashboard size={18} style={{ marginRight: '8px' }} />
            Dashboard
          </button>
          <button
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} style={{ marginRight: '8px' }} />
            Settings
          </button>
        </nav>

        {activeTab === 'dashboard' ? (
          <div className="dashboard-layout-vertical">
            <div className="top-preview-section">
              <div className="preview-panel-wide">
                <div className="preview-header-wide">
                  <div className="preview-title">
                    <Eye size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    <h3>Label Preview</h3>
                  </div>
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

                <div className="preview-container-wide">
                  {currentLabel || templateLabel ? (
                    <iframe
                      src={`${API_BASE_URL}${(currentLabel || templateLabel).pdf_url}#toolbar=0&navpanes=0&scrollbar=0&zoom=200`}
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
                    <div className="detail-item">
                      <span className="detail-label">AMID Code</span>
                      <span className="detail-value">{(currentLabel || templateLabel).parsed_data.amid_code}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">DataMatrix Out</span>
                      <span className="detail-value">{(currentLabel || templateLabel).parsed_data.datamatrix_debug}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bottom-controls-section">
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
          </div>
        ) : (
          <div className="dashboard-layout-vertical">
            <div className="top-preview-section">
              <div className="preview-panel-wide">
                <div className="preview-header-wide">
                  <div className="preview-title">
                    <Eye size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    <h3>Live Preview</h3>
                  </div>
                </div>
                <div className="preview-container-wide">
                  {templateLabel ? (
                    <iframe
                      src={`${API_BASE_URL}${templateLabel.pdf_url}#toolbar=0&navpanes=0&scrollbar=0&zoom=200`}
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
                <p className="helper-text">Changes are applied immediately to the preview.</p>
              </div>
            </div>

            <div className="bottom-controls-section">
              <div className="settings-scroll-area">
                <div className="settings-section">
                  <h2>System Settings</h2>
                  <div className="setting-grid">
                    <div className="setting-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={autoPrint}
                          onChange={(e) => setAutoPrint(e.target.checked)}
                        />
                        Enable Auto-Printing
                      </label>
                    </div>
                    <div className="setting-group">
                      <label>Printing Delay (s)</label>
                      <input
                        type="number" min="0" max="10"
                        className="setting-input"
                        value={printDelay}
                        onChange={(e) => setPrintDelay(parseInt(e.target.value) || 0)}
                        disabled={!autoPrint}
                      />
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h2>Layout Controls</h2>

                  <div className="mapping-settings-card">
                    <div className="mapping-settings-header">
                      <div>
                        <h3>Part Number To AMID Mapping</h3>
                        <p>Set AMID label value by exact part number match.</p>
                      </div>
                      <button className="add-mapping-btn" onClick={addAmidMapping}>
                        Add Mapping
                      </button>
                    </div>

                    <div className="mapping-list">
                      {labelSettings.amidMappings.length === 0 ? (
                        <div className="mapping-empty-state">
                          No mapping rows. Default value will be <code>AMID</code>.
                        </div>
                      ) : (
                        labelSettings.amidMappings.map((mapping, index) => (
                          <div className="mapping-row" key={`${mapping.partNo || 'part'}-${index}`}>
                            <div className="mapping-field">
                              <label>Part Number</label>
                              <input
                                type="text"
                                value={mapping.partNo}
                                placeholder="475773A.102"
                                onChange={(e) => updateAmidMapping(index, 'partNo', e.target.value)}
                              />
                            </div>
                            <div className="mapping-arrow">→</div>
                            <div className="mapping-field">
                              <label>AMID Value</label>
                              <input
                                type="text"
                                value={mapping.amidCode}
                                placeholder="AMXB"
                                onChange={(e) => updateAmidMapping(index, 'amidCode', e.target.value)}
                              />
                            </div>
                            <button
                              className="remove-mapping-btn"
                              onClick={() => removeAmidMapping(index)}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="layout-controls-grid">
                    <ControlGroup title="Nokia Logo" itemKey="nokiaLogo" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'w', label: 'Width' },
                      { key: 'h', label: 'Height' }
                    ]} />

                    <ControlGroup title="CE Mark" itemKey="ceMark" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'w', label: 'Width' },
                      { key: 'h', label: 'Height' }
                    ]} />

                    <ControlGroup title="UKCA Mark" itemKey="ukcaMark" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'w', label: 'Width' },
                      { key: 'h', label: 'Height' }
                    ]} />

                    <ControlGroup title="Nokia Header Text" itemKey="nokiaText" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'fontSize', label: 'Font Size', unit: 'pt' }
                    ]} />

                    <ControlGroup title="AMID Label" itemKey="amidText" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'fontSize', label: 'Font Size', unit: 'pt' }
                    ]} />

                    <ControlGroup title="Barcode (1P)" itemKey="barcode1" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'h', label: 'Height' },
                      { key: 'fontSize', label: 'Font Size', unit: 'pt' }
                    ]} />

                    <ControlGroup title="Barcode (S)" itemKey="barcode2" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'h', label: 'Height' },
                      { key: 'fontSize', label: 'Font Size', unit: 'pt' }
                    ]} />

                    <ControlGroup title="Barcode (Q)" itemKey="barcode3" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'h', label: 'Height' },
                      { key: 'fontSize', label: 'Font Size', unit: 'pt' }
                    ]} />

                    <ControlGroup title="DataMatrix" itemKey="dmBarcode" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'size', label: 'Size' }
                    ]} />

                    <ControlGroup title="Footer Text" itemKey="footer" fields={[
                      { key: 'x', label: 'Pos X' },
                      { key: 'y', label: 'Pos Y' },
                      { key: 'fontSize', label: 'Font Size', unit: 'pt' }
                    ]} />
                  </div>

                  <div className="global-controls">
                    <div className="setting-item">
                      <label>Label Width (mm)</label>
                      <input type="number" value={labelSettings.labelWidth} onChange={(e) => setLabelSettings({ ...labelSettings, labelWidth: parseInt(e.target.value) || 100 })} />
                    </div>
                    <div className="setting-item">
                      <label>Label Height (mm)</label>
                      <input type="number" value={labelSettings.labelHeight} onChange={(e) => setLabelSettings({ ...labelSettings, labelHeight: parseInt(e.target.value) || 38 })} />
                    </div>
                    <div className="setting-item">
                      <label>Barcode Module Width</label>
                      <input type="number" step="0.01" value={labelSettings.barcodeWidthModule} onChange={(e) => setLabelSettings({ ...labelSettings, barcodeWidthModule: parseFloat(e.target.value) || 0.3 })} />
                    </div>
                    <button className="reset-btn" onClick={() => {
                      localStorage.removeItem('labelSettings');
                      window.location.reload();
                    }}>Reset to Factory Defaults</button>
                  </div>
                </div>
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
