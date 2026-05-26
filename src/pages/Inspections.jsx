import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { dbPush, dbUpdate, dbRemove } from '../services/db/index.js';
import { writeActivityLog, buildActivityEntry } from '../utils/activityLog.js';
import { getFieldPortalVerificationMessage, getPortalAwareHomePath, isFieldPortalHomeContext } from './FieldApp/portalAuth';
import { readOrgChildren } from '../utils/orgData';
import { canEditCreateForRole, isGlobalOwnerRole } from '../utils/permissions';
import { readStoredSession } from '../utils/session';
import { buildRegionOptions, filterSitesByRegion, matchesRegionFilter, normalizeSites } from '../utils/siteRegions';
import * as XLSX from 'xlsx';
import { notifyInspectionSubmitted } from '../utils/reportNotificationEmail';

const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Bi-Annually', 'Annually'];
const STATUSES = ['Draft', 'Active', 'Inactive'];
const QUESTION_TYPES = ['Pass/Fail', 'Text Input', 'Number'];
const PHOTO_REQUIREMENTS = ['Not Required', 'Optional', 'Mandatory'];

// --- SUB-COMPONENTS ---
const UserSelect = ({ users, value, onChange, disabled, placeholder }) => (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-lg text-white text-xs outline-none focus:border-blue-500">
        <option value="">{placeholder || 'Select User...'}</option>
        {users.map(u => <option key={u.id} value={u.name || u.email}>{u.name || u.email} ({u.role || 'User'})</option>)}
    </select>
);

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
});

// --- DATE MATH UTILITIES ---
const parseDateOnly = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
};

