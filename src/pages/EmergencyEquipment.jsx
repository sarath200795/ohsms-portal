import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, push, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { getFieldPortalLoginPath, getPortalAwareHomePath } from './FieldApp/portalAuth';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const TYPES = ['Fire Extinguisher', 'First Aid Kit', 'AED / Defibrillator', 'Eye Wash Station', 'Spill Kit', 'Evacuation Chair'];
const STATUSES = ['Active', 'Needs Inspection', 'Out of Service', 'Missing'];
const DUE_SOON_WINDOW_DAYS = 7;
const INSPECTION_INTERVAL_DAYS = 30;

const FIRE_EXT_TYPES = [
    { name: 'Water (Stored Pressure)', refillYears: 3, hptYears: 3 },
    { name: 'Water (Gas Cartridge)', refillYears: 1, hptYears: 3 },
    { name: 'Mechanical Foam (Stored Pressure)', refillYears: 3, hptYears: 3 },
    { name: 'Mechanical Foam (Gas Cartridge)', refillYears: 1, hptYears: 3 },
    { name: 'ABC Powder / DCP (Stored Pressure)', refillYears: 3, hptYears: 3 },
    { name: 'ABC Powder / DCP (Gas Cartridge)', refillYears: 1, hptYears: 3 },
    { name: 'Carbon Dioxide (CO2)', refillYears: 5, hptYears: 5 },
    { name: 'Clean Agent / Halotron', refillYears: 3, hptYears: 3 }
];

const EQUIPMENT_TYPE_META = {
    'Fire Extinguisher': {
        icon: 'fa-fire-extinguisher',
        iconClass: 'text-red-400',
        accentTextClass: 'text-red-400',
        bannerClass: 'border-red-500/30 bg-red-500/10',
        bannerTextClass: 'text-red-300',
        badgeClass: 'border-red-500/30 bg-red-950/40 text-red-300',
        panelClass: 'border-red-500/30 bg-red-950/20',
        inspectButtonClass: 'bg-red-900/20 hover:bg-red-600 border-red-500/30 text-red-300 hover:text-white',
        checkboxClass: 'accent-red-500',
        checklistTitle: 'ISO Visual Checklist'
    },
    'First Aid Kit': {
        icon: 'fa-medkit',
        iconClass: 'text-emerald-400',
        accentTextClass: 'text-emerald-400',
        bannerClass: 'border-emerald-500/30 bg-emerald-500/10',
        bannerTextClass: 'text-emerald-300',
        badgeClass: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300',
        panelClass: 'border-emerald-500/30 bg-emerald-950/20',
        inspectButtonClass: 'bg-emerald-900/20 hover:bg-emerald-600 border-emerald-500/30 text-emerald-300 hover:text-white',
        checkboxClass: 'accent-emerald-500',
        checklistTitle: 'OSHA-Aligned First Aid Checklist'
    },
    'AED / Defibrillator': {
        icon: 'fa-heartbeat',
        iconClass: 'text-rose-400',
        accentTextClass: 'text-rose-400',
        bannerClass: 'border-rose-500/30 bg-rose-500/10',
        bannerTextClass: 'text-rose-300',
        badgeClass: 'border-rose-500/30 bg-rose-950/40 text-rose-300',
        panelClass: 'border-rose-500/30 bg-rose-950/20',
        inspectButtonClass: 'bg-rose-900/20 hover:bg-rose-600 border-rose-500/30 text-rose-300 hover:text-white',
        checkboxClass: 'accent-rose-500',
        checklistTitle: 'OSHA-Aligned AED Readiness Checklist'
    },
    'Eye Wash Station': {
        icon: 'fa-eye',
        iconClass: 'text-sky-400',
        accentTextClass: 'text-sky-400',
        bannerClass: 'border-sky-500/30 bg-sky-500/10',
        bannerTextClass: 'text-sky-300',
        badgeClass: 'border-sky-500/30 bg-sky-950/40 text-sky-300',
        panelClass: 'border-sky-500/30 bg-sky-950/20',
        inspectButtonClass: 'bg-sky-900/20 hover:bg-sky-600 border-sky-500/30 text-sky-300 hover:text-white',
        checkboxClass: 'accent-sky-500',
        checklistTitle: 'OSHA-Aligned Eyewash Checklist'
    },
    'Spill Kit': {
        icon: 'fa-fill-drip',
        iconClass: 'text-amber-400',
        accentTextClass: 'text-amber-400',
        bannerClass: 'border-amber-500/30 bg-amber-500/10',
        bannerTextClass: 'text-amber-300',
        badgeClass: 'border-amber-500/30 bg-amber-950/40 text-amber-300',
        panelClass: 'border-amber-500/30 bg-amber-950/20',
        inspectButtonClass: 'bg-amber-900/20 hover:bg-amber-600 border-amber-500/30 text-amber-300 hover:text-white',
        checkboxClass: 'accent-amber-500',
        checklistTitle: 'OSHA-Aligned Spill Response Checklist'
    },
    'Evacuation Chair': {
        icon: 'fa-wheelchair',
        iconClass: 'text-violet-400',
        accentTextClass: 'text-violet-400',
        bannerClass: 'border-violet-500/30 bg-violet-500/10',
        bannerTextClass: 'text-violet-300',
        badgeClass: 'border-violet-500/30 bg-violet-950/40 text-violet-300',
        panelClass: 'border-violet-500/30 bg-violet-950/20',
        inspectButtonClass: 'bg-violet-900/20 hover:bg-violet-600 border-violet-500/30 text-violet-300 hover:text-white',
        checkboxClass: 'accent-violet-500',
        checklistTitle: 'OSHA-Aligned Egress Chair Checklist'
    }
};

