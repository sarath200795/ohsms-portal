import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { dbUpdate, dbPush } from '../services/db/index.js';
import { readOrgChildren } from '../utils/orgData';
import {
    canDeleteForRole,
    canEditCreateForRole,
    getAllowedSiteCodes,
    hasAccessibleModule,
    isGlobalOwnerRole,
    isGlobalScopeUserRecord,
    isSiteOwnerRole
} from '../utils/permissions';
import { canAuthenticateStatus, readStoredSession } from '../utils/session';
import { buildRegionOptions, filterSitesByRegion, matchesRegionFilter, normalizeSites } from '../utils/siteRegions';
import CenterSelect from '../components/CenterSelect';

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

const NATURES_OF_INJURY = [
    "Abrasion / Scrape", "Amputation", "Burn (Thermal / Chemical)",
    "Concussion / Head Injury", "Contusion / Bruise", "Crushing Injury",
    "Dislocation", "Foreign Body in Eye", "Fracture / Broken Bone",
    "Laceration / Cut", "Puncture Wound", "Sprain / Strain"
];

const SPECIFIC_PARTS = [
    "Scalp", "Forehead", "Cornea", "Jaw", "Ear Canal",
    "Cervical Spine (Upper)", "Thoracic Spine (Mid)", "Lumbar Spine (Lower)",
    "Ribs", "Pelvis / Hip", "Clavicle (Collarbone)",
    "Bicep", "Tricep", "Forearm (Radius/Ulna)", "Wrist (Carpals)",
    "Palm", "Thumb", "Index Finger", "Middle Finger", "Ring Finger", "Pinky Finger",
    "Thigh (Femur)", "Knee (Patella)", "Shin (Tibia)", "Calf (Fibula)",
    "Ankle (Tarsals)", "Heel", "Big Toe", "Other Toes"
];

const SURVEILLANCE_TYPES = [
    "Pre-Employment Surveillance",
    "Periodic Surveillance",
    "Exposure Based Surveillance",
    "Symptom Based Surveillance",
    "Change Based Surveillance"
];

// =========================================================
// INTERACTIVE BODY MAP & HEATMAP COMPONENT
// =========================================================
const BodyMap = ({ selectedParts = [], onSelect, heatmapData = null }) => {
    const isHeatmap = heatmapData !== null;

    const points = [
        { id: 'Head', cx: 100, cy: 30, color: '#818cf8' },
        { id: 'Eye (L)', cx: 85, cy: 25, color: '#34d399' },
        { id: 'Eye (R)', cx: 115, cy: 25, color: '#34d399' },
        { id: 'Neck', cx: 100, cy: 65, color: '#a8a29e' },
        { id: 'Shoulder (R)', cx: 50, cy: 80, color: '#fb923c' },
        { id: 'Shoulder (L)', cx: 150, cy: 80, color: '#fb923c' },
        { id: 'Chest', cx: 100, cy: 110, color: '#fcd34d' },
        { id: 'Abdomen', cx: 100, cy: 160, color: '#60a5fa' },
        { id: 'Arm (R)', cx: 35, cy: 160, color: '#93c5fd' },
        { id: 'Arm (L)', cx: 165, cy: 160, color: '#93c5fd' },
        { id: 'Elbow (R)', cx: 30, cy: 210, color: '#4ade80' },
        { id: 'Elbow (L)', cx: 170, cy: 210, color: '#4ade80' },
        { id: 'Hand/Wrist (R)', cx: 20, cy: 260, color: '#f472b6' },
        { id: 'Hand/Wrist (L)', cx: 180, cy: 260, color: '#f472b6' },
        { id: 'Finger (R)', cx: 15, cy: 290, color: '#ca8a04' },
        { id: 'Finger (L)', cx: 185, cy: 290, color: '#ca8a04' },
        { id: 'Thigh (R)', cx: 70, cy: 270, color: '#f87171' },
        { id: 'Thigh (L)', cx: 130, cy: 270, color: '#f87171' },
        { id: 'Knee (R)', cx: 65, cy: 340, color: '#ef4444' },
        { id: 'Knee (L)', cx: 135, cy: 340, color: '#ef4444' },
        { id: 'Leg (R)', cx: 60, cy: 400, color: '#fda4af' },
        { id: 'Leg (L)', cx: 140, cy: 400, color: '#fda4af' },
        { id: 'Foot (R)', cx: 55, cy: 470, color: '#fde047' },
        { id: 'Foot (L)', cx: 145, cy: 470, color: '#fde047' },
    ];

    return (
        <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-inner body-map-wrapper p-6 flex justify-center items-center min-h-[450px] max-h-[650px] h-full w-full">
            <svg viewBox="0 0 200 500" className="w-auto h-full max-h-full max-w-full block drop-shadow-[0_0_15px_rgba(255,255,255,0.05)] overflow-visible">
                <path
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M100,10 C85,10 75,25 75,40 C75,55 85,60 90,65 C70,70 50,75 40,90 C35,110 30,150 25,200 C20,250 15,280 15,290 C15,295 20,295 25,290 C30,270 35,220 40,180 C45,230 55,270 60,330 C65,400 55,460 50,480 C48,490 70,490 75,480 C80,440 90,380 95,290 C100,290 100,290 105,290 C110,380 120,440 125,480 C130,490 152,490 150,480 C145,460 135,400 140,330 C145,270 155,230 160,180 C165,220 170,270 175,290 C180,295 185,295 185,290 C185,280 180,250 175,200 C170,150 165,110 160,90 C150,75 130,70 110,65 C115,60 125,55 125,40 C125,25 115,10 100,10 Z"
                />

                {points.map(pt => {
                    if (isHeatmap) {
                        const count = heatmapData[pt.id] || 0;
                        if (count > 0) {
                            return (
                                <g key={pt.id} style={{ pointerEvents: 'none' }}>
                                    <circle cx={pt.cx} cy={pt.cy} r={10 + (count > 5 ? 4 : count * 0.6)} fill="#e11d48" stroke="#fff" strokeWidth="2" className="shadow-lg drop-shadow-md" />
                                    <text x={pt.cx} y={pt.cy + 4} fontSize="11" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">{count}</text>
                                </g>
                            );
                        }
                        return <circle key={pt.id} cx={pt.cx} cy={pt.cy} r="6" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />;
                    }

                    const isSelected = selectedParts.includes(pt.id);
                    return (
                        <circle
                            key={pt.id}
                            cx={pt.cx}
                            cy={pt.cy}
                            r="8"
                            className={`cursor-pointer transition-all duration-200 hover:scale-125 hover:stroke-[3px] hover:fill-[#f43f5e] hover:stroke-[#fda4af] ${isSelected ? 'fill-[#e11d48] stroke-[#fecdd3] stroke-[3px] drop-shadow-[0_0_4px_rgba(225,29,72,0.6)]' : 'fill-[#1e293b] stroke-[#94a3b8] stroke-2'}`}
                            onClick={() => onSelect && onSelect(pt.id)}
                            style={isSelected ? { fill: pt.color, stroke: 'white' } : {}}
                        >
                            <title>{pt.id}</title>
                        </circle>
                    );
                })}
            </svg>
        </div>
    );
};

