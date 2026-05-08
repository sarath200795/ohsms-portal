import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { equalTo, get, orderByChild, push, query, ref } from 'firebase/database';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
    ArcElement,
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip
} from 'chart.js';

import { rtdb } from '../config/firebase';
import { canEditCreateForRole, getAllowedSiteCodes, hasAccessibleModule, isGlobalOwnerRole } from '../utils/permissions';
import { readStoredSession } from '../utils/session';

ChartJS.register(
    ArcElement,
    BarElement,
    CategoryScale,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip
);

const RATE_BASE = 200000;
const RANGE_PRESET_OPTIONS = [
    { id: 'weekly', label: 'This Week' },
    { id: 'monthly', label: 'This Month' },
    { id: 'quarterly', label: 'This Quarter' },
    { id: 'halfyearly', label: 'This Half Year' },
    { id: 'annually', label: 'This Year' },
    { id: 'custom', label: 'Between 2 Dates' }
];
const GRANULARITY_OPTIONS = [
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'halfyearly', label: 'Half-Yearly' },
    { id: 'annually', label: 'Annually' }
];
const CAPA_SOURCE_OPTIONS = [
    'Incident',
    'Audit',
    'Inspection',
    'Emergency Drill',
    'Consultation',
    'Improvement'
];
const CAPA_SOURCE_COLORS = {
    Incident: '#f97316',
    Audit: '#10b981',
    Inspection: '#84cc16',
    'Emergency Drill': '#ec4899',
    Consultation: '#06b6d4',
    Improvement: '#8b5cf6'
};
const SCOPED_CHILDREN = new Set([
    'incidents',
    'manHours',
    'auditFindings',
    'mockDrills',
    'consultations',
    'improvements',
    'inspectionRecords',
    'ptwRecords',
    'trainings',
    'riskAssessments'
]);

const resolveInitialAnalyticsSite = (session, search) => {
    const params = new URLSearchParams(search);
    let contextSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';

    if (!isGlobalOwnerRole(session?.role) && contextSite === 'All') {
        contextSite = (session?.assignedSite && session.assignedSite !== 'GLOBAL')
            ? session.assignedSite
            : (session?.accessibleSites?.[0] || '');
    }

    return contextSite;
};

const safeObjectEntries = (value) => {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
        return value
            .map((item, index) => [String(index), item])
            .filter(([, item]) => item && typeof item === 'object');
    }
    return Object.entries(value).filter(([, item]) => item && typeof item === 'object');
};

const safeArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'object') return Object.values(value).filter(Boolean);
    return [];
};

const padNumber = (value) => String(value).padStart(2, '0');

const formatDateKey = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
};

const normalizeDateKey = (value) => {
    if (!value) return '';

    const rawValue = String(value).split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return rawValue;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return formatDateKey(parsed);
};

