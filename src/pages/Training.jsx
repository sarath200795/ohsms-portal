import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

// --- DATA SAFETY ENGINE ---
const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// --- GLOBALS & HELPERS ---
const ROLE_REQUIREMENTS = {
    "Office Staff": ["Fire Safety", "First Aid"],
    "Driver": ["Fire Safety", "First Aid", "Forklift Safety", "Chemical Handling"],
    "Manager": ["Fire Safety", "First Aid", "LOTO", "Work at Height", "Chemical Handling"]
};

const BASE_TOPICS = ["LOTO", "Fire Safety", "First Aid", "Work at Height", "Chemical Handling", "Forklift Safety"];

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toISOString().split('T')[0];
};

const addMonths = (dateStr, months) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
};

export default function Training() {
    const navigate = useNavigate();
    const location = useLocation();

    const [view, setView] = useState('dashboard');
    const [session, setSession] = useState(null);

    const [trainings, setTrainings] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [contractors, setContractors] = useState([]);
    const [trainingCapas, setTrainingCapas] = useState([]);

    const [printData, setPrintData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });
    const [filterSite, setFilterSite] = useState('All');

    // Matrix Filters
    const [matrixSiteFilter, setMatrixSiteFilter] = useState('All');
    const [matrixContractorFilter, setMatrixContractorFilter] = useState('All');

    const [calendarSiteFilter, setCalendarSiteFilter] = useState('All');

    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

    const [searchTerm, setSearchTerm] = useState('');
    const [hiddenTopics, setHiddenTopics] = useState([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef(null);

    const [data, setData] = useState({
        id: '', siteId: '', topic: '', content: '', date: new Date().toISOString().split('T')[0],
        expiryDate: addMonths(new Date().toISOString().split('T')[0], 6),
        trainer: '', type: 'Internal Formal', duration: '1 Hour',
        targetAudience: 'Internal', contractorId: '',
        attendees: [], linkedCapa: null
    });

    const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
    const [externalName, setExternalName] = useState('');

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || (sess.accessibleModules || []).includes('Training');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission to access the Training module.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(sess.role);
        const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(sess.role);

        setPermissions({
            viewOnly: !canEditCr,
            canDelete: canDel,
            canEditCreate: canEditCr
        });

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        if (!isGlobalAdmin && ctxSite === 'All') ctxSite = sess.assignedSite;

        setFilterSite(ctxSite);
        setMatrixSiteFilter(ctxSite);
        setCalendarSiteFilter(ctxSite);
        sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);

        const loadDatabase = async () => {
            try {
                const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                const snap = await get(dbRef);
                if (snap.exists()) {
                    const orgData = snap.val();

                    if (orgData.trainings) setTrainings(Object.entries(orgData.trainings).map(([k, v]) => ({ firebaseKey: k, ...v })));

                    if (orgData.contractors) {
                        setContractors(Object.entries(orgData.contractors).map(([k, v]) => ({ firebaseKey: k, ...v })));
                    }

                    if (orgData.sites) {
                        setSites(Object.keys(orgData.sites).map(key => ({
                            code: orgData.sites[key].code || key, name: orgData.sites[key].name || key
                        })));
                    }

                    if (orgData.users) {
                        setUsers(Object.entries(orgData.users)
                            .map(([k, v]) => ({ id: k, name: v.name || v.email || 'System Owner', ...v }))
                            .filter(u => u.status !== 'Inactive' && u.status !== 'Deleted'));
                    }

                    // CAPA Scanner
                    const parsedCapas = [];
                    const checkDesc = (desc) => /\b(train|training|retrain|retraining|awareness|educate|briefing|toolbox|tbt|teach|instruct|coach|guide|demonstrate|learn|explain|review|drill|session|course)\b/i.test(desc);

                    const parseStandardCapa = (collection, sourceName, dbNode) => {
                        if (!collection) return;
                        Object.entries(collection).forEach(([key, item]) => {
                            const capaList = item.capa || (item.investigation && item.investigation.capa);
                            if (capaList) {
                                Object.entries(capaList).forEach(([idx, act]) => {
                                    if (!act) return;
                                    const desc = act.act || act.action || act.desc || act.item || '';
                                    if (checkDesc(desc)) {
                                        parsedCapas.push({
                                            uid: `${sourceName}-${key}-${idx}`, source: sourceName, sourceId: item.id || item.docId || key,
                                            desc, owner: act.own || act.owner || act.responsible || 'Unassigned',
                                            due: act.due || act.deadline || act.target || 'N/A', status: act.status || 'Open',
                                            siteId: item.siteId || 'Global',
                                            contextDesc: item.description || item.details || item.observation || '',
                                            dbPath: item.capa ? `organizations/${sess.orgId}/${dbNode}/${key}/capa/${idx}` : `organizations/${sess.orgId}/${dbNode}/${key}/investigation/capa/${idx}`
                                        });
                                    }
                                });
                            }
                        });
                    };

                    parseStandardCapa(orgData.incidents, 'Incident', 'incidents');
                    parseStandardCapa(orgData.mockDrills, 'Emergency Drill', 'mockDrills');

                    if (orgData.inspectionRecords) {
                        Object.entries(orgData.inspectionRecords).forEach(([key, record]) => {
                            if (record.capa && Array.isArray(record.capa)) {
                                record.capa.forEach((act, idx) => {
                                    if (!act) return;
                                    const desc = act.desc || act.act || act.action || '';
                                    if (checkDesc(desc)) {
                                        parsedCapas.push({
                                            uid: `INSP-${key}-${idx}`, source: 'Inspection', sourceId: record.templateTitle || 'Inspection',
                                            desc, owner: act.owner || act.own || 'Unassigned', due: act.dueDate || act.due || 'N/A', status: act.status || 'Open',
                                            siteId: act.siteId || record.siteId || 'Global', contextDesc: `Inspection finding from: ${record.templateTitle}`,
                                            dbPath: `organizations/${sess.orgId}/inspectionRecords/${key}/capa/${idx}`
                                        });
                                    }
                                });
                            }
                        });
                    }

                    if (orgData.contractors) {
                        Object.entries(orgData.contractors).forEach(([key, contractor]) => {
                            const workers = safeArr(contractor.workers);
                            const pendingWorkers = workers.filter(w => !w.inductionDate || w.inductionDate === 'Pending' || w.inductionDate === '');
                            if (pendingWorkers.length > 0) {
                                parsedCapas.push({
                                    uid: `CONT-IND-${key}`, source: 'Contractor Induction', sourceId: contractor.companyName,
                                    desc: `Mandatory Site Induction for ${pendingWorkers.length} worker(s): ${pendingWorkers.map(w => w.name).join(', ')}`,
                                    owner: contractor.contactPerson || 'Vendor', due: new Date().toISOString().split('T')[0], status: 'Open',
                                    siteId: contractor.siteId || 'Global', contractorKey: key,
                                    pendingWorkersInfo: pendingWorkers.map(w => ({ id: w.id, name: w.name, role: w.role }))
                                });
                            }
                        });
                    }

                    setTrainingCapas(parsedCapas);
                }
            } catch (error) { console.error("Error loading data:", error); } finally { setLoading(false); }
        };

        loadDatabase();
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [navigate, location]);

    const handleClickOutside = (event) => { if (filterRef.current && !filterRef.current.contains(event.target)) setIsFilterOpen(false); };

    const role = session?.role || 'User';
    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(role);

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

    const getSmartSiteDefault = (preferredSite = null) => {
        if (preferredSite && preferredSite !== 'Global' && preferredSite !== 'GLOBAL' && preferredSite !== 'All') return preferredSite;
        if (filterSite !== 'All') return filterSite;
        if (session?.assignedSite && session.assignedSite !== 'GLOBAL') return session.assignedSite;
        if (!isGlobalUser && visibleSites.length > 0) return visibleSites[0].code;
        return '';
    };

    const handleDashboardSiteChange = (e) => { setFilterSite(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value === 'All' ? 'GLOBAL' : e.target.value); };
    const handleMatrixSiteChange = (e) => { setMatrixSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value === 'All' ? 'GLOBAL' : e.target.value); };
    const handleCalendarSiteChange = (e) => { setCalendarSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value === 'All' ? 'GLOBAL' : e.target.value); };

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!data.siteId) return true;
        return allowedSiteCodes.has(data.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, data.siteId]);

    // DYNAMIC WORKER SELECTOR FOR FORM
    const availableWorkersForForm = useMemo(() => {
        if (data.targetAudience === 'Internal') {
            return users.filter(u => {
                const isGlobalUsr = u.role === 'Owner' || u.role === 'Lead Auditor' || u.assignedSite === 'GLOBAL' || (u.accessibleSites && u.accessibleSites.includes('GLOBAL'));
                return isGlobalUsr || !data.siteId || u.assignedSite === data.siteId || (u.accessibleSites && u.accessibleSites.includes(data.siteId));
            });
        } else {
            if (!data.contractorId) return [];
            const vendor = contractors.find(c => c.firebaseKey === data.contractorId);
            return safeArr(vendor?.workers);
        }
    }, [users, contractors, data.targetAudience, data.siteId, data.contractorId]);


    // --- EXPIRY & MATRIX LOGIC ---
    const uniqueTopics = useMemo(() => [...new Set([...BASE_TOPICS, ...trainings.map(t => t.topic)])], [trainings]);
    const displayedTopics = useMemo(() => uniqueTopics.filter(t => !hiddenTopics.includes(t)), [uniqueTopics, hiddenTopics]);

    const certifications = useMemo(() => {
        const certs = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sortedTrainings = [...trainings].sort((a, b) => new Date(a.date) - new Date(b.date));

        sortedTrainings.forEach(t => {
            if (!isGlobalUser && !allowedSiteCodes.has(t.siteId)) return;

            if (t.attendees) {
                t.attendees.forEach(att => {
                    if (att.status === 'Attended') {
                        const key = `${att.name}_${t.topic}`;
                        const expDate = t.expiryDate || addMonths(t.date, 6);
                        certs[key] = { userName: att.name, userId: att.userId, topic: t.topic, date: t.date, expiryDate: expDate, trainingId: t.id };
                    }
                });
            }
        });

        Object.values(certs).forEach(cert => {
            if (!cert.expiryDate) { cert.status = 'Valid'; cert.statusClass = 'bg-emerald-500/20 text-emerald-400'; return; }
            const exp = new Date(cert.expiryDate);
            exp.setHours(23, 59, 59, 999);
            const diffTime = exp - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) { cert.status = 'Expired'; cert.statusClass = 'bg-red-500/20 text-red-400'; }
            else if (diffDays <= 30) { cert.status = '< 30 Days'; cert.statusClass = 'bg-orange-500/20 text-orange-400'; }
            else if (diffDays <= 180) { cert.status = '< 6 Months'; cert.statusClass = 'bg-yellow-500/20 text-yellow-400'; }
            else { cert.status = 'Valid'; cert.statusClass = 'bg-emerald-500/20 text-emerald-400'; }
        });

        return certs;
    }, [trainings, isGlobalUser, allowedSiteCodes]);

    const getMatrixCell = (userName, userRole, topic) => {
        const standardRole = userRole || 'Employee';

        if (ROLE_REQUIREMENTS[standardRole] && !ROLE_REQUIREMENTS[standardRole].includes(topic)) {
            return { status: 'N/A', color: 'bg-slate-800 text-slate-600 border-slate-700 italic', dateGiven: '-', dateExpires: '-' };
        }

        const cert = certifications[`${userName}_${topic}`];
        if (!cert) return { status: 'Not Trained', color: 'text-slate-500 bg-slate-900 border-slate-800', dateGiven: '-', dateExpires: '-' };

        let color = 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30';
        let displayStatus = 'Valid';

        if (cert.status === 'Expired') {
            color = 'text-red-400 bg-red-900/20 border-red-500/30';
            displayStatus = 'Expired';
        } else if (cert.status === '< 30 Days' || cert.status === '< 6 Months') {
            color = 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
            displayStatus = 'Expiring Soon';
        }

        return { status: displayStatus, color: color, dateGiven: formatDate(cert.date), dateExpires: formatDate(cert.expiryDate), certObj: cert };
    };

    const allMatrixRows = useMemo(() => {
        let merged = [];

        // 1. Add Internal Users
        users.forEach(u => merged.push({
            id: u.id, name: u.name, role: u.role, assignedSite: u.assignedSite, accessibleSites: u.accessibleSites, type: 'Internal'
        }));

        // 2. Add Contractor Workers (Injecting them into the Matrix)
        contractors.forEach(c => {
            safeArr(c.workers).forEach(w => {
                merged.push({
                    id: w.id, name: w.name, role: `${w.role} (Contractor)`, assignedSite: c.siteId, type: 'Contractor', contractorId: c.firebaseKey, companyName: c.companyName
                });
            });
        });

        // Matrix Site Filter
        if (matrixSiteFilter !== 'All') {
            merged = merged.filter(u => u.assignedSite === matrixSiteFilter || (u.accessibleSites && u.accessibleSites.includes(matrixSiteFilter)));
        } else if (!isGlobalUser) {
            merged = merged.filter(u => allowedSiteCodes.has(u.assignedSite) || (u.accessibleSites && u.accessibleSites.some(s => allowedSiteCodes.has(s))));
        }

        // Matrix Contractor/Internal Filter
        if (matrixContractorFilter === 'Internal') {
            merged = merged.filter(u => u.type === 'Internal');
        } else if (matrixContractorFilter !== 'All') {
            merged = merged.filter(u => u.contractorId === matrixContractorFilter);
        }

        // Search Filter
        if (searchTerm) {
            merged = merged.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        return merged.sort((a, b) => a.name.localeCompare(b.name));
    }, [users, contractors, matrixSiteFilter, matrixContractorFilter, searchTerm, isGlobalUser, allowedSiteCodes]);


    const filteredAlerts = useMemo(() => {
        const alerts = Object.values(certifications).filter(c => c.status !== 'Valid').sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        if (filterSite === 'All') return alerts;
        return alerts.filter(a => {
            const u = users.find(x => x.name === a.userName) || contractors.flatMap(c => safeArr(c.workers)).find(w => w.name === a.userName);
            return u && (u.assignedSite === filterSite || (u.accessibleSites && u.accessibleSites.includes(filterSite)));
        });
    }, [certifications, filterSite, users, contractors]);

    const pendingTrainingCapas = useMemo(() => {
        return trainingCapas.filter(c => {
            if (c.status === 'Closed') return false;
            if (!isGlobalUser && !allowedSiteCodes.has(c.siteId) && c.siteId !== 'Global') return false;
            if (filterSite !== 'All' && c.siteId !== filterSite && c.source !== 'Incident') return false;
            return true;
        });
    }, [trainingCapas, filterSite, isGlobalUser, allowedSiteCodes]);


    // --- ACTIONS ---
    const toggleTopicFilter = (t) => setHiddenTopics(prev => prev.includes(t) ? prev.filter(item => item !== t) : [...prev, t]);
    const selectAllTopics = () => setHiddenTopics([]);
    const clearAllTopics = () => setHiddenTopics(uniqueTopics);

    const downloadMatrix = () => {
        const dataToExport = allMatrixRows.map(u => {
            const row = { Name: u.name, Role: u.role, Company: u.companyName || 'Internal' };
            displayedTopics.forEach(t => {
                const cell = getMatrixCell(u.name, u.role, t);
                row[t] = cell.status === 'Not Trained' ? 'Not Trained' : cell.status === 'N/A' ? 'N/A' : `${cell.status} (Exp: ${cell.dateExpires})`;
            });
            return row;
        });
        XLSX.writeFile(XLSX.utils.json_to_sheet(dataToExport), "Training_Matrix.xlsx");
    };

    const initiateRetraining = (topic, usersToRetrain) => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to initiate training.");

        const defaultAttendees = usersToRetrain.map(u => ({
            userId: u.userId || u.id || 'Internal',
            name: u.userName || u.name,
            role: u.role || 'Employee',
            status: 'Attended'
        }));

        let derivedSite = getSmartSiteDefault();
        const today = new Date().toISOString().split('T')[0];

        setData({
            id: '', siteId: derivedSite, topic: topic, content: '', date: today, expiryDate: addMonths(today, 6),
            trainer: '', type: 'Internal Formal', duration: '1 Hour',
            targetAudience: 'Internal', contractorId: '',
            attendees: defaultAttendees, linkedCapa: null
        });
        setView('form');
    };

    const initiateCapaTraining = (capaItem) => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to initiate training.");

        const today = new Date().toISOString().split('T')[0];
        let initialContent = '';
        let prefilledAttendees = [];
        let targetAudience = 'Internal';
        let contractorId = '';

        if (capaItem.source === 'Incident') {
            initialContent = `=== INCIDENT ID: ${capaItem.sourceId} ===\n\nDETAILS:\n${capaItem.contextDesc}\n\nTRAINING AGENDA:\n...`;
        } else if (capaItem.source === 'Inspection') {
            initialContent = `=== INSPECTION: ${capaItem.sourceId} ===\n\nDETAILS:\n${capaItem.contextDesc}\n\nTRAINING AGENDA:\n...`;
        } else if (capaItem.source === 'Contractor Induction') {
            targetAudience = 'Contractor';
            contractorId = capaItem.contractorKey;
            initialContent = `=== CONTRACTOR SITE INDUCTION ===\n\nCompany: ${capaItem.sourceId}\nConducting mandatory site safety induction for pending contractor personnel.`;
            prefilledAttendees = (capaItem.pendingWorkersInfo || []).map(w => ({
                userId: 'External', name: w.name, role: `${w.role} (Contractor)`, status: 'Attended'
            }));
        } else {
            initialContent = `Fulfilling CAPA for ${capaItem.source} (Ref: ${capaItem.sourceId})`;
        }

        setData({
            id: '', siteId: getSmartSiteDefault(capaItem.siteId), topic: capaItem.source === 'Contractor Induction' ? 'Site Safety Induction' : capaItem.desc,
            content: initialContent, date: today, expiryDate: addMonths(today, 6), trainer: '', type: 'Internal Formal', duration: '1 Hour',
            targetAudience, contractorId, attendees: prefilledAttendees, linkedCapa: capaItem
        });
        setView('form');
    };

    const addAttendee = (type) => {
        if (type === 'external_manual') {
            if (!externalName.trim()) return alert("Enter external trainee name.");
            if (data.attendees.some(a => a.name.toLowerCase() === externalName.trim().toLowerCase())) return alert("Already added.");
            const newAttendee = { userId: 'External', name: externalName.trim(), role: 'External / Contractor', status: 'Attended' };
            setData(prev => ({ ...prev, attendees: [...prev.attendees, newAttendee] }));
            setExternalName('');
        } else {
            if (!selectedUserToAdd) return;
            const workerObj = availableWorkersForForm.find(w => w.id === selectedUserToAdd || w.name === selectedUserToAdd);
            if (!workerObj) return;

            if (data.attendees.some(a => a.name === workerObj.name)) return alert("Already added to the list.");

            const newAttendee = {
                userId: data.targetAudience === 'Internal' ? workerObj.id : 'External',
                name: workerObj.name,
                role: data.targetAudience === 'Internal' ? (workerObj.role || 'Employee') : `${workerObj.role} (Contractor)`,
                status: 'Attended'
            };
            setData(prev => ({ ...prev, attendees: [...prev.attendees, newAttendee] }));
            setSelectedUserToAdd('');
        }
    };

    const removeAttendee = (index) => { setData(prev => ({ ...prev, attendees: data.attendees.filter((_, i) => i !== index) })); };

    const saveData = async () => {
        if (!canEditForm) return alert("Security Error: You do not have permission to create or edit records for this site.");
        if (!data.siteId || !data.topic) return alert("Site and Topic are required.");
        if (data.targetAudience === 'Contractor' && !data.contractorId) return alert("Please select a Contractor Company.");

        setSaving(true);
        const newId = data.id || `TRN-${Date.now().toString().slice(-6)}`;

        const linkedCapaPath = data.linkedCapa ? data.linkedCapa.dbPath : null;
        const isContractorInduction = data.linkedCapa && data.linkedCapa.source === 'Contractor Induction';

        const payload = { ...data, id: newId };
        delete payload.linkedCapa;
        if (data.linkedCapa) payload.sourceCapaRef = data.linkedCapa.uid;

        try {
            // Save to Master Trainings Node
            if (data.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/trainings/${data.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/trainings`), payload);
            }

            // Sync Induction Dates back to Contractor Module if applicable
            if (data.targetAudience === 'Contractor' && data.contractorId) {
                const cRef = ref(rtdb, `organizations/${session.orgId}/contractors/${data.contractorId}`);
                const cSnap = await get(cRef);
                if (cSnap.exists()) {
                    const cData = cSnap.val();
                    let workers = safeArr(cData.workers);
                    const attendedNames = data.attendees.filter(a => a.status === 'Attended').map(a => a.name);

                    // If it is an Induction, update the induction dates for those workers
                    if (data.topic.toLowerCase().includes('induction')) {
                        workers = workers.map(w => {
                            if (attendedNames.includes(w.name) && (!w.inductionDate || w.inductionDate === 'Pending' || w.inductionDate === '')) {
                                return { ...w, inductionDate: data.date };
                            }
                            return w;
                        });
                        await update(cRef, { workers });
                    }

                    // Add quick reference log to Contractor profile
                    const localTrn = { id: newId, topic: data.topic, date: data.date, attendees: attendedNames.join(', ') };
                    await update(cRef, { trainings: [...safeArr(cData.trainings), localTrn] });
                }
            }

            // Close Linked CAPA
            if (isContractorInduction) {
                // The induction logic above handles the closure implicitly because the scanner will no longer find 'Pending' workers
                alert("Contractor Training Logged! Any pending worker inductions have been updated.");
            } else if (linkedCapaPath) {
                await update(ref(rtdb, linkedCapaPath), { status: 'Closed' });
                alert("Training Saved! The linked CAPA action has been marked as 'Closed'.");
            } else {
                alert("Saved Successfully!");
            }

            const dbRef = ref(rtdb, `organizations/${session.orgId}/trainings`);
            const snap = await get(dbRef);
            if (snap.exists()) setTrainings(Object.entries(snap.val()).map(([k, v]) => ({ firebaseKey: k, ...v })));

            setView('repo');
        } catch (e) {
            alert("Failed to save: " + e.message);
        }
        setSaving(false);
    };

    const triggerPrint = (record) => { setPrintData(record); setTimeout(() => window.print(), 800); };


    if (loading) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col gap-4 font-['Space_Grotesk']">
            <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500"></i>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Loading Registry & Cross-Module Dependencies...</p>
        </div>
    );

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

            <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden print:h-auto print:overflow-visible print:bg-white print:text-black">
                <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/80 backdrop-blur-md print:hidden z-20 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                        <div className="h-6 w-px bg-slate-800 mx-2"></div>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-graduation-cap"></i></div>
                        <h1 className="font-bold text-lg tracking-wide hidden md:block">Training & Competence</h1>
                    </div>
                    <div className="flex gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 shadow-inner overflow-x-auto custom-scroll">
                        <button type="button" onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-chart-line mr-1"></i> Dashboard</button>
                        <button type="button" onClick={() => setView('matrix')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'matrix' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-table mr-1"></i> Matrix</button>
                        <button type="button" onClick={() => setView('repo')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'repo' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-database mr-1"></i> Logs</button>
                        {permissions.canEditCreate && (
                            <button type="button" onClick={() => {
                                const today = new Date().toISOString().split('T')[0];
                                setView('form');
                                setData({ id: '', siteId: getSmartSiteDefault(), topic: '', content: '', date: today, expiryDate: addMonths(today, 6), trainer: '', type: 'Internal Formal', duration: '1 Hour', targetAudience: 'Internal', contractorId: '', attendees: [], linkedCapa: null });
                            }} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'form' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-plus mr-1"></i> New</button>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 print:hidden custom-scroll relative z-10">

                    {/* --- DASHBOARD VIEW --- */}
                    {view === 'dashboard' && (
                        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
                            <div className="flex justify-end mb-4">
                                <select value={filterSite} onChange={handleDashboardSiteChange} className="w-48 text-xs bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 rounded-xl p-3 shadow-inner">
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-emerald-500 shadow-xl">
                                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Valid Certifications</div>
                                    <div className="text-4xl font-bold text-emerald-400">{Object.values(certifications).filter(c => c.status === 'Valid').length}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl">
                                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Expiring &lt; 6 Months</div>
                                    <div className="text-4xl font-bold text-yellow-400">{Object.values(certifications).filter(c => c.status === '< 6 Months' || c.status === '< 30 Days').length}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-orange-500 shadow-xl">
                                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">CAPA Training Due</div>
                                    <div className="text-4xl font-bold text-orange-400">{pendingTrainingCapas.length}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-500 shadow-xl">
                                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Expired Certifications</div>
                                    <div className="text-4xl font-bold text-red-500">{Object.values(certifications).filter(c => c.status === 'Expired').length}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
                                <div className="glass-panel rounded-3xl overflow-hidden shadow-xl border border-slate-700 flex flex-col max-h-[500px]">
                                    <div className="p-6 border-b border-slate-700 bg-slate-900/50">
                                        <h3 className="font-bold text-lg text-white flex items-center gap-2"><i className="fas fa-bell text-red-500"></i> Expiry Alerts</h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scroll">
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="bg-slate-950/80 backdrop-blur-md sticky top-0 text-[10px] uppercase font-bold text-slate-500 z-10 border-b border-slate-800">
                                                <tr><th className="p-4">Employee</th><th className="p-4">Topic</th><th className="p-4">Expiry</th><th className="p-4 text-right">Status</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/50 bg-slate-950/40">
                                                {filteredAlerts.map((alt, i) => (
                                                    <tr key={i} className="hover:bg-slate-800/60 transition-colors">
                                                        <td className="p-4 font-bold text-white">{alt.userName}</td>
                                                        <td className="p-4 text-blue-300 font-medium">{alt.topic}</td>
                                                        <td className="p-4 font-mono text-xs">{alt.expiryDate}</td>
                                                        <td className="p-4 text-right"><span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border border-current shadow-sm ${alt.statusClass}`}>{alt.status}</span></td>
                                                    </tr>
                                                ))}
                                                {filteredAlerts.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-emerald-400 italic font-bold">Excellent! No upcoming expirations.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="glass-panel rounded-3xl overflow-hidden shadow-xl border border-slate-700 flex flex-col max-h-[500px]">
                                    <div className="p-6 border-b border-slate-700 bg-slate-900/50">
                                        <h3 className="font-bold text-lg text-white flex items-center gap-2"><i className="fas fa-tasks text-orange-500"></i> Pending CAPA Trainings</h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scroll">
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="bg-slate-950/80 backdrop-blur-md sticky top-0 text-[10px] uppercase font-bold text-slate-500 z-10 border-b border-slate-800">
                                                <tr><th className="p-4">Source</th><th className="p-4">Requirement / Topic</th><th className="p-4 text-right">Actions</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/50 bg-slate-950/40">
                                                {pendingTrainingCapas.map((capa, i) => (
                                                    <tr key={i} className="hover:bg-slate-800/60 transition-colors">
                                                        <td className="p-4">
                                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border shadow-sm ${capa.source.includes('Contractor') ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : capa.source === 'Incident' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
                                                                {capa.source}
                                                            </span>
                                                            <div className="text-[9px] text-slate-500 mt-2 font-mono">{capa.sourceId}</div>
                                                        </td>
                                                        <td className="p-4 font-medium text-white leading-relaxed">{capa.desc}</td>
                                                        <td className="p-4 text-right">
                                                            {permissions.canEditCreate && <button type="button" onClick={() => initiateCapaTraining(capa)} className="text-orange-400 hover:text-white bg-orange-900/20 hover:bg-orange-600 px-3 py-1.5 rounded-lg transition border border-orange-500/30 text-[10px] uppercase font-bold whitespace-nowrap tracking-widest shadow-sm">Log Session</button>}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {pendingTrainingCapas.length === 0 && <tr><td colSpan="3" className="p-12 text-center text-slate-500 italic">No pending training CAPAs from other modules.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- MATRIX VIEW --- */}
                    {view === 'matrix' && (
                        <div className="glass-panel rounded-3xl animate-in fade-in duration-500 border border-slate-700 shadow-2xl flex flex-col h-full overflow-hidden">
                            <div className="p-6 border-b border-slate-700 flex flex-wrap justify-between items-center gap-4 bg-slate-900/50 flex-shrink-0">
                                <h3 className="text-2xl font-bold text-white flex items-center"><i className="fas fa-th mr-3 text-blue-400"></i> Competency Matrix</h3>
                                <div className="flex gap-3 items-center flex-wrap">

                                    <div className="relative">
                                        <i className="fas fa-map-marker-alt absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500"></i>
                                        <select value={matrixSiteFilter} onChange={handleMatrixSiteChange} className="bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-white outline-none focus:border-blue-500 appearance-none shadow-inner w-40">
                                            {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Sites</option>}
                                            {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                    </div>

                                    {/* CONTRACTOR FILTER */}
                                    <div className="relative">
                                        <i className="fas fa-hard-hat absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500"></i>
                                        <select value={matrixContractorFilter} onChange={e => setMatrixContractorFilter(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-purple-300 outline-none focus:border-purple-500 appearance-none shadow-inner w-52 truncate">
                                            <option value="All">All Personnel (Int & Ext)</option>
                                            <option value="Internal">Internal Employees Only</option>
                                            {contractors.filter(c => matrixSiteFilter === 'All' || c.siteId === matrixSiteFilter || c.siteId === 'GLOBAL').map(c => (
                                                <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="relative group">
                                        <i className="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors"></i>
                                        <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white outline-none focus:border-blue-500 shadow-inner w-40 transition-colors" />
                                    </div>

                                    <div ref={filterRef} className="relative">
                                        <button type="button" onClick={() => setIsFilterOpen(!isFilterOpen)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-600 shadow-lg transition-colors">
                                            <i className="fas fa-filter text-blue-400"></i> Columns
                                        </button>
                                        {isFilterOpen && (
                                            <div className="absolute right-0 top-12 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 z-50">
                                                <div className="flex justify-between mb-4 border-b border-slate-800 pb-3">
                                                    <button type="button" onClick={selectAllTopics} className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors">Select All</button>
                                                    <button type="button" onClick={clearAllTopics} className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest transition-colors">Clear All</button>
                                                </div>
                                                <div className="space-y-3 max-h-60 overflow-y-auto custom-scroll pr-2">
                                                    {uniqueTopics.map(t => (
                                                        <label key={t} className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-2 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                                                            <input type="checkbox" className="w-4 h-4 accent-blue-500 cursor-pointer" checked={!hiddenTopics.includes(t)} onChange={() => toggleTopicFilter(t)} />
                                                            <span className="text-xs font-medium text-white">{t}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" onClick={downloadMatrix} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"><i className="fas fa-file-excel"></i> Export</button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto custom-scroll bg-slate-950/50">
                                <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap min-w-max">
                                    <thead className="bg-slate-950/90 backdrop-blur-md text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-20 shadow-md">
                                        <tr>
                                            <th className="p-5 sticky left-0 bg-slate-950 border-r border-b border-slate-800 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.5)] min-w-[200px]">Name / Role</th>
                                            {displayedTopics.map(t => <th key={t} className="p-5 text-center border-r border-b border-slate-800 min-w-[150px] text-blue-300">{t}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80">
                                        {allMatrixRows.map(u => (
                                            <tr key={u.id || u.name} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-4 bg-slate-900/90 shadow-[2px_0_5px_rgba(0,0,0,0.5)] z-10 border-r border-slate-800 sticky left-0 group-hover:bg-slate-800/90 transition-colors">
                                                    <div className="font-bold text-white text-sm">
                                                        {u.name}
                                                        {u.type === 'Contractor' && <span className="text-[8px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded ml-2 font-bold border border-purple-500/50 uppercase tracking-widest" title={u.companyName}>EXT</span>}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider truncate max-w-[200px]">{u.role}</div>
                                                </td>
                                                {displayedTopics.map(t => {
                                                    const cell = getMatrixCell(u.name, u.role, t);
                                                    return (
                                                        <td key={t} className="p-3 text-center border-r border-slate-800/50 relative group hover:bg-slate-800/80 transition-colors">
                                                            <div className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border ${cell.color} w-full text-center shadow-sm tracking-wider uppercase`}>{cell.status}</div>
                                                            {cell.status !== 'Not Trained' && cell.status !== 'N/A' && (
                                                                <div className="text-[9px] text-slate-400 mt-2 flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity font-mono">
                                                                    <span>Done: {cell.dateGiven}</span>
                                                                    <span className={`font-bold ${cell.status === 'Expired' ? 'text-red-400' : cell.status === 'Expiring Soon' ? 'text-yellow-400' : 'text-emerald-400'}`}>Exp: {cell.dateExpires}</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                        {allMatrixRows.length === 0 && <tr><td colSpan={displayedTopics.length + 1} className="p-10 text-center italic text-slate-500 text-base">No personnel found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- REPOSITORY VIEW --- */}
                    {view === 'repo' && (
                        <div className="max-w-7xl mx-auto glass-panel p-8 rounded-3xl animate-in fade-in duration-500 shadow-2xl border border-slate-700">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2"><i className="fas fa-database text-blue-400 mr-3"></i> Training Master Log</h2>
                                    <p className="text-sm text-slate-400">Historical repository of all completed training sessions.</p>
                                </div>
                                <select value={filterSite} onChange={handleDashboardSiteChange} className="w-48 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl p-3 outline-none focus:border-blue-500 shadow-inner">
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 shadow-inner custom-scroll">
                                <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap">
                                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                                        <tr><th className="p-5 pl-6">Record ID</th><th className="p-5">Course / Topic</th><th className="p-5">Date Conducted</th><th className="p-5">Site</th><th className="p-5">Trainees</th><th className="p-5 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/30">
                                        {trainings.filter(t => filterSite === 'All' ? (isGlobalUser || allowedSiteCodes.has(t.siteId)) : t.siteId === filterSite).sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => (
                                            <tr key={t.firebaseKey} className="hover:bg-slate-800/60 transition-colors">
                                                <td className="p-5 pl-6 font-mono text-xs text-slate-400">{t.id}</td>
                                                <td className="p-5 font-bold text-white text-base">
                                                    {t.topic}
                                                    {t.contractorId && <span className="ml-2 text-[8px] bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded uppercase font-bold border border-purple-500/30" title={t.contractorName}>EXT</span>}
                                                </td>
                                                <td className="p-5 text-xs font-mono">{t.date}</td>
                                                <td className="p-5 text-xs font-medium">{t.siteId}</td>
                                                <td className="p-5 font-bold text-emerald-400"><span className="bg-emerald-900/20 border border-emerald-500/30 px-2 py-1 rounded-lg">{t.attendees ? t.attendees.filter(a => a.status === 'Attended').length : 0} passed</span></td>
                                                <td className="p-5 pr-6 text-right flex justify-end gap-3">
                                                    <button type="button" onClick={() => triggerPrint(t)} className="text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/30" title="Print Register"><i className="fas fa-print"></i></button>
                                                    {permissions.canDelete && <button type="button" onClick={() => handleDelete(t)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors" title="Delete"><i className="fas fa-trash-alt"></i></button>}
                                                </td>
                                            </tr>
                                        ))}
                                        {trainings.filter(t => filterSite === 'All' ? (isGlobalUser || allowedSiteCodes.has(t.siteId)) : t.siteId === filterSite).length === 0 && <tr><td colSpan="6" className="text-center p-12 text-slate-500 italic">No records found for this location.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- FORM VIEW --- */}
                    {view === 'form' && (
                        <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-500">
                            <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-2xl">
                                <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
                                    <h2 className="text-3xl font-bold text-emerald-400 flex items-center gap-3"><i className="fas fa-chalkboard-teacher"></i> {data.firebaseKey ? 'Edit Training Session' : 'Log Training Session'}</h2>
                                    <button type="button" onClick={() => setView('dashboard')} className="text-slate-400 hover:text-white font-bold text-sm transition-colors flex items-center gap-2"><i className="fas fa-times"></i> Cancel</button>
                                </div>

                                {/* TARGET AUDIENCE TOGGLE */}
                                <div className="flex gap-4 mb-8 bg-slate-900/50 p-2 rounded-2xl border border-slate-800 w-fit shadow-inner">
                                    <button onClick={() => setData({ ...data, targetAudience: 'Internal', contractorId: '', attendees: [] })} className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${data.targetAudience === 'Internal' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-user-tie mr-2"></i> Internal Staff</button>
                                    <button onClick={() => setData({ ...data, targetAudience: 'Contractor', attendees: [] })} className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${data.targetAudience === 'Contractor' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-hard-hat mr-2"></i> Contractors</button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                    {/* Details Section */}
                                    <div className="space-y-6 bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-inner">
                                        <h3 className="font-bold text-white mb-2 border-b border-slate-700 pb-3 uppercase tracking-widest text-xs flex items-center gap-2"><i className="fas fa-info-circle text-blue-400"></i> Session Details</h3>

                                        {data.linkedCapa && (
                                            <div className="bg-orange-900/10 border border-orange-500/30 p-4 rounded-xl flex justify-between items-center shadow-inner">
                                                <div>
                                                    <span className="text-orange-400 font-bold text-[10px] uppercase tracking-widest"><i className="fas fa-link mr-2"></i> Fulfilling Requirement</span>
                                                    <div className="text-sm font-medium text-white mt-1 leading-relaxed">{data.linkedCapa.desc}</div>
                                                </div>
                                                {canEditForm && <button type="button" onClick={() => setData({ ...data, linkedCapa: null })} className="text-red-400 hover:text-white text-xs bg-red-900/20 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors font-bold uppercase tracking-widest ml-4 shadow-sm border border-red-500/20"><i className="fas fa-unlink mr-1"></i> Unlink</button>}
                                            </div>
                                        )}

                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Topic / Course Name</label>
                                            <input value={data.topic} onChange={e => setData({ ...data, topic: e.target.value })} disabled={!canEditForm} className="w-full text-base font-bold text-white bg-slate-950 border border-slate-700 p-3.5 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" placeholder="e.g. LOTO Refresher" />
                                        </div>

                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Training Content / Agenda</label>
                                            <textarea rows="4" value={data.content || ''} onChange={e => setData({ ...data, content: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-medium text-slate-300 bg-slate-950 border border-slate-700 p-3.5 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors custom-scroll resize-none" placeholder="Briefly describe the training material covered..."></textarea>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Location / Site</label>
                                                <select value={data.siteId} onChange={e => setData({ ...data, siteId: e.target.value, contractorId: '', attendees: [] })} disabled={data.firebaseKey || !canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors">
                                                    {(isGlobalUser || visibleSites.length > 1) && <option value="">Select Site...</option>}
                                                    {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Training Method</label>
                                                <select value={data.type} onChange={e => setData({ ...data, type: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-bold text-blue-300 bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors">
                                                    <option>Internal Tool Box Talk</option>
                                                    <option>Internal Formal</option>
                                                    <option>External Certified</option>
                                                </select>
                                            </div>
                                        </div>

                                        {data.targetAudience === 'Contractor' && (
                                            <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-xl">
                                                <label className="text-[10px] uppercase font-bold text-purple-400 block mb-2 tracking-widest ml-1"><i className="fas fa-building mr-1"></i> Contractor Company</label>
                                                <select value={data.contractorId} onChange={e => setData({ ...data, contractorId: e.target.value, attendees: [] })} disabled={data.firebaseKey || !canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-purple-500 shadow-inner transition-colors">
                                                    <option value="">Select Vendor...</option>
                                                    {contractors.filter(c => !data.siteId || c.siteId === data.siteId || c.siteId === 'GLOBAL').map(c => (
                                                        <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Date Conducted</label>
                                                <input type="date" value={data.date} onChange={e => setData({ ...data, date: e.target.value, expiryDate: addMonths(e.target.value, 6) })} disabled={!canEditForm} className="w-full text-sm font-mono text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-orange-400 block mb-2 tracking-widest ml-1">Expiry Date</label>
                                                <input type="date" value={data.expiryDate} onChange={e => setData({ ...data, expiryDate: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-mono text-orange-300 bg-orange-950/20 border border-orange-500/30 p-3 rounded-xl outline-none focus:border-orange-500 shadow-inner transition-colors" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Trainer Name</label>
                                                <input value={data.trainer} onChange={e => setData({ ...data, trainer: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" placeholder="Instructor Name" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Duration</label>
                                                <input value={data.duration} onChange={e => setData({ ...data, duration: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" placeholder="e.g. 2 Hours" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Attendees Section */}
                                    <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 shadow-inner flex flex-col h-[650px]">
                                        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-3">
                                            <h3 className="font-bold text-white uppercase tracking-widest text-xs flex items-center gap-2"><i className="fas fa-users text-emerald-400"></i> Attendance Roster <span className="bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] ml-2">{data.attendees ? data.attendees.length : 0}</span></h3>
                                        </div>

                                        {canEditForm && (
                                            <div className="space-y-4 mb-6">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 ml-1 tracking-widest">Select From Database</label>
                                                    <div className="flex gap-2">
                                                        <select value={selectedUserToAdd} onChange={e => setSelectedUserToAdd(e.target.value)} disabled={data.targetAudience === 'Contractor' && !data.contractorId} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-emerald-500 shadow-inner transition-colors disabled:opacity-50">
                                                            <option value="">{data.targetAudience === 'Contractor' && !data.contractorId ? 'Select Contractor Company first...' : `Select ${data.targetAudience} Personnel...`}</option>
                                                            {availableWorkersForForm.map(u => (
                                                                <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                                                            ))}
                                                        </select>
                                                        <button type="button" onClick={() => addAttendee('db')} disabled={data.targetAudience === 'Contractor' && !data.contractorId} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 ml-1 tracking-widest">Add Manual (External Name)</label>
                                                    <div className="flex gap-2">
                                                        <input value={externalName} onChange={e => setExternalName(e.target.value)} placeholder="Type Guest/Contractor Name..." className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-slate-500 shadow-inner transition-colors" />
                                                        <button type="button" onClick={() => addAttendee('external_manual')} className="bg-slate-700 hover:bg-slate-600 text-white px-5 rounded-xl font-bold shadow-lg transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex-1 overflow-y-auto custom-scroll border border-slate-700 rounded-xl bg-slate-950 shadow-inner">
                                            <table className="w-full text-left text-sm text-slate-300">
                                                <thead className="bg-slate-900/90 backdrop-blur-md uppercase font-bold text-slate-500 text-[10px] tracking-widest sticky top-0 z-10 shadow-sm border-b border-slate-800">
                                                    <tr><th className="p-4">Name</th><th className="p-4 hidden sm:table-cell">Role</th><th className="p-4">Status</th><th className="p-4 w-10 text-center"></th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800/80">
                                                    {data.attendees && data.attendees.map((att, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                                                            <td className="p-4 font-bold text-white">
                                                                {att.name}
                                                                {att.userId === 'External' && <span className="ml-3 text-[9px] bg-purple-900/30 text-purple-400 px-2 py-1 rounded-lg uppercase tracking-widest font-bold border border-purple-500/30">EXT</span>}
                                                            </td>
                                                            <td className="p-4 text-xs text-slate-400 hidden sm:table-cell">{att.role}</td>
                                                            <td className="p-4">
                                                                <select value={att.status} onChange={e => { const newAtt = [...data.attendees]; newAtt[idx].status = e.target.value; setData({ ...data, attendees: newAtt }); }} disabled={!canEditForm} className={`text-xs py-1.5 px-3 border outline-none rounded-lg font-bold cursor-pointer transition-colors shadow-sm ${att.status === 'Attended' ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/30 focus:border-emerald-500' : 'bg-red-950/50 text-red-400 border-red-500/30 focus:border-red-500'}`}>
                                                                    <option>Attended</option><option>Absent</option>
                                                                </select>
                                                            </td>
                                                            <td className="p-4 text-center">{canEditForm && <button type="button" onClick={() => removeAttendee(idx)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button>}</td>
                                                        </tr>
                                                    ))}
                                                    {(!data.attendees || data.attendees.length === 0) && <tr><td colSpan="4" className="p-12 text-center text-slate-500 italic text-sm">No trainees added to roster.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-4 border-t border-slate-700 pt-8 mt-8">
                                    {data.firebaseKey && <button type="button" onClick={() => triggerPrint(data)} className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow-lg flex items-center gap-2"><i className="fas fa-print"></i> Print Roster</button>}
                                    {canEditForm && <button type="button" onClick={saveData} disabled={saving} className="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white px-10 py-4 rounded-xl font-bold shadow-lg shadow-emerald-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50">{saving ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-cloud-arrow-up text-lg"></i>} {data.linkedCapa ? "Save & Close CAPA" : "Save Record"}</button>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- DEDICATED PRINT OVERLAY --- */}
                {printData && (
                    <div className="hidden print:block print-content p-10 bg-white text-black absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                            <div>
                                <div className="text-sm font-bold text-gray-500 mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Document Control</div>
                                <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Training Attendance Record</h1>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold font-mono">Record ID: {printData.id || 'DRAFT'}</p>
                                <p className="text-sm font-bold mt-1 uppercase">Date: {printData.date}</p>
                            </div>
                        </div>

                        <div className="border border-black p-6 bg-gray-50 mb-8">
                            <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Session Information</h2>
                            <table className="w-full text-sm border-none">
                                <tbody>
                                    <tr>
                                        <td className="w-[20%] font-bold py-2 border-b border-gray-300">Topic / Course:</td>
                                        <td colSpan="3" className="text-lg font-bold py-2 border-b border-gray-300">{printData.topic}</td>
                                    </tr>
                                    <tr>
                                        <td className="font-bold py-2 align-top border-b border-gray-300">Content / Agenda:</td>
                                        <td colSpan="3" className="py-2 border-b border-gray-300 whitespace-pre-wrap leading-relaxed">{printData.content || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td className="font-bold py-2 border-b border-gray-300">Site / Location:</td>
                                        <td className="w-[30%] py-2 border-b border-gray-300">{printData.siteId}</td>
                                        <td className="w-[20%] font-bold py-2 pl-4 border-b border-gray-300">Expiry / Renewal:</td>
                                        <td className="py-2 border-b border-gray-300 text-red-600 font-bold font-mono">{printData.expiryDate || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td className="font-bold py-2 border-b border-gray-300">Trainer Name:</td>
                                        <td className="py-2 border-b border-gray-300">{printData.trainer || 'N/A'}</td>
                                        <td className="font-bold py-2 pl-4 border-b border-gray-300">Training Type:</td>
                                        <td className="py-2 border-b border-gray-300">{printData.type || 'Internal'} ({printData.duration})</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {printData.sourceCapaRef && (
                            <div className="border-2 border-dashed border-black p-4 mb-8 bg-gray-100 flex items-start gap-4">
                                <i className="fas fa-link text-2xl mt-1"></i>
                                <div>
                                    <strong className="uppercase block mb-1">Cross-Module Compliance Note:</strong>
                                    <span className="text-sm">This specific training session was conducted to fulfill and close an active Corrective/Preventive Action (CAPA) originating from another safety module (Reference ID: <strong>{printData.sourceCapaRef}</strong>).</span>
                                </div>
                            </div>
                        )}

                        <div className="page-break-inside-avoid">
                            <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-black inline-block">2. Attendance Roster</h2>
                            <table className="w-full text-sm border-collapse border border-black">
                                <thead>
                                    <tr className="bg-gray-200">
                                        <th className="border border-black p-3 text-center w-[5%]">#</th>
                                        <th className="border border-black p-3 text-left w-[35%]">Full Name</th>
                                        <th className="border border-black p-3 text-left w-[30%]">Role / Affiliation</th>
                                        <th className="border border-black p-3 text-center w-[30%]">Signature (Acknowledged)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {printData.attendees && printData.attendees.filter(a => a.status !== 'Absent').map((att, i) => (
                                        <tr key={i}>
                                            <td className="border border-black p-3 text-center font-bold">{i + 1}</td>
                                            <td className="border border-black p-3 font-bold">{att.name} {att.userId === 'External' ? '(Contractor/EXT)' : ''}</td>
                                            <td className="border border-black p-3">{att.role}</td>
                                            <td className="border border-black p-3 h-[40px]"></td>
                                        </tr>
                                    ))}
                                    {(!printData.attendees || printData.attendees.length === 0) && (
                                        <tr><td colSpan="4" className="border border-black p-8 text-center italic text-gray-500">No attendees recorded for this session.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <table className="w-full border-none mt-20 text-sm page-break-inside-avoid">
                            <tbody>
                                <tr>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Trainer Signature</td>
                                    <td className="w-[10%] border-none"></td>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Site Manager / EHS Lead Verification</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                    </div>
                )}
            </div>
        </>
    );
}