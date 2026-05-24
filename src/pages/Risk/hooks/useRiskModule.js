import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { dbGet, dbPush, dbUpdate, dbRemove } from '../../../services/db/index.js';
import * as XLSX from 'xlsx';
import { readOrgChild, readOrgChildren } from '../../../utils/orgData';
import {
    CHANGE_SOURCES,
    HAZARD_CATS,
    HAZARD_DICTIONARY,
    getRiskStyle
} from '../utils';
import {
    canDeleteForRole,
    canEditCreateForRole,
    getAllowedSiteCodes,
    hasAccessibleModule,
    isGlobalOwnerRole,
    isGlobalScopeUserRecord,
    isSiteOwnerRole
} from '../../../utils/permissions';
import { readStoredSession } from '../../../utils/session';
import { buildRegionOptions, filterSitesByRegion, normalizeSites, passesSiteAndRegionFilter } from '../../../utils/siteRegions';

const normalizeRiskAssessments = (collection = {}) => (
    Object.keys(collection).map((key) => {
        const value = collection[key];
        const activities = Array.isArray(value.activities) ? value.activities : (value.activities ? Object.values(value.activities) : []);
        const safeActivities = activities.map((activity) => ({
            ...activity,
            hazards: Array.isArray(activity.hazards) ? activity.hazards : (activity.hazards ? Object.values(activity.hazards) : [])
        }));
        const changeLogs = Array.isArray(value.changeLogs) ? value.changeLogs : (value.changeLogs ? Object.values(value.changeLogs) : []);

        return { firebaseKey: key, ...value, activities: safeActivities, changeLogs };
    }).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
);

const hasHighResidualRisk = (assessment) => (
    (assessment.activities || []).some((activity) => (activity.hazards || []).some((hazard) => hazard.r2 > 10))
);

const hasAlarpCase = (assessment) => (
    (assessment.activities || []).some((activity) => (activity.hazards || []).some((hazard) => hazard.alarp))
);