const EQUIPMENT_CHECKLISTS = {
    'Fire Extinguisher': [
        { id: 'gauge', summary: 'Gauge', label: 'Pressure gauge indicator is in the operable range.' },
        { id: 'pin', summary: 'Pin', label: 'Safety pin is in place and tamper seal is intact.' },
        { id: 'hose', summary: 'Hose', label: 'Discharge hose/nozzle is free of cracks, dirt, or blockages.' },
        { id: 'body', summary: 'Body', label: 'Cylinder body has no dents, corrosion, or visible damage.' },
        { id: 'bracket', summary: 'Bracket', label: 'Extinguisher is secured properly on its bracket or in its cabinet.' },
        { id: 'label', summary: 'Label', label: 'Operating label and classification markings are legible and facing outward.' },
        { id: 'access', summary: 'Access', label: 'The extinguisher is visible, signed, and not blocked by storage or equipment.' },
        { id: 'inspectionTag', summary: 'Inspection Tag', label: 'Inspection tag or record is present and reflects the latest check.' }
    ],
    'First Aid Kit': [
        { id: 'instructions', summary: 'Instructions', label: 'Instructions for providing first aid, including CPR flow chart or first-aid guide, are available.' },
        { id: 'notebook', summary: 'Notebook', label: 'Notebook and pen are available in the first aid kit.' },
        { id: 'cprMask', summary: 'CPR Mask', label: 'Resuscitation face mask or face shield is present and usable.' },
        { id: 'gloves', summary: 'Gloves', label: 'Disposable nitrile examination gloves are available in adequate quantity.' },
        { id: 'gauzeSterile', summary: 'Sterile Gauze', label: 'Sterile gauze pieces or pads are present in suitable pack sizes.' },
        { id: 'saline', summary: 'Saline', label: 'Saline or sodium chloride irrigation solution is available.' },
        { id: 'wipes', summary: 'Wipes', label: 'Wound cleaning wipes or antiseptic wipes are available.' },
        { id: 'adhesiveStrips', summary: 'Adhesive Strips', label: 'Adhesive dressing strips or adhesive bandages are stocked.' },
        { id: 'adhesiveTape', summary: 'Adhesive Tape', label: 'Adhesive tape is available in usable condition.' },
        { id: 'splinterProbe', summary: 'Splinter Probe', label: 'Splinter probes or similar disposable removal tools are present.' },
        { id: 'tweezers', summary: 'Tweezers', label: 'Tweezers or forceps are available and clean.' },
        { id: 'antiseptic', summary: 'Antiseptic', label: 'Antiseptic liquid, spray, cream, or povidone iodine is available.' },
        { id: 'burnCare', summary: 'Burn Care', label: 'Burn dressing, burn treatment cream, or equivalent burn-care material is available.' },
        { id: 'triangularBandage', summary: 'Triangular Bandage', label: 'Triangular bandages are available in the kit.' },
        { id: 'tourniquet', summary: 'Tourniquet', label: 'Tourniquet is available where required by the site standard.' },
        { id: 'cottonRoll', summary: 'Cotton Roll', label: 'Cotton roll and basic wound support material are available.' },
        { id: 'eyePads', summary: 'Eye Pads', label: 'Eye pads are present and in usable condition.' },
        { id: 'dressings', summary: 'Dressings', label: 'Sterilized dressings in small, medium, and large sizes are available.' },
        { id: 'rollerBandage', summary: 'Roller Bandage', label: 'Roller bandages in required sizes are available.' },
        { id: 'safetyPins', summary: 'Safety Pins', label: 'Safety pins are present in usable condition.' },
        { id: 'blanket', summary: 'Blanket', label: 'Emergency blanket is available if required by the kit standard.' },
        { id: 'case', summary: 'Case', label: 'Kit case and mounting are clean, closed, clearly identified, and free from damage.' }
    ],
    'AED / Defibrillator': [
        { id: 'readyCheck', summary: 'Green Check', label: 'Green check or readiness indicator shows that the AED is ready to use.' },
        { id: 'clean', summary: 'Cleanliness', label: 'AED unit is clean, undamaged, and free of excessive wear.' },
        { id: 'padsExpiry', summary: 'Pad Expiry', label: 'Electrodes are within their expiration date.' },
        { id: 'padsConnected', summary: 'Pad Connection', label: 'Electrodes are connected to the unit and sealed in their package.' },
        { id: 'cables', summary: 'Cables', label: 'All cables are free of cracks, cuts, or exposed or broken wires.' },
        { id: 'powerCycle', summary: 'Power Test', label: 'Unit can be turned on and off and returns to ready status after the check.' },
        { id: 'battery', summary: 'Battery', label: 'Batteries are within expiration date and ready for service.' },
        { id: 'supplies', summary: 'Supplies', label: 'Mask, gloves, extra batteries, razor, and other rescue supplies are available.' },
        { id: 'alarm', summary: 'Alarm', label: 'Alarm on the AED box or cabinet operates correctly.' }
    ],
    'Eye Wash Station': [
        { id: 'availability', summary: 'Availability', label: 'Eyewash bottle or station is available at the designated location.' },
        { id: 'waterColour', summary: 'Water Colour', label: 'Water colour is acceptable and does not indicate contamination.' },
        { id: 'capCondition', summary: 'Cap Condition', label: 'Caps/nozzle covers are present and in good condition.' },
        { id: 'waterLevel', summary: 'Water Level', label: 'Water level is correct and ready for emergency use.' },
        { id: 'updatedOn', summary: 'Updated On', label: 'Bottle/service date or update marking is current and visible.' },
        { id: 'inspectorSign', summary: 'Inspector Sign', label: 'Inspection signature or inspector identification is recorded.' },
        { id: 'access', summary: 'Access', label: 'Path to the station is unobstructed and eyewash signage is visible.' }
    ],
    'Spill Kit': [
        { id: 'visualDamage', summary: 'Visual Damage', label: 'Spill kit and storage condition show no visual damage and meet 5S expectations.' },
        { id: 'absorbents', summary: 'Absorbents', label: 'Absorbent boom and pads are available in the spill kit.' },
        { id: 'ppe', summary: 'PPE', label: 'Required PPE such as nitrile gloves, goggles, and nose mask are available.' },
        { id: 'cover', summary: 'Disposable Cover', label: 'Disposable cover items are available in the kit.' },
        { id: 'sop', summary: 'SOP', label: 'Spill response SOP or instruction sheet is available with the kit.' },
        { id: 'wasteHandling', summary: 'Waste Handling', label: 'Waste collection/disposal items required for spill response are available.' },
        { id: 'restock', summary: 'Restock', label: 'Critical spill kit consumables do not appear depleted from prior use.' }
    ],
    'Evacuation Chair': [
        { id: 'availability', summary: 'Availability', label: 'Transport equipment is available and stored in the designated place.' },
        { id: 'seatCloth', summary: 'Cloth/Seat', label: 'Seat cloth or stretcher fabric is in good condition with no wear or tear.' },
        { id: 'sideHandles', summary: 'Handles', label: 'Handles are available on both sides and in good condition.' },
        { id: 'lockMechanism', summary: 'Locking', label: 'Expandable lock or folding/locking mechanism secures correctly.' },
        { id: 'standCondition', summary: 'Stand/Frame', label: 'Stand, frame, and support parts are in good condition with no cracks or damage.' },
        { id: 'mainWheel', summary: 'Main Wheel', label: 'Main wheel is in good condition and rotates freely.' },
        { id: 'guideWheel', summary: 'Guide Wheel', label: 'Guiding/caster wheel moves freely and has no visible damage.' },
        { id: 'brake', summary: 'Brake', label: 'Hand brake is in good condition and stops the wheel when applied.' },
        { id: 'footPad', summary: 'Foot Pad', label: 'Foot pad or footrest is in good condition with no damage.' },
        { id: 'xFrame', summary: 'X-Frame', label: 'X-frame or structural brace is in good condition with no cracks or damage.' },
        { id: 'housekeeping', summary: '5S Area', label: '5S condition is maintained and the designated area is clearly identified.' },
        { id: 'inspectionRecord', summary: 'Inspection Record', label: 'Inspection record, remark field, and sign-off are updated.' }
    ]
};

const getTodayDate = () => new Date().toISOString().split('T')[0];

const getEquipmentMeta = (type) => EQUIPMENT_TYPE_META[type] || EQUIPMENT_TYPE_META['Fire Extinguisher'];

const createChecklistState = (type) => Object.fromEntries(
    (EQUIPMENT_CHECKLISTS[type] || []).map((item) => [item.id, true])
);

const addDaysToDate = (dateString, days) => {
    if (!dateString) return '';
    const parsed = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setDate(parsed.getDate() + days);
    return parsed.toISOString().split('T')[0];
};

const countMissedInspectionCycles = (nextDueDate, referenceDate) => {
    if (!nextDueDate || !referenceDate || nextDueDate >= referenceDate) return 0;

    let missedCount = 0;
    let cursor = nextDueDate;

    while (cursor < referenceDate && missedCount < 120) {
        missedCount += 1;
        cursor = addDaysToDate(cursor, INSPECTION_INTERVAL_DAYS);
        if (!cursor) break;
    }

    return missedCount;
};

const buildChecklistSummary = (type, checks) => {
    const checklist = EQUIPMENT_CHECKLISTS[type] || [];
    if (!checklist.length || !checks) return '';
    return `[Checklist - ${checklist.map((item) => `${item.summary}: ${checks[item.id] ? 'OK' : 'FAIL'}`).join(', ')}] `;
};

const createInspectionDraft = (record, { qrScanMode = false, notes = '' } = {}) => {
    const inspectionDate = getTodayDate();
    return {
        ...record,
        date: inspectionDate,
        nextDate: addDaysToDate(inspectionDate, INSPECTION_INTERVAL_DAYS),
        notes,
        checks: createChecklistState(record.type),
        qrScanMode
    };
};

