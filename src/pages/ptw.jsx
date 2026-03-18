import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import QRious from 'qrious';

// --- DATA SAFETY ENGINE ---
const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
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
    'HOT': ["Fire extinguisher/fire hose available", "Combustible materials removed (>10m)", "Gas test done (LFL < 10%)", "Fire watcher assigned", "Welding screens used", "Adequate ventilation for fumes", "Sparks contained"],
    'WAH': ["Scaffold tag is green", "Full body harness used", "Lifeline / Fall arrester used", "Safety nets provided", "Safe access / egress provided", "Anchorage Point verified", "Usage of Roof lifeline"],
    'CSE': ["Oxygen level checked (>19.5%)", "Toxic gas checked", "Adequate ventilation provided", "Attendant present outside", "Rescue Team on alert", "Communication established", "Respirator / SCBA provided"],
    'ELE': ["LOTO applied (Lockout/Tagout)", "Insulated tools to be used", "Rubber mat provided", "Proper PPE (Arc flash) used", "Zero energy verified"],
    'EXC': ["Underground cables checked", "Underground pipes checked", "Shoring/Sloping done", "Barricades & warning signs provided", "Safe access / egress"],
    'GEN': ["Job briefed to all personnel", "Warning signs displayed", "Equipment / Tools checked", "Safe access / egress provided", "Housekeeping maintained"]
};

const COMMON_PPE = ["Hard Hat", "Safety Glasses", "Safety Shoes", "Gloves", "Hi-Vis Vest", "Ear Protection", "Face Shield", "Fall Harness", "Respirator", "FR Clothing"];
const WAH_EQUIP_OPTIONS = ["Fixed Scaffold", "Mobile Scaffold", "A-Frame Ladder", "Extension Ladder", "MEWP / Boom Lift", "Scissor Lift", "Rope Access System"];

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
        engApproverEmail: String(p.engApproverEmail || ''),
        prodApproverEmail: String(p.prodApproverEmail || ''),
        engStatus: String(p.engStatus || 'Pending'),
        prodStatus: String(p.prodStatus || 'Pending'),
        creatorEmail: String(p.creatorEmail || ''),
        requestedBy: String(p.requestedBy || ''),
        workerType: String(p.workerType || 'Internal'),
        contractorId: String(p.contractorId || ''),
        contractorName: String(p.contractorName || ''),
        wms: safeArr(p.wms),
        entrantNames: safeArr(p.entrantNames),
        wahEquipment: safeArr(p.wahEquipment),
        ppe: safeArr(p.ppe),
        checklist: safeArr(p.checklist),
        nonCompliances: safeArr(p.nonCompliances)
    };
};

const getTypeConfig = (tId) => PERMIT_TYPES.find(t => t.id === tId) || PERMIT_TYPES[5];

