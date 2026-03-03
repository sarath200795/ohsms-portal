import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';
import QRious from 'qrious';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // FIXED: Explicit import for safety
import { Html5Qrcode } from 'html5-qrcode';

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const ENERGY_CONFIG = {
    "Electrical": { code: "E", bg: [185, 28, 28], css: 'bg-red-600' },
    "Mechanical": { code: "M", bg: [30, 64, 175], css: 'bg-blue-700' },
    "Pneumatic": { code: "PN", bg: [8, 145, 178], css: 'bg-cyan-600' },
    "Hydraulic": { code: "H", bg: [194, 65, 12], css: 'bg-orange-700' },
    "Chemical": { code: "C", bg: [21, 128, 61], css: 'bg-green-700' },
    "Gas": { code: "G", bg: [71, 85, 105], css: 'bg-slate-600' },
    "Thermal": { code: "T", bg: [234, 88, 12], css: 'bg-orange-600' },
    "Gravity": { code: "GR", bg: [126, 34, 206], css: 'bg-purple-700' },
    "Water/Steam": { code: "W", bg: [37, 99, 235], css: 'bg-blue-600' },
    "Radiation": { code: "R", bg: [251, 191, 36], css: 'bg-amber-500' },
    "Magnetic": { code: "MG", bg: [100, 116, 139], css: 'bg-slate-500' }
};

const HARDWARE_OPTIONS = ["Safety Padlock", "Lockout Hasp", "Breaker Lock", "Ball Valve Lock", "Gate Valve Lock", "Plug Cover", "Cable Lockout", "Pneumatic Lock", "Flange Blind", "Chain/Cable"];
const RISK_OPTIONS = ["⚡ Arc Flash", "💥 Pressure", "🔥 High Temp", "☣️ Chemical", "🏗️ Gravity", "☢️ Radiation"];

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const safeArrayParse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data !== 'object') return [];
    return Object.keys(data).map(key => ({ firebaseKey: key, ...data[key] }));
};