export function useRiskModule() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [repo, setRepo] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [view, setView] = useState('list');
    const [printData, setPrintData] = useState(null);
    const [filterSite, setFilterSite] = useState('All');
    const [regionFilter, setRegionFilter] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [importing, setImporting] = useState(false);
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });
    const [formData, setFormData] = useState({
        id: '',
        assessmentName: '',
        siteId: '',
        location: '',
        date: new Date().toISOString().split('T')[0],
        status: 'Draft',
        team: [{ name: '', role: '' }],
        activities: [],
        changeLogs: []
    });
    const [showChangeModal, setShowChangeModal] = useState(false);
    const [changeDetails, setChangeDetails] = useState({ source: 'Annual Review', reason: '' });

    useEffect(() => {
        const parsedSession = readStoredSession();
        if (!parsedSession) {
            navigate('/');
            return;
        }

        const isGlobalAdmin = isGlobalOwnerRole(parsedSession.role);
        const hasModuleAccess = isGlobalAdmin || hasAccessibleModule(parsedSession.accessibleModules, 'Risk Assessment');

        if (!hasModuleAccess) {
            alert('Security Alert: You do not have permission to access the Risk Assessment module.');
            navigate('/dashboard');
            return;
        }

        setSession(parsedSession);

        const canDelete = canDeleteForRole(parsedSession.role);
        const canEditCreate = canEditCreateForRole(parsedSession.role);
        setPermissions({
            viewOnly: !canEditCreate,
            canDelete,
            canEditCreate
        });

        const params = new URLSearchParams(location.search);
        const urlSite = params.get('site');
        let storedSite = sessionStorage.getItem('isoCurrentSite');
        if (storedSite === 'GLOBAL') storedSite = 'All';

        let contextSite = urlSite || storedSite || 'All';
        if (!isGlobalAdmin && contextSite === 'All') {
            contextSite = (parsedSession.assignedSite && parsedSession.assignedSite !== 'GLOBAL') ? parsedSession.assignedSite : (parsedSession.accessibleSites?.[0] || '');
        }

        setFilterSite(contextSite);
        sessionStorage.setItem('isoCurrentSite', contextSite === 'All' ? 'GLOBAL' : contextSite);
        setFormData((prev) => ({
            ...prev,
            siteId: contextSite !== 'All' ? contextSite : ((parsedSession.assignedSite !== 'GLOBAL') ? parsedSession.assignedSite : '')
        }));

        const fetchAll = async () => {
            try {
                const value = await readOrgChildren(null, parsedSession.orgId, ['riskAssessments', 'sites', 'users']);
                if (value.riskAssessments) setRepo(normalizeRiskAssessments(value.riskAssessments));

                if (value.sites) setSites(normalizeSites(value.sites));

                if (value.users) {
                    setUsers(Object.entries(value.users).map(([key, user]) => ({ id: key, ...user })).filter((user) => user.status !== 'Inactive'));
                }
            } catch (error) {
                console.error('Load error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, [navigate, location]);

    const role = session?.role || 'User';
    const isGlobalUser = isGlobalOwnerRole(role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        return getAllowedSiteCodes(session);
    }, [session]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((site) => allowedSiteCodes.has(site.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const regionOptions = useMemo(() => buildRegionOptions(visibleSites), [visibleSites]);

    const filteredVisibleSites = useMemo(
        () => filterSitesByRegion(visibleSites, regionFilter),
        [visibleSites, regionFilter]
    );

    const activeUsers = useMemo(() => {
        if (!formData.siteId) return users;
        return users.filter((user) => isGlobalScopeUserRecord(user) || user.assignedSite === formData.siteId || (user.accessibleSites && user.accessibleSites.includes(formData.siteId)));
    }, [users, formData.siteId]);

    const canEditRecord = (siteId) => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        return allowedSiteCodes.has(siteId);
    };

    const canDeleteRecord = (siteId) => {
        if (isGlobalOwnerRole(role)) return true;
        if (isSiteOwnerRole(role) && allowedSiteCodes.has(siteId)) return true;
        return false;
    };

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!formData.siteId) return true;
        return allowedSiteCodes.has(formData.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, formData.siteId]);

    const handleSiteFilterChange = (event) => {
        const nextSite = event.target.value;
        setFilterSite(nextSite);
        sessionStorage.setItem('isoCurrentSite', nextSite === 'All' ? 'GLOBAL' : nextSite);
    };

    const handleRegionFilterChange = (event) => {
        setRegionFilter(event.target.value);
    };

    useEffect(() => {
        if (filterSite !== 'All' && !filteredVisibleSites.some((site) => site.code === filterSite)) {
            setFilterSite('All');
            sessionStorage.setItem('isoCurrentSite', 'GLOBAL');
        }
    }, [filterSite, filteredVisibleSites]);

    const filteredRepo = useMemo(() => (
        repo.filter((record) => {
            const canView = isGlobalUser || allowedSiteCodes.has(record.siteId);
            if (!canView) return false;
            const matchSite = passesSiteAndRegionFilter({
                siteId: record.siteId,
                siteFilter: filterSite,
                regionFilter,
                sites: visibleSites
            });
            const matchStatus = filterStatus === 'All' || record.status === filterStatus;
            return matchSite && matchStatus;
        }).sort((a, b) => new Date(b.date) - new Date(a.date))
    ), [repo, filterSite, filterStatus, isGlobalUser, allowedSiteCodes, regionFilter, visibleSites]);

    const totalGlobalHazards = useMemo(() => (
        filteredRepo.reduce((sum, assessment) => sum + (assessment.activities || []).reduce((activitySum, activity) => activitySum + (activity.hazards || []).length, 0), 0)
    ), [filteredRepo]);

    const highRiskCount = useMemo(() => filteredRepo.filter(hasHighResidualRisk).length, [filteredRepo]);
    const alarpCount = useMemo(() => filteredRepo.filter(hasAlarpCase).length, [filteredRepo]);

    const allChangeLogs = useMemo(() => {
        const logs = [];
        filteredRepo.forEach((assessment) => {
            (assessment.changeLogs || []).forEach((log) => {
                logs.push({ ...log, docId: assessment.docId, assessmentName: assessment.assessmentName, siteId: assessment.siteId, firebaseKey: assessment.firebaseKey });
            });
        });
        return logs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }, [filteredRepo]);

    const refreshRiskAssessments = async (orgId) => {
        const riskAssessments = await readOrgChild(null, orgId, 'riskAssessments');
        setRepo(riskAssessments ? normalizeRiskAssessments(riskAssessments) : []);
    };

    const openNewForm = () => {
        if (!permissions.canEditCreate) return alert('Security Error: You do not have permission to create Risk Assessments.');
        setFormData({
            firebaseKey: null,
            docId: `HIRA-${Math.floor(100000 + Math.random() * 900000)}`,
            assessmentName: '',
            siteId: (!isGlobalUser && visibleSites.length === 1) ? visibleSites[0].code : (filterSite !== 'All' ? filterSite : ''),
            location: '',
            date: new Date().toISOString().split('T')[0],
            status: 'Draft',
            team: [{ name: session?.name || session?.email, role: 'Lead Assessor' }],
            activities: [],
            changeLogs: []
        });
        setView('form');
    };

    const openEditForm = (record) => {
        setFormData({ ...record });
        setView('form');
    };

    const openLogRecord = (firebaseKey) => {
        const matchingAssessment = repo.find((assessment) => assessment.firebaseKey === firebaseKey);
        if (matchingAssessment) {
            setFormData(matchingAssessment);
            setView('form');
        }
    };

    const downloadTemplate = () => {
        const headers = ['Activity/Sub activity/ Equipment/ Material', 'S.No', 'Potential Hazards (Unsafe Conditions/ Unsafe Acts)', 'Consequences (Impact on Human Health & Safety and to Whom)', 'Current Controls (EC, AC, PPE)', 'PR (Prob)', 'S (Sev)', 'Risk Score', 'Risk Level', 'Additional Controls', 'Res. PR', 'Res. S', 'Res. Score', 'Res. Risk Level', 'Remarks/Owner'];
        const data = [headers, ['Ceiling - Maintenance of Fans/AC [Non- Routine]', '1', 'Physical / Fall from Height: Falling from ladder', 'Harm to Technicians', 'Ladder (Administrative Controls)', 2, 4, 8, 'Medium', 'A-frame ladders; Buddy system; Harness. (Administrative Controls)', 1, 4, 4, 'Low', 'Owner: Facility Manager | Due: As needed']];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HIRA_Template');
        XLSX.writeFile(wb, 'HIRA_Upload_Template.xlsx');
    };

    const handleExcelImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setImporting(true);

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            try {
                const workbook = XLSX.read(readerEvent.target.result, { type: 'binary' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(worksheet);
                if (rows.length === 0) throw new Error('Excel sheet is empty.');

                const keys = Object.keys(rows[0]);
                const getCol = (keywords) => keys.find((key) => keywords.some((keyword) => key.toLowerCase().includes(keyword)));

                const actCol = getCol(['activity', 'task', 'equipment']);
                const hazCol = getCol(['hazard', 'unsafe']);
                const whoCol = getCol(['consequence', 'whom', 'impact']);
                const extCol = getCol(['current control', 'existing control']);
                const pr1Col = getCol(['pr (prob)', 'pr', 'prob']);
                const s1Col = getCol(['s (sev)', 'sev']);
                const addCol = getCol(['additional control']);
                const pr2Col = getCol(['res. pr', 'res p']);
                const s2Col = getCol(['res. s', 'res s']);
                const ownCol = getCol(['owner', 'remark']);

                const generatedActivities = [];
                const activityMap = {};

                const parseControls = (value, isAdditional = false, ownerValue = '') => {
                    if (!value || value.toLowerCase().includes('none')) return [];

                    let owner = 'Unassigned';
                    if (isAdditional && ownerValue && ownerValue.includes('Owner:')) {
                        const ownerMatch = ownerValue.match(/Owner:\s*([^|]+)/);
                        if (ownerMatch) owner = ownerMatch[1].trim();
                    }

                    let cleanValue = value;
                    let type = 'Administrative';
                    const typeMatch = value.match(/\(([^)]+)\)$/);
                    if (typeMatch) {
                        const rawType = typeMatch[1].toLowerCase();
                        if (rawType.includes('engineer')) type = 'Engineering';
                        else if (rawType.includes('substitut')) type = 'Substitution';
                        else if (rawType.includes('eliminat')) type = 'Elimination';
                        else if (rawType.includes('ppe')) type = 'PPE';
                        cleanValue = value.replace(/\([^)]+\)$/, '').trim();
                    }

                    return cleanValue.split(';').map((control) => {
                        let desc = control.trim();
                        if (desc.endsWith('.')) desc = desc.slice(0, -1).trim();
                        if (!desc) return null;
                        return isAdditional ? { category: type, desc, owner, status: 'Open' } : { type, desc };
                    }).filter(Boolean);
                };

                rows.forEach((row) => {
                    const rawActivity = row[actCol] || 'Unspecified Activity';
                    let location = '';
                    let activityName = rawActivity;

                    if (rawActivity.includes(' - ')) {
                        const parts = rawActivity.split(' - ');
                        location = parts[0].trim();
                        activityName = parts.slice(1).join(' - ').trim();
                    }

                    const hazardDescription = row[hazCol] || 'Unspecified Hazard';
                    const whoDescription = row[whoCol] || '';
                    let detectedCategory = 'Equipment_Machine';
                    let detectedSubCategory = 'Other';
                    let suggestedControls = [];
                    const lowerDescription = hazardDescription.toLowerCase();

                    for (const category of HAZARD_CATS) {
                        for (const subCategory of Object.keys(HAZARD_DICTIONARY[category])) {
                            const words = subCategory.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter((word) => word.length > 3);
                            if (words.some((word) => lowerDescription.includes(word)) || lowerDescription.includes(category.toLowerCase())) {
                                detectedCategory = category;
                                detectedSubCategory = subCategory;
                                suggestedControls = HAZARD_DICTIONARY[category][subCategory].controls;
                                break;
                            }
                        }
                        if (suggestedControls.length > 0) break;
                    }

                    if (!activityMap[activityName]) {
                        activityMap[activityName] = { id: Date.now() + Math.random(), name: activityName, hazards: [] };
                        generatedActivities.push(activityMap[activityName]);
                    }

                    const p1 = parseInt(row[pr1Col], 10) || 3;
                    const s1 = parseInt(row[s1Col], 10) || 3;
                    const p2 = parseInt(row[pr2Col], 10) || 1;
                    const s2 = parseInt(row[s2Col], 10) || 3;

                    activityMap[activityName].hazards.push({
                        id: Date.now() + Math.random(),
                        location,
                        category: detectedCategory,
                        subCategory: detectedSubCategory,
                        desc: hazardDescription,
                        who: whoDescription || HAZARD_DICTIONARY[detectedCategory][detectedSubCategory].who,
                        p1,
                        s1,
                        r1: p1 * s1,
                        existingControls: parseControls(row[extCol]),
                        suggestedControls,
                        p2,
                        s2,
                        r2: p2 * s2,
                        additionalControls: parseControls(row[addCol], true, row[ownCol]),
                        alarp: false,
                        alarpJustification: ''
                    });
                });

                setFormData({
                    id: '',
                    assessmentName: `Imported HIRA - ${new Date().toISOString().split('T')[0]}`,
                    siteId: filterSite !== 'All' ? filterSite : (visibleSites[0]?.code || ''),
                    location: 'Imported Data',
                    date: new Date().toISOString().split('T')[0],
                    status: 'Draft',
                    team: [{ name: session?.name || session?.email, role: 'Lead Assessor' }],
                    activities: generatedActivities,
                    changeLogs: []
                });
                setView('form');
                alert(`Smart Import successful! Mapped ${generatedActivities.length} activities with intelligent controls.`);
            } catch (error) {
                alert(`Failed to parse Excel file. Please ensure it matches the Standard Upload Format.\n${error.message}`);
            }

            setImporting(false);
            event.target.value = null;
        };

        reader.readAsBinaryString(file);
    };

    const addActivity = () => setFormData({ ...formData, activities: [...formData.activities, { id: Date.now(), name: '', hazards: [] }] });
    const updateActivityName = (idx, name) => {
        const activities = [...formData.activities];
        activities[idx].name = name;
        setFormData({ ...formData, activities });
    };
    const removeActivity = (idx) => {
        if (window.confirm('Remove this entire activity and all its hazards?')) {
            setFormData({ ...formData, activities: formData.activities.filter((_, i) => i !== idx) });
        }
    };

    const addHazard = (actIdx) => {
        const activities = [...formData.activities];
        activities[actIdx].hazards.push({
            id: Date.now(),
            location: '',
            category: '',
            subCategory: '',
            desc: '',
            who: '',
            p1: 3,
            s1: 3,
            r1: 9,
            existingControls: [],
            suggestedControls: [],
            p2: 1,
            s2: 3,
            r2: 3,
            additionalControls: [],
            alarp: false,
            alarpJustification: ''
        });
        setFormData({ ...formData, activities });
    };

    const updateHazard = (actIdx, hazIdx, field, value) => {
        const activities = [...formData.activities];
        const hazard = activities[actIdx].hazards[hazIdx];
        hazard[field] = value;
        if (field === 'p1' || field === 's1') hazard.r1 = hazard.p1 * hazard.s1;
        if (field === 'p2' || field === 's2') hazard.r2 = hazard.p2 * hazard.s2;
        setFormData({ ...formData, activities });
    };

    const handleCategoryChange = (actIdx, hazIdx, newCategory) => {
        const activities = [...formData.activities];
        const hazard = activities[actIdx].hazards[hazIdx];
        hazard.category = newCategory;
        hazard.subCategory = '';
        hazard.who = '';
        hazard.suggestedControls = [];
        setFormData({ ...formData, activities });
    };

    const handleSubCategoryChange = (actIdx, hazIdx, newSubCategory) => {
        const activities = [...formData.activities];
        const hazard = activities[actIdx].hazards[hazIdx];
        hazard.subCategory = newSubCategory;
        const suggestionDB = HAZARD_DICTIONARY[hazard.category];
        if (suggestionDB && suggestionDB[newSubCategory]) {
            const data = suggestionDB[newSubCategory];
            hazard.who = data.who;
            hazard.suggestedControls = data.controls;
        }
        setFormData({ ...formData, activities });
    };

    const removeHazard = (actIdx, hazIdx) => {
        const activities = [...formData.activities];
        activities[actIdx].hazards = activities[actIdx].hazards.filter((_, i) => i !== hazIdx);
        setFormData({ ...formData, activities });
    };

    const addTeamMember = () => setFormData({ ...formData, team: [...formData.team, { name: '', role: '' }] });
    const updateTeam = (idx, field, value) => {
        const team = [...formData.team];
        team[idx][field] = value;
        setFormData({ ...formData, team });
    };
    const removeTeam = (idx) => setFormData({ ...formData, team: formData.team.filter((_, i) => i !== idx) });

    const processSave = async () => {
        if (!permissions.canEditCreate) return alert('Security Error: You do not have permission to edit.');
        if (!formData.assessmentName) return alert('Assessment Name is required.');
        if (!formData.siteId) return alert('Site is required.');
        if (!isGlobalUser && !allowedSiteCodes.has(formData.siteId)) return alert('Security Error: You do not have permission to save records to this specific site.');
        if (formData.firebaseKey && !showChangeModal) {
            setShowChangeModal(true);
            return;
        }
        if (formData.firebaseKey && showChangeModal && !changeDetails.reason.trim()) return alert('Please provide a reason for this change/revision.');

        setSaving(true);
        const docId = formData.docId || `HIRA-${formData.siteId}-${Date.now().toString().slice(-6)}`;

        const cleanActivities = formData.activities.map((activity) => ({
            id: activity.id,
            name: activity.name,
            hazards: (Array.isArray(activity.hazards) ? activity.hazards : []).map((hazard) => ({
                id: hazard.id,
                location: hazard.location || '',
                category: hazard.category,
                subCategory: hazard.subCategory,
                desc: hazard.desc,
                who: hazard.who,
                p1: hazard.p1,
                s1: hazard.s1,
                r1: hazard.r1,
                p2: hazard.p2,
                s2: hazard.s2,
                r2: hazard.r2,
                alarp: hazard.alarp || false,
                alarpJustification: hazard.alarpJustification || '',
                existingControls: Array.isArray(hazard.existingControls) ? hazard.existingControls : [],
                additionalControls: Array.isArray(hazard.additionalControls) ? hazard.additionalControls : []
            }))
        }));

        let updatedLogs = Array.isArray(formData.changeLogs) ? formData.changeLogs : [];
        if (formData.firebaseKey && showChangeModal) {
            updatedLogs = [...updatedLogs, {
                date: new Date().toISOString(),
                user: session.name || session.email,
                source: changeDetails.source,
                reason: changeDetails.reason
            }];
        }

        const payload = JSON.parse(JSON.stringify({
            assessmentName: formData.assessmentName,
            siteId: formData.siteId,
            location: formData.location || '',
            date: formData.date,
            status: formData.status,
            team: formData.team,
            activities: cleanActivities,
            changeLogs: updatedLogs,
            docId,
            createdBy: formData.createdBy || session.name || session.email,
            updatedBy: formData.firebaseKey ? (session.name || session.email) : null,
            timestamp: formData.timestamp || new Date().toISOString()
        }));

        try {
            if (formData.firebaseKey) await dbUpdate(`organizations/${session.orgId}/riskAssessments/${formData.firebaseKey}`, payload);
            else await dbPush(`organizations/${session.orgId}/riskAssessments`, payload);

            alert('Risk Assessment Saved Successfully!');
            setShowChangeModal(false);
            setChangeDetails({ source: 'Annual Review', reason: '' });
            await refreshRiskAssessments(session.orgId);
            setView('list');
        } catch (error) {
            alert(`Save failed: ${error.message}`);
        }

        setSaving(false);
    };

    const deleteAssessment = async (firebaseKey) => {
        if (!permissions.canDelete) return alert('Security Error: Only Global Owners and Site Owners can delete Risk Assessments.');
        if (window.confirm('Permanently delete this Risk Assessment?')) {
            await dbRemove(`organizations/${session.orgId}/riskAssessments/${firebaseKey}`);
            setRepo((prev) => prev.filter((record) => record.firebaseKey !== firebaseKey));
        }
    };

    const exportExcel = () => {
        const dataToExport = [];
        filteredRepo.forEach((record) => {
            (record.activities || []).forEach((activity) => {
                (activity.hazards || []).forEach((hazard) => {
                    dataToExport.push({
                        'Doc ID': record.docId,
                        Assessment: record.assessmentName,
                        Site: record.siteId,
                        Date: record.date,
                        Status: record.status,
                        Activity: activity.name,
                        Category: hazard.category,
                        Hazard: hazard.subCategory,
                        Description: hazard.desc,
                        'Initial Risk (R1)': hazard.r1,
                        'Current Controls': (hazard.existingControls || []).map((control) => `[${control.type}] ${control.desc}`).join('; '),
                        'Residual Risk (R2)': hazard.r2,
                        'Additional Controls Needed?': (hazard.additionalControls && hazard.additionalControls.length > 0) ? 'Yes' : 'No',
                        ALARP: hazard.alarp ? 'Yes' : 'No'
                    });
                });
            });
        });
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HIRA_Export');
        XLSX.writeFile(wb, `HIRA_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const triggerPrint = (record) => {
        setPrintData(record);
        setTimeout(() => window.print(), 800);
    };

    return {
        CHANGE_SOURCES,
        activeUsers,
        alarpCount,
        allChangeLogs,
        canDeleteRecord,
        canEditForm,
        canEditRecord,
        changeDetails,
        deleteAssessment,
        downloadTemplate,
        exportExcel,
        filterSite,
        filterStatus,
        filteredVisibleSites,
        filteredRepo,
        formData,
        getRiskStyle,
        handleCategoryChange,
        handleExcelImport,
        handleRegionFilterChange,
        handleSiteFilterChange,
        handleSubCategoryChange,
        highRiskCount,
        importing,
        isGlobalUser,
        loading,
        openEditForm,
        openLogRecord,
        openNewForm,
        permissions,
        printData,
        processSave,
        regionFilter,
        regionOptions,
        removeActivity,
        removeHazard,
        removeTeam,
        saving,
        session,
        setChangeDetails,
        setFilterStatus,
        setFormData,
        setShowChangeModal,
        setView,
        showChangeModal,
        totalGlobalHazards,
        triggerPrint,
        updateActivityName,
        updateHazard,
        updateTeam,
        addActivity,
        addHazard,
        addTeamMember,
        view,
        visibleSites
    };
}