const parseDateOnly = (value) => {
    const normalized = normalizeDateKey(value);
    if (!normalized) return null;

    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const startOfDay = (value) => {
    const parsed = value instanceof Date ? new Date(value) : parseDateOnly(value);
    if (!parsed) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const startOfWeek = (date) => {
    const next = startOfDay(date);
    const day = (next.getDay() + 6) % 7;
    next.setDate(next.getDate() - day);
    return next;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfQuarter = (date) => new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
const startOfHalfYear = (date) => new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
const startOfYear = (date) => new Date(date.getFullYear(), 0, 1);

const startOfGranularity = (date, granularity) => {
    switch (granularity) {
        case 'weekly':
            return startOfWeek(date);
        case 'monthly':
            return startOfMonth(date);
        case 'quarterly':
            return startOfQuarter(date);
        case 'halfyearly':
            return startOfHalfYear(date);
        case 'annually':
            return startOfYear(date);
        default:
            return startOfMonth(date);
    }
};

const addGranularity = (date, granularity) => {
    const next = new Date(date);

    switch (granularity) {
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        case 'quarterly':
            next.setMonth(next.getMonth() + 3);
            break;
        case 'halfyearly':
            next.setMonth(next.getMonth() + 6);
            break;
        case 'annually':
            next.setFullYear(next.getFullYear() + 1);
            break;
        default:
            next.setMonth(next.getMonth() + 1);
            break;
    }

    return next;
};

const formatReadableDate = (value) => {
    const parsed = parseDateOnly(value);
    if (!parsed) return 'No date';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatPeriodLabel = (date, granularity) => {
    switch (granularity) {
        case 'weekly':
            return `${formatReadableDate(date)} - ${formatReadableDate(addDays(date, 6))}`;
        case 'monthly':
            return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        case 'quarterly':
            return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
        case 'halfyearly':
            return `${date.getMonth() < 6 ? 'H1' : 'H2'} ${date.getFullYear()}`;
        case 'annually':
            return String(date.getFullYear());
        default:
            return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    }
};

const buildPeriodBuckets = (rangeStart, rangeEnd, granularity) => {
    if (!rangeStart || !rangeEnd) return [];

    const buckets = [];
    let cursor = startOfGranularity(rangeStart, granularity);
    let safetyCounter = 0;

    while (cursor <= rangeEnd && safetyCounter < 200) {
        const key = formatDateKey(cursor);
        buckets.push({
            key,
            label: formatPeriodLabel(cursor, granularity),
            start: new Date(cursor)
        });
        cursor = addGranularity(cursor, granularity);
        safetyCounter += 1;
    }

    return buckets;
};

const resolveRangeFromPreset = (presetId, today = new Date()) => {
    const safeToday = startOfDay(today);

    switch (presetId) {
        case 'weekly':
            return { start: startOfWeek(safeToday), end: safeToday };
        case 'monthly':
            return { start: startOfMonth(safeToday), end: safeToday };
        case 'quarterly':
            return { start: startOfQuarter(safeToday), end: safeToday };
        case 'halfyearly':
            return { start: startOfHalfYear(safeToday), end: safeToday };
        case 'annually':
            return { start: startOfYear(safeToday), end: safeToday };
        default:
            return { start: startOfYear(safeToday), end: safeToday };
    }
};

const mergeSnapshots = (snapshots) => {
    const merged = {};

    snapshots.forEach((snapshot) => {
        if (!snapshot.exists()) return;
        Object.entries(snapshot.val() || {}).forEach(([key, value]) => {
            merged[key] = value;
        });
    });

    return Object.keys(merged).length > 0 ? merged : null;
};

const fetchScopedChild = async (orgId, childName, session) => {
    if (!orgId || !childName) return null;
    const childRef = ref(rtdb, `organizations/${orgId}/${childName}`);

    if (!SCOPED_CHILDREN.has(childName) || isGlobalOwnerRole(session?.role) || session?.assignedSite === 'GLOBAL') {
        const snapshot = await get(childRef);
        return snapshot.exists() ? snapshot.val() : null;
    }

    const allowedSites = [...getAllowedSiteCodes(session)];
    if (allowedSites.length === 0) return null;

    const snapshots = await Promise.all(
        allowedSites.map((siteId) => get(query(childRef, orderByChild('siteId'), equalTo(siteId))))
    );

    return mergeSnapshots(snapshots);
};

const normalizeSites = (rawSites) => (
    safeObjectEntries(rawSites).map(([key, site]) => ({
        code: site.code || key,
        name: site.name || site.code || key
    }))
);

const normalizeIncidents = (rawIncidents) => (
    safeObjectEntries(rawIncidents)
        .map(([key, incident]) => ({
            firebaseKey: key,
            ...incident,
            siteId: incident.siteId || 'Global',
            date: normalizeDateKey(incident.date)
        }))
        .filter((incident) => incident.date)
);

const normalizeManHours = (rawHours) => (
    safeObjectEntries(rawHours)
        .map(([key, hourEntry]) => ({
            firebaseKey: key,
            ...hourEntry,
            siteId: hourEntry.siteId || 'Global',
            date: normalizeDateKey(hourEntry.date),
            perm: Number(hourEntry.perm || 0),
            cont: Number(hourEntry.cont || 0)
        }))
        .filter((hourEntry) => hourEntry.date)
);

const normalizePtwRecords = (rawPermits) => (
    safeObjectEntries(rawPermits)
        .map(([key, permit]) => ({
            firebaseKey: key,
            ...permit,
            siteId: permit.siteId || 'Global',
            analyticsDate: normalizeDateKey(permit.createdAt || permit.validFromDate || permit.statusUpdatedOn || permit.lastUpdated || permit.validToDate)
        }))
        .filter((permit) => permit.analyticsDate)
);

const normalizeAuditRecords = (rawAudits) => (
    safeObjectEntries(rawAudits)
        .map(([key, audit]) => ({
            firebaseKey: key,
            ...audit,
            siteId: audit.siteId || audit.taskDetails?.siteId || 'Global',
            analyticsDate: normalizeDateKey(audit.auditDate || audit.submissionDate || audit.closureDate || audit.taskDetails?.date),
            findings: safeObjectEntries(audit.findings).map(([, finding]) => finding)
        }))
        .filter((audit) => audit.analyticsDate)
);

const normalizeInspectionRecords = (rawRecords) => (
    safeObjectEntries(rawRecords)
        .map(([key, record]) => ({
            firebaseKey: key,
            ...record,
            siteId: record.siteId || 'Global',
            analyticsDate: normalizeDateKey(record.completedAt),
            responses: record.responses || {},
            capa: safeArray(record.capa)
        }))
        .filter((record) => record.analyticsDate)
);

const normalizeMockDrills = (rawDrills) => (
    safeObjectEntries(rawDrills)
        .map(([key, drill]) => ({
            firebaseKey: key,
            ...drill,
            siteId: drill.siteId || 'Global',
            analyticsDate: normalizeDateKey(drill.date || drill.timestamp),
            capa: safeArray(drill.capa)
        }))
        .filter((drill) => drill.analyticsDate)
);

const normalizeTrainingRecords = (rawTrainings) => (
    safeObjectEntries(rawTrainings)
        .map(([key, training]) => ({
            firebaseKey: key,
            ...training,
            siteId: training.siteId || 'Global',
            analyticsDate: normalizeDateKey(training.date),
            expiryDate: normalizeDateKey(training.expiryDate),
            attendees: safeArray(training.attendees)
        }))
        .filter((training) => training.analyticsDate)
);

const normalizeRiskAssessments = (rawAssessments) => (
    safeObjectEntries(rawAssessments)
        .map(([key, assessment]) => {
            const activities = safeArray(assessment.activities).map((activity) => ({
                ...activity,
                hazards: safeArray(activity.hazards)
            }));

            return {
                firebaseKey: key,
                ...assessment,
                siteId: assessment.siteId || 'Global',
                analyticsDate: normalizeDateKey(assessment.date || assessment.timestamp),
                activities,
                changeLogs: safeArray(assessment.changeLogs)
            };
        })
        .filter((assessment) => assessment.analyticsDate)
);

const getCertificationStatus = (expiryDate) => {
    const expiry = parseDateOnly(expiryDate);
    if (!expiry) return 'Valid';

    const today = startOfDay(new Date());
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Expired';
    if (diffDays <= 30) return '< 30 Days';
    if (diffDays <= 183) return '< 6 Months';
    return 'Valid';
};

const buildTrainingCertifications = (trainings) => {
    const certifications = [];

    trainings.forEach((training) => {
        safeArray(training.attendees).forEach((attendee) => {
            if (attendee.status !== 'Attended') return;

            const expiryDate = normalizeDateKey(training.expiryDate || addDays(parseDateOnly(training.date) || new Date(), 183));
            certifications.push({
                trainingId: training.id || training.firebaseKey,
                siteId: training.siteId || 'Global',
                topic: training.topic || 'Training',
                userName: attendee.name,
                userId: attendee.userId || attendee.id || '',
                expiryDate,
                status: getCertificationStatus(expiryDate)
            });
        });
    });

    return certifications;
};

const countInspectionIssues = (record) => (
    Object.values(record.responses || {}).filter((response) => response?.answer === 'Fail').length
);

const hasHighResidualRisk = (assessment) => (
    (assessment.activities || []).some((activity) => (activity.hazards || []).some((hazard) => Number(hazard.r2 || 0) > 10))
);

const hasAlarpCase = (assessment) => (
    (assessment.activities || []).some((activity) => (activity.hazards || []).some((hazard) => Boolean(hazard.alarp)))
);

const normalizeActionStatus = (status, closedAt) => {
    if (normalizeDateKey(closedAt)) return 'Closed';

    const cleanStatus = String(status || '').trim().toLowerCase();
    if (['closed', 'complete', 'completed', 'verified'].includes(cleanStatus)) return 'Closed';
    if (['in progress', 'submitted for verification', 'pending approval'].includes(cleanStatus)) return 'In Progress';
    return 'Open';
};

const buildCapaAction = ({
    uid,
    source,
    sourceId,
    desc,
    owner,
    due,
    status,
    siteId,
    closedAt,
    openedAt
}) => ({
    uid,
    source,
    sourceId: sourceId || 'REF',
    desc: desc || 'No description',
    owner: owner || 'Unassigned',
    due: normalizeDateKey(due),
    status: normalizeActionStatus(status, closedAt),
    siteId: siteId || 'Global',
    closedAt: normalizeDateKey(closedAt),
    openedAt: normalizeDateKey(openedAt || due)
});

const normalizeCapaActions = (rawData) => {
    const actions = [];

    safeObjectEntries(rawData.incidents).forEach(([key, incident]) => {
        const capaList = Array.isArray(incident.capa)
            ? incident.capa
            : Object.values(incident.capa || incident.investigation?.capa || {});

        capaList.filter(Boolean).forEach((action, index) => {
            actions.push(buildCapaAction({
                uid: `INC-${key}-${index}`,
                source: 'Incident',
                sourceId: incident.id || incident.docId || 'INC',
                desc: action.act || action.action || action.desc,
                owner: action.own || action.owner || action.responsible,
                due: action.due || action.deadline || action.target,
                status: action.status,
                siteId: action.siteId || incident.siteId || 'Global',
                closedAt: action.closedAt,
                openedAt: action.createdAt || action.timestamp || incident.timestamp || incident.date
            }));
        });
    });

    safeObjectEntries(rawData.auditFindings).forEach(([key, audit]) => {
        safeObjectEntries(audit.findings).forEach(([findingIndex, finding]) => {
            if (!finding?.response?.capa) return;

            actions.push(buildCapaAction({
                uid: `AUD-${key}-${findingIndex}`,
                source: 'Audit',
                sourceId: audit.docId || audit.id || 'AUD',
                desc: finding.response.capa,
                owner: finding.response.owner,
                due: finding.response.targetDate,
                status: finding.response.capaStatus || audit.status,
                siteId: audit.siteId || audit.taskDetails?.siteId || 'Global',
                closedAt: finding.response.closedAt || audit.closureDate,
                openedAt: finding.response.createdAt || audit.auditDate || audit.submissionDate || audit.taskDetails?.date
            }));
        });
    });

    safeObjectEntries(rawData.mockDrills).forEach(([key, drill]) => {
        const capaList = Array.isArray(drill.capa) ? drill.capa : Object.values(drill.capa || {});

        capaList.filter(Boolean).forEach((action, index) => {
            actions.push(buildCapaAction({
                uid: `DRILL-${key}-${index}`,
                source: 'Emergency Drill',
                sourceId: drill.docId || drill.id || 'DRILL',
                desc: action.action || action.act,
                owner: action.owner || action.own,
                due: action.due || action.target,
                status: action.status,
                siteId: drill.siteId || 'Global',
                closedAt: action.closedAt,
                openedAt: action.createdAt || drill.date || drill.timestamp
            }));
        });
    });

    safeObjectEntries(rawData.consultations).forEach(([key, meeting]) => {
        const actionsList = Array.isArray(meeting.actions) ? meeting.actions : Object.values(meeting.actions || {});

        actionsList.filter(Boolean).forEach((action, index) => {
            actions.push(buildCapaAction({
                uid: `CONS-${key}-${index}`,
                source: 'Consultation',
                sourceId: meeting.id || meeting.docId || 'MEET',
                desc: action.item || action.action,
                owner: action.owner || action.own,
                due: action.deadline || action.due,
                status: action.status,
                siteId: meeting.siteId || 'Global',
                closedAt: action.closedAt,
                openedAt: action.createdAt || meeting.date || meeting.timestamp
            }));
        });
    });

    safeObjectEntries(rawData.improvements).forEach(([key, improvement]) => {
        if (!['Approved', 'In Progress', 'Completed', 'Closed'].includes(String(improvement.status || '').trim())) return;

        const actionsList = Array.isArray(improvement.actions)
            ? improvement.actions
            : Object.values(improvement.actions || {});

        if (actionsList.length > 0) {
            actionsList.filter(Boolean).forEach((action, index) => {
                actions.push(buildCapaAction({
                    uid: `IMP-${key}-${index}`,
                    source: 'Improvement',
                    sourceId: improvement.id || 'IMP',
                    desc: action.action || action.act,
                    owner: action.owner || action.own,
                    due: action.due || action.deadline,
                    status: action.status,
                    siteId: action.siteId || improvement.siteId || 'Global',
                    closedAt: action.closedAt || improvement.closedAt,
                    openedAt: action.createdAt || improvement.createdAt || improvement.date
                }));
            });
            return;
        }

        if (!improvement.title) return;
        actions.push(buildCapaAction({
            uid: `IMP-${key}`,
            source: 'Improvement',
            sourceId: improvement.id || 'IMP',
            desc: `Execute: ${improvement.title}`,
            owner: improvement.createdBy,
            due: improvement.date,
            status: improvement.status,
            siteId: improvement.siteId || 'Global',
            closedAt: improvement.closedAt,
            openedAt: improvement.createdAt || improvement.date
        }));
    });

    safeObjectEntries(rawData.inspectionRecords).forEach(([key, record]) => {
        const capaList = Array.isArray(record.capa) ? record.capa : Object.values(record.capa || {});

        capaList.filter(Boolean).forEach((action, index) => {
            actions.push(buildCapaAction({
                uid: `INSP-${key}-${index}`,
                source: 'Inspection',
                sourceId: record.templateTitle || record.title || 'Inspection',
                desc: action.desc || action.act || action.action,
                owner: action.owner || action.own,
                due: action.dueDate || action.due,
                status: action.status,
                siteId: action.siteId || record.siteId || 'Global',
                closedAt: action.closedAt,
                openedAt: action.createdAt || record.completedAt || record.timestamp
            }));
        });
    });

    return actions;
};

const matchesSiteScope = (siteId, siteFilter, isGlobalUser, allowedSiteCodes) => {
    const cleanSiteId = String(siteId || '').trim() || 'Global';

    if (!isGlobalUser) {
        if (['Global', 'GLOBAL', 'All'].includes(cleanSiteId)) return false;
        if (!allowedSiteCodes.has(cleanSiteId)) return false;
    }

    return siteFilter === 'All' || cleanSiteId === siteFilter;
};

const computeRate = (count, hours) => {
    if (!hours) return 0;
    return Number(((count * RATE_BASE) / hours).toFixed(2));
};

const isRecordableIncident = (incidentType) => ['Lost Time injury', 'Reportable Injury'].includes(incidentType);

const getBucketKeyFromDate = (dateValue, granularity) => {
    const parsed = parseDateOnly(dateValue);
    if (!parsed) return '';
    return formatDateKey(startOfGranularity(parsed, granularity));
};

const getCapaRelevantDate = (action) => {
    if (action.status === 'Closed') return action.closedAt || action.due || action.openedAt;
    return action.due || action.openedAt || action.closedAt;
};

const isClosedBeforeDue = (action) => {
    if (action.status !== 'Closed') return false;
    const dueDate = parseDateOnly(action.due);
    const closedDate = parseDateOnly(action.closedAt);
    if (!dueDate || !closedDate) return false;
    return closedDate <= dueDate;
};

const isClosedAfterDue = (action) => {
    if (action.status !== 'Closed') return false;
    const dueDate = parseDateOnly(action.due);
    const closedDate = parseDateOnly(action.closedAt);
    if (!dueDate || !closedDate) return false;
    return closedDate > dueDate;
};

const formatRateValue = (value) => Number(value || 0).toFixed(2);

const formatSourceLabel = (sourceId) => sourceId === 'Incident' ? 'Incidents' : sourceId;

const Panel = ({ id, title, description, accentClass = 'border-cyan-500', action, children }) => (
    <section id={id} className="rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden scroll-mt-24">
        <div className={`border-l-4 ${accentClass} px-6 py-5 bg-slate-900/95 border-b border-slate-800`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-black uppercase tracking-widest text-white">{title}</h2>
                    <p className="mt-1 text-sm text-slate-400">{description}</p>
                </div>
                {action}
            </div>
        </div>
        <div className="p-6 lg:p-8">{children}</div>
    </section>
);

const StatCard = ({ title, value, subtext, accentClass, icon }) => (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-lg ${accentClass}`}>
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">{title}</p>
                <h3 className="mt-2 text-3xl font-black text-white">{value}</h3>
                <p className="mt-2 text-xs text-slate-400">{subtext}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-xl text-slate-300">
                {icon}
            </div>
        </div>
    </div>
);

const SummaryList = ({ title, rows }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">{title}</h3>
        <div className="mt-4 space-y-3">
            {rows.length > 0 ? rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
                    <span className="text-sm text-slate-300">{row.label}</span>
                    <span className={`text-sm font-black ${row.valueClass || 'text-white'}`}>{row.value}</span>
                </div>
            )) : (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-xs italic text-slate-500">
                    No records found for the current filters.
                </div>
            )}
        </div>
    </div>
);

const ChartEmptyState = ({ title }) => (
    <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 text-center">
        <div>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-slate-500">
                <i className="fas fa-chart-area"></i>
            </div>
            <p className="text-sm font-bold text-slate-300">{title}</p>
            <p className="mt-1 text-xs text-slate-500">Adjust the filters or log more records to populate this chart.</p>
        </div>
    </div>
);

const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: {
                color: '#cbd5e1',
                font: {
                    family: 'Space Grotesk, sans-serif',
                    weight: '700'
                }
            }
        },
        tooltip: {
            backgroundColor: '#020617',
            borderColor: '#334155',
            borderWidth: 1,
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1'
        }
    },
    scales: {
        x: {
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(148, 163, 184, 0.08)' }
        },
        y: {
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(148, 163, 184, 0.08)' }
        }
    }
};

export default function Analytics() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session] = useState(() => readStoredSession());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sites, setSites] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [manHours, setManHours] = useState([]);
    const [capaActions, setCapaActions] = useState([]);
    const [ptwRecords, setPtwRecords] = useState([]);
    const [auditRecords, setAuditRecords] = useState([]);
    const [inspectionRecords, setInspectionRecords] = useState([]);
    const [mockDrills, setMockDrills] = useState([]);
    const [trainingRecords, setTrainingRecords] = useState([]);
    const [riskAssessments, setRiskAssessments] = useState([]);

    const cleanRole = String(session?.role || '').trim();
    const isGlobalUser = isGlobalOwnerRole(cleanRole);
    const permissions = useMemo(() => {
        const canEditCreate = canEditCreateForRole(cleanRole);
        return { viewOnly: !canEditCreate, canEditCreate };
    }, [cleanRole]);

    const initialSiteFilter = resolveInitialAnalyticsSite(session, location.search);
    const [siteFilter, setSiteFilter] = useState(initialSiteFilter);
    const [rangePreset, setRangePreset] = useState('annually');
    const [granularity, setGranularity] = useState('monthly');
    const [filterStart, setFilterStart] = useState(formatDateKey(startOfYear(new Date())));
    const [filterEnd, setFilterEnd] = useState(formatDateKey(new Date()));
    const [capaSourceFilter, setCapaSourceFilter] = useState('All');

    const [logDate, setLogDate] = useState(formatDateKey(new Date()));
    const [logSite, setLogSite] = useState(initialSiteFilter !== 'All' ? initialSiteFilter : '');
    const [permHours, setPermHours] = useState(0);
    const [contHours, setContHours] = useState(0);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        return getAllowedSiteCodes(session);
    }, [session]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((site) => allowedSiteCodes.has(site.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const loadAnalyticsData = useCallback(async (showRefreshState = false) => {
        if (!session?.orgId) return;

        if (showRefreshState) setRefreshing(true);
        else setLoading(true);

        try {
            const childNames = [
                'sites',
                'incidents',
                'manHours',
                'ptwRecords',
                'auditFindings',
                'mockDrills',
                'consultations',
                'improvements',
                'inspectionRecords',
                'trainings',
                'riskAssessments'
            ];

            const childEntries = await Promise.all(
                childNames.map(async (childName) => [childName, await fetchScopedChild(session.orgId, childName, session)])
            );

            const rawData = Object.fromEntries(childEntries);

            setSites(normalizeSites(rawData.sites));
            setIncidents(normalizeIncidents(rawData.incidents));
            setManHours(normalizeManHours(rawData.manHours));
            setCapaActions(normalizeCapaActions(rawData));
            setPtwRecords(normalizePtwRecords(rawData.ptwRecords));
            setAuditRecords(normalizeAuditRecords(rawData.auditFindings));
            setInspectionRecords(normalizeInspectionRecords(rawData.inspectionRecords));
            setMockDrills(normalizeMockDrills(rawData.mockDrills));
            setTrainingRecords(normalizeTrainingRecords(rawData.trainings));
            setRiskAssessments(normalizeRiskAssessments(rawData.riskAssessments));
        } catch (error) {
            console.error('Error loading analytics data:', error);
            alert('Failed to load analytics data. Please refresh and try again.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session]);

    useEffect(() => {
        if (!session) {
            navigate('/');
            return;
        }

        const hasModuleAccess = isGlobalOwnerRole(cleanRole) || hasAccessibleModule(session.accessibleModules, 'Analytics');
        if (!hasModuleAccess) {
            alert('Security Alert: You do not have permission to access the Analytics module.');
            navigate('/dashboard');
            return;
        }

        loadAnalyticsData();
    }, [cleanRole, loadAnalyticsData, navigate, session]);

    useEffect(() => {
        if (rangePreset === 'custom') return;

        const { start, end } = resolveRangeFromPreset(rangePreset, new Date());
        setFilterStart(formatDateKey(start));
        setFilterEnd(formatDateKey(end));
    }, [rangePreset]);

    useEffect(() => {
        sessionStorage.setItem('isoCurrentSite', siteFilter === 'All' ? 'GLOBAL' : siteFilter);
    }, [siteFilter]);

    useEffect(() => {
        if (!logSite && !isGlobalUser && visibleSites.length === 1) {
            setLogSite(visibleSites[0].code);
        }
    }, [isGlobalUser, logSite, visibleSites]);

    const rangeStartDate = useMemo(() => {
        const firstDate = parseDateOnly(filterStart);
        const secondDate = parseDateOnly(filterEnd);
        if (!firstDate && !secondDate) return startOfYear(new Date());
        if (!firstDate) return secondDate;
        if (!secondDate) return firstDate;
        return firstDate <= secondDate ? firstDate : secondDate;
    }, [filterEnd, filterStart]);

    const rangeEndDate = useMemo(() => {
        const firstDate = parseDateOnly(filterStart);
        const secondDate = parseDateOnly(filterEnd);
        if (!firstDate && !secondDate) return startOfDay(new Date());
        if (!firstDate) return secondDate;
        if (!secondDate) return firstDate;
        return firstDate <= secondDate ? secondDate : firstDate;
    }, [filterEnd, filterStart]);

    const rangeStartKey = formatDateKey(rangeStartDate);
    const rangeEndKey = formatDateKey(rangeEndDate);

    const periodBuckets = useMemo(
        () => buildPeriodBuckets(rangeStartDate, rangeEndDate, granularity),
        [granularity, rangeEndDate, rangeStartDate]
    );

    const activeRangeLabel = `${formatReadableDate(rangeStartKey)} to ${formatReadableDate(rangeEndKey)}`;

    const filteredIncidents = useMemo(() => (
        incidents.filter((incident) => {
            if (!incident.date || incident.date < rangeStartKey || incident.date > rangeEndKey) return false;
            return matchesSiteScope(incident.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, incidents, isGlobalUser, rangeEndKey, rangeStartKey, siteFilter]);

    const filteredManHours = useMemo(() => (
        manHours.filter((hourEntry) => {
            if (!hourEntry.date || hourEntry.date < rangeStartKey || hourEntry.date > rangeEndKey) return false;
            return matchesSiteScope(hourEntry.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, isGlobalUser, manHours, rangeEndKey, rangeStartKey, siteFilter]);

    const incidentStats = useMemo(() => {
        const totalHours = filteredManHours.reduce((sum, entry) => sum + entry.perm + entry.cont, 0);
        const nearMisses = filteredIncidents.filter((incident) => incident.type === 'Near Miss').length;
        const firstAid = filteredIncidents.filter((incident) => incident.type === 'First Aid injury').length;
        const recordable = filteredIncidents.filter((incident) => isRecordableIncident(incident.type)).length;
        const lostTime = filteredIncidents.filter((incident) => incident.type === 'Lost Time injury').length;

        return {
            nearMisses,
            firstAid,
            recordable,
            lostTime,
            totalHours,
            nmr: computeRate(nearMisses, totalHours),
            fair: computeRate(firstAid, totalHours),
            rir: computeRate(recordable, totalHours)
        };
    }, [filteredIncidents, filteredManHours]);

    const incidentTrendRows = useMemo(() => {
        const bucketMap = new Map(
            periodBuckets.map((bucket) => [bucket.key, {
                key: bucket.key,
                label: bucket.label,
                nearMisses: 0,
                firstAid: 0,
                recordable: 0,
                hours: 0
            }])
        );

        filteredManHours.forEach((entry) => {
            const bucket = bucketMap.get(getBucketKeyFromDate(entry.date, granularity));
            if (!bucket) return;
            bucket.hours += entry.perm + entry.cont;
        });

        filteredIncidents.forEach((incident) => {
            const bucket = bucketMap.get(getBucketKeyFromDate(incident.date, granularity));
            if (!bucket) return;

            if (incident.type === 'Near Miss') bucket.nearMisses += 1;
            if (incident.type === 'First Aid injury') bucket.firstAid += 1;
            if (isRecordableIncident(incident.type)) bucket.recordable += 1;
        });

        return Array.from(bucketMap.values()).map((row) => ({
            ...row,
            nmr: computeRate(row.nearMisses, row.hours),
            fair: computeRate(row.firstAid, row.hours),
            rir: computeRate(row.recordable, row.hours)
        }));
    }, [filteredIncidents, filteredManHours, granularity, periodBuckets]);

    const incidentChartData = useMemo(() => ({
        labels: incidentTrendRows.map((row) => row.label),
        datasets: [
            {
                label: 'NMR',
                data: incidentTrendRows.map((row) => row.nmr),
                borderColor: '#facc15',
                backgroundColor: 'rgba(250, 204, 21, 0.2)',
                fill: true,
                tension: 0.35
            },
            {
                label: 'FAIR',
                data: incidentTrendRows.map((row) => row.fair),
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.16)',
                fill: true,
                tension: 0.35
            },
            {
                label: 'RIR',
                data: incidentTrendRows.map((row) => row.rir),
                borderColor: '#fb923c',
                backgroundColor: 'rgba(251, 146, 60, 0.16)',
                fill: true,
                tension: 0.35
            }
        ]
    }), [incidentTrendRows]);

    const incidentBreakdownData = useMemo(() => ({
        labels: ['Near Miss', 'First Aid', 'Recordable'],
        datasets: [
            {
                data: [
                    incidentStats.nearMisses,
                    incidentStats.firstAid,
                    incidentStats.recordable
                ],
                backgroundColor: ['#facc15', '#38bdf8', '#fb923c'],
                borderColor: '#020617',
                borderWidth: 3
            }
        ]
    }), [incidentStats.firstAid, incidentStats.nearMisses, incidentStats.recordable]);

    const filteredCapaActions = useMemo(() => (
        capaActions.filter((action) => {
            const relevantDate = getCapaRelevantDate(action);
            if (!relevantDate || relevantDate < rangeStartKey || relevantDate > rangeEndKey) return false;
            if (!matchesSiteScope(action.siteId, siteFilter, isGlobalUser, allowedSiteCodes)) return false;
            if (capaSourceFilter !== 'All' && action.source !== capaSourceFilter) return false;
            return true;
        })
    ), [allowedSiteCodes, capaActions, capaSourceFilter, isGlobalUser, rangeEndKey, rangeStartKey, siteFilter]);

    const filteredPermits = useMemo(() => (
        ptwRecords.filter((permit) => {
            if (!permit.analyticsDate || permit.analyticsDate < rangeStartKey || permit.analyticsDate > rangeEndKey) return false;
            return matchesSiteScope(permit.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, isGlobalUser, ptwRecords, rangeEndKey, rangeStartKey, siteFilter]);

    const filteredAuditRecords = useMemo(() => (
        auditRecords.filter((audit) => {
            if (!audit.analyticsDate || audit.analyticsDate < rangeStartKey || audit.analyticsDate > rangeEndKey) return false;
            return matchesSiteScope(audit.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, auditRecords, isGlobalUser, rangeEndKey, rangeStartKey, siteFilter]);

    const filteredInspectionRecords = useMemo(() => (
        inspectionRecords.filter((record) => {
            if (!record.analyticsDate || record.analyticsDate < rangeStartKey || record.analyticsDate > rangeEndKey) return false;
            return matchesSiteScope(record.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, inspectionRecords, isGlobalUser, rangeEndKey, rangeStartKey, siteFilter]);

    const filteredMockDrills = useMemo(() => (
        mockDrills.filter((record) => {
            if (!record.analyticsDate || record.analyticsDate < rangeStartKey || record.analyticsDate > rangeEndKey) return false;
            return matchesSiteScope(record.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, isGlobalUser, mockDrills, rangeEndKey, rangeStartKey, siteFilter]);

    const filteredTrainingRecords = useMemo(() => (
        trainingRecords.filter((record) => {
            if (!record.analyticsDate || record.analyticsDate < rangeStartKey || record.analyticsDate > rangeEndKey) return false;
            return matchesSiteScope(record.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, isGlobalUser, rangeEndKey, rangeStartKey, siteFilter, trainingRecords]);

    const filteredRiskAssessments = useMemo(() => (
        riskAssessments.filter((assessment) => {
            if (!assessment.analyticsDate || assessment.analyticsDate < rangeStartKey || assessment.analyticsDate > rangeEndKey) return false;
            return matchesSiteScope(assessment.siteId, siteFilter, isGlobalUser, allowedSiteCodes);
        })
    ), [allowedSiteCodes, isGlobalUser, rangeEndKey, rangeStartKey, riskAssessments, siteFilter]);

    const trainingCertifications = useMemo(() => (
        buildTrainingCertifications(trainingRecords).filter((certification) => (
            matchesSiteScope(certification.siteId, siteFilter, isGlobalUser, allowedSiteCodes)
        ))
    ), [allowedSiteCodes, isGlobalUser, siteFilter, trainingRecords]);

    const ptwStats = useMemo(() => ({
        total: filteredPermits.length,
        pendingApproval: filteredPermits.filter((permit) => permit.status === 'Pending Approval').length,
        workInProgress: filteredPermits.filter((permit) => permit.status === 'Work in Progress').length,
        pendingClosure: filteredPermits.filter((permit) => permit.status === 'Pending Closure').length,
        closed: filteredPermits.filter((permit) => permit.status === 'Closed').length,
        cancelled: filteredPermits.filter((permit) => permit.status === 'Cancelled').length
    }), [filteredPermits]);

    const ptwTypeRows = useMemo(() => {
        const summaryMap = new Map();

        filteredPermits.forEach((permit) => {
            const typeLabel = permit.typeId || permit.permitType || 'General';
            summaryMap.set(typeLabel, (summaryMap.get(typeLabel) || 0) + 1);
        });

        return Array.from(summaryMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((left, right) => right.value - left.value);
    }, [filteredPermits]);

    const auditStats = useMemo(() => ({
        total: filteredAuditRecords.length,
        findings: filteredAuditRecords.reduce((sum, audit) => sum + audit.findings.length, 0),
        correctionPending: filteredAuditRecords.filter((audit) => audit.status === 'Reported').length,
        verificationPending: filteredAuditRecords.filter((audit) => audit.status === 'Submitted for Verification').length,
        closed: filteredAuditRecords.filter((audit) => audit.status === 'Closed').length
    }), [filteredAuditRecords]);

    const auditStatusRows = useMemo(() => ([
        { label: 'Correction Pending', value: auditStats.correctionPending, valueClass: 'text-red-400' },
        { label: 'Verification Pending', value: auditStats.verificationPending, valueClass: 'text-orange-400' },
        { label: 'Closed Audits', value: auditStats.closed, valueClass: 'text-emerald-400' },
        { label: 'Logged Findings', value: auditStats.findings, valueClass: 'text-cyan-400' }
    ]), [auditStats]);

    const inspectionStats = useMemo(() => {
        const issues = filteredInspectionRecords.reduce((sum, record) => sum + countInspectionIssues(record), 0);
        const inspectionsWithIssues = filteredInspectionRecords.filter((record) => countInspectionIssues(record) > 0).length;

        return {
            total: filteredInspectionRecords.length,
            clean: filteredInspectionRecords.filter((record) => countInspectionIssues(record) === 0).length,
            withIssues: inspectionsWithIssues,
            issues,
            capaRaised: filteredInspectionRecords.reduce((sum, record) => sum + safeArray(record.capa).length, 0)
        };
    }, [filteredInspectionRecords]);

    const inspectionTypeRows = useMemo(() => {
        const summaryMap = new Map();

        filteredInspectionRecords.forEach((record) => {
            const label = record.templateTitle || 'Inspection';
            const row = summaryMap.get(label) || { label, completed: 0, issues: 0 };
            row.completed += 1;
            row.issues += countInspectionIssues(record);
            summaryMap.set(label, row);
        });

        return Array.from(summaryMap.values()).sort((left, right) => right.completed - left.completed);
    }, [filteredInspectionRecords]);

    const emergencyStats = useMemo(() => ({
        total: filteredMockDrills.length,
        mockDrills: filteredMockDrills.filter((record) => String(record.eventType || 'Mock Drill').trim() === 'Mock Drill').length,
        realEmergencies: filteredMockDrills.filter((record) => String(record.eventType || '').trim() === 'Real Emergency').length,
        capaRaised: filteredMockDrills.reduce((sum, record) => sum + safeArray(record.capa).length, 0),
        headCount: filteredMockDrills.reduce((sum, record) => sum + Number(record.headCount || 0), 0)
    }), [filteredMockDrills]);

    const emergencyTypeRows = useMemo(() => {
        const summaryMap = new Map();

        filteredMockDrills.forEach((record) => {
            const label = record.selectedDrill || record.eventType || 'Emergency Event';
            summaryMap.set(label, (summaryMap.get(label) || 0) + 1);
        });

        return Array.from(summaryMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((left, right) => right.value - left.value);
    }, [filteredMockDrills]);

    const trainingStats = useMemo(() => ({
        sessions: filteredTrainingRecords.length,
        attendees: filteredTrainingRecords.reduce((sum, record) => sum + safeArray(record.attendees).filter((attendee) => attendee.status === 'Attended').length, 0),
        validCerts: trainingCertifications.filter((certification) => certification.status === 'Valid').length,
        expiringSoon: trainingCertifications.filter((certification) => certification.status === '< 30 Days' || certification.status === '< 6 Months').length,
        expired: trainingCertifications.filter((certification) => certification.status === 'Expired').length
    }), [filteredTrainingRecords, trainingCertifications]);

    const trainingTopicRows = useMemo(() => {
        const summaryMap = new Map();

        filteredTrainingRecords.forEach((record) => {
            const label = record.topic || 'Training';
            const row = summaryMap.get(label) || { label, sessions: 0, attendees: 0 };
            row.sessions += 1;
            row.attendees += safeArray(record.attendees).filter((attendee) => attendee.status === 'Attended').length;
            summaryMap.set(label, row);
        });

        return Array.from(summaryMap.values()).sort((left, right) => right.sessions - left.sessions);
    }, [filteredTrainingRecords]);

    const riskStats = useMemo(() => ({
        assessments: filteredRiskAssessments.length,
        active: filteredRiskAssessments.filter((assessment) => assessment.status === 'Active').length,
        hazards: filteredRiskAssessments.reduce((sum, assessment) => sum + (assessment.activities || []).reduce((activityTotal, activity) => activityTotal + safeArray(activity.hazards).length, 0), 0),
        highResidual: filteredRiskAssessments.filter((assessment) => hasHighResidualRisk(assessment)).length,
        alarp: filteredRiskAssessments.filter((assessment) => hasAlarpCase(assessment)).length
    }), [filteredRiskAssessments]);

    const riskStatusRows = useMemo(() => {
        const summaryMap = new Map();

        filteredRiskAssessments.forEach((assessment) => {
            const label = assessment.status || 'Draft';
            summaryMap.set(label, (summaryMap.get(label) || 0) + 1);
        });

        return Array.from(summaryMap.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((left, right) => right.value - left.value);
    }, [filteredRiskAssessments]);

    const capaStats = useMemo(() => {
        const todayKey = formatDateKey(new Date());
        const open = filteredCapaActions.filter((action) => action.status !== 'Closed').length;
        const closed = filteredCapaActions.filter((action) => action.status === 'Closed').length;
        const closedBeforeDue = filteredCapaActions.filter((action) => isClosedBeforeDue(action)).length;
        const closedAfterDue = filteredCapaActions.filter((action) => isClosedAfterDue(action)).length;
        const overdueOpen = filteredCapaActions.filter((action) => action.status !== 'Closed' && action.due && action.due < todayKey).length;

        return { open, closed, closedBeforeDue, closedAfterDue, overdueOpen };
    }, [filteredCapaActions]);

    const capaTrendRows = useMemo(() => {
        const bucketMap = new Map(
            periodBuckets.map((bucket) => [bucket.key, {
                key: bucket.key,
                label: bucket.label,
                open: 0,
                closed: 0,
                closedBeforeDue: 0,
                closedAfterDue: 0
            }])
        );

        filteredCapaActions.forEach((action) => {
            const anchorDate = action.status === 'Closed'
                ? (action.closedAt || action.due || action.openedAt)
                : (action.due || action.openedAt || action.closedAt);

            const bucket = bucketMap.get(getBucketKeyFromDate(anchorDate, granularity));
            if (!bucket) return;

            if (action.status === 'Closed') {
                bucket.closed += 1;
                if (isClosedBeforeDue(action)) bucket.closedBeforeDue += 1;
                if (isClosedAfterDue(action)) bucket.closedAfterDue += 1;
            } else {
                bucket.open += 1;
            }
        });

        return Array.from(bucketMap.values());
    }, [filteredCapaActions, granularity, periodBuckets]);

    const capaTrendChartData = useMemo(() => ({
        labels: capaTrendRows.map((row) => row.label),
        datasets: [
            {
                label: 'Open',
                data: capaTrendRows.map((row) => row.open),
                backgroundColor: 'rgba(250, 204, 21, 0.85)',
                borderRadius: 8
            },
            {
                label: 'Closed',
                data: capaTrendRows.map((row) => row.closed),
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderRadius: 8
            },
            {
                label: 'Closed Before Due',
                data: capaTrendRows.map((row) => row.closedBeforeDue),
                backgroundColor: 'rgba(56, 189, 248, 0.85)',
                borderRadius: 8
            },
            {
                label: 'Closed After Due',
                data: capaTrendRows.map((row) => row.closedAfterDue),
                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                borderRadius: 8
            }
        ]
    }), [capaTrendRows]);

    const capaSourceRows = useMemo(() => {
        const sourceMap = new Map();

        filteredCapaActions.forEach((action) => {
            if (!sourceMap.has(action.source)) {
                sourceMap.set(action.source, {
                    source: action.source,
                    total: 0,
                    open: 0,
                    closed: 0,
                    closedBeforeDue: 0,
                    closedAfterDue: 0
                });
            }

            const row = sourceMap.get(action.source);
            row.total += 1;
            if (action.status === 'Closed') {
                row.closed += 1;
                if (isClosedBeforeDue(action)) row.closedBeforeDue += 1;
                if (isClosedAfterDue(action)) row.closedAfterDue += 1;
            } else {
                row.open += 1;
            }
        });

        return Array.from(sourceMap.values()).sort((left, right) => right.total - left.total);
    }, [filteredCapaActions]);

    const capaSourceChartData = useMemo(() => ({
        labels: capaSourceRows.map((row) => formatSourceLabel(row.source)),
        datasets: [
            {
                data: capaSourceRows.map((row) => row.total),
                backgroundColor: capaSourceRows.map((row) => CAPA_SOURCE_COLORS[row.source] || '#94a3b8'),
                borderColor: '#020617',
                borderWidth: 3
            }
        ]
    }), [capaSourceRows]);

    const lineChartOptions = useMemo(() => ({
        ...baseChartOptions,
        plugins: {
            ...baseChartOptions.plugins,
            title: {
                display: true,
                text: 'Incident Rate Trend',
                color: '#f8fafc',
                font: { size: 14, weight: '700' }
            }
        },
        scales: {
            ...baseChartOptions.scales,
            y: {
                ...baseChartOptions.scales.y,
                title: {
                    display: true,
                    text: `Rate per ${RATE_BASE.toLocaleString()} hours`,
                    color: '#94a3b8'
                }
            }
        }
    }), []);

    const barChartOptions = useMemo(() => ({
        ...baseChartOptions,
        plugins: {
            ...baseChartOptions.plugins,
            title: {
                display: true,
                text: 'CAPA Status Movement',
                color: '#f8fafc',
                font: { size: 14, weight: '700' }
            }
        }
    }), []);

    const doughnutOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#cbd5e1',
                    font: {
                        family: 'Space Grotesk, sans-serif',
                        weight: '700'
                    }
                }
            }
        }
    }), []);

    const handleSiteFilterChange = (event) => {
        const selectedSite = event.target.value;
        setSiteFilter(selectedSite);
        setLogSite(selectedSite !== 'All' ? selectedSite : '');
    };

    const handleLogHours = async () => {
        if (!permissions.canEditCreate) {
            alert('Security Error: You do not have permission to log exposure hours.');
            return;
        }

        if (!logSite) {
            alert('Please select a specific facility/site to log hours against.');
            return;
        }

        if (!isGlobalUser && !allowedSiteCodes.has(logSite)) {
            alert('Security Error: You are not authorized to log hours for this site.');
            return;
        }

        if (Number(permHours) <= 0 && Number(contHours) <= 0) {
            alert('Please enter valid working hours.');
            return;
        }

        try {
            const payload = {
                siteId: logSite,
                date: logDate,
                perm: Number(permHours || 0),
                cont: Number(contHours || 0),
                loggedBy: session?.name || session?.email || session?.user,
                timestamp: new Date().toISOString()
            };

            await push(ref(rtdb, `organizations/${session.orgId}/manHours`), payload);
            setManHours((currentEntries) => [...currentEntries, payload]);
            setPermHours(0);
            setContHours(0);
            alert('Exposure hours logged successfully.');
        } catch (error) {
            alert(`Error saving data: ${error.message}`);
        }
    };

    if (loading || !session) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white font-['Space_Grotesk']">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-800 border-t-blue-500"></div>
                <h2 className="text-sm font-bold uppercase tracking-[0.35em] text-slate-400">Loading Analytics Engine...</h2>
            </div>
        );
    }

    const hasIncidentData = incidentTrendRows.some((row) => row.hours || row.nearMisses || row.firstAid || row.recordable);
    const hasCapaTrendData = capaTrendRows.some((row) => row.open || row.closed || row.closedBeforeDue || row.closedAfterDue);
    const hasCapaSourceData = capaSourceRows.length > 0;

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-white font-['Space_Grotesk']">
            <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-500/8 blur-[140px]"></div>
            <div className="pointer-events-none absolute bottom-[-10%] left-[-10%] h-[420px] w-[420px] rounded-full bg-blue-500/8 blur-[120px]"></div>

            <header className="z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-6 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-slate-400 transition-colors hover:text-white">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="mx-2 h-6 w-px bg-slate-800"></div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-900/40">
                        <i className="fas fa-chart-line"></i>
                    </div>
                    <div>
                        <h1 className="text-base font-black uppercase tracking-widest text-white">Analytics Command Center</h1>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Incident Rates • CAPA Health • Exposure Hours</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
                        {session?.role}
                    </span>
                    {permissions.viewOnly && (
                        <span className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                            Read Only
                        </span>
                    )}
                </div>
            </header>

            <main className="relative z-10 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-8 pb-16">
                    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tight text-white">Multi-Dashboard Analytics</h2>
                                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                                    Track incident rates, CAPA performance, and exposure hours by site, period preset, reporting granularity, or a custom date window.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => loadAnalyticsData(true)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.25em] text-cyan-300 transition-colors hover:bg-cyan-500/20"
                            >
                                <i className={`fas ${refreshing ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}></i>
                                Refresh Data
                            </button>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Site</label>
                                <select
                                    value={siteFilter}
                                    onChange={handleSiteFilterChange}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-500"
                                >
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {visibleSites.map((site) => (
                                        <option key={site.code} value={site.code}>{site.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Range Preset</label>
                                <select
                                    value={rangePreset}
                                    onChange={(event) => setRangePreset(event.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-500"
                                >
                                    {RANGE_PRESET_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Granularity</label>
                                <select
                                    value={granularity}
                                    onChange={(event) => setGranularity(event.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-500"
                                >
                                    {GRANULARITY_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Date From</label>
                                <input
                                    type="date"
                                    value={filterStart}
                                    disabled={rangePreset !== 'custom'}
                                    onChange={(event) => setFilterStart(event.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Date To</label>
                                <input
                                    type="date"
                                    value={filterEnd}
                                    disabled={rangePreset !== 'custom'}
                                    onChange={(event) => setFilterEnd(event.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-400">
                            <span className="font-bold uppercase tracking-[0.25em] text-slate-500">Active Window:</span>
                            <span className="ml-2">{activeRangeLabel}</span>
                            <span className="ml-4 font-bold uppercase tracking-[0.25em] text-slate-500">Grouping:</span>
                            <span className="ml-2">{GRANULARITY_OPTIONS.find((option) => option.id === granularity)?.label}</span>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
                        <h2 className="text-lg font-black uppercase tracking-widest text-white">Dashboard Navigator</h2>
                        <p className="mt-2 text-sm text-slate-400">Jump straight to the module dashboard you want to review.</p>
                        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                            {[
                                ['dashboard-incidents', 'Incident Dashboard', 'fa-triangle-exclamation', 'text-yellow-400'],
                                ['dashboard-capa', 'CAPA Dashboard', 'fa-list-check', 'text-emerald-400'],
                                ['dashboard-ptw', 'PTW Dashboard', 'fa-file-signature', 'text-amber-400'],
                                ['dashboard-audits', 'Audit Dashboard', 'fa-clipboard-check', 'text-sky-400'],
                                ['dashboard-inspections', 'Inspection Dashboard', 'fa-clipboard-list', 'text-lime-400'],
                                ['dashboard-emergency', 'Emergency Dashboard', 'fa-person-running', 'text-rose-400'],
                                ['dashboard-training', 'Training Dashboard', 'fa-graduation-cap', 'text-violet-400'],
                                ['dashboard-risk', 'Risk Dashboard', 'fa-shield-heart', 'text-orange-400'],
                                ['dashboard-exposure', 'Exposure Hours', 'fa-users', 'text-cyan-400']
                            ].map(([targetId, label, icon, colorClass]) => (
                                <a
                                    key={targetId}
                                    href={`#${targetId}`}
                                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 transition-colors hover:border-slate-700 hover:bg-slate-900"
                                >
                                    <div className={`text-lg ${colorClass}`}>
                                        <i className={`fas ${icon}`}></i>
                                    </div>
                                    <div className="mt-3 text-sm font-bold text-white">{label}</div>
                                </a>
                            ))}
                        </div>
                    </section>

                    <Panel
                        id="dashboard-incidents"
                        title="Incident Dashboard"
                        description="NMR, FAIR, and RIR are recalculated from the filtered incident population and logged exposure hours."
                        accentClass="border-yellow-500"
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <StatCard
                                title="NMR"
                                value={formatRateValue(incidentStats.nmr)}
                                subtext={`${incidentStats.nearMisses} near misses in the selected window`}
                                accentClass="border-l-4 border-yellow-500"
                                icon={<i className="fas fa-bolt text-yellow-400"></i>}
                            />
                            <StatCard
                                title="FAIR"
                                value={formatRateValue(incidentStats.fair)}
                                subtext={`${incidentStats.firstAid} first aid cases in the selected window`}
                                accentClass="border-l-4 border-sky-500"
                                icon={<i className="fas fa-kit-medical text-sky-400"></i>}
                            />
                            <StatCard
                                title="RIR"
                                value={formatRateValue(incidentStats.rir)}
                                subtext={`${incidentStats.recordable} recordable injuries in the selected window`}
                                accentClass="border-l-4 border-orange-500"
                                icon={<i className="fas fa-triangle-exclamation text-orange-400"></i>}
                            />
                            <StatCard
                                title="Exposure Hours"
                                value={Math.round(incidentStats.totalHours).toLocaleString()}
                                subtext={`${incidentStats.lostTime} lost time injuries also recorded in this view`}
                                accentClass="border-l-4 border-violet-500"
                                icon={<i className="fas fa-users text-violet-400"></i>}
                            />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.8fr_1fr]">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                                {hasIncidentData ? (
                                    <div className="h-[340px]">
                                        <Line data={incidentChartData} options={lineChartOptions} />
                                    </div>
                                ) : (
                                    <ChartEmptyState title="No incident trend data in the selected range" />
                                )}
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                                {incidentStats.nearMisses || incidentStats.firstAid || incidentStats.recordable ? (
                                    <div className="h-[340px]">
                                        <Doughnut data={incidentBreakdownData} options={doughnutOptions} />
                                    </div>
                                ) : (
                                    <ChartEmptyState title="No incident breakdown available in the selected range" />
                                )}
                            </div>
                        </div>

                        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-800">
                            <div className="border-b border-slate-800 bg-slate-950 px-5 py-4">
                                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">Incident Period Register</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-950/80 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                                        <tr>
                                            <th className="px-5 py-4">Period</th>
                                            <th className="px-5 py-4">Near Miss</th>
                                            <th className="px-5 py-4">First Aid</th>
                                            <th className="px-5 py-4">Recordable</th>
                                            <th className="px-5 py-4">Hours</th>
                                            <th className="px-5 py-4">NMR</th>
                                            <th className="px-5 py-4">FAIR</th>
                                            <th className="px-5 py-4">RIR</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                                        {incidentTrendRows.map((row) => (
                                            <tr key={row.key} className="hover:bg-slate-900/70">
                                                <td className="px-5 py-4 font-bold text-white">{row.label}</td>
                                                <td className="px-5 py-4">{row.nearMisses}</td>
                                                <td className="px-5 py-4">{row.firstAid}</td>
                                                <td className="px-5 py-4">{row.recordable}</td>
                                                <td className="px-5 py-4 font-mono">{Math.round(row.hours).toLocaleString()}</td>
                                                <td className="px-5 py-4 font-mono text-yellow-400">{formatRateValue(row.nmr)}</td>
                                                <td className="px-5 py-4 font-mono text-sky-400">{formatRateValue(row.fair)}</td>
                                                <td className="px-5 py-4 font-mono text-orange-400">{formatRateValue(row.rir)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-capa"
                        title="CAPA Dashboard"
                        description="Monitor CAPA action health by source, due performance, and closure discipline across incidents, audits, inspections, drills, and more."
                        accentClass="border-emerald-500"
                        action={(
                            <div className="w-full lg:w-72">
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Action Source</label>
                                <select
                                    value={capaSourceFilter}
                                    onChange={(event) => setCapaSourceFilter(event.target.value)}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-emerald-500"
                                >
                                    <option value="All">All Sources</option>
                                    {CAPA_SOURCE_OPTIONS.map((source) => (
                                        <option key={source} value={source}>{formatSourceLabel(source)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <StatCard
                                title="CAPA Open"
                                value={capaStats.open}
                                subtext={`${capaStats.overdueOpen} open actions are already overdue`}
                                accentClass="border-l-4 border-yellow-500"
                                icon={<i className="fas fa-hourglass-half text-yellow-400"></i>}
                            />
                            <StatCard
                                title="CAPA Closed"
                                value={capaStats.closed}
                                subtext="Closed within the selected analytics window"
                                accentClass="border-l-4 border-emerald-500"
                                icon={<i className="fas fa-circle-check text-emerald-400"></i>}
                            />
                            <StatCard
                                title="Closed Before Due"
                                value={capaStats.closedBeforeDue}
                                subtext="Actions closed on or before their due date"
                                accentClass="border-l-4 border-sky-500"
                                icon={<i className="fas fa-gauge-high text-sky-400"></i>}
                            />
                            <StatCard
                                title="Closed After Due"
                                value={capaStats.closedAfterDue}
                                subtext="Actions that missed their due commitment"
                                accentClass="border-l-4 border-red-500"
                                icon={<i className="fas fa-clock-rotate-left text-red-400"></i>}
                            />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.8fr_1fr]">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                                {hasCapaTrendData ? (
                                    <div className="h-[340px]">
                                        <Bar data={capaTrendChartData} options={barChartOptions} />
                                    </div>
                                ) : (
                                    <ChartEmptyState title="No CAPA movement recorded in the selected range" />
                                )}
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                                {hasCapaSourceData ? (
                                    <div className="h-[340px]">
                                        <Doughnut data={capaSourceChartData} options={doughnutOptions} />
                                    </div>
                                ) : (
                                    <ChartEmptyState title="No CAPA source mix available in the selected range" />
                                )}
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
                            <div className="overflow-hidden rounded-2xl border border-slate-800">
                                <div className="border-b border-slate-800 bg-slate-950 px-5 py-4">
                                    <h3 className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">CAPA Source Register</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-950/80 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                                            <tr>
                                                <th className="px-5 py-4">Source</th>
                                                <th className="px-5 py-4">Total</th>
                                                <th className="px-5 py-4">Open</th>
                                                <th className="px-5 py-4">Closed</th>
                                                <th className="px-5 py-4">Before Due</th>
                                                <th className="px-5 py-4">After Due</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                                            {capaSourceRows.length > 0 ? capaSourceRows.map((row) => (
                                                <tr key={row.source} className="hover:bg-slate-900/70">
                                                    <td className="px-5 py-4 font-bold text-white">
                                                        <span
                                                            className="inline-flex rounded-xl px-3 py-1 text-xs font-bold"
                                                            style={{
                                                                color: CAPA_SOURCE_COLORS[row.source] || '#cbd5e1',
                                                                backgroundColor: `${CAPA_SOURCE_COLORS[row.source] || '#334155'}20`
                                                            }}
                                                        >
                                                            {formatSourceLabel(row.source)}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4">{row.total}</td>
                                                    <td className="px-5 py-4 text-yellow-400">{row.open}</td>
                                                    <td className="px-5 py-4 text-emerald-400">{row.closed}</td>
                                                    <td className="px-5 py-4 text-sky-400">{row.closedBeforeDue}</td>
                                                    <td className="px-5 py-4 text-red-400">{row.closedAfterDue}</td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="6" className="px-5 py-10 text-center text-sm italic text-slate-500">
                                                        No CAPA actions found for the current filters.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">What This View Measures</h3>
                                <div className="mt-4 space-y-4 text-sm text-slate-400">
                                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
                                        <p className="font-bold text-white">Open</p>
                                        <p className="mt-1 text-xs">Actions still pending, grouped against their due or planned action date.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
                                        <p className="font-bold text-white">Closed</p>
                                        <p className="mt-1 text-xs">Actions formally closed inside the selected analytics window.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
                                        <p className="font-bold text-white">Closed Before Due</p>
                                        <p className="mt-1 text-xs">Closed on or before the committed due date.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
                                        <p className="font-bold text-white">Closed After Due</p>
                                        <p className="mt-1 text-xs">Closed after the due date slipped.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-ptw"
                        title="PTW Dashboard"
                        description="Track permit load, live approvals, and operational permit state across the filtered site and time window."
                        accentClass="border-amber-500"
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <StatCard title="Permits Logged" value={ptwStats.total} subtext="Permits created in the selected window" accentClass="border-l-4 border-amber-500" icon={<i className="fas fa-file-signature text-amber-400"></i>} />
                            <StatCard title="Pending Approval" value={ptwStats.pendingApproval} subtext="Awaiting engineering or production approval" accentClass="border-l-4 border-orange-500" icon={<i className="fas fa-user-clock text-orange-400"></i>} />
                            <StatCard title="Work In Progress" value={ptwStats.workInProgress} subtext="Active permits currently in execution" accentClass="border-l-4 border-sky-500" icon={<i className="fas fa-person-digging text-sky-400"></i>} />
                            <StatCard title="Pending Closure" value={ptwStats.pendingClosure} subtext="Work done, waiting for close-out approval" accentClass="border-l-4 border-violet-500" icon={<i className="fas fa-hourglass-end text-violet-400"></i>} />
                            <StatCard title="Closed / Cancelled" value={`${ptwStats.closed} / ${ptwStats.cancelled}`} subtext="Completed versus cancelled permits" accentClass="border-l-4 border-emerald-500" icon={<i className="fas fa-lock text-emerald-400"></i>} />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <SummaryList
                                title="Permit Type Mix"
                                rows={ptwTypeRows.map((row) => ({ label: row.label, value: row.value, valueClass: 'text-amber-300' }))}
                            />
                            <SummaryList
                                title="Permit Status Snapshot"
                                rows={[
                                    { label: 'Pending Approval', value: ptwStats.pendingApproval, valueClass: 'text-orange-400' },
                                    { label: 'Work In Progress', value: ptwStats.workInProgress, valueClass: 'text-sky-400' },
                                    { label: 'Pending Closure', value: ptwStats.pendingClosure, valueClass: 'text-violet-400' },
                                    { label: 'Closed', value: ptwStats.closed, valueClass: 'text-emerald-400' },
                                    { label: 'Cancelled', value: ptwStats.cancelled, valueClass: 'text-red-400' }
                                ]}
                            />
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-audits"
                        title="Audit Dashboard"
                        description="See audit finding load, correction backlog, and verification health for the current analytics window."
                        accentClass="border-sky-500"
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <StatCard title="Audits Logged" value={auditStats.total} subtext="Audit records captured in the window" accentClass="border-l-4 border-sky-500" icon={<i className="fas fa-clipboard-check text-sky-400"></i>} />
                            <StatCard title="Findings Raised" value={auditStats.findings} subtext="Total findings documented across those audits" accentClass="border-l-4 border-cyan-500" icon={<i className="fas fa-list-ol text-cyan-400"></i>} />
                            <StatCard title="Correction Pending" value={auditStats.correctionPending} subtext="Audits waiting for corrective action response" accentClass="border-l-4 border-red-500" icon={<i className="fas fa-triangle-exclamation text-red-400"></i>} />
                            <StatCard title="Verification Pending" value={auditStats.verificationPending} subtext="Audits submitted and waiting for verification" accentClass="border-l-4 border-orange-500" icon={<i className="fas fa-check-double text-orange-400"></i>} />
                            <StatCard title="Closed Audits" value={auditStats.closed} subtext="Audits fully verified and closed" accentClass="border-l-4 border-emerald-500" icon={<i className="fas fa-circle-check text-emerald-400"></i>} />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <SummaryList title="Audit Workflow Snapshot" rows={auditStatusRows} />
                            <SummaryList
                                title="Audit Action Indicators"
                                rows={[
                                    { label: 'Average Findings Per Audit', value: auditStats.total ? (auditStats.findings / auditStats.total).toFixed(1) : '0.0', valueClass: 'text-cyan-300' },
                                    { label: 'Close Rate', value: auditStats.total ? `${Math.round((auditStats.closed / auditStats.total) * 100)}%` : '0%', valueClass: 'text-emerald-400' },
                                    { label: 'Verification Queue', value: auditStats.verificationPending, valueClass: 'text-orange-400' }
                                ]}
                            />
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-inspections"
                        title="Inspection Dashboard"
                        description="Review inspection execution quality, recurring issues, and the CAPA load being generated from inspection activity."
                        accentClass="border-lime-500"
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <StatCard title="Completed" value={inspectionStats.total} subtext="Inspection records logged in the selected window" accentClass="border-l-4 border-lime-500" icon={<i className="fas fa-clipboard-list text-lime-400"></i>} />
                            <StatCard title="Clean Inspections" value={inspectionStats.clean} subtext="Inspections closed with no failed checks" accentClass="border-l-4 border-emerald-500" icon={<i className="fas fa-badge-check text-emerald-400"></i>} />
                            <StatCard title="Inspections With Issues" value={inspectionStats.withIssues} subtext="Inspections where one or more checks failed" accentClass="border-l-4 border-red-500" icon={<i className="fas fa-circle-exclamation text-red-400"></i>} />
                            <StatCard title="Total Issues" value={inspectionStats.issues} subtext="Fail responses captured across all inspections" accentClass="border-l-4 border-orange-500" icon={<i className="fas fa-list text-orange-400"></i>} />
                            <StatCard title="CAPA Raised" value={inspectionStats.capaRaised} subtext="Corrective actions created from inspection findings" accentClass="border-l-4 border-cyan-500" icon={<i className="fas fa-list-check text-cyan-400"></i>} />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <SummaryList
                                title="Inspection Form Activity"
                                rows={inspectionTypeRows.map((row) => ({
                                    label: row.label,
                                    value: `${row.completed} done / ${row.issues} issues`,
                                    valueClass: row.issues > 0 ? 'text-red-400' : 'text-emerald-400'
                                }))}
                            />
                            <SummaryList
                                title="Inspection Quality Indicators"
                                rows={[
                                    { label: 'Pass Rate', value: inspectionStats.total ? `${Math.round((inspectionStats.clean / inspectionStats.total) * 100)}%` : '0%', valueClass: 'text-emerald-400' },
                                    { label: 'Average Issues Per Inspection', value: inspectionStats.total ? (inspectionStats.issues / inspectionStats.total).toFixed(1) : '0.0', valueClass: 'text-orange-400' },
                                    { label: 'CAPA Per Inspection', value: inspectionStats.total ? (inspectionStats.capaRaised / inspectionStats.total).toFixed(1) : '0.0', valueClass: 'text-cyan-400' }
                                ]}
                            />
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-emergency"
                        title="Emergency Dashboard"
                        description="Keep a quick view on drill cadence, real emergency activity, headcount capture, and emergency CAPA follow-through."
                        accentClass="border-rose-500"
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <StatCard title="Events Logged" value={emergencyStats.total} subtext="Emergency records logged in the current window" accentClass="border-l-4 border-rose-500" icon={<i className="fas fa-person-running text-rose-400"></i>} />
                            <StatCard title="Mock Drills" value={emergencyStats.mockDrills} subtext="Preparedness drills conducted in the period" accentClass="border-l-4 border-blue-500" icon={<i className="fas fa-bullhorn text-blue-400"></i>} />
                            <StatCard title="Real Emergencies" value={emergencyStats.realEmergencies} subtext="Live emergency events recorded" accentClass="border-l-4 border-red-500" icon={<i className="fas fa-siren-on text-red-400"></i>} />
                            <StatCard title="CAPA Raised" value={emergencyStats.capaRaised} subtext="Improvement actions generated by emergency response" accentClass="border-l-4 border-purple-500" icon={<i className="fas fa-list-check text-purple-400"></i>} />
                            <StatCard title="Headcount Logged" value={emergencyStats.headCount} subtext="Total persons captured during event reporting" accentClass="border-l-4 border-cyan-500" icon={<i className="fas fa-users text-cyan-400"></i>} />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <SummaryList
                                title="Emergency Event Mix"
                                rows={emergencyTypeRows.map((row) => ({ label: row.label, value: row.value, valueClass: 'text-rose-300' }))}
                            />
                            <SummaryList
                                title="Emergency Readiness Snapshot"
                                rows={[
                                    { label: 'Mock Drill Share', value: emergencyStats.total ? `${Math.round((emergencyStats.mockDrills / emergencyStats.total) * 100)}%` : '0%', valueClass: 'text-blue-400' },
                                    { label: 'Real Emergency Share', value: emergencyStats.total ? `${Math.round((emergencyStats.realEmergencies / emergencyStats.total) * 100)}%` : '0%', valueClass: 'text-red-400' },
                                    { label: 'CAPA Per Event', value: emergencyStats.total ? (emergencyStats.capaRaised / emergencyStats.total).toFixed(1) : '0.0', valueClass: 'text-purple-400' }
                                ]}
                            />
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-training"
                        title="Training Dashboard"
                        description="Measure training delivery, participation, and certification health from the same analytics filter set."
                        accentClass="border-violet-500"
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <StatCard title="Sessions Conducted" value={trainingStats.sessions} subtext="Training sessions completed in the selected range" accentClass="border-l-4 border-violet-500" icon={<i className="fas fa-graduation-cap text-violet-400"></i>} />
                            <StatCard title="People Trained" value={trainingStats.attendees} subtext="Attendees marked as attended across sessions" accentClass="border-l-4 border-cyan-500" icon={<i className="fas fa-user-group text-cyan-400"></i>} />
                            <StatCard title="Valid Certifications" value={trainingStats.validCerts} subtext="Still-valid certifications for the filtered site scope" accentClass="border-l-4 border-emerald-500" icon={<i className="fas fa-certificate text-emerald-400"></i>} />
                            <StatCard title="Expiring Soon" value={trainingStats.expiringSoon} subtext="Certifications inside 6 months or 30 days warning" accentClass="border-l-4 border-yellow-500" icon={<i className="fas fa-bell text-yellow-400"></i>} />
                            <StatCard title="Expired" value={trainingStats.expired} subtext="Certifications already expired" accentClass="border-l-4 border-red-500" icon={<i className="fas fa-circle-xmark text-red-400"></i>} />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <SummaryList
                                title="Training Topics Delivered"
                                rows={trainingTopicRows.map((row) => ({
                                    label: row.label,
                                    value: `${row.sessions} sessions / ${row.attendees} attendees`,
                                    valueClass: 'text-violet-300'
                                }))}
                            />
                            <SummaryList
                                title="Certification Health"
                                rows={[
                                    { label: 'Valid', value: trainingStats.validCerts, valueClass: 'text-emerald-400' },
                                    { label: 'Expiring Soon', value: trainingStats.expiringSoon, valueClass: 'text-yellow-400' },
                                    { label: 'Expired', value: trainingStats.expired, valueClass: 'text-red-400' }
                                ]}
                            />
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-risk"
                        title="Risk Dashboard"
                        description="Track assessment coverage, residual risk exposure, and ALARP declarations across the selected site and period."
                        accentClass="border-orange-500"
                    >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <StatCard title="Assessments Logged" value={riskStats.assessments} subtext="Risk assessments recorded in the selected range" accentClass="border-l-4 border-orange-500" icon={<i className="fas fa-shield-heart text-orange-400"></i>} />
                            <StatCard title="Active Assessments" value={riskStats.active} subtext="Assessments currently marked active" accentClass="border-l-4 border-emerald-500" icon={<i className="fas fa-circle-play text-emerald-400"></i>} />
                            <StatCard title="Hazards Identified" value={riskStats.hazards} subtext="Total hazards documented across filtered assessments" accentClass="border-l-4 border-cyan-500" icon={<i className="fas fa-triangle-exclamation text-cyan-400"></i>} />
                            <StatCard title="High Residual Risk" value={riskStats.highResidual} subtext="Assessments still carrying residual risk above threshold" accentClass="border-l-4 border-red-500" icon={<i className="fas fa-fire text-red-400"></i>} />
                            <StatCard title="ALARP Cases" value={riskStats.alarp} subtext="Assessments with formal ALARP declaration" accentClass="border-l-4 border-yellow-500" icon={<i className="fas fa-scale-balanced text-yellow-400"></i>} />
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <SummaryList
                                title="Assessment Status Mix"
                                rows={riskStatusRows.map((row) => ({
                                    label: row.label,
                                    value: row.value,
                                    valueClass: row.label === 'Active' ? 'text-emerald-400' : 'text-orange-300'
                                }))}
                            />
                            <SummaryList
                                title="Risk Indicators"
                                rows={[
                                    { label: 'Hazards Per Assessment', value: riskStats.assessments ? (riskStats.hazards / riskStats.assessments).toFixed(1) : '0.0', valueClass: 'text-cyan-400' },
                                    { label: 'High-Risk Assessment Share', value: riskStats.assessments ? `${Math.round((riskStats.highResidual / riskStats.assessments) * 100)}%` : '0%', valueClass: 'text-red-400' },
                                    { label: 'ALARP Declaration Share', value: riskStats.assessments ? `${Math.round((riskStats.alarp / riskStats.assessments) * 100)}%` : '0%', valueClass: 'text-yellow-400' }
                                ]}
                            />
                        </div>
                    </Panel>

                    <Panel
                        id="dashboard-exposure"
                        title="Exposure Hours Logger"
                        description="Keep incident rates reliable by logging employee and contractor hours against the correct site."
                        accentClass="border-violet-500"
                    >
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.4fr]">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
                                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">Current Exposure Summary</h3>
                                <div className="mt-5 space-y-4">
                                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Permanent Staff Hours</p>
                                        <p className="mt-2 text-3xl font-black text-white">
                                            {Math.round(filteredManHours.reduce((sum, entry) => sum + entry.perm, 0)).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Contractor Hours</p>
                                        <p className="mt-2 text-3xl font-black text-white">
                                            {Math.round(filteredManHours.reduce((sum, entry) => sum + entry.cont, 0)).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Analytics Window</p>
                                        <p className="mt-2 text-sm font-bold text-cyan-300">{activeRangeLabel}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
                                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">Log Additional Hours</h3>
                                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Date</label>
                                        <input
                                            type="date"
                                            value={logDate}
                                            onChange={(event) => setLogDate(event.target.value)}
                                            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Site</label>
                                        <select
                                            value={logSite}
                                            onChange={(event) => setLogSite(event.target.value)}
                                            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-violet-500"
                                        >
                                            <option value="">Select Site...</option>
                                            {visibleSites.map((site) => (
                                                <option key={site.code} value={site.code}>{site.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Permanent Hours</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={permHours}
                                            onChange={(event) => setPermHours(event.target.value)}
                                            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Contractor Hours</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={contHours}
                                            onChange={(event) => setContHours(event.target.value)}
                                            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-violet-500"
                                        />
                                    </div>
                                </div>

                                <div className="mt-6 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleLogHours}
                                        className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-violet-500"
                                    >
                                        <i className="fas fa-plus"></i>
                                        Log Exposure Hours
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Panel>
                </div>
            </main>
        </div>
    );
}
