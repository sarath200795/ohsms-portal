import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, push, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';

// --- BULLETPROOF DATA ENGINE ---
const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
};

const parseContractors = (dataObj) => {
    if (!dataObj) return [];
    return Object.entries(dataObj).map(([k, v]) => ({
        ...v,
        firebaseKey: k,
        allocatedSites: safeArr(v.allocatedSites).length > 0 ? safeArr(v.allocatedSites) : (v.siteId && v.siteId !== 'GLOBAL' ? [v.siteId] : []),
        documents: safeArr(v.documents),
        workers: safeArr(v.workers).map(w => ({ ...w, additionalDocs: safeArr(w.additionalDocs) })),
        trainings: safeArr(v.trainings),
        incidents: safeArr(v.incidents),
        nonCompliances: safeArr(v.nonCompliances)
    }));
};

// --- INDIAN LEGAL COMPLIANCE MAPPING ---
const SERVICE_TYPES = [
    'General / Housekeeping', 'Construction / Civil', 'Electrical', 'Mechanical',
    'Chemical / Hazardous', 'Supply of Goods', 'Transportation',
    'Manpower Supply (Technical)', 'Manpower Supply (Non-Technical)'
];

const GOODS_TYPES = ['PPE', 'Chemicals', 'Machinery', '4M', 'Other'];

const getMandatoryDocs = (serviceType, goodsType = '') => {
    const baseDocs = [
        { type: 'GST Registration', isMandatory: true, status: 'Pending' },
        { type: 'Trade License / Incorporation', isMandatory: true, status: 'Pending' },
        { type: 'Company PAN / TAN', isMandatory: true, status: 'Pending' }
    ];

    const labourIntensive = ['General / Housekeeping', 'Construction / Civil', 'Electrical', 'Mechanical', 'Chemical / Hazardous', 'Manpower Supply (Technical)', 'Manpower Supply (Non-Technical)'];

    if (labourIntensive.includes(serviceType)) {
        baseDocs.push({ type: 'PF Registration', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'ESI / Workmen Compensation Policy', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'Labour License (Form VI)', isMandatory: true, status: 'Pending' });
    }

    if (serviceType === 'Construction / Civil') {
        baseDocs.push({ type: 'BOCW Registration', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Electrical') {
        baseDocs.push({ type: 'Valid Electrical Contractor License (CEA)', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Chemical / Hazardous') {
        baseDocs.push({ type: 'Hazardous Waste Handling Permit', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Transportation') {
        baseDocs.push({ type: 'Fleet Vehicle Insurance (Master)', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'Transport Carrier License', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Supply of Goods' && goodsType === 'Chemicals') {
        baseDocs.push({ type: 'PESO License / SDS Declarations', isMandatory: true, status: 'Pending' });
    }

    return baseDocs.map(d => ({ ...d, id: Math.random().toString(36).substr(2, 9), name: d.type }));
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

export default function Contractors() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('register'); // 'register' | 'companies' | 'workers' | 'deployments'

    const [contractors, setContractors] = useState([]);
    const [sites, setSites] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [workerCompanyFilter, setWorkerCompanyFilter] = useState('All');
    const [saving, setSaving] = useState(false);

    const [globalTrainings, setGlobalTrainings] = useState([]);
    const [globalPermits, setGlobalPermits] = useState([]);

    // Form State for Company
    const [formData, setFormData] = useState({
        id: '', allocatedSites: [], companyName: '', contactPerson: '', email: '', phone: '',
        serviceType: 'General / Housekeeping', goodsType: 'PPE', notes: '', status: 'Pending Review',
        documents: getMandatoryDocs('General / Housekeeping'), workers: []
    });

    // Form State for New Worker Modal
    const [addWorkerData, setAddWorkerData] = useState({ contractorId: '', name: '', role: 'Worker', competence: '', deployedSite: '' });

    // Modals
    const [activeVendor, setActiveVendor] = useState(null);
    const [editingVendor, setEditingVendor] = useState(null);
    const [activeWorker, setActiveWorker] = useState(null);
    const [modalType, setModalType] = useState(null);
    const [newDocReq, setNewDocReq] = useState('');
    const [newWorkerDocReq, setNewWorkerDocReq] = useState('');
    const [newWorkerProfile, setNewWorkerProfile] = useState({ name: '', role: 'Worker', competence: '', deployedSite: '', proof: null, proofName: '', inductionDate: '' });

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || (sess.accessibleModules || []).includes('Contractor Management');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission.");
            navigate('/dashboard');
            return;
        }
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
                    if (data.contractors) setContractors(parseContractors(data.contractors));
                    if (data.sites) setSites(Object.keys(data.sites).map(key => ({ code: data.sites[key].code || key, name: data.sites[key].name || key })));
                    if (data.trainings) setGlobalTrainings(safeArr(data.trainings));
                    if (data.workPermits) setGlobalPermits(safeArr(data.workPermits));
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [navigate, location]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager'].includes(session?.role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set([session.assignedSite, ...(session.accessibleSites || [])].filter(Boolean));
        if (!isGlobalUser) { codes.delete('GLOBAL'); codes.delete('All'); }
        return codes;
    }, [session, isGlobalUser]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const visibleContractors = useMemo(() => {
        return contractors.filter(c => {
            if (!isGlobalUser && session?.assignedSite !== 'GLOBAL' && !safeArr(c.allocatedSites).includes(session?.assignedSite) && !safeArr(session?.accessibleSites).some(s => safeArr(c.allocatedSites).includes(s))) return false;
            if (siteFilter !== 'All' && !safeArr(c.allocatedSites).includes(siteFilter)) return false;
            return true;
        });
    }, [contractors, siteFilter, isGlobalUser, session]);

    // --- WORKER PROFILE EXTRACTOR ---
    const allWorkers = useMemo(() => {
        let list = [];
        visibleContractors.forEach(c => {
            if (workerCompanyFilter !== 'All' && c.firebaseKey !== workerCompanyFilter) return;

            safeArr(c.workers).forEach(w => {
                const wNameStr = typeof w.name === 'string' ? w.name.toLowerCase() : '';
                if (!wNameStr) return;

                const wTrainings = globalTrainings.filter(t =>
                    safeArr(t.attendees).some(a => {
                        const aName = typeof a === 'object' ? (a.name || '') : (typeof a === 'string' ? a : '');
                        return aName.toLowerCase() === wNameStr && (typeof a === 'object' ? a.status === 'Attended' : true);
                    })
                );

                const wInjuries = safeArr(c.incidents).filter(inc =>
                    typeof inc.desc === 'string' && inc.desc.toLowerCase().includes(wNameStr)
                );

                list.push({
                    ...w,
                    companyName: c.companyName || 'Unknown Vendor',
                    contractorId: c.firebaseKey,
                    trainingsList: wTrainings,
                    injuriesList: wInjuries
                });
            });
        });
        return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [visibleContractors, workerCompanyFilter, globalTrainings]);


    const getComplianceStatus = (docsData) => {
        const docs = safeArr(docsData);
        if (docs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct: 0 };

        const requiredDocs = docs.filter(d => d.isMandatory || d.status === 'Requested');
        const uploadedDocs = requiredDocs.filter(d => d.status === 'Uploaded' || d.status === 'Verified' || d.file);
        const pct = requiredDocs.length === 0 ? 100 : Math.round((uploadedDocs.length / requiredDocs.length) * 100);

        if (requiredDocs.length === 0) return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
        if (uploadedDocs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct };
        if (uploadedDocs.length < requiredDocs.length) return { label: 'Partially Complied', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };

        const hasExpired = uploadedDocs.some(d => d.expiryDate && new Date(d.expiryDate) < new Date());
        if (hasExpired) return { label: 'Partially Complied (Expired)', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };

        return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
    };

    // --- REGISTRATION ACTIONS ---
    const toggleAllocatedSite = (code) => {
        setFormData(prev => {
            const exists = prev.allocatedSites.includes(code);
            return {
                ...prev,
                allocatedSites: exists ? prev.allocatedSites.filter(s => s !== code) : [...prev.allocatedSites, code]
            };
        });
    };

    const handleServiceTypeChange = (e) => {
        const type = e.target.value;
        setFormData(prev => ({ ...prev, serviceType: type, documents: getMandatoryDocs(type, prev.goodsType) }));
    };

    const handleGoodsTypeChange = (e) => {
        const gType = e.target.value;
        setFormData(prev => ({ ...prev, goodsType: gType, documents: getMandatoryDocs(prev.serviceType, gType) }));
    };

    const saveVendorRegistration = async () => {
        if (!formData.companyName || formData.allocatedSites.length === 0) return alert("Company Name and at least one Site Allocation are required.");
        setSaving(true);
        try {
            const payload = {
                ...formData,
                siteId: formData.allocatedSites[0], // Fallback primary site
                updatedBy: session.name,
                lastUpdated: new Date().toISOString()
            };
            if (!payload.createdAt) payload.createdAt = new Date().toISOString();

            const keyToUpdate = formData.firebaseKey;
            delete payload.firebaseKey;

            if (keyToUpdate) {
                await update(ref(rtdb, `organizations/${session.orgId}/contractors/${keyToUpdate}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/contractors`), payload);
            }
            alert("Vendor Registered/Updated Successfully!");

            const snap = await get(ref(rtdb, `organizations/${session.orgId}`));
            if (snap.exists() && snap.val().contractors) setContractors(parseContractors(snap.val().contractors));

            setView('companies');
            setFormData({ siteId: '', allocatedSites: [], companyName: '', contactPerson: '', email: '', phone: '', serviceType: 'General / Housekeeping', goodsType: 'PPE', notes: '', status: 'Pending Review', documents: getMandatoryDocs('General / Housekeeping'), workers: [] });
        } catch (e) { alert("Save failed: " + e.message); }
        setSaving(false);
    };

    const updateVendorDB = async (vendorKey, payload) => {
        try {
            await update(ref(rtdb, `organizations/${session.orgId}/contractors/${vendorKey}`), payload);
            setContractors(prev => prev.map(c => {
                if (c.firebaseKey === vendorKey) {
                    return {
                        ...c, ...payload,
                        allocatedSites: payload.allocatedSites ? safeArr(payload.allocatedSites) : safeArr(c.allocatedSites),
                        documents: payload.documents ? safeArr(payload.documents) : safeArr(c.documents),
                        workers: payload.workers ? safeArr(payload.workers) : safeArr(c.workers)
                    };
                }
                return c;
            }));

            if (activeVendor && activeVendor.firebaseKey === vendorKey) {
                setActiveVendor(prev => ({
                    ...prev, ...payload,
                    allocatedSites: payload.allocatedSites ? safeArr(payload.allocatedSites) : safeArr(prev.allocatedSites),
                    documents: payload.documents ? safeArr(payload.documents) : safeArr(prev.documents),
                    workers: payload.workers ? safeArr(payload.workers) : safeArr(prev.workers)
                }));
            }
        } catch (e) { alert("Failed to update database."); }
    };

    const saveCompanyProfileEdit = () => {
        if (!editingVendor.companyName || safeArr(editingVendor.allocatedSites).length === 0) return alert("Company Name and Site Allocation required.");
        const payload = {
            companyName: editingVendor.companyName,
            allocatedSites: editingVendor.allocatedSites,
            siteId: editingVendor.allocatedSites[0],
            serviceType: editingVendor.serviceType, goodsType: editingVendor.goodsType || '',
            contactPerson: editingVendor.contactPerson, phone: editingVendor.phone, email: editingVendor.email,
            updatedBy: session.name, lastUpdated: new Date().toISOString()
        };
        updateVendorDB(activeVendor.firebaseKey, payload);
        setEditingVendor(null);
    };


    const handleDocUpload = async (docId, file) => {
        if (file.size > 2097152) return alert("File exceeds 2MB limit.");
        const b64 = await fileToBase64(file);
        const updatedDocs = safeArr(activeVendor.documents).map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d);
        updateVendorDB(activeVendor.firebaseKey, { documents: updatedDocs });
    };

    const requestAdditionalDoc = () => {
        if (!newDocReq) return;
        const newDoc = { id: Date.now().toString(), type: 'Requested', name: newDocReq, isMandatory: false, status: 'Requested' };
        updateVendorDB(activeVendor.firebaseKey, { documents: [...safeArr(activeVendor.documents), newDoc] });
        setNewDocReq('');
    };

    // --- WORKER ROSTER ACTIONS ---
    const submitNewWorker = async () => {
        if (!addWorkerData.contractorId || !addWorkerData.name || !addWorkerData.competence || !addWorkerData.deployedSite) return alert("Company, Name, Competence, and Deployed Site are required.");

        const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${addWorkerData.contractorId}`);
        const snap = await get(vendorRef);
        if (snap.exists()) {
            const vData = snap.val();
            const newWorkerObj = {
                id: Date.now().toString(),
                name: addWorkerData.name,
                role: addWorkerData.role,
                competence: addWorkerData.competence,
                deployedSite: addWorkerData.deployedSite,
                inductionDate: 'Pending',
                additionalDocs: []
            };
            const updatedWorkers = [...safeArr(vData.workers), newWorkerObj];
            await update(vendorRef, { workers: updatedWorkers });

            const allSnap = await get(ref(rtdb, `organizations/${session.orgId}/contractors`));
            if (allSnap.exists()) setContractors(parseContractors(allSnap.val()));

            setModalType(null);
            setAddWorkerData({ contractorId: '', name: '', role: 'Worker', competence: '', deployedSite: '' });
            alert("Worker added successfully! You can now upload their documents from their profile.");
        }
    };

    const removeWorkerFromProfile = (contractorId, workerId) => {
        if (window.confirm("Remove this worker from the roster permanently?")) {
            const vendor = contractors.find(c => c.firebaseKey === contractorId);
            if (vendor) {
                const updatedWorkers = safeArr(vendor.workers).filter(w => w.id !== workerId);
                updateVendorDB(contractorId, { workers: updatedWorkers });
            }
        }
    };

    // New Function for Deployment Tab Fast Edit
    const quickUpdateWorkerDeployment = async (contractorId, workerId, newSite) => {
        const vendor = contractors.find(c => c.firebaseKey === contractorId);
        if (vendor) {
            const updatedWorkers = safeArr(vendor.workers).map(w => w.id === workerId ? { ...w, deployedSite: newSite } : w);
            updateVendorDB(contractorId, { workers: updatedWorkers });
        }
    };

    // --- INDIVIDUAL WORKER PROFILE ACTIONS ---
    const handleWorkerCoreDocUpload = async (type, file) => {
        if (!file) return;
        if (file.size > 2097152) return alert("File exceeds 2MB limit.");
        try {
            const b64 = await fileToBase64(file);
            const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
            const snap = await get(vendorRef);

            if (snap.exists()) {
                const vData = snap.val();
                const updatedWorkers = safeArr(vData.workers).map(w => {
                    if (w.id === activeWorker.id) {
                        const updatedWorker = { ...w };
                        if (type === 'med') { updatedWorker.medDoc = b64; updatedWorker.medDocName = file.name; }
                        if (type === 'comp') { updatedWorker.compDoc = b64; updatedWorker.compDocName = file.name; }
                        return updatedWorker;
                    }
                    return w;
                });

                await update(vendorRef, { workers: updatedWorkers });

                const allSnap = await get(ref(rtdb, `organizations/${session.orgId}/contractors`));
                if (allSnap.exists()) setContractors(parseContractors(allSnap.val()));

                setActiveWorker(prev => {
                    const updated = { ...prev };
                    if (type === 'med') { updated.medDoc = b64; updated.medDocName = file.name; }
                    if (type === 'comp') { updated.compDoc = b64; updated.compDocName = file.name; }
                    return updated;
                });
            }
        } catch (err) { alert("Failed to process document."); }
    };

    const requestAdditionalWorkerDoc = async () => {
        if (!newWorkerDocReq) return;
        const newDoc = { id: Date.now().toString(), name: newWorkerDocReq, status: 'Requested', file: null };

        const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
        const snap = await get(vendorRef);
        if (snap.exists()) {
            const vData = snap.val();
            const updatedWorkers = safeArr(vData.workers).map(w =>
                w.id === activeWorker.id ? { ...w, additionalDocs: [...safeArr(w.additionalDocs), newDoc] } : w
            );
            await update(vendorRef, { workers: updatedWorkers });

            const allSnap = await get(ref(rtdb, `organizations/${session.orgId}/contractors`));
            if (allSnap.exists()) setContractors(parseContractors(allSnap.val()));

            setActiveWorker(prev => ({ ...prev, additionalDocs: [...safeArr(prev.additionalDocs), newDoc] }));
            setNewWorkerDocReq('');
        }
    };

    const uploadAdditionalWorkerDoc = async (docId, file) => {
        if (file.size > 2097152) return alert("File exceeds 2MB limit.");
        try {
            const b64 = await fileToBase64(file);
            const vendorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${activeWorker.contractorId}`);
            const snap = await get(vendorRef);

            if (snap.exists()) {
                const vData = snap.val();
                const updatedWorkers = safeArr(vData.workers).map(w => {
                    if (w.id === activeWorker.id) {
                        const updatedDocs = safeArr(w.additionalDocs).map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d);
                        return { ...w, additionalDocs: updatedDocs };
                    }
                    return w;
                });

                await update(vendorRef, { workers: updatedWorkers });

                const allSnap = await get(ref(rtdb, `organizations/${session.orgId}/contractors`));
                if (allSnap.exists()) setContractors(parseContractors(allSnap.val()));

                setActiveWorker(prev => ({
                    ...prev,
                    additionalDocs: safeArr(prev.additionalDocs).map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d)
                }));
            }
        } catch (err) { alert("Upload failed."); }
    };


    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-indigo-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase"><div className="w-8 h-8 border-2 border-slate-800 border-t-indigo-500 rounded-full animate-spin mr-3"></div> Loading Contractors...</div>;

    return (
        <>
            <style>
                {`
                    @media print {
                        body, html, #root { height: auto !important; overflow: visible !important; background-color: white !important; color: black !important; }
                        .print-content { position: relative !important; width: 100% !important; height: auto !important; overflow: visible !important; display: block !important; }
                    }
                `}
            </style>

            <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative print:h-auto print:overflow-visible print:bg-white print:text-black">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0 print:hidden"></div>

                <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(`/dashboard`)} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-hard-hat"></i></div>
                        <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Contractor Safety</h1>
                    </div>
                    <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner gap-1 overflow-x-auto custom-scroll">
                        {canEdit && <button onClick={() => { setFormData({ id: '', allocatedSites: [], companyName: '', contactPerson: '', email: '', phone: '', serviceType: 'General / Housekeeping', goodsType: 'PPE', documents: getMandatoryDocs('General / Housekeeping'), workers: [] }); setView('register'); }} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'register' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-user-plus mr-1"></i> Register Vendor</button>}
                        <button onClick={() => setView('companies')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'companies' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-building mr-1"></i> Company Profiles</button>
                        <button onClick={() => setView('workers')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'workers' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-id-badge mr-1"></i> Worker Profiles</button>
                        <button onClick={() => setView('deployments')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${view === 'deployments' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-map-marker-alt mr-1"></i> Deployments</button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full print:hidden">
                    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">

                        {/* --- GLOBAL FILTERS --- */}
                        {view !== 'register' && (
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">{view === 'companies' ? 'Vendor Master Data' : view === 'deployments' ? 'Site Deployments Dashboard' : 'Contractor Personnel Registry'}</h2>
                                    <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">ISO 45001 Compliance Tracking</p>
                                </div>
                                <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl outline-none shadow-inner w-full md:w-auto">
                                    {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                        )}

                        {/* ===================================================================== */}
                        {/* SECTION 1: REGISTER NEW VENDOR ONLY */}
                        {/* ===================================================================== */}
                        {view === 'register' && (
                            <div className="max-w-4xl mx-auto bg-slate-900/80 p-6 md:p-10 rounded-3xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
                                <div className="mb-8 border-b border-slate-800 pb-6">
                                    <h3 className="text-3xl font-black text-white flex items-center gap-3"><i className="fas fa-building text-indigo-500"></i> Register New Vendor</h3>
                                    <p className="text-slate-400 text-sm mt-2">Create the company profile first. You can add their employees (Roster) later from the Worker Profiles tab.</p>
                                </div>

                                <div className="bg-slate-950/50 p-8 rounded-2xl border border-slate-800 shadow-inner mb-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Company / Contractor Name *</label>
                                            <input value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 font-bold" placeholder="e.g. Acme Construction Ltd." />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Authorized Sites Allocation *</label>
                                            <div className="flex flex-wrap gap-2">
                                                {visibleSites.map(s => (
                                                    <label key={s.code} className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors shadow-sm select-none ${formData.allocatedSites.includes(s.code) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}>
                                                        <input type="checkbox" className="hidden" checked={formData.allocatedSites.includes(s.code)} onChange={() => toggleAllocatedSite(s.code)} disabled={!canEdit} />
                                                        {s.name}
                                                    </label>
                                                ))}
                                            </div>
                                            {formData.allocatedSites.length === 0 && <span className="text-[10px] text-red-400 mt-2 block italic">Please select at least one site.</span>}
                                        </div>

                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Service Type (India Legal) *</label>
                                            <select value={formData.serviceType} onChange={handleServiceTypeChange} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-indigo-300 font-bold outline-none focus:border-indigo-500">
                                                {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                                            </select>
                                        </div>

                                        {formData.serviceType === 'Supply of Goods' ? (
                                            <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/30">
                                                <label className="text-[10px] uppercase font-bold text-indigo-400 block mb-2 tracking-widest">Type of Goods Supplied *</label>
                                                <select value={formData.goodsType} onChange={handleGoodsTypeChange} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none focus:border-indigo-500">
                                                    {GOODS_TYPES.map(t => <option key={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        ) : <div></div>}

                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Primary Contact Person</label>
                                            <input value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500" placeholder="Manager / Supervisor Name" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Contact Phone</label>
                                            <input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500" placeholder="+91..." />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-indigo-950/20 p-6 rounded-2xl border border-indigo-500/30 text-sm mb-8 shadow-inner">
                                    <div className="text-indigo-400 font-bold uppercase tracking-widest text-[10px] mb-3"><i className="fas fa-info-circle mr-1"></i> Pre-Configured Legal Requirements</div>
                                    <p className="text-slate-300 leading-relaxed mb-4">Based on selecting <strong className="text-white bg-slate-900 px-2 py-1 rounded mx-1">{formData.serviceType} {formData.serviceType === 'Supply of Goods' && `(${formData.goodsType})`}</strong>, the following company compliance documents will be auto-required:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {safeArr(formData.documents).map((d, i) => (
                                            <span key={i} className="bg-slate-900 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm"><i className="fas fa-file-contract text-slate-500 mr-2"></i>{d.name}</span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4 border-t border-slate-800">
                                    {canEdit && <button onClick={saveVendorRegistration} disabled={saving} className="px-10 py-4 rounded-xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition flex items-center gap-2 uppercase tracking-widest text-sm disabled:opacity-50">{saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>} Register Company</button>}
                                </div>
                            </div>
                        )}

                        {/* ===================================================================== */}
                        {/* SECTION 2: COMPANY PROFILES */}
                        {/* ===================================================================== */}
                        {view === 'companies' && (
                            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-x-auto shadow-xl">
                                <table className="w-full text-left text-sm min-w-[1000px]">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                        <tr><th className="p-4 pl-6">Vendor Company</th><th className="p-4">Service Type</th><th className="p-4">Compliance Score</th><th className="p-4 text-center">Employees</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                        {visibleContractors.map(c => {
                                            const docsArr = safeArr(c.documents);
                                            const statusObj = getComplianceStatus(docsArr);
                                            const totalDocs = docsArr.length;
                                            const uploadedDocs = docsArr.filter(d => d.file || d.status === 'Uploaded').length;
                                            const compliancePct = totalDocs === 0 ? 0 : Math.round((uploadedDocs / totalDocs) * 100);

                                            return (
                                                <tr key={c.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                    <td className="p-4 pl-6">
                                                        <div className="font-bold text-white text-base">{c.companyName || 'Unnamed Vendor'}</div>
                                                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">
                                                            <i className="fas fa-map-marker-alt mr-1"></i> {safeArr(c.allocatedSites).join(', ') || 'None'} | <i className="fas fa-user ml-2 mr-1"></i> {c.contactPerson || 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-medium text-slate-400">{c.serviceType}</div>
                                                        {c.serviceType === 'Supply of Goods' && <div className="text-[9px] text-indigo-400 uppercase tracking-widest mt-1">[{c.goodsType}]</div>}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[10px] border-2 ${compliancePct === 100 ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30' : compliancePct > 50 ? 'border-yellow-500 text-yellow-400 bg-yellow-950/30' : 'border-red-500 text-red-400 bg-red-950/30'}`}>
                                                                {compliancePct}%
                                                            </div>
                                                            <div>
                                                                <div className={`text-[10px] font-bold uppercase tracking-widest ${statusObj.color.split(' ')[0]}`}>{statusObj.label}</div>
                                                                <div className="text-xs font-mono text-slate-500">{uploadedDocs} / {totalDocs} Docs Verified</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className="font-mono font-bold bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-indigo-300">{safeArr(c.workers).length}</span>
                                                    </td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <button onClick={() => { setActiveVendor(c); setModalType('company_profile'); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-transform active:scale-95 shadow-lg shadow-indigo-600/20"><i className="fas fa-id-card mr-1"></i> View Profile</button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {visibleContractors.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-500 italic">No vendors found. Please register one.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ===================================================================== */}
                        {/* SECTION 3: WORKER PROFILES */}
                        {/* ===================================================================== */}
                        {view === 'workers' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
                                        <i className="fas fa-filter text-slate-500 ml-2"></i>
                                        <select value={workerCompanyFilter} onChange={e => setWorkerCompanyFilter(e.target.value)} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg outline-none w-64">
                                            <option value="All">Filter by Company (All)</option>
                                            {visibleContractors.map(c => <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>)}
                                        </select>
                                    </div>
                                    {canEdit && (
                                        <button onClick={() => setModalType('add_worker')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"><i className="fas fa-user-plus mr-2"></i> Register Worker</button>
                                    )}
                                </div>
                                <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-x-auto shadow-xl">
                                    <table className="w-full text-left text-sm min-w-[1000px]">
                                        <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                            <tr><th className="p-4 pl-6">Worker Details</th><th className="p-4">Deployed Site</th><th className="p-4">Docs Status</th><th className="p-4 text-center">Trainings</th><th className="p-4 text-center">Injuries</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                            {allWorkers.map((w, idx) => (
                                                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                                                    <td className="p-4 pl-6">
                                                        <div className="font-bold text-white text-base">{w.name}</div>
                                                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">{w.role} | <span className="text-blue-300">{w.companyName}</span></div>
                                                    </td>
                                                    <td className="p-4 font-medium text-slate-400">
                                                        {w.deployedSite ? <span className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-xs">{w.deployedSite}</span> : <span className="text-slate-500 italic text-xs">Unassigned</span>}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex flex-col gap-1">
                                                            {w.medDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 w-fit uppercase font-bold"><i className="fas fa-check"></i> Med Fit</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-2 py-0.5 rounded border border-red-500/30 w-fit uppercase font-bold"><i className="fas fa-times"></i> Med Fit</span>}
                                                            {w.compDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 w-fit uppercase font-bold"><i className="fas fa-check"></i> Comp. Doc</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-2 py-0.5 rounded border border-red-500/30 w-fit uppercase font-bold"><i className="fas fa-times"></i> Comp. Doc</span>}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center font-mono font-bold text-blue-400">{safeArr(w.trainingsList).length}</td>
                                                    <td className="p-4 text-center font-mono font-bold text-red-400">{safeArr(w.injuriesList).length}</td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <button onClick={() => { setActiveWorker(w); setModalType('worker_profile'); }} className="bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-400 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-user-circle mr-1"></i> View Profile</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {allWorkers.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No workers found. Register a worker to get started.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ===================================================================== */}
                        {/* SECTION 4: SITE DEPLOYMENTS */}
                        {/* ===================================================================== */}
                        {view === 'deployments' && (
                            <div className="space-y-6">
                                {visibleContractors.map(c => {
                                    const cWorkers = safeArr(c.workers);
                                    if (cWorkers.length === 0) return null;

                                    return (
                                        <div key={c.firebaseKey} className="bg-slate-900/50 rounded-2xl border border-slate-700 p-6 shadow-xl mb-6">
                                            <div className="flex justify-between items-start mb-6 border-b border-slate-800 pb-4">
                                                <div>
                                                    <h3 className="text-xl font-bold text-white mb-2">{c.companyName}</h3>
                                                    <div className="flex flex-wrap gap-2 items-center">
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-widest mr-2">Authorized Sites:</span>
                                                        {safeArr(c.allocatedSites).map(s => <span key={s} className="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-bold">{s}</span>)}
                                                        {safeArr(c.allocatedSites).length === 0 && <span className="text-[10px] text-red-400">No Sites Allocated</span>}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Total Deployed</div>
                                                    <div className="text-2xl font-mono font-bold text-white">{cWorkers.length}</div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {cWorkers.map(w => (
                                                    <div key={w.id} className="p-4 rounded-xl border border-slate-700 bg-slate-950 shadow-sm flex flex-col justify-between h-full">
                                                        <div className="mb-4">
                                                            <div className="font-bold text-white text-sm">{w.name}</div>
                                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">{w.role}</div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Current Deployment</label>
                                                            <select
                                                                value={w.deployedSite || ''}
                                                                onChange={e => quickUpdateWorkerDeployment(c.firebaseKey, w.id, e.target.value)}
                                                                disabled={!canEdit}
                                                                className={`w-full bg-slate-900 border rounded-lg text-xs p-2 outline-none transition-colors font-bold ${w.deployedSite ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}`}
                                                            >
                                                                <option value="">Unassigned / Pending</option>
                                                                {safeArr(c.allocatedSites).map(s => <option key={s} value={s}>{s}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                                {visibleContractors.filter(c => safeArr(c.workers).length > 0).length === 0 && (
                                    <div className="text-center p-12 bg-slate-900/50 rounded-2xl border border-slate-700 text-slate-500 italic">No contractor workers have been registered yet. Add workers to see deployments.</div>
                                )}
                            </div>
                        )}
                    </div>
                </main>


                {/* ===================================================================== */}
                {/* MODALS */}
                {/* ===================================================================== */}

                {/* MODAL 0: ADD NEW WORKER */}
                {modalType === 'add_worker' && (
                    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-lg w-full p-8 relative">
                            <button onClick={() => setModalType(null)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                            <h3 className="text-2xl font-black text-emerald-400 mb-2"><i className="fas fa-user-plus mr-2"></i> Register New Worker</h3>
                            <p className="text-slate-400 text-xs mb-6">Assign an employee to an existing contractor roster.</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Select Contractor Company *</label>
                                    <select value={addWorkerData.contractorId} onChange={e => setAddWorkerData({ ...addWorkerData, contractorId: e.target.value, deployedSite: '' })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500 font-bold">
                                        <option value="">Select Vendor...</option>
                                        {visibleContractors.map(c => <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Full Name *</label>
                                    <input value={addWorkerData.name} onChange={e => setAddWorkerData({ ...addWorkerData, name: e.target.value })} placeholder="Worker Name" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Role / Job Title</label>
                                        <input value={addWorkerData.role} onChange={e => setAddWorkerData({ ...addWorkerData, role: e.target.value })} placeholder="e.g. Electrician" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Competence *</label>
                                        <input value={addWorkerData.competence} onChange={e => setAddWorkerData({ ...addWorkerData, competence: e.target.value })} placeholder="e.g. ITI Certified" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500" />
                                    </div>
                                </div>

                                {/* DEPLOYED SITE SELECTOR FOR WORKER */}
                                {addWorkerData.contractorId && (
                                    <div className="pt-2">
                                        <label className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">Initial Site Deployment *</label>
                                        <select value={addWorkerData.deployedSite} onChange={e => setAddWorkerData({ ...addWorkerData, deployedSite: e.target.value })} className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl p-3 text-emerald-400 outline-none focus:border-emerald-500 font-bold shadow-inner">
                                            <option value="">Select Target Site...</option>
                                            {(() => {
                                                const selC = contractors.find(c => c.firebaseKey === addWorkerData.contractorId);
                                                return safeArr(selC?.allocatedSites).map(s => <option key={s} value={s}>{s}</option>);
                                            })()}
                                        </select>
                                    </div>
                                )}

                                <p className="text-[10px] text-slate-500 italic mt-4">Note: Medical Fitness and Competence Documents can be uploaded directly from the worker's profile after registration.</p>
                            </div>

                            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                                <button onClick={() => setModalType(null)} className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                                <button onClick={submitNewWorker} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg transition-transform active:scale-95"><i className="fas fa-check mr-2"></i> Register</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL 1: COMPANY PROFILE (Consolidated Docs, Roster, Permits) */}
                {activeVendor && modalType === 'company_profile' && (
                    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-6xl w-full relative max-h-[95vh] flex flex-col overflow-hidden">
                            <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center flex-shrink-0">
                                {editingVendor ? (
                                    <div className="flex-1 mr-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <input value={editingVendor.companyName} onChange={e => setEditingVendor({ ...editingVendor, companyName: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm font-bold outline-none focus:border-indigo-500" placeholder="Company Name" />

                                        <div className="relative group col-span-2">
                                            <div className="text-[10px] text-slate-400 absolute -top-2 left-2 bg-slate-900 px-1 font-bold z-10">Authorized Sites</div>
                                            <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 h-10 overflow-hidden flex flex-wrap gap-1 hover:h-auto hover:absolute hover:w-full hover:z-50 min-h-full">
                                                {visibleSites.map(s => (
                                                    <label key={s.code} className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer whitespace-nowrap ${editingVendor.allocatedSites.includes(s.code) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                                                        <input type="checkbox" className="hidden" checked={editingVendor.allocatedSites.includes(s.code)} onChange={() => {
                                                            const exists = editingVendor.allocatedSites.includes(s.code);
                                                            setEditingVendor(prev => ({ ...prev, allocatedSites: exists ? prev.allocatedSites.filter(x => x !== s.code) : [...prev.allocatedSites, s.code] }));
                                                        }} />
                                                        {s.name}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <select value={editingVendor.serviceType} onChange={e => setEditingVendor({ ...editingVendor, serviceType: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-indigo-300 text-sm font-bold outline-none focus:border-indigo-500">
                                            {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="text-2xl font-black text-white flex items-center gap-3"><i className="fas fa-building text-indigo-500"></i> {activeVendor.companyName}</h3>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2 flex flex-wrap gap-4 items-center">
                                            <span className="flex gap-1 items-center bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded"><i className="fas fa-map-marker-alt"></i> {safeArr(activeVendor.allocatedSites).join(', ') || 'No Sites'}</span>
                                            <span><i className="fas fa-wrench text-indigo-400 mr-1"></i> {activeVendor.serviceType}</span>
                                            <span><i className="fas fa-user text-indigo-400 mr-1"></i> {activeVendor.contactPerson}</span>
                                            <span className={`px-2 py-0.5 rounded text-[9px] border ${getComplianceStatus(activeVendor.documents).color}`}>{getComplianceStatus(activeVendor.documents).label}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 items-center">
                                    {canEdit && (
                                        editingVendor ? (
                                            <>
                                                <button onClick={() => setEditingVendor(null)} className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest">Cancel</button>
                                                <button onClick={saveCompanyProfileEdit} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors shadow-lg shadow-emerald-600/20"><i className="fas fa-save mr-1"></i> Save</button>
                                            </>
                                        ) : (
                                            <button onClick={() => setEditingVendor({ ...activeVendor })} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors border border-slate-600"><i className="fas fa-edit"></i> Edit Company</button>
                                        )
                                    )}
                                    <button onClick={() => setActiveVendor(null)} className="text-slate-500 hover:text-white w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 ml-2"><i className="fas fa-times text-xl"></i></button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scroll p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-900/50">

                                {/* COLUMN 1: DOCUMENTS */}
                                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[70vh]">
                                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-folder-open mr-2"></i> Company Level Documents</h4>
                                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                                        {safeArr(activeVendor.documents).map(doc => {
                                            const isExp = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                                            return (
                                                <div key={doc.id} className={`p-3 rounded-xl border shadow-sm ${isExp ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-900 border-slate-700'}`}>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="text-xs font-bold text-white leading-tight">{doc.name} {doc.isMandatory && <span className="text-[8px] bg-red-900 text-red-300 px-1 ml-1 rounded">REQ</span>}</div>
                                                        {doc.file ? (
                                                            <a href={doc.file} target="_blank" rel="noreferrer" className="text-[9px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded border border-blue-500/30 uppercase font-bold"><i className="fas fa-eye"></i> View</a>
                                                        ) : (
                                                            <div className="relative overflow-hidden w-20">
                                                                <input type="file" onChange={(e) => handleDocUpload(doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                                <div className="w-full bg-slate-800 border border-slate-600 text-slate-300 text-[9px] p-1 text-center rounded uppercase font-bold cursor-pointer">Upload</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex justify-between items-center mt-2">
                                                        <div className={`text-[10px] font-mono ${isExp ? 'text-red-400' : 'text-slate-500'}`}>Exp: {doc.expiryDate || 'N/A'}</div>
                                                        {doc.status === 'Uploaded' && <span className="text-[8px] text-emerald-400 font-bold uppercase"><i className="fas fa-check"></i> Uploaded</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {canEdit && (
                                        <div className="mt-4 pt-4 border-t border-slate-800">
                                            <input value={newDocReq} onChange={e => setNewDocReq(e.target.value)} placeholder="Request new document..." className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs p-2.5 text-white outline-none focus:border-indigo-500 mb-2" />
                                            <button onClick={requestAdditionalDoc} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus"></i> Request</button>
                                        </div>
                                    )}
                                </div>

                                {/* COLUMN 2: ROSTER (Read Only view from Company Profile) */}
                                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[70vh]">
                                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 flex justify-between items-center">
                                        <span><i className="fas fa-users-cog mr-2"></i> Employee Roster</span>
                                        <span className="bg-purple-900 text-purple-300 px-2 py-0.5 rounded">{safeArr(activeVendor.workers).length}</span>
                                    </h4>

                                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-2">
                                        {safeArr(activeVendor.workers).map(w => (
                                            <div key={w.id} className="p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm relative group">
                                                <div className="text-sm font-bold text-white flex justify-between items-center">
                                                    <div>
                                                        {w.name} <span className="text-[9px] text-slate-400 font-normal ml-1">({w.role})</span>
                                                    </div>
                                                </div>

                                                <div className="mt-2 flex gap-2">
                                                    {w.medDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase font-bold"><i className="fas fa-check"></i> Med Fit</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 uppercase font-bold"><i className="fas fa-times"></i> Med Fit</span>}
                                                    {w.compDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase font-bold"><i className="fas fa-check"></i> Comp Doc</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 uppercase font-bold"><i className="fas fa-times"></i> Comp Doc</span>}
                                                </div>

                                                <div className="mt-3 pt-2 border-t border-slate-800 flex justify-between items-center">
                                                    <div>
                                                        {!w.inductionDate || w.inductionDate === 'Pending' ? (
                                                            <span className="text-[8px] text-orange-400 uppercase font-bold tracking-widest"><i className="fas fa-exclamation-triangle"></i> Pend Induction</span>
                                                        ) : (
                                                            <span className="text-[8px] text-emerald-400 uppercase font-bold tracking-widest"><i className="fas fa-check"></i> Inducted</span>
                                                        )}
                                                    </div>
                                                    {canEdit && <button onClick={() => removeWorkerFromProfile(activeVendor.firebaseKey, w.id)} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash-alt text-xs"></i></button>}
                                                </div>
                                            </div>
                                        ))}
                                        {safeArr(activeVendor.workers).length === 0 && <div className="text-center text-slate-500 text-xs italic mt-4">No employees registered. Add them from the Worker Profiles tab.</div>}
                                    </div>
                                </div>

                                {/* COLUMN 3: PERMITS */}
                                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[70vh]">
                                    <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-clipboard-list mr-2"></i> Work Permits (PTW)</h4>
                                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                                        {/* Find permits for this contractor globally */}
                                        {globalPermits.filter(p => p.contractorId === activeVendor.firebaseKey || (p.contractorName && p.contractorName.toLowerCase() === activeVendor.companyName.toLowerCase())).map((p, idx) => (
                                            <div key={idx} className={`p-3 rounded-xl border shadow-sm ${p.status === 'Closed' ? 'bg-slate-900 border-slate-700 opacity-60' : 'bg-orange-950/20 border-orange-500/30'}`}>
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400">{p.permitType}</div>
                                                    <div className="text-[9px] font-mono text-slate-500">{p.id || 'PTW'}</div>
                                                </div>
                                                <div className="text-xs text-white font-medium mb-2 leading-tight">{p.workDescription}</div>
                                                <div className="flex justify-between items-center text-[9px] uppercase font-bold">
                                                    <span className="text-slate-400">{p.date || p.createdAt}</span>
                                                    <span className={p.status === 'Closed' ? 'text-emerald-500' : 'text-yellow-500 animate-pulse'}>{p.status}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {globalPermits.filter(p => p.contractorId === activeVendor.firebaseKey || (p.contractorName && p.contractorName.toLowerCase() === activeVendor.companyName.toLowerCase())).length === 0 && (
                                            <div className="text-center text-slate-500 text-xs italic mt-4">No permits found for this contractor.</div>
                                        )}
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                                        <button onClick={() => navigate('/ptw')} className="text-[10px] text-orange-400 hover:text-white uppercase font-bold tracking-widest transition-colors"><i className="fas fa-external-link-alt mr-1"></i> Open PTW Module</button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL 2: WORKER PROFILE (Deep Dive) */}
                {activeWorker && modalType === 'worker_profile' && (
                    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-5xl w-full relative max-h-[90vh] flex flex-col overflow-hidden">

                            {/* Profile Header */}
                            <div className="p-8 border-b border-slate-800 bg-slate-950 flex justify-between items-start flex-shrink-0">
                                <div className="flex gap-6 items-center">
                                    <div className="w-16 h-16 rounded-full bg-indigo-900/50 border border-indigo-500 flex items-center justify-center text-indigo-400 text-2xl shadow-inner">
                                        <i className="fas fa-user-hard-hat"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-3xl font-black text-white mb-1">{activeWorker.name}</h3>
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-3">
                                            <span>{activeWorker.role}</span>
                                            <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                            <span className="text-indigo-400">{activeWorker.companyName}</span>
                                            <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                            <span className="text-emerald-400">Deployed: {activeWorker.deployedSite || 'Unassigned'}</span>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {activeWorker.medDoc ? (
                                                <div className="flex items-center gap-1">
                                                    <a href={activeWorker.medDoc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-l-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-colors"><i className="fas fa-file-medical"></i> Med Fitness</a>
                                                    {canEdit && (
                                                        <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-r-lg px-2 py-1.5 transition-colors" title="Update Doc">
                                                            <input type="file" onChange={(e) => handleWorkerCoreDocUpload('med', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                            <i className="fas fa-upload text-[10px]"></i>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                canEdit ? (
                                                    <div className="relative overflow-hidden">
                                                        <input type="file" onChange={(e) => handleWorkerCoreDocUpload('med', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="Upload Medical Fitness Form 33" />
                                                        <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:bg-red-600 hover:text-white transition-colors"><i className="fas fa-upload"></i> Upload Med Fitness</span>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i className="fas fa-times-circle"></i> No Med Fitness Doc</span>
                                                )
                                            )}

                                            {activeWorker.compDoc ? (
                                                <div className="flex items-center gap-1">
                                                    <a href={activeWorker.compDoc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-blue-900/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-l-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-colors"><i className="fas fa-certificate"></i> Competence</a>
                                                    {canEdit && (
                                                        <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-r-lg px-2 py-1.5 transition-colors" title="Update Doc">
                                                            <input type="file" onChange={(e) => handleWorkerCoreDocUpload('comp', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                            <i className="fas fa-upload text-[10px]"></i>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                canEdit ? (
                                                    <div className="relative overflow-hidden">
                                                        <input type="file" onChange={(e) => handleWorkerCoreDocUpload('comp', e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="Upload Competence Certificate" />
                                                        <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:bg-red-600 hover:text-white transition-colors"><i className="fas fa-upload"></i> Upload Competence</span>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i className="fas fa-times-circle"></i> No Competence Doc</span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setActiveWorker(null)} className="text-slate-500 hover:text-white w-10 h-10 rounded-full flex items-center justify-center bg-slate-800"><i className="fas fa-times text-xl"></i></button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scroll p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-900/50">

                                {/* LEFT COL */}
                                <div className="space-y-8">
                                    {/* Company Compliance Parent */}
                                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Parent Company Compliance</h4>
                                        {(() => {
                                            const parentC = contractors.find(c => c.firebaseKey === activeWorker.contractorId);
                                            if (!parentC) return <div className="text-slate-500 italic text-xs">Data unavailable</div>;
                                            const st = getComplianceStatus(parentC.documents);
                                            return (
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xs border-2 ${st.pct === 100 ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30' : st.pct > 50 ? 'border-yellow-500 text-yellow-400 bg-yellow-950/30' : 'border-red-500 text-red-400 bg-red-950/30'}`}>
                                                        {st.pct}%
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-bold">{parentC.companyName}</div>
                                                        <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${st.color.split(' ')[0]}`}>{st.label}</div>
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                    </div>

                                    {/* Additional Worker Documents */}
                                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col max-h-[400px]">
                                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-folder-plus mr-2"></i> Additional Documents (Worker Level)</h4>
                                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                                            {safeArr(activeWorker.additionalDocs).map(doc => (
                                                <div key={doc.id} className="p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm flex justify-between items-center">
                                                    <div className="text-xs font-bold text-white">{doc.name}</div>
                                                    {doc.file ? (
                                                        <a href={doc.file} target="_blank" rel="noreferrer" className="text-[9px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded border border-blue-500/30 uppercase font-bold"><i className="fas fa-eye"></i> View</a>
                                                    ) : (
                                                        <div className="relative overflow-hidden w-20">
                                                            <input type="file" onChange={(e) => uploadAdditionalWorkerDoc(doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                            <div className="w-full bg-slate-800 border border-slate-600 text-slate-300 text-[9px] p-1 text-center rounded uppercase font-bold cursor-pointer">Upload</div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {safeArr(activeWorker.additionalDocs).length === 0 && <div className="text-center text-slate-500 text-xs italic mt-2">No additional documents requested.</div>}
                                        </div>
                                        {canEdit && (
                                            <div className="mt-4 pt-4 border-t border-slate-800">
                                                <input value={newWorkerDocReq} onChange={e => setNewWorkerDocReq(e.target.value)} placeholder="Request extra doc (e.g. Police Ver.)" className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs p-2.5 text-white outline-none focus:border-indigo-500 mb-2" />
                                                <button onClick={requestAdditionalWorkerDoc} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus"></i> Request for Worker</button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* RIGHT COL */}
                                <div className="space-y-8">
                                    {/* Worker Training History */}
                                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                        <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-graduation-cap mr-2"></i> Training & Inductions</h4>
                                        <div className="space-y-4">
                                            {/* Induction Block */}
                                            <div className={`p-4 rounded-xl border shadow-sm ${activeWorker.inductionDate && activeWorker.inductionDate !== 'Pending' ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-orange-950/20 border-orange-500/30'}`}>
                                                <div className="text-xs font-bold uppercase tracking-widest mb-1 text-white">Site Safety Induction</div>
                                                {activeWorker.inductionDate && activeWorker.inductionDate !== 'Pending' ? (
                                                    <div className="text-emerald-400 text-[10px] font-mono"><i className="fas fa-check-circle mr-1"></i> Completed: {activeWorker.inductionDate}</div>
                                                ) : (
                                                    <div className="text-orange-400 text-[10px] font-bold animate-pulse"><i className="fas fa-exclamation-triangle mr-1"></i> Pending / Required</div>
                                                )}
                                            </div>

                                            {/* Other Trainings */}
                                            {safeArr(activeWorker.trainingsList).map((t, idx) => (
                                                <div key={idx} className="p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
                                                    <div className="text-sm font-bold text-blue-300">{t.topic || 'Training Session'}</div>
                                                    <div className="text-[10px] font-mono text-slate-500 mt-1">Date: {t.date || 'N/A'} | Exp: <span className="text-emerald-400">{t.expiryDate || 'N/A'}</span></div>
                                                </div>
                                            ))}
                                            {safeArr(activeWorker.trainingsList).length === 0 && (
                                                <div className="text-center text-slate-500 text-xs italic mt-4">No additional training records found globally.</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Worker Injury History */}
                                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                        <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-briefcase-medical mr-2"></i> Injury & Incident Involvement</h4>
                                        <div className="space-y-3">
                                            {safeArr(activeWorker.injuriesList).map((inc, idx) => (
                                                <div key={idx} className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 shadow-sm">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="font-bold text-xs uppercase tracking-widest text-red-400">{inc.type || 'Incident'}</div>
                                                        <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded">{inc.date || 'Unknown Date'}</div>
                                                    </div>
                                                    <div className="text-xs text-slate-300 leading-relaxed">{inc.desc || 'No description provided.'}</div>
                                                </div>
                                            ))}
                                            {safeArr(activeWorker.injuriesList).length === 0 && (
                                                <div className="text-center text-emerald-500 font-bold text-sm mt-10"><i className="fas fa-shield-check mr-2"></i>Zero Incidents Recorded!</div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}