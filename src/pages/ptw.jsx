import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push } from 'firebase/database';
import { rtdb } from '../config/firebase';
import QRious from 'qrious';

// ==========================================
// GLOBALS, CONFIG & BULLETPROOF FAILSAFES
// ==========================================

// Forces Firebase objects back into Arrays to prevent .map() crashes
const ensureArray = (val) => {
    if (val === null || val === undefined) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [val];
};

// Safely parses Firebase lists and ignores corrupted string nodes
const safeArrayParse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data !== 'object') return [];
    return Object.keys(data).reduce((acc, key) => {
        if (typeof data[key] === 'object' && data[key] !== null) {
            acc.push({ firebaseKey: key, ...data[key] });
        }
        return acc;
    }, []);
};

const PERMIT_TYPES = [
    { id: 'HOT', label: 'HOT WORK PERMIT', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    { id: 'WAH', label: 'HEIGHT WORK PERMIT', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    { id: 'CSE', label: 'CONFINED SPACE PERMIT', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    { id: 'ELE', label: 'ELECTRICAL / HAZARDOUS ENERGY', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    { id: 'EXC', label: 'EXCAVATION PERMIT', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
    { id: 'GEN', label: 'GENERAL / COLD WORK', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
];

const CHECKLIST_ITEMS = {
    'HOT': [
        "Fire extinguisher/fire hose available", "Combustible materials removed (>10m)",
        "Gas test done (LFL < 10%)", "Fire watcher assigned",
        "Welding screens used", "Adequate ventilation for fumes", "Sparks contained"
    ],
    'WAH': [
        "Scaffold tag is green", "Full body harness used",
        "Lifeline / Fall arrester used", "Safety nets provided",
        "Safe access / egress provided", "Anchorage Point verified", "Usage of Roof lifeline"
    ],
    'CSE': [
        "Oxygen level checked (>19.5%)", "Toxic gas checked",
        "Adequate ventilation provided", "Attendant present outside",
        "Rescue Team on alert", "Communication established", "Respirator / SCBA provided"
    ],
    'ELE': [
        "LOTO applied (Lockout/Tagout)", "Insulated tools to be used",
        "Rubber mat provided", "Proper PPE (Arc flash) used", "Zero energy verified"
    ],
    'EXC': [
        "Underground cables checked", "Underground pipes checked",
        "Shoring/Sloping done", "Barricades & warning signs provided", "Safe access / egress"
    ],
    'GEN': [
        "Job briefed to all personnel", "Warning signs displayed",
        "Equipment / Tools checked", "Safe access / egress provided", "Housekeeping maintained"
    ]
};

const COMMON_PPE = ["Hard Hat", "Safety Glasses", "Safety Shoes", "Gloves", "Hi-Vis Vest", "Ear Protection", "Face Shield", "Fall Harness", "Respirator", "FR Clothing"];
const WAH_EQUIP_OPTIONS = ["Fixed Scaffold", "Mobile Scaffold", "A-Frame Ladder", "Extension Ladder", "MEWP / Boom Lift", "Scissor Lift", "Rope Access System"];

// Normalizes an individual permit so no property is ever undefined
const normalizePermit = (p) => {
    if (!p) return null;
    return {
        ...p,
        description: String(p.description || ''),
        location: String(p.location || ''),
        equipment: String(p.equipment || ''),
        issuingDept: String(p.issuingDept || ''),
        issuedToName: String(p.issuedToName || ''),
        issuedToPh: String(p.issuedToPh || ''),
        validFromDate: String(p.validFromDate || ''),
        validToDate: String(p.validToDate || ''),
        validFromTime: String(p.validFromTime || ''),
        validToTime: String(p.validToTime || ''),
        statusUpdatedOn: String(p.statusUpdatedOn || ''),
        wms: ensureArray(p.wms),
        entrantNames: ensureArray(p.entrantNames),
        wahEquipment: ensureArray(p.wahEquipment),
        ppe: ensureArray(p.ppe),
        checklist: ensureArray(p.checklist)
    };
};

const getTypeConfig = (tId) => PERMIT_TYPES.find(t => t.id === tId) || PERMIT_TYPES[5];

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function Ptw() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState('dashboard');

    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');

    const [permits, setPermits] = useState([]);
    const [lotoProcedures, setLotoProcedures] = useState([]);

    const [printData, setPrintData] = useState(null);
    const [qrImage, setQrImage] = useState(null);

    const [formData, setFormData] = useState(null);
    const [approverModalOpen, setApproverModalOpen] = useState(false);
    const [selectedApprover, setSelectedApprover] = useState('');

    const myName = session?.name || session?.email || session?.user || 'Me';

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || 'All';
        if (sess.role !== 'Owner' && sess.assignedSite && ctxSite === 'All') {
            ctxSite = sess.assignedSite;
        }
        setSiteFilter(ctxSite);

        const loadData = async () => {
            try {
                const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                const snap = await get(dbRef);

                if (snap.exists()) {
                    const data = snap.val();

                    if (data.sites) {
                        const allSites = Object.keys(data.sites).map(key => {
                            const sVal = data.sites[key];
                            return typeof sVal === 'object' ? { code: sVal.code || key, name: sVal.name || sVal.code || key } : { code: sVal, name: sVal };
                        });
                        setSites(allSites);
                    }

                    if (data.users) {
                        setUsers(Object.keys(data.users).map(key => {
                            const uVal = data.users[key];
                            return typeof uVal === 'object'
                                ? { id: key, name: uVal.name || uVal.email || "System Owner", role: uVal.role || "User", ...uVal }
                                : { id: key, name: uVal || "System Owner", role: "User" };
                        }).filter(u => u.status !== 'Inactive' && u.status !== 'Deleted'));
                    }

                    if (data.ptwRecords) {
                        const rawPermits = safeArrayParse(data.ptwRecords);
                        const cleanPermits = rawPermits.map(normalizePermit).sort((a, b) => new Date(b.createdDate || 0) - new Date(a.createdDate || 0));
                        setPermits(cleanPermits);
                    }

                    if (data.lotoProcedures) {
                        setLotoProcedures(safeArrayParse(data.lotoProcedures));
                    }
                }
            } catch (e) { console.error("Data Load Error:", e); }
            finally { setLoading(false); }
        };

        loadData();
    }, [navigate, location]);

    // --- GLOBAL USER FILTERING LOGIC ---
    const siteUsers = useMemo(() => {
        const activeSiteId = formData?.siteId || siteFilter;
        return users.filter(u => {
            const isGlobal = u.role === 'Owner' || u.role === 'Lead Auditor' || u.assignedSite === 'GLOBAL' || (u.accessibleSites && u.accessibleSites.includes('GLOBAL'));
            const siteMatch = isGlobal || !activeSiteId || activeSiteId === 'All' || u.assignedSite === activeSiteId || (u.accessibleSites && u.accessibleSites.includes(activeSiteId));
            return siteMatch;
        });
    }, [users, formData?.siteId, siteFilter]);

    const filteredPermits = useMemo(() => {
        return permits.filter(p => siteFilter === 'All' || p.siteId === siteFilter);
    }, [permits, siteFilter]);

    const myPendingApprovals = useMemo(() => {
        return permits.filter(p => p.status === 'Pending Approval' && p.pendingApprover === session?.user);
    }, [permits, session]);

    // ==========================================
    // FORM LOGIC
    // ==========================================
    const openForm = (record = null) => {
        setPrintData(null);
        if (record) {
            const recToEdit = normalizePermit({ ...record });
            if (recToEdit.wms.length === 0) recToEdit.wms = [{ step: '', hazard: '', precaution: '' }];
            if (recToEdit.entrantNames.length === 0) recToEdit.entrantNames = [''];
            if (recToEdit.ppe.length === 0) recToEdit.ppe = ["Hard Hat", "Safety Glasses", "Safety Shoes"];
            if (recToEdit.checklist.length === 0) {
                const targetChecklist = CHECKLIST_ITEMS[recToEdit.typeId || 'GEN'] || CHECKLIST_ITEMS['GEN'];
                recToEdit.checklist = targetChecklist.map(item => ({ label: item, checked: false }));
            }
            setFormData(recToEdit);
        } else {
            const typeId = 'GEN';
            setFormData({
                id: `PTW-${Math.floor(100000 + Math.random() * 900000)}`, firebaseKey: '',
                typeId: typeId, siteId: siteFilter !== 'All' ? siteFilter : (session?.assignedSite || ''), location: '', equipment: '',
                description: '', issuingDept: '', issuedToName: '', issuedToPh: '',
                fireWatcherName: '', entrantNames: [''], attendantName: '', entrySupervisorName: '',
                oxygenLevel: '', toxicGas: '', flammability: '', lotoRef: '', wahEquipment: [],
                wms: [{ step: '', hazard: '', precaution: '' }],
                validFromDate: new Date().toISOString().split('T')[0], validFromTime: '08:00',
                validToDate: new Date().toISOString().split('T')[0], validToTime: '17:00',
                status: 'Draft', requestedBy: session?.user || 'Unknown', createdDate: new Date().toISOString(),
                ppe: ["Hard Hat", "Safety Glasses", "Safety Shoes"],
                checklist: (CHECKLIST_ITEMS[typeId] || CHECKLIST_ITEMS['GEN']).map(item => ({ label: item, checked: false })),
                issuerSignature: '', areaInchargeSignature: '', pendingApprover: ''
            });
        }
        setCurrentView('builder');
    };

    const updateField = (field, value) => {
        setFormData(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'typeId' && prev.status === 'Draft') {
                const targetChecklist = CHECKLIST_ITEMS[value] || CHECKLIST_ITEMS['GEN'];
                next.checklist = targetChecklist.map(item => ({ label: item, checked: false }));
            }
            return next;
        });
    };

    const togglePPE = (item) => {
        const arr = [...(formData.ppe || [])];
        if (arr.includes(item)) setFormData({ ...formData, ppe: arr.filter(i => i !== item) });
        else setFormData({ ...formData, ppe: [...arr, item] });
    };

    const toggleChecklistItem = (idx) => {
        const arr = [...(formData.checklist || [])];
        if (arr[idx]) {
            arr[idx] = { ...arr[idx], checked: !arr[idx].checked };
            setFormData({ ...formData, checklist: arr });
        }
    };

    const addWmsRow = () => { setFormData(prev => ({ ...prev, wms: [...(prev.wms || []), { step: '', hazard: '', precaution: '' }] })); };
    const updateWmsRow = (idx, field, val) => {
        const arr = [...(formData.wms || [])];
        if (arr[idx]) {
            arr[idx] = { ...arr[idx], [field]: val };
            setFormData({ ...formData, wms: arr });
        }
    };
    const removeWmsRow = (idx) => { setFormData(prev => ({ ...prev, wms: (prev.wms || []).filter((_, i) => i !== idx) })); };

    const addEntrant = () => { setFormData(prev => ({ ...prev, entrantNames: [...(prev.entrantNames || []), ''] })); };
    const updateEntrant = (idx, val) => {
        const arr = [...(formData.entrantNames || [])];
        if (arr[idx] !== undefined) {
            arr[idx] = val;
            setFormData({ ...formData, entrantNames: arr });
        }
    };
    const removeEntrant = (idx) => { setFormData(prev => ({ ...prev, entrantNames: (prev.entrantNames || []).filter((_, i) => i !== idx) })); };

    const toggleWahEquip = (item) => {
        const arr = [...(formData.wahEquipment || [])];
        if (arr.includes(item)) setFormData({ ...formData, wahEquipment: arr.filter(i => i !== item) });
        else setFormData({ ...formData, wahEquipment: [...arr, item] });
    };

    const handleSave = async (isDraft = true) => {
        if (!formData.siteId || !formData.description || !formData.location) return alert("Site, Location, and Description are required.");

        try {
            const payload = { ...formData, lastUpdated: new Date().toISOString() };

            if (!isDraft) {
                if (!selectedApprover) return alert("Please select an Area Incharge to approve this permit.");
                payload.status = 'Pending Approval';
                payload.pendingApprover = selectedApprover;
            }

            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${formData.firebaseKey}`), payload);
                setPermits(permits.map(p => p.firebaseKey === formData.firebaseKey ? normalizePermit(payload) : p));
            } else {
                const newRef = await push(ref(rtdb, `organizations/${session.orgId}/ptwRecords`), payload);
                payload.firebaseKey = newRef.key;
                setPermits([normalizePermit(payload), ...permits]);
            }

            alert(`Permit ${isDraft ? 'Draft Saved' : 'Sent for Authorization'}.`);
            setApproverModalOpen(false);
            setCurrentView('inventory');
        } catch (e) { alert("Error saving permit: " + e.message); }
    };

    const changeStatus = async (permit, newStatus) => {
        if (!window.confirm(`Change status of ${permit.id} to ${newStatus}?`)) return;
        try {
            const updates = { status: newStatus, statusUpdatedBy: session.user, statusUpdatedOn: new Date().toISOString() };

            if (newStatus === 'Active') {
                updates.areaInchargeSignature = session.user;
                updates.issuerSignature = permit.requestedBy;
                updates.pendingApprover = '';
            }

            const payload = normalizePermit({ ...permit, ...updates });
            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.firebaseKey === permit.firebaseKey ? payload : p));
            if (currentView === 'builder') setFormData(payload);
        } catch (e) { alert("Status update failed."); }
    };

    const triggerPrint = (permit) => {
        const qrUrl = `${window.location.origin}${window.location.pathname}?ptw=${permit.id}`;
        try {
            const qr = new QRious({ value: qrUrl, size: 200 });
            setQrImage(qr.toDataURL());
        } catch (e) {
            console.warn("QRious failed to load, skipping QR code.", e);
        }
        setPrintData(normalizePermit(permit));
        setTimeout(() => window.print(), 500);
    };

    const getTypeConfig = (tId) => PERMIT_TYPES.find(t => t.id === tId) || PERMIT_TYPES[5];

    if (loading || !session) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 font-['Space_Grotesk'] flex-col gap-4">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-amber-500 rounded-full animate-spin"></div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading PTW System...</h2>
        </div>
    );

    const urlSite = new URLSearchParams(location.search).get('site') || session?.assignedSite || 'GLOBAL';

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden relative font-['Space_Grotesk']">

            <style dangerouslySetInnerHTML={{
                __html: `
                .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1); }
                input, select, textarea { background: rgba(15, 23, 42, 0.8); border: 1px solid #475569; color: #f1f5f9; padding: 10px 14px; border-radius: 8px; outline: none; width: 100%; transition: all 0.2s ease; font-size: 14px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.2); }
                input:focus, select:focus, textarea:focus { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2); background: #0f172a; }
                input:disabled, select:disabled, textarea:disabled { opacity: 0.6; cursor: not-allowed; background: #1e293b; border-color: #334155; }
                input[type="checkbox"] { width: auto; accent-color: #f59e0b; transform: scale(1.2); cursor: pointer; }
                .custom-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
                .custom-scroll::-webkit-scrollbar-track { background: #020617; border-radius: 4px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; border: 2px solid #020617; }
            `}} />

            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0 print:hidden">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/ohs-tools?site=${urlSite}`)} className="text-slate-400 hover:text-white transition flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> OHS Tools
                    </button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold shadow-lg shadow-amber-900/50">
                        <i className="fas fa-file-signature"></i>
                    </div>
                    <h1 className="text-base font-bold text-white tracking-wide hidden md:block uppercase">Permit to Work (PTW)</h1>
                </div>
            </header>

            <div className="flex gap-3 px-8 pt-6 bg-slate-950 flex-wrap border-b border-slate-800 pb-4 print:hidden z-10">
                <button onClick={() => setCurrentView('dashboard')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentView === 'dashboard' ? 'bg-amber-600 text-white border-amber-500 shadow-amber-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-chart-pie mr-2"></i> PTW Dashboard</button>
                <button onClick={() => setCurrentView('inventory')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentView === 'inventory' ? 'bg-amber-600 text-white border-amber-500 shadow-amber-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-folder-open mr-2"></i> Permit Registry</button>
                <button onClick={() => openForm()} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentView === 'builder' ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/50' : 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700 hover:text-emerald-300'}`}><i className="fas fa-plus mr-2"></i> Create Permit</button>
            </div>

            <main className="flex-1 overflow-y-auto custom-scroll relative pb-20 print:hidden font-['Inter']">

                {/* DASHBOARD */}
                {currentView === 'dashboard' && (
                    <div className="p-8 max-w-7xl mx-auto animate-fade-in font-['Space_Grotesk']">
                        <div className="mb-8 flex justify-between items-end">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">PTW Dashboard</h2>
                                <p className="text-sm text-slate-400 font-['Inter']">Real-time status of all safe work permits across facilities.</p>
                            </div>
                            <div className="flex gap-4 text-sm font-bold items-center">
                                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none focus:border-amber-500 shadow-lg font-['Inter']">
                                    <option value="All">All Sites</option>
                                    {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-emerald-500">
                                <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Active Permits</h3>
                                <div className="text-4xl font-black text-white">{filteredPermits.filter(p => p.status === 'Active').length}</div>
                            </div>
                            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-orange-500">
                                <h3 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2">Pending Approval</h3>
                                <div className="text-4xl font-black text-white">{filteredPermits.filter(p => p.status === 'Pending Approval').length}</div>
                            </div>
                            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-slate-500">
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Closed Today</h3>
                                <div className="text-4xl font-black text-white">{filteredPermits.filter(p => p.status === 'Closed' && String(p.statusUpdatedOn || '').startsWith(new Date().toISOString().split('T')[0])).length}</div>
                            </div>
                            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-red-500">
                                <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">Hot Work Active</h3>
                                <div className="text-4xl font-black text-white">{filteredPermits.filter(p => p.status === 'Active' && p.typeId === 'HOT').length}</div>
                            </div>
                        </div>

                        {myPendingApprovals.length > 0 && (
                            <div className="mb-10 p-6 bg-orange-900/20 border border-orange-500/50 rounded-3xl shadow-2xl">
                                <h3 className="font-bold text-orange-400 mb-4 text-lg flex items-center gap-2"><i className="fas fa-bell animate-pulse"></i> Permits Requiring Your Authorization</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {myPendingApprovals.map(p => (
                                        <div key={p.id} className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex flex-col justify-between font-['Inter']">
                                            <div>
                                                <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-1 rounded font-bold uppercase mb-2 inline-block border border-orange-500/30">{p.id}</span>
                                                <h4 className="font-bold text-white text-sm mb-1 line-clamp-2">{p.description}</h4>
                                                <p className="text-xs text-slate-400 mb-4 truncate">{p.location}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => openForm(p)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 rounded-lg transition uppercase tracking-wider">Review</button>
                                                <button onClick={() => changeStatus(p, 'Active')} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-lg shadow transition flex items-center justify-center gap-2 uppercase tracking-wider"><i className="fas fa-check"></i> Approve</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <h3 className="font-bold text-white mb-4 text-xl">Recently Active Permits</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 font-['Inter']">
                            {filteredPermits.filter(p => p.status === 'Active' || p.status === 'Pending Approval').slice(0, 6).map(p => {
                                const tConfig = getTypeConfig(p.typeId);
                                return (
                                    <div key={p.id} className={`glass-panel p-5 rounded-2xl border-t-4 shadow-lg hover:shadow-xl transition-shadow ${tConfig.border.replace('border-', 'border-t-')}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${tConfig.bg} ${tConfig.color} ${tConfig.border}`}>{tConfig.label}</span>
                                            <span className="font-mono text-xs text-slate-400 font-bold">{p.id}</span>
                                        </div>
                                        <h4 className="font-bold text-white mb-1 truncate">{p.description}</h4>
                                        <p className="text-xs text-slate-400 mb-4"><i className="fas fa-location-dot mr-1"></i> {p.location} ({p.siteId})</p>
                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider border-t border-slate-800 pt-3">
                                            <span className={p.status === 'Active' ? 'text-emerald-400 animate-pulse' : 'text-orange-400'}>{p.status}</span>
                                            <span className="text-slate-500">Valid Till: {p.validToTime}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* INVENTORY / REGISTRY */}
                {currentView === 'inventory' && (
                    <div className="p-8 max-w-7xl mx-auto animate-fade-in font-['Space_Grotesk']">
                        <div className="mb-6 flex justify-between items-end">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Permit Registry</h2>
                                <p className="text-sm text-slate-400 font-['Inter']">Master log of all drafted, active, and historical permits.</p>
                            </div>
                            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none w-48 focus:border-amber-500 shadow-lg font-['Inter'] text-sm font-bold">
                                <option value="All">All Sites</option>
                                {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </select>
                        </div>

                        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700 shadow-xl font-['Inter']">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-700 tracking-widest">
                                    <tr>
                                        <th className="p-4 pl-6">PTW Ref</th>
                                        <th className="p-4">Type</th>
                                        <th className="p-4">Location / Work</th>
                                        <th className="p-4">Validity</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4 pr-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                                    {filteredPermits.map((p, i) => {
                                        const tConfig = getTypeConfig(p.typeId);
                                        return (
                                            <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                                <td className="p-4 pl-6 font-mono text-xs font-bold text-white">{p.id}</td>
                                                <td className="p-4"><span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${tConfig.bg} ${tConfig.color} ${tConfig.border}`}>{tConfig.label}</span></td>
                                                <td className="p-4">
                                                    <div className="font-bold text-slate-200 truncate max-w-xs">{p.description}</div>
                                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">{p.location} ({p.siteId})</div>
                                                </td>
                                                <td className="p-4 text-xs font-mono text-slate-400">{String(p.validFromDate || '').slice(5)} to {String(p.validToDate || '').slice(5)}<br />{p.validFromTime}-{p.validToTime}</td>
                                                <td className="p-4">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${p.status === 'Active' ? 'text-emerald-400' : p.status === 'Pending Approval' ? 'text-orange-400' : p.status === 'Closed' ? 'text-slate-500' : 'text-blue-400'}`}>{p.status}</span>
                                                </td>
                                                <td className="p-4 pr-6 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {p.status === 'Pending Approval' && (session.user === p.pendingApprover || session.role === 'Owner') && (
                                                        <button onClick={() => changeStatus(p, 'Active')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow flex items-center"><i className="fas fa-check mr-1"></i> Approve</button>
                                                    )}
                                                    {p.status === 'Active' && (
                                                        <button onClick={() => changeStatus(p, 'Closed')} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow flex items-center border border-slate-500"><i className="fas fa-times mr-1"></i> Close</button>
                                                    )}
                                                    <button onClick={() => triggerPrint(p)} className="bg-slate-800 hover:bg-slate-700 text-white w-8 h-8 rounded-lg text-sm transition border border-slate-600 shadow flex items-center justify-center"><i className="fas fa-print"></i></button>
                                                    <button onClick={() => openForm(p)} className="bg-slate-800 hover:bg-amber-600 text-white w-8 h-8 rounded-lg text-sm transition border border-slate-600 shadow flex items-center justify-center"><i className="fas fa-edit"></i></button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredPermits.length === 0 && <tr><td colSpan={6} className="p-16 text-center text-slate-500 italic text-base border-t border-slate-800">No permits found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* BUILDER FORM */}
                {currentView === 'builder' && formData && (
                    <div className="p-6 md:p-8 animate-fade-in max-w-5xl mx-auto font-['Space_Grotesk']">
                        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                            <h2 className="text-3xl font-bold text-white">Permit Builder</h2>
                            <div className="flex gap-3">
                                <button onClick={() => setCurrentView('inventory')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl font-bold text-sm transition font-['Inter']">Cancel</button>

                                {formData.status === 'Draft' ? (
                                    <>
                                        <button onClick={() => handleSave(true)} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow transition font-['Inter']">Save Draft</button>
                                        <button onClick={() => setApproverModalOpen(true)} className="bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-amber-900/50 transition font-['Inter'] flex items-center gap-2"><i className="fas fa-paper-plane"></i> Send for Approval</button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => triggerPrint(formData)} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow transition flex items-center gap-2 font-['Inter']"><i className="fas fa-print"></i> Print Permit</button>
                                        {formData.status === 'Pending Approval' && (session.user === formData.pendingApprover || session.role === 'Owner') && (
                                            <button onClick={() => changeStatus(formData, 'Active')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg transition flex items-center gap-2 font-['Inter']"><i className="fas fa-check"></i> Authorize & Activate</button>
                                        )}
                                        {formData.status === 'Active' && (
                                            <button onClick={() => changeStatus(formData, 'Closed')} className="bg-red-600 hover:bg-red-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg transition flex items-center gap-2 font-['Inter']"><i className="fas fa-times"></i> Close Permit</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="space-y-8 font-['Inter']">
                            {/* SECTION 1: CONTEXT */}
                            <div className="bg-slate-800/80 p-8 rounded-3xl shadow-xl border-t-4 border-amber-500">
                                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4 font-['Space_Grotesk']">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-info-circle text-amber-500"></i> Section 1: Job Context</h3>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded border shadow-sm ${formData.status === 'Active' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500' : formData.status === 'Pending Approval' ? 'bg-orange-900/30 text-orange-400 border-orange-500' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>{formData.status}</span>
                                        <span className="font-mono text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-700 text-white font-bold shadow-inner">{formData.id}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Permit Category</label>
                                        <select value={formData.typeId} onChange={e => updateField('typeId', e.target.value)} disabled={formData.status !== 'Draft'} className="font-bold text-amber-400 border border-amber-900/50 shadow-inner">
                                            {PERMIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Site / Facility</label>
                                        <select value={formData.siteId} onChange={e => updateField('siteId', e.target.value)} disabled={formData.status !== 'Draft'} className="font-bold text-white shadow-inner">
                                            <option value="">Select Site...</option>
                                            {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                    </div>

                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Issuing Department</label><input value={formData.issuingDept} onChange={e => updateField('issuingDept', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="e.g. Maintenance, Production" className="shadow-inner" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Issued To (Name)</label><input value={formData.issuedToName} onChange={e => updateField('issuedToName', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="Supervisor Name" className="shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Contact No.</label><input value={formData.issuedToPh} onChange={e => updateField('issuedToPh', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="Phone Number" className="shadow-inner" /></div>
                                    </div>

                                    <div className="md:col-span-2"><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Detailed Work Description</label><textarea rows="3" value={formData.description} onChange={e => updateField('description', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="Describe the exact nature of the work, tools used, and method..." className="resize-none font-medium text-white shadow-inner custom-scroll"></textarea></div>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Specific Area / Location</label><input value={formData.location} onChange={e => updateField('location', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="e.g. Roof of Boiler Room" className="shadow-inner" /></div>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Equipment Involved (Optional)</label><input value={formData.equipment} onChange={e => updateField('equipment', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="e.g. HVAC Unit B" className="shadow-inner" /></div>
                                </div>
                            </div>

                            {/* CONDITIONAL SPECIALTY SECTIONS */}
                            {formData.typeId === 'HOT' && (
                                <div className="bg-red-900/20 p-8 rounded-3xl shadow-xl border border-red-500/30 animate-fade-in">
                                    <h3 className="text-lg font-bold text-red-400 flex items-center gap-2 mb-4 font-['Space_Grotesk']"><i className="fas fa-fire"></i> Hot Work Specifics</h3>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-300 block mb-2 tracking-widest">Name of Fire Watcher</label><input value={formData.fireWatcherName} onChange={e => updateField('fireWatcherName', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="Designated Fire Watcher Name" className="border border-red-900/50 focus:border-red-500 shadow-inner" /></div>
                                </div>
                            )}

                            {formData.typeId === 'CSE' && (
                                <div className="bg-purple-900/20 p-8 rounded-3xl shadow-xl border border-purple-500/30 space-y-6 animate-fade-in">
                                    <h4 className="text-sm font-bold text-purple-400 uppercase tracking-widest border-b border-purple-500/30 pb-2 font-['Space_Grotesk']"><i className="fas fa-door-open mr-1"></i> CSE Personnel</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div><label className="text-[10px] uppercase font-bold text-slate-300 block mb-2 tracking-widest">Attendant Name (Standby)</label><input value={formData.attendantName} onChange={e => updateField('attendantName', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="Person outside space..." className="border border-purple-900/50 focus:border-purple-500 shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-300 block mb-2 tracking-widest">Entry Supervisor</label><input value={formData.entrySupervisorName} onChange={e => updateField('entrySupervisorName', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="Supervisor authorizing..." className="border border-purple-900/50 focus:border-purple-500 shadow-inner" /></div>

                                        <div className="md:col-span-2">
                                            <div className="flex justify-between items-center mb-3">
                                                <label className="text-[10px] uppercase font-bold text-slate-300 tracking-widest">Authorized Entrants</label>
                                                {formData.status === 'Draft' && <button onClick={addEntrant} className="text-[10px] bg-purple-600 hover:bg-purple-500 transition px-3 py-1.5 rounded-lg text-white font-bold uppercase tracking-widest shadow"><i className="fas fa-plus mr-1"></i> Add Entrant</button>}
                                            </div>
                                            {(formData.entrantNames || []).map((ent, idx) => (
                                                <div key={idx} className="flex gap-2 mb-2">
                                                    <input value={ent} onChange={e => updateEntrant(idx, e.target.value)} disabled={formData.status !== 'Draft'} placeholder={`Entrant ${idx + 1} Name`} className="border border-purple-900/50 focus:border-purple-500 shadow-inner" />
                                                    {formData.status === 'Draft' && (formData.entrantNames || []).length > 1 && <button onClick={() => removeEntrant(idx)} className="bg-red-900/30 hover:bg-red-600 text-red-500 hover:text-white px-4 rounded-lg transition-colors border border-red-500/30"><i className="fas fa-times"></i></button>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <h4 className="text-sm font-bold text-purple-400 uppercase tracking-widest border-b border-purple-500/30 pb-2 mt-4 font-['Space_Grotesk']"><i className="fas fa-wind mr-1"></i> Pre-Entry Gas Test Results</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 tracking-widest">Oxygen Level (&gt;19.5%)</label><input value={formData.oxygenLevel} onChange={e => updateField('oxygenLevel', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="e.g. 20.9%" className="font-mono border border-purple-900/50 shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 tracking-widest">Flammability (LEL &lt; 10%)</label><input value={formData.flammability} onChange={e => updateField('flammability', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="e.g. 0%" className="font-mono border border-purple-900/50 shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 tracking-widest">Toxic Gas Concentration</label><input value={formData.toxicGas} onChange={e => updateField('toxicGas', e.target.value)} disabled={formData.status !== 'Draft'} placeholder="e.g. H2S 0ppm" className="font-mono border border-purple-900/50 shadow-inner" /></div>
                                    </div>
                                </div>
                            )}

                            {/* ELECTRICAL LOTO */}
                            {formData.typeId === 'ELE' && (
                                <div className="bg-amber-900/10 p-8 rounded-3xl border border-amber-500/30 shadow-xl animate-fade-in">
                                    <label className="text-xs uppercase font-bold text-amber-400 block mb-3 tracking-widest font-['Space_Grotesk']"><i className="fas fa-lock mr-2"></i> LOTO Linkage Required</label>
                                    <select value={formData.lotoRef} onChange={e => updateField('lotoRef', e.target.value)} disabled={formData.status !== 'Draft'} className="border border-amber-900/50 focus:border-amber-500 font-bold text-white shadow-inner p-4 text-base">
                                        <option value="">-- Select Active Approved LOTO Procedure --</option>
                                        {lotoProcedures.filter(p => p.status === 'Approved' && (p.facility === formData.siteId || !formData.siteId)).map(p => (
                                            <option key={p.id} value={p.id}>{p.id} - {p.description}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-slate-500 mt-3"><i className="fas fa-info-circle mr-1"></i> Electrical permits require a designated energy isolation protocol to be selected before authorization.</p>
                                </div>
                            )}

                            {/* WORK AT HEIGHT */}
                            {formData.typeId === 'WAH' && (
                                <div className="bg-blue-900/10 p-8 rounded-3xl border border-blue-500/30 shadow-xl animate-fade-in">
                                    <label className="text-sm uppercase font-bold text-blue-400 block mb-5 tracking-widest font-['Space_Grotesk']"><i className="fas fa-arrow-up mr-2"></i> Height Access Equipment to be used</label>
                                    <div className="flex flex-wrap gap-3">
                                        {WAH_EQUIP_OPTIONS.map(eq => (
                                            <label key={eq} className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all ${(formData.wahEquipment || []).includes(eq) ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/50' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'}`}>
                                                <input type="checkbox" checked={(formData.wahEquipment || []).includes(eq)} onChange={() => formData.status === 'Draft' && toggleWahEquip(eq)} disabled={formData.status !== 'Draft'} className="hidden" />
                                                <span className="text-sm font-bold">{eq}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* SECTION 2: TIMING */}
                            <div className="bg-slate-800/80 p-8 rounded-3xl shadow-xl border border-slate-700">
                                <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-6 border-b border-slate-700 pb-4 font-['Space_Grotesk']"><i className="fas fa-clock text-amber-500"></i> Section 2: Validity Window</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Valid From (Date)</label><input type="date" value={formData.validFromDate} onChange={e => updateField('validFromDate', e.target.value)} disabled={formData.status !== 'Draft'} className="font-mono border border-slate-800 shadow-inner" /></div>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Start Time</label><input type="time" value={formData.validFromTime} onChange={e => updateField('validFromTime', e.target.value)} disabled={formData.status !== 'Draft'} className="font-mono border border-slate-800 shadow-inner" /></div>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Valid To (Date)</label><input type="date" value={formData.validToDate} onChange={e => updateField('validToDate', e.target.value)} disabled={formData.status !== 'Draft'} className="font-mono border border-slate-800 shadow-inner" /></div>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">End Time</label><input type="time" value={formData.validToTime} onChange={e => updateField('validToTime', e.target.value)} disabled={formData.status !== 'Draft'} className="font-mono border border-slate-800 shadow-inner" /></div>
                                </div>
                            </div>

                            {/* SECTION 4: WMS (WORK METHOD STATEMENT) */}
                            <div className="bg-slate-800/80 p-8 rounded-3xl shadow-xl border border-slate-700">
                                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4 font-['Space_Grotesk']">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-tasks text-amber-500"></i> Section 3: Work Method Statement</h3>
                                    {formData.status === 'Draft' && <button onClick={addWmsRow} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 uppercase tracking-widest"><i className="fas fa-plus"></i> Add Step</button>}
                                </div>

                                <div className="overflow-x-auto rounded-2xl border border-slate-700 shadow-2xl">
                                    <table className="w-full text-left text-sm min-w-[800px]">
                                        <thead className="bg-slate-900 text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b border-slate-800">
                                            <tr>
                                                <th className="p-4 w-12 text-center">#</th>
                                                <th className="p-4 w-1/3">Work Step / Activity</th>
                                                <th className="p-4 w-1/3">Possible Hazard</th>
                                                <th className="p-4 w-1/3">Control / Precaution</th>
                                                <th className="p-4 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/80 bg-slate-950/80">
                                            {(formData.wms || []).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-slate-900 transition-colors">
                                                    <td className="p-4 text-center font-bold text-slate-500">{idx + 1}</td>
                                                    <td className="p-3"><textarea rows="2" value={row?.step || ''} onChange={e => updateWmsRow(idx, 'step', e.target.value)} disabled={formData.status !== 'Draft'} className="bg-transparent border border-transparent hover:border-slate-800 focus:border-amber-500 text-sm py-2 px-3 resize-none h-full outline-none text-white transition-colors custom-scroll" placeholder="What are you doing?"></textarea></td>
                                                    <td className="p-3"><textarea rows="2" value={row?.hazard || ''} onChange={e => updateWmsRow(idx, 'hazard', e.target.value)} disabled={formData.status !== 'Draft'} className="bg-transparent border border-transparent hover:border-slate-800 focus:border-red-500 text-sm py-2 px-3 resize-none h-full text-red-200 outline-none transition-colors custom-scroll" placeholder="What could go wrong?"></textarea></td>
                                                    <td className="p-3"><textarea rows="2" value={row?.precaution || ''} onChange={e => updateWmsRow(idx, 'precaution', e.target.value)} disabled={formData.status !== 'Draft'} className="bg-transparent border border-transparent hover:border-slate-800 focus:border-emerald-500 text-sm py-2 px-3 resize-none h-full text-emerald-200 outline-none transition-colors custom-scroll" placeholder="How to prevent it?"></textarea></td>
                                                    <td className="p-3 text-center">
                                                        {formData.status === 'Draft' && (formData.wms || []).length > 1 && <button onClick={() => removeWmsRow(idx)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 px-3 py-2 rounded-lg transition-colors border border-red-500/30"><i className="fas fa-trash"></i></button>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* SECTION 5: PPE & CHECKLIST */}
                            <div className="bg-slate-800/80 p-8 rounded-3xl shadow-xl border border-slate-700">
                                <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-6 border-b border-slate-700 pb-4 font-['Space_Grotesk']"><i className="fas fa-clipboard-check text-amber-500"></i> Section 4: Standard Safety Checks</h3>

                                <div className="mb-10">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-4 tracking-widest">Required General PPE</label>
                                    <div className="flex flex-wrap gap-4">
                                        {COMMON_PPE.map(ppe => (
                                            <label key={ppe} className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all ${(formData.ppe || []).includes(ppe) ? 'bg-amber-900/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-900/30' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-500'}`}>
                                                <input type="checkbox" checked={(formData.ppe || []).includes(ppe)} onChange={() => formData.status === 'Draft' && togglePPE(ppe)} disabled={formData.status !== 'Draft'} className="w-4 h-4 accent-amber-500" />
                                                <span className="text-sm font-bold">{ppe}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-t border-slate-700 pt-8">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-4 tracking-widest">Pre-Work Verification Checklist ({(getTypeConfig(formData.typeId) || PERMIT_TYPES[5]).label})</label>
                                    <div className="space-y-3 bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                        {(formData.checklist || []).map((item, idx) => (
                                            <label key={idx} className={`flex items-start gap-4 cursor-pointer group p-4 rounded-xl border transition-colors ${item?.checked ? 'bg-emerald-900/10 border-emerald-500/30 shadow-inner' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}>
                                                <input type="checkbox" checked={item?.checked || false} onChange={() => formData.status === 'Draft' && toggleChecklistItem(idx)} disabled={formData.status !== 'Draft'} className="w-5 h-5 accent-emerald-500 mt-0.5" />
                                                <span className={`text-base font-medium ${item?.checked ? 'text-emerald-400' : 'text-slate-300 group-hover:text-white'}`}>{item?.label || ''}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* APPROVAL MODAL */}
                {approverModalOpen && (
                    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 print:hidden">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-fade-in font-['Space_Grotesk']">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/10 rounded-full blur-[50px] pointer-events-none"></div>
                            <h2 className="text-2xl font-bold text-white mb-2 relative z-10"><i className="fas fa-user-check text-amber-500 mr-2"></i> Assign Authorizer</h2>
                            <p className="text-sm text-slate-400 mb-8 relative z-10">Select the Area Incharge or Manager responsible for authorizing this permit.</p>

                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Select User</label>
                            <select value={selectedApprover} onChange={e => setSelectedApprover(e.target.value)} className="w-full mb-8 font-bold text-white text-base py-4 px-4 bg-slate-950 border border-slate-700 rounded-xl outline-none focus:border-amber-500 shadow-inner relative z-10">
                                <option value="">-- Choose Approver --</option>
                                <option value={myName} className="bg-slate-800 text-amber-400 font-bold">➡️ Assign to Me ({myName})</option>
                                {siteUsers.filter(u => u.role === 'Manager' || u.role === 'Owner').map(u => (
                                    <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                                ))}
                            </select>

                            <div className="flex gap-4 relative z-10">
                                <button onClick={() => setApproverModalOpen(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition uppercase tracking-widest text-xs border border-slate-700">Cancel</button>
                                <button onClick={() => handleSave(false)} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition uppercase tracking-widest text-xs"><i className="fas fa-paper-plane mr-2"></i> Send Request</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* PRINT VIEW LAYER */}
                {printData && (
                    <div className="hidden print:block p-8 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                            <div className="text-left w-3/4">
                                <div className="text-xs text-gray-500 font-bold mb-1 tracking-widest uppercase">OHSMS - FORMAL RECORD (ISO 45001)</div>
                                <h1 className="text-2xl font-black uppercase m-0 p-0 leading-tight">{(getTypeConfig(printData.typeId) || PERMIT_TYPES[5]).label}</h1>
                            </div>
                            <div className="w-1/4 text-right flex justify-end">
                                {qrImage && <img src={qrImage} alt="QR Code" className="w-24 h-24 border-2 border-black p-1" />}
                            </div>
                        </div>

                        <div className="border border-black bg-gray-50 p-4 mb-6">
                            <table className="w-full text-sm border-none">
                                <tbody>
                                    <tr>
                                        <td className="w-[15%] py-1.5 font-bold border-b border-gray-300">Permit No:</td><td className="w-[35%] py-1.5 font-mono text-lg font-black border-b border-gray-300">{printData.id}</td>
                                        <td className="w-[15%] py-1.5 font-bold border-b border-gray-300 pl-4">Status:</td><td className="w-[35%] py-1.5 uppercase font-bold border-b border-gray-300">{printData.status}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] py-1.5 font-bold border-b border-gray-300">Facility:</td><td className="w-[35%] py-1.5 font-bold border-b border-gray-300">{printData.siteId}</td>
                                        <td className="w-[15%] py-1.5 font-bold border-b border-gray-300 pl-4">Location:</td><td className="w-[35%] py-1.5 font-bold border-b border-gray-300">{printData.location}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] py-1.5 font-bold border-b border-gray-300">Issuing Dept:</td><td className="w-[35%] py-1.5 border-b border-gray-300">{printData.issuingDept || 'N/A'}</td>
                                        <td className="w-[15%] py-1.5 font-bold border-b border-gray-300 pl-4">Equipment:</td><td className="w-[35%] py-1.5 border-b border-gray-300">{printData.equipment || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] py-1.5 font-bold border-none">Issued To:</td><td className="w-[35%] py-1.5 font-bold border-none">{printData.issuedToName} (Ph: {printData.issuedToPh})</td>
                                        <td className="w-[15%] py-1.5 font-bold border-none pl-4">Validity:</td><td className="w-[35%] py-1.5 font-bold border-none font-mono">{printData.validFromDate} to {printData.validToDate}<br />{printData.validFromTime} - {printData.validToTime}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* DYNAMIC SECTIONS BASED ON TYPE */}
                        {(printData.typeId === 'HOT' || printData.typeId === 'CSE' || printData.typeId === 'ELE' || printData.typeId === 'WAH') && (
                            <div className="mb-6 border-2 border-black p-4 bg-gray-50">
                                <h2 className="text-sm font-bold mb-3 uppercase underline">Specialized Controls</h2>
                                <table className="w-full text-sm border-none">
                                    <tbody>
                                        {printData.typeId === 'HOT' && <tr><td className="w-1/4 font-bold py-1">Fire Watcher Name:</td><td className="py-1">{printData.fireWatcherName || 'N/A'}</td></tr>}
                                        {printData.typeId === 'ELE' && <tr><td className="w-1/4 font-bold py-1">LOTO Procedure Ref:</td><td className="font-bold font-mono py-1">{printData.lotoRef || 'N/A'}</td></tr>}
                                        {printData.typeId === 'WAH' && <tr><td className="w-1/4 font-bold py-1 align-top">Height Access Equip:</td><td className="py-1">{(printData.wahEquipment || []).join(', ')}</td></tr>}
                                        {printData.typeId === 'CSE' && (
                                            <>
                                                <tr><td className="font-bold py-1 border-b border-gray-300">Attendant:</td><td className="py-1 border-b border-gray-300">{printData.attendantName}</td><td className="font-bold py-1 border-b border-gray-300 pl-4">Supervisor:</td><td className="py-1 border-b border-gray-300">{printData.entrySupervisorName}</td></tr>
                                                <tr><td className="font-bold py-1 border-b border-gray-300 align-top">Entrants:</td><td colSpan={3} className="py-1 border-b border-gray-300">{(printData.entrantNames || []).join(', ')}</td></tr>
                                                <tr>
                                                    <td className="font-bold py-1 border-b border-gray-300 mt-1 pt-1">Oxygen:</td><td className="py-1 border-b border-gray-300 font-mono mt-1 pt-1">{printData.oxygenLevel}</td>
                                                    <td className="font-bold py-1 border-b border-gray-300 pl-4 mt-1 pt-1">Toxic Gas:</td><td className="py-1 border-b border-gray-300 font-mono mt-1 pt-1">{printData.toxicGas}</td>
                                                </tr>
                                                <tr><td className="font-bold py-1 border-none">Flammability:</td><td colSpan={3} className="py-1 border-none font-mono">{printData.flammability}</td></tr>
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mb-6">
                            <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1.5 border border-black inline-block">1. Description of Work</h2>
                            <div className="text-sm border border-black p-3 min-h-[60px] leading-relaxed">{printData.description}</div>
                        </div>

                        <div className="mb-6 page-break-inside-avoid">
                            <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1.5 border border-black inline-block">2. Work Method Statement (WMS)</h2>
                            <table className="w-full text-sm border-collapse border border-black m-0">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="w-10 text-center border border-black p-2">#</th>
                                        <th className="w-1/3 border border-black p-2">Step / Activity</th>
                                        <th className="w-1/3 border border-black p-2">Possible Hazard</th>
                                        <th className="w-1/3 border border-black p-2">Control / Precaution</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(printData.wms || []).map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="text-center font-bold border border-black p-2">{idx + 1}</td>
                                            <td className="border border-black p-2">{row?.step || ''}</td>
                                            <td className="border border-black p-2">{row?.hazard || ''}</td>
                                            <td className="border border-black p-2">{row?.precaution || ''}</td>
                                        </tr>
                                    ))}
                                    {(!printData.wms || printData.wms.length === 0) && <tr><td colSpan={4} className="text-center italic border border-black p-2">No steps recorded.</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex gap-6 mb-6 page-break-inside-avoid">
                            <div className="w-1/2">
                                <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1.5 border border-black inline-block">3. Required PPE</h2>
                                <div className="text-sm border border-black p-4 min-h-[100px] leading-loose">
                                    {(printData.ppe || []).length > 0 ? (printData.ppe || []).join(', ') : 'Standard PPE Only'}
                                </div>
                            </div>
                            <div className="w-1/2">
                                <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1.5 border border-black inline-block">4. Pre-Work Verification</h2>
                                <div className="text-xs border border-black p-4 min-h-[100px] space-y-2">
                                    {(printData.checklist || []).map((c, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <div className="w-3 h-3 border border-black shrink-0 mt-0.5" style={{ backgroundColor: c?.checked ? 'black' : 'transparent' }}></div>
                                            <span>{c?.label || ''}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 border-2 border-black page-break-inside-avoid">
                            <h2 className="text-center font-bold text-sm uppercase bg-gray-200 border-b-2 border-black p-2">5. Authorization & Signatures</h2>
                            <p className="text-[10px] text-center p-1.5 border-b border-gray-300 italic bg-gray-50">By signing, I confirm the area is safe, precautions are implemented, and workers are briefed.</p>
                            <table className="w-full text-sm border-none">
                                <tbody>
                                    <tr>
                                        <td className="w-1/3 p-4 border-r border-black align-top h-32">
                                            <strong className="block mb-6 uppercase tracking-widest text-xs">Requested By:</strong>
                                            Name: <strong className="text-base">{printData.requestedBy}</strong><br /><br /><br />
                                            Sign: __________________
                                        </td>
                                        <td className="w-1/3 p-4 border-r border-black align-top h-32">
                                            <strong className="block mb-6 uppercase tracking-widest text-xs">Area In-Charge (Approver):</strong>
                                            Name: <strong className="text-base">{printData.areaInchargeSignature || printData.pendingApprover || '________________'}</strong><br /><br /><br />
                                            Sign: __________________
                                        </td>
                                        <td className="w-1/3 p-4 align-top h-32">
                                            <strong className="block mb-6 uppercase tracking-widest text-xs">Job Completion (Close Out):</strong>
                                            Name: __________________<br /><br /><br />
                                            Sign/Time: __________________
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="text-center text-[10px] mt-4 font-bold text-gray-500 uppercase tracking-widest">System Generated Document - Verify Live Status via QR Code</div>
                    </div>
                )}

            </main>
        </div>
    );
}