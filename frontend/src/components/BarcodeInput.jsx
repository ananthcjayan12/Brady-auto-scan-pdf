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
        <div className="barcode-input-container">
            <input
                ref={inputRef}
                type="text"
                className="scanner-input"
                autoFocus
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={isLoading}
                placeholder="Scan DataMatrix..."
                autoComplete="off"
            />
            {isLoading && <div className="loader">Processing scan...</div>}
        </div>
    );
}
export default BarcodeInput;