// =========================================================
// MAIN APP COMPONENT
// =========================================================
export default function HealthDashboard() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentTab, setCurrentTab] = useState('records');

    // Site Data & Users
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [regionFilter, setRegionFilter] = useState('All');
    const [illnessSeq] = useState(Math.floor(100000 + Math.random() * 900000));

    // Core Data States
    const [incidents, setIncidents] = useState([]);
    const [healthCases, setHealthCases] = useState({});
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [printCaseData, setPrintCaseData] = useState(null);

    const [surveillanceList, setSurveillanceList] = useState([]);
    const [selectedSurveillance, setSelectedSurveillance] = useState(null);
    const [printSurvData, setPrintSurvData] = useState(null);

    const [vaccinationList, setVaccinationList] = useState([]);
    const [selectedVaccination, setSelectedVaccination] = useState(null);
    const [printVaccData, setPrintVaccData] = useState(null);

    const [illnessList, setIllnessList] = useState([]);
    const [selectedIllness, setSelectedIllness] = useState(null);
    const [printIllnessData, setPrintIllnessData] = useState(null);

    // Analytics Filters
    const [dashboardFilter, setDashboardFilter] = useState('All');

    // RBAC State
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });

    // --- Form States ---
    const [formData, setFormData] = useState({
        natureOfInjury: '', tenure: '', empNameId: '', bodyPart: [], specBodyPart: '',
        firstAidDone: '', medicalReportBase64: null, medicalReportName: '',
        daysOnLeave: '', firstAidDoneBy: '', gender: ''
    });

    const [survForm, setSurvForm] = useState({
        id: '', firebaseKey: '', type: 'Periodic Surveillance', date: '', agent: '', campaignName: '', siteId: '', centerCode: '',
        testGroups: []
    });

    const [vaccForm, setVaccForm] = useState({
        id: '', firebaseKey: '', siteId: '', centerCode: '', date: '', vaccineName: '', dosage: 'Dose 1', provider: '',
        employees: []
    });

    const [illnessForm, setIllnessForm] = useState({
        id: '', firebaseKey: '', siteId: '', centerCode: '', date: '', time: '', empNameId: '',
        agent: '', exposurePeriod: '', healthIssue: '', impactedFunction: '', treatment: '',
        capa: []
    });

    const [newIllCapaAct, setNewIllCapaAct] = useState('');
    const [newIllCapaOwn, setNewIllCapaOwn] = useState('');
    const [newIllCapaDue, setNewIllCapaDue] = useState('');

    const myName = session?.name || session?.email || session?.user || 'Me';

    // Auth & Data Fetch
    useEffect(() => {
        const sess = readStoredSession();
        if (!sess || !canAuthenticateStatus(sess.status)) { navigate('/'); return; }

        // 1. STRICT MODULE GUARD (UPDATED to allow Site Owners/Managers)
        const isGlobalAdmin = isGlobalOwnerRole(sess.role);
        const isSiteAdmin = isSiteOwnerRole(sess.role);

        const hasModuleAccess = isGlobalAdmin || isSiteAdmin || hasAccessibleModule(sess.accessibleModules, 'OHS Tools');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission to access the Occupational Health module.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        // 2. STRICT RBAC MATRIX
        const canDel = canDeleteForRole(sess.role);
        const canEditCr = canEditCreateForRole(sess.role);

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
                const data = await readOrgChildren(null, sess.orgId, [
                    'sites',
                    'users',
                    'healthCases',
                    'incidents',
                    'healthSurveillance',
                    'vaccinationRecords',
                    'illnessRecords'
                ]);

                if (data.sites) {
                    setSites(normalizeSites(data.sites));
                }

                if (data.users) {
                    setUsers(Object.entries(data.users)
                        .map(([k, v]) => ({ id: k, name: v.name || v.email || 'System Owner', ...v }))
                        .filter(u => canAuthenticateStatus(u.status)));
                }

                const existingCases = data.healthCases || {};
                setHealthCases(existingCases);

                if (data.incidents) {
                    const injuryKeywords = ['first aid', 'medical treatment', 'lti', 'lost time', 'recordable', 'reportable', 'fatality', 'injury'];
                    const allIncs = Object.keys(data.incidents).map(k => ({ firebaseKey: k, ...data.incidents[k] }));

                    const filteredIncs = allIncs.filter(inc => {
                        const str = `${inc.severity || ''} ${inc.type || ''} ${inc.smartType || ''}`.toLowerCase();
                        return injuryKeywords.some(kw => str.includes(kw));
                    }).sort((a, b) => new Date(b.date) - new Date(a.date));

                    setIncidents(filteredIncs);
                }

                if (data.healthSurveillance) {
                    setSurveillanceList(safeArrayParse(data.healthSurveillance).sort((a, b) => new Date(b.date) - new Date(a.date)));
                }

                if (data.vaccinationRecords) {
                    setVaccinationList(safeArrayParse(data.vaccinationRecords).sort((a, b) => new Date(b.date) - new Date(a.date)));
                }

                if (data.illnessRecords) {
                    setIllnessList(safeArrayParse(data.illnessRecords).sort((a, b) => new Date(b.date) - new Date(a.date)));
                }
            } catch (e) { console.error("Data Load Error:", e); }
            finally { setLoading(false); }
        };

        loadData();
    }, [navigate, location]);

    // ==========================================
    // 4. ROW LEVEL SECURITY (RLS) & FILTERS
    // ==========================================
    const isGlobalUser = isGlobalOwnerRole(session?.role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        return getAllowedSiteCodes(session);
    }, [session]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const regionOptions = useMemo(() => buildRegionOptions(visibleSites), [visibleSites]);

    const filteredVisibleSites = useMemo(
        () => filterSitesByRegion(visibleSites, regionFilter),
        [visibleSites, regionFilter]
    );

    const canViewRecord = useCallback((siteId) => (
        isGlobalUser || allowedSiteCodes.has(siteId)
    ), [allowedSiteCodes, isGlobalUser]);

    const handleSiteFilterChange = (e) => {
        const newSite = e.target.value;
        setSiteFilter(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite === 'All' ? 'GLOBAL' : newSite);
    };

    useEffect(() => {
        if (siteFilter !== 'All' && !filteredVisibleSites.some((site) => site.code === siteFilter)) {
            setSiteFilter('All');
            sessionStorage.setItem('isoCurrentSite', 'GLOBAL');
        }
    }, [filteredVisibleSites, siteFilter]);

    const siteUsers = useMemo(() => {
        return users.filter(u => {
            const isGlobalUsr = isGlobalScopeUserRecord(u);
            const activeSiteId = survForm.siteId || vaccForm.siteId || illnessForm.siteId || siteFilter;
            const siteMatch = isGlobalUsr || !activeSiteId || activeSiteId === 'All' || u.assignedSite === activeSiteId || (u.accessibleSites && u.accessibleSites.includes(activeSiteId));
            return siteMatch;
        });
    }, [users, survForm.siteId, vaccForm.siteId, illnessForm.siteId, siteFilter]);

    const filteredIncidents = useMemo(() => {
        return incidents.filter(inc => {
            if (!canViewRecord(inc.siteId)) return false;
            if (regionFilter !== 'All' && !matchesRegionFilter(inc.siteId, visibleSites, regionFilter)) return false;
            if (siteFilter !== 'All' && inc.siteId !== siteFilter) return false;
            return true;
        });
    }, [incidents, siteFilter, canViewRecord, regionFilter, visibleSites]);

    const filteredSurveillance = useMemo(() => {
        return surveillanceList.filter(s => {
            if (!canViewRecord(s.siteId)) return false;
            if (regionFilter !== 'All' && !matchesRegionFilter(s.siteId, visibleSites, regionFilter)) return false;
            if (siteFilter !== 'All' && s.siteId !== siteFilter) return false;
            return true;
        });
    }, [surveillanceList, siteFilter, canViewRecord, regionFilter, visibleSites]);

    const filteredVaccination = useMemo(() => {
        return vaccinationList.filter(v => {
            if (!canViewRecord(v.siteId)) return false;
            if (regionFilter !== 'All' && !matchesRegionFilter(v.siteId, visibleSites, regionFilter)) return false;
            if (siteFilter !== 'All' && v.siteId !== siteFilter) return false;
            return true;
        });
    }, [vaccinationList, siteFilter, canViewRecord, regionFilter, visibleSites]);

    const filteredIllness = useMemo(() => {
        return illnessList.filter(i => {
            if (!canViewRecord(i.siteId)) return false;
            if (regionFilter !== 'All' && !matchesRegionFilter(i.siteId, visibleSites, regionFilter)) return false;
            if (siteFilter !== 'All' && i.siteId !== siteFilter) return false;
            return true;
        });
    }, [illnessList, siteFilter, canViewRecord, regionFilter, visibleSites]);

    const heatmapData = useMemo(() => {
        const counts = {};
        Object.keys(healthCases).forEach(key => {
            const inc = incidents.find(i => i.firebaseKey === key);
            if (!inc) return;
            if (!canViewRecord(inc.siteId)) return;
            if (regionFilter !== 'All' && !matchesRegionFilter(inc.siteId, visibleSites, regionFilter)) return;
            if (siteFilter !== 'All' && inc.siteId !== siteFilter) return;
            if (dashboardFilter !== 'All' && inc.type !== dashboardFilter) return;

            const caseData = healthCases[key];
            let parts = [];
            if (Array.isArray(caseData.bodyPart)) parts = caseData.bodyPart;
            else if (typeof caseData.bodyPart === 'string' && caseData.bodyPart) parts = [caseData.bodyPart];

            parts.forEach(p => {
                counts[p] = (counts[p] || 0) + 1;
            });
        });
        return counts;
    }, [healthCases, incidents, dashboardFilter, siteFilter, canViewRecord, regionFilter, visibleSites]);

    // ==========================================
    // INJURY CASE LOGIC
    // ==========================================
    const handleCardClick = (inc) => {
        setSelectedIncident(inc);
        setPrintCaseData(null);
        const existingCase = healthCases[inc.firebaseKey];

        if (existingCase) {
            let bp = existingCase.bodyPart || [];
            if (typeof bp === 'string') bp = bp ? [bp] : [];
            setFormData({ ...existingCase, bodyPart: bp });
        } else {
            setFormData({
                natureOfInjury: '', tenure: '', empNameId: '', bodyPart: [], specBodyPart: '',
                firstAidDone: '', medicalReportBase64: null, medicalReportName: '',
                daysOnLeave: '', firstAidDoneBy: '', gender: ''
            });
        }
    };

    const toggleBodyPart = (part) => {
        if (!permissions.canEditCreate) return;
        if (formData.bodyPart.includes(part)) {
            setFormData({ ...formData, bodyPart: formData.bodyPart.filter(p => p !== part) });
        } else {
            setFormData({ ...formData, bodyPart: [...formData.bodyPart, part] });
        }
    };

    const handleFile = async (e) => {
        if (!permissions.canEditCreate) return;
        const file = e.target.files[0];
        if (file) {
            const b64 = await fileToBase64(file);
            setFormData({ ...formData, medicalReportBase64: b64, medicalReportName: file.name });
        }
    };

    const handleSaveInjury = async () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to edit records.");
        if (!formData.empNameId || !formData.natureOfInjury) return alert("Employee Name/ID and Nature of Injury are required.");

        try {
            const payload = { ...formData, updatedAt: new Date().toISOString(), updatedBy: session.user || session.name };
            await dbUpdate(`organizations/${session.orgId}/healthCases/${selectedIncident.firebaseKey}`, payload);

            setHealthCases({ ...healthCases, [selectedIncident.firebaseKey]: payload });
            alert("Health Case Record Saved Successfully.");
            setSelectedIncident(null);
        } catch (e) { alert("Error saving case: " + e.message); }
    };

    const printInjury = () => {
        setPrintCaseData({ incident: selectedIncident, form: formData });
        setTimeout(() => window.print(), 200);
    };

    const isSerious = () => {
        if (!selectedIncident) return false;
        const str = `${selectedIncident.severity || ''} ${selectedIncident.type || ''}`.toLowerCase();
        return str.includes('lost time') || str.includes('lti') || str.includes('recordable') || str.includes('reportable');
    };

    // ==========================================
    // SURVEILLANCE LOGIC
    // ==========================================
    const openSurveillanceForm = (record = null) => {
        if (!record && !permissions.canEditCreate) return alert("Security Error: You do not have permission to create records.");

        setPrintSurvData(null);
        if (record) {
            let migratedRecord = { ...record };
            if (record.employees && !record.testGroups) {
                const groups = {};
                record.employees.forEach(emp => {
                    const tName = emp.testConducted || record.testPerformed || 'General Medical Test';
                    if (!groups[tName]) groups[tName] = [];
                    groups[tName].push(emp);
                });
                migratedRecord.testGroups = Object.keys(groups).map((k, i) => ({
                    id: Date.now() + i,
                    testName: k,
                    employees: groups[k]
                }));
                delete migratedRecord.employees;
            }
            if (!migratedRecord.testGroups) migratedRecord.testGroups = [];
            setSurvForm(migratedRecord);
        } else {
        const sId = (!isGlobalUser && filteredVisibleSites.length === 1) ? filteredVisibleSites[0].code : (siteFilter !== 'All' ? siteFilter : '');
            setSurvForm({
                id: `HSV-${Date.now().toString().slice(-6)}`, firebaseKey: '',
                type: 'Periodic Surveillance', date: new Date().toISOString().split('T')[0],
                agent: '', campaignName: '', siteId: sId,
                testGroups: [
                    { id: Date.now(), testName: 'General Checkup', employees: [{ empId: '', name: '', defectMetric: 'Normal', status: 'Fit for Duty', remarks: '' }] }
                ]
            });
        }
        setSelectedSurveillance(true);
    };

    const addTestGroup = () => { setSurvForm({ ...survForm, testGroups: [...(survForm.testGroups || []), { id: Date.now(), testName: '', employees: [] }] }); };
    const updateTestGroupName = (gIdx, name) => { const arr = [...survForm.testGroups]; arr[gIdx].testName = name; setSurvForm({ ...survForm, testGroups: arr }); };
    const removeTestGroup = (gIdx) => { setSurvForm({ ...survForm, testGroups: survForm.testGroups.filter((_, i) => i !== gIdx) }); };
    const addSurvEmployee = (gIdx) => { const arr = [...survForm.testGroups]; arr[gIdx].employees.push({ empId: '', name: '', defectMetric: 'Normal', status: 'Fit for Duty', remarks: '' }); setSurvForm({ ...survForm, testGroups: arr }); };
    const updateSurvEmployee = (gIdx, eIdx, field, val) => { const arr = [...survForm.testGroups]; arr[gIdx].employees[eIdx][field] = val; setSurvForm({ ...survForm, testGroups: arr }); };
    const removeSurvEmployee = (gIdx, eIdx) => { const arr = [...survForm.testGroups]; arr[gIdx].employees = arr[gIdx].employees.filter((_, i) => i !== eIdx); setSurvForm({ ...survForm, testGroups: arr }); };

    const handleSaveSurveillance = async () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to save records.");
        if (!survForm.agent || !survForm.siteId) return alert("Site and Agent Exposed To are required.");

        try {
            const payload = { ...survForm, createdBy: session.name || session.email, lastUpdated: new Date().toISOString() };
            if (survForm.firebaseKey) {
                await dbUpdate(`organizations/${session.orgId}/healthSurveillance/${survForm.firebaseKey}`, payload);
                setSurveillanceList(surveillanceList.map(s => s.firebaseKey === survForm.firebaseKey ? payload : s));
            } else {
                const newId = await dbPush(`organizations/${session.orgId}/healthSurveillance`, payload);
                payload.firebaseKey = newId;
                setSurveillanceList([payload, ...surveillanceList]);
            }
            alert("Surveillance Record Saved Successfully.");
            setSelectedSurveillance(null);
        } catch (e) { alert("Error saving record: " + e.message); }
    };

    const printSurveillance = () => {
        setPrintSurvData(survForm);
        setTimeout(() => window.print(), 200);
    };

    // ==========================================
    // VACCINATION LOGIC
    // ==========================================
    const openVaccinationForm = (record = null) => {
        if (!record && !permissions.canEditCreate) return alert("Security Error: You do not have permission to create records.");

        setPrintVaccData(null);
        if (record) {
            setVaccForm(record);
        } else {
        const sId = (!isGlobalUser && filteredVisibleSites.length === 1) ? filteredVisibleSites[0].code : (siteFilter !== 'All' ? siteFilter : '');
            setVaccForm({
                id: `VAC-${Date.now().toString().slice(-6)}`, firebaseKey: '',
                date: new Date().toISOString().split('T')[0],
                vaccineName: '', dosage: 'Dose 1', provider: '', siteId: sId,
                employees: [{ empId: '', name: '', status: 'Administered', remarks: '' }]
            });
        }
        setSelectedVaccination(true);
    };

    const addVaccEmployee = () => { setVaccForm({ ...vaccForm, employees: [...vaccForm.employees, { empId: '', name: '', status: 'Administered', remarks: '' }] }); };
    const updateVaccEmployee = (idx, field, val) => { const arr = [...vaccForm.employees]; arr[idx][field] = val; setVaccForm({ ...vaccForm, employees: arr }); };
    const removeVaccEmployee = (idx) => { setVaccForm({ ...vaccForm, employees: vaccForm.employees.filter((_, i) => i !== idx) }); };

    const handleSaveVaccination = async () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to save records.");
        if (!vaccForm.vaccineName || !vaccForm.siteId) return alert("Site and Vaccine Name are required.");

        try {
            const payload = { ...vaccForm, createdBy: session.name || session.email, lastUpdated: new Date().toISOString() };
            if (vaccForm.firebaseKey) {
                await dbUpdate(`organizations/${session.orgId}/vaccinationRecords/${vaccForm.firebaseKey}`, payload);
                setVaccinationList(vaccinationList.map(v => v.firebaseKey === vaccForm.firebaseKey ? payload : v));
            } else {
                const newId = await dbPush(`organizations/${session.orgId}/vaccinationRecords`, payload);
                payload.firebaseKey = newId;
                setVaccinationList([payload, ...vaccinationList]);
            }
            alert("Vaccination Record Saved Successfully.");
            setSelectedVaccination(null);
        } catch (e) { alert("Error saving vaccination record: " + e.message); }
    };

    const printVaccination = () => {
        setPrintVaccData(vaccForm);
        setTimeout(() => window.print(), 200);
    };

    // ==========================================
    // ILLNESS REPORT LOGIC
    // ==========================================
    useEffect(() => {
        if (session && currentTab === 'illness' && selectedIllness && !illnessForm.firebaseKey) {
            const sId = illnessForm.siteId || 'GEN';
            const newId = `${session.orgId}-${sId}-ILL-${illnessSeq}`;
            if (illnessForm.id !== newId) {
                setIllnessForm(prev => ({ ...prev, id: newId }));
            }
        }
    }, [currentTab, illnessForm.firebaseKey, illnessForm.id, illnessForm.siteId, illnessSeq, selectedIllness, session]);

    const openIllnessForm = (record = null) => {
        if (!record && !permissions.canEditCreate) return alert("Security Error: You do not have permission to create records.");

        setPrintIllnessData(null);
        if (record) {
            setIllnessForm(record);
        } else {
        const sId = (!isGlobalUser && filteredVisibleSites.length === 1) ? filteredVisibleSites[0].code : (siteFilter !== 'All' ? siteFilter : '');
            setIllnessForm({
                id: `${session.orgId}-${sId}-ILL-${illnessSeq}`, firebaseKey: '', siteId: sId,
                date: new Date().toISOString().split('T')[0], time: '', empNameId: '',
                agent: '', exposurePeriod: '', healthIssue: '', impactedFunction: '', treatment: '',
                capa: []
            });
        }
        setSelectedIllness(true);
    };

    const addIllnessCapa = () => {
        if (newIllCapaAct && newIllCapaOwn) {
            setIllnessForm({ ...illnessForm, capa: [...(illnessForm.capa || []), { act: newIllCapaAct, own: newIllCapaOwn, due: newIllCapaDue, status: 'Open' }] });
            setNewIllCapaAct(''); setNewIllCapaOwn(''); setNewIllCapaDue('');
        } else {
            alert("Action Description and Owner are required to add a CAPA.");
        }
    };
    const removeIllnessCapa = (idx) => {
        setIllnessForm({ ...illnessForm, capa: illnessForm.capa.filter((_, i) => i !== idx) });
    };
    const updateIllnessCapa = (idx, field, val) => {
        const arr = [...illnessForm.capa];
        arr[idx][field] = val;
        setIllnessForm({ ...illnessForm, capa: arr });
    };

    const handleSaveIllness = async () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to save records.");
        if (!illnessForm.empNameId || !illnessForm.healthIssue || !illnessForm.siteId) return alert("Site, Employee Name, and Health Issue are required.");

        try {
            const payload = { ...illnessForm, createdBy: session.name || session.email, lastUpdated: new Date().toISOString() };
            if (illnessForm.firebaseKey) {
                await dbUpdate(`organizations/${session.orgId}/illnessRecords/${illnessForm.firebaseKey}`, payload);
                setIllnessList(illnessList.map(i => i.firebaseKey === illnessForm.firebaseKey ? payload : i));
            } else {
                const newId = await dbPush(`organizations/${session.orgId}/illnessRecords`, payload);
                payload.firebaseKey = newId;
                setIllnessList([payload, ...illnessList]);
            }
            alert("Occupational Illness Record Saved Successfully.");
            setSelectedIllness(null);
        } catch (e) { alert("Error saving illness record: " + e.message); }
    };

    const printIllness = () => {
        setPrintIllnessData(illnessForm);
        setTimeout(() => window.print(), 200);
    };


    if (loading) return <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col font-['Space_Grotesk']"><i className="fas fa-circle-notch fa-spin text-4xl text-rose-500 mb-4"></i><h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Health Dashboard...</h2></div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Inter'] overflow-hidden">
            {/* Header */}
            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900 print:hidden flex-shrink-0">
                <div className="flex items-center gap-4 font-['Space_Grotesk']">
                    <button onClick={() => navigate(`/ohs-tools?site=${siteFilter}`)} className="text-slate-400 hover:text-white transition flex items-center gap-2"><i className="fas fa-arrow-left"></i> OHS Tools</button>
                    <div className="h-6 w-px bg-slate-700 mx-4"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-pink-600 flex items-center justify-center text-white font-bold shadow-lg shadow-rose-900/50"><i className="fas fa-heart-pulse"></i></div>
                    <h1 className="text-lg font-bold text-white tracking-wide">Occupational Health</h1>

                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-rose-500/10 text-rose-400 px-2 py-1 rounded border border-rose-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            {!selectedIncident && !selectedSurveillance && !selectedVaccination && !selectedIllness && (
                <div className="flex gap-3 px-8 pt-6 print:hidden bg-slate-950 flex-wrap border-b border-slate-800 pb-4 font-['Space_Grotesk']">
                    <button onClick={() => setCurrentTab('records')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentTab === 'records' ? 'bg-rose-600 text-white border-rose-500 shadow-rose-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-user-injured mr-2"></i> Injury Records</button>
                    <button onClick={() => setCurrentTab('illness')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentTab === 'illness' ? 'bg-amber-600 text-white border-amber-500 shadow-amber-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-head-side-cough mr-2"></i> Illness Reports</button>
                    <button onClick={() => setCurrentTab('surveillance')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentTab === 'surveillance' ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-stethoscope mr-2"></i> Surveillance</button>
                    <button onClick={() => setCurrentTab('vaccination')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentTab === 'vaccination' ? 'bg-cyan-600 text-white border-cyan-500 shadow-cyan-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-syringe mr-2"></i> Vaccination</button>
                    <button onClick={() => setCurrentTab('analytics')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border ${currentTab === 'analytics' ? 'bg-purple-600 text-white border-purple-500 shadow-purple-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-chart-line mr-2"></i> Analytics Map</button>
                </div>
            )}

            {!selectedIncident && !selectedSurveillance && !selectedVaccination && !selectedIllness && (
                <div className="px-8 pt-4 print:hidden bg-slate-950">
                    <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 font-['Space_Grotesk']">
                        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="bg-slate-950 border border-slate-700 text-white px-4 py-2.5 rounded-xl outline-none focus:border-rose-500 shadow-lg text-xs font-bold">
                            <option value="All">All Regions</option>
                            {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                        </select>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 self-center">Region filter applies across records and analytics.</div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto custom-scroll relative pb-20 print:hidden font-['Inter']">

                {/* TAB: INJURY RECORDS */}
                {!selectedIncident && !selectedSurveillance && !selectedVaccination && !selectedIllness && currentTab === 'records' && (
                    <div className="p-8 max-w-7xl mx-auto animate-fade-in font-['Space_Grotesk']">
                        <div className="mb-8 flex justify-between items-end">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Injury & Treatment Cases</h2>
                                <p className="text-sm text-slate-400 font-['Inter']">Manage medical records automatically linked to reported acute safety incidents.</p>
                            </div>
                            <div className="flex gap-4 text-sm font-bold items-center">
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none focus:border-rose-500 shadow-lg">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                                <div className="bg-slate-800 px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 shadow-lg">Total Cases: <span className="text-white text-lg ml-2">{filteredIncidents.length}</span></div>
                                <div className="bg-rose-900/30 px-5 py-2.5 rounded-xl border border-rose-500/50 text-rose-400 shadow-lg">Pending Eval: <span className="text-white text-lg ml-2">{filteredIncidents.filter(i => !healthCases[i.firebaseKey]).length}</span></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredIncidents.length === 0 ? <div className="col-span-full text-center py-16 text-slate-500 text-lg italic bg-slate-900/50 rounded-2xl border border-dashed border-slate-700">No injury-related incidents found for this site.</div> :
                                filteredIncidents.map((inc) => {
                                    const hasCase = !!healthCases[inc.firebaseKey];
                                    return (
                                        <div key={inc.firebaseKey} onClick={() => handleCardClick(inc)} className={`bg-slate-800/60 p-6 rounded-2xl cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl border-l-4 border border-slate-700 shadow-lg ${hasCase ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <span className="font-mono text-xs font-bold text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">{inc.docId || inc.id}</span>
                                                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${hasCase ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-rose-900/30 text-rose-400 border-rose-500/30 animate-pulse'}`}>{hasCase ? 'Case Recorded' : 'Pending Evaluation'}</span>
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-200 mb-4 line-clamp-2 leading-relaxed font-['Inter']">{inc.desc || inc.description || 'No Description provided for this incident.'}</h3>
                                            <div className="grid grid-cols-2 gap-3 text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
                                                <div className="flex items-center gap-2"><i className="far fa-calendar text-slate-500"></i> {inc.date}</div>
                                                <div className="flex items-center gap-2"><i className="fas fa-location-dot text-slate-500"></i> {inc.siteId || 'N/A'}</div>
                                                <div className="col-span-2 text-[10px] uppercase font-bold text-amber-400 flex items-center gap-2 mt-1"><i className="fas fa-exclamation-triangle"></i> {inc.type || inc.severity || 'Injury'}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* TAB: ILLNESS REPORTS */}
                {!selectedIncident && !selectedSurveillance && !selectedVaccination && !selectedIllness && currentTab === 'illness' && (
                    <div className="p-8 max-w-7xl mx-auto animate-fade-in font-['Space_Grotesk']">
                        <div className="mb-8 flex justify-between items-end">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Occupational Illness Reports</h2>
                                <p className="text-sm text-slate-400 font-['Inter']">Capture and monitor chronic health conditions resulting from workplace exposure.</p>
                            </div>
                            <div className="flex gap-4 text-sm font-bold items-center">
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none focus:border-amber-500 shadow-lg">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                                {permissions.canEditCreate && (
                                    <button onClick={() => openIllnessForm()} className="bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                                        <i className="fas fa-plus"></i> Log Illness Case
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-900/60 rounded-2xl overflow-hidden border border-slate-700 shadow-xl">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900 text-xs uppercase font-bold text-slate-500 border-b border-slate-700">
                                    <tr><th className="p-5">Ref ID</th><th className="p-5">Date Reported</th><th className="p-5">Site</th><th className="p-5">Employee</th><th className="p-5">Health Issue</th><th className="p-5">Agent Exposed</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                                    {filteredIllness.map((iRec, i) => (
                                        <tr key={i} onClick={() => openIllnessForm(iRec)} className="hover:bg-slate-800 cursor-pointer transition-colors">
                                            <td className="p-5 font-mono text-xs text-white font-bold">{iRec.id}</td>
                                            <td className="p-5">{iRec.date}</td>
                                            <td className="p-5">{iRec.siteId || 'Global'}</td>
                                            <td className="p-5 font-bold text-amber-300">{iRec.empNameId}</td>
                                            <td className="p-5 text-slate-200 font-medium">{iRec.healthIssue}</td>
                                            <td className="p-5 text-slate-400">{iRec.agent}</td>
                                        </tr>
                                    ))}
                                    {filteredIllness.length === 0 && <tr><td colSpan="6" className="p-10 text-center text-slate-500 italic text-lg border-t border-slate-800 font-['Inter']">No illness records found for this site.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB: HEALTH SURVEILLANCE */}
                {!selectedIncident && !selectedSurveillance && !selectedVaccination && !selectedIllness && currentTab === 'surveillance' && (
                    <div className="p-8 max-w-7xl mx-auto animate-fade-in font-['Space_Grotesk']">
                        <div className="mb-8 flex justify-between items-end">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Health & Medical Surveillance</h2>
                                <p className="text-sm text-slate-400 font-['Inter']">Track biological monitoring, exposure tests, and fitness to work statuses.</p>
                            </div>
                            <div className="flex gap-4 text-sm font-bold items-center">
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none focus:border-indigo-500 shadow-lg">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                                {permissions.canEditCreate && (
                                    <button onClick={() => openSurveillanceForm()} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                                        <i className="fas fa-plus"></i> New Surv. Record
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-900/60 rounded-2xl overflow-hidden border border-slate-700 shadow-xl">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900 text-xs uppercase font-bold text-slate-500 border-b border-slate-700">
                                    <tr><th className="p-5">Ref ID</th><th className="p-5">Date</th><th className="p-5">Site</th><th className="p-5">Type</th><th className="p-5">Campaign Name</th><th className="p-5 text-center">Employees Tested</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                                    {filteredSurveillance.map((s, i) => {
                                        const totalEmps = s.testGroups ? s.testGroups.reduce((acc, g) => acc + g.employees.length, 0) : (s.employees ? s.employees.length : 0);
                                        return (
                                            <tr key={i} onClick={() => openSurveillanceForm(s)} className="hover:bg-slate-800 cursor-pointer transition-colors">
                                                <td className="p-5 font-mono text-xs text-white font-bold">{s.id}</td>
                                                <td className="p-5">{s.date}</td>
                                                <td className="p-5">{s.siteId || 'Global'}</td>
                                                <td className="p-5 font-bold text-indigo-400">{s.type}</td>
                                                <td className="p-5 text-slate-300">{s.campaignName || s.testPerformed || 'General'}</td>
                                                <td className="p-5 text-center"><span className="bg-slate-800 border border-slate-600 px-3 py-1 rounded-full font-bold text-white">{totalEmps}</span></td>
                                            </tr>
                                        );
                                    })}
                                    {filteredSurveillance.length === 0 && <tr><td colSpan="6" className="p-10 text-center text-slate-500 italic text-lg border-t border-slate-800 font-['Inter']">No surveillance records found for this site.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB: VACCINATION */}
                {!selectedIncident && !selectedSurveillance && !selectedVaccination && !selectedIllness && currentTab === 'vaccination' && (
                    <div className="p-8 max-w-7xl mx-auto animate-fade-in font-['Space_Grotesk']">
                        <div className="mb-8 flex justify-between items-end">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Vaccination Records</h2>
                                <p className="text-sm text-slate-400 font-['Inter']">Track employee immunizations, doses, and booster campaigns.</p>
                            </div>
                            <div className="flex gap-4 text-sm font-bold items-center">
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-slate-900 border border-slate-600 text-white px-4 py-2.5 rounded-xl outline-none focus:border-cyan-500 shadow-lg">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                                {permissions.canEditCreate && (
                                    <button onClick={() => openVaccinationForm()} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                                        <i className="fas fa-plus"></i> Add Event
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-900/60 rounded-2xl overflow-hidden border border-slate-700 shadow-xl">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900 text-xs uppercase font-bold text-slate-500 border-b border-slate-700">
                                    <tr><th className="p-5">Ref ID</th><th className="p-5">Date</th><th className="p-5">Site</th><th className="p-5">Vaccine Name</th><th className="p-5">Dosage</th><th className="p-5 text-center">Employees</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                                    {filteredVaccination.map((v, i) => (
                                        <tr key={i} onClick={() => openVaccinationForm(v)} className="hover:bg-slate-800 cursor-pointer transition-colors">
                                            <td className="p-5 font-mono text-xs text-white font-bold">{v.id}</td>
                                            <td className="p-5">{v.date}</td>
                                            <td className="p-5">{v.siteId || 'Global'}</td>
                                            <td className="p-5 font-bold text-cyan-400">{v.vaccineName}</td>
                                            <td className="p-5 text-slate-300">{v.dosage}</td>
                                            <td className="p-5 text-center"><span className="bg-slate-800 border border-slate-600 px-3 py-1 rounded-full font-bold text-white">{(v.employees || []).length}</span></td>
                                        </tr>
                                    ))}
                                    {filteredVaccination.length === 0 && <tr><td colSpan="6" className="p-10 text-center text-slate-500 italic text-lg border-t border-slate-800 font-['Inter']">No vaccination records found for this site.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB: ANALYTICS */}
                {!selectedIncident && !selectedSurveillance && !selectedVaccination && !selectedIllness && currentTab === 'analytics' && (
                    <div className="p-8 max-w-7xl mx-auto animate-fade-in flex flex-col lg:flex-row gap-10 font-['Space_Grotesk']">
                        <div className="w-full lg:w-1/3">
                            <h2 className="text-3xl font-bold text-white mb-2">Impact Analytics</h2>
                            <p className="text-sm text-slate-400 mb-8 font-['Inter']">Visualize injury distribution across the human body map based on recorded health cases.</p>

                            <div className="bg-slate-800/80 p-6 rounded-2xl mb-8 border border-slate-700 shadow-lg">
                                <label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-wider">Filter by Site</label>
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="w-full mb-6 font-medium text-sm bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white outline-none">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>

                                <label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-wider">Filter by Injury Type</label>
                                <select value={dashboardFilter} onChange={e => setDashboardFilter(e.target.value)} className="w-full font-medium text-sm bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white outline-none">
                                    <option value="All">All Injuries</option>
                                    <option value="First Aid injury">First Aid</option>
                                    <option value="Lost Time injury">Lost Time (LTI)</option>
                                    <option value="Reportable Injury">Reportable</option>
                                </select>
                            </div>

                            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                <h3 className="font-bold text-white mb-5 border-b border-slate-800 pb-3 flex items-center gap-2"><i className="fas fa-fire text-rose-500"></i> Top Affected Zones</h3>
                                <ul className="space-y-3 font-['Inter']">
                                    {Object.entries(heatmapData).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([part, count]) => (
                                        <li key={part} className="flex justify-between items-center text-sm bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                                            <span className="text-slate-200 font-medium">{part}</span>
                                            <span className="bg-rose-900/50 text-rose-400 border border-rose-500/50 px-3 py-1 rounded-md font-bold text-xs">{count} Cases</span>
                                        </li>
                                    ))}
                                    {Object.keys(heatmapData).length === 0 && <li className="text-slate-500 italic text-sm p-4 text-center">No data available for current filter.</li>}
                                </ul>
                            </div>
                        </div>
                        <div className="w-full lg:w-2/3">
                            <BodyMap heatmapData={heatmapData} />
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* FORM VIEWS */}
                {/* ======================================================== */}

                {/* DETAIL VIEW / INJURY FORM */}
                {selectedIncident && (
                    <div className="p-6 md:p-8 animate-fade-in max-w-[1400px] mx-auto font-['Space_Grotesk']">
                        <button onClick={() => setSelectedIncident(null)} className="text-slate-400 hover:text-white mb-6 transition flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm"><i className="fas fa-arrow-left"></i> Back to Dashboard</button>

                        <div className="flex gap-8 flex-col xl:flex-row">

                            <div className="flex-1 space-y-8">
                                <div className="bg-slate-900 p-8 rounded-3xl border-t-4 border-rose-500 shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none"><i className="fas fa-link text-8xl text-rose-500"></i></div>
                                    <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6 relative z-10">
                                        <h2 className="text-xl font-bold text-white flex items-center gap-3"><i className="fas fa-paperclip text-rose-400"></i> Linked Incident Context</h2>
                                        <span className="font-mono text-xs font-bold text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner">{selectedIncident.docId || selectedIncident.id}</span>
                                    </div>
                                    <p className="text-sm text-slate-300 mb-6 bg-slate-950 p-5 rounded-xl border border-slate-800 italic leading-relaxed shadow-inner font-['Inter']">"{selectedIncident.desc || selectedIncident.description}"</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm relative z-10">
                                        <div><span className="block text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Date</span><span className="text-white font-mono font-medium">{selectedIncident.date}</span></div>
                                        <div><span className="block text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Time</span><span className="text-white font-mono font-medium">{selectedIncident.time || 'N/A'}</span></div>
                                        <div><span className="block text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Category</span><span className="text-amber-400 font-bold bg-amber-900/20 px-2 py-1 rounded border border-amber-500/30 text-[10px] uppercase tracking-widest">{selectedIncident.type || selectedIncident.severity}</span></div>
                                        <div><span className="block text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">CAPA Actions</span><span className="text-blue-400 font-bold">{selectedIncident.capa ? Object.keys(selectedIncident.capa).length : 0} Defined</span></div>
                                    </div>
                                </div>

                                <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700">
                                    <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-8">
                                        <h2 className="text-2xl font-bold text-rose-400 flex items-center gap-3"><i className="fas fa-notes-medical"></i> Injury Treatment Record</h2>
                                        <button onClick={printInjury} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition flex items-center gap-2 shadow"><i className="fas fa-print"></i> Print Record</button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">1. Nature of Injury</label>
                                            <select value={formData.natureOfInjury} onChange={e => setFormData({ ...formData, natureOfInjury: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none">
                                                <option value="">Select Category...</option>
                                                {NATURES_OF_INJURY.map(n => <option key={n} value={n}>{n}</option>)}
                                            </select>
                                        </div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">2. Employee Name / ID</label><input placeholder="John Doe (EMP-4521)" value={formData.empNameId} onChange={e => setFormData({ ...formData, empNameId: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none" /></div>

                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">3. Gender</label>
                                            <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none">
                                                <option value="">Select...</option><option>Male</option><option>Female</option><option>Other</option>
                                            </select>
                                        </div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">4. Employee Tenure (Years)</label><input type="number" placeholder="e.g. 2.5" value={formData.tenure} onChange={e => setFormData({ ...formData, tenure: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none" /></div>

                                        <div className="md:col-span-2 grid grid-cols-2 gap-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-700">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-rose-400 tracking-widest block mb-2 ml-1">5. Body Parts (Multi-Select Map)</label>
                                                <input placeholder="Click map to select..." value={formData.bodyPart.join(', ')} readOnly className="bg-slate-950 border-rose-900/50 text-rose-300 font-bold font-['Inter'] w-full rounded-lg p-3 outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">6. Specific Details</label>
                                                <input list="specific-parts" placeholder="Type or select specific part..." value={formData.specBodyPart} onChange={e => setFormData({ ...formData, specBodyPart: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none" />
                                                <datalist id="specific-parts">
                                                    {SPECIFIC_PARTS.map(p => <option key={p} value={p} />)}
                                                </datalist>
                                            </div>
                                        </div>

                                        <div className="md:col-span-2"><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">7. First Aid / Initial Treatment Done</label><textarea rows="3" className="resize-none font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none" placeholder="Describe the treatment provided on site..." value={formData.firstAidDone} onChange={e => setFormData({ ...formData, firstAidDone: e.target.value })} disabled={!permissions.canEditCreate}></textarea></div>

                                        <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">8. First Aid Administered By</label><input placeholder="Name of First Aider/Nurse" value={formData.firstAidDoneBy} onChange={e => setFormData({ ...formData, firstAidDoneBy: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none" /></div>

                                        {isSerious() && (
                                            <div className="md:col-span-2 mt-2 p-6 rounded-2xl bg-orange-900/20 border border-orange-500/30 shadow-inner">
                                                <h3 className="text-orange-400 font-bold text-sm uppercase tracking-wider mb-5 flex items-center"><i className="fas fa-hospital mr-2"></i> LTI / Recordable Medical Details</h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">9. Medical Report Upload</label>
                                                        <div className="bg-slate-900 p-2 rounded-lg border border-slate-700 flex items-center">
                                                            <input type="file" onChange={handleFile} disabled={!permissions.canEditCreate} className="text-xs text-slate-400 file:bg-orange-600 file:text-white file:border-none file:rounded-md file:px-4 file:py-1.5 file:mr-4 file:font-bold cursor-pointer bg-transparent border-none p-0 outline-none shadow-none font-['Inter']" />
                                                        </div>
                                                        {formData.medicalReportName && <div className="text-xs text-emerald-400 mt-2 font-medium flex items-center gap-1"><i className="fas fa-check-circle"></i> {formData.medicalReportName} attached</div>}
                                                    </div>
                                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">10. Number of Days on Leave / Restricted</label><input type="number" placeholder="Days..." value={formData.daysOnLeave} onChange={e => setFormData({ ...formData, daysOnLeave: e.target.value })} disabled={!permissions.canEditCreate} className="bg-slate-900 border-slate-700 font-['Inter'] w-full rounded-lg p-3 text-white outline-none" /></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {permissions.canEditCreate && (
                                        <div className="mt-10 pt-6 border-t border-slate-700 flex justify-end">
                                            <button onClick={handleSaveInjury} className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold py-3.5 px-10 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2 text-sm uppercase tracking-widest">
                                                <i className="fas fa-save"></i> Save Health Record
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="w-full xl:w-[400px]">
                                <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 h-full flex flex-col">
                                    <h2 className="text-lg font-bold text-slate-200 uppercase tracking-wider mb-2 text-center border-b border-slate-700 pb-3">Interactive Body Map</h2>
                                    <p className="text-xs text-slate-400 text-center mb-8 mt-2 font-['Inter']">Click on the model to select multiple impact zones</p>
                                    <BodyMap selectedParts={formData.bodyPart} onSelect={toggleBodyPart} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* DETAIL VIEW / ILLNESS FORM */}
                {selectedIllness && (
                    <div className="p-6 md:p-8 animate-fade-in max-w-5xl mx-auto font-['Space_Grotesk']">
                        <button onClick={() => setSelectedIllness(null)} className="text-slate-400 hover:text-white mb-6 transition flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm"><i className="fas fa-arrow-left"></i> Back to Dashboard</button>

                        <div className="bg-slate-800 p-10 rounded-3xl shadow-2xl border-t-4 border-amber-500">
                            <div className="flex justify-between items-center border-b border-slate-700 pb-6 mb-8">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3"><i className="fas fa-head-side-cough text-amber-500"></i> Occupational Illness Report</h2>
                                    <p className="text-xs text-slate-400 font-mono bg-slate-900 inline-block px-3 py-1.5 rounded-lg border border-slate-700">Record ID: {illnessForm.id}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {permissions.canEditCreate && (
                                        <button onClick={handleSaveIllness} className="bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-lg transition flex items-center gap-2"><i className="fas fa-save"></i> Save</button>
                                    )}
                                    <button onClick={printIllness} className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg"><i className="fas fa-print"></i> Print Report</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Site</label>
                                    <select value={illnessForm.siteId} onChange={e => setIllnessForm({ ...illnessForm, siteId: e.target.value, centerCode: '' })} disabled={!permissions.canEditCreate} className="font-bold text-slate-200 font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-amber-500">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="">Select Site...</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <CenterSelect
                                        sites={filteredVisibleSites}
                                        siteCode={illnessForm.siteId}
                                        value={illnessForm.centerCode}
                                        onChange={(code) => setIllnessForm({ ...illnessForm, centerCode: code })}
                                        disabled={!permissions.canEditCreate}
                                        label="Center / Point"
                                        className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-amber-500"
                                    />
                                </div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Employee Name / ID</label><input placeholder="e.g. John Doe (EMP-123)" value={illnessForm.empNameId} onChange={e => setIllnessForm({ ...illnessForm, empNameId: e.target.value })} disabled={!permissions.canEditCreate} className="font-bold text-amber-300 border-amber-900/50 font-['Inter'] w-full bg-slate-950 rounded-lg p-3 outline-none focus:border-amber-500" /></div>

                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Date Reported</label><input type="date" value={illnessForm.date} onChange={e => setIllnessForm({ ...illnessForm, date: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] font-mono w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-amber-500 text-white" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Time Reported</label><input type="time" value={illnessForm.time} onChange={e => setIllnessForm({ ...illnessForm, time: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] font-mono w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-amber-500 text-white" /></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 bg-slate-900/60 p-8 rounded-2xl border border-slate-700 shadow-inner">
                                <div><label className="text-[10px] uppercase font-bold text-amber-400 tracking-widest block mb-2 ml-1">Exposed To Agent</label><input placeholder="e.g. Silica Dust, Loud Noise, Solvents" value={illnessForm.agent} onChange={e => setIllnessForm({ ...illnessForm, agent: e.target.value })} disabled={!permissions.canEditCreate} className="border-amber-900/50 focus:border-amber-500 text-amber-100 font-['Inter'] w-full bg-slate-950 rounded-lg p-3 outline-none" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Period of Exposure</label><input placeholder="e.g. 5 Years, 6 Months" value={illnessForm.exposurePeriod} onChange={e => setIllnessForm({ ...illnessForm, exposurePeriod: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-amber-500" /></div>

                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Health Issue Triggered</label><input placeholder="e.g. Occupational Asthma, NIHL" value={illnessForm.healthIssue} onChange={e => setIllnessForm({ ...illnessForm, healthIssue: e.target.value })} disabled={!permissions.canEditCreate} className="font-bold text-white border-slate-600 font-['Inter'] w-full bg-slate-950 rounded-lg p-3 outline-none focus:border-amber-500" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Impacted Body Function / Part</label><input placeholder="e.g. Lung Capacity, Hearing" value={illnessForm.impactedFunction} onChange={e => setIllnessForm({ ...illnessForm, impactedFunction: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-amber-500" /></div>

                                <div className="col-span-1 md:col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Treatment for the Illness / Medical Action Plan</label>
                                    <textarea rows="4" className="resize-none font-['Inter'] custom-scroll w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-amber-500" placeholder="Detail the medical treatment prescribed or workplace adjustments made (e.g. reassignment to non-noise area)..." value={illnessForm.treatment} onChange={e => setIllnessForm({ ...illnessForm, treatment: e.target.value })} disabled={!permissions.canEditCreate}></textarea>
                                </div>
                            </div>

                            {/* CAPA SECTION FOR ILLNESS */}
                            <div className="mb-8">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-list-check"></i> Corrective & Preventive Actions (CAPA)</h3>
                                </div>

                                {permissions.canEditCreate && (
                                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-inner mb-6">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="md:col-span-2"><input value={newIllCapaAct} onChange={e => setNewIllCapaAct(e.target.value)} placeholder="Action required to prevent aggravation/recurrence..." className="font-['Inter'] text-sm w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500" /></div>
                                            <div>
                                                <select value={newIllCapaOwn} onChange={e => setNewIllCapaOwn(e.target.value)} className="font-['Inter'] text-sm font-bold text-blue-300 w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-orange-500">
                                                    <option value="">Assign Owner...</option>
                                                    <option value={myName} className="bg-slate-800 text-amber-400 font-bold">➡️ Assign to Me</option>
                                                    {siteUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <input type="date" value={newIllCapaDue} onChange={e => setNewIllCapaDue(e.target.value)} className="font-['Inter'] text-sm font-mono w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-orange-500" />
                                                <button onClick={addIllnessCapa} className="bg-orange-600 hover:bg-orange-500 text-white px-5 rounded-lg font-bold shadow transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
                                    <table className="w-full text-left text-sm text-slate-300 font-['Inter']">
                                        <thead className="bg-slate-900 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-700 tracking-widest">
                                            <tr><th className="p-4 pl-5">Action</th><th className="p-4 w-48">Owner</th><th className="p-4 w-40">Due Date</th><th className="p-4 w-36">Status</th><th className="p-4 w-12"></th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 bg-slate-950">
                                            {(illnessForm.capa || []).map((c, i) => (
                                                <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                                    <td className="p-3 pl-5"><input className="bg-transparent border-b border-transparent focus:border-orange-500 text-sm py-1.5 px-2 outline-none w-full text-white" value={c.act} onChange={e => updateIllnessCapa(i, 'act', e.target.value)} disabled={!permissions.canEditCreate} /></td>
                                                    <td className="p-3 font-bold">
                                                        <select value={c.own} onChange={e => updateIllnessCapa(i, 'own', e.target.value)} disabled={!permissions.canEditCreate} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-bold text-blue-300 outline-none focus:border-orange-500 w-full shadow-inner">
                                                            <option value="">Owner...</option>
                                                            {siteUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="p-3"><input type="date" className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-orange-500 font-mono shadow-inner w-full" value={c.due} onChange={e => updateIllnessCapa(i, 'due', e.target.value)} disabled={!permissions.canEditCreate} /></td>
                                                    <td className="p-3">
                                                        <select value={c.status} onChange={e => updateIllnessCapa(i, 'status', e.target.value)} disabled={!permissions.canEditCreate} className={`bg-slate-900 text-xs px-2 py-2 rounded-lg outline-none border shadow-inner focus:border-orange-500 font-bold w-full uppercase tracking-wider ${c.status === 'Closed' ? 'text-emerald-400 border-emerald-500/30' : c.status === 'In Progress' ? 'text-blue-400 border-blue-500/30' : 'text-orange-400 border-orange-500/30'}`}>
                                                            <option>Open</option><option>In Progress</option><option>Closed</option>
                                                        </select>
                                                    </td>
                                                    <td className="p-3 text-center">{permissions.canEditCreate && <button onClick={() => removeIllnessCapa(i)} className="text-red-500 hover:text-white transition-colors bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"><i className="fas fa-trash-alt"></i></button>}</td>
                                                </tr>
                                            ))}
                                            {(!illnessForm.capa || illnessForm.capa.length === 0) && <tr><td colSpan="5" className="p-8 text-center text-slate-500 italic">No CAPA items recorded for this illness.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {permissions.canEditCreate && (
                                <div className="flex justify-end pt-8 border-t border-slate-700">
                                    <button onClick={handleSaveIllness} className="bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white font-bold py-3.5 px-12 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-3 text-sm uppercase tracking-widest">
                                        <i className="fas fa-save text-lg"></i> Save Illness Report
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* DETAIL VIEW / SURVEILLANCE FORM */}
                {selectedSurveillance && (
                    <div className="p-6 md:p-8 animate-fade-in max-w-6xl mx-auto font-['Space_Grotesk']">
                        <button onClick={() => setSelectedSurveillance(null)} className="text-slate-400 hover:text-white mb-6 transition flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm"><i className="fas fa-arrow-left"></i> Back to Dashboard</button>

                        <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border-t-4 border-indigo-500">
                            <div className="flex justify-between items-center border-b border-slate-700 pb-5 mb-8">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3"><i className="fas fa-stethoscope text-indigo-400"></i> Medical Surveillance Event</h2>
                                    <p className="text-xs text-slate-400 font-mono bg-slate-900 inline-block px-3 py-1.5 rounded-lg border border-slate-700">Record ID: {survForm.id}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {permissions.canEditCreate && (
                                        <button onClick={handleSaveSurveillance} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-lg transition flex items-center gap-2"><i className="fas fa-save"></i> Save</button>
                                    )}
                                    <button onClick={printSurveillance} className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg"><i className="fas fa-print"></i> Print Roster</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Site</label>
                                    <select value={survForm.siteId} onChange={e => setSurvForm({ ...survForm, siteId: e.target.value, centerCode: '' })} disabled={!permissions.canEditCreate} className="font-bold text-white font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-indigo-500">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="">Select Site...</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <CenterSelect
                                        sites={filteredVisibleSites}
                                        siteCode={survForm.siteId}
                                        value={survForm.centerCode}
                                        onChange={(code) => setSurvForm({ ...survForm, centerCode: code })}
                                        disabled={!permissions.canEditCreate}
                                        label="Center / Point"
                                        className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Surveillance Type</label>
                                    <select value={survForm.type} onChange={e => setSurvForm({ ...survForm, type: e.target.value })} disabled={!permissions.canEditCreate} className="font-bold text-indigo-300 border-indigo-900/50 font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-indigo-500">
                                        {SURVEILLANCE_TYPES.map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Date</label><input type="date" value={survForm.date} onChange={e => setSurvForm({ ...survForm, date: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] font-mono w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Agent Exposed To</label><input placeholder="e.g. Noise, Silica, Lead" value={survForm.agent} onChange={e => setSurvForm({ ...survForm, agent: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] font-bold text-white w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-indigo-500" /></div>
                                <div className="col-span-2 md:col-span-4"><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Campaign Name / Context</label><input placeholder="e.g. Annual Factory Noise Assessment" value={survForm.campaignName} onChange={e => setSurvForm({ ...survForm, campaignName: e.target.value })} disabled={!permissions.canEditCreate} className="font-bold text-white text-base font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-indigo-500" /></div>
                            </div>

                            <div className="mb-6">
                                <h3 className="font-bold text-lg text-white mb-2 uppercase tracking-wider">Test Groups & Employee Roster</h3>
                                <p className="text-sm text-slate-400 mb-6 font-['Inter']">Group employees by the specific medical test performed (e.g. Audiometry, Spirometry).</p>

                                {(survForm.testGroups || []).map((group, gIdx) => (
                                    <div key={group.id} className="mb-8 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl animate-fade-in bg-slate-900 relative">
                                        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
                                        <div className="bg-slate-800/80 p-5 flex justify-between items-center border-b border-slate-700 flex-wrap gap-4 pl-8">
                                            <div className="flex items-center gap-3 flex-1 min-w-[300px]">
                                                <div className="bg-indigo-900/50 w-10 h-10 rounded-xl flex items-center justify-center border border-indigo-500/30 shadow-inner"><i className="fas fa-vial text-indigo-400 text-xl"></i></div>
                                                <input value={group.testName} onChange={e => updateTestGroupName(gIdx, e.target.value)} disabled={!permissions.canEditCreate} placeholder="Enter Test Type (e.g. Audiometry, Vision, Blood Lead)..." className="bg-slate-950 border border-slate-600 text-base p-3 rounded-xl text-white font-bold w-full focus:border-indigo-500 outline-none shadow-inner font-['Inter'] transition-colors" />
                                            </div>
                                            {permissions.canEditCreate && (
                                                <div className="flex gap-3">
                                                    <button onClick={() => addSurvEmployee(gIdx)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition shadow-lg flex items-center gap-2"><i className="fas fa-user-plus"></i> Add Employee</button>
                                                    <button onClick={() => removeTestGroup(gIdx)} className="bg-slate-950 hover:bg-red-600 text-slate-400 hover:text-white w-12 h-12 rounded-xl text-sm font-bold transition border border-slate-700 hover:border-red-500 shadow flex items-center justify-center"><i className="fas fa-trash-alt"></i></button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="overflow-x-auto p-5 pl-8 custom-scroll">
                                            <table className="w-full text-left text-sm font-['Inter']">
                                                <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                                                    <tr>
                                                        <th className="p-4 pl-5 w-48 rounded-tl-xl">Employee Name</th>
                                                        <th className="p-4 w-32">Emp ID</th>
                                                        <th className="p-4 w-48">Test Result (Defect)</th>
                                                        <th className="p-4 w-48">Fitness Status</th>
                                                        <th className="p-4 rounded-tr-xl">Doctor Remarks</th>
                                                        <th className="p-4 w-12 text-center"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                                                    {group.employees.map((emp, eIdx) => (
                                                        <tr key={eIdx} className="hover:bg-slate-800/50 transition-colors">
                                                            <td className="p-3 pl-5"><input placeholder="Name..." value={emp.name} onChange={e => updateSurvEmployee(gIdx, eIdx, 'name', e.target.value)} disabled={!permissions.canEditCreate} className="bg-transparent border-b border-transparent focus:border-indigo-500 text-sm py-1.5 px-2 w-full font-bold text-white outline-none transition-colors" /></td>
                                                            <td className="p-3"><input placeholder="ID..." value={emp.empId} onChange={e => updateSurvEmployee(gIdx, eIdx, 'empId', e.target.value)} disabled={!permissions.canEditCreate} className="bg-transparent border-b border-transparent focus:border-indigo-500 text-sm py-1.5 px-2 w-full font-mono text-slate-300 outline-none transition-colors" /></td>
                                                            <td className="p-3">
                                                                <select value={emp.defectMetric} onChange={e => updateSurvEmployee(gIdx, eIdx, 'defectMetric', e.target.value)} disabled={!permissions.canEditCreate} className={`bg-slate-900 border border-slate-700 rounded-lg p-2.5 w-full text-xs font-bold outline-none focus:border-indigo-500 shadow-inner ${emp.defectMetric === 'Normal' ? 'text-emerald-400' : emp.defectMetric === 'Minor Abnormality' ? 'text-yellow-400' : 'text-rose-500'}`}>
                                                                    <option>Normal</option><option>Minor Abnormality</option><option>Significant Abnormality</option>
                                                                </select>
                                                            </td>
                                                            <td className="p-3">
                                                                <select value={emp.status} onChange={e => updateSurvEmployee(gIdx, eIdx, 'status', e.target.value)} disabled={!permissions.canEditCreate} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 w-full text-xs font-bold text-white outline-none focus:border-indigo-500 shadow-inner">
                                                                    <option>Fit for Duty</option><option>Fit with Restrictions</option><option>Temporarily Unfit</option><option>Permanently Unfit</option>
                                                                </select>
                                                            </td>
                                                            <td className="p-3"><input placeholder="Action required..." value={emp.remarks} onChange={e => updateSurvEmployee(gIdx, eIdx, 'remarks', e.target.value)} disabled={!permissions.canEditCreate} className="bg-transparent border-b border-transparent focus:border-indigo-500 text-sm py-1.5 px-2 w-full text-slate-300 outline-none transition-colors" /></td>
                                                            <td className="p-3 text-center">{permissions.canEditCreate && <button onClick={() => removeSurvEmployee(gIdx, eIdx)} className="text-red-500 hover:text-white transition-colors bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"><i className="fas fa-trash-alt"></i></button>}</td>
                                                        </tr>
                                                    ))}
                                                    {group.employees.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500 italic text-sm">No employees assigned to this test.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}

                                {permissions.canEditCreate && (
                                    <button onClick={addTestGroup} className="mb-4 bg-slate-900/50 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 border-2 border-indigo-500/30 border-dashed px-6 py-6 rounded-3xl text-sm uppercase tracking-widest font-bold w-full transition-all flex items-center justify-center gap-3 shadow-inner">
                                        <i className="fas fa-plus-circle text-2xl"></i> Add Another Test Type Group
                                    </button>
                                )}
                            </div>

                            {permissions.canEditCreate && (
                                <div className="flex justify-end pt-8 border-t border-slate-700">
                                    <button onClick={handleSaveSurveillance} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 px-12 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-3 text-sm uppercase tracking-widest">
                                        <i className="fas fa-save text-lg"></i> Save Surveillance Data
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* DETAIL VIEW / VACCINATION FORM */}
                {selectedVaccination && (
                    <div className="p-6 md:p-8 animate-fade-in max-w-6xl mx-auto font-['Space_Grotesk']">
                        <button onClick={() => setSelectedVaccination(null)} className="text-slate-400 hover:text-white mb-6 transition flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm"><i className="fas fa-arrow-left"></i> Back to Dashboard</button>

                        <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border-t-4 border-cyan-500">
                            <div className="flex justify-between items-center border-b border-slate-700 pb-6 mb-8">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3"><i className="fas fa-syringe text-cyan-400"></i> Vaccination Record Event</h2>
                                    <p className="text-xs text-slate-400 font-mono bg-slate-900 inline-block px-3 py-1.5 rounded-lg border border-slate-700">Record ID: {vaccForm.id}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {permissions.canEditCreate && (
                                        <button onClick={handleSaveVaccination} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-lg transition flex items-center gap-2"><i className="fas fa-save"></i> Save</button>
                                    )}
                                    <button onClick={printVaccination} className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg"><i className="fas fa-print"></i> Print Register</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Site</label>
                                    <select value={vaccForm.siteId} onChange={e => setVaccForm({ ...vaccForm, siteId: e.target.value, centerCode: '' })} disabled={!permissions.canEditCreate} className="font-bold text-white font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-cyan-500">
                                    {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="">Select Site...</option>}
                                    {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <CenterSelect
                                        sites={filteredVisibleSites}
                                        siteCode={vaccForm.siteId}
                                        value={vaccForm.centerCode}
                                        onChange={(code) => setVaccForm({ ...vaccForm, centerCode: code })}
                                        disabled={!permissions.canEditCreate}
                                        label="Center / Point"
                                        className="font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-cyan-500"
                                    />
                                </div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Date</label><input type="date" value={vaccForm.date} onChange={e => setVaccForm({ ...vaccForm, date: e.target.value })} disabled={!permissions.canEditCreate} className="font-['Inter'] font-mono w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-cyan-500" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Vaccine Name</label><input placeholder="e.g. Tetanus, Hep B, Flu" value={vaccForm.vaccineName} onChange={e => setVaccForm({ ...vaccForm, vaccineName: e.target.value })} disabled={!permissions.canEditCreate} className="font-bold text-cyan-300 border-cyan-900/50 focus:border-cyan-500 font-['Inter'] w-full bg-slate-950 rounded-lg p-3 outline-none" /></div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Dosage / Sequence</label>
                                    <select value={vaccForm.dosage} onChange={e => setVaccForm({ ...vaccForm, dosage: e.target.value })} disabled={!permissions.canEditCreate} className="font-bold text-slate-200 font-['Inter'] w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-cyan-500">
                                        <option>Dose 1</option><option>Dose 2</option><option>Dose 3</option><option>Booster</option><option>Annual Renewal</option>
                                    </select>
                                </div>
                                <div className="col-span-2 md:col-span-4"><label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-2 ml-1">Healthcare Provider / Clinic</label><input placeholder="e.g. City General Hospital / Dr. Smith" value={vaccForm.provider} onChange={e => setVaccForm({ ...vaccForm, provider: e.target.value })} disabled={!permissions.canEditCreate} className="font-bold text-white font-['Inter'] text-base p-3.5 w-full bg-slate-950 border border-slate-700 rounded-lg outline-none focus:border-cyan-500" /></div>
                            </div>

                            <div className="mb-6 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl bg-slate-900 relative">
                                <div className="absolute top-0 left-0 w-2 h-full bg-cyan-500"></div>
                                <div className="bg-slate-800/80 p-6 flex justify-between items-center border-b border-slate-700 pl-8">
                                    <h3 className="font-bold text-lg text-white uppercase tracking-wider flex items-center gap-3"><i className="fas fa-users-medical text-cyan-400 text-2xl"></i> Employee Immunization Roster</h3>
                                    {permissions.canEditCreate && <button onClick={addVaccEmployee} className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition shadow-lg flex items-center gap-2"><i className="fas fa-plus"></i> Add Employee</button>}
                                </div>

                                <div className="overflow-x-auto p-6 pl-8 custom-scroll">
                                    <table className="w-full text-left text-sm font-['Inter']">
                                        <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                                            <tr>
                                                <th className="p-4 pl-5 w-64 rounded-tl-xl">Employee Name</th>
                                                <th className="p-4 w-40">Emp ID</th>
                                                <th className="p-4 w-48">Administration Status</th>
                                                <th className="p-4 rounded-tr-xl">Clinical Remarks / Batch No.</th>
                                                <th className="p-4 w-12 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                                            {vaccForm.employees.map((emp, i) => (
                                                <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                                    <td className="p-3 pl-5"><input placeholder="Name..." value={emp.name} onChange={e => updateVaccEmployee(i, 'name', e.target.value)} disabled={!permissions.canEditCreate} className="bg-transparent border-b border-transparent focus:border-cyan-500 text-sm py-1.5 px-2 w-full font-bold text-white outline-none transition-colors" /></td>
                                                    <td className="p-3"><input placeholder="ID..." value={emp.empId} onChange={e => updateVaccEmployee(i, 'empId', e.target.value)} disabled={!permissions.canEditCreate} className="bg-transparent border-b border-transparent focus:border-cyan-500 text-sm py-1.5 px-2 w-full font-mono text-slate-300 outline-none transition-colors" /></td>
                                                    <td className="p-3">
                                                        <select value={emp.status} onChange={e => updateVaccEmployee(i, 'status', e.target.value)} disabled={!permissions.canEditCreate} className={`bg-slate-900 border border-slate-700 rounded-lg p-2.5 w-full text-xs font-bold outline-none focus:border-cyan-500 shadow-inner ${emp.status === 'Administered' ? 'text-emerald-400' : emp.status === 'Refused (Sign Waiver)' ? 'text-rose-500' : 'text-yellow-400'}`}>
                                                            <option>Administered</option><option>Pending</option><option>Refused (Sign Waiver)</option><option>Medical Exemption</option>
                                                        </select>
                                                    </td>
                                                    <td className="p-3"><input placeholder="Batch No. or specific notes..." value={emp.remarks} onChange={e => updateVaccEmployee(i, 'remarks', e.target.value)} disabled={!permissions.canEditCreate} className="bg-transparent border-b border-transparent focus:border-cyan-500 text-sm py-1.5 px-2 w-full text-slate-300 outline-none transition-colors" /></td>
                                                    <td className="p-3 text-center">{permissions.canEditCreate && <button onClick={() => removeVaccEmployee(i)} className="text-red-500 hover:text-white transition-colors bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"><i className="fas fa-trash-alt"></i></button>}</td>
                                                </tr>
                                            ))}
                                            {vaccForm.employees.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-slate-500 italic text-sm">No employees added to this vaccination event.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {permissions.canEditCreate && (
                                <div className="flex justify-end pt-8 border-t border-slate-700">
                                    <button onClick={handleSaveVaccination} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-12 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-3 text-sm uppercase tracking-widest">
                                        <i className="fas fa-save text-lg"></i> Save Vaccination Record
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* PRINT VIEW LAYERS */}
                {/* ======================================================== */}

                {/* PRINT: INJURY CASE */}
                {printCaseData && (
                    <div className="hidden print:block p-8 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <div className="text-center border-b-2 border-black pb-4 mb-6">
                            <h1 className="text-2xl font-black uppercase m-0">Occupational Health & Injury Record</h1>
                            <p className="text-sm">Confidential Medical Data Linkage</p>
                        </div>

                        <div className="mb-6 p-4 border border-black bg-gray-50">
                            <h2 className="text-sm font-bold mb-2 uppercase bg-gray-200 inline-block p-1 border border-gray-400">Incident Context</h2>
                            <table className="w-full text-sm border-none mb-2">
                                <tbody>
                                    <tr>
                                        <td className="w-[15%] font-bold py-1">Ref ID:</td><td className="w-[35%] py-1">{printCaseData.incident.docId || printCaseData.incident.id}</td>
                                        <td className="w-[15%] font-bold py-1">Category:</td><td className="w-[35%] py-1">{printCaseData.incident.type || printCaseData.incident.severity}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] font-bold py-1">Date/Time:</td><td className="w-[35%] py-1">{printCaseData.incident.date} {printCaseData.incident.time}</td>
                                        <td className="w-[15%] font-bold py-1">Site:</td><td className="w-[35%] py-1">{printCaseData.incident.siteId || 'N/A'}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="text-sm italic">"{printCaseData.incident.desc || printCaseData.incident.description}"</div>
                        </div>

                        <div className="mb-6">
                            <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 inline-block p-1 border border-gray-400">Patient & Injury Details</h2>
                            <table className="w-full border-collapse border border-black text-sm">
                                <tbody>
                                    <tr><th className="border border-black p-2 w-[25%] bg-gray-100">Name / ID</th><td className="border border-black p-2">{printCaseData.form.empNameId}</td><th className="border border-black p-2 w-[20%] bg-gray-100">Gender</th><td className="border border-black p-2">{printCaseData.form.gender}</td></tr>
                                    <tr><th className="border border-black p-2 bg-gray-100">Tenure</th><td className="border border-black p-2">{printCaseData.form.tenure} Years</td><th className="border border-black p-2 bg-gray-100">Nature of Injury</th><td className="border border-black p-2">{printCaseData.form.natureOfInjury}</td></tr>
                                    <tr><th className="border border-black p-2 bg-gray-100">Mapped Area(s)</th><td className="border border-black p-2">{(printCaseData.form.bodyPart || []).join(', ')}</td><th className="border border-black p-2 bg-gray-100">Specific Part</th><td className="border border-black p-2">{printCaseData.form.specBodyPart}</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="mb-6">
                            <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 inline-block p-1 border border-gray-400">Treatment & Impact</h2>
                            <table className="w-full border-collapse border border-black text-sm mb-4">
                                <tbody>
                                    <tr><th className="border border-black p-2 w-[25%] bg-gray-100">Initial Treatment</th><td className="border border-black p-2">{printCaseData.form.firstAidDone || 'None documented.'}</td></tr>
                                    <tr><th className="border border-black p-2 bg-gray-100">Administered By</th><td className="border border-black p-2">{printCaseData.form.firstAidDoneBy || 'N/A'}</td></tr>
                                    {(() => {
                                        const str = `${printCaseData.incident.severity || ''} ${printCaseData.incident.type || ''}`.toLowerCase();
                                        if (str.includes('lost time') || str.includes('lti') || str.includes('recordable') || str.includes('reportable')) {
                                            return (
                                                <>
                                                    <tr><th className="border border-black p-2 bg-gray-100">LTI Days Leave</th><td className="border border-black p-2 font-bold">{printCaseData.form.daysOnLeave || '0'} Days</td></tr>
                                                    <tr><th className="border border-black p-2 bg-gray-100">Medical Report Ref.</th><td className="border border-black p-2">{printCaseData.form.medicalReportName || 'Not Attached'}</td></tr>
                                                </>
                                            );
                                        }
                                        return null;
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-16 flex justify-between page-break-inside-avoid">
                            <div className="w-[40%] border-t border-black text-center pt-2 font-bold text-sm uppercase tracking-widest">Medical Officer / First Aider Signature</div>
                            <div className="w-[40%] border-t border-black text-center pt-2 font-bold text-sm uppercase tracking-widest">HSE Manager Signature</div>
                        </div>
                        <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                    </div>
                )}

                {/* PRINT: SURVEILLANCE */}
                {printSurvData && (
                    <div className="hidden print:block p-8 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <div className="text-center border-b-2 border-black pb-4 mb-6">
                            <h1 className="text-2xl font-black uppercase m-0">Occupational Health Surveillance Record</h1>
                            <p className="text-sm font-bold mt-1 uppercase text-gray-600">ISO 45001 Clause 8.1.2 - Biological & Medical Monitoring</p>
                        </div>

                        <div className="mb-6 p-4 border border-black bg-gray-50">
                            <table className="w-full text-sm border-none">
                                <tbody>
                                    <tr>
                                        <td className="w-[15%] font-bold py-1 border-b border-gray-300">Record ID:</td><td className="w-[35%] py-1 border-b border-gray-300 font-mono font-bold">{printSurvData.id}</td>
                                        <td className="w-[15%] font-bold py-1 border-b border-gray-300 pl-4">Date:</td><td className="w-[35%] py-1 border-b border-gray-300 font-mono">{printSurvData.date}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] font-bold py-2 border-b border-gray-300">Site:</td><td className="w-[35%] py-2 border-b border-gray-300">{printSurvData.siteId || 'Global'}</td>
                                        <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Surv. Type:</td><td className="w-[35%] py-2 border-b border-gray-300 font-bold uppercase">{printSurvData.type}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] font-bold py-2 border-none">Agent Exposed:</td><td className="w-[35%] py-2 border-none">{printSurvData.agent}</td>
                                        <td className="w-[15%] font-bold py-2 border-none pl-4">Campaign:</td><td className="w-[35%] py-2 border-none font-bold">{printSurvData.campaignName || 'General Health Check'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {printSurvData.testGroups.map((group, gIdx) => (
                            <div key={gIdx} className="mb-8 page-break-inside-avoid">
                                <h2 className="text-sm font-bold mb-2 uppercase bg-gray-800 text-white inline-block px-3 py-1.5 border border-black">Test Category: {group.testName || 'General'}</h2>
                                <table className="w-full border-collapse border border-black text-xs">
                                    <thead>
                                        <tr className="bg-gray-200">
                                            <th className="border border-black p-2 text-left w-[20%]">Employee Name</th>
                                            <th className="border border-black p-2 text-left w-[15%]">ID</th>
                                            <th className="border border-black p-2 text-left w-[20%]">Test Result Metric</th>
                                            <th className="border border-black p-2 text-left w-[20%]">Fitness Status</th>
                                            <th className="border border-black p-2 text-left">Clinical Remarks / Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.employees.map((emp, i) => (
                                            <tr key={i}>
                                                <td className="border border-black p-2 font-bold">{emp.name}</td>
                                                <td className="border border-black p-2 font-mono">{emp.empId}</td>
                                                <td className="border border-black p-2">{emp.defectMetric}</td>
                                                <td className="border border-black p-2 font-bold uppercase">{emp.status}</td>
                                                <td className="border border-black p-2">{emp.remarks || '-'}</td>
                                            </tr>
                                        ))}
                                        {group.employees.length === 0 && <tr><td colSpan="5" className="border border-black p-4 text-center italic text-gray-500">No employees tested.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        ))}

                        <table className="w-full border-none mt-20 text-sm page-break-inside-avoid">
                            <tbody>
                                <tr>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Occupational Health Physician Signature</td>
                                    <td className="w-[10%] border-none"></td>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">HSE Manager Signature</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="text-center text-xs text-gray-500 mt-10 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                    </div>
                )}

                {/* PRINT: VACCINATION */}
                {printVaccData && (
                    <div className="hidden print:block p-8 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <div className="text-center border-b-2 border-black pb-4 mb-6">
                            <h1 className="text-2xl font-black uppercase m-0">Employee Immunization Register</h1>
                            <p className="text-sm font-bold mt-1 text-gray-600 uppercase">Occupational Health & Preventative Medicine</p>
                        </div>

                        <div className="mb-6 p-4 border border-black bg-gray-50">
                            <table className="w-full text-sm border-none">
                                <tbody>
                                    <tr>
                                        <td className="w-[15%] font-bold py-1 border-b border-gray-300">Record ID:</td><td className="w-[35%] py-1 border-b border-gray-300 font-mono font-bold">{printVaccData.id}</td>
                                        <td className="w-[15%] font-bold py-1 border-b border-gray-300 pl-4">Date:</td><td className="w-[35%] py-1 border-b border-gray-300 font-mono">{printVaccData.date}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] font-bold py-2 border-b border-gray-300">Site:</td><td className="w-[35%] py-2 border-b border-gray-300">{printVaccData.siteId || 'Global'}</td>
                                        <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Vaccine:</td><td className="w-[35%] py-2 border-b border-gray-300 font-bold text-lg">{printVaccData.vaccineName}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[15%] font-bold py-2 border-none">Dosage:</td><td className="w-[35%] py-2 border-none uppercase font-bold">{printVaccData.dosage}</td>
                                        <td className="w-[15%] font-bold py-2 border-none pl-4">Provider:</td><td className="w-[35%] py-2 border-none">{printVaccData.provider || 'N/A'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="page-break-inside-avoid">
                            <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 inline-block p-1 border border-gray-400">Vaccination Roster</h2>
                            <table className="w-full border-collapse border border-black text-sm">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-black p-2 text-left w-[30%]">Employee Name</th>
                                        <th className="border border-black p-2 text-left w-[20%]">ID</th>
                                        <th className="border border-black p-2 text-left w-[20%]">Status</th>
                                        <th className="border border-black p-2 text-left">Remarks / Batch No.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {printVaccData.employees.map((emp, i) => (
                                        <tr key={i}>
                                            <td className="border border-black p-2 font-bold">{emp.name}</td>
                                            <td className="border border-black p-2 font-mono">{emp.empId}</td>
                                            <td className="border border-black p-2 font-bold uppercase">{emp.status}</td>
                                            <td className="border border-black p-2">{emp.remarks || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <table className="w-full border-none mt-24 text-sm page-break-inside-avoid">
                            <tbody>
                                <tr>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Administering Medical Officer</td>
                                    <td className="w-[10%] border-none"></td>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">HSE Manager / HR Representative</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                    </div>
                )}

                {/* PRINT: ILLNESS */}
                {printIllnessData && (
                    <div className="hidden print:block p-8 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <div className="text-center border-b-2 border-black pb-4 mb-6">
                            <h1 className="text-2xl font-black uppercase m-0">Occupational Illness Report</h1>
                            <p className="text-sm font-bold mt-1 text-gray-600 uppercase">Confidential Health Record</p>
                        </div>

                        <div className="mb-6 p-4 border border-black bg-gray-50">
                            <table className="w-full text-sm border-none">
                                <tbody>
                                    <tr>
                                        <td className="w-[20%] font-bold py-2 border-b border-gray-300">Record ID:</td><td className="w-[30%] py-2 border-b border-gray-300 font-mono font-bold">{printIllnessData.id}</td>
                                        <td className="w-[20%] font-bold py-2 border-b border-gray-300 pl-4">Date/Time:</td><td className="w-[30%] py-2 border-b border-gray-300 font-mono">{printIllnessData.date} {printIllnessData.time}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[20%] font-bold py-2 border-none">Site:</td><td className="w-[30%] py-2 border-none">{printIllnessData.siteId || 'Global'}</td>
                                        <td className="w-[20%] font-bold py-2 border-none pl-4">Employee:</td><td className="w-[30%] py-2 border-none font-bold text-lg">{printIllnessData.empNameId}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="mb-6 border border-black p-5">
                            <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Exposure & Diagnosis</h2>
                            <table className="w-full text-sm border-none">
                                <tbody>
                                    <tr>
                                        <td className="w-[25%] font-bold py-2 border-b border-gray-300">Agent Exposed To:</td>
                                        <td className="py-2 border-b border-gray-300">{printIllnessData.agent}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[25%] font-bold py-2 border-b border-gray-300">Period of Exposure:</td>
                                        <td className="py-2 border-b border-gray-300">{printIllnessData.exposurePeriod}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[25%] font-bold py-2 border-b border-gray-300">Health Issue Triggered:</td>
                                        <td className="py-2 border-b border-gray-300 font-bold text-base">{printIllnessData.healthIssue}</td>
                                    </tr>
                                    <tr>
                                        <td className="w-[25%] font-bold py-2">Impacted Body Function:</td>
                                        <td className="py-2">{printIllnessData.impactedFunction}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="mb-6 border border-black p-5">
                            <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Treatment & Action Plan</h2>
                            <div className="text-sm whitespace-pre-wrap leading-relaxed pl-3 border-l-4 border-gray-400 py-1 italic">{printIllnessData.treatment || 'No treatment details recorded.'}</div>
                        </div>

                        <div className="mb-6 page-break-inside-avoid">
                            <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Corrective & Preventive Actions (CAPA)</h2>
                            <table className="w-full border-collapse border border-black text-sm">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-black p-3 text-left">Action Description</th>
                                        <th className="border border-black p-3 text-left w-1/4">Owner</th>
                                        <th className="border border-black p-3 w-32 text-center">Due Date</th>
                                        <th className="border border-black p-3 w-32 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {printIllnessData.capa && printIllnessData.capa.length > 0 ? printIllnessData.capa.map((c, i) => (
                                        <tr key={i}>
                                            <td className="border border-black p-3">{c.act}</td>
                                            <td className="border border-black p-3 font-bold uppercase">{c.own || 'Unassigned'}</td>
                                            <td className="border border-black p-3 text-center font-mono">{c.due}</td>
                                            <td className="border border-black p-3 text-center font-bold uppercase">{c.status}</td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="4" className="border border-black p-6 text-center italic text-gray-500">No CAPA items recorded.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <table className="w-full border-none mt-24 text-sm page-break-inside-avoid">
                            <tbody>
                                <tr>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Occupational Health Physician Signature</td>
                                    <td className="w-[10%] border-none"></td>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">HSE Manager Signature</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                    </div>
                )}

            </main>
        </div>
    );
}