export default function PTW() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('dashboard');
    const [saving, setSaving] = useState(false);

    const [permits, setPermits] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [contractors, setContractors] = useState([]);
    const [lotoProcedures, setLotoProcedures] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');

    const [printData, setPrintData] = useState(null);
    const [qrImage, setQrImage] = useState(null);
    const [inspectionModal, setInspectionModal] = useState(null);
    const [reassignModal, setReassignModal] = useState(null);
    const [newApproverEmail, setNewApproverEmail] = useState('');
    const [newNC, setNewNC] = useState('');

    const [formData, setFormData] = useState(null);

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        if (!isGlobalAdmin && ctxSite === 'All') ctxSite = sess.assignedSite;
        setSiteFilter(ctxSite);

        const fetchData = async () => {
            try {
                const snap = await get(ref(rtdb, `organizations/${sess.orgId}`));
                if (snap.exists()) {
                    const data = snap.val();

                    if (data.workPermits) {
                        let ptwArr = Array.isArray(data.workPermits)
                            ? data.workPermits.filter(Boolean).map((v, i) => ({ ...v, firebaseKey: String(i) }))
                            : Object.entries(data.workPermits).map(([k, v]) => ({ ...v, firebaseKey: k }));
                        setPermits(ptwArr.map(normalizePermit).sort((a, b) => new Date(b.createdAt || b.validFromDate) - new Date(a.createdAt || a.validFromDate)));
                    }

                    if (data.sites) setSites(Object.keys(data.sites).map(key => ({ code: data.sites[key].code || key, name: data.sites[key].name || key })));

                    if (data.users) setUsers(Object.entries(data.users).map(([k, v]) => ({ id: k, ...v })).filter(u => u.status !== 'Inactive'));

                    if (data.contractors) setContractors(Object.entries(data.contractors).map(([k, v]) => ({ ...v, firebaseKey: k })));

                    if (data.lotoProcedures) {
                        let lotoArr = Array.isArray(data.lotoProcedures)
                            ? data.lotoProcedures.filter(Boolean).map((v, i) => ({ ...v, firebaseKey: String(i) }))
                            : Object.entries(data.lotoProcedures).map(([k, v]) => ({ ...v, firebaseKey: k }));
                        setLotoProcedures(lotoArr);
                    }
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [navigate, location]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager'].includes(session?.role);

    const allowedSites = useMemo(() => isGlobalUser ? sites : sites.filter(s => s.code === session?.assignedSite || safeArr(session?.accessibleSites).includes(s.code)), [sites, isGlobalUser, session]);

    const visiblePermits = useMemo(() => permits.filter(p => {
        if (!isGlobalUser && p.siteId !== session?.assignedSite && !safeArr(session?.accessibleSites).includes(p.siteId)) return false;
        if (siteFilter !== 'All' && p.siteId !== siteFilter) return false;
        return true;
    }), [permits, siteFilter, isGlobalUser, session]);


    // --- DYNAMIC FILTERING ENGINE FOR CONTRACTORS & WORKERS ---
    const availableContractors = useMemo(() => {
        if (!formData?.siteId) return [];
        return contractors.filter(c => safeArr(c.allocatedSites).includes(formData.siteId) || c.siteId === 'GLOBAL');
    }, [contractors, formData?.siteId]);

    const availableWorkers = useMemo(() => {
        if (!formData) return [];
        if (formData.workerType === 'Internal') return users.filter(u => u.assignedSite === formData.siteId || safeArr(u.accessibleSites).includes(formData.siteId) || u.assignedSite === 'GLOBAL');

        if (formData.workerType === 'Contractor' && formData.contractorId) {
            const vendor = contractors.find(c => c.firebaseKey === formData.contractorId);
            return safeArr(vendor?.workers).filter(w => w.deployedSite === formData.siteId || vendor?.siteId === 'GLOBAL');
        }
        return [];
    }, [formData?.workerType, formData?.siteId, formData?.contractorId, users, contractors]);

    // --- FORM OPENING/CREATING ENGINE ---
    const handleCreateNew = () => {
        const defaultSite = (!isGlobalUser && allowedSites.length === 1) ? allowedSites[0].code : (siteFilter !== 'All' ? siteFilter : '');

        setFormData({
            id: '',
            siteId: defaultSite,
            typeId: 'HOT',
            permitType: 'HOT WORK PERMIT',
            workDescription: '',
            location: '',
            equipment: '',
            issuingDept: '',
            issuedToName: '',
            issuedToPh: '',
            validFromDate: new Date().toISOString().split('T')[0],
            validToDate: new Date().toISOString().split('T')[0],
            validFromTime: '08:00',
            validToTime: '17:00',
            workerType: 'Internal',
            contractorId: '',
            contractorName: '',
            entrantNames: [],
            wms: [{ step: '', hazard: '', precaution: '' }],
            ppe: ["Hard Hat", "Safety Glasses", "Safety Shoes"],
            checklist: CHECKLIST_ITEMS['HOT'].map(item => ({ label: item, checked: false })),
            nonCompliances: [],
            status: 'Draft',
            engStatus: 'Pending',
            prodStatus: 'Pending',
            engApproverEmail: '',
            prodApproverEmail: '',
            fireWatcherName: '',
            attendantName: '',
            entrySupervisorName: '',
            oxygenLevel: '',
            toxicGas: '',
            flammability: '',
            lotoRef: '',
            wahEquipment: []
        });
        setView('form');
    };

    const handleTypeChange = (newTypeId) => {
        const tConfig = PERMIT_TYPES.find(t => t.id === newTypeId) || PERMIT_TYPES[5];
        setFormData(prev => ({
            ...prev,
            typeId: newTypeId,
            permitType: tConfig.label,
            checklist: prev.status === 'Draft' ? (CHECKLIST_ITEMS[newTypeId] || CHECKLIST_ITEMS['GEN']).map(item => ({ label: item, checked: false })) : prev.checklist
        }));
    };

    const toggleWorker = (name) => {
        setFormData(prev => {
            const currentEntrants = safeArr(prev.entrantNames);
            const exists = currentEntrants.includes(name);
            return { ...prev, entrantNames: exists ? currentEntrants.filter(n => n !== name) : [...currentEntrants, name] };
        });
    };

    const addNonCompliance = async () => {
        if (!newNC) return;
        const newRecord = { id: Date.now(), desc: newNC, date: new Date().toISOString().split('T')[0] };
        const updatedNCs = [...safeArr(formData.nonCompliances), newRecord];

        setFormData(prev => ({ ...prev, nonCompliances: updatedNCs }));
        setNewNC('');

        if (formData.firebaseKey) {
            try {
                await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${formData.firebaseKey}`), { nonCompliances: updatedNCs });
                setPermits(permits.map(p => p.id === formData.id ? normalizePermit({ ...p, nonCompliances: updatedNCs }) : p));
            } catch (e) { console.error("Failed to sync NC to DB", e); }
        }
    };

    const removeNonCompliance = async (id) => {
        const updatedNCs = safeArr(formData.nonCompliances).filter(nc => nc.id !== id);
        setFormData(prev => ({ ...prev, nonCompliances: updatedNCs }));

        if (formData.firebaseKey) {
            try {
                await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${formData.firebaseKey}`), { nonCompliances: updatedNCs });
                setPermits(permits.map(p => p.id === formData.id ? normalizePermit({ ...p, nonCompliances: updatedNCs }) : p));
            } catch (e) { console.error("Failed to sync NC removal to DB", e); }
        }
    };

    const savePermit = async (isDraft = true) => {
        if (!formData.siteId || !formData.workDescription || safeArr(formData.entrantNames).length === 0) return alert("Site, Description, and at least 1 Worker are required.");
        if (formData.workerType === 'Contractor' && !formData.contractorId) return alert("Please select the Contractor Company.");

        setSaving(true);
        try {
            const payload = { ...formData, updatedBy: session.name, lastUpdated: new Date().toISOString() };
            if (!payload.id) payload.id = `PTW-${Date.now().toString().slice(-6)}`;
            if (!payload.createdAt) payload.createdAt = new Date().toISOString();

            const vendor = contractors.find(c => c.firebaseKey === formData.contractorId);
            if (vendor) payload.contractorName = vendor.companyName;

            if (!isDraft) {
                if (!payload.engApproverEmail || !payload.prodApproverEmail) {
                    setSaving(false);
                    return alert("Cannot submit! Please scroll down to Section 5 and select both Engineering and Production approvers.");
                }
                payload.status = 'Pending Approval';
                payload.engStatus = 'Pending';
                payload.prodStatus = 'Pending';
            }

            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${formData.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/workPermits`), payload);
            }

            alert(`Success! Permit ${isDraft ? 'Draft Saved' : 'Sent for Dual Authorization'}.`);

            const snap = await get(ref(rtdb, `organizations/${session.orgId}/workPermits`));
            if (snap.exists()) {
                let ptwArr = Array.isArray(snap.val()) ? snap.val().filter(Boolean).map((v, i) => ({ ...v, firebaseKey: String(i) })) : Object.entries(snap.val()).map(([k, v]) => ({ ...v, firebaseKey: k }));
                setPermits(ptwArr.map(normalizePermit).sort((a, b) => new Date(b.createdAt || b.validFromDate) - new Date(a.createdAt || a.validFromDate)));
            }
            setView('dashboard');
        } catch (e) { alert("Save failed: " + e.message); }
        setSaving(false);
    };

    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleApproveInitiation = async (permit, role) => {
        if (!permit.firebaseKey) return alert("Database error.");
        try {
            const updates = {};
            if (role === 'eng') updates.engStatus = 'Approved';
            if (role === 'prod') updates.prodStatus = 'Approved';

            const isEngApproved = role === 'eng' ? true : permit.engStatus === 'Approved';
            const isProdApproved = role === 'prod' ? true : permit.prodStatus === 'Approved';

            if (isEngApproved && isProdApproved) {
                updates.status = 'Work in Progress';
                updates.statusUpdatedOn = new Date().toISOString();
                alert("Both authorizations received. Permit is now ACTIVE (Work In Progress).");
            } else {
                alert(`${role === 'eng' ? 'Engineering' : 'Production'} authorization recorded.`);
            }

            await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));
        } catch (e) { alert("Error approving: " + e.message); }
    };

    const handleInspectionSubmit = async (e, isNegative) => {
        e.preventDefault();
        if (!inspectionModal.firebaseKey) return alert("Database error: Permit missing key.");

        const obsText = e.target.observation.value;
        try {
            const updates = { lastInspection: obsText, lastInspectionDate: new Date().toISOString(), lastInspector: session.email || session.name };

            if (isNegative) {
                updates.status = 'Cancelled';
                updates.cancellationReason = "Failed Workplace Inspection: " + obsText;
                if (inspectionModal.workerType === 'Contractor') {
                    const newRecord = { id: Date.now(), desc: `CRITICAL SAFETY FAILURE: ${obsText}`, date: new Date().toISOString().split('T')[0] };
                    updates.nonCompliances = [...safeArr(inspectionModal.nonCompliances), newRecord];
                }
                alert("CRITICAL: Negative observation logged. Permit has been CANCELLED immediately.");
            } else {
                alert("Safe observation logged successfully. Work may continue.");
            }

            await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${inspectionModal.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === inspectionModal.id ? normalizePermit({ ...p, ...updates }) : p));
            setInspectionModal(null);
        } catch (err) { alert("Error logging inspection: " + err.message); }
    };

    const handleRequestClosure = async (permit) => {
        if (!permit.firebaseKey) return alert("Database error.");
        if (!window.confirm("Submit this permit for final closure?")) return;
        try {
            const updates = { status: 'Pending Closure', engStatus: 'Closure Pending', prodStatus: 'Closure Pending' };
            await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));
            alert("Closure request sent to Authorizers.");
        } catch (e) { alert("Error submitting closure request: " + e.message); }
    };

    const handleApproveClosure = async (permit, role) => {
        if (!permit.firebaseKey) return alert("Database error.");
        try {
            const updates = {};
            if (role === 'eng') updates.engStatus = 'Closure Approved';
            if (role === 'prod') updates.prodStatus = 'Closure Approved';

            const isEngClosed = role === 'eng' ? true : permit.engStatus === 'Closure Approved';
            const isProdClosed = role === 'prod' ? true : permit.prodStatus === 'Closure Approved';

            if (isEngClosed && isProdClosed) {
                updates.status = 'Closed';
                updates.statusUpdatedOn = new Date().toISOString();
                alert("Final authorizations received. Permit is now permanently CLOSED.");
            } else {
                alert(`${role === 'eng' ? 'Engineering' : 'Production'} closure verified.`);
            }

            await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));
        } catch (e) { alert("Error approving closure: " + e.message); }
    };

    const handleReassign = async () => {
        const { permit, role } = reassignModal;
        if (!permit.firebaseKey || !newApproverEmail) return;
        try {
            const updates = {};
            if (role === 'eng') updates.engApproverEmail = newApproverEmail;
            if (role === 'prod') updates.prodApproverEmail = newApproverEmail;
            await update(ref(rtdb, `organizations/${session.orgId}/workPermits/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));
            setReassignModal(null);
            setNewApproverEmail('');
            alert("Approver successfully reassigned.");
        } catch (e) { alert("Error reassigning approver: " + e.message); }
    };

    const triggerPrint = (permit) => {
        const qrUrl = `${window.location.origin}${window.location.pathname}?ptw=${permit.id}`;
        try {
            if (typeof QRious !== 'undefined') {
                const qr = new QRious({ value: qrUrl, size: 200 });
                setQrImage(qr.toDataURL());
            }
        } catch (e) { console.warn("QRious skip", e); }
        setPrintData(normalizePermit(permit));
        setTimeout(() => { window.print(); }, 500);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Pending Approval': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            case 'Work in Progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'Pending Closure': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            case 'Closed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'Cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-slate-800 text-slate-400 border-slate-700';
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-orange-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase">Loading PTW...</div>;

    const myName = session?.name || session?.user || 'Me';
    const myEmail = session?.email?.toLowerCase().trim() || '';

    const checkMatch = (targetStr) => {
        if (!targetStr) return false;
        const t = String(targetStr).toLowerCase().trim();
        const e = String(session?.email || '').toLowerCase().trim();
        const u = String(session?.user || '').toLowerCase().trim();
        const n = String(session?.name || '').toLowerCase().trim();
        return (e && t === e) || (u && t === u) || (n && t === n);
    };

    const isEngApprover = (p) => checkMatch(p.engApproverEmail);
    const isProdApprover = (p) => checkMatch(p.prodApproverEmail);
    const isCreator = (p) => checkMatch(p.creatorEmail) || checkMatch(p.requestedBy);

    const myPendingApprovals = visiblePermits.filter(p => {
        const engMatch = isEngApprover(p);
        const prodMatch = isProdApprover(p);
        if (p.status === 'Pending Approval') return (engMatch && p.engStatus === 'Pending') || (prodMatch && p.prodStatus === 'Pending');
        if (p.status === 'Pending Closure') return (engMatch && p.engStatus === 'Closure Pending') || (prodMatch && p.prodStatus === 'Closure Pending');
        return false;
    });

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0 print:hidden">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/dashboard`)} className="text-slate-400 hover:text-white transition flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-red-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-clipboard-list"></i></div>
                    <h1 className="font-bold text-white uppercase tracking-wide hidden md:block">Permit to Work (PTW)</h1>
                </div>
                <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner gap-1">
                    <button onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'dashboard' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-list mr-1"></i> Registry</button>
                    {canEdit && <button onClick={handleCreateNew} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'form' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-plus mr-1"></i> Issue Permit</button>}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full print:hidden">
                <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20">

                    {view === 'dashboard' && (
                        <>
                            <div className="flex justify-between items-end mb-6">
                                <div><h2 className="text-3xl font-black text-white mb-1">Permit Registry</h2><p className="text-xs text-slate-400 uppercase tracking-widest">Manage High-Risk Activities</p></div>
                                <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl outline-none shadow-inner w-48">
                                    {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-x-auto shadow-xl">
                                <table className="w-full text-left text-sm min-w-[1000px]">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                        <tr><th className="p-4 pl-6">Permit ID</th><th className="p-4">Execution Team</th><th className="p-4">Validity</th><th className="p-4">Non-Compliances</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                        {visiblePermits.map(p => {
                                            const tConfig = getTypeConfig(p.typeId);
                                            return (
                                                <tr key={p.firebaseKey} className={`hover:bg-slate-800/40 transition-colors ${p.status === 'Closed' ? 'opacity-60' : ''}`}>
                                                    <td className="p-4 pl-6">
                                                        <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${tConfig.color}`}>{tConfig.label}</div>
                                                        <div className="font-mono font-bold text-white text-sm">{p.id}</div>
                                                        <div className="text-[9px] text-slate-500 uppercase tracking-widest mt-1">Site: {p.siteId}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-white mb-1">{p.workerType === 'Contractor' ? p.contractorName : 'Internal Operations'}</div>
                                                        <div className="text-[10px] text-slate-400">{safeArr(p.entrantNames).length} Workers Assigned</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-mono text-xs">{p.validFromDate} to {p.validToDate}</div>
                                                        <span className={`mt-1 inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${p.status === 'Work in Progress' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-600'}`}>{p.status}</span>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`font-mono font-bold px-3 py-1 rounded-lg ${safeArr(p.nonCompliances).length > 0 ? 'bg-red-900/30 text-red-400 border border-red-500/30' : 'text-slate-500'}`}>{safeArr(p.nonCompliances).length}</span>
                                                    </td>
                                                    <td className="p-4 pr-6 text-right flex justify-end gap-2">
                                                        <button onClick={() => triggerPrint(p)} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow-sm"><i className="fas fa-print"></i></button>
                                                        <button onClick={() => { setFormData(p); setView('form'); }} className="bg-orange-600/20 hover:bg-orange-600 border border-orange-500/30 text-orange-400 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow-sm">Manage</button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {visiblePermits.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-500 italic">No permits issued.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {view === 'form' && formData && (
                        <div className="max-w-4xl mx-auto bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-8">
                            <div className="mb-8 border-b border-slate-800 pb-6 flex justify-between items-center">
                                <h3 className="text-3xl font-black text-orange-400 flex items-center gap-3"><i className="fas fa-file-signature"></i> {formData.firebaseKey ? 'Manage Work Permit' : 'Issue New Permit'}</h3>
                                <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} disabled={!formData.firebaseKey || !canEdit} className={`font-bold uppercase tracking-widest text-xs px-4 py-2 rounded-xl outline-none border ${formData.status === 'Closed' ? 'bg-slate-900 text-slate-400 border-slate-700' : 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50'}`}>
                                    <option value="Draft">Draft</option><option value="Pending Approval">Pending Approval</option><option value="Work in Progress">Active (WIP)</option><option value="Pending Closure">Pending Closure</option><option value="Closed">Closed</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner col-span-2 md:col-span-1">
                                    <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">1. Permit Details</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Target Site *</label>
                                            <select value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value, contractorId: '', entrantNames: [] })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500">
                                                <option value="">Select Site...</option>
                                                {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Permit Type *</label>
                                            <select value={formData.typeId} onChange={e => handleTypeChange(e.target.value)} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500">
                                                {PERMIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Description of Work *</label>
                                            <textarea value={formData.workDescription} onChange={e => setFormData({ ...formData, workDescription: e.target.value })} rows="3" disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500 resize-none" placeholder="Detail the task..." />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Location within Site *</label>
                                            <input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500" placeholder="e.g. Pump House Roof" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div><label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Valid From</label><input type="date" value={formData.validFromDate} onChange={e => setFormData({ ...formData, validFromDate: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500 font-mono text-xs" /></div>
                                            <div><label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Valid To</label><input type="date" value={formData.validToDate} onChange={e => setFormData({ ...formData, validToDate: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500 font-mono text-xs" /></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner col-span-2 md:col-span-1 flex flex-col h-[520px]">
                                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">2. Execution Team</h4>

                                    <div className="flex gap-4 mb-4 border-b border-slate-800 pb-4">
                                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300"><input type="radio" name="wType" value="Internal" checked={formData.workerType === 'Internal'} onChange={() => setFormData({ ...formData, workerType: 'Internal', contractorId: '', entrantNames: [] })} disabled={!canEdit} className="accent-blue-500" /> Internal Staff</label>
                                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300"><input type="radio" name="wType" value="Contractor" checked={formData.workerType === 'Contractor'} onChange={() => setFormData({ ...formData, workerType: 'Contractor', entrantNames: [] })} disabled={!canEdit} className="accent-blue-500" /> Contractor</label>
                                    </div>

                                    {formData.workerType === 'Contractor' && (
                                        <div className="mb-4">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Select Vendor *</label>
                                            <select value={formData.contractorId} onChange={e => setFormData({ ...formData, contractorId: e.target.value, entrantNames: [] })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500">
                                                <option value="">{formData.siteId ? 'Select Contractor...' : 'Select Site First'}</option>
                                                {availableContractors.map(c => <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>)}
                                            </select>
                                        </div>
                                    )}

                                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 bg-slate-900 rounded-xl border border-slate-700 p-2">
                                        {availableWorkers.length > 0 ? availableWorkers.map((w, idx) => {
                                            const isChecked = safeArr(formData.entrantNames).includes(w.name || w.email);
                                            return (
                                                <label key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded cursor-pointer transition border border-transparent hover:border-slate-600 mb-1">
                                                    <input type="checkbox" checked={isChecked} onChange={() => canEdit && toggleWorker(w.name || w.email)} disabled={!canEdit} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                                                    <div>
                                                        <div className="text-xs font-bold text-white">{w.name || w.email}</div>
                                                        <div className="text-[9px] text-slate-500 uppercase tracking-widest">{w.role || 'Worker'}</div>
                                                    </div>
                                                </label>
                                            );
                                        }) : (
                                            <div className="p-4 text-center text-xs text-slate-500 italic">No workers available. Ensure Site and Team Type are selected.</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* AUDIT / NON-COMPLIANCE SECTION */}
                            {formData.firebaseKey && (
                                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner mb-8">
                                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-exclamation-triangle mr-2"></i> 3. Permit Non-Compliances / Violations</h4>
                                    <p className="text-[10px] text-slate-400 mb-4">Log any safety violations observed during the execution of this permit. These will be permanently recorded in the vendor's profile.</p>

                                    <div className="space-y-3 mb-4">
                                        {safeArr(formData.nonCompliances).map(nc => (
                                            <div key={nc.id} className="p-3 bg-red-950/20 border border-red-500/30 rounded-xl flex justify-between items-start group">
                                                <div>
                                                    <div className="text-xs font-medium text-slate-200">{nc.desc}</div>
                                                    <div className="text-[9px] font-mono text-red-400 mt-1">{nc.date}</div>
                                                </div>
                                                {canEdit && <button onClick={() => removeNonCompliance(nc.id)} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition"><i className="fas fa-trash-alt text-xs"></i></button>}
                                            </div>
                                        ))}
                                    </div>

                                    {canEdit && (
                                        <div className="flex gap-2">
                                            <input value={newNC} onChange={e => setNewNC(e.target.value)} placeholder="Describe violation (e.g. Worker not wearing safety harness)" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-red-500" />
                                            <button onClick={addNonCompliance} className="bg-red-600 hover:bg-red-500 text-white px-4 rounded-lg font-bold shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-widest">Log NC</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-4 pt-6 border-t border-slate-800">
                                {formData.firebaseKey && (
                                    <>
                                        <button onClick={() => setInspectionModal(formData)} className="px-6 py-3 rounded-xl font-bold bg-orange-600 text-white shadow-lg hover:bg-orange-500 transition flex items-center gap-2 uppercase tracking-widest text-xs"><i className="fas fa-search"></i> Inspect Area</button>
                                        <button onClick={() => triggerPrint(formData)} className="px-6 py-3 rounded-xl font-bold bg-slate-800 text-white shadow-lg hover:bg-slate-700 transition flex items-center gap-2 uppercase tracking-widest text-xs"><i className="fas fa-print"></i> Print</button>
                                    </>
                                )}
                                <div className="flex-1"></div>
                                <button onClick={() => setView('dashboard')} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white transition uppercase tracking-widest text-xs border border-slate-700">Close Form</button>
                                {canEdit && (
                                    <button onClick={() => savePermit(formData.status === 'Draft')} disabled={saving} className="px-10 py-3 rounded-xl font-bold bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition flex items-center gap-2 uppercase tracking-widest text-xs disabled:opacity-50">
                                        {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} {formData.status === 'Draft' ? 'Save Draft' : 'Update Permit'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* INSPECTION MODAL */}
            {inspectionModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-fade-in font-['Space_Grotesk']">
                        <h2 className="text-xl font-bold text-white mb-2"><i className="fas fa-search text-orange-500 mr-2"></i> Conduct Inspection</h2>
                        <p className="text-xs text-slate-400 mb-6">Location: <span className="text-fuchsia-400 font-bold">{inspectionModal.location}</span></p>

                        <form onSubmit={(e) => handleInspectionSubmit(e, false)} id="safe-form">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Observation Notes</label>
                            <textarea name="observation" required rows="4" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm outline-none focus:border-orange-500 mb-6 font-['Inter'] text-white" placeholder="Log site conditions, PPE usage, etc..."></textarea>

                            <div className="flex flex-col gap-3">
                                <button type="submit" form="safe-form" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all uppercase tracking-widest text-xs shadow-lg">
                                    <i className="fas fa-check-circle mr-2"></i> Log as Safe & Continue
                                </button>

                                <button type="button" onClick={(e) => handleInspectionSubmit({ preventDefault: () => { }, target: document.getElementById('safe-form') }, true)} className="w-full bg-red-900/50 hover:bg-red-600 border border-red-500/50 text-white font-bold py-3 rounded-xl transition-all uppercase tracking-widest text-xs">
                                    <i className="fas fa-ban mr-2"></i> Log Unsafe (Cancel Permit)
                                </button>

                                <button type="button" onClick={() => setInspectionModal(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all uppercase tracking-widest text-xs mt-2">
                                    Close Menu
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* REASSIGN APPROVER MODAL */}
            {reassignModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-fade-in font-['Space_Grotesk']">
                        <h2 className="text-xl font-bold text-white mb-2"><i className="fas fa-user-edit text-amber-500 mr-2"></i> Reassign Approver</h2>
                        <p className="text-xs text-slate-400 mb-6 leading-relaxed">Select a new <strong className="text-white">{reassignModal.role === 'eng' ? 'Engineering' : 'Production'}</strong> approver for Permit <span className="font-mono text-amber-400">{reassignModal.permit.id}</span>.</p>

                        <select value={newApproverEmail} onChange={e => setNewApproverEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white mb-6 outline-none focus:border-amber-500 font-bold">
                            <option value="">-- Select New Approver --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.email || u.name}>{u.name} ({u.email || 'System Auth'})</option>
                            ))}
                        </select>

                        <div className="flex gap-3">
                            <button type="button" onClick={handleReassign} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition-all text-[10px] uppercase tracking-widest shadow-lg">Confirm</button>
                            <button type="button" onClick={() => setReassignModal(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all text-[10px] uppercase tracking-widest border border-slate-700">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* PRINT VIEW LAYER */}
            {printData && (
                <div className="hidden print:block p-8 bg-white text-black w-full" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
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
                                    <td className="w-[15%] py-1.5 font-bold border-none align-top">Execution Team:</td>
                                    <td className="w-[35%] py-1.5 font-bold border-none align-top">
                                        {printData.workerType === 'Contractor' ? `[Contractor] ${printData.contractorName}` : '[Internal]'} <br />
                                        Workers: {(printData.entrantNames || []).join(', ') || 'None Assigned'}
                                    </td>
                                    <td className="w-[15%] py-1.5 font-bold border-none pl-4 align-top">Validity:</td>
                                    <td className="w-[35%] py-1.5 font-bold border-none font-mono align-top">{printData.validFromDate} to {printData.validToDate}<br />{printData.validFromTime} - {printData.validToTime}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6">
                        <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1.5 border border-black inline-block">1. Description of Work</h2>
                        <div className="text-sm border border-black p-3 min-h-[60px] leading-relaxed">{printData.description}</div>
                    </div>

                    <div className="flex gap-6 mb-6 page-break-inside-avoid">
                        <div className="w-1/2">
                            <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1.5 border border-black inline-block">2. Required PPE</h2>
                            <div className="text-sm border border-black p-4 min-h-[100px] leading-loose">
                                {(printData.ppe || []).length > 0 ? (printData.ppe || []).join(', ') : 'Standard PPE Only'}
                            </div>
                        </div>
                        <div className="w-1/2">
                            <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1.5 border border-black inline-block">3. Pre-Work Verification</h2>
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
                        <h2 className="text-center font-bold text-sm uppercase bg-gray-200 border-b-2 border-black p-2">4. Dual Authorization Signatures</h2>
                        <p className="text-[10px] text-center p-1.5 border-b border-gray-300 italic bg-gray-50">By signing, I confirm the area is safe, precautions are implemented, and workers are briefed.</p>
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-1/3 p-4 border-r border-black align-top h-32">
                                        <strong className="block mb-6 uppercase tracking-widest text-xs text-gray-500">Requested By:</strong>
                                        Name: <strong className="text-base">{printData.creatorEmail || printData.requestedBy}</strong><br /><br /><br />
                                        Sign: __________________
                                    </td>
                                    <td className="w-1/3 p-4 border-r border-black align-top h-32">
                                        <strong className="block mb-6 uppercase tracking-widest text-xs text-gray-500">Engineering Approval:</strong>
                                        Name: <strong className="text-base">{printData.engApproverEmail || '________________'}</strong><br />
                                        Status: {printData.engStatus}<br /><br />
                                        Sign: __________________
                                    </td>
                                    <td className="w-1/3 p-4 align-top h-32">
                                        <strong className="block mb-6 uppercase tracking-widest text-xs text-gray-500">Production Approval:</strong>
                                        Name: <strong className="text-base">{printData.prodApproverEmail || '________________'}</strong><br />
                                        Status: {printData.prodStatus}<br /><br />
                                        Sign/Time: __________________
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}