export default function Loto() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sites, setSites] = useState([]);

    const [procedures, setProcedures] = useState([]);
    const [logs, setLogs] = useState([]);

    // Core Routing
    const [currentView, setCurrentView] = useState('dashboard');

    // Security & Filtering
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });
    const [siteFilter, setSiteFilter] = useState('All');

    // Scanner State
    const [isScanning, setIsScanning] = useState(false);

    // Builder State
    const [procForm, setProcForm] = useState(null);

    // Execution State
    const [executionProc, setExecutionProc] = useState(null);

    useEffect(() => {
        try {
            const s = sessionStorage.getItem('isoSession');
            if (!s) { navigate('/'); return; }
            const sess = JSON.parse(s);

            const cleanRole = String(sess.role || '').trim();

            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(cleanRole);
            const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(cleanRole);

            const hasModuleAccess = isGlobalAdmin || isSiteAdmin || (sess.accessibleModules || []).some(m => {
                const lowerM = String(m).toLowerCase();
                return lowerM.includes('loto') || lowerM.includes('lockout');
            });

            if (!hasModuleAccess) {
                alert("Security Alert: You do not have permission to access the LOTO module.");
                navigate('/dashboard');
                return;
            }

            setSession(sess);

            const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(cleanRole);
            const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(cleanRole);

            setPermissions({
                viewOnly: !canEditCr,
                canDelete: canDel,
                canEditCreate: canEditCr
            });

            const params = new URLSearchParams(location.search);
            let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
            const execId = params.get('execute');

            if (!isGlobalAdmin && ctxSite === 'All') {
                ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
            }

            setSiteFilter(ctxSite);
            sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);

            const loadData = async () => {
                try {
                    const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                    const snap = await get(dbRef);

                    if (snap.exists()) {
                        const data = snap.val();
                        if (data.sites) {
                            setSites(Object.keys(data.sites).map(key => {
                                const sVal = data.sites[key];
                                return typeof sVal === 'object' ? { code: sVal.code || key, name: sVal.name || sVal.code || key } : { code: sVal, name: sVal };
                            }));
                        }
                        if (data.lotoProcedures) {
                            setProcedures(safeArrayParse(data.lotoProcedures));
                        }
                        if (data.lotoLogs) {
                            setLogs(safeArrayParse(data.lotoLogs));
                        }
                    }

                    if (execId) {
                        setCurrentView('execute');
                    }
                } catch (e) { console.error("Data Load Error:", e); }
                setLoading(false);
            };

            loadData();
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    }, [navigate, location]);

    const role = session?.role?.trim() || 'User';
    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set([session.assignedSite, ...(session.accessibleSites || [])].filter(Boolean));
        if (!isGlobalUser) {
            codes.delete('GLOBAL');
            codes.delete('All');
        }
        return codes;
    }, [session, isGlobalUser]);

    const allowedSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const handleSiteFilterChange = (e) => {
        const val = e.target.value;
        setSiteFilter(val);
        sessionStorage.setItem('isoCurrentSite', val === 'All' ? 'GLOBAL' : val);
    };

    const canViewRecord = (siteId) => isGlobalUser || siteId === 'Global' || siteId === 'GLOBAL' || allowedSiteCodes.has(siteId);

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!procForm?.facility) return true;
        return allowedSiteCodes.has(procForm.facility);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, procForm?.facility]);

    useEffect(() => {
        let html5QrcodeScanner = null;
        if (isScanning) {
            html5QrcodeScanner = new Html5Qrcode("reader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };

            html5QrcodeScanner.start({ facingMode: "environment" }, config, (decodedText) => {
                html5QrcodeScanner.stop().then(() => {
                    setIsScanning(false);
                    let targetId = decodedText;
                    try {
                        const url = new URL(decodedText);
                        targetId = url.searchParams.get('execute') || decodedText;
                    } catch (e) { }

                    const proc = procedures.find(p => p.firebaseKey === targetId || p.id === targetId);
                    if (proc) {
                        setExecutionProc(proc);
                        setCurrentView('execute');
                    } else {
                        alert("Procedure not found in database.");
                    }
                }).catch(e => console.error("Scanner stop error", e));
            }, (err) => {
            }).catch(err => {
                alert("Camera access error: " + err);
                setIsScanning(false);
            });
        }
        return () => {
            if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
                html5QrcodeScanner.stop().catch(console.error);
            }
        };
    }, [isScanning, procedures]);

    const filteredProcedures = useMemo(() => {
        return procedures.filter(p => {
            if (!canViewRecord(p.facility)) return false;
            if (siteFilter !== 'All' && p.facility !== siteFilter) return false;
            return true;
        });
    }, [procedures, siteFilter, canViewRecord]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const proc = procedures.find(p => p.firebaseKey === log.procId);
            if (!proc) return false;
            if (!canViewRecord(proc.facility)) return false;
            if (siteFilter !== 'All' && proc.facility !== siteFilter) return false;
            return true;
        });
    }, [logs, procedures, siteFilter, canViewRecord]);

    const liveStatusMap = useMemo(() => {
        const map = {};
        const sortedLogs = [...filteredLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        sortedLogs.forEach(log => {
            if (!map[log.procId]) map[log.procId] = new Set();
            if (log.action === 'LOCK APPLIED') map[log.procId].add(log.stepTag);
            else if (log.action === 'LOCK REMOVED') map[log.procId].delete(log.stepTag);
        });
        return map;
    }, [filteredLogs]);

    const startNewProcedure = () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to create LOTO procedures.");
        setProcForm({
            id: `SITE_LOC_EQUIP`,
            firebaseKey: '',
            facility: (!isGlobalUser && allowedSites.length === 1) ? allowedSites[0].code : (siteFilter !== 'All' ? siteFilter : ''),
            location: '', description: '',
            date: new Date().toISOString().split('T')[0], status: 'Draft', author: session.user || session.name || session.email,
            steps: [{ id: Date.now(), type: '', tag: '', devices: [], risks: [], isolate: '', verify: '', image: null }]
        });
        setCurrentView('builder');
    };

    const generateTags = (steps) => {
        const counts = {};
        return steps.map(s => {
            if (!s.type) return { ...s, tag: '' };
            const code = ENERGY_CONFIG[s.type].code;
            counts[code] = (counts[code] || 0) + 1;
            return { ...s, tag: `${code}-${counts[code]}` };
        });
    };

    // FIXED ID GENERATOR: Generates Site_Location_Equipment format safely
    const updateProcField = (field, val) => {
        if (!canEditForm) return;
        setProcForm(prev => {
            const next = { ...prev, [field]: val };
            if (field === 'facility' || field === 'location' || field === 'description') {
                const f = (next.facility || 'SITE').trim().replace(/[\s/]/g, '_').toUpperCase();
                const l = (next.location || 'LOC').trim().replace(/[\s/]/g, '_').toUpperCase();
                const d = (next.description || 'EQUIP').trim().replace(/[\s/]/g, '_').toUpperCase();
                next.id = `${f}_${l}_${d}`;
            }
            return next;
        });
    };

    const addStep = () => {
        if (!canEditForm) return;
        setProcForm(prev => {
            const newSteps = [...prev.steps, { id: Date.now(), type: '', tag: '', devices: [], risks: [], isolate: '', verify: '', image: null }];
            return { ...prev, steps: generateTags(newSteps) };
        });
    };

    const updateStep = (idx, field, val) => {
        if (!canEditForm) return;
        setProcForm(prev => {
            const newSteps = [...prev.steps];
            newSteps[idx][field] = val;
            return { ...prev, steps: field === 'type' ? generateTags(newSteps) : newSteps };
        });
    };

    const removeStep = (idx) => {
        if (!canEditForm) return;
        setProcForm(prev => {
            const newSteps = prev.steps.filter((_, i) => i !== idx);
            return { ...prev, steps: generateTags(newSteps) };
        });
    };

    const toggleChip = (idx, listName, item) => {
        if (!canEditForm) return;
        setProcForm(prev => {
            const newSteps = [...prev.steps];
            const updatedStep = { ...newSteps[idx] };

            const list = updatedStep[listName] || [];
            if (list.includes(item)) {
                updatedStep[listName] = list.filter(i => i !== item);
            } else {
                updatedStep[listName] = [...list, item];
            }

            newSteps[idx] = updatedStep;
            return { ...prev, steps: newSteps };
        });
    };

    const handleImageUpload = async (idx, file) => {
        if (!canEditForm) return;
        if (file) {
            const b64 = await fileToBase64(file);
            updateStep(idx, 'image', b64);
        }
    };

    const saveProcedure = async () => {
        if (!canEditForm) return alert("Security Error: You do not have permission to edit records for this site.");
        if (!procForm.facility || !procForm.description) return alert("Facility and Description required.");
        if (procForm.steps.length === 0) return alert("At least one isolation step required.");

        try {
            const payload = { ...procForm, lastUpdated: new Date().toISOString() };
            if (procForm.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/lotoProcedures/${procForm.firebaseKey}`), payload);
                setProcedures(procedures.map(p => p.firebaseKey === procForm.firebaseKey ? payload : p));
            } else {
                const newRef = push(ref(rtdb, `organizations/${session.orgId}/lotoProcedures`));
                await update(newRef, payload);
                payload.firebaseKey = newRef.key;
                setProcedures([payload, ...procedures]);
            }
            alert(`Procedure ${procForm.status === 'Draft' ? 'Draft Saved' : 'Updated'}.`);
            setCurrentView('inventory');
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const approveProcedure = async (proc) => {
        if (!['Global Owner', 'Owner', 'Site Owner', 'Site Manager', 'Global Manager'].includes(session.role)) {
            return alert("Security Error: Only verified Managers or Owners can approve LOTO procedures for deployment.");
        }

        if (!window.confirm(`Approve ${proc.id} for field use?`)) return;
        try {
            const payload = { ...proc, status: 'Approved', approvedBy: session.name || session.user, date: new Date().toISOString().split('T')[0] };
            await update(ref(rtdb, `organizations/${session.orgId}/lotoProcedures/${proc.firebaseKey}`), payload);
            setProcedures(procedures.map(p => p.firebaseKey === proc.firebaseKey ? payload : p));
        } catch (e) { alert("Approval failed."); }
    };

    // ==========================================
    // LOGIC: PDF EXPORT (BULLETPROOF FIX)
    // ==========================================
    const generatePDF = (proc, tagsOnly = false) => {
        try {
            const doc = new jsPDF('p', 'mm', 'a4');

            let qrData = null;
            try {
                if (typeof QRious !== 'undefined') {
                    const scanUrl = proc.firebaseKey ? `${window.location.origin}${window.location.pathname}?execute=${proc.firebaseKey}` : 'UNSAVED_DRAFT';
                    qrData = new QRious({ value: scanUrl, size: 250 }).toDataURL();
                }
            } catch (e) { console.warn("QR code skipped.", e); }

            const lockCounts = {};
            const energyCounts = {};

            (proc.steps || []).forEach(s => {
                if (s.type) energyCounts[s.type] = (energyCounts[s.type] || 0) + 1;
                (s.devices || []).forEach(l => lockCounts[l] = (lockCounts[l] || 0) + 1);
            });

            if (tagsOnly) {
                renderTagsPage(doc, proc, qrData);
                doc.save(`${String(proc.id || 'PROCEDURE')}_TAGS.pdf`);
                return;
            }

            // Header
            doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 40, 'F');
            doc.setTextColor(255); doc.setFontSize(22); doc.setFont("helvetica", "bold");
            doc.text("LOTO POSTED PROCEDURE", 10, 15);

            if (qrData) {
                doc.setFillColor(255); doc.rect(174, 4, 32, 32, 'F');
                doc.addImage(qrData, 'PNG', 175, 5, 30, 30);
            }

            doc.setFillColor(245, 245, 245); doc.rect(5, 28, 165, 18, 'F');
            doc.setTextColor(0); doc.setFontSize(8);
            doc.text(`SITE: ${String(proc.facility || 'N/A')} | LOC: ${String(proc.location || 'N/A')}`, 8, 34);
            doc.text(`EQUIP: ${String(proc.description || 'N/A')} | ID: ${String(proc.id || 'N/A')}`, 8, 40);

            let energyTxt = "ENERGY SOURCES: " + (Object.keys(energyCounts).length > 0 ? Object.entries(energyCounts).map(([k, v]) => `${k}(${v})`).join(', ') : 'None Specified');
            let locksTxt = "HARDWARE REQUIRED: " + (Object.keys(lockCounts).length > 0 ? Object.entries(lockCounts).map(([k, v]) => `${k} x${v}`).join(', ') : 'None Specified');

            // Explicit autoTable call instead of doc.autoTable to prevent prototype crashes
            autoTable(doc, {
                startY: 50,
                head: [['LOTO RESOURCE SUMMARY']],
                body: [[energyTxt], [locksTxt]],
                styles: { fontSize: 8 },
                headStyles: { fillColor: [220, 38, 38] }
            });

            const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 70;

            autoTable(doc, {
                startY: finalY + 5,
                head: [['TAG', 'ISOLATION & HARDWARE', 'PHOTO', 'VERIFY']],
                body: (proc.steps || []).map(s => [
                    String(s.tag || '-'),
                    `SOURCE: ${String(s.type || 'N/A')}\nHW: ${String((s.devices || []).join(', ') || 'None')}\n\nMETHOD: ${String(s.isolate || 'N/A')}`,
                    "",
                    String(s.verify || 'N/A')
                ]),
                styles: { fontSize: 7, minCellHeight: 38, verticalAlign: 'middle' },
                didDrawCell: (d) => {
                    if (d.column.index === 2 && d.cell.section === 'body') {
                        const img = (proc.steps || [])[d.row.index]?.image;
                        if (img && img.includes('base64,')) {
                            try {
                                let imgType = 'JPEG';
                                if (img.startsWith('data:image/png')) imgType = 'PNG';
                                doc.addImage(img, imgType, d.cell.x + 2, d.cell.y + 2, d.cell.width - 4, d.cell.height - 4);
                            } catch (imgErr) { console.warn("PDF Image skipped", imgErr); }
                        }
                    }
                }
            });

            doc.addPage();
            doc.setFillColor(185, 28, 28); doc.rect(0, 0, 210, 20, 'F');
            doc.setTextColor(255); doc.setFontSize(14); doc.text("OSHA 1910.147 COMPLIANCE SEQUENCES", 105, 13, { align: 'center' });
            autoTable(doc, {
                startY: 30,
                head: [['SHUTDOWN SEQUENCE', 'RESTORATION SEQUENCE']],
                body: [
                    ['1. Notify all affected employees', '1. Check equipment for tools/debris'],
                    ['2. Identify all energy sources', '2. Ensure all guards are replaced'],
                    ['3. Perform normal equipment stop', '3. Clear all personnel from area'],
                    ['4. Isolate all energy valves/breakers', '4. Remove LOTO devices and tags'],
                    ['5. Apply personal locks and tags', '5. Restore energy and test operation'],
                    ['6. Verify Zero Energy State', '6. Notify staff of completion']
                ],
                headStyles: { fillColor: [30, 41, 59] }
            });

            doc.addPage();
            renderTagsPage(doc, proc, qrData);
            doc.save(`${String(proc.id || 'PROCEDURE')}.pdf`);
        } catch (error) {
            console.error("PDF Engine Error:", error);
            alert("Failed to generate PDF. Some required fields may be missing or corrupted.");
        }
    };

    const renderTagsPage = (doc, proc, qrData) => {
        doc.setTextColor(0); doc.setFontSize(14); doc.setFont("helvetica", "bold");
        doc.text("ISOLATION TAGS", 10, 15);
        let cx = 10, cy = 25;
        (proc.steps || []).forEach(s => {
            const conf = ENERGY_CONFIG[s.type] || { bg: [100, 100, 100] };
            doc.setDrawColor(0); doc.setFillColor(255); doc.rect(cx, cy, 62, 48, 'FD');
            doc.setFillColor(...conf.bg); doc.rect(cx, cy, 40, 12, 'F');
            doc.setTextColor(255); doc.setFontSize(14); doc.text(String(s.tag || '-'), cx + 4, cy + 9);
            doc.setTextColor(0); doc.setFontSize(6);
            doc.text(`EQUIP: ${String(proc.description || 'N/A').substring(0, 25)}`, cx + 2, cy + 18);
            doc.text(`TYPE: ${String(s.type || 'UNKNOWN').toUpperCase()}`, cx + 2, cy + 22);
            doc.setFont("helvetica", "bold"); doc.text("HARDWARE:", cx + 2, cy + 27);
            doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(String((s.devices || []).join(', ') || 'None'), 35), cx + 2, cy + 30);

            if (qrData) doc.addImage(qrData, 'PNG', cx + 43, cy + 25, 16, 16);

            cx += 65; if (cx > 150) { cx = 10; cy += 55; }
            if (cy > 230) { doc.addPage(); cx = 10; cy = 25; }
        });
    };

    const triggerExecution = (proc) => {
        setExecutionProc(proc);
        setCurrentView('execute');
    };

    const toggleLock = async (proc, step) => {
        const globalLiveMap = {};
        [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(log => {
            if (!globalLiveMap[log.procId]) globalLiveMap[log.procId] = new Set();
            if (log.action === 'LOCK APPLIED') globalLiveMap[log.procId].add(log.stepTag);
            else if (log.action === 'LOCK REMOVED') globalLiveMap[log.procId].delete(log.stepTag);
        });

        const currentlyLocked = globalLiveMap[proc.firebaseKey] && globalLiveMap[proc.firebaseKey].has(step.tag);
        const action = currentlyLocked ? 'LOCK REMOVED' : 'LOCK APPLIED';

        const logEntry = {
            timestamp: new Date().toISOString(),
            procId: proc.firebaseKey,
            procRef: proc.id,
            equipment: proc.description,
            stepTag: step.tag,
            energy: step.type,
            action: action,
            user: session.name || session.user || session.email
        };

        try {
            const newRef = push(ref(rtdb, `organizations/${session.orgId}/lotoLogs`));
            await update(newRef, logEntry);
            logEntry.firebaseKey = newRef.key;
            setLogs([logEntry, ...logs]);
        } catch (e) { alert("Network error logging lock."); }
    };

    const exportLogsToExcel = () => {
        const excelData = filteredLogs.map(l => ({
            "Date & Time": new Date(l.timestamp).toLocaleString(),
            "Action": l.action,
            "User": l.user,
            "Procedure ID": l.procRef,
            "Equipment": l.equipment,
            "Isolation Step": l.stepTag,
            "Energy Type": l.energy
        }));
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "LOTO Register");
        XLSX.writeFile(wb, `LOTO_Register_${siteFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 font-['Space_Grotesk']">
            <i className="fas fa-circle-notch fa-spin text-3xl mb-4 text-red-500 mr-3"></i>
            <h2 className="font-bold">Initializing LOTO Engine...</h2>
        </div>
    );

    if (isScanning) {
        return (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[9999] flex flex-col items-center justify-center p-6">
                <style>{`#reader { width: 100%; max-width: 500px; border-radius: 20px; overflow: hidden; border: 2px solid rgba(255, 255, 255, 0.1); box-shadow: 0 0 50px rgba(239, 68, 68, 0.2); margin: 0 auto; } #reader__scan_region video { object-fit: cover !important; }`}</style>
                <div className="max-w-md w-full bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl">
                    <h2 className="text-2xl font-bold text-white text-center mb-6"><i className="fas fa-qrcode text-purple-500 mr-2"></i> Scan LOTO Tag</h2>
                    <div id="reader" className="mb-8 rounded-xl overflow-hidden border border-slate-700 shadow-lg"></div>
                    <button onClick={() => setIsScanning(false)} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl text-sm transition-colors">Cancel Scan</button>
                </div>
            </div>
        );
    }

    if (currentView === 'execute') {
        let activeProc = executionProc;
        if (!activeProc) {
            const execId = new URLSearchParams(window.location.search).get('execute');
            activeProc = procedures.find(p => p.firebaseKey === execId);
            if (!activeProc) return <div className="p-10 text-center text-white bg-slate-950 h-screen font-['Space_Grotesk']">Procedure not found in database. <button onClick={() => navigate('/dashboard')} className="block mx-auto mt-4 bg-red-600 hover:bg-red-500 px-6 py-3 rounded-xl font-bold transition">Back to Hub</button></div>;
        }

        if (!canViewRecord(activeProc.facility)) {
            return (
                <div className="p-10 text-center text-white bg-slate-950 h-screen font-['Space_Grotesk'] flex flex-col items-center justify-center">
                    <i className="fas fa-shield-alt text-6xl text-red-500 mb-4"></i>
                    <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                    <p className="text-slate-400 max-w-md">You do not have authorization to view or execute Lockout/Tagout procedures for this specific facility ({activeProc.facility}).</p>
                    <button onClick={() => navigate('/dashboard')} className="mt-8 bg-slate-800 hover:bg-slate-700 px-8 py-3 rounded-xl font-bold transition">Return to Hub</button>
                </div>
            );
        }

        const globalLiveMap = {};
        [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(log => {
            if (!globalLiveMap[log.procId]) globalLiveMap[log.procId] = new Set();
            if (log.action === 'LOCK APPLIED') globalLiveMap[log.procId].add(log.stepTag);
            else if (log.action === 'LOCK REMOVED') globalLiveMap[log.procId].delete(log.stepTag);
        });

        return (
            <div className="min-h-screen bg-slate-950 p-4 md:p-8 max-w-lg mx-auto animate-fade-in pb-24 font-['Space_Grotesk']">
                <style>{`.glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1); }`}</style>
                <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-8 mt-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-tr from-red-600 to-rose-600 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-lg shadow-red-900/50">LP</div>
                        <h1 className="text-xl font-bold text-white tracking-wide">LOTO Execute</h1>
                    </div>
                    <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-900/30 px-3 py-1.5 rounded-lg border border-emerald-500/30 shadow-inner flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div> ACTIVE</div>
                </div>

                <div className="glass-panel p-6 rounded-3xl shadow-2xl mb-8 border-t-4 border-red-500">
                    <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">ID: {activeProc.id}</p>
                    <h2 className="text-3xl font-bold text-white leading-tight mb-4">{activeProc.description}</h2>
                    <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1.5 bg-blue-900/30 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase"><i className="fas fa-industry mr-1"></i> {activeProc.facility}</span>
                        <span className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-lg text-[10px] font-bold uppercase">REV: {activeProc.date}</span>
                    </div>
                </div>

                <div className="space-y-6">
                    {activeProc.steps.map((s, i) => {
                        const conf = ENERGY_CONFIG[s.type] || { css: 'bg-slate-700' };
                        const isLocked = globalLiveMap[activeProc.firebaseKey] && globalLiveMap[activeProc.firebaseKey].has(s.tag);

                        return (
                            <div key={i} className={`glass-panel rounded-2xl overflow-hidden shadow-xl border-2 transition-colors ${isLocked ? 'border-red-500/50 bg-red-900/10' : 'border-slate-800'}`}>
                                {s.image && <div className="w-full h-56 bg-slate-900 border-b border-slate-800"><img src={s.image} className="w-full h-full object-cover opacity-80" /></div>}
                                <div className="p-6 relative">
                                    <div className={`absolute top-0 left-0 w-2 h-full ${conf.css}`}></div>
                                    <div className="flex justify-between items-center mb-4 pl-3 border-b border-slate-700/50 pb-3">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-lg ${conf.css}`}>{s.tag || (i + 1)}</span>
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{s.type} Energy</span>
                                        </div>
                                    </div>
                                    <div className="pl-3 space-y-5">
                                        <p className="text-base font-medium text-white leading-relaxed">{s.isolate}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {(s.devices || []).map(d => <span key={d} className="text-[10px] font-bold uppercase text-slate-300 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner"><i className="fas fa-lock text-slate-500 mr-1"></i> {d}</span>)}
                                        </div>
                                        <button onClick={() => toggleLock(activeProc, s)} className={`w-full py-4 rounded-xl font-bold uppercase text-sm flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-xl ${isLocked ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-red-900/50 border border-red-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'}`}>
                                            {isLocked ? <><i className="fas fa-lock text-lg"></i> Lock Applied</> : <><i className="fas fa-unlock text-slate-400 text-lg"></i> Apply Lock</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-10 pt-6 border-t border-slate-800 text-center">
                    <button onClick={() => setCurrentView('inventory')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-6 py-3 rounded-xl text-sm font-bold transition shadow-lg"><i className="fas fa-arrow-left mr-2"></i> Return to Directory</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-white overflow-hidden relative">
            <style>
                {`
                .bg-mesh { background: radial-gradient(circle at 50% 0%, rgba(220, 38, 38, 0.08) 0%, transparent 50%), radial-gradient(circle at 100% 100%, rgba(37, 99, 235, 0.08) 0%, transparent 50%), #020617; }
                .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1); }
                .custom-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
                .custom-scroll::-webkit-scrollbar-track { background: #020617; border-radius: 4px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; border: 2px solid #020617; }
                .chip { padding: 6px 14px; border-radius: 99px; font-size: 11px; font-weight: 700; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: 0.2s; background: rgba(255,255,255,0.05); }
                .chip:hover { background: rgba(255,255,255,0.1); }
                .hw-active { background: #3b82f6 !important; border-color: #3b82f6 !important; color: white;}
                .rk-active { background: #f59e0b !important; border-color: #f59e0b !important; color: white;}
                `}
            </style>
            <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

            {/* Top Nav */}
            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-10 flex-shrink-0 no-print">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/ohs-tools?site=${siteFilter}`)} className="text-slate-400 hover:text-white transition flex items-center gap-2"><i className="fas fa-arrow-left"></i> OHS Tools</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 bg-gradient-to-tr from-red-600 to-rose-600 rounded-lg flex items-center justify-center font-black italic text-white shadow-lg shadow-red-900/50">LP</div>
                    <h1 className="text-lg font-bold text-white tracking-wide hidden md:block">LOTO System</h1>

                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 shadow-inner">
                        <i className="fas fa-filter text-slate-500 text-xs"></i>
                        <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-transparent border-none text-slate-200 font-bold text-xs outline-none shadow-none m-0 p-0 pr-2">
                            {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Sites (Global)</option>}
                            {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                    </div>
                    <button onClick={() => setIsScanning(true)} className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-purple-900/50 flex items-center gap-2"><i className="fas fa-qrcode"></i> Scan QR</button>
                </div>
            </header>

            {/* Tab Bar */}
            <div className="flex gap-3 px-8 pt-6 bg-slate-950 border-b border-slate-800 pb-4 overflow-x-auto custom-scroll no-print">
                <button onClick={() => setCurrentView('dashboard')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border whitespace-nowrap ${currentView === 'dashboard' ? 'bg-red-600 text-white border-red-500 shadow-red-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-chart-pie mr-2"></i> Dashboard</button>
                <button onClick={() => setCurrentView('inventory')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border whitespace-nowrap ${currentView === 'inventory' ? 'bg-blue-600 text-white border-blue-500 shadow-blue-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-folder-open mr-2"></i> Inventory</button>
                <button onClick={() => setCurrentView('register')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border whitespace-nowrap ${currentView === 'register' ? 'bg-orange-600 text-white border-orange-500 shadow-orange-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-clipboard-list mr-2"></i> Live Register</button>
                {permissions.canEditCreate && (
                    <button onClick={() => startNewProcedure()} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border whitespace-nowrap ${currentView === 'builder' ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/50' : 'bg-slate-800 text-emerald-500 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-plus mr-2"></i> New Procedure</button>
                )}
            </div>

            <main className="flex-1 overflow-y-auto custom-scroll p-8">

                {/* VIEW: DASHBOARD */}
                {currentView === 'dashboard' && (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-8">
                        <div className="md:hidden mb-4">
                            <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Site Filter</label>
                            <select value={siteFilter} onChange={handleSiteFilterChange} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-white font-bold">
                                {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-emerald-500">
                                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-3">Approved Procedures</h3>
                                <div className="text-5xl font-black text-white">{filteredProcedures.filter(p => p.status === 'Approved').length}</div>
                                <p className="text-xs text-slate-400 uppercase mt-4 font-medium">Active in {siteFilter === 'All' ? 'Organization' : siteFilter}</p>
                            </div>
                            <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-orange-500">
                                <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-3">Active Live Lockouts</h3>
                                <div className="text-5xl font-black text-white">
                                    {filteredProcedures.filter(p => liveStatusMap[p.firebaseKey] && liveStatusMap[p.firebaseKey].size > 0).length}
                                </div>
                                <p className="text-xs text-slate-400 uppercase mt-4 font-medium">Equipment currently isolated</p>
                            </div>
                            <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-blue-500">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Total Log Events</h3>
                                <div className="text-5xl font-black text-white">{filteredLogs.length}</div>
                                <p className="text-xs text-slate-400 uppercase mt-4 font-medium">Historical Audit Trail entries</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW: INVENTORY */}
                {currentView === 'inventory' && (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex justify-between items-end mb-8 border-b border-slate-800 pb-4">
                            <h2 className="text-3xl font-bold text-white">Procedure Inventory</h2>
                        </div>

                        {filteredProcedures.length === 0 ? <div className="p-16 text-center glass-panel rounded-3xl text-slate-500 text-lg border border-dashed border-slate-700 italic">No procedures found for this site.</div> :
                            filteredProcedures.map((proc, i) => (
                                <div key={i} className="glass-panel p-8 rounded-3xl flex flex-col xl:flex-row justify-between items-center gap-8 border border-slate-800 hover:border-slate-600 transition shadow-lg">
                                    <div className="flex-1 w-full">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="bg-slate-900 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border border-slate-700 shadow-inner"><i className="fas fa-hashtag text-slate-500 mr-1"></i> {proc.id}</span>
                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border ${proc.status === 'Approved' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/30 text-amber-400 border-amber-500/30'}`}>{proc.status}</span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-3">{proc.description}</h2>
                                        <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                            <span className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800"><i className="fas fa-industry mr-1"></i> Site: {proc.facility}</span>
                                            <span className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800"><i className="fas fa-map-marker-alt mr-1"></i> Area: {proc.location}</span>
                                            <span className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-indigo-400"><i className="fas fa-list-ol mr-1"></i> Steps: {proc.steps?.length || 0}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-3 w-full xl:w-auto">
                                        {proc.status === 'Approved' && (
                                            <>
                                                <button onClick={() => triggerExecution(proc)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-4 rounded-xl uppercase tracking-widest shadow-lg flex items-center gap-2 transition-transform active:scale-95"><i className="fas fa-play"></i> Execute</button>
                                                <button onClick={() => generatePDF(proc, false)} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-5 py-4 rounded-xl uppercase tracking-widest shadow-lg transition-transform active:scale-95"><i className="fas fa-file-pdf mr-1"></i> PDF</button>
                                                <button onClick={() => generatePDF(proc, true)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-4 rounded-xl uppercase tracking-widest shadow-lg transition-transform active:scale-95"><i className="fas fa-tags mr-1"></i> Tags</button>
                                            </>
                                        )}
                                        {proc.status === 'Draft' && permissions.canEditCreate && (['Owner', 'Site Owner', 'Global Owner', 'Global Manager', 'Site Manager'].includes(session.role)) && (
                                            <button onClick={() => approveProcedure(proc)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-4 rounded-xl uppercase tracking-widest transition-transform active:scale-95 shadow-lg"><i className="fas fa-check-circle mr-1"></i> Approve</button>
                                        )}
                                        {permissions.canEditCreate ? (
                                            <button onClick={() => { setProcForm(proc); setCurrentView('builder'); }} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-6 py-4 rounded-xl uppercase tracking-widest transition-transform active:scale-95 shadow-lg"><i className="fas fa-edit mr-1"></i> Edit</button>
                                        ) : (
                                            <button onClick={() => { setProcForm(proc); setCurrentView('builder'); }} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-6 py-4 rounded-xl uppercase tracking-widest transition-transform active:scale-95 shadow-lg"><i className="fas fa-eye mr-1"></i> View</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                    </div>
                )}

                {/* VIEW: LIVE REGISTER */}
                {currentView === 'register' && (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-10">
                        <div>
                            <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full bg-orange-500 animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.8)]"></div>
                                    <h2 className="text-3xl font-bold text-white">Live Lockout Status</h2>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredProcedures.filter(p => liveStatusMap[p.firebaseKey] && liveStatusMap[p.firebaseKey].size > 0).map((proc, i) => {
                                    const locked = liveStatusMap[proc.firebaseKey].size;
                                    const total = proc.steps ? proc.steps.length : 0;
                                    const isComplete = locked === total;

                                    return (
                                        <div key={i} className={`glass-panel p-8 rounded-3xl shadow-xl ${isComplete ? 'border-l-4 border-l-emerald-500 bg-emerald-900/10' : 'border-l-4 border-l-orange-500 bg-orange-900/10'}`}>
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <h3 className="text-xl font-bold text-white leading-tight">{proc.description}</h3>
                                                    <p className="text-[10px] font-mono font-bold text-slate-400 mt-2 bg-slate-900 inline-block px-2 py-1 rounded border border-slate-800">{proc.id}</p>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border ${isComplete ? 'text-emerald-400 bg-emerald-900/30 border-emerald-500/30' : 'text-orange-400 bg-orange-900/30 border-orange-500/30'}`}>{isComplete ? 'Fully Locked' : 'Partial'}</span>
                                            </div>
                                            <div className="flex items-center gap-4 mb-2">
                                                <div className="flex-1 h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700 shadow-inner">
                                                    <div className={`h-full transition-all duration-500 ${isComplete ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]'}`} style={{ width: `${(locked / total) * 100}%` }}></div>
                                                </div>
                                                <span className="text-sm font-black text-white">{locked}/{total}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredProcedures.filter(p => liveStatusMap[p.firebaseKey] && liveStatusMap[p.firebaseKey].size > 0).length === 0 && (
                                    <div className="col-span-full p-16 glass-panel border-dashed border-2 border-slate-700 text-center rounded-3xl">
                                        <i className="fas fa-check-circle text-4xl text-emerald-500/30 mb-4 block"></i>
                                        <p className="text-sm text-slate-400 font-medium uppercase tracking-widest">No Active Lockouts Detected for this Site (All Clear)</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-slate-800 pt-10">
                            <div className="flex justify-between items-end mb-6">
                                <h2 className="text-3xl font-bold text-white">Activity Log</h2>
                                <button onClick={exportLogsToExcel} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95 border border-slate-600">
                                    <i className="fas fa-file-excel"></i> Export CSV
                                </button>
                            </div>
                            <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-900 text-xs uppercase font-bold text-slate-400 border-b border-slate-800">
                                        <tr><th className="p-5">Timestamp</th><th className="p-5">Action</th><th className="p-5">User</th><th className="p-5">Procedure Ref</th><th className="p-5">Details</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-sm text-slate-300 bg-slate-950/50">
                                        {filteredLogs.map((log, i) => (
                                            <tr key={i} className="hover:bg-slate-800/80 transition-colors">
                                                <td className="p-5 font-mono text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                                                <td className="p-5"><span className={`border px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${log.action === 'LOCK APPLIED' ? 'text-red-400 bg-red-900/20 border-red-500/30' : 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30'}`}>{log.action}</span></td>
                                                <td className="p-5 text-white font-medium">{log.user}</td>
                                                <td className="p-5 font-mono font-bold text-blue-400">{log.procRef}</td>
                                                <td className="p-5"><span className="text-white font-bold uppercase mr-2">{log.equipment}</span> <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800 shadow-inner">Step: {log.stepTag} ({log.energy})</span></td>
                                            </tr>
                                        ))}
                                        {filteredLogs.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-slate-500 italic text-lg border-t border-slate-800">No log history found for this site.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW: BUILDER */}
                {currentView === 'builder' && procForm && (
                    <div className="max-w-5xl mx-auto animate-fade-in pb-20">
                        <div className="flex justify-between items-center mb-8 bg-slate-900/80 p-6 rounded-3xl border border-slate-700 shadow-xl backdrop-blur-md">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-1"><i className="fas fa-drafting-compass text-emerald-400 mr-3"></i> {procForm.firebaseKey ? (canEditForm ? 'Edit LOTO Procedure' : 'View LOTO Procedure') : 'Design LOTO Procedure'}</h2>
                                <p className="text-sm text-slate-400 ml-10">Map energy sources and establish isolation protocols.</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setCurrentView('inventory')} className="text-slate-400 hover:text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors">Cancel</button>
                                {canEditForm && (
                                    <button onClick={saveProcedure} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/50 transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-save"></i> Publish Procedure</button>
                                )}
                            </div>
                        </div>

                        <div className="glass-panel p-8 rounded-3xl shadow-2xl mb-10 border-t-4 border-blue-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Facility / Site</label>
                                    <select value={procForm.facility} onChange={e => updateProcField('facility', e.target.value)} disabled={!canEditForm || (!isGlobalUser && allowedSites.length <= 1)} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-blue-500 font-bold">
                                        {(isGlobalUser || allowedSites.length > 1) && <option value="">Select Site...</option>}
                                        {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Location / Area</label><input value={procForm.location} onChange={e => updateProcField('location', e.target.value)} disabled={!canEditForm} placeholder="Boiler Room..." className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-blue-500" /></div>
                                <div className="md:col-span-2"><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Equipment Description</label><input value={procForm.description} onChange={e => updateProcField('description', e.target.value)} disabled={!canEditForm} placeholder="e.g. Conveyor Belt Motor A" className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-blue-500 text-xl font-bold" /></div>
                            </div>
                            <div className="mt-8 bg-slate-900 p-5 rounded-2xl border border-slate-700 flex justify-between items-center shadow-inner">
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">System Reference ID:</span>
                                <span className="font-mono text-red-400 font-bold text-xl">{procForm.id}</span>
                            </div>
                        </div>

                        <div className="space-y-10">
                            {procForm.steps.map((step, idx) => (
                                <div key={step.id} className="glass-panel p-8 rounded-3xl relative border-l-8 border-slate-800 transition-colors shadow-xl" style={step.type ? { borderLeftColor: `rgb(${ENERGY_CONFIG[step.type].bg.join(',')})` } : {}}>
                                    {procForm.steps.length > 1 && canEditForm && <button onClick={() => removeStep(idx)} className="absolute -top-4 -right-4 bg-red-600 hover:bg-red-500 text-white w-10 h-10 rounded-full font-black shadow-lg border-[3px] border-slate-950 flex items-center justify-center transition-transform hover:scale-110"><i className="fas fa-times"></i></button>}

                                    <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-5">
                                        <input value={step.tag || ''} readOnly className="w-40 bg-transparent border-none text-red-500 font-mono font-black text-3xl p-0 shadow-none focus:border-none outline-none" placeholder="TAG" />
                                        <select value={step.type} onChange={e => updateStep(idx, 'type', e.target.value)} disabled={!canEditForm} className="w-auto text-sm font-bold uppercase bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500">
                                            <option value="">-- Energy Source --</option>
                                            {Object.keys(ENERGY_CONFIG).map(k => <option key={k} value={k}>{k}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-8">
                                        <div>
                                            <label className="text-xs uppercase font-bold text-slate-300 block mb-3 tracking-widest">Isolation Instructions</label>
                                            <textarea value={step.isolate} onChange={e => updateStep(idx, 'isolate', e.target.value)} disabled={!canEditForm} rows="2" placeholder="Turn valve 90 degrees..." className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 resize-none"></textarea>
                                        </div>

                                        <div>
                                            <label className="text-xs uppercase font-bold text-slate-300 block mb-3 tracking-widest">Verification Actions</label>
                                            <textarea value={step.verify} onChange={e => updateStep(idx, 'verify', e.target.value)} disabled={!canEditForm} rows="1" placeholder="Press start button to confirm zero energy..." className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 resize-none"></textarea>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                                <label className="text-xs uppercase font-bold text-blue-400 block mb-4 tracking-widest"><i className="fas fa-lock mr-2"></i> Required Hardware</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {HARDWARE_OPTIONS.map(h => <span key={h} onClick={() => toggleChip(idx, 'devices', h)} className={`chip ${(step.devices || []).includes(h) ? 'hw-active shadow-lg shadow-blue-500/50' : ''}`}>{h}</span>)}
                                                </div>
                                            </div>
                                            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                                <label className="text-xs uppercase font-bold text-amber-500 block mb-4 tracking-widest"><i className="fas fa-bolt mr-2"></i> Associated Risks</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {RISK_OPTIONS.map(r => <span key={r} onClick={() => toggleChip(idx, 'risks', r)} className={`chip ${(step.risks || []).includes(r) ? 'rk-active shadow-lg shadow-amber-500/50' : ''}`}>{r}</span>)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-slate-700 pt-6">
                                            <label className="text-xs uppercase font-bold text-slate-300 block mb-4 tracking-widest">Reference Photo</label>
                                            {step.image ? (
                                                <div className="relative inline-block">
                                                    <img src={step.image} className="h-56 rounded-2xl border border-slate-600 object-cover shadow-lg" alt="LOTO point" />
                                                    {canEditForm && <button onClick={() => updateStep(idx, 'image', null)} className="absolute -top-3 -right-3 bg-slate-800 text-white rounded-full w-8 h-8 text-sm flex items-center justify-center border-2 border-slate-950 hover:bg-red-500 shadow-lg transition-colors"><i className="fas fa-times"></i></button>}
                                                </div>
                                            ) : (
                                                <div className="bg-slate-900 border border-slate-700 p-2 rounded-xl inline-block shadow-inner">
                                                    <input type="file" accept="image/*" disabled={!canEditForm} onChange={(e) => handleImageUpload(idx, e.target.files[0])} className="text-sm file:bg-slate-700 file:text-white file:border-none file:rounded-lg file:px-5 file:py-2.5 file:mr-4 file:font-bold file:cursor-pointer cursor-pointer w-auto bg-transparent border-none p-0 outline-none shadow-none text-slate-400" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {canEditForm && (
                                <button onClick={addStep} className="w-full bg-slate-900/80 hover:bg-slate-800 border-2 border-dashed border-slate-600 text-slate-400 hover:text-white font-bold py-6 rounded-3xl uppercase tracking-widest text-sm transition-all shadow-lg flex items-center justify-center gap-3"><i className="fas fa-plus-circle text-xl"></i> Add Isolation Point</button>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}