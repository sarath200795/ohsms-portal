import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import QRious from 'qrious';
import * as XLSX from 'xlsx';

// ==========================================
// GLOBALS & BULLETPROOF FAILSAFES
// ==========================================

const ensureArray = (val) => {
    if (val === null || val === undefined) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [val];
};

const safeArrayParse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) {
        return data.map((item, idx) => {
            if (item && typeof item === 'object') {
                return { ...item, firebaseKey: String(idx) };
            }
            return null;
        }).filter(Boolean);
    }
    if (typeof data !== 'object') return [];
    return Object.keys(data).reduce((acc, key) => {
        if (typeof data[key] === 'object' && data[key] !== null) {
            acc.push({ ...data[key], firebaseKey: key });
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
        wms: ensureArray(p.wms),
        entrantNames: ensureArray(p.entrantNames), // Now acts as the unified "Assigned Workers" array
        wahEquipment: ensureArray(p.wahEquipment),
        ppe: ensureArray(p.ppe),
        checklist: ensureArray(p.checklist),
        nonCompliances: ensureArray(p.nonCompliances)
    };
};

const getTypeConfig = (tId) => PERMIT_TYPES.find(t => t.id === tId) || PERMIT_TYPES[5];

export default function Ptw() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState('dashboard');

    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [contractors, setContractors] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');

    const [permits, setPermits] = useState([]);
    const [lotoProcedures, setLotoProcedures] = useState([]);

    const [printData, setPrintData] = useState(null);
    const [qrImage, setQrImage] = useState(null);

    const [formData, setFormData] = useState(null);
    const [inspectionModal, setInspectionModal] = useState(null);
    const [newNC, setNewNC] = useState('');

    // REASSIGNMENT STATE
    const [reassignModal, setReassignModal] = useState(null);
    const [newApproverEmail, setNewApproverEmail] = useState('');

    // RBAC STATE
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });

    const myName = session?.name || session?.user || 'Me';
    const myEmail = session?.email?.toLowerCase().trim() || '';

    useEffect(() => {
        try {
            const s = sessionStorage.getItem('isoSession');
            if (!s) { navigate('/'); return; }
            const sess = JSON.parse(s);

            const cleanRole = String(sess.role || '').trim();

            // 1. STRICT MODULE GUARD
            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(cleanRole);
            const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(cleanRole);

            const hasModuleAccess = isGlobalAdmin || isSiteAdmin || (sess.accessibleModules || []).some(m => {
                const lowerM = String(m).toLowerCase();
                return lowerM.includes('permit') || lowerM.includes('ptw');
            });

            if (!hasModuleAccess) {
                alert("Security Alert: You do not have permission to access the Permit to Work module.");
                navigate('/dashboard');
                return;
            }

            setSession(sess);

            // 2. STRICT RBAC MATRIX
            const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(cleanRole);
            const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(cleanRole);

            setPermissions({
                viewOnly: !canEditCr,
                canDelete: canDel,
                canEditCreate: canEditCr
            });

            // 3. SYNCHRONIZED SITE PERSISTENCE
            const params = new URLSearchParams(location.search);
            let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';

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
                                    ? { id: key, name: uVal.name || uVal.email || "System User", email: uVal.email, role: uVal.role || "User", assignedSite: uVal.assignedSite, accessibleSites: uVal.accessibleSites || [] }
                                    : { id: key, name: uVal || "System User", email: uVal, role: "User", assignedSite: "GLOBAL", accessibleSites: [] };
                            }).filter(u => u.status !== 'Inactive' && u.status !== 'Deleted'));
                        }

                        if (data.contractors) {
                            setContractors(Object.entries(data.contractors).map(([k, v]) => ({ ...v, firebaseKey: k })));
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
        } catch (error) {
            console.error("Initialization Error", error);
            setLoading(false);
        }
    }, [navigate, location]);

    // ==========================================
    // STRICT SITE & ROLE AUTHORIZATION LOGIC
    // ==========================================

    const isGlobalUser = useMemo(() => {
        if (!session) return false;
        const role = session.role || '';
        const site = session.assignedSite || '';
        const access = session.accessibleSites || [];
        return role === 'Owner' || role === 'Admin' || role === 'Lead Auditor' || role === 'Global Owner' || role === 'Global Manager' || site === 'GLOBAL' || access.includes('GLOBAL');
    }, [session]);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set();
        if (session.assignedSite && session.assignedSite !== 'GLOBAL') codes.add(session.assignedSite);
        if (Array.isArray(session.accessibleSites)) {
            session.accessibleSites.forEach(s => {
                if (s && s !== 'GLOBAL') codes.add(s);
            });
        }
        return codes;
    }, [session]);

    const allowedSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const handleSiteFilterChange = (e) => {
        const val = e.target.value;
        setSiteFilter(val);
        sessionStorage.setItem('isoCurrentSite', val === 'All' ? 'GLOBAL' : val);
    };

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

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!formData?.siteId) return true;
        return allowedSiteCodes.has(formData.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, formData?.siteId]);


    // ==========================================
    // FILTER LOGIC & CONTRACTOR INTEGRATION
    // ==========================================

    const visiblePermits = useMemo(() => {
        return permits.filter(p => {
            const hasSiteAccess = isGlobalUser || allowedSiteCodes.has(p.siteId);
            if (!hasSiteAccess) return false; // RLS Hard Block
            if (siteFilter !== 'All' && p.siteId !== siteFilter) return false;
            return true;
        });
    }, [permits, siteFilter, isGlobalUser, allowedSiteCodes]);

    const myPendingApprovals = useMemo(() => {
        return visiblePermits.filter(p => {
            const engMatch = isEngApprover(p);
            const prodMatch = isProdApprover(p);

            if (p.status === 'Pending Approval') {
                return (engMatch && p.engStatus === 'Pending') || (prodMatch && p.prodStatus === 'Pending');
            }
            if (p.status === 'Pending Closure') {
                return (engMatch && p.engStatus === 'Closure Pending') || (prodMatch && p.prodStatus === 'Closure Pending');
            }
            return false;
        });
    }, [visiblePermits, session]);

    // INTEGRATION: Filter Contractors by Selected Site
    const availableContractors = useMemo(() => {
        if (!formData?.siteId) return [];
        return contractors.filter(c => ensureArray(c.allocatedSites).includes(formData.siteId) || c.siteId === 'GLOBAL');
    }, [contractors, formData?.siteId]);

    // INTEGRATION: Filter Workers by Type and Site
    const availableWorkers = useMemo(() => {
        if (!formData) return [];
        if (formData.workerType === 'Internal') {
            return users.filter(u => u.assignedSite === formData.siteId || ensureArray(u.accessibleSites).includes(formData.siteId) || u.assignedSite === 'GLOBAL');
        }
        if (formData.workerType === 'Contractor' && formData.contractorId) {
            const vendor = contractors.find(c => c.firebaseKey === formData.contractorId);
            return ensureArray(vendor?.workers).filter(w => w.deployedSite === formData.siteId || vendor.siteId === 'GLOBAL');
        }
        return [];
    }, [formData?.workerType, formData?.siteId, formData?.contractorId, users, contractors]);

    const toggleWorker = (name) => {
        setFormData(prev => {
            const exists = prev.entrantNames.includes(name);
            return { ...prev, entrantNames: exists ? prev.entrantNames.filter(n => n !== name) : [...prev.entrantNames, name] };
        });
    };


    // ==========================================
    // WORKFLOW ENGINE
    // ==========================================
    const openForm = (record = null) => {
        if (!record && !permissions.canEditCreate) return alert("Security Error: You do not have permission to create permits.");

        setPrintData(null);
        if (record) {
            const recToEdit = normalizePermit({ ...record });
            if (recToEdit.wms.length === 0) recToEdit.wms = [{ step: '', hazard: '', precaution: '' }];
            if (recToEdit.ppe.length === 0) recToEdit.ppe = ["Hard Hat", "Safety Glasses", "Safety Shoes"];
            if (recToEdit.checklist.length === 0) {
                const targetChecklist = CHECKLIST_ITEMS[recToEdit.typeId || 'GEN'] || CHECKLIST_ITEMS['GEN'];
                recToEdit.checklist = targetChecklist.map(item => ({ label: item, checked: false }));
            }
            setFormData(recToEdit);
        } else {
            const typeId = 'GEN';
            const defaultSite = (!isGlobalUser && allowedSites.length === 1) ? allowedSites[0].code : '';

            setFormData({
                id: `PTW-${Math.floor(100000 + Math.random() * 900000)}`,
                typeId: typeId, siteId: defaultSite, location: '', equipment: '',
                description: '', issuingDept: '', issuedToName: '', issuedToPh: '',
                fireWatcherName: '', attendantName: '', entrySupervisorName: '',
                workerType: 'Internal', contractorId: '', contractorName: '', entrantNames: [], // entrantNames acts as assignedWorkers
                oxygenLevel: '', toxicGas: '', flammability: '', lotoRef: '', wahEquipment: [],
                wms: [{ step: '', hazard: '', precaution: '' }],
                validFromDate: new Date().toISOString().split('T')[0], validFromTime: '08:00',
                validToDate: new Date().toISOString().split('T')[0], validToTime: '17:00',
                status: 'Draft', requestedBy: session?.user || session?.email, creatorEmail: session?.email || session?.user, createdDate: new Date().toISOString(),
                ppe: ["Hard Hat", "Safety Glasses", "Safety Shoes"],
                checklist: (CHECKLIST_ITEMS[typeId] || CHECKLIST_ITEMS['GEN']).map(item => ({ label: item, checked: false })),
                engApproverEmail: '', prodApproverEmail: '', engStatus: 'Pending', prodStatus: 'Pending', nonCompliances: []
            });
        }
        setCurrentView('builder');
    };

    const updateField = (field, value) => {
        if (!canEditForm) return;
        setFormData(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'typeId' && prev.status === 'Draft') {
                const targetChecklist = CHECKLIST_ITEMS[value] || CHECKLIST_ITEMS['GEN'];
                next.checklist = targetChecklist.map(item => ({ label: item, checked: false }));
            }
            return next;
        });
    };

    const handleSave = async (isDraft = true) => {
        if (!canEditForm) return alert("Security Error: You do not have permission to edit records for this site.");
        if (!formData.siteId || !formData.description || !formData.location) {
            return alert("Site, Location, and Description are mandatory fields.");
        }
        if (formData.workerType === 'Contractor' && !formData.contractorId) {
            return alert("Please select the Contractor Company.");
        }
        if (formData.entrantNames.length === 0) {
            return alert("Please select at least one worker for the execution team.");
        }

        if (!isGlobalUser && !allowedSiteCodes.has(formData.siteId)) {
            return alert("Security Authorization Failed: You do not have permission to create permits for this specific facility.");
        }

        setSaving(true);
        try {
            const { firebaseKey, ...payload } = formData;
            payload.lastUpdated = new Date().toISOString();

            if (payload.workerType === 'Contractor') {
                const vendor = contractors.find(c => c.firebaseKey === payload.contractorId);
                if (vendor) payload.contractorName = vendor.companyName;
            }

            if (!isDraft) {
                if (!payload.engApproverEmail || !payload.prodApproverEmail) {
                    setSaving(false);
                    return alert("Cannot submit! Please scroll down to Section 5 and select both Engineering and Production approvers.");
                }
                payload.status = 'Pending Approval';
                payload.engStatus = 'Pending';
                payload.prodStatus = 'Pending';
            }

            if (firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${firebaseKey}`), payload);
                setPermits(permits.map(p => p.id === formData.id ? normalizePermit({ ...payload, firebaseKey }) : p));
            } else {
                const newRef = await push(ref(rtdb, `organizations/${session.orgId}/ptwRecords`), payload);
                payload.firebaseKey = newRef.key;
                setPermits([normalizePermit(payload), ...permits]);
            }

            alert(`Success! Permit ${isDraft ? 'Draft Saved' : 'Sent for Dual Authorization'}.`);
            setCurrentView('inventory');
        } catch (e) {
            alert("Error saving permit: " + e.message);
        }
        setSaving(false);
    };

    const handleApproveInitiation = async (permit, role) => {
        if (!permit.firebaseKey) return alert("Database error: Permit missing key.");

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
                alert(`${role === 'eng' ? 'Engineering' : 'Production'} authorization recorded. Awaiting counterpart.`);
            }

            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));
        } catch (e) { alert("Error approving: " + e.message); }
    };

    // CONTRACTOR NON-COMPLIANCE INTEGRATION
    const addNonCompliance = async () => {
        if (!newNC) return;
        const newRecord = { id: Date.now(), desc: newNC, date: new Date().toISOString().split('T')[0] };
        const updatedNCs = [...ensureArray(formData.nonCompliances), newRecord];

        setFormData(prev => ({ ...prev, nonCompliances: updatedNCs }));
        setNewNC('');

        // Instantly save the NC to the database to ensure the Contractor module picks it up
        if (formData.firebaseKey) {
            try {
                await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${formData.firebaseKey}`), { nonCompliances: updatedNCs });
                setPermits(permits.map(p => p.id === formData.id ? normalizePermit({ ...p, nonCompliances: updatedNCs }) : p));
            } catch (e) { console.error("Failed to sync NC to DB", e); }
        }
    };

    const removeNonCompliance = async (id) => {
        const updatedNCs = ensureArray(formData.nonCompliances).filter(nc => nc.id !== id);
        setFormData(prev => ({ ...prev, nonCompliances: updatedNCs }));

        if (formData.firebaseKey) {
            try {
                await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${formData.firebaseKey}`), { nonCompliances: updatedNCs });
                setPermits(permits.map(p => p.id === formData.id ? normalizePermit({ ...p, nonCompliances: updatedNCs }) : p));
            } catch (e) { console.error("Failed to sync NC removal to DB", e); }
        }
    };

    const handleInspectionSubmit = async (e, isNegative) => {
        e.preventDefault();
        if (!inspectionModal.firebaseKey) return alert("Database error: Permit missing key.");

        const obsText = e.target.observation.value;
        try {
            const updates = {
                lastInspection: obsText,
                lastInspectionDate: new Date().toISOString(),
                lastInspector: session.email || session.name
            };

            if (isNegative) {
                updates.status = 'Cancelled';
                updates.cancellationReason = "Failed Workplace Inspection: " + obsText;

                // If it's a contractor, automatically log the failed inspection as a non-compliance
                if (inspectionModal.workerType === 'Contractor') {
                    const newRecord = { id: Date.now(), desc: `CRITICAL SAFETY FAILURE: ${obsText}`, date: new Date().toISOString().split('T')[0] };
                    updates.nonCompliances = [...ensureArray(inspectionModal.nonCompliances), newRecord];
                }

                alert("CRITICAL: Negative observation logged. Permit has been CANCELLED immediately.");
            } else {
                alert("Safe observation logged successfully. Work may continue.");
            }

            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${inspectionModal.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === inspectionModal.id ? normalizePermit({ ...p, ...updates }) : p));
            setInspectionModal(null);
        } catch (err) { alert("Error logging inspection: " + err.message); }
    };

    const handleRequestClosure = async (permit) => {
        if (!permit.firebaseKey) return alert("Database error: Permit missing key.");
        if (!window.confirm("Submit this permit for final closure? Ensure all physical work is completed and area is clear.")) return;

        try {
            const updates = {
                status: 'Pending Closure',
                engStatus: 'Closure Pending',
                prodStatus: 'Closure Pending'
            };
            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));
            alert("Closure request sent to Authorizers.");
        } catch (e) { alert("Error submitting closure request: " + e.message); }
    };

    const handleApproveClosure = async (permit, role) => {
        if (!permit.firebaseKey) return alert("Database error: Permit missing key.");

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
                alert(`${role === 'eng' ? 'Engineering' : 'Production'} closure verified. Awaiting counterpart.`);
            }

            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));
        } catch (e) { alert("Error approving closure: " + e.message); }
    };

    const handleReassign = async () => {
        const { permit, role } = reassignModal;
        if (!permit.firebaseKey) return alert("Database error: Permit missing key.");
        if (!newApproverEmail) return alert("Please select a new approver.");

        try {
            const updates = {};
            if (role === 'eng') updates.engApproverEmail = newApproverEmail;
            if (role === 'prod') updates.prodApproverEmail = newApproverEmail;

            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits(permits.map(p => p.id === permit.id ? normalizePermit({ ...p, ...updates }) : p));

            setReassignModal(null);
            setNewApproverEmail('');
            alert("Approver successfully reassigned.");
        } catch (e) { alert("Error reassigning approver: " + e.message); }
    };

    // Array manipulation helpers
    const togglePPE = (item) => {
        if (!canEditForm) return;
        const arr = [...(formData.ppe || [])];
        if (arr.includes(item)) setFormData({ ...formData, ppe: arr.filter(i => i !== item) });
        else setFormData({ ...formData, ppe: [...arr, item] });
    };

    const toggleChecklistItem = (idx) => {
        if (!canEditForm) return;
        const arr = [...(formData.checklist || [])];
        if (arr[idx]) {
            arr[idx] = { ...arr[idx], checked: !arr[idx].checked };
            setFormData({ ...formData, checklist: arr });
        }
    };

    const addWmsRow = () => { if (canEditForm) setFormData(prev => ({ ...prev, wms: [...(prev.wms || []), { step: '', hazard: '', precaution: '' }] })); };
    const updateWmsRow = (idx, field, val) => {
        if (!canEditForm) return;
        const arr = [...(formData.wms || [])];
        if (arr[idx]) {
            arr[idx] = { ...arr[idx], [field]: val };
            setFormData({ ...formData, wms: arr });
        }
    };
    const removeWmsRow = (idx) => { if (canEditForm) setFormData(prev => ({ ...prev, wms: (prev.wms || []).filter((_, i) => i !== idx) })); };

    const toggleWahEquip = (item) => {
        if (!canEditForm) return;
        const arr = [...(formData.wahEquipment || [])];
        if (arr.includes(item)) setFormData({ ...formData, wahEquipment: arr.filter(i => i !== item) });
        else setFormData({ ...formData, wahEquipment: [...arr, item] });
    };

    const triggerPrint = (permit) => {
        const qrUrl = `${window.location.origin}${window.location.pathname}?ptw=${permit.id}`;
        try {
            if (typeof QRious !== 'undefined') {
                const qr = new QRious({ value: qrUrl, size: 200 });
                setQrImage(qr.toDataURL());
            }
        } catch (e) {
            console.warn("QRious failed to load, skipping QR code.", e);
        }
        setPrintData(normalizePermit(permit));

        setTimeout(() => {
            window.print();
        }, 500);
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

    if (loading || !session) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 font-['Space_Grotesk'] flex-col gap-4">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-amber-500 rounded-full animate-spin"></div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading PTW System...</h2>
        </div>
    );

    return (
        <>
            <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden relative font-['Space_Grotesk'] print:hidden">

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

                <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate(`/dashboard`)} className="text-slate-400 hover:text-white transition flex items-center gap-2">
                            <i className="fas fa-arrow-left"></i> Hub
                        </button>
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold shadow-lg shadow-amber-900/50">
                            <i className="fas fa-file-signature"></i>
                        </div>
                        <h1 className="text-base font-bold text-white tracking-wide hidden md:block uppercase">Permit to Work (PTW)</h1>

                        <div className="ml-4 flex gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-500/10 text-amber-400 px-2 py-1 rounded border border-amber-500/20">{session?.role}</span>
                            {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                        </div>
                    </div>
                </header>

                <div className="flex gap-3 px-8 pt-6 bg-slate-950 flex-wrap border-b border-slate-800 pb-4 z-10">
                    <button type="button" onClick={() => setCurrentView('dashboard')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentView === 'dashboard' ? 'bg-amber-600 text-white border-amber-500 shadow-amber-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-chart-pie mr-2"></i> PTW Dashboard</button>
                    <button type="button" onClick={() => setCurrentView('inventory')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentView === 'inventory' ? 'bg-amber-600 text-white border-amber-500 shadow-amber-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-folder-open mr-2"></i> Permit Registry</button>
                    {permissions.canEditCreate && (
                        <button type="button" onClick={() => openForm()} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentView === 'builder' ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/50' : 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700 hover:text-emerald-300'}`}><i className="fas fa-plus mr-2"></i> Create Permit</button>
                    )}
                </div>

                <main className="flex-1 overflow-y-auto custom-scroll relative pb-20 font-['Inter']">

                    {/* DASHBOARD */}
                    {currentView === 'dashboard' && (
                        <div className="p-8 max-w-7xl mx-auto animate-fade-in font-['Space_Grotesk']">
                            <div className="mb-8 flex justify-between items-end">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2">PTW Dashboard</h2>
                                    <p className="text-sm text-slate-400 font-['Inter']">Real-time status of safe work permits for your allowed locations.</p>
                                </div>
                                <div className="flex gap-4 text-sm font-bold items-center">
                                    <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none focus:border-amber-500 shadow-lg font-['Inter']">
                                        {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-blue-500">
                                    <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Work In Progress</h3>
                                    <div className="text-4xl font-black text-white">{visiblePermits.filter(p => p.status === 'Work in Progress').length}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-orange-500">
                                    <h3 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2">Pending Approval</h3>
                                    <div className="text-4xl font-black text-white">{visiblePermits.filter(p => p.status === 'Pending Approval').length}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-purple-500">
                                    <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">Pending Closure</h3>
                                    <div className="text-4xl font-black text-white">{visiblePermits.filter(p => p.status === 'Pending Closure').length}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-red-500">
                                    <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">Cancelled / Stopped</h3>
                                    <div className="text-4xl font-black text-white">{visiblePermits.filter(p => p.status === 'Cancelled').length}</div>
                                </div>
                            </div>

                            {myPendingApprovals.length > 0 && (
                                <div className="mb-10 p-6 bg-orange-900/20 border border-orange-500/50 rounded-3xl shadow-2xl">
                                    <h3 className="font-bold text-orange-400 mb-4 text-lg flex items-center gap-2"><i className="fas fa-bell animate-pulse"></i> Tasks Requiring Your Action</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {myPendingApprovals.map(p => (
                                            <div key={p.id} className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex flex-col justify-between font-['Inter']">
                                                <div>
                                                    <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase mb-2 inline-block border ${p.status === 'Pending Closure' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}>{p.status}</span>
                                                    <h4 className="font-bold text-white text-sm mb-1 line-clamp-2">{p.description}</h4>
                                                    <p className="text-xs text-slate-400 mb-4 truncate">{p.location}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => setCurrentView('inventory')} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 rounded-lg transition uppercase tracking-wider">Go to Registry</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <h3 className="font-bold text-white mb-4 text-xl">Recently Active Permits</h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 font-['Inter']">
                                {visiblePermits.filter(p => p.status === 'Work in Progress' || p.status === 'Pending Approval').slice(0, 6).map(p => {
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
                                                <span className={p.status === 'Work in Progress' ? 'text-blue-400 animate-pulse' : 'text-orange-400'}>{p.status}</span>
                                                <span className="text-slate-500">Till: {p.validToTime}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                                {visiblePermits.filter(p => p.status === 'Work in Progress' || p.status === 'Pending Approval').length === 0 && (
                                    <div className="col-span-full p-10 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/50 text-slate-500 italic">No active permits at this time.</div>
                                )}
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
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none w-48 focus:border-amber-500 shadow-lg font-['Inter'] text-sm font-bold">
                                    {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700 shadow-xl font-['Inter']">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-700 tracking-widest">
                                        <tr>
                                            <th className="p-4 pl-6">PTW Ref</th>
                                            <th className="p-4">Type</th>
                                            <th className="p-4">Location / Work</th>
                                            <th className="p-4">Status & Approvals</th>
                                            <th className="p-4 pr-6 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                                        {visiblePermits.map((p, i) => {
                                            const tConfig = getTypeConfig(p.typeId);
                                            const amIEng = isEngApprover(p);
                                            const amIProd = isProdApprover(p);
                                            const amICreator = isCreator(p);

                                            const canReassign = amICreator && (p.status === 'Pending Approval' || p.status === 'Pending Closure');
                                            const canEditPtwRow = permissions.canEditCreate && (p.status === 'Draft' || p.status === 'Pending Approval' || p.status === 'Work in Progress');

                                            return (
                                                <tr key={p.id || i} className={`hover:bg-slate-800/50 transition-colors ${p.status === 'Closed' ? 'opacity-60' : ''}`}>
                                                    <td className="p-4 pl-6 font-mono text-xs font-bold text-white">{p.id}</td>
                                                    <td className="p-4"><span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${tConfig.bg} ${tConfig.color} ${tConfig.border}`}>{tConfig.label}</span></td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-200 truncate max-w-xs">{p.description}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">{p.location} ({p.siteId})</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getStatusColor(p.status)}`}>{p.status}</span>

                                                        <div className="text-[9px] mt-2 flex flex-col gap-1 font-bold uppercase text-slate-500 tracking-widest">
                                                            <div className="flex items-center gap-2">
                                                                <span>ENG: <span className={p.engStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{p.engStatus}</span></span>
                                                                {canReassign && !p.engStatus.includes('Approved') && (
                                                                    <button type="button" onClick={() => { setReassignModal({ permit: p, role: 'eng' }); setNewApproverEmail(p.engApproverEmail); }} className="text-amber-500 hover:text-amber-400 transition" title="Reassign Eng Approver"><i className="fas fa-edit"></i></button>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span>PROD: <span className={p.prodStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{p.prodStatus}</span></span>
                                                                {canReassign && !p.prodStatus.includes('Approved') && (
                                                                    <button type="button" onClick={() => { setReassignModal({ permit: p, role: 'prod' }); setNewApproverEmail(p.prodApproverEmail); }} className="text-amber-500 hover:text-amber-400 transition" title="Reassign Prod Approver"><i className="fas fa-edit"></i></button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 pr-6 text-right flex justify-end gap-2 flex-wrap min-w-[200px] ml-auto">

                                                        {/* STAGE 1: INITIATION APPROVAL */}
                                                        {p.status === 'Pending Approval' && amIEng && p.engStatus === 'Pending' && (
                                                            <button type="button" onClick={() => handleApproveInitiation(p, 'eng')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow"><i className="fas fa-check mr-1"></i> Apprv Eng</button>
                                                        )}
                                                        {p.status === 'Pending Approval' && amIProd && p.prodStatus === 'Pending' && (
                                                            <button type="button" onClick={() => handleApproveInitiation(p, 'prod')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow"><i className="fas fa-check mr-1"></i> Apprv Prod</button>
                                                        )}

                                                        {/* STAGE 2: WORK IN PROGRESS */}
                                                        {p.status === 'Work in Progress' && (
                                                            <>
                                                                <button type="button" onClick={() => setInspectionModal(p)} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow"><i className="fas fa-search mr-1"></i> Inspect</button>
                                                                {amICreator && (
                                                                    <button type="button" onClick={() => handleRequestClosure(p)} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition border border-slate-500 shadow">Close Work</button>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* STAGE 3: CLOSURE APPROVAL */}
                                                        {p.status === 'Pending Closure' && amIEng && p.engStatus === 'Closure Pending' && (
                                                            <button type="button" onClick={() => handleApproveClosure(p, 'eng')} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow"><i className="fas fa-check-double mr-1"></i> Verify Close Eng</button>
                                                        )}
                                                        {p.status === 'Pending Closure' && amIProd && p.prodStatus === 'Closure Pending' && (
                                                            <button type="button" onClick={() => handleApproveClosure(p, 'prod')} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow"><i className="fas fa-check-double mr-1"></i> Verify Close Prod</button>
                                                        )}

                                                        {/* VIEW/PRINT/EDIT */}
                                                        <button type="button" onClick={() => triggerPrint(p)} className="bg-slate-800 hover:bg-slate-700 text-white w-8 h-8 rounded-lg text-sm transition border border-slate-600 shadow flex items-center justify-center"><i className="fas fa-print"></i></button>
                                                        {canEditPtwRow ? (
                                                            <button type="button" onClick={() => openForm(p)} className="bg-slate-800 hover:bg-amber-600 text-white w-8 h-8 rounded-lg text-sm transition border border-slate-600 shadow flex items-center justify-center"><i className="fas fa-edit"></i></button>
                                                        ) : (
                                                            <button type="button" onClick={() => openForm(p)} className="bg-slate-800 hover:bg-slate-700 text-white w-8 h-8 rounded-lg text-sm transition border border-slate-600 shadow flex items-center justify-center"><i className="fas fa-eye"></i></button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {visiblePermits.length === 0 && <tr><td colSpan={5} className="p-16 text-center text-slate-500 italic text-base border-t border-slate-800">No permits found for authorized locations.</td></tr>}
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
                                    <button type="button" onClick={() => setCurrentView('inventory')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl font-bold text-sm transition font-['Inter']">Cancel</button>

                                    {formData.status === 'Draft' && canEditForm ? (
                                        <>
                                            <button type="button" onClick={() => handleSave(true)} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow transition font-['Inter']">Save Draft</button>
                                            <button type="button" onClick={() => handleSave(false)} className="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/50 transition font-['Inter'] flex items-center gap-2"><i className="fas fa-paper-plane"></i> Submit for Authorization</button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" onClick={() => triggerPrint(formData)} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow transition flex items-center gap-2 font-['Inter']"><i className="fas fa-print"></i> Print Permit</button>
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
                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded border shadow-sm ${getStatusColor(formData.status)}`}>{formData.status}</span>
                                            <span className="font-mono text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-700 text-white font-bold shadow-inner">{formData.id}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Permit Category</label>
                                            <select value={formData.typeId} onChange={e => updateField('typeId', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="font-bold text-amber-400 border border-amber-900/50 shadow-inner">
                                                {PERMIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Site / Facility</label>
                                            <select value={formData.siteId} onChange={e => { updateField('siteId', e.target.value); setFormData(p => ({ ...p, contractorId: '', entrantNames: [] })); }} disabled={formData.status !== 'Draft' || (!isGlobalUser && allowedSites.length <= 1) || !canEditForm} className="font-bold text-white shadow-inner">
                                                {(isGlobalUser || allowedSites.length > 1) && <option value="">Select Authorized Site...</option>}
                                                {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                            </select>
                                        </div>

                                        {/* EXECUTION TEAM INTEGRATION */}
                                        <div className="md:col-span-2 border-t border-slate-700 pt-6 mt-2">
                                            <div className="flex gap-4 mb-4">
                                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                                                    <input type="radio" value="Internal" checked={formData.workerType === 'Internal'} onChange={() => setFormData({ ...formData, workerType: 'Internal', contractorId: '', entrantNames: [] })} disabled={formData.status !== 'Draft' || !canEditForm} className="accent-amber-500 w-4 h-4" /> Internal Staff
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                                                    <input type="radio" value="Contractor" checked={formData.workerType === 'Contractor'} onChange={() => setFormData({ ...formData, workerType: 'Contractor', entrantNames: [] })} disabled={formData.status !== 'Draft' || !canEditForm} className="accent-amber-500 w-4 h-4" /> External Contractor
                                                </label>
                                            </div>

                                            {formData.workerType === 'Contractor' && (
                                                <div className="mb-4">
                                                    <label className="text-[10px] uppercase font-bold text-amber-400 block mb-2 tracking-widest">Select Authorized Vendor</label>
                                                    <select value={formData.contractorId} onChange={e => setFormData({ ...formData, contractorId: e.target.value, entrantNames: [] })} disabled={formData.status !== 'Draft' || !canEditForm} className="w-full bg-amber-900/10 border border-amber-500/30 rounded-lg p-3 text-amber-300 outline-none focus:border-amber-500 font-bold shadow-inner">
                                                        <option value="">{formData.siteId ? 'Select Contractor...' : 'Select Site First'}</option>
                                                        {availableContractors.map(c => <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>)}
                                                    </select>
                                                </div>
                                            )}

                                            {((formData.workerType === 'Internal' && formData.siteId) || (formData.workerType === 'Contractor' && formData.contractorId)) && (
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Assign Execution Team (Entrants)</label>
                                                    <div className="flex-1 overflow-y-auto max-h-48 custom-scroll pr-2 bg-slate-900/50 rounded-xl border border-slate-700 p-2">
                                                        {availableWorkers.length > 0 ? availableWorkers.map((w, idx) => (
                                                            <label key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded cursor-pointer transition border border-transparent hover:border-slate-600 mb-1">
                                                                <input type="checkbox" checked={formData.entrantNames.includes(w.name || w.email)} onChange={() => formData.status === 'Draft' && toggleWorker(w.name || w.email)} disabled={formData.status !== 'Draft' || !canEditForm} className="w-4 h-4 accent-amber-500 cursor-pointer" />
                                                                <div>
                                                                    <div className="text-xs font-bold text-white">{w.name || w.email}</div>
                                                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">{w.role || 'Worker'}</div>
                                                                </div>
                                                            </label>
                                                        )) : (
                                                            <div className="p-4 text-center text-xs text-slate-500 italic">No workers available. Register workers in the respective modules.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Issuing Department</label><input value={formData.issuingDept} onChange={e => updateField('issuingDept', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. Maintenance, Production" className="shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Supervisor / In-Charge</label><input value={formData.issuedToName} onChange={e => updateField('issuedToName', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Supervisor Name" className="shadow-inner" /></div>

                                        <div className="md:col-span-2"><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Detailed Work Description</label><textarea rows="3" value={formData.description} onChange={e => updateField('description', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Describe the exact nature of the work, tools used, and method..." className="resize-none font-medium text-white shadow-inner custom-scroll"></textarea></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Specific Area / Location</label><input value={formData.location} onChange={e => updateField('location', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. Roof of Boiler Room" className="shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Equipment Involved (Optional)</label><input value={formData.equipment} onChange={e => updateField('equipment', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. HVAC Unit B" className="shadow-inner" /></div>
                                    </div>
                                </div>

                                {/* CONDITIONAL SPECIALTY SECTIONS */}
                                {formData.typeId === 'HOT' && (
                                    <div className="bg-red-900/20 p-8 rounded-3xl shadow-xl border border-red-500/30 animate-fade-in">
                                        <h3 className="text-lg font-bold text-red-400 flex items-center gap-2 mb-4 font-['Space_Grotesk']"><i className="fas fa-fire"></i> Hot Work Specifics</h3>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-300 block mb-2 tracking-widest">Name of Fire Watcher</label><input value={formData.fireWatcherName} onChange={e => updateField('fireWatcherName', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Designated Fire Watcher Name" className="border border-red-900/50 focus:border-red-500 shadow-inner" /></div>
                                    </div>
                                )}

                                {formData.typeId === 'CSE' && (
                                    <div className="bg-purple-900/20 p-8 rounded-3xl shadow-xl border border-purple-500/30 space-y-6 animate-fade-in">
                                        <h4 className="text-sm font-bold text-purple-400 uppercase tracking-widest border-b border-purple-500/30 pb-2 font-['Space_Grotesk']"><i className="fas fa-door-open mr-1"></i> CSE Personnel</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div><label className="text-[10px] uppercase font-bold text-slate-300 block mb-2 tracking-widest">Attendant Name (Standby)</label><input value={formData.attendantName} onChange={e => updateField('attendantName', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Person outside space..." className="border border-purple-900/50 focus:border-purple-500 shadow-inner" /></div>
                                            <div><label className="text-[10px] uppercase font-bold text-slate-300 block mb-2 tracking-widest">Entry Supervisor</label><input value={formData.entrySupervisorName} onChange={e => updateField('entrySupervisorName', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Supervisor authorizing..." className="border border-purple-900/50 focus:border-purple-500 shadow-inner" /></div>

                                            <h4 className="text-sm font-bold text-purple-400 uppercase tracking-widest border-b border-purple-500/30 pb-2 mt-4 font-['Space_Grotesk'] md:col-span-2"><i className="fas fa-wind mr-1"></i> Pre-Entry Gas Test Results</h4>
                                            <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 tracking-widest">Oxygen Level (&gt;19.5%)</label><input value={formData.oxygenLevel} onChange={e => updateField('oxygenLevel', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. 20.9%" className="font-mono border border-purple-900/50 shadow-inner" /></div>
                                            <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 tracking-widest">Flammability (LEL &lt; 10%)</label><input value={formData.flammability} onChange={e => updateField('flammability', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. 0%" className="font-mono border border-purple-900/50 shadow-inner" /></div>
                                            <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 tracking-widest">Toxic Gas Concentration</label><input value={formData.toxicGas} onChange={e => updateField('toxicGas', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. H2S 0ppm" className="font-mono border border-purple-900/50 shadow-inner" /></div>
                                        </div>
                                    </div>
                                )}

                                {formData.typeId === 'ELE' && (
                                    <div className="bg-amber-900/10 p-8 rounded-3xl border border-amber-500/30 shadow-xl animate-fade-in">
                                        <label className="text-xs uppercase font-bold text-amber-400 block mb-3 tracking-widest font-['Space_Grotesk']"><i className="fas fa-lock mr-2"></i> LOTO Linkage Required</label>
                                        <select value={formData.lotoRef} onChange={e => updateField('lotoRef', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="border border-amber-900/50 focus:border-amber-500 font-bold text-white shadow-inner p-4 text-base">
                                            <option value="">-- Select Active Approved LOTO Procedure --</option>
                                            {lotoProcedures.filter(p => p.status === 'Approved' && (p.facility === formData.siteId || !formData.siteId)).map(p => (
                                                <option key={p.id} value={p.id}>{p.id} - {p.description}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-slate-500 mt-3"><i className="fas fa-info-circle mr-1"></i> Electrical permits require a designated energy isolation protocol to be selected before authorization.</p>
                                    </div>
                                )}

                                {formData.typeId === 'WAH' && (
                                    <div className="bg-blue-900/10 p-8 rounded-3xl border border-blue-500/30 shadow-xl animate-fade-in">
                                        <label className="text-sm uppercase font-bold text-blue-400 block mb-5 tracking-widest font-['Space_Grotesk']"><i className="fas fa-arrow-up mr-2"></i> Height Access Equipment to be used</label>
                                        <div className="flex flex-wrap gap-3">
                                            {WAH_EQUIP_OPTIONS.map(eq => (
                                                <label key={eq} className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all ${(formData.wahEquipment || []).includes(eq) ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/50' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'}`}>
                                                    <input type="checkbox" checked={(formData.wahEquipment || []).includes(eq)} onChange={() => formData.status === 'Draft' && toggleWahEquip(eq)} disabled={formData.status !== 'Draft' || !canEditForm} className="hidden" />
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
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Valid From (Date)</label><input type="date" value={formData.validFromDate} onChange={e => updateField('validFromDate', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="font-mono border border-slate-800 shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Start Time</label><input type="time" value={formData.validFromTime} onChange={e => updateField('validFromTime', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="font-mono border border-slate-800 shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Valid To (Date)</label><input type="date" value={formData.validToDate} onChange={e => updateField('validToDate', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="font-mono border border-slate-800 shadow-inner" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">End Time</label><input type="time" value={formData.validToTime} onChange={e => updateField('validToTime', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="font-mono border border-slate-800 shadow-inner" /></div>
                                    </div>
                                </div>

                                {/* SECTION 3: WMS */}
                                <div className="bg-slate-800/80 p-8 rounded-3xl shadow-xl border border-slate-700">
                                    <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4 font-['Space_Grotesk']">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-tasks text-amber-500"></i> Section 3: Work Method Statement</h3>
                                        {formData.status === 'Draft' && canEditForm && <button type="button" onClick={addWmsRow} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 uppercase tracking-widest"><i className="fas fa-plus"></i> Add Step</button>}
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
                                                        <td className="p-3"><textarea rows="2" value={row?.step || ''} onChange={e => updateWmsRow(idx, 'step', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="bg-transparent border border-transparent hover:border-slate-800 focus:border-amber-500 text-sm py-2 px-3 resize-none h-full outline-none text-white transition-colors custom-scroll" placeholder="What are you doing?"></textarea></td>
                                                        <td className="p-3"><textarea rows="2" value={row?.hazard || ''} onChange={e => updateWmsRow(idx, 'hazard', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="bg-transparent border border-transparent hover:border-slate-800 focus:border-red-500 text-sm py-2 px-3 resize-none h-full text-red-200 outline-none transition-colors custom-scroll" placeholder="What could go wrong?"></textarea></td>
                                                        <td className="p-3"><textarea rows="2" value={row?.precaution || ''} onChange={e => updateWmsRow(idx, 'precaution', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="bg-transparent border border-transparent hover:border-slate-800 focus:border-emerald-500 text-sm py-2 px-3 resize-none h-full text-emerald-200 outline-none transition-colors custom-scroll" placeholder="How to prevent it?"></textarea></td>
                                                        <td className="p-3 text-center">
                                                            {formData.status === 'Draft' && canEditForm && (formData.wms || []).length > 1 && <button type="button" onClick={() => removeWmsRow(idx)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 px-3 py-2 rounded-lg transition-colors border border-red-500/30"><i className="fas fa-trash"></i></button>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* SECTION 4: PPE & CHECKLIST */}
                                <div className="bg-slate-800/80 p-8 rounded-3xl shadow-xl border border-slate-700">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-6 border-b border-slate-700 pb-4 font-['Space_Grotesk']"><i className="fas fa-clipboard-check text-amber-500"></i> Section 4: Standard Safety Checks</h3>

                                    <div className="mb-10">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-4 tracking-widest">Required General PPE</label>
                                        <div className="flex flex-wrap gap-4">
                                            {COMMON_PPE.map(ppe => (
                                                <label key={ppe} className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all ${(formData.ppe || []).includes(ppe) ? 'bg-amber-900/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-900/30' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-500'}`}>
                                                    <input type="checkbox" checked={(formData.ppe || []).includes(ppe)} onChange={() => formData.status === 'Draft' && togglePPE(ppe)} disabled={formData.status !== 'Draft' || !canEditForm} className="w-4 h-4 accent-amber-500" />
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
                                                    <input type="checkbox" checked={item?.checked || false} onChange={() => formData.status === 'Draft' && toggleChecklistItem(idx)} disabled={formData.status !== 'Draft' || !canEditForm} className="w-5 h-5 accent-emerald-500 mt-0.5" />
                                                    <span className={`text-base font-medium ${item?.checked ? 'text-emerald-400' : 'text-slate-300 group-hover:text-white'}`}>{item?.label || ''}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* AUDIT / NON-COMPLIANCE SECTION (Only visible after draft phase) */}
                                {formData.firebaseKey && formData.status !== 'Draft' && (
                                    <div className="bg-red-950/20 p-8 rounded-3xl shadow-xl border-t-4 border-red-500 border-x border-b border-red-500/30">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-6 border-b border-red-500/30 pb-4 font-['Space_Grotesk']"><i className="fas fa-exclamation-triangle text-red-500"></i> Permit Non-Compliances</h3>
                                        <p className="text-xs text-slate-300 mb-6">Log any safety violations observed during the execution of this permit. If this is a Contractor permit, these will be permanently recorded in the vendor's profile.</p>

                                        <div className="space-y-3 mb-6">
                                            {safeArr(formData.nonCompliances).map(nc => (
                                                <div key={nc.id} className="p-4 bg-red-950/40 border border-red-500/50 rounded-xl flex justify-between items-start group shadow-inner">
                                                    <div>
                                                        <div className="text-sm font-bold text-white mb-1">{nc.desc}</div>
                                                        <div className="text-[10px] font-mono text-red-400">{nc.date}</div>
                                                    </div>
                                                    {canEditForm && <button onClick={() => removeNonCompliance(nc.id)} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition bg-red-900/50 hover:bg-red-600 px-2 py-1 rounded"><i className="fas fa-trash-alt text-xs"></i></button>}
                                                </div>
                                            ))}
                                            {safeArr(formData.nonCompliances).length === 0 && <div className="text-center text-slate-500 italic text-sm p-4">No violations recorded.</div>}
                                        </div>

                                        {canEditForm && (
                                            <div className="flex gap-2">
                                                <input value={newNC} onChange={e => setNewNC(e.target.value)} placeholder="Describe violation (e.g. Worker not wearing safety harness)..." className="flex-1 bg-slate-950 border border-red-900/50 rounded-xl p-3 text-sm text-white outline-none focus:border-red-500 shadow-inner" />
                                                <button onClick={addNonCompliance} className="bg-red-600 hover:bg-red-500 text-white px-6 rounded-xl font-bold shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-widest"><i className="fas fa-plus mr-2"></i> Log NC</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SECTION 5: DUAL AUTHORIZATION */}
                                <div className="bg-slate-800/80 p-8 rounded-3xl shadow-xl border-t-4 border-emerald-500">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-6 border-b border-slate-700 pb-4 font-['Space_Grotesk']"><i className="fas fa-users-cog text-emerald-500"></i> Section 5: Dual Authorization Routing</h3>
                                    <p className="text-sm text-slate-400 mb-6 font-['Inter']">Select the required approvers to review and activate this permit. Both parties must approve before work can commence.</p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700">
                                            <label className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest block mb-2"><i className="fas fa-cogs mr-1"></i> Engineering Approver</label>
                                            <select value={formData.engApproverEmail} onChange={e => updateField('engApproverEmail', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="w-full font-bold text-white py-3 px-4 bg-slate-950 border border-slate-700 rounded-xl outline-none focus:border-emerald-500 shadow-inner">
                                                <option value="">-- Select Engineering Auth --</option>
                                                <option value={myEmail} className="bg-slate-800 text-emerald-400 font-bold">➡️ Assign to Me ({myName})</option>
                                                {siteUsers.map(u => (
                                                    <option key={`eng-${u.id}`} value={u.email || u.name}>{u.name} ({u.email || 'System Auth'})</option>
                                                ))}
                                            </select>
                                            {formData.status !== 'Draft' && <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-500">Status: <span className={formData.engStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{formData.engStatus}</span></p>}
                                        </div>

                                        <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700">
                                            <label className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest block mb-2"><i className="fas fa-industry mr-1"></i> Production Approver</label>
                                            <select value={formData.prodApproverEmail} onChange={e => updateField('prodApproverEmail', e.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="w-full font-bold text-white py-3 px-4 bg-slate-950 border border-slate-700 rounded-xl outline-none focus:border-emerald-500 shadow-inner">
                                                <option value="">-- Select Production Auth --</option>
                                                <option value={myEmail} className="bg-slate-800 text-emerald-400 font-bold">➡️ Assign to Me ({myName})</option>
                                                {siteUsers.map(u => (
                                                    <option key={`prod-${u.id}`} value={u.email || u.name}>{u.name} ({u.email || 'System Auth'})</option>
                                                ))}
                                            </select>
                                            {formData.status !== 'Draft' && <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-500">Status: <span className={formData.prodStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{formData.prodStatus}</span></p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
                                    {siteUsers.map(u => (
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

                </main>
            </div>

            {/* ======================================================== */}
            {/* PRINT VIEW LAYER (OUTSIDE OF H-SCREEN CONTAINER) */}
            {/* ======================================================== */}
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
                                        Supervised By: {printData.issuedToName} (Ph: {printData.issuedToPh}) <br />
                                        Workers: {(printData.entrantNames || []).join(', ') || 'None Assigned'}
                                    </td>
                                    <td className="w-[15%] py-1.5 font-bold border-none pl-4 align-top">Validity:</td>
                                    <td className="w-[35%] py-1.5 font-bold border-none font-mono align-top">{printData.validFromDate} to {printData.validToDate}<br />{printData.validFromTime} - {printData.validToTime}</td>
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
                        <h2 className="text-center font-bold text-sm uppercase bg-gray-200 border-b-2 border-black p-2">5. Dual Authorization Signatures</h2>
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
                    <div className="text-center text-[10px] mt-4 font-bold text-gray-500 uppercase tracking-widest">System Generated Document - Verify Live Status via QR Code</div>
                </div>
            )}
        </>
    );
}