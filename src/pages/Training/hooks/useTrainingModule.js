import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { get, push, ref, remove, update } from 'firebase/database';
import * as XLSX from 'xlsx';
import { rtdb } from '../../../config/firebase';
import {
    BASE_TOPICS,
    ROLE_REQUIREMENTS,
    addMonths,
    formatDate,
    safeArr
} from '../utils';
import { hasAccessibleModule } from '../../../utils/permissions';
import { canAuthenticateStatus, readStoredSession } from '../../../utils/session';

const normalizeTrainings = (collection = {}) => (
    Object.entries(collection).map(([key, value]) => ({
        ...value,
        firebaseKey: key,
        attendees: safeArr(value.attendees)
    }))
);

const normalizeContractors = (collection = {}) => (
    Object.entries(collection).map(([key, value]) => ({
        ...value,
        firebaseKey: key,
        workers: safeArr(value.workers)
    }))
);

const normalizeUsers = (collection = {}) => (
    Object.entries(collection)
        .map(([key, value]) => ({
            ...value,
            id: key,
            name: value.name || value.email || 'System Owner',
            accessibleSites: safeArr(value.accessibleSites)
        }))
        .filter((user) => canAuthenticateStatus(user.status))
);

const buildTrainingCapas = (orgData) => {
    const parsedCapas = [];
    const checkDesc = (desc) => /\b(train|training|retrain|retraining|awareness|educate|briefing|toolbox|tbt|teach|instruct|coach|guide|demonstrate|learn|explain|review|drill|session|course)\b/i.test(desc);

    const parseStandardCapa = (collection, sourceName, dbNode, orgId) => {
        if (!collection) return;
        Object.entries(collection).forEach(([key, item]) => {
            const capaList = item.capa || (item.investigation && item.investigation.capa);
            if (!capaList) return;

            Object.entries(capaList).forEach(([idx, act]) => {
                if (!act) return;
                const desc = act.act || act.action || act.desc || act.item || '';
                if (!checkDesc(desc)) return;

                parsedCapas.push({
                    uid: `${sourceName}-${key}-${idx}`,
                    source: sourceName,
                    sourceId: item.id || item.docId || key,
                    desc,
                    owner: act.own || act.owner || act.responsible || 'Unassigned',
                    due: act.due || act.deadline || act.target || 'N/A',
                    status: act.status || 'Open',
                    siteId: item.siteId || 'Global',
                    contextDesc: item.description || item.details || item.observation || '',
                    dbPath: item.capa ? `organizations/${orgId}/${dbNode}/${key}/capa/${idx}` : `organizations/${orgId}/${dbNode}/${key}/investigation/capa/${idx}`
                });
            });
        });
    };

    parseStandardCapa(orgData.incidents, 'Incident', 'incidents', orgData._orgId);
    parseStandardCapa(orgData.mockDrills, 'Emergency Drill', 'mockDrills', orgData._orgId);

    if (orgData.inspectionRecords) {
        Object.entries(orgData.inspectionRecords).forEach(([key, record]) => {
            if (!record.capa || !Array.isArray(record.capa)) return;
            record.capa.forEach((act, idx) => {
                if (!act) return;
                const desc = act.desc || act.act || act.action || '';
                if (!checkDesc(desc)) return;
                parsedCapas.push({
                    uid: `INSP-${key}-${idx}`,
                    source: 'Inspection',
                    sourceId: record.templateTitle || 'Inspection',
                    desc,
                    owner: act.owner || act.own || 'Unassigned',
                    due: act.dueDate || act.due || 'N/A',
                    status: act.status || 'Open',
                    siteId: act.siteId || record.siteId || 'Global',
                    contextDesc: `Inspection finding from: ${record.templateTitle}`,
                    dbPath: `organizations/${orgData._orgId}/inspectionRecords/${key}/capa/${idx}`
                });
            });
        });
    }

    if (orgData.contractors) {
        Object.entries(orgData.contractors).forEach(([key, contractor]) => {
            const workers = safeArr(contractor.workers);
            const pendingWorkers = workers.filter((worker) => !worker.inductionDate || worker.inductionDate === 'Pending' || worker.inductionDate === '');
            if (pendingWorkers.length === 0) return;

            const siteGroups = {};
            pendingWorkers.forEach((worker) => {
                const deployedSite = worker.deployedSite || safeArr(contractor.allocatedSites)[0] || contractor.siteId || 'GLOBAL';
                if (!siteGroups[deployedSite]) siteGroups[deployedSite] = [];
                siteGroups[deployedSite].push(worker);
            });

            Object.entries(siteGroups).forEach(([siteId, siteWorkers]) => {
                parsedCapas.push({
                    uid: `CONT-IND-${key}-${siteId.replace(/\s+/g, '-')}`,
                    source: 'Contractor Induction',
                    sourceId: contractor.companyName,
                    desc: `Mandatory Site Safety Induction for ${siteWorkers.length} worker(s) at ${siteId}: ${siteWorkers.map((worker) => worker.name).join(', ')}`,
                    owner: contractor.contactPerson || 'Vendor',
                    due: new Date().toISOString().split('T')[0],
                    status: 'Open',
                    siteId,
                    contractorKey: key,
                    pendingWorkersInfo: siteWorkers.map((worker) => ({ id: worker.id, name: worker.name, role: worker.role, deployedSite: siteId }))
                });
            });
        });
    }

    return parsedCapas;
};

