import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'field-portal-qr-reader';

export default function FieldQrScannerModal({ isOpen, onClose, onDetected }) {
    const scannerRef = useRef(null);
    const handledRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setErrorMessage('');
            handledRef.current = false;
            return undefined;
        }

        let active = true;
        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;
        handledRef.current = false;
        setErrorMessage('');

        const startScanner = async () => {
            try {
                await scanner.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 260, height: 260 } },
                    async (decodedText) => {
                        if (handledRef.current) return;
                        handledRef.current = true;

                        try {
                            if (scanner.isScanning) {
                                await scanner.stop();
                            }
                        } catch (error) {
                            console.warn('Field portal scanner stop failed.', error);
                        }

                        try {
                            await scanner.clear();
                        } catch (error) {
                            console.warn('Field portal scanner clear failed.', error);
                        }

                        scannerRef.current = null;

                        if (active) {
                            onDetected(decodedText);
                        }
                    },
                    () => {}
                );
            } catch (error) {
                console.error('Field portal scanner failed to start.', error);
                if (active) {
                    setErrorMessage('Camera access failed. Check browser camera permissions and try again.');
                }
            }
        };

        startScanner();

        return () => {
            active = false;
            const currentScanner = scannerRef.current;
            scannerRef.current = null;

            if (!currentScanner) return;

            const cleanup = async () => {
                try {
                    if (currentScanner.isScanning) {
                        await currentScanner.stop();
                    }
                } catch (error) {
                    console.warn('Field portal scanner cleanup stop failed.', error);
                }

                try {
                    await currentScanner.clear();
                } catch (error) {
                    console.warn('Field portal scanner cleanup clear failed.', error);
                }
            };

            cleanup();
        };
    }, [isOpen, onDetected]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-xl">
            <div className="w-full max-w-xl rounded-[2rem] border border-slate-800 bg-slate-900/95 p-6 shadow-2xl sm:p-8">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">QR Intake</p>
                        <h2 className="text-2xl font-black tracking-tight text-white">Scan PTW, LOTO, or Equipment Tags</h2>
                        <p className="mt-2 text-sm text-slate-400">
                            The app will route the scan to the right live module automatically.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-slate-400 transition-colors hover:border-slate-700 hover:text-white"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div
                    id={SCANNER_ELEMENT_ID}
                    className="mb-4 overflow-hidden rounded-[1.5rem] border border-slate-800 bg-black shadow-inner"
                ></div>

                {errorMessage && (
                    <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {errorMessage}
                    </div>
                )}

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-[11px] leading-relaxed text-slate-400">
                    Authenticated field users can operate scanned records. Public scans stay read-only until the user signs in.
                </div>
            </div>
        </div>
    );
}