const formatDateOnly = (date) => {
    const parsed = date instanceof Date ? date : parseDateOnly(date);
    if (!parsed || isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const addFrequencyToDate = (date, frequency) => {
    const nextDate = new Date(date);
    switch (frequency) {
        case 'Daily': nextDate.setDate(nextDate.getDate() + 1); break;
        case 'Weekly': nextDate.setDate(nextDate.getDate() + 7); break;
        case 'Monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
        case 'Quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
        case 'Bi-Annually': nextDate.setMonth(nextDate.getMonth() + 6); break;
        case 'Annually': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
        default: nextDate.setMonth(nextDate.getMonth() + 1);
    }
    return nextDate;
};

const getRecordScheduleDate = (record) => {
    if (record.scheduledFor) return record.scheduledFor;
    if (record.originalDueString) return record.originalDueString;
    if (record.dueString) return record.dueString;
    return record.completedAt ? String(record.completedAt).split('T')[0] : '';
};

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const subtractDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
};

const getPendingOccurrences = ({ assignedFrom, assignedTo, frequency, pastRecords = [], rangeEnd, deferredTo }) => {
    const startDate = parseDateOnly(assignedFrom);
    if (!startDate) return [];

    const endDate = parseDateOnly(assignedTo);
    const effectiveRangeEnd = rangeEnd instanceof Date ? rangeEnd : parseDateOnly(rangeEnd);
    if (!effectiveRangeEnd || isNaN(effectiveRangeEnd.getTime())) return [];

    const completedSlots = new Set(pastRecords.map(getRecordScheduleDate).filter(Boolean));
    let cursor = new Date(startDate);
    let safetyCounter = 0;
    let deferredApplied = false;
    const occurrences = [];

    while (safetyCounter < 1000) {
        if (endDate && cursor > endDate) break;

        const originalDateString = formatDateOnly(cursor);
        if (!completedSlots.has(originalDateString)) {
            let activeDateString = originalDateString;
            let isDeferred = false;

            if (!deferredApplied && deferredTo && deferredTo >= originalDateString) {
                activeDateString = deferredTo;
                isDeferred = deferredTo !== originalDateString;
                deferredApplied = true;
            }

            const activeDate = parseDateOnly(activeDateString);
            const withinAssignmentWindow = !endDate || (activeDate && activeDate <= endDate);
            const withinRange = activeDate && activeDate <= effectiveRangeEnd;

            if (withinAssignmentWindow && withinRange) {
                occurrences.push({
                    date: activeDate,
                    dateString: activeDateString,
                    originalDateString,
                    alertStartString: formatDateOnly(subtractDays(activeDate, 7)),
                    isDeferred
                });
            }
        }

        cursor = addFrequencyToDate(cursor, frequency);
        safetyCounter += 1;

        if (cursor > effectiveRangeEnd && (!endDate || cursor > endDate)) break;
    }

    return occurrences;
};

const createEmptyTemplate = (siteId = '') => ({
    id: '',
    title: '',
    desc: '',
    siteId,
    frequency: 'Monthly',
    status: 'Draft',
    assignedFrom: '',
    assignedTo: '',
    fields: []
});

const normalizeQuestionType = (value) => QUESTION_TYPES.includes(value) ? value : 'Pass/Fail';
const normalizePhotoRequirement = (value) => PHOTO_REQUIREMENTS.includes(value) ? value : 'Not Required';
const normalizeTemplateField = (field = {}, index = 0) => ({
    id: field.id || `field-${Date.now()}-${index}`,
    label: field.label || '',
    type: normalizeQuestionType(field.type),
    photoRequirement: normalizePhotoRequirement(field.photoRequirement)
});

const normalizeTemplateFields = (fields = []) => fields.map((field, index) => normalizeTemplateField(field, index));

const hasAnsweredQuestion = (field, response) => {
    const answer = response?.answer;
    if (field.type === 'Pass/Fail') return ['Pass', 'Fail', 'N/A'].includes(answer);
    return String(answer ?? '').trim() !== '';
};

const getQuestionPhotoCount = (responses = {}) => Object.values(responses).filter((response) => Boolean(response?.photoEvidence)).length;

const getInspectionFindings = (record) => {
    if (!record) return [];
    return Object.values(record.responses || {})
        .filter((response) => response?.answer === 'Fail' || String(response?.observation || '').trim())
        .map((response) => ({
            label: response.label,
            answer: response.answer || 'N/A',
            observation: String(response.observation || '').trim(),
            photoEvidence: response.photoEvidence || null,
            photoEvidenceName: response.photoEvidenceName || ''
        }));
};

const getInspectionPassFailStats = (template, responses) => {
    const fields = template?.fields || [];
    const stats = { total: fields.length, answered: 0, pass: 0, fail: 0, na: 0 };

    fields.forEach((field) => {
        const answer = responses?.[field.id]?.answer;
        if (answer === 'Pass') {
            stats.answered += 1;
            stats.pass += 1;
        } else if (answer === 'Fail') {
            stats.answered += 1;
            stats.fail += 1;
        } else if (answer === 'N/A') {
            stats.answered += 1;
            stats.na += 1;
        }
    });

    return stats;
};

export default function Inspections() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('calendar');

    const [templates, setTemplates] = useState([]);
    const [records, setRecords] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [regionFilter, setRegionFilter] = useState('All');

    // Calendar & Deferral State
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [deferTask, setDeferTask] = useState(null);
    const [deferDate, setDeferDate] = useState('');

    // Builder State
    const [editTemplate, setEditTemplate] = useState(null);

    // Execution & View State
    const [executingTask, setExecutingTask] = useState(null);
    const [inspectionForm, setInspectionForm] = useState({});
    const [viewingRecord, setViewingRecord] = useState(null);
    const [submitDetailsModalOpen, setSubmitDetailsModalOpen] = useState(false);
    const [additionalFindingsDraft, setAdditionalFindingsDraft] = useState('');
    const [submittingInspection, setSubmittingInspection] = useState(false);
    const isFieldPortalMode = isFieldPortalHomeContext();

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) { navigate('/'); return; }
        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        const isGlobal = isGlobalOwnerRole(sess.role);
        if (!isGlobal && ctxSite === 'All') ctxSite = sess.assignedSite;

        setSiteFilter(ctxSite);

        const fetchData = async () => {
            try {
                const data = await readOrgChildren(null, sess.orgId, ['inspectionTemplates', 'inspectionRecords', 'sites', 'users']);
                if (data.inspectionTemplates) setTemplates(Object.entries(data.inspectionTemplates).map(([k, v]) => ({
                    firebaseKey: k,
                    ...v,
                    fields: normalizeTemplateFields(v.fields || [])
                })));
                if (data.inspectionRecords) setRecords(Object.entries(data.inspectionRecords).map(([k, v]) => ({ firebaseKey: k, ...v })));
                if (data.sites) setSites(normalizeSites(data.sites));
                if (data.users) setUsers(Object.entries(data.users).map(([k, v]) => ({ id: k, ...v })).filter(u => u.status !== 'Inactive'));
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [navigate, location, view]);

    const isGlobalUser = isGlobalOwnerRole(session?.role);
    const canEdit = canEditCreateForRole(session?.role);

    const regionOptions = useMemo(() => buildRegionOptions(sites), [sites]);

    const filteredVisibleSites = useMemo(
        () => filterSitesByRegion(sites, regionFilter),
        [sites, regionFilter]
    );

    const filteredRecords = useMemo(() => records.filter((record) => {
        if (regionFilter !== 'All' && !matchesRegionFilter(record.siteId, sites, regionFilter)) return false;
        return siteFilter === 'All' || record.siteId === siteFilter;
    }), [records, regionFilter, siteFilter, sites]);

    const latestInspectionRecord = useMemo(() => (
        [...filteredRecords].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0] || null
    ), [filteredRecords]);

    const latestInspectionFindings = useMemo(
        () => getInspectionFindings(latestInspectionRecord),
        [latestInspectionRecord]
    );

    const latestRecordByTemplateSite = useMemo(() => {
        const sortedRecords = [...records].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        const map = new Map();
        sortedRecords.forEach((record) => {
            const key = `${record.templateId}::${record.siteId}`;
            if (!map.has(key)) map.set(key, record);
        });
        return map;
    }, [records]);

    useEffect(() => {
        if (siteFilter !== 'All' && !filteredVisibleSites.some((site) => site.code === siteFilter)) {
            setSiteFilter(isGlobalUser ? 'All' : (filteredVisibleSites[0]?.code || 'All'));
        }
    }, [filteredVisibleSites, isGlobalUser, siteFilter]);

    // --- SCHEDULING ENGINE (WITH GLOBAL EXPLOSION) ---
    const scheduledTasks = useMemo(() => {
        const tasks = [];
        const todayString = formatDateOnly(new Date());
        const todayDate = parseDateOnly(todayString);
        const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        const rangeEnd = monthEnd > addDays(todayDate, 7) ? monthEnd : addDays(todayDate, 7);
        const activeTemplates = templates.filter(t => t.status === 'Active');

        activeTemplates.forEach(t => {
            if (!t.assignedFrom) return;
            if (t.assignedTo && t.assignedTo < todayString) return;
            if (regionFilter !== 'All' && !matchesRegionFilter(t.siteId, sites, regionFilter) && t.siteId !== 'GLOBAL') return;

            let targetSites = [];
            if (t.siteId === 'GLOBAL') {
                targetSites = siteFilter === 'All' ? filteredVisibleSites.map(s => s.code) : [siteFilter];
            } else if (siteFilter === 'All' || t.siteId === siteFilter) {
                targetSites = [t.siteId];
            }

            targetSites.forEach(targetSiteId => {
                const pastRecords = records.filter(r => r.templateId === t.firebaseKey && r.siteId === targetSiteId).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
                const pendingOccurrences = getPendingOccurrences({
                    assignedFrom: t.assignedFrom,
                    assignedTo: t.assignedTo,
                    frequency: t.frequency,
                    pastRecords,
                    rangeEnd,
                    deferredTo: t.deferredTo
                });

                pendingOccurrences.forEach(occurrence => {
                    tasks.push({
                        templateId: t.firebaseKey,
                        title: t.title,
                        siteId: targetSiteId,
                        frequency: t.frequency,
                        dueDate: occurrence.date,
                        dueString: occurrence.dateString,
                        alertStartString: occurrence.alertStartString,
                        originalDueString: occurrence.originalDateString,
                        isDeferred: occurrence.isDeferred,
                        lastCompleted: pastRecords[0] ? pastRecords[0].completedAt : 'Never',
                        assignmentStart: t.assignedFrom,
                        assignmentEnd: t.assignedTo || '',
                        template: t
                    });
                });
            });
        });
        return tasks.sort((a, b) => a.dueDate - b.dueDate);
    }, [currentMonth, filteredVisibleSites, records, regionFilter, siteFilter, sites, templates]);

    // --- CALENDAR LOGIC ---
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const renderCalendar = () => {
        let days = [];
        const todayString = formatDateOnly(new Date());
        for (let i = 0; i < firstDayOfMonth; i++) days.push(<div key={`empty-${i}`} className="p-2 border border-slate-800/50 bg-slate-900/20 min-h-[100px]"></div>);

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            const tasksToday = scheduledTasks.filter(t => t.dueString === dateStr);

            days.push(
                <div key={day} className={`p-2 border border-slate-700 min-h-[100px] flex flex-col ${isToday ? 'bg-blue-900/20' : 'bg-slate-900/60'}`}>
                    <div className={`text-right text-xs font-bold mb-1 ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>{day}</div>
                    <div className="flex-1 space-y-1 overflow-y-auto custom-scroll pr-1">

                        {tasksToday.map((t, idx) => {
                            const alertStart = t.assignmentStart && t.alertStartString < t.assignmentStart ? t.assignmentStart : t.alertStartString;
                            const isOverdue = todayString > t.dueString;
                            const isDueWindow = todayString >= alertStart;
                            return (
                                <div key={`due-${idx}`} onClick={() => startInspection(t)} className={`text-[9px] p-1.5 rounded cursor-pointer truncate font-bold shadow-sm transition-transform hover:scale-105 ${isOverdue || isDueWindow ? 'bg-red-500 text-white' : 'bg-lime-500 text-slate-950'}`} title={`${t.title} | Due: ${t.dueString}`}>
                                    {t.title} {t.isDeferred && ' (Def)'}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
        return days;
    };

    const handleDefer = async () => {
        if (!deferDate) return alert("Please select a date to defer to.");
        try {
            await dbUpdate(`organizations/${session.orgId}/inspectionTemplates/${deferTask.templateId}`, {
                deferredTo: deferDate
            });
            setDeferTask(null);
            setDeferDate('');
        } catch (e) {
            alert("Failed to defer inspection: " + e.message);
        }
    };


    // --- TEMPLATE BUILDER & MANAGEMENT HANDLERS ---
    const saveTemplate = async () => {
        if (!editTemplate.title || !editTemplate.siteId) return alert("Title and Site are required.");
        if (editTemplate.fields.length === 0) return alert("Please add at least one inspection question.");
        if (editTemplate.assignedTo && !editTemplate.assignedFrom) return alert("Please set an assignment start date before adding an assignment end date.");
        if (editTemplate.assignedFrom && editTemplate.assignedTo && editTemplate.assignedTo < editTemplate.assignedFrom) return alert("Assignment end date cannot be earlier than the start date.");

        try {
            const payload = {
                ...editTemplate,
                fields: normalizeTemplateFields(editTemplate.fields || []),
                assignedFrom: editTemplate.assignedFrom || '',
                assignedTo: editTemplate.assignedTo || '',
                updatedBy: session.name,
                updatedAt: new Date().toISOString()
            };
            if (!payload.createdAt) payload.createdAt = new Date().toISOString();

            if (editTemplate.firebaseKey) {
                await dbUpdate(`organizations/${session.orgId}/inspectionTemplates/${editTemplate.firebaseKey}`, payload);
                writeActivityLog(session.orgId, buildActivityEntry({ session, action: 'inspection.template.updated', module: 'Inspections', collection: 'inspectionTemplates', recordId: editTemplate.firebaseKey, recordTitle: editTemplate.title || '', siteId: editTemplate.siteId }));
            } else {
                const newKey = await dbPush(`organizations/${session.orgId}/inspectionTemplates`, payload);
                writeActivityLog(session.orgId, buildActivityEntry({ session, action: 'inspection.template.created', module: 'Inspections', collection: 'inspectionTemplates', recordId: newKey, recordTitle: payload.title || '', siteId: payload.siteId }));
            }
            alert("Inspection Form Saved Successfully!");
            setView('templates');
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const updateTemplateStatus = async (key, newStatus) => {
        try {
            await dbUpdate(`organizations/${session.orgId}/inspectionTemplates/${key}`, { status: newStatus });
            setTemplates(prev => prev.map(t => t.firebaseKey === key ? { ...t, status: newStatus } : t));
        } catch {
            alert("Failed to update status");
        }
    };

    const deleteTemplate = async (key) => {
        if (!window.confirm("Are you sure you want to permanently delete this inspection form?")) return;
        try {
            const record = templates.find(t => t.firebaseKey === key);
            await dbRemove(`organizations/${session.orgId}/inspectionTemplates/${key}`);
            setTemplates(prev => prev.filter(t => t.firebaseKey !== key));
            writeActivityLog(session.orgId, buildActivityEntry({ session, action: 'inspection.template.deleted', module: 'Inspections', collection: 'inspectionTemplates', recordId: key, recordTitle: record?.title || '', siteId: record?.siteId }));
        } catch {
            alert("Failed to delete template");
        }
    };

    // --- BULK EXCEL QUESTION IMPORT ---
    const downloadQuestionTemplate = () => {
        const workbook = XLSX.utils.book_new();
        const questionsSheet = XLSX.utils.aoa_to_sheet([
            ['Question / Check Requirement (Required)', 'Answer Type (Required)', 'Photo Requirement (Optional)'],
            ['Are fire exits clear and unobstructed?', 'Pass/Fail', 'Optional'],
            ['Current pressure reading of compressor?', 'Number', 'Not Required'],
            ['General observations of the work area:', 'Text Input', 'Mandatory']
        ]);
        questionsSheet['!cols'] = [{ wch: 60 }, { wch: 25 }, { wch: 24 }];

        const allowedValuesSheet = XLSX.utils.aoa_to_sheet([
            ['Allowed Answer Types'],
            ...QUESTION_TYPES.map(type => [type]),
            [],
            ['Allowed Photo Requirement Values'],
            ...PHOTO_REQUIREMENTS.map((type) => [type])
        ]);
        allowedValuesSheet['!cols'] = [{ wch: 24 }];

        XLSX.utils.book_append_sheet(workbook, questionsSheet, 'Inspection_Questions');
        XLSX.utils.book_append_sheet(workbook, allowedValuesSheet, 'Allowed_Values');
        XLSX.writeFile(workbook, 'Inspection_Questions_Template.xlsx');
    };

    const handleQuestionImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) throw new Error("Excel sheet is empty.");

                const newFields = [];
                data.forEach((row, idx) => {
                    const keys = Object.keys(row);
                    const qKey = keys.find(k => k.toLowerCase().includes('question') || k.toLowerCase().includes('requirement'));
                    const tKey = keys.find(k => k.toLowerCase().includes('type'));

                    const questionText = row[qKey];
                    if (!questionText) return;

                    const pKey = keys.find(k => k.toLowerCase().includes('photo'));

                    let qType = normalizeQuestionType(row[tKey] || 'Pass/Fail');
                    const photoRequirement = normalizePhotoRequirement(row[pKey] || 'Not Required');

                    newFields.push({
                        id: `imported-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
                        label: questionText,
                        type: qType,
                        photoRequirement
                    });
                });

                if (newFields.length > 0) {
                    setEditTemplate(prev => ({
                        ...prev,
                        fields: [...(prev.fields || []), ...newFields]
                    }));
                    alert(`Successfully imported ${newFields.length} questions!`);
                } else {
                    alert("No valid questions found. Please check the column headers.");
                }
            } catch (err) {
                alert("Failed to parse Excel file. \n" + err.message);
            }
            e.target.value = null;
        };
        reader.readAsBinaryString(file);
    };

    const currentTaskLastRecord = useMemo(() => {
        if (!executingTask) return null;
        return latestRecordByTemplateSite.get(`${executingTask.templateId}::${executingTask.siteId}`) || null;
    }, [executingTask, latestRecordByTemplateSite]);

    const currentTaskFindings = useMemo(
        () => getInspectionFindings(currentTaskLastRecord),
        [currentTaskLastRecord]
    );

    const isMultipleChoiceInspection = useMemo(() => (
        Boolean(executingTask?.template?.fields?.length)
        && executingTask.template.fields.every((field) => field.type === 'Pass/Fail')
    ), [executingTask]);

    const inspectionProgress = useMemo(() => {
        const fields = executingTask?.template?.fields || [];
        const total = fields.length;
        let answered = 0;
        let photoMandatory = 0;
        let photoSatisfied = 0;

        fields.forEach((field) => {
            const response = inspectionForm[field.id];
            if (hasAnsweredQuestion(field, response)) answered += 1;
            if (field.photoRequirement === 'Mandatory') {
                photoMandatory += 1;
                if (response?.photoEvidence) photoSatisfied += 1;
            }
        });

        const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
        return { total, answered, remaining: Math.max(total - answered, 0), percent, photoMandatory, photoSatisfied };
    }, [executingTask, inspectionForm]);

    const multipleChoiceStats = useMemo(
        () => getInspectionPassFailStats(executingTask?.template, inspectionForm),
        [executingTask, inspectionForm]
    );

    const updateInspectionResponse = (fieldId, patch) => {
        setInspectionForm((prev) => ({
            ...prev,
            [fieldId]: {
                ...(prev[fieldId] || {}),
                ...(typeof patch === 'function' ? patch(prev[fieldId] || {}) : patch)
            }
        }));
    };

    const handleQuestionPhotoUpload = async (fieldId, event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const base64 = await fileToBase64(file);
        updateInspectionResponse(fieldId, {
            photoEvidence: base64,
            photoEvidenceName: file.name,
            observationOpen: true
        });
        event.target.value = '';
    };

    const removeQuestionPhoto = (fieldId) => {
        updateInspectionResponse(fieldId, {
            photoEvidence: null,
            photoEvidenceName: ''
        });
    };

    const validateInspectionSubmission = () => {
        const validationErrors = [];
        (executingTask?.template?.fields || []).forEach((field, index) => {
            const response = inspectionForm[field.id];
            if (!hasAnsweredQuestion(field, response)) {
                validationErrors.push(`Question ${index + 1} is still unanswered.`);
            }
            if (field.photoRequirement === 'Mandatory' && !response?.photoEvidence) {
                validationErrors.push(`Question ${index + 1} requires a photo upload before submission.`);
            }
        });
        return validationErrors;
    };

    const requestInspectionSubmit = () => {
        const validationErrors = validateInspectionSubmission();
        if (validationErrors.length > 0) {
            alert(validationErrors.join('\n'));
            return;
        }
        setAdditionalFindingsDraft('');
        setSubmitDetailsModalOpen(true);
    };

    // --- EXECUTION HANDLERS ---
    const startInspection = (task) => {
        setExecutingTask(task);
        const initForm = {};
        task.template.fields.forEach(f => {
            initForm[f.id] = {
                label: f.label,
                answer: '',
                observation: '',
                observationOpen: f.photoRequirement !== 'Not Required',
                raiseCapa: false,
                capaOwner: '',
                capaDue: '',
                photoEvidence: null,
                photoEvidenceName: ''
            };
        });
        setInspectionForm(initForm);
        setAdditionalFindingsDraft('');
        setSubmitDetailsModalOpen(false);
        setView('execute');
    };

    const submitInspection = async () => {
        try {
            setSubmittingInspection(true);
            const completedAt = new Date().toISOString();

            const generatedCapas = [];
            executingTask.template.fields.forEach(f => {
                const response = inspectionForm[f.id];
                if (response.raiseCapa && response.observation) {
                    const actionText = `[Inspection: ${executingTask.title}] ${f.label} - ${response.observation}`;
                    generatedCapas.push({
                        act: actionText, action: actionText, desc: actionText,
                        siteId: executingTask.siteId,
                        own: response.capaOwner || 'Unassigned', owner: response.capaOwner || 'Unassigned',
                        due: response.capaDue || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        dueDate: response.capaDue || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        status: 'Open',
                        source: 'Inspection Form',
                        module: 'Inspections',
                        date: new Date().toISOString().split('T')[0]
                    });
                }
            });

            // Save Record
            const recordPayload = {
                templateId: executingTask.templateId,
                templateTitle: executingTask.title,
                siteId: executingTask.siteId,
                inspector: session.name,
                completedAt: completedAt,
                scheduledFor: executingTask.originalDueString,
                dueString: executingTask.dueString,
                originalDueString: executingTask.originalDueString,
                assignmentStart: executingTask.assignmentStart || '',
                assignmentEnd: executingTask.assignmentEnd || '',
                responses: inspectionForm,
                additionalFindings: additionalFindingsDraft,
                capa: generatedCapas
            };

            const newRecordId = await dbPush(`organizations/${session.orgId}/inspectionRecords`, recordPayload);
            setRecords(prev => [...prev, { firebaseKey: newRecordId, ...recordPayload }]);
            writeActivityLog(session.orgId, buildActivityEntry({ session, action: 'inspection.record.created', module: 'Inspections', collection: 'inspectionRecords', recordId: newRecordId, recordTitle: executingTask.title || '', siteId: recordPayload.siteId }));

            // Fire-and-forget email notification to all org members
            notifyInspectionSubmitted(
                { ...recordPayload, firebaseKey: newRecordRef.key, templateName: executingTask.title },
                users,
                session.name || session.email || 'Unknown'
            );

            // Clear any deferrals so the next cycle resets to normal
            await dbUpdate(`organizations/${session.orgId}/inspectionTemplates/${executingTask.templateId}`, { deferredTo: null });
            setTemplates(prev => prev.map(t => t.firebaseKey === executingTask.templateId ? { ...t, deferredTo: null } : t));

            if (generatedCapas.length > 0) {
                if (isFieldPortalMode) {
                    alert(`${generatedCapas.length} corrective action(s) were raised. ${getFieldPortalVerificationMessage('inspection report')}`);
                } else {
                    alert(`Inspection Completed! ${generatedCapas.length} Corrective Actions (CAPAs) were automatically added to the Global CAPA Register.`);
                }
            } else {
                alert(isFieldPortalMode ? getFieldPortalVerificationMessage('inspection report') : 'Inspection Completed Successfully!');
            }

            setExecutingTask(null);
            setInspectionForm({});
            setSubmitDetailsModalOpen(false);
            setAdditionalFindingsDraft('');
            setView('calendar');
        } catch (e) {
            alert("Failed to submit inspection: " + e.message);
        } finally {
            setSubmittingInspection(false);
        }
    };


    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase"><div className="w-8 h-8 border-2 border-slate-800 border-t-lime-500 rounded-full animate-spin mr-3"></div> Loading Engine...</div>;

    return (
        <>
            {/* PRINT OVERRIDE STYLES to prevent blank pages */}
            <style>
                {`
                    @media print {
                        body, html, #root {
                            height: auto !important;
                            overflow: visible !important;
                            background-color: white !important;
                            color: black !important;
                        }
                        .print-content {
                            position: relative !important;
                            width: 100% !important;
                            height: auto !important;
                            overflow: visible !important;
                            display: block !important;
                        }
                    }
                `}
            </style>

            <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative print:h-auto print:overflow-visible print:bg-white print:text-black">
                <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-lime-600/10 rounded-full blur-[120px] pointer-events-none z-0 print:hidden"></div>

                <header className="h-16 px-6 flex items-center justify-between z-20 bg-slate-900/50 border-b border-slate-800 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(getPortalAwareHomePath({ fallbackPath: '/dashboard', site: siteFilter }))} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-lime-500 to-emerald-600 flex items-center justify-center text-slate-950 font-bold shadow-lg"><i className="fas fa-clipboard-check"></i></div>
                        <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Inspection Manager</h1>
                    </div>
                    <div className="app-tabbar">
                        <button onClick={() => setView('calendar')} className={`app-tab ${view === 'calendar' ? 'app-tab-active' : ''}`}><i className="fas fa-calendar-alt"></i> Schedule</button>
                        {!isFieldPortalMode && <button onClick={() => setView('history')} className={`app-tab ${view === 'history' ? 'app-tab-active' : ''}`}><i className="fas fa-history"></i> History</button>}
                        {!isFieldPortalMode && canEdit && <button onClick={() => setView('templates')} className={`app-tab app-tab-success ${view === 'templates' || view === 'builder' ? 'app-tab-active' : ''}`}><i className="fas fa-layer-group"></i> Manage Forms</button>}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full print:hidden">
                    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">

                        {/* --- CALENDAR VIEW --- */}
                        {view === 'calendar' && (
                            <div className="space-y-6">
                                {isFieldPortalMode && (
                                    <div className="max-w-6xl mx-auto bg-blue-900/20 border border-blue-500/30 rounded-2xl p-5 text-sm text-blue-100">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-300 mb-2">Best Entry</div>
                                        <div className="font-bold text-white mb-2">Open an assigned inspection from the schedule, complete the questions, and submit the report.</div>
                                        This field workspace is report-only for inspections. Complete the assigned inspection here, then log in to the web portal to verify the submitted report.
                                    </div>
                                )}
                                {latestInspectionRecord && (
                                    <div className="max-w-6xl mx-auto bg-slate-900/70 border border-cyan-500/30 rounded-2xl p-6 shadow-xl">
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                                            <div className="flex-1">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300 mb-2">Last Inspection Snapshot</div>
                                                <div className="text-xl font-black text-white">{latestInspectionRecord.templateTitle}</div>
                                                <div className="text-xs text-slate-400 mt-2">
                                                    {new Date(latestInspectionRecord.completedAt).toLocaleString()} | Site: <span className="text-white font-bold">{latestInspectionRecord.siteId}</span> | Inspector: <span className="text-white font-bold">{latestInspectionRecord.inspector}</span>
                                                </div>
                                                {latestInspectionRecord.additionalFindings && (
                                                    <div className="mt-4 bg-slate-950/80 border border-cyan-500/20 rounded-xl p-4 text-sm text-slate-200">
                                                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300 mb-2">Additional Findings</div>
                                                        {latestInspectionRecord.additionalFindings}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="md:w-[320px] bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 mb-3">Last Findings</div>
                                                <div className="space-y-3">
                                                    {latestInspectionFindings.slice(0, 4).map((finding, index) => (
                                                        <div key={`${finding.label}-${index}`} className="border border-slate-800 rounded-xl p-3 bg-slate-900/60">
                                                            <div className="text-xs font-bold text-white">{finding.label}</div>
                                                            <div className={`text-[10px] font-bold uppercase tracking-[0.22em] mt-1 ${finding.answer === 'Fail' ? 'text-red-400' : 'text-blue-300'}`}>{finding.answer}</div>
                                                            {finding.observation && <div className="text-xs text-slate-400 mt-2">{finding.observation}</div>}
                                                        </div>
                                                    ))}
                                                    {latestInspectionFindings.length === 0 && (
                                                        <div className="text-xs italic text-slate-500">No finding details were recorded in the latest inspection.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-between items-end mb-4">
                                    <div>
                                        <h2 className="text-3xl font-bold text-white mb-1">Inspection Schedule</h2>
                                        <p className="text-sm text-slate-400">Assigned inspections appear only on their scheduled frequency dates, and the due card turns red in the final 7 days.</p>
                                    </div>
                                    <div className="flex gap-4 items-center">
                                        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="bg-slate-900 border border-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl outline-none">
                                            <option value="All">All Regions</option>
                                            {regionOptions.map(region => <option key={region} value={region}>{region}</option>)}
                                        </select>
                                        <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value === 'All' ? 'GLOBAL' : e.target.value); }} className="bg-slate-900 border border-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl outline-none">
                                            {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                            {filteredVisibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl p-1 shadow-inner">
                                            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 flex items-center justify-center"><i className="fas fa-chevron-left"></i></button>
                                            <span className="font-bold text-white uppercase tracking-widest text-sm w-32 text-center">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                                            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 flex items-center justify-center"><i className="fas fa-chevron-right"></i></button>
                                        </div>
                                    </div>
                                </div>

                                {scheduledTasks.length === 0 && (
                                    <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-4 text-sm text-slate-300">
                                        No assigned inspections are currently scheduled for this selection. Activate a form and set an assignment start date in Manage Forms to place it on the calendar.
                                    </div>
                                )}

                                <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
                                    <div className="grid grid-cols-7 bg-slate-950 border-b border-slate-800">
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                            <div key={d} className="p-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 auto-rows-fr">
                                        {renderCalendar()}
                                    </div>
                                </div>

                                {/* Overdue/Upcoming Quick List */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                                    <div className="bg-slate-900/50 rounded-2xl border border-red-500/30 p-6 shadow-lg">
                                        <h3 className="text-red-400 font-bold uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><i className="fas fa-exclamation-circle"></i> Overdue / Action Required</h3>
                                        <div className="space-y-2">
                                            {scheduledTasks.filter(t => new Date(t.dueString) < new Date(new Date().toISOString().split('T')[0])).map((t, i) => {
                                                const orig = new Date(t.originalDueString);
                                                orig.setDate(orig.getDate() + 7);
                                                const today = new Date(new Date().toISOString().split('T')[0]);
                                                const canDefer = orig >= today && canEdit;

                                                return (
                                                    <div key={i} className="flex justify-between items-center bg-red-950/20 border border-red-900/50 p-3 rounded-xl">
                                                        <div>
                                                            <div className="font-bold text-slate-200 text-sm">{t.title} {t.isDeferred && <span className="text-[9px] bg-red-900 text-red-300 px-1.5 py-0.5 rounded ml-2">DEFERRED</span>}</div>
                                                            <div className="text-[10px] text-red-400">Due: {t.dueString} • Site: {t.siteId}</div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {canDefer && <button onClick={() => setDeferTask(t)} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition">Defer</button>}
                                                            <button onClick={() => startInspection(t)} className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition">Start</button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            {scheduledTasks.filter(t => new Date(t.dueString) < new Date(new Date().toISOString().split('T')[0])).length === 0 && <p className="text-slate-500 text-xs italic">No overdue inspections.</p>}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-2xl border border-red-500/30 p-6 shadow-lg">
                                        <h3 className="text-red-400 font-bold uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><i className="fas fa-clock"></i> Upcoming (Next 7 Days)</h3>
                                        <div className="space-y-2">
                                            {scheduledTasks.filter(t => {
                                                const due = new Date(t.dueString);
                                                const today = new Date(new Date().toISOString().split('T')[0]);
                                                const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
                                                return due >= today && due <= nextWeek;
                                            }).map((t, i) => (
                                                <div key={i} className="flex justify-between items-center bg-red-950/20 border border-red-900/50 p-3 rounded-xl">
                                                    <div>
                                                        <div className="font-bold text-slate-200 text-sm">{t.title} {t.isDeferred && <span className="text-[9px] bg-red-900 text-red-300 px-1.5 py-0.5 rounded ml-2">DEFERRED</span>}</div>
                                                        <div className="text-[10px] text-red-400">Due: {t.dueString} • Site: {t.siteId}</div>
                                                    </div>
                                                    <button onClick={() => startInspection(t)} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition">Start Early</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- DEFERRAL MODAL --- */}
                        {deferTask && (
                            <div className="fixed inset-0 bg-slate-950/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
                                <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl w-full max-w-sm relative">
                                    <button onClick={() => { setDeferTask(null); setDeferDate(''); }} className="absolute top-4 right-4 text-slate-500 hover:text-white"><i className="fas fa-times"></i></button>
                                    <h3 className="text-xl font-bold text-white mb-2"><i className="fas fa-calendar-plus text-orange-400 mr-2"></i> Defer Inspection</h3>
                                    <p className="text-xs text-slate-400 mb-6 leading-relaxed">You can postpone <strong className="text-white">{deferTask.title}</strong> by a maximum of 7 days from its original due date (<span className="font-mono text-orange-400">{deferTask.originalDueString}</span>).</p>

                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2">New Target Date</label>
                                    <input
                                        type="date"
                                        value={deferDate}
                                        onChange={e => setDeferDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]}
                                        max={(() => {
                                            const d = new Date(deferTask.originalDueString);
                                            d.setDate(d.getDate() + 7);
                                            return d.toISOString().split('T')[0];
                                        })()}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-orange-500 font-mono mb-8 font-bold"
                                    />

                                    <div className="flex gap-3">
                                        <button onClick={() => { setDeferTask(null); setDeferDate(''); }} className="flex-1 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition text-xs uppercase tracking-widest">Cancel</button>
                                        <button onClick={handleDefer} className="flex-1 py-3 rounded-xl font-bold bg-orange-600 text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 transition text-xs uppercase tracking-widest">Confirm</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- MANAGE TEMPLATES VIEW --- */}
                        {view === 'templates' && (
                            <div className="max-w-6xl mx-auto space-y-6">
                                <div className="flex justify-between items-end mb-6">
                                    <div>
                                        <h2 className="text-3xl font-bold text-white mb-2">Form Templates</h2>
                                        <p className="text-sm text-slate-400">Create forms, then assign a live start and end window to control when they appear on the calendar.</p>
                                    </div>
                                    <button onClick={() => { setEditTemplate(createEmptyTemplate(siteFilter === 'All' ? '' : siteFilter)); setView('builder'); }} className="bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold px-5 py-3 rounded-xl shadow-lg shadow-lime-500/20 transition-transform active:scale-95 flex items-center gap-2 text-sm">
                                        <i className="fas fa-plus"></i> Create New Form
                                    </button>
                                </div>

                                <div className="bg-slate-900/50 rounded-3xl border border-slate-700 overflow-hidden shadow-xl">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                            <tr><th className="p-5 pl-6">Form Title</th><th className="p-5">Site Target</th><th className="p-5">Frequency</th><th className="p-5">Live Status</th><th className="p-5 pr-6 text-right">Actions</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                    {templates.filter(t => {
                                        if (regionFilter !== 'All' && !matchesRegionFilter(t.siteId, sites, regionFilter) && t.siteId !== 'GLOBAL') return false;
                                        return siteFilter === 'All' || t.siteId === siteFilter || t.siteId === 'GLOBAL';
                                    }).map(t => (
                                                <tr key={t.firebaseKey} className="hover:bg-slate-800/40">
                                                    <td className="p-5 pl-6">
                                                        <div className="font-bold text-white text-base">{t.title}</div>
                                                        <div className="text-[10px] uppercase tracking-widest mt-2">
                                                            {t.assignedFrom ? (
                                                                <span className="text-blue-400">Assigned: {t.assignedFrom}{t.assignedTo ? ` to ${t.assignedTo}` : ' onward'}</span>
                                                            ) : (
                                                                <span className="text-amber-400">Not assigned to live schedule</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-5">{t.siteId}</td>
                                                    <td className="p-5 font-mono text-lime-400">{t.frequency}</td>
                                                    <td className="p-5">
                                                        <select
                                                            value={t.status}
                                                            onChange={(e) => updateTemplateStatus(t.firebaseKey, e.target.value)}
                                                            className={`bg-slate-950 border rounded-lg px-3 py-1.5 text-xs font-bold outline-none cursor-pointer ${t.status === 'Active' ? 'border-lime-500/50 text-lime-400' :
                                                                t.status === 'Draft' ? 'border-slate-600 text-slate-400' : 'border-red-500/50 text-red-400'
                                                                }`}
                                                        >
                                                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="p-5 pr-6 text-right flex justify-end gap-2">
                                                        <button onClick={() => { setEditTemplate({ ...createEmptyTemplate(t.siteId), ...t, assignedFrom: t.assignedFrom || '', assignedTo: t.assignedTo || '', fields: normalizeTemplateFields(t.fields || []) }); setView('builder'); }} className="bg-slate-800 hover:bg-slate-700 text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors border border-slate-600"><i className="fas fa-edit"></i></button>
                                                        <button onClick={() => deleteTemplate(t.firebaseKey)} className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors border border-red-500/30"><i className="fas fa-trash-alt"></i></button>
                                                    </td>
                                                </tr>
                                            ))}
                                    {templates.filter(t => {
                                        if (regionFilter !== 'All' && !matchesRegionFilter(t.siteId, sites, regionFilter) && t.siteId !== 'GLOBAL') return false;
                                        return siteFilter === 'All' || t.siteId === siteFilter || t.siteId === 'GLOBAL';
                                    }).length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-500 italic">No inspection templates found. Create one to get started.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* --- TEMPLATE BUILDER VIEW (WITH EXCEL IMPORT) --- */}
                        {view === 'builder' && editTemplate && (
                            <div className="max-w-4xl mx-auto bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl animate-in zoom-in-95 duration-300">
                                <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                                    <h2 className="text-2xl font-bold text-lime-400 flex items-center gap-3"><i className="fas fa-tools"></i> {editTemplate.firebaseKey ? 'Edit Form Template' : 'New Inspection Form'}</h2>
                                    <button onClick={() => setView('templates')} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Form Title</label>
                                        <input value={editTemplate.title} onChange={e => setEditTemplate({ ...editTemplate, title: e.target.value })} placeholder="e.g. Daily Forklift Pre-Use Check" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500 font-bold" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Description / Instructions</label>
                                        <textarea value={editTemplate.desc} onChange={e => setEditTemplate({ ...editTemplate, desc: e.target.value })} placeholder="Instructions for the inspector..." rows="2" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500 resize-none text-sm"></textarea>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Target Site</label>
                                        <select value={editTemplate.siteId} onChange={e => setEditTemplate({ ...editTemplate, siteId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500">
                                            <option value="">Select Site...</option>
                                            <option value="GLOBAL">GLOBAL (All Sites)</option>
                                            {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Inspection Frequency</label>
                                        <select value={editTemplate.frequency} onChange={e => setEditTemplate({ ...editTemplate, frequency: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500">
                                            {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Form Status</label>
                                        <select value={editTemplate.status} onChange={e => setEditTemplate({ ...editTemplate, status: e.target.value })} className={`w-full bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none font-bold ${editTemplate.status === 'Active' ? 'text-lime-400' : 'text-slate-400'}`}>
                                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Assign From</label>
                                        <input type="date" value={editTemplate.assignedFrom || ''} onChange={e => setEditTemplate({ ...editTemplate, assignedFrom: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500 font-mono" />
                                        <p className="text-[10px] text-slate-500 mt-2">This is the first scheduled inspection date, and future dates follow the selected frequency from here.</p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Assign Until</label>
                                        <input type="date" value={editTemplate.assignedTo || ''} min={editTemplate.assignedFrom || undefined} onChange={e => setEditTemplate({ ...editTemplate, assignedTo: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500 font-mono" />
                                        <p className="text-[10px] text-slate-500 mt-2">Optional. Leave blank to keep the inspection active indefinitely.</p>
                                    </div>
                                </div>

                                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6 border-b border-slate-800 pb-4">
                                        <h3 className="text-sm font-bold text-white uppercase tracking-widest"><i className="fas fa-list-ul text-blue-400 mr-2"></i> Form Questions</h3>

                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={downloadQuestionTemplate} className="text-[9px] bg-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 font-bold uppercase transition-colors"><i className="fas fa-download mr-1"></i> Template</button>
                                            <div className="relative">
                                                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleQuestionImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="Upload Questions" />
                                                <button type="button" className="text-[9px] bg-emerald-900/30 text-emerald-400 hover:bg-emerald-600 hover:text-white px-3 py-1.5 rounded-lg border border-emerald-500/30 font-bold uppercase transition-colors"><i className="fas fa-upload mr-1"></i> Upload</button>
                                            </div>
                                            <button type="button" onClick={() => setEditTemplate({ ...editTemplate, fields: [...editTemplate.fields, normalizeTemplateField({ id: Date.now().toString(), label: '', type: 'Pass/Fail', photoRequirement: 'Not Required' })] })} className="text-[9px] bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-500/30 font-bold uppercase transition-colors"><i className="fas fa-plus mr-1"></i> Add Manual</button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {editTemplate.fields.map((field, idx) => (
                                            <div key={field.id} className="grid grid-cols-1 md:grid-cols-[auto,1fr,140px,160px,auto] gap-3 items-center bg-slate-900 p-3 rounded-xl border border-slate-700 group">
                                                <div className="text-slate-600 font-bold w-6 text-center">{idx + 1}.</div>
                                                <input value={field.label} onChange={e => { const n = [...editTemplate.fields]; n[idx].label = e.target.value; setEditTemplate({ ...editTemplate, fields: n }); }} placeholder="Enter check requirement (e.g. 'Are fire exits clear?')" className="flex-1 bg-transparent border-b border-slate-600 focus:border-lime-500 outline-none text-sm text-white px-2 py-1" />
                                                <select value={field.type} onChange={e => { const n = [...editTemplate.fields]; n[idx].type = e.target.value; setEditTemplate({ ...editTemplate, fields: n }); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-xs p-2 text-slate-300 outline-none">
                                                    {QUESTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                                                </select>
                                                <select value={field.photoRequirement || 'Not Required'} onChange={e => { const n = [...editTemplate.fields]; n[idx].photoRequirement = e.target.value; setEditTemplate({ ...editTemplate, fields: n }); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg text-xs p-2 text-slate-300 outline-none">
                                                    {PHOTO_REQUIREMENTS.map((type) => <option key={type} value={type}>{type}</option>)}
                                                </select>
                                                <button type="button" onClick={() => { const n = editTemplate.fields.filter((_, i) => i !== idx); setEditTemplate({ ...editTemplate, fields: n }); }} className="w-8 h-8 rounded bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center"><i className="fas fa-trash"></i></button>
                                            </div>
                                        ))}
                                        {editTemplate.fields.length === 0 && <div className="text-center p-8 text-slate-500 italic border-2 border-dashed border-slate-700 rounded-xl">No questions added yet. You can manually add them or bulk import from Excel.</div>}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-4 pt-8 mt-4 border-t border-slate-800">
                                    <button type="button" onClick={() => setView('templates')} className="px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition">Cancel</button>
                                    <button type="button" onClick={saveTemplate} className="px-10 py-3 bg-lime-500 text-slate-950 font-black uppercase tracking-widest rounded-xl hover:bg-lime-400 transition shadow-lg shadow-lime-500/20"><i className="fas fa-save mr-2"></i> Save Template</button>
                                </div>
                            </div>
                        )}

                        {/* --- EXECUTION VIEW (FILLING THE FORM) --- */}
                        {view === 'execute' && executingTask && (
                            <div className="max-w-4xl mx-auto bg-slate-900/80 p-6 md:p-10 rounded-3xl border border-blue-500/30 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
                                <div className="mb-8 border-b border-slate-800 pb-6 text-center">
                                    <span className="bg-blue-900/30 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3 inline-block">Active Inspection</span>
                                    <h2 className="text-3xl font-black text-white mb-2">{executingTask.title}</h2>
                                    <p className="text-slate-400 text-sm">Site: <strong className="text-white">{executingTask.siteId}</strong> | Frequency: <strong className="text-white">{executingTask.frequency}</strong></p>
                                    {executingTask.template.desc && <p className="mt-4 text-sm text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 italic">{executingTask.template.desc}</p>}
                                </div>

                                {currentTaskLastRecord && (
                                    <div className="mb-8 rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-6 shadow-inner">
                                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6">
                                            <div className="flex-1">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300 mb-2">Last Inspection Details</div>
                                                <div className="text-sm text-slate-300">
                                                    {new Date(currentTaskLastRecord.completedAt).toLocaleString()} | Inspector: <span className="text-white font-bold">{currentTaskLastRecord.inspector}</span>
                                                </div>
                                                {currentTaskLastRecord.additionalFindings && (
                                                    <div className="mt-4 bg-slate-950/70 border border-cyan-500/20 rounded-xl p-4 text-sm text-slate-200">
                                                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300 mb-2">Additional Findings</div>
                                                        {currentTaskLastRecord.additionalFindings}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="md:w-[320px] bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 mb-3">Previous Findings</div>
                                                <div className="space-y-3">
                                                    {currentTaskFindings.slice(0, 4).map((finding, index) => (
                                                        <div key={`${finding.label}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                                            <div className="text-xs font-bold text-white">{finding.label}</div>
                                                            <div className={`mt-1 text-[10px] font-bold uppercase tracking-[0.2em] ${finding.answer === 'Fail' ? 'text-red-400' : 'text-blue-300'}`}>{finding.answer}</div>
                                                            {finding.observation && <div className="mt-2 text-xs text-slate-400">{finding.observation}</div>}
                                                        </div>
                                                    ))}
                                                    {currentTaskFindings.length === 0 && (
                                                        <div className="text-xs italic text-slate-500">No detailed findings were logged in the previous inspection.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isMultipleChoiceInspection && (
                                    <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Answered</div>
                                            <div className="mt-2 text-2xl font-black text-white">{multipleChoiceStats.answered}/{multipleChoiceStats.total}</div>
                                        </div>
                                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-4">
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300 font-bold">Pass</div>
                                            <div className="mt-2 text-2xl font-black text-emerald-300">{multipleChoiceStats.pass}</div>
                                        </div>
                                        <div className="rounded-2xl border border-red-500/30 bg-red-950/10 p-4">
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-red-300 font-bold">Fail</div>
                                            <div className="mt-2 text-2xl font-black text-red-300">{multipleChoiceStats.fail}</div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">N/A</div>
                                            <div className="mt-2 text-2xl font-black text-slate-200">{multipleChoiceStats.na}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-8 mb-10">
                                    {executingTask.template.fields.map((f, idx) => (
                                        <div key={f.id} className="bg-slate-950/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-4">
                                                <div className="flex-1">
                                                    <h4 className="text-base font-bold text-white"><span className="text-blue-500 mr-2">{idx + 1}.</span> {f.label}</h4>
                                                    {f.photoRequirement !== 'Not Required' && (
                                                        <div className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${f.photoRequirement === 'Mandatory' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'}`}>
                                                            <i className="fas fa-camera"></i> {f.photoRequirement === 'Mandatory' ? 'Photo Mandatory' : 'Photo Optional'}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Answer Input based on Type */}
                                                <div className="flex-shrink-0">
                                                    {f.type === 'Pass/Fail' && (
                                                        <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                                                            <button onClick={() => updateInspectionResponse(f.id, { answer: 'Pass' })} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${inspectionForm[f.id]?.answer === 'Pass' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><i className="fas fa-check mr-1"></i> Pass</button>
                                                            <div className="w-px bg-slate-700"></div>
                                                            <button onClick={() => updateInspectionResponse(f.id, { answer: 'Fail', observationOpen: true })} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${inspectionForm[f.id]?.answer === 'Fail' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><i className="fas fa-times mr-1"></i> Fail</button>
                                                            <div className="w-px bg-slate-700"></div>
                                                            <button onClick={() => updateInspectionResponse(f.id, { answer: 'N/A' })} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${inspectionForm[f.id]?.answer === 'N/A' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>N/A</button>
                                                        </div>
                                                    )}
                                                    {f.type === 'Text Input' && (
                                                        <input value={inspectionForm[f.id]?.answer || ''} onChange={e => updateInspectionResponse(f.id, { answer: e.target.value })} placeholder="Enter details..." className="w-64 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500" />
                                                    )}
                                                    {f.type === 'Number' && (
                                                        <input type="number" value={inspectionForm[f.id]?.answer || ''} onChange={e => updateInspectionResponse(f.id, { answer: e.target.value })} placeholder="0.00" className="w-32 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500 text-center font-mono" />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Observation & CAPA Block */}
                                            {(inspectionForm[f.id]?.answer === 'Fail' || inspectionForm[f.id]?.observationOpen || f.photoRequirement !== 'Not Required') && (
                                                <div className="mt-4 bg-orange-950/20 border border-orange-500/30 p-4 rounded-xl animate-in fade-in slide-in-from-top-2">
                                                    <label className="text-[10px] uppercase font-bold text-orange-400 block mb-2"><i className="fas fa-exclamation-triangle mr-1"></i> Defect / Observation Notes</label>
                                                    <textarea value={inspectionForm[f.id]?.observation || ''} onChange={e => updateInspectionResponse(f.id, { observation: e.target.value, observationOpen: true })} placeholder="Describe the issue found..." rows="2" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-orange-500 resize-none mb-3"></textarea>

                                                    {f.photoRequirement !== 'Not Required' && (
                                                        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
                                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                                                <div>
                                                                    <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-400">Photo Evidence</div>
                                                                    <div className="text-xs text-slate-500 mt-1">
                                                                        {f.photoRequirement === 'Mandatory' ? 'This question needs a photo before the report can be submitted.' : 'Upload a supporting photo if it helps document the condition.'}
                                                                    </div>
                                                                </div>
                                                                {!inspectionForm[f.id]?.photoEvidence && (
                                                                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-dashed border-blue-500/40 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-blue-300 hover:bg-blue-500/10">
                                                                        <i className="fas fa-camera"></i> Upload Photo
                                                                        <input type="file" accept="image/*" capture="environment" onChange={(event) => handleQuestionPhotoUpload(f.id, event)} className="hidden" />
                                                                    </label>
                                                                )}
                                                            </div>
                                                            {inspectionForm[f.id]?.photoEvidence && (
                                                                <div className="mt-4 flex flex-col md:flex-row md:items-center gap-4">
                                                                    <img src={inspectionForm[f.id].photoEvidence} alt={`${f.label} evidence`} className="h-28 w-36 rounded-xl border border-slate-700 object-cover" />
                                                                    <div className="flex-1">
                                                                        <div className="text-xs font-mono text-slate-400">{inspectionForm[f.id]?.photoEvidenceName || 'Uploaded evidence'}</div>
                                                                        <button type="button" onClick={() => removeQuestionPhoto(f.id)} className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-red-400 hover:text-red-300">Remove Photo</button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                                                        <input type="checkbox" checked={inspectionForm[f.id]?.raiseCapa || false} onChange={e => updateInspectionResponse(f.id, { raiseCapa: e.target.checked, observationOpen: true })} className="w-4 h-4 accent-orange-500" />
                                                        <span className="text-xs font-bold text-white">Raise Corrective Action (CAPA)</span>
                                                    </label>

                                                    {inspectionForm[f.id]?.raiseCapa && (
                                                        <div className="flex gap-4 p-3 bg-slate-900 rounded-lg border border-slate-700">
                                                            <div className="flex-1">
                                                                <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Assign To</label>
                                                                <UserSelect users={users} value={inspectionForm[f.id]?.capaOwner || ''} onChange={v => updateInspectionResponse(f.id, { capaOwner: v })} disabled={false} />
                                                            </div>
                                                            <div className="w-1/3">
                                                                <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Due Date</label>
                                                                <input type="date" value={inspectionForm[f.id]?.capaDue || ''} onChange={e => updateInspectionResponse(f.id, { capaDue: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-orange-500 font-mono" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {inspectionForm[f.id]?.answer !== 'Fail' && !inspectionForm[f.id]?.observationOpen && f.photoRequirement === 'Not Required' && (
                                                <button onClick={() => updateInspectionResponse(f.id, { observationOpen: true })} className="text-[10px] text-slate-500 hover:text-orange-400 font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus mr-1"></i> Add Note</button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex justify-end gap-4 pt-6 border-t border-slate-800">
                                    <button onClick={() => setView('calendar')} className="px-8 py-4 bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-slate-700 transition">Discard</button>
                                    <button onClick={requestInspectionSubmit} className="px-10 py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition flex items-center gap-2"><i className="fas fa-check-double text-lg"></i> Sign & Submit Report</button>
                                </div>
                            </div>
                        )}

                        {/* --- HISTORY VIEW --- */}
                        {view === 'history' && (
                            <div className="max-w-6xl mx-auto space-y-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">Inspection Logs</h2>
                                        <p className="text-sm text-slate-400">Historical archive of completed audits.</p>
                                    </div>
                                </div>

                                <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                            <tr><th className="p-4 pl-6">Date</th><th className="p-4">Inspection Type</th><th className="p-4">Site</th><th className="p-4">Inspector</th><th className="p-4 text-center">Score / Issues</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                {records.filter(r => {
                                    if (regionFilter !== 'All' && !matchesRegionFilter(r.siteId, sites, regionFilter)) return false;
                                    return siteFilter === 'All' || r.siteId === siteFilter;
                                }).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).map(r => {
                                                const fails = Object.values(r.responses || {}).filter(res => res.answer === 'Fail').length;
                                                return (
                                                    <tr key={r.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                        <td className="p-4 pl-6 font-mono text-xs">{new Date(r.completedAt).toLocaleString()}</td>
                                                        <td className="p-4 font-bold text-white">{r.templateTitle}</td>
                                                        <td className="p-4">{r.siteId}</td>
                                                        <td className="p-4 text-xs font-bold text-blue-400"><i className="fas fa-user-circle mr-1"></i> {r.inspector}</td>
                                                        <td className="p-4 text-center">
                                                            {fails > 0
                                                                ? <span className="bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1 rounded-lg text-xs font-bold">{fails} Issues</span>
                                                                : <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg text-xs font-bold">100% Pass</span>
                                                            }
                                                        </td>
                                                        <td className="p-4 pr-6 text-right">
                                                            <button onClick={() => { setViewingRecord(r); setView('view-record'); }} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition shadow"><i className="fas fa-eye"></i></button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                {records.filter(r => {
                                    if (regionFilter !== 'All' && !matchesRegionFilter(r.siteId, sites, regionFilter)) return false;
                                    return siteFilter === 'All' || r.siteId === siteFilter;
                                }).length === 0 && <tr><td colSpan="6" className="p-8 text-center italic text-slate-500">No inspection history found.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {view === 'execute' && executingTask && (
                    <div className="fixed bottom-4 left-1/2 z-40 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-blue-500/30 bg-slate-950/95 p-4 shadow-2xl shadow-blue-950/40 backdrop-blur-md print:hidden">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                                    <span>Response Progress</span>
                                    <span className="text-white">{inspectionProgress.answered}/{inspectionProgress.total} Answered</span>
                                    {inspectionProgress.photoMandatory > 0 && (
                                        <span className="text-amber-300">{inspectionProgress.photoSatisfied}/{inspectionProgress.photoMandatory} Mandatory Photos</span>
                                    )}
                                </div>
                                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-300" style={{ width: `${inspectionProgress.percent}%` }}></div>
                                </div>
                            </div>
                            {isMultipleChoiceInspection && (
                                <div className="flex items-center gap-2 text-[11px] font-bold">
                                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">{multipleChoiceStats.pass} Pass</span>
                                    <span className="rounded-full bg-red-500/15 px-3 py-1 text-red-300">{multipleChoiceStats.fail} Fail</span>
                                    <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">{multipleChoiceStats.na} N/A</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {submitDetailsModalOpen && executingTask && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md print:hidden">
                        <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
                            <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-300 mb-2">Final Check</div>
                                    <h3 className="text-2xl font-black text-white">Add Final Findings Before Submit</h3>
                                </div>
                                <button type="button" onClick={() => setSubmitDetailsModalOpen(false)} className="text-slate-500 hover:text-white">
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>
                            <p className="mt-5 text-sm text-slate-400">Capture any overall findings, handover details, or follow-up notes from this inspection. These details will be stored with the record and shown in the last inspection summary.</p>
                            <textarea
                                rows="6"
                                value={additionalFindingsDraft}
                                onChange={(e) => setAdditionalFindingsDraft(e.target.value)}
                                placeholder="Examples: housekeeping trend noticed across bay 2, minor corrosion beginning on frame, temporary barrier reinstated, follow-up with maintenance supervisor required..."
                                className="mt-5 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm text-white outline-none focus:border-blue-500 resize-none"
                            />
                            <div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:justify-end">
                                <button type="button" onClick={() => setSubmitDetailsModalOpen(false)} className="rounded-xl bg-slate-800 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white hover:bg-slate-700">Go Back</button>
                                <button type="button" disabled={submittingInspection} onClick={submitInspection} className="rounded-xl bg-blue-600 px-8 py-3 text-xs font-black uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 disabled:opacity-50">
                                    {submittingInspection ? 'Submitting...' : 'Submit Inspection'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- COMPLETED RECORD PDF VIEW --- */}
                {view === 'view-record' && viewingRecord && (
                    <div className="absolute inset-0 z-[100] bg-slate-950 overflow-y-auto print:static print:inset-auto print:overflow-visible print:bg-white print:text-black print:h-auto print-content">
                        <div className="max-w-4xl mx-auto p-8 pt-12 print:p-0">
                            {/* Control Bar (Hidden on Print) */}
                            <div className="flex justify-between items-center mb-8 print:hidden bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl sticky top-4 z-50">
                                <button onClick={() => setView('history')} className="text-slate-400 hover:text-white font-bold flex items-center gap-2"><i className="fas fa-arrow-left"></i> Back</button>
                                <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow flex items-center gap-2 transition-transform active:scale-95"><i className="fas fa-print"></i> Save as PDF</button>
                            </div>

                            {/* Formal Report Layout */}
                            <div className="bg-white text-black p-10 rounded-xl shadow-2xl print:shadow-none print:border-none border border-slate-700 print:p-0">
                                <div className="border-b-4 border-black pb-6 mb-8 flex justify-between items-end">
                                    <div>
                                        <div className="text-xs font-bold text-gray-500 tracking-widest mb-1">ISO 45001 OHSMS - FORMAL RECORD</div>
                                        <h1 className="text-3xl font-black uppercase m-0 leading-tight">{viewingRecord.templateTitle}</h1>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold m-0 text-gray-600">ID: {viewingRecord.firebaseKey}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 mb-10 text-sm border-2 border-black p-6 bg-gray-50">
                                    <div>
                                        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-1">Facility / Site</p>
                                        <p className="font-black text-lg m-0">{viewingRecord.siteId}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-1">Inspection Date</p>
                                        <p className="font-mono font-bold text-base m-0">{new Date(viewingRecord.completedAt).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-1">Inspector</p>
                                        <p className="font-bold text-base m-0">{viewingRecord.inspector}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-1">Result Summary</p>
                                        <p className="font-bold text-base m-0">
                                            {Object.values(viewingRecord.responses || {}).filter(r => r.answer === 'Fail').length} Defects Found
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-1">Evidence Photos</p>
                                        <p className="font-bold text-base m-0">{getQuestionPhotoCount(viewingRecord.responses || {})}</p>
                                    </div>
                                </div>

                                {viewingRecord.additionalFindings && (
                                    <div className="mb-10 border-2 border-black bg-gray-50 p-6">
                                        <h3 className="text-sm font-black uppercase border-b-2 border-black pb-2 mb-4">Additional Findings / Final Notes</h3>
                                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{viewingRecord.additionalFindings}</div>
                                    </div>
                                )}

                                <h3 className="text-sm font-black uppercase border-b-2 border-black pb-2 mb-6">Inspection Findings</h3>

                                <table className="w-full text-sm border-collapse mb-10">
                                    <thead>
                                        <tr className="bg-gray-200">
                                            <th className="border border-black p-3 text-left w-2/3">Check Item</th>
                                            <th className="border border-black p-3 text-center w-1/3">Result / Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(viewingRecord.responses || {}).map(([id, data], idx) => (
                                            <tr key={id}>
                                                <td className="border border-black p-4 font-medium align-top">
                                                    <span className="font-bold mr-2">{idx + 1}.</span> {data.label}
                                                </td>
                                                <td className="border border-black p-4 align-top">
                                                    <div className="flex justify-center mb-2">
                                                        <span className={`px-3 py-1 font-black uppercase tracking-widest text-xs border-2 ${data.answer === 'Pass' ? 'border-green-600 text-green-700 bg-green-50' : data.answer === 'Fail' ? 'border-red-600 text-red-700 bg-red-50' : 'border-gray-500 text-gray-600 bg-gray-100'}`}>
                                                            {data.answer || 'N/A'}
                                                        </span>
                                                    </div>
                                                    {data.observation && (
                                                        <div className="mt-3 text-xs bg-gray-100 p-2 border-l-4 border-black italic">
                                                            <strong className="not-italic block mb-1">Notes:</strong> {data.observation}
                                                        </div>
                                                    )}
                                                    {data.photoEvidence && (
                                                        <div className="mt-3">
                                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-2">Photo Evidence</div>
                                                            <img src={data.photoEvidence} alt={data.photoEvidenceName || data.label} className="max-h-40 rounded border border-black object-contain bg-white" />
                                                            {data.photoEvidenceName && <div className="mt-1 text-[10px] text-gray-500 font-mono">{data.photoEvidenceName}</div>}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* CAPA Summary */}
                                {(viewingRecord.capa && viewingRecord.capa.length > 0) && (
                                    <div className="mb-10 page-break-inside-avoid">
                                        <h3 className="text-sm font-black uppercase border-b-2 border-black pb-2 mb-4 bg-red-50 p-2">Auto-Generated Actions (CAPA)</h3>
                                        <div className="space-y-4">
                                            {viewingRecord.capa.map((c, i) => (
                                                <div key={i} className="border border-black p-4 text-xs flex gap-4 bg-gray-50">
                                                    <div className="font-bold text-red-600 text-lg">{i + 1}.</div>
                                                    <div className="flex-1">
                                                        <p className="font-bold mb-2 text-sm">{c.desc}</p>
                                                        <p className="m-0 text-gray-600">Assigned To: <strong className="text-black">{c.owner}</strong> | Due: <strong className="font-mono text-black">{c.dueDate}</strong></p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-16 pt-8 border-t-2 border-dashed border-gray-400 text-center text-xs text-gray-500 page-break-inside-avoid">
                                    <div className="w-64 border-b-2 border-black mx-auto mb-2 h-10"></div>
                                    <p className="font-bold uppercase tracking-widest text-black">Digital Signature: {viewingRecord.inspector}</p>
                                    <p>Date Signed: {new Date(viewingRecord.completedAt).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