export function useTrainingModule() {
    const navigate = useNavigate();
    const location = useLocation();
    const filterRef = useRef(null);

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
    const [matrixSiteFilter, setMatrixSiteFilter] = useState('All');
    const [matrixContractorFilter, setMatrixContractorFilter] = useState('All');
    const [calendarSiteFilter, setCalendarSiteFilter] = useState('All');
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [searchTerm, setSearchTerm] = useState('');
    const [hiddenTopics, setHiddenTopics] = useState([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [data, setData] = useState({
        id: '',
        siteId: '',
        topic: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
        expiryDate: addMonths(new Date().toISOString().split('T')[0], 6),
        trainer: '',
        type: 'Internal Formal',
        duration: '1 Hour',
        targetAudience: 'Internal',
        contractorId: '',
        attendees: [],
        linkedCapa: null
    });
    const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
    const [externalName, setExternalName] = useState('');

    useEffect(() => {
        const parsedSession = readStoredSession();
        if (!parsedSession || !canAuthenticateStatus(parsedSession.status)) {
            navigate('/');
            return;
        }

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(parsedSession.role);
        const hasModuleAccess = isGlobalAdmin || hasAccessibleModule(parsedSession.accessibleModules, 'Training');

        if (!hasModuleAccess) {
            alert('Security Alert: You do not have permission to access the Training module.');
            navigate('/dashboard');
            return;
        }

        setSession(parsedSession);

        const canDelete = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(parsedSession.role);
        const canEditCreate = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(parsedSession.role);
        setPermissions({
            viewOnly: !canEditCreate,
            canDelete,
            canEditCreate
        });

        const params = new URLSearchParams(location.search);
        let contextSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        if (!isGlobalAdmin && contextSite === 'All') contextSite = parsedSession.assignedSite;

        setFilterSite(contextSite);
        setMatrixSiteFilter(contextSite);
        setCalendarSiteFilter(contextSite);
        sessionStorage.setItem('isoCurrentSite', contextSite === 'All' ? 'GLOBAL' : contextSite);

        const loadDatabase = async () => {
            try {
                const dbRef = ref(rtdb, `organizations/${parsedSession.orgId}`);
                const snap = await get(dbRef);
                if (snap.exists()) {
                    const orgData = snap.val();
                    const orgDataWithId = { ...orgData, _orgId: parsedSession.orgId };

                    if (orgData.trainings) setTrainings(normalizeTrainings(orgData.trainings));
                    if (orgData.contractors) setContractors(normalizeContractors(orgData.contractors));
                    if (orgData.sites) setSites(Object.keys(orgData.sites).map((key) => ({ code: orgData.sites[key].code || key, name: orgData.sites[key].name || key })));
                    if (orgData.users) setUsers(normalizeUsers(orgData.users));
                    setTrainingCapas(buildTrainingCapas(orgDataWithId));
                }
            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                setLoading(false);
            }
        };

        const handleClickOutside = (event) => {
            if (filterRef.current && !filterRef.current.contains(event.target)) setIsFilterOpen(false);
        };

        loadDatabase();
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [navigate, location]);

    const role = session?.role || 'User';
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

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((site) => allowedSiteCodes.has(site.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const getSmartSiteDefault = (preferredSite = null) => {
        if (preferredSite && preferredSite !== 'Global' && preferredSite !== 'GLOBAL' && preferredSite !== 'All') return preferredSite;
        if (filterSite !== 'All') return filterSite;
        if (session?.assignedSite && session.assignedSite !== 'GLOBAL') return session.assignedSite;
        if (!isGlobalUser && visibleSites.length > 0) return visibleSites[0].code;
        return '';
    };

    const handleDashboardSiteChange = (event) => { setFilterSite(event.target.value); sessionStorage.setItem('isoCurrentSite', event.target.value === 'All' ? 'GLOBAL' : event.target.value); };
    const handleMatrixSiteChange = (event) => { setMatrixSiteFilter(event.target.value); sessionStorage.setItem('isoCurrentSite', event.target.value === 'All' ? 'GLOBAL' : event.target.value); };
    const handleCalendarSiteChange = (event) => { setCalendarSiteFilter(event.target.value); sessionStorage.setItem('isoCurrentSite', event.target.value === 'All' ? 'GLOBAL' : event.target.value); };

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!data.siteId) return true;
        return allowedSiteCodes.has(data.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, data.siteId]);

    const availableWorkersForForm = useMemo(() => {
        if (data.targetAudience === 'Internal') {
            return users.filter((user) => {
                const isGlobalUserRecord = user.role === 'Owner' || user.role === 'Lead Auditor' || user.assignedSite === 'GLOBAL' || safeArr(user.accessibleSites).includes('GLOBAL');
                return isGlobalUserRecord || !data.siteId || user.assignedSite === data.siteId || safeArr(user.accessibleSites).includes(data.siteId);
            });
        }
        if (!data.contractorId) return [];
        const vendor = contractors.find((contractor) => contractor.firebaseKey === data.contractorId);
        return safeArr(vendor?.workers);
    }, [users, contractors, data.targetAudience, data.siteId, data.contractorId]);

    const uniqueTopics = useMemo(() => [...new Set([...BASE_TOPICS, ...trainings.map((training) => training.topic)])], [trainings]);
    const displayedTopics = useMemo(() => uniqueTopics.filter((topic) => !hiddenTopics.includes(topic)), [uniqueTopics, hiddenTopics]);

    const certifications = useMemo(() => {
        const certs = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        [...trainings].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((training) => {
            if (!isGlobalUser && !allowedSiteCodes.has(training.siteId)) return;
            safeArr(training.attendees).forEach((attendee) => {
                if (attendee.status !== 'Attended') return;
                const key = `${attendee.name}_${training.topic}`;
                const expiryDate = training.expiryDate || addMonths(training.date, 6);
                certs[key] = { userName: attendee.name, userId: attendee.userId, topic: training.topic, date: training.date, expiryDate, trainingId: training.id };
            });
        });

        Object.values(certs).forEach((cert) => {
            if (!cert.expiryDate) {
                cert.status = 'Valid';
                cert.statusClass = 'bg-emerald-500/20 text-emerald-400';
                return;
            }

            const expiry = new Date(cert.expiryDate);
            expiry.setHours(23, 59, 59, 999);
            const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                cert.status = 'Expired';
                cert.statusClass = 'bg-red-500/20 text-red-400';
            } else if (diffDays <= 30) {
                cert.status = '< 30 Days';
                cert.statusClass = 'bg-orange-500/20 text-orange-400';
            } else if (diffDays <= 180) {
                cert.status = '< 6 Months';
                cert.statusClass = 'bg-yellow-500/20 text-yellow-400';
            } else {
                cert.status = 'Valid';
                cert.statusClass = 'bg-emerald-500/20 text-emerald-400';
            }
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

        return { status: displayStatus, color, dateGiven: formatDate(cert.date), dateExpires: formatDate(cert.expiryDate), certObj: cert };
    };

    const allMatrixRows = useMemo(() => {
        let merged = [];
        users.forEach((user) => merged.push({ id: user.id, name: user.name, role: user.role, assignedSite: user.assignedSite, accessibleSites: safeArr(user.accessibleSites), type: 'Internal' }));
        contractors.forEach((contractor) => {
            safeArr(contractor.workers).forEach((worker) => merged.push({ id: worker.id, name: worker.name, role: `${worker.role} (Contractor)`, assignedSite: worker.deployedSite || contractor.siteId, type: 'Contractor', contractorId: contractor.firebaseKey, companyName: contractor.companyName }));
        });

        if (matrixSiteFilter !== 'All') merged = merged.filter((user) => user.assignedSite === matrixSiteFilter || safeArr(user.accessibleSites).includes(matrixSiteFilter));
        else if (!isGlobalUser) merged = merged.filter((user) => allowedSiteCodes.has(user.assignedSite) || safeArr(user.accessibleSites).some((site) => allowedSiteCodes.has(site)));

        if (matrixContractorFilter === 'Internal') merged = merged.filter((user) => user.type === 'Internal');
        else if (matrixContractorFilter !== 'All') merged = merged.filter((user) => user.contractorId === matrixContractorFilter);

        if (searchTerm) merged = merged.filter((user) => user.name.toLowerCase().includes(searchTerm.toLowerCase()));
        return merged.sort((a, b) => a.name.localeCompare(b.name));
    }, [users, contractors, matrixSiteFilter, matrixContractorFilter, searchTerm, isGlobalUser, allowedSiteCodes]);

    const filteredAlerts = useMemo(() => {
        const alerts = Object.values(certifications).filter((cert) => cert.status !== 'Valid').sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        if (filterSite === 'All') return alerts;
        return alerts.filter((alert) => {
            const internalUser = users.find((user) => user.name === alert.userName);
            if (internalUser) return internalUser.assignedSite === filterSite || safeArr(internalUser.accessibleSites).includes(filterSite);
            const contractor = contractors.find((item) => safeArr(item.workers).some((worker) => worker.name === alert.userName));
            if (contractor) {
                const worker = safeArr(contractor.workers).find((item) => item.name === alert.userName);
                return (worker && worker.deployedSite === filterSite) || contractor.siteId === filterSite;
            }
            return false;
        });
    }, [certifications, filterSite, users, contractors]);

    const pendingTrainingCapas = useMemo(() => (
        trainingCapas.filter((capa) => {
            if (capa.status === 'Closed') return false;
            if (!isGlobalUser && !allowedSiteCodes.has(capa.siteId) && capa.siteId !== 'Global') return false;
            if (filterSite !== 'All' && capa.siteId !== filterSite && capa.source !== 'Incident') return false;
            return true;
        })
    ), [trainingCapas, filterSite, isGlobalUser, allowedSiteCodes]);

    const toggleTopicFilter = (topic) => setHiddenTopics((prev) => prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic]);
    const selectAllTopics = () => setHiddenTopics([]);
    const clearAllTopics = () => setHiddenTopics(uniqueTopics);

    const downloadMatrix = () => {
        const rows = allMatrixRows.map((user) => {
            const row = { Name: user.name, Role: user.role, Company: user.companyName || 'Internal' };
            displayedTopics.forEach((topic) => {
                const cell = getMatrixCell(user.name, user.role, topic);
                row[topic] = cell.status === 'Not Trained' ? 'Not Trained' : cell.status === 'N/A' ? 'N/A' : `${cell.status} (Exp: ${cell.dateExpires})`;
            });
            return row;
        });
        XLSX.writeFile(XLSX.utils.json_to_sheet(rows), 'Training_Matrix.xlsx');
    };

    const openNewForm = () => {
        const today = new Date().toISOString().split('T')[0];
        setView('form');
        setData({ id: '', siteId: getSmartSiteDefault(), topic: '', content: '', date: today, expiryDate: addMonths(today, 6), trainer: '', type: 'Internal Formal', duration: '1 Hour', targetAudience: 'Internal', contractorId: '', attendees: [], linkedCapa: null });
    };

    const openTrainingRecord = (training) => {
        setData({ ...training, attendees: safeArr(training.attendees) });
        setView('form');
    };

    const initiateRetraining = (topic, usersToRetrain) => {
        if (!permissions.canEditCreate) return alert('Security Error: You do not have permission to initiate training.');
        const attendees = usersToRetrain.map((user) => ({ userId: user.userId || user.id || 'Internal', name: user.userName || user.name, role: user.role || 'Employee', status: 'Attended' }));
        const today = new Date().toISOString().split('T')[0];
        setData({ id: '', siteId: usersToRetrain[0]?.assignedSite || getSmartSiteDefault(), topic, content: '', date: today, expiryDate: addMonths(today, 6), trainer: '', type: 'Internal Formal', duration: '1 Hour', targetAudience: 'Internal', contractorId: '', attendees, linkedCapa: null });
        setView('form');
    };

    const initiateCapaTraining = (capaItem) => {
        if (!permissions.canEditCreate) return alert('Security Error: You do not have permission to initiate training.');

        const today = new Date().toISOString().split('T')[0];
        let initialContent = '';
        let attendees = [];
        let targetAudience = 'Internal';
        let contractorId = '';

        if (capaItem.source === 'Incident') initialContent = `=== INCIDENT ID: ${capaItem.sourceId} ===\n\nDETAILS:\n${capaItem.contextDesc}\n\nTRAINING AGENDA:\n...`;
        else if (capaItem.source === 'Inspection') initialContent = `=== INSPECTION: ${capaItem.sourceId} ===\n\nDETAILS:\n${capaItem.contextDesc}\n\nTRAINING AGENDA:\n...`;
        else if (capaItem.source === 'Contractor Induction') {
            targetAudience = 'Contractor';
            contractorId = capaItem.contractorKey;
            initialContent = `=== CONTRACTOR SITE INDUCTION ===\n\nCompany: ${capaItem.sourceId}\nConducting mandatory site safety induction for pending contractor personnel deployed at ${capaItem.siteId}.`;
            attendees = (capaItem.pendingWorkersInfo || []).map((worker) => ({ userId: 'External', name: worker.name, role: `${worker.role} (Contractor)`, status: 'Attended' }));
        } else initialContent = `Fulfilling CAPA for ${capaItem.source} (Ref: ${capaItem.sourceId})`;

        setData({ id: '', siteId: capaItem.siteId || getSmartSiteDefault(), topic: capaItem.source === 'Contractor Induction' ? 'Site Safety Induction' : capaItem.desc, content: initialContent, date: today, expiryDate: addMonths(today, 6), trainer: '', type: 'Internal Formal', duration: '1 Hour', targetAudience, contractorId, attendees, linkedCapa: capaItem });
        setView('form');
    };

    const addAttendee = (type) => {
        if (type === 'external_manual') {
            if (!externalName.trim()) return alert('Enter external trainee name.');
            if (safeArr(data.attendees).some((attendee) => attendee.name.toLowerCase() === externalName.trim().toLowerCase())) return alert('Already added.');
            setData((prev) => ({ ...prev, attendees: [...safeArr(prev.attendees), { userId: 'External', name: externalName.trim(), role: 'External / Contractor', status: 'Attended' }] }));
            setExternalName('');
            return;
        }

        if (!selectedUserToAdd) return;
        const worker = availableWorkersForForm.find((item) => item.id === selectedUserToAdd || item.name === selectedUserToAdd);
        if (!worker) return;
        if (safeArr(data.attendees).some((attendee) => attendee.name === worker.name)) return alert('Already added to the list.');

        setData((prev) => ({
            ...prev,
            attendees: [...safeArr(prev.attendees), {
                userId: data.targetAudience === 'Internal' ? worker.id : 'External',
                name: worker.name,
                role: data.targetAudience === 'Internal' ? (worker.role || 'Employee') : `${worker.role} (Contractor)`,
                status: 'Attended'
            }]
        }));
        setSelectedUserToAdd('');
    };

    const removeAttendee = (index) => setData((prev) => ({ ...prev, attendees: safeArr(prev.attendees).filter((_, idx) => idx !== index) }));

    const refreshTrainings = async (orgId) => {
        const dbRef = ref(rtdb, `organizations/${orgId}/trainings`);
        const snap = await get(dbRef);
        if (snap.exists()) setTrainings(normalizeTrainings(snap.val()));
        else setTrainings([]);
    };

    const saveData = async () => {
        if (!canEditForm) return alert('Security Error: You do not have permission to create or edit records for this site.');
        if (!data.siteId || !data.topic) return alert('Site and Topic are required.');
        if (data.targetAudience === 'Contractor' && !data.contractorId) return alert('Please select a Contractor Company.');

        setSaving(true);
        const newId = data.id || `TRN-${Date.now().toString().slice(-6)}`;
        const linkedCapaPath = data.linkedCapa ? data.linkedCapa.dbPath : null;
        const isContractorInduction = data.linkedCapa && data.linkedCapa.source === 'Contractor Induction';
        const payload = { ...data, id: newId };
        delete payload.linkedCapa;
        if (data.linkedCapa) payload.sourceCapaRef = data.linkedCapa.uid;

        try {
            if (data.firebaseKey) await update(ref(rtdb, `organizations/${session.orgId}/trainings/${data.firebaseKey}`), payload);
            else await push(ref(rtdb, `organizations/${session.orgId}/trainings`), payload);

            if (data.targetAudience === 'Contractor' && data.contractorId) {
                const contractorRef = ref(rtdb, `organizations/${session.orgId}/contractors/${data.contractorId}`);
                const contractorSnap = await get(contractorRef);
                if (contractorSnap.exists()) {
                    const contractorData = contractorSnap.val();
                    let workers = safeArr(contractorData.workers);
                    const attendedNames = safeArr(data.attendees).filter((attendee) => attendee.status === 'Attended').map((attendee) => attendee.name);

                    if (data.topic.toLowerCase().includes('induction')) {
                        workers = workers.map((worker) => attendedNames.includes(worker.name) && (!worker.inductionDate || worker.inductionDate === 'Pending' || worker.inductionDate === '') ? { ...worker, inductionDate: data.date } : worker);
                        await update(contractorRef, { workers });
                    }

                    await update(contractorRef, { trainings: [...safeArr(contractorData.trainings), { id: newId, topic: data.topic, date: data.date, attendees: attendedNames.join(', ') }] });
                }
            }

            if (isContractorInduction) alert('Contractor Training Logged! Any pending worker inductions have been updated.');
            else if (linkedCapaPath) {
                await update(ref(rtdb, linkedCapaPath), { status: 'Closed' });
                alert("Training Saved! The linked CAPA action has been marked as 'Closed'.");
            } else alert('Saved Successfully!');

            await refreshTrainings(session.orgId);
            setView('repo');
        } catch (error) {
            alert(`Failed to save: ${error.message}`);
        }
        setSaving(false);
    };

    const handleDelete = async (training) => {
        if (!permissions.canDelete) return alert('Security Error: You do not have permission to delete training records.');
        if (!window.confirm(`Permanently delete training record ${training.id || ''}?`)) return;
        await remove(ref(rtdb, `organizations/${session.orgId}/trainings/${training.firebaseKey}`));
        setTrainings((prev) => prev.filter((item) => item.firebaseKey !== training.firebaseKey));
    };

    const triggerPrint = (record) => {
        setPrintData(record);
        setTimeout(() => window.print(), 800);
    };

    return {
        allMatrixRows,
        allowedSiteCodes,
        availableWorkersForForm,
        calendarSiteFilter,
        canEditForm,
        certifications,
        clearAllTopics,
        contractors,
        currentMonth,
        currentYear,
        data,
        displayedTopics,
        downloadMatrix,
        expiredCount: Object.values(certifications).filter((cert) => cert.status === 'Expired').length,
        expiringCount: Object.values(certifications).filter((cert) => cert.status === '< 6 Months' || cert.status === '< 30 Days').length,
        externalName,
        filterRef,
        filterSite,
        filteredAlerts,
        getMatrixCell,
        handleCalendarSiteChange,
        handleDashboardSiteChange,
        handleDelete,
        handleMatrixSiteChange,
        hiddenTopics,
        initiateCapaTraining,
        initiateRetraining,
        isFilterOpen,
        isGlobalUser,
        loading,
        matrixContractorFilter,
        matrixSiteFilter,
        onMatrixContractorChange: setMatrixContractorFilter,
        onSearchChange: setSearchTerm,
        openNewForm,
        openTrainingRecord,
        pendingCount: pendingTrainingCapas.length,
        pendingTrainingCapas,
        permissions,
        printData,
        removeAttendee,
        saving,
        searchTerm,
        selectAllTopics,
        selectedUserToAdd,
        setCurrentMonth,
        setCurrentYear,
        setData,
        setExternalName,
        setIsFilterOpen,
        setSelectedUserToAdd,
        setView,
        toggleTopicFilter,
        trainings,
        trainingCapas,
        triggerPrint,
        uniqueTopics,
        users,
        validCount: Object.values(certifications).filter((cert) => cert.status === 'Valid').length,
        view,
        visibleSites,
        addAttendee,
        saveData
    };
}