export default function EmergencyEquipment() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [isPublic, setIsPublic] = useState(false);
    const [equipment, setEquipment] = useState([]);
    const [sites, setSites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);

    const [view, setView] = useState('list');

    // --- ADVANCED FILTERS ---
    const [siteFilter, setSiteFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');
    const [complianceFilter, setComplianceFilter] = useState('All');

    const [formData, setFormData] = useState({
        firebaseKey: null, assetId: '', siteId: '', type: 'Fire Extinguisher', location: '',
        lastInspection: getTodayDate(), nextInspection: addDaysToDate(getTodayDate(), INSPECTION_INTERVAL_DAYS), status: 'Active', notes: '',
        extinguisherType: '', lastRefillDate: '', lastHptDate: '', nextRefillDate: '', nextHptDate: ''
    });

    const [inspectData, setInspectData] = useState(null);
    const [printTagData, setPrintTagData] = useState(null);
    const isFieldQrMode = useMemo(() => new URLSearchParams(location.search).get('fieldQr') === '1', [location.search]);
    const buildModulePath = (siteCode) => {
        const targetSite = siteCode || siteFilter || 'All';
        return `/emergency-equipment?site=${encodeURIComponent(targetSite)}`;
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const publicScanId = params.get('scan');
        const publicOrgId = params.get('org');
        const s = sessionStorage.getItem('isoSession');
        if (!s) {
            if (!publicScanId || !publicOrgId) { navigate('/'); return; }
            setIsPublic(true);

            const fetchPublicData = async () => {
                try {
                    const eqSnap = await get(ref(rtdb, `organizations/${publicOrgId}/emergencyEquipment/${publicScanId}`));
                    if (eqSnap.exists()) {
                        const targetEq = { firebaseKey: publicScanId, ...eqSnap.val() };
                        const publicSite = params.get('site') || targetEq.siteId || 'All';
                        setSiteFilter(publicSite);
                        setInspectData(createInspectionDraft(targetEq, { qrScanMode: true, notes: targetEq.notes || '' }));
                        setView('inspect');
                    }
                } catch (err) {
                    console.error(err);
                } finally {
                    setLoading(false);
                }
            };

            fetchPublicData();
            return;
        }
        const sess = JSON.parse(s);
        setSession(sess);

        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        const scanId = params.get('scan');

        const isGlobal = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        if (!isGlobal && ctxSite === 'All') {
            ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
        }

        setSiteFilter(ctxSite);
        setFormData(prev => ({ ...prev, siteId: ctxSite !== 'All' ? ctxSite : '' }));

        const fetchData = async () => {
            try {
                const snap = await get(ref(rtdb, `organizations/${sess.orgId}`));
                if (snap.exists()) {
                    const data = snap.val();
                    let loadedEq = [];
                    if (data.emergencyEquipment) {
                        loadedEq = Object.entries(data.emergencyEquipment).map(([k, v]) => ({ firebaseKey: k, ...v }));
                        setEquipment(loadedEq);
                    } else { setEquipment([]); }

                    if (data.sites) {
                        setSites(Object.keys(data.sites).map(key => ({ code: data.sites[key].code || key, name: data.sites[key].name || key })));
                    }

                    if (scanId) {
                        const targetEq = loadedEq.find(e => e.firebaseKey === scanId);
                        if (targetEq) {
                            const targetSite = targetEq.siteId || ctxSite || 'All';
                            setSiteFilter(targetSite);
                            sessionStorage.setItem('isoCurrentSite', targetSite === 'All' ? 'GLOBAL' : targetSite);
                            setInspectData(createInspectionDraft(targetEq, { qrScanMode: true }));
                            setView('inspect');
                            navigate(buildModulePath(targetSite), { replace: true });
                        }
                    }
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [navigate, location.search]);

    useEffect(() => {
        if (formData.type === 'Fire Extinguisher' && formData.extinguisherType) {
            const extConfig = FIRE_EXT_TYPES.find(t => t.name === formData.extinguisherType);
            let newRefill = formData.nextRefillDate;
            let newHpt = formData.nextHptDate;

            if (extConfig) {
                if (formData.lastRefillDate) {
                    const d = new Date(formData.lastRefillDate);
                    d.setFullYear(d.getFullYear() + extConfig.refillYears);
                    newRefill = d.toISOString().split('T')[0];
                } else { newRefill = ''; }

                if (formData.lastHptDate) {
                    const d = new Date(formData.lastHptDate);
                    d.setFullYear(d.getFullYear() + extConfig.hptYears);
                    newHpt = d.toISOString().split('T')[0];
                } else { newHpt = ''; }
            }

            if (newRefill !== formData.nextRefillDate || newHpt !== formData.nextHptDate) {
                setFormData(prev => ({ ...prev, nextRefillDate: newRefill, nextHptDate: newHpt }));
            }
        }
    }, [formData.type, formData.extinguisherType, formData.lastRefillDate, formData.lastHptDate, formData.nextRefillDate, formData.nextHptDate]);

    useEffect(() => {
        if (!formData.lastInspection) return;
        const nextInspection = addDaysToDate(formData.lastInspection, INSPECTION_INTERVAL_DAYS);
        if (nextInspection && nextInspection !== formData.nextInspection) {
            setFormData(prev => ({ ...prev, nextInspection }));
        }
    }, [formData.lastInspection, formData.nextInspection]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'HSE Rep'].includes(session?.role);
    const hasInspectionSiteAccess = useMemo(() => {
        if (!inspectData || !session) return false;
        if (isGlobalUser) return true;
        if (session.assignedSite === 'GLOBAL') return true;
        return inspectData.siteId === session.assignedSite || (session.accessibleSites || []).includes(inspectData.siteId);
    }, [inspectData, isGlobalUser, session]);
    const canOperateInspectionSheet = useMemo(() => {
        if (!inspectData) return false;
        if (inspectData.qrScanMode || isFieldQrMode) {
            return Boolean(session) && hasInspectionSiteAccess;
        }
        return canEdit;
    }, [canEdit, hasInspectionSiteAccess, inspectData, isFieldQrMode, session]);
    const todayDate = getTodayDate();
    const activeEquipmentMeta = useMemo(() => getEquipmentMeta(inspectData?.type), [inspectData?.type]);
    const activeChecklistItems = useMemo(() => EQUIPMENT_CHECKLISTS[inspectData?.type] || [], [inspectData?.type]);
    const calculatedNextInspectionDate = useMemo(() => addDaysToDate(inspectData?.date, INSPECTION_INTERVAL_DAYS), [inspectData?.date]);
    const isInspectionOverdue = useMemo(() => {
        if (!inspectData?.nextInspection) return false;
        return inspectData.nextInspection < todayDate;
    }, [inspectData?.nextInspection, todayDate]);
    const missedInspectionCycles = useMemo(() => countMissedInspectionCycles(inspectData?.nextInspection, todayDate), [inspectData?.nextInspection, todayDate]);

    // --- FILTER ENGINE ---
    const visibleEquipment = useMemo(() => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const dueSoonDate = new Date(today);
        dueSoonDate.setDate(today.getDate() + DUE_SOON_WINDOW_DAYS);
        const dueSoonStr = dueSoonDate.toISOString().split('T')[0];

        return equipment.filter(e => {
            // 1. Site Filter
            if (!isGlobalUser && session?.assignedSite !== 'GLOBAL' && e.siteId !== session?.assignedSite && !(session?.accessibleSites || []).includes(e.siteId)) return false;
            if (siteFilter !== 'All' && e.siteId !== siteFilter) return false;

            // 2. Type Filter
            if (typeFilter !== 'All' && e.type !== typeFilter) return false;

            // 3. Compliance Flag Filter
            if (complianceFilter !== 'All') {
                if (complianceFilter === 'Insp Overdue') {
                    if (!e.nextInspection || e.nextInspection >= todayStr) return false;
                }
                else if (complianceFilter === 'Refill Overdue') {
                    if (e.type !== 'Fire Extinguisher' || !e.nextRefillDate || e.nextRefillDate >= todayStr) return false;
                }
                else if (complianceFilter === 'HPT Overdue') {
                    if (e.type !== 'Fire Extinguisher' || !e.nextHptDate || e.nextHptDate >= todayStr) return false;
                }
                else if (complianceFilter === 'Refill < 7 Days') {
                    if (e.type !== 'Fire Extinguisher' || !e.nextRefillDate || e.nextRefillDate < todayStr || e.nextRefillDate > dueSoonStr) return false;
                }
                else if (complianceFilter === 'HPT < 7 Days') {
                    if (e.type !== 'Fire Extinguisher' || !e.nextHptDate || e.nextHptDate < todayStr || e.nextHptDate > dueSoonStr) return false;
                }
            }

            return true;
        });
    }, [equipment, siteFilter, typeFilter, complianceFilter, isGlobalUser, session]);

    const stats = useMemo(() => {
        const now = new Date();
        const dueSoonDate = new Date(now);
        dueSoonDate.setDate(now.getDate() + DUE_SOON_WINDOW_DAYS);

        let total = equipment.filter(e => siteFilter === 'All' || e.siteId === siteFilter).length;
        let expiringSoon = 0;
        let actionNeeded = 0;

        equipment.filter(e => siteFilter === 'All' || e.siteId === siteFilter).forEach(e => {
            let isAction = false;
            if (e.status === 'Out of Service' || e.status === 'Missing' || e.status === 'Needs Inspection') isAction = true;

            if (e.nextInspection && new Date(e.nextInspection) < now) isAction = true;
            if (e.type === 'Fire Extinguisher') {
                if (e.nextRefillDate && new Date(e.nextRefillDate) < now) isAction = true;
                if (e.nextHptDate && new Date(e.nextHptDate) < now) isAction = true;
            }

            if (isAction) {
                actionNeeded++;
            } else {
                let isExpiring = false;
                if (e.nextInspection && new Date(e.nextInspection) <= dueSoonDate) isExpiring = true;
                if (e.type === 'Fire Extinguisher') {
                    if (e.nextRefillDate && new Date(e.nextRefillDate) <= dueSoonDate) isExpiring = true;
                    if (e.nextHptDate && new Date(e.nextHptDate) <= dueSoonDate) isExpiring = true;
                }
                if (isExpiring) expiringSoon++;
            }
        });

        return { total, expiringSoon, actionNeeded };
    }, [equipment, siteFilter]);


    const handleSave = async () => {
        if (!formData.type || !formData.location || !formData.siteId) return alert("Type, Location, and Site are required.");

        try {
            let finalAssetId = formData.assetId;
            if (!finalAssetId) {
                const locPrefix = formData.location.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
                const randomNum = Math.floor(1000 + Math.random() * 9000);
                finalAssetId = `${formData.siteId}-${locPrefix}-${randomNum}`;
            }

            const payload = {
                ...formData,
                assetId: finalAssetId,
                nextInspection: addDaysToDate(formData.lastInspection, INSPECTION_INTERVAL_DAYS),
                updatedBy: session.name || session.email,
                lastUpdated: new Date().toISOString()
            };

            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment/${formData.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment`), payload);
            }
            setView('list');
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const handleLogInspection = async () => {
        if (!canOperateInspectionSheet) {
            alert("This QR inspection is read-only for your role.");
            return;
        }
        try {
            const checklistStr = buildChecklistSummary(inspectData.type, inspectData.checks);

            const finalNotes = inspectData.notes
                ? `${checklistStr}${inspectData.notes} (Inspected by ${session.name})`
                : `${checklistStr}Routine inspection by ${session.name}`;
            const nextInspection = addDaysToDate(inspectData.date, INSPECTION_INTERVAL_DAYS);

            const payload = {
                lastInspection: inspectData.date,
                nextInspection,
                status: inspectData.status,
                notes: finalNotes,
                updatedBy: session.name,
                lastUpdated: new Date().toISOString()
            };
            await update(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment/${inspectData.firebaseKey}`), payload);
            setEquipment(prev => prev.map(item => (
                item.firebaseKey === inspectData.firebaseKey
                    ? { ...item, ...payload }
                    : item
            )));
            setInspectData(prev => (prev ? { ...prev, ...payload, nextDate: nextInspection } : prev));
            alert("Inspection logged successfully.");
            setInspectData(null);
            setView('list');
            navigate(buildModulePath(inspectData.siteId || siteFilter), { replace: true });
        } catch (e) { alert("Inspection logging failed: " + e.message); }
    };

    const handleDelete = async (key) => {
        if (!canEdit) return alert("Permission denied.");
        if (window.confirm("Remove this equipment from the registry?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment/${key}`));
            setEquipment(equipment.filter(e => e.firebaseKey !== key));
        }
    };

    const downloadTemplate = async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Equipment_Upload_Template');
        const listSheet = workbook.addWorksheet('Allowed_Values');

        TYPES.forEach((t, i) => listSheet.getCell(`A${i + 1}`).value = t);
        FIRE_EXT_TYPES.forEach((t, i) => listSheet.getCell(`B${i + 1}`).value = t.name);
        STATUSES.forEach((s, i) => listSheet.getCell(`C${i + 1}`).value = s);

        listSheet.state = 'hidden';

        sheet.columns = [
            { header: 'Site ID (Req)', key: 'site', width: 15 },
            { header: 'Equipment Type (Req)', key: 'type', width: 25 },
            { header: 'Location (Req)', key: 'loc', width: 30 },
            { header: 'Asset/Serial ID', key: 'asset', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Last Inspection', key: 'insp', width: 20 },
            { header: 'Extinguisher Type (IS 2190)', key: 'extType', width: 35 },
            { header: 'Last Refill Date', key: 'refill', width: 20 },
            { header: 'Last HPT Date', key: 'hpt', width: 20 },
            { header: 'Notes', key: 'notes', width: 35 }
        ];

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

        for (let i = 2; i <= 100; i++) {
            sheet.getCell(`B${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Allowed_Values!$A$1:$A$${TYPES.length}`] };
            sheet.getCell(`G${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Allowed_Values!$B$1:$B$${FIRE_EXT_TYPES.length}`] };
            sheet.getCell(`E${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Allowed_Values!$C$1:$C$${STATUSES.length}`] };
        }

        sheet.addRow({
            site: 'HQ-01', type: 'Fire Extinguisher', loc: 'Main Lobby Exit', asset: 'HQ-LOB-101',
            status: 'Active', insp: '2025-01-15', extType: 'ABC Powder / DCP (Stored Pressure)',
            refill: '2023-05-10', hpt: '2023-05-10', notes: 'Mounted securely.'
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), "Emergency_Equipment_Upload_Template.xlsx");
    };

    const handleExcelImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImporting(true);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { raw: false });

                if (data.length === 0) throw new Error("Excel sheet is empty.");

                const updates = {};
                let count = 0;

                data.forEach((row) => {
                    const keys = Object.keys(row);
                    const getCol = (keywords) => keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw)));

                    const siteCol = getCol(['site']);
                    const typeCol = getCol(['equipment type']);
                    const locCol = getCol(['location']);
                    const assetCol = getCol(['asset', 'serial']);
                    const statusCol = getCol(['status']);
                    const inspCol = getCol(['last inspection']);
                    const extTypeCol = getCol(['extinguisher type', 'is 2190']);
                    const refillCol = getCol(['refill date']);
                    const hptCol = getCol(['hpt date']);
                    const notesCol = getCol(['notes']);

                    const siteId = row[siteCol];
                    const eqType = row[typeCol];
                    const location = row[locCol];

                    if (!siteId || !eqType || !location) return;

                    const formatDate = (val) => {
                        if (!val) return '';
                        try { return new Date(val).toISOString().split('T')[0]; } catch (e) { return ''; }
                    };

                    let assetId = row[assetCol];
                    if (!assetId || assetId.includes('auto-generate')) {
                        const locPrefix = location.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
                        const randomNum = Math.floor(1000 + Math.random() * 9000);
                        assetId = `${siteId}-${locPrefix}-${randomNum}`;
                    }

                    const extType = row[extTypeCol] || '';
                    const lastRefill = formatDate(row[refillCol]);
                    const lastHpt = formatDate(row[hptCol]);

                    let nextRefill = '';
                    let nextHpt = '';

                    if (eqType === 'Fire Extinguisher' && extType) {
                        const extConfig = FIRE_EXT_TYPES.find(t => t.name === extType);
                        if (extConfig) {
                            if (lastRefill) {
                                const d = new Date(lastRefill);
                                d.setFullYear(d.getFullYear() + extConfig.refillYears);
                                nextRefill = d.toISOString().split('T')[0];
                            }
                            if (lastHpt) {
                                const d = new Date(lastHpt);
                                d.setFullYear(d.getFullYear() + extConfig.hptYears);
                                nextHpt = d.toISOString().split('T')[0];
                            }
                        }
                    }

                    const lastInsp = formatDate(row[inspCol]) || new Date().toISOString().split('T')[0];
                    const nextInsp = addDaysToDate(lastInsp, INSPECTION_INTERVAL_DAYS);

                    const newItem = {
                        siteId, type: eqType, location, assetId,
                        status: row[statusCol] || 'Active',
                        lastInspection: lastInsp, nextInspection: nextInsp,
                        extinguisherType: extType, lastRefillDate: lastRefill, nextRefillDate: nextRefill,
                        lastHptDate: lastHpt, nextHptDate: nextHpt,
                        notes: row[notesCol] || 'Imported via Bulk Upload',
                        updatedBy: session.name || session.email,
                        lastUpdated: new Date().toISOString()
                    };

                    const newKey = push(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment`)).key;
                    updates[`organizations/${session.orgId}/emergencyEquipment/${newKey}`] = newItem;
                    count++;
                });

                if (count > 0) {
                    await update(ref(rtdb), updates);
                    alert(`Successfully imported ${count} equipment records! IS 2190 dates calculated automatically.`);
                    setView('list');
                } else {
                    alert("No valid rows found. Please ensure Site, Equipment Type, and Location columns are filled.");
                }

            } catch (err) {
                alert("Failed to parse Excel file. Please check the format.\n" + err.message);
            }
            setImporting(false);
            e.target.value = null;
        };
        reader.readAsBinaryString(file);
    };

    const getStatusBadge = (e) => {
        if (e.status === 'Out of Service' || e.status === 'Missing') return <span className="bg-red-900/30 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest block w-fit">{e.status}</span>;

        let badges = [];
        const todayStr = new Date().toISOString().split('T')[0];
        const dueSoonDate = new Date();
        dueSoonDate.setDate(dueSoonDate.getDate() + DUE_SOON_WINDOW_DAYS);
        const dueSoonStr = dueSoonDate.toISOString().split('T')[0];

        if (e.nextInspection) {
            if (e.nextInspection < todayStr) badges.push(<span key="insp-exp" className="bg-red-900/30 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest animate-pulse">INSP EXPIRED</span>);
            else if (e.nextInspection <= dueSoonStr) badges.push(<span key="insp-due" className="bg-orange-900/30 text-orange-400 border border-orange-500/30 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest">INSP DUE SOON</span>);
        }

        if (e.type === 'Fire Extinguisher') {
            if (e.nextRefillDate) {
                if (e.nextRefillDate < todayStr) badges.push(<span key="refill-exp" className="bg-red-900/30 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest animate-pulse">REFILL OVERDUE</span>);
                else if (e.nextRefillDate <= dueSoonStr) badges.push(<span key="refill-due" className="bg-orange-900/30 text-orange-400 border border-orange-500/30 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest">REFILL DUE SOON</span>);
            }
            if (e.nextHptDate) {
                if (e.nextHptDate < todayStr) badges.push(<span key="hpt-exp" className="bg-red-900/30 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest animate-pulse">HPT OVERDUE</span>);
                else if (e.nextHptDate <= dueSoonStr) badges.push(<span key="hpt-due" className="bg-orange-900/30 text-orange-400 border border-orange-500/30 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest">HPT DUE SOON</span>);
            }
        }

        if (badges.length > 0) return <div className="flex flex-col gap-1 items-start">{badges}</div>;

        return <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest block w-fit">Active & Compliant</span>;
    };

    if (loading || (!session && !isPublic)) return <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase"><div className="w-8 h-8 border-2 border-slate-800 border-t-orange-500 rounded-full animate-spin mr-3"></div> Loading Registry...</div>;

    if (isPublic) {
        const redirectPath = `${location.pathname}${location.search}`;

        if (!inspectData) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 font-['Space_Grotesk'] text-white">
                    <div className="w-full max-w-2xl rounded-[2rem] border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-fuchsia-300">QR Access</p>
                        <h1 className="text-3xl font-black text-white">Equipment Record Not Found</h1>
                        <p className="mt-3 text-sm text-slate-400">
                            This emergency equipment QR code does not map to an active registry record.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/field-portal')}
                            className="mt-6 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:bg-slate-700"
                        >
                            Open Field Portal
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-slate-950 font-['Space_Grotesk'] text-white">
                <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
                    <div className={`mb-6 rounded-[2rem] border p-5 shadow-xl ${activeEquipmentMeta.bannerClass}`}>
                        <p className={`mb-2 text-[10px] font-bold uppercase tracking-[0.3em] ${activeEquipmentMeta.bannerTextClass}`}>Public Read-Only</p>
                        <h1 className="text-2xl font-black text-white">Emergency Equipment</h1>
                        <p className="mt-2 text-sm text-slate-300">
                            You can review this equipment record now. Sign in through the field portal to log or submit an inspection.
                        </p>
                    </div>

                    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Asset</p>
                                <h2 className="text-3xl font-black text-white">{inspectData.assetId || inspectData.firebaseKey}</h2>
                                <p className={`mt-2 text-sm font-bold ${activeEquipmentMeta.accentTextClass}`}>
                                    <i className={`fas ${activeEquipmentMeta.icon} mr-2`}></i>
                                    {inspectData.type}
                                </p>
                            </div>
                            <span className={`rounded-2xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.25em] ${activeEquipmentMeta.badgeClass}`}>
                                Site {inspectData.siteId || siteFilter}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Location</p>
                                <p className="mt-2 text-sm font-bold text-white">{inspectData.location || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Status</p>
                                <p className="mt-2 text-sm font-bold text-white">{inspectData.status || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Last Inspection</p>
                                <p className="mt-2 text-sm font-bold text-white">{inspectData.lastInspection || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Next Due</p>
                                <p className="mt-2 text-sm font-bold text-white">{inspectData.nextInspection || inspectData.nextDate || 'N/A'}</p>
                            </div>
                        </div>

                        {inspectData.notes && (
                            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Notes</p>
                                <p className="mt-2 text-sm text-slate-300">{inspectData.notes}</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(getFieldPortalLoginPath(redirectPath))}
                            className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-slate-950 transition-colors hover:bg-cyan-400"
                        >
                            Sign In To Perform Inspection
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/field-portal')}
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-slate-800"
                        >
                            Field Portal Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[120px] pointer-events-none z-0 no-print"></div>

            <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 no-print">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(getPortalAwareHomePath({ fallbackPath: '/ohs-tools', site: siteFilter }))} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Tools</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-red-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-fire-extinguisher"></i></div>
                    <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Emergency Equipment</h1>
                </div>
                {canEdit && view !== 'import' && (
                    <button onClick={() => setView('import')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg flex items-center gap-2"><i className="fas fa-file-excel text-emerald-500"></i> Bulk Import</button>
                )}
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full no-print">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500 space-y-6 pb-20">

                    {/* Top Metrics & Filters */}
                    {view === 'list' && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
                                <div>
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">Facility Registry</h2>
                                    <p className="text-sm text-slate-400">QR-Enabled inspection tracking for life-safety apparatus.</p>
                                </div>
                                {canEdit && <button onClick={() => { const today = getTodayDate(); setFormData({ id: '', siteId: siteFilter === 'All' ? '' : siteFilter, type: 'Fire Extinguisher', location: '', assetId: '', lastInspection: today, nextInspection: addDaysToDate(today, INSPECTION_INTERVAL_DAYS), status: 'Active', notes: '', extinguisherType: '', lastRefillDate: '', lastHptDate: '', nextRefillDate: '', nextHptDate: '' }); setView('form'); }} className="bg-gradient-to-tr from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-transform active:scale-95 whitespace-nowrap"><i className="fas fa-plus"></i> Add Equipment</button>}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-lg flex items-center justify-between border-l-4 border-l-blue-500">
                                    <div><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Total Registered</p><h3 className="text-3xl font-black text-white">{stats.total}</h3></div>
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 text-xl"><i className="fas fa-clipboard-list"></i></div>
                                </div>
                                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-lg flex items-center justify-between border-l-4 border-l-orange-500">
                                    <div><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Due In 7 Days</p><h3 className="text-3xl font-black text-orange-400">{stats.expiringSoon}</h3></div>
                                    <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-400 text-xl"><i className="fas fa-clock"></i></div>
                                </div>
                                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-lg flex items-center justify-between border-l-4 border-l-red-500">
                                    <div><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Action Required</p><h3 className="text-3xl font-black text-red-500">{stats.actionNeeded}</h3></div>
                                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 text-xl"><i className="fas fa-exclamation-triangle"></i></div>
                                </div>
                            </div>

                            {/* SMART FILTER BAR */}
                            <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 flex flex-wrap gap-4 items-end shadow-inner">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Facility / Site</label>
                                    <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none focus:border-blue-500 min-w-[150px]">
                                        {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {sites.filter(s => isGlobalUser || s.code === session?.assignedSite || (session?.accessibleSites || []).includes(s.code)).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Equipment Type</label>
                                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none focus:border-blue-500 min-w-[180px]">
                                        <option value="All">All Types</option>
                                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-orange-400 uppercase tracking-widest block mb-1">Compliance Action Required</label>
                                    <select value={complianceFilter} onChange={e => setComplianceFilter(e.target.value)} className="bg-orange-950/20 border border-orange-500/30 text-orange-400 text-xs font-bold px-3 py-2 rounded-lg outline-none focus:border-orange-500 min-w-[200px]">
                                        <option value="All">Show All</option>
                                        <option value="Insp Overdue">Routine Insp. Overdue</option>
                                        <option value="Refill Overdue">Refill Overdue</option>
                                        <option value="HPT Overdue">HPT Overdue</option>
                                        <option value="Refill < 7 Days">Refill Due In 7 Days</option>
                                        <option value="HPT < 7 Days">HPT Due In 7 Days</option>
                                    </select>
                                </div>
                                <div className="ml-auto text-xs text-slate-500 font-bold bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                                    Showing {visibleEquipment.length} item{visibleEquipment.length !== 1 ? 's' : ''}
                                </div>
                            </div>

                            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-x-auto shadow-xl">
                                <table className="w-full text-left text-sm min-w-[1000px]">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                        <tr><th className="p-4 pl-6">Equipment / QR Tag</th><th className="p-4">Location</th><th className="p-4">Last Checked</th><th className="p-4">Compliance Status</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                        {visibleEquipment.map(e => {
                                            const equipmentMeta = getEquipmentMeta(e.type);
                                            return (
                                            <tr key={e.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-4 pl-6">
                                                    <div className="font-bold text-white flex items-center gap-2">
                                                        <i className={`fas ${equipmentMeta.icon} ${equipmentMeta.iconClass}`}></i>
                                                        {e.type}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5">Asset ID: <span className="font-mono text-orange-400">{e.assetId || 'N/A'}</span> | Site: <span className="font-bold text-blue-400">{e.siteId}</span></div>
                                                    {e.type === 'Fire Extinguisher' && e.extinguisherType && <div className="text-[9px] text-slate-400 uppercase font-mono mt-1 border border-slate-700 px-2 py-0.5 rounded inline-block bg-slate-900">{e.extinguisherType}</div>}
                                                </td>
                                                <td className="p-4 font-bold text-slate-400">{e.location}</td>
                                                <td className="p-4 font-mono text-xs">{e.lastInspection || 'Unknown'}</td>
                                                <td className="p-4 align-top py-4">{getStatusBadge(e)}</td>
                                                <td className="p-4 pr-6 text-right">
                                                    {canEdit && (
                                                        <div className="flex justify-end gap-2">
                                                            {/* QR TAG BUTTON */}
                                                            <button onClick={() => { setPrintTagData(e); setTimeout(() => window.print(), 500); }} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow" title="Print QR Tag"><i className="fas fa-qrcode"></i> Tag</button>

                                                            <button onClick={() => { setInspectData(createInspectionDraft(e)); setView('inspect'); }} className={`${equipmentMeta.inspectButtonClass} px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border`}><i className="fas fa-clipboard-check mr-1"></i> Inspect</button>
                                                            <button onClick={() => { setFormData(e); setView('form'); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-edit"></i></button>
                                                            <button onClick={() => handleDelete(e.firebaseKey)} className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )})}
                                        {visibleEquipment.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-slate-500 italic border-t border-slate-800">No equipment registered matching these filters.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* Registration Form */}
                    {view === 'form' && (
                        <div className="max-w-4xl mx-auto bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
                            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                                <h3 className="text-xl font-bold text-white"><i className="fas fa-clipboard-list text-orange-500 mr-2"></i> {formData.firebaseKey ? 'Edit Equipment' : 'Register New Equipment'}</h3>
                                <button onClick={() => setView('list')} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-800 pb-6">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Equipment Type</label>
                                        <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500">
                                            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Site Allocation</label>
                                        <select value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500">
                                            <option value="">Select Site...</option>
                                            {sites.filter(s => isGlobalUser || s.code === session?.assignedSite || (session?.accessibleSites || []).includes(s.code)).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* --- IS 2190 FIRE EXTINGUISHER SPECIFIC BLOCK --- */}
                                {formData.type === 'Fire Extinguisher' && (
                                    <div className="md:col-span-2 bg-red-950/20 p-6 rounded-2xl border border-red-500/30 mb-2 space-y-4 shadow-inner">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg"><i className="fas fa-fire-extinguisher"></i></div>
                                            <div>
                                                <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest">IS 2190:2010 Compliance Engine</h4>
                                                <p className="text-[10px] text-red-300/70">Select the specific type to auto-calculate mandatory Refill & HPT intervals.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-2">Extinguisher Classification</label>
                                                <select value={formData.extinguisherType || ''} onChange={e => setFormData({ ...formData, extinguisherType: e.target.value })} className="w-full bg-slate-950 border border-red-900/50 rounded-xl p-3 text-white outline-none focus:border-red-500 text-xs">
                                                    <option value="">Select specific type...</option>
                                                    {FIRE_EXT_TYPES.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-2">Date of Last Refill</label>
                                                <input type="date" value={formData.lastRefillDate || ''} onChange={e => setFormData({ ...formData, lastRefillDate: e.target.value })} disabled={!formData.extinguisherType} className="w-full bg-slate-950 border border-red-900/50 rounded-xl p-3 text-white outline-none focus:border-red-500 font-mono text-xs disabled:opacity-50" />
                                                {formData.nextRefillDate && <p className="text-[9px] text-orange-400 mt-1.5 font-bold uppercase tracking-widest"><i className="fas fa-magic mr-1"></i> Next Due: {formData.nextRefillDate}</p>}
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-2">Date of Last HPT (Hydro-Test)</label>
                                                <input type="date" value={formData.lastHptDate || ''} onChange={e => setFormData({ ...formData, lastHptDate: e.target.value })} disabled={!formData.extinguisherType} className="w-full bg-slate-950 border border-red-900/50 rounded-xl p-3 text-white outline-none focus:border-red-500 font-mono text-xs disabled:opacity-50" />
                                                {formData.nextHptDate && <p className="text-[9px] text-orange-400 mt-1.5 font-bold uppercase tracking-widest"><i className="fas fa-magic mr-1"></i> Next Due: {formData.nextHptDate}</p>}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="md:col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Exact Location on Site</label>
                                    <input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Ground Floor Kitchen, Next to Exit A" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-orange-400 block mb-2 flex justify-between">Unique Asset ID <span>(Auto-Generated if blank)</span></label>
                                    <input value={formData.assetId || ''} onChange={e => setFormData({ ...formData, assetId: e.target.value })} placeholder="e.g. HQ-KIT-1024" className="w-full bg-slate-950 border border-orange-500/50 rounded-xl p-3 text-white outline-none focus:border-orange-500 font-mono" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Current Overall Status</label>
                                    <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500 font-bold">
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                {/* Routine Inspection Details */}
                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
                                    <div className="md:col-span-2 text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2"><i className="fas fa-search mr-2"></i> Routine Visual Inspection</div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Date of Last Inspection</label>
                                        <input type="date" value={formData.lastInspection} onChange={e => setFormData({ ...formData, lastInspection: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500 font-mono" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Next Inspection Due Date (Auto +30 Days)</label>
                                        <input type="date" value={formData.nextInspection} readOnly className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none font-mono cursor-not-allowed" />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Additional Notes</label>
                                    <textarea rows="2" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Any specific details..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500 resize-none"></textarea>
                                </div>
                            </div>

                            <div className="flex justify-end gap-4 pt-4 border-t border-slate-800">
                                <button onClick={() => setView('list')} className="px-6 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition">Cancel</button>
                                <button onClick={handleSave} className="px-8 py-3 rounded-xl font-bold bg-orange-600 text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 transition flex items-center gap-2"><i className="fas fa-save"></i> Save Record</button>
                            </div>
                        </div>
                    )}

                    {/* SMART IMPORT VIEW */}
                    {view === 'import' && canEdit && (
                        <div className="animate-in fade-in duration-500 max-w-6xl mx-auto">
                            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-file-excel text-emerald-500"></i> Smart Bulk Import</h3>
                                <button onClick={() => setView('list')} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                            </div>

                            <div className="glass-panel p-10 rounded-3xl border border-blue-500/30 shadow-2xl text-center mb-8">
                                <div className="w-24 h-24 rounded-2xl bg-blue-900/30 flex items-center justify-center text-5xl text-blue-400 mx-auto mb-6 shadow-inner border border-blue-500/20"><i className="fas fa-file-excel"></i></div>
                                <h2 className="text-3xl font-bold text-white mb-4">Upload Inventory Spreadsheet</h2>
                                <p className="text-slate-400 mb-8 max-w-xl mx-auto leading-relaxed">Upload an Excel (.xlsx) file containing your emergency equipment. Our engine will map locations, auto-generate QR Asset IDs, and automatically calculate IS 2190 Refill and HPT schedules based on your inputs.</p>

                                <div className="relative border-2 border-dashed border-blue-500/50 rounded-2xl p-12 hover:bg-blue-900/10 transition-colors cursor-pointer max-w-2xl mx-auto bg-slate-900/50 group">
                                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleExcelImport} disabled={importing} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                    {importing ? (
                                        <div className="text-blue-400 font-bold text-xl flex items-center justify-center gap-3"><i className="fas fa-spinner fa-spin"></i> Processing & Calculating Dates...</div>
                                    ) : (
                                        <div>
                                            <i className="fas fa-cloud-upload-alt text-5xl text-slate-500 mb-4 group-hover:text-blue-400 transition-colors"></i>
                                            <div className="text-xl font-bold text-white mb-1">Drag & Drop File Here</div>
                                            <div className="text-sm text-slate-500 font-medium">or click to browse your computer</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-xl">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-emerald-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2"><i className="fas fa-info-circle"></i> Standard Upload Format</h3>
                                    <button type="button" onClick={downloadTemplate} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-transform active:scale-95 shadow-lg"><i className="fas fa-download"></i> Download Template</button>
                                </div>
                                <p className="text-sm text-slate-400 mb-6">To ensure accurate mapping and automated IS 2190 calculations, your uploaded file must contain column headers matching the structure below. <strong className="text-white">Note: The downloaded template contains native Excel Dropdowns for Equipment Types to prevent typos.</strong></p>

                                <div className="overflow-x-auto custom-scroll pb-4">
                                    <table className="w-full text-left text-xs text-slate-300 border border-slate-700 whitespace-nowrap bg-slate-950 rounded-xl overflow-hidden">
                                        <thead className="bg-slate-900 font-bold text-slate-500 border-b border-slate-800">
                                            <tr>
                                                <th className="p-4 border-r border-slate-800">Site ID (Req)</th>
                                                <th className="p-4 border-r border-slate-800">Equipment Type (Req)</th>
                                                <th className="p-4 border-r border-slate-800">Location (Req)</th>
                                                <th className="p-4 border-r border-slate-800">Asset/Serial ID</th>
                                                <th className="p-4 border-r border-slate-800">Status</th>
                                                <th className="p-4 border-r border-slate-800">Last Inspection</th>
                                                <th className="p-4 border-r border-slate-800 text-red-400">Extinguisher Type (IS 2190)</th>
                                                <th className="p-4 border-r border-slate-800 text-red-400">Last Refill Date</th>
                                                <th className="p-4 border-r border-slate-800 text-red-400">Last HPT Date</th>
                                                <th className="p-4">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="hover:bg-slate-900/50 transition-colors">
                                                <td className="p-4 border-r border-slate-800 font-bold">HQ-01</td>
                                                <td className="p-4 border-r border-slate-800 text-white">Fire Extinguisher</td>
                                                <td className="p-4 border-r border-slate-800">Main Lobby Exit</td>
                                                <td className="p-4 border-r border-slate-800 text-slate-500 italic">Auto-generated if blank</td>
                                                <td className="p-4 border-r border-slate-800 text-emerald-400">Active</td>
                                                <td className="p-4 border-r border-slate-800">2025-01-15</td>
                                                <td className="p-4 border-r border-slate-800">ABC Powder / DCP (Stored Pressure)</td>
                                                <td className="p-4 border-r border-slate-800">2023-05-10</td>
                                                <td className="p-4 border-r border-slate-800">2023-05-10</td>
                                                <td className="p-4 text-slate-400">Mounted securely.</td>
                                            </tr>
                                            <tr className="hover:bg-slate-900/50 transition-colors">
                                                <td className="p-4 border-r border-slate-800 font-bold">HQ-01</td>
                                                <td className="p-4 border-r border-slate-800 text-white">First Aid Kit</td>
                                                <td className="p-4 border-r border-slate-800">Break Room Wall</td>
                                                <td className="p-4 border-r border-slate-800 text-slate-500 italic">Auto-generated if blank</td>
                                                <td className="p-4 border-r border-slate-800 text-emerald-400">Active</td>
                                                <td className="p-4 border-r border-slate-800">2025-02-01</td>
                                                <td className="p-4 border-r border-slate-800 bg-slate-900 text-slate-600 italic">Leave blank</td>
                                                <td className="p-4 border-r border-slate-800 bg-slate-900 text-slate-600 italic">Leave blank</td>
                                                <td className="p-4 border-r border-slate-800 bg-slate-900 text-slate-600 italic">Leave blank</td>
                                                <td className="p-4 text-slate-400">Fully stocked.</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PHYSICAL INSPECTION SHEET (QR SCANNED) */}
                    {view === 'inspect' && inspectData && (
                        <div className={`max-w-2xl mx-auto bg-slate-900 border shadow-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-8 ${activeEquipmentMeta.panelClass}`}>
                            <div className="bg-slate-800 p-6 border-b border-slate-700 flex justify-between items-center">
                                <div>
                                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${activeEquipmentMeta.accentTextClass}`}>Physical Inspection Sheet</div>
                                    <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                                        <i className={`fas ${activeEquipmentMeta.icon} ${activeEquipmentMeta.iconClass}`}></i>
                                        {inspectData.type}
                                    </h3>
                                </div>
                                <div className="text-right">
                                    {(inspectData.qrScanMode || isFieldQrMode) && (
                                        <div className={`mb-2 text-[10px] uppercase font-bold tracking-widest ${canOperateInspectionSheet ? 'text-emerald-400' : 'text-sky-300'}`}>
                                            {canOperateInspectionSheet ? 'QR Operator Mode' : 'QR Read-Only'}
                                        </div>
                                    )}
                                    <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Asset ID</div>
                                    <div className={`bg-slate-950 border px-3 py-1 rounded font-mono font-bold ${activeEquipmentMeta.badgeClass}`}>{inspectData.assetId}</div>
                                </div>
                            </div>

                            <div className="p-6 md:p-8 space-y-8">
                                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner text-sm">
                                    <p className="text-slate-400 mb-1">Location: <strong className="text-white">{inspectData.location}</strong></p>
                                    <p className="text-slate-400 mb-1">Last Inspected: <strong className="text-white font-mono">{inspectData.lastInspection}</strong></p>
                                    <p className="text-slate-400 mb-1">Current Scheduled Due: <strong className={`font-mono ${isInspectionOverdue ? 'text-red-400' : 'text-emerald-400'}`}>{inspectData.nextInspection || 'Not Set'}</strong></p>
                                    {inspectData.type === 'Fire Extinguisher' && <p className="text-slate-400">Extinguisher Type: <strong className="text-orange-400">{inspectData.extinguisherType || 'Unknown'}</strong></p>}
                                </div>

                                {inspectData.nextInspection && (
                                    <div className={`rounded-2xl border px-4 py-4 text-sm shadow-inner ${isInspectionOverdue ? 'border-red-500/40 bg-red-950/30 text-red-100' : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'}`}>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.25em]">
                                            {isInspectionOverdue ? 'Inspection Overdue' : 'Inspection On Schedule'}
                                        </div>
                                        <p className="mt-2 font-medium">
                                            {isInspectionOverdue
                                                ? `This asset missed its due date of ${inspectData.nextInspection}. Submit this inspection to reset the 30-day cycle from the new inspection date.`
                                                : `The current inspection cycle is due on ${inspectData.nextInspection}. When you submit this inspection, the next due date will roll forward by 30 days from the inspection date below.`}
                                        </p>
                                        {isInspectionOverdue && missedInspectionCycles > 0 && (
                                            <p className="mt-3 font-bold uppercase tracking-[0.2em] text-red-300">
                                                Missed Inspection Cycles: {missedInspectionCycles}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {activeChecklistItems.length > 0 && (
                                    <div>
                                        <h4 className={`text-xs font-bold uppercase tracking-widest mb-4 border-b border-slate-800 pb-2 ${activeEquipmentMeta.accentTextClass}`}>{activeEquipmentMeta.checklistTitle}</h4>
                                        <div className={`space-y-3 p-5 rounded-2xl border ${activeEquipmentMeta.panelClass}`}>
                                            {activeChecklistItems.map((item) => (
                                                <label key={item.id} className="flex items-center gap-4 cursor-pointer p-2 hover:bg-slate-900 rounded transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={inspectData.checks?.[item.id] || false}
                                                        onChange={e => setInspectData({ ...inspectData, checks: { ...inspectData.checks, [item.id]: e.target.checked } })}
                                                        disabled={!canOperateInspectionSheet}
                                                        className={`w-5 h-5 ${activeEquipmentMeta.checkboxClass}`}
                                                    />
                                                    <span className="text-sm font-bold text-slate-300">{item.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Last Inspection Date</label>
                                        <input type="date" value={inspectData.lastInspection || ''} readOnly className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none font-mono font-bold cursor-not-allowed" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">New Inspection Date</label>
                                        <input type="date" value={inspectData.date} onChange={e => setInspectData({ ...inspectData, date: e.target.value })} disabled={!canOperateInspectionSheet} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500 font-mono font-bold disabled:opacity-60" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-emerald-400 block mb-2">Next Inspection Due</label>
                                        <input type="date" value={calculatedNextInspectionDate} readOnly className="w-full bg-emerald-950/20 border border-emerald-500/50 rounded-xl p-3 text-emerald-300 outline-none font-mono font-bold cursor-not-allowed" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Overall Condition Status</label>
                                    <select value={inspectData.status} onChange={e => setInspectData({ ...inspectData, status: e.target.value })} disabled={!canOperateInspectionSheet} className={`w-full bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none font-bold disabled:opacity-60 ${inspectData.status === 'Active' ? 'text-emerald-400' : 'text-red-400 border-red-500/50'}`}>
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Inspector Remarks</label>
                                    <textarea rows="2" value={inspectData.notes} onChange={e => setInspectData({ ...inspectData, notes: e.target.value })} disabled={!canOperateInspectionSheet} placeholder="Any specific details, damages, or requests..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500 resize-none disabled:opacity-60"></textarea>
                                </div>
                            </div>

                            <div className="flex bg-slate-800">
                                <button onClick={() => { setInspectData(null); setView('list'); navigate(buildModulePath(inspectData.siteId || siteFilter), { replace: true }); }} className="flex-1 py-5 font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition uppercase tracking-widest text-xs">Cancel</button>
                                {canOperateInspectionSheet ? (
                                    <button onClick={handleLogInspection} className="flex-1 py-5 font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition uppercase tracking-widest text-xs flex justify-center items-center gap-2"><i className="fas fa-check-double text-lg"></i> Sign & Submit</button>
                                ) : (
                                    <div className="flex-1 py-5 font-bold bg-slate-900 text-slate-400 uppercase tracking-widest text-xs flex justify-center items-center gap-2 border-l border-slate-700"><i className="fas fa-eye"></i> Read Only</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* --- PRINT OVERLAY FOR QR TAG --- */}
            {printTagData && (
                <div className="hidden print:flex p-8 bg-white text-black w-full absolute inset-0 z-[9999] flex-col items-center" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>

                    <div className="border-4 border-black w-[400px] rounded-2xl overflow-hidden flex flex-col mt-10 shadow-2xl">
                        <div className="bg-red-600 text-white text-center py-4 border-b-4 border-black">
                            <h1 className="text-2xl font-black uppercase tracking-widest m-0 leading-none">Emergency</h1>
                            <h2 className="text-lg font-bold uppercase tracking-wider m-0">Equipment Tag</h2>
                        </div>

                        <div className="p-6 bg-white flex flex-col items-center">
                            <div className="text-center mb-6">
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Asset ID</p>
                                <h3 className="text-2xl font-mono font-black border-b-2 border-dashed border-gray-400 pb-1">{printTagData.assetId}</h3>
                            </div>

                            <p className="text-lg font-bold text-center uppercase mb-1">{printTagData.type}</p>
                            <p className="text-sm text-center text-gray-600 font-bold mb-6 italic">Location: {printTagData.location}</p>

                            <div className="p-4 border-4 border-black rounded-xl mb-4 bg-white flex justify-center items-center">
                                <QRCodeSVG
                                    value={`${window.location.origin}/emergency-equipment?scan=${printTagData.firebaseKey}&site=${printTagData.siteId}&org=${session.orgId}&fieldQr=1`}
                                    size={160}
                                    level="H"
                                />
                            </div>

                            <p className="text-sm font-black uppercase tracking-widest bg-black text-white px-4 py-1 rounded-full mb-6">Scan To Inspect</p>

                            {printTagData.type === 'Fire Extinguisher' && (
                                <div className="w-full border-t-2 border-black pt-4">
                                    <div className="flex justify-between text-xs font-bold uppercase mb-1">
                                        <span>Next Refill:</span>
                                        <span className="font-mono">{printTagData.nextRefillDate || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-bold uppercase">
                                        <span>Next Hydro Test:</span>
                                        <span className="font-mono">{printTagData.nextHptDate || 'N/A'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="mt-8 text-xs text-gray-500 italic">Please affix this tag securely to the physical equipment using a zip-tie.</p>
                    <button onClick={() => setPrintTagData(null)} className="no-print mt-10 bg-red-600 text-white px-6 py-2 rounded font-bold">Close Preview</button>
                </div>
            )}
        </div>
    );
}
