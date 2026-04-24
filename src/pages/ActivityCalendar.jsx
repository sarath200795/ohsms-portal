import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { rtdb } from '../config/firebase';
import { useAppTransition } from '../hooks/useAppTransition';
import { readOrgChildren } from '../utils/orgData';
import { getAllowedSiteCodes, hasAccessibleModule, isGlobalOwnerRole } from '../utils/permissions';
import { readStoredSession } from '../utils/session';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VIEW_MODES = ['day', 'week', 'month'];
const RELEVANT_MODULES = ['Incidents', 'OHS Tools', 'Health Dashboard', 'Inspections', 'Record Emergency', 'Participation', 'CAPA Manager'];

const SOURCE_CONFIG = {
    Incidents: { label: 'Incidents', icon: 'fa-triangle-exclamation', badgeClass: 'border-orange-500/30 bg-orange-500/15 text-orange-300' },
    PTW: { label: 'PTW', icon: 'fa-file-signature', badgeClass: 'border-amber-500/30 bg-amber-500/15 text-amber-300' },
    Health: { label: 'Health', icon: 'fa-heart-pulse', badgeClass: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' },
    Inspections: { label: 'Inspections', icon: 'fa-search-location', badgeClass: 'border-lime-500/30 bg-lime-500/15 text-lime-300' },
    Emergency: { label: 'Emergency', icon: 'fa-person-running', badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300' },
    'Committee Meetings': { label: 'Committee Meetings', icon: 'fa-users', badgeClass: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300' },
    CAPA: { label: 'CAPA', icon: 'fa-list-check', badgeClass: 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-300' }
};

const SOURCE_ACCESS = {
    Incidents: ['Incidents'],
    PTW: ['OHS Tools'],
    Health: ['OHS Tools', 'Health Dashboard'],
    Inspections: ['Inspections'],
    Emergency: ['Record Emergency'],
    'Committee Meetings': ['Participation'],
    CAPA: ['CAPA Manager']
};

const SOURCE_ROUTE = {
    Incidents: '/incidents',
    PTW: '/ptw',
    Health: '/health-dashboard',
    Inspections: '/inspections',
    Emergency: '/mock-drill',
    'Committee Meetings': '/consultation',
    CAPA: '/capa'
};

const normalizeDateKey = (value) => {
    if (!value) return '';

    const raw = String(value).split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const parseDateOnly = (value) => {
    const normalized = normalizeDateKey(value);
    if (!normalized) return null;

    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const formatDateKey = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatReadableDate = (value) => {
    const parsed = parseDateOnly(value);
    if (!parsed) return 'No date';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatReadableRange = (start, end) => {
    if (!start || !end) return 'No range';
    if (formatDateKey(start) === formatDateKey(end)) return formatReadableDate(start);
    return `${formatReadableDate(start)} to ${formatReadableDate(end)}`;
};

const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const addFrequencyToDate = (date, frequency) => {
    const next = new Date(date);
    switch (frequency) {
        case 'Daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'Weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'Monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        case 'Quarterly':
            next.setMonth(next.getMonth() + 3);
            break;
        case 'Bi-Annually':
            next.setMonth(next.getMonth() + 6);
            break;
        case 'Annually':
            next.setFullYear(next.getFullYear() + 1);
            break;
        default:
            next.setMonth(next.getMonth() + 1);
            break;
    }
    return next;
};

const getStartOfWeek = (date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() - next.getDay());
    return next;
};

const getEndOfWeek = (date) => addDays(getStartOfWeek(date), 6);

const isDateWithinRange = (dateKey, rangeStart, rangeEnd) => {
    const parsed = parseDateOnly(dateKey);
    if (!parsed) return false;
    return parsed >= rangeStart && parsed <= rangeEnd;
};

const getRecordScheduleDate = (record) => {
    if (record.scheduledFor) return record.scheduledFor;
    if (record.originalDueString) return record.originalDueString;
    if (record.dueString) return record.dueString;
    return record.completedAt ? String(record.completedAt).split('T')[0] : '';
};

const getPendingOccurrences = ({ assignedFrom, assignedTo, frequency, pastRecords = [], rangeEnd, deferredTo }) => {
    const startDate = parseDateOnly(assignedFrom);
    const endDate = parseDateOnly(assignedTo);
    const effectiveRangeEnd = parseDateOnly(rangeEnd);

    if (!startDate || !effectiveRangeEnd) return [];

    const completedSlots = new Set(pastRecords.map(getRecordScheduleDate).filter(Boolean));
    const occurrences = [];
    let cursor = new Date(startDate);
    let safetyCounter = 0;
    let deferredApplied = false;

    while (safetyCounter < 1500) {
        if (endDate && cursor > endDate) break;

        const originalDateString = formatDateKey(cursor);
        if (!completedSlots.has(originalDateString)) {
            let activeDateString = originalDateString;
            if (!deferredApplied && deferredTo && deferredTo >= originalDateString) {
                activeDateString = deferredTo;
                deferredApplied = true;
            }

            const activeDate = parseDateOnly(activeDateString);
            const withinAssignmentWindow = !endDate || (activeDate && activeDate <= endDate);
            const withinRange = activeDate && activeDate <= effectiveRangeEnd;

            if (withinAssignmentWindow && withinRange) {
                occurrences.push({ dateString: activeDateString });
            }
        }

        cursor = addFrequencyToDate(cursor, frequency);
        safetyCounter += 1;

        if (cursor > effectiveRangeEnd && (!endDate || cursor > endDate)) break;
    }

    return occurrences;
};

const safeObjectEntries = (value) => {
    if (!value || typeof value !== 'object') return [];
    return Array.isArray(value)
        ? value.map((item, index) => [String(index), item]).filter(([, item]) => item && typeof item === 'object')
        : Object.entries(value).filter(([, item]) => item && typeof item === 'object');
};

const resolveSiteName = (sites, siteId) => {
    if (!siteId || siteId === 'GLOBAL' || siteId === 'Global') return 'Global';
    return sites.find((site) => site.code === siteId)?.name || siteId;
};

const canAccessSource = (session, sourceId) => {
    if (!session) return false;
    if (isGlobalOwnerRole(session.role)) return true;
    return (SOURCE_ACCESS[sourceId] || []).some((moduleId) => hasAccessibleModule(session.accessibleModules, moduleId));
};

const isCommitteeMeeting = (meeting) => /committee/i.test(String(meeting.type || meeting.subject || ''));

const createActivityRoute = ({ sourceId, siteId, targetId }) => {
    const basePath = SOURCE_ROUTE[sourceId];
    const querySite = siteId && siteId !== 'Global' ? siteId : 'All';

    if (sourceId === 'Incidents') return `${basePath}?site=${encodeURIComponent(querySite)}${targetId ? `&id=${encodeURIComponent(targetId)}` : ''}`;
    if (sourceId === 'PTW') return `${basePath}?site=${encodeURIComponent(querySite)}${targetId ? `&ptw=${encodeURIComponent(targetId)}` : ''}`;
    return `${basePath}?site=${encodeURIComponent(querySite)}`;
};

const renderActivityBadge = (activity) => (
    <div key={activity.id} className={`rounded-xl border px-2 py-1 text-[10px] font-bold ${SOURCE_CONFIG[activity.sourceId].badgeClass}`}>
        {SOURCE_CONFIG[activity.sourceId].label}
    </div>
);

export default function ActivityCalendar() {
    const navigate = useNavigate();
    const location = useLocation();
    const playTransition = useAppTransition();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [orgData, setOrgData] = useState(null);
    const [sites, setSites] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [sourceFilter, setSourceFilter] = useState('All');
    const [viewMode, setViewMode] = useState('month');
    const [currentMonth, setCurrentMonth] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));

    useEffect(() => {
        const parsedSession = readStoredSession();
        if (!parsedSession) {
            navigate('/');
            return;
        }

        const isGlobalAdmin = isGlobalOwnerRole(parsedSession.role);
        const hasAccess = isGlobalAdmin || RELEVANT_MODULES.some((moduleId) => hasAccessibleModule(parsedSession.accessibleModules, moduleId));

        if (!hasAccess) {
            alert('Security Alert: You do not have permission to access the Activity Calendar.');
            navigate('/dashboard');
            return;
        }

        setSession(parsedSession);

        const params = new URLSearchParams(location.search);
        const urlSite = params.get('site');

        let storedSite = sessionStorage.getItem('isoCurrentSite');
        if (storedSite === 'GLOBAL') storedSite = 'All';

        let activeSite = urlSite || storedSite || 'All';
        if (!isGlobalAdmin && activeSite === 'All') {
            activeSite = (parsedSession.assignedSite && parsedSession.assignedSite !== 'GLOBAL')
                ? parsedSession.assignedSite
                : (parsedSession.accessibleSites?.[0] || '');
        }

        setSiteFilter(activeSite);
        sessionStorage.setItem('isoCurrentSite', activeSite === 'All' ? 'GLOBAL' : activeSite);

        const loadData = async () => {
            try {
                const value = await readOrgChildren(rtdb, parsedSession.orgId, [
                    'sites',
                    'incidents',
                    'ptwRecords',
                    'healthSurveillance',
                    'vaccinationRecords',
                    'illnessRecords',
                    'inspectionRecords',
                    'inspectionTemplates',
                    'mockDrills',
                    'consultations'
                ]);

                setOrgData(value);
                setSites(
                    safeObjectEntries(value.sites).map(([key, site]) => ({
                        code: site.code || key,
                        name: site.name || site.code || key
                    }))
                );
            } catch (error) {
                console.error('Activity calendar load error:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [location.search, navigate]);

    const isGlobalUser = isGlobalOwnerRole(session?.role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        return getAllowedSiteCodes(session);
    }, [session]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((site) => allowedSiteCodes.has(site.code));
    }, [allowedSiteCodes, isGlobalUser, sites]);

    const availableSources = useMemo(() => {
        const sources = Object.keys(SOURCE_CONFIG).filter((sourceId) => canAccessSource(session, sourceId));
        return ['All', ...sources];
    }, [session]);

    const activities = useMemo(() => {
        if (!orgData || !session) return [];

        const items = [];
        const pushActivity = ({ id, sourceId, date, title, subtitle, siteId, status, targetId }) => {
            if (!canAccessSource(session, sourceId)) return;

            const normalizedDate = normalizeDateKey(date);
            if (!normalizedDate) return;

            items.push({
                id,
                sourceId,
                date: normalizedDate,
                title: title || SOURCE_CONFIG[sourceId].label,
                subtitle: subtitle || '',
                siteId: siteId || 'Global',
                siteName: resolveSiteName(sites, siteId),
                status: status || '',
                path: createActivityRoute({ sourceId, siteId, targetId })
            });
        };

        safeObjectEntries(orgData.incidents).forEach(([key, incident]) => {
            pushActivity({
                id: `incident-${key}`,
                sourceId: 'Incidents',
                date: incident.date,
                title: incident.title || incident.type || incident.id || 'Incident reported',
                subtitle: `${incident.id || 'Incident'}${incident.severity ? ` - ${incident.severity}` : ''}`,
                siteId: incident.siteId,
                status: incident.type || 'Reported',
                targetId: key
            });
        });

        safeObjectEntries(orgData.ptwRecords).forEach(([key, permit]) => {
            pushActivity({
                id: `ptw-${key}`,
                sourceId: 'PTW',
                date: permit.validFromDate || permit.createdDate || permit.createdAt,
                title: permit.description || permit.id || 'Permit to work',
                subtitle: `${permit.id || 'PTW'}${permit.location ? ` - ${permit.location}` : ''}`,
                siteId: permit.siteId,
                status: permit.status || 'Draft',
                targetId: permit.id
            });
        });

        safeObjectEntries(orgData.healthSurveillance).forEach(([key, record]) => {
            pushActivity({
                id: `surveillance-${key}`,
                sourceId: 'Health',
                date: record.date,
                title: record.employeeName || record.title || 'Health surveillance',
                subtitle: 'Health surveillance record',
                siteId: record.siteId,
                status: record.status || 'Logged'
            });
        });

        safeObjectEntries(orgData.vaccinationRecords).forEach(([key, record]) => {
            pushActivity({
                id: `vaccination-${key}`,
                sourceId: 'Health',
                date: record.date,
                title: record.employeeName || record.title || 'Vaccination record',
                subtitle: record.vaccineName || 'Vaccination activity',
                siteId: record.siteId,
                status: record.status || 'Logged'
            });
        });

        safeObjectEntries(orgData.illnessRecords).forEach(([key, record]) => {
            pushActivity({
                id: `illness-${key}`,
                sourceId: 'Health',
                date: record.date,
                title: record.employeeName || record.title || 'Illness case',
                subtitle: record.caseType || 'Illness / occupational health record',
                siteId: record.siteId,
                status: record.status || 'Logged'
            });
        });

        safeObjectEntries(orgData.inspectionRecords).forEach(([key, record]) => {
            pushActivity({
                id: `inspection-record-${key}`,
                sourceId: 'Inspections',
                date: record.completedAt,
                title: record.templateTitle || 'Inspection completed',
                subtitle: `Completed by ${record.inspector || 'Inspector'}`,
                siteId: record.siteId,
                status: 'Completed'
            });
        });

        const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        safeObjectEntries(orgData.inspectionTemplates).forEach(([key, template]) => {
            if (template.status !== 'Active' || !template.assignedFrom) return;

            const targetSiteIds = template.siteId === 'GLOBAL'
                ? sites.map((site) => site.code)
                : [template.siteId];

            targetSiteIds.forEach((targetSiteId) => {
                const pastRecords = safeObjectEntries(orgData.inspectionRecords)
                    .map(([, record]) => record)
                    .filter((record) => record.templateId === key && record.siteId === targetSiteId);

                const occurrences = getPendingOccurrences({
                    assignedFrom: template.assignedFrom,
                    assignedTo: template.assignedTo,
                    frequency: template.frequency,
                    pastRecords,
                    rangeEnd: formatDateKey(monthEnd),
                    deferredTo: template.deferredTo
                });

                occurrences.forEach((occurrence, index) => {
                    pushActivity({
                        id: `inspection-schedule-${key}-${targetSiteId}-${index}`,
                        sourceId: 'Inspections',
                        date: occurrence.dateString,
                        title: template.title || 'Scheduled inspection',
                        subtitle: `${template.frequency || 'Planned'} inspection due`,
                        siteId: targetSiteId,
                        status: 'Scheduled'
                    });
                });
            });
        });

        safeObjectEntries(orgData.mockDrills).forEach(([key, drill]) => {
            pushActivity({
                id: `drill-${key}`,
                sourceId: 'Emergency',
                date: drill.date,
                title: drill.scenario || drill.eventType || 'Emergency drill',
                subtitle: drill.docId || 'Emergency activity logged',
                siteId: drill.siteId,
                status: drill.eventType || 'Mock Drill'
            });
        });

        safeObjectEntries(orgData.consultations)
            .filter(([, meeting]) => isCommitteeMeeting(meeting))
            .forEach(([key, meeting]) => {
                pushActivity({
                    id: `meeting-${key}`,
                    sourceId: 'Committee Meetings',
                    date: meeting.date,
                    title: meeting.subject || meeting.type || 'Committee meeting',
                    subtitle: meeting.docId || 'Participation record',
                    siteId: meeting.siteId,
                    status: meeting.type || 'Logged'
                });
            });

        safeObjectEntries(orgData.incidents).forEach(([incidentKey, incident]) => {
            const capaItems = Array.isArray(incident.capa) ? incident.capa : Object.values(incident.capa || {});
            capaItems.forEach((action, index) => {
                if (!action) return;
                pushActivity({
                    id: `capa-incident-${incidentKey}-${index}`,
                    sourceId: 'CAPA',
                    date: action.status === 'Closed' ? (action.closedAt || action.due) : action.due,
                    title: action.act || action.action || action.desc || 'Incident CAPA',
                    subtitle: `Incident${incident.id ? ` - ${incident.id}` : ''}`,
                    siteId: action.siteId || incident.siteId,
                    status: action.status || 'Open'
                });
            });
        });

        safeObjectEntries(orgData.mockDrills).forEach(([drillKey, drill]) => {
            const capaItems = Array.isArray(drill.capa) ? drill.capa : Object.values(drill.capa || {});
            capaItems.forEach((action, index) => {
                if (!action) return;
                pushActivity({
                    id: `capa-drill-${drillKey}-${index}`,
                    sourceId: 'CAPA',
                    date: action.status === 'Closed' ? (action.closedAt || action.due) : action.due,
                    title: action.action || action.act || 'Emergency CAPA',
                    subtitle: drill.docId || 'Emergency drill CAPA',
                    siteId: action.siteId || drill.siteId,
                    status: action.status || 'Open'
                });
            });
        });

        safeObjectEntries(orgData.consultations).forEach(([meetingKey, meeting]) => {
            const meetingActions = Array.isArray(meeting.actions) ? meeting.actions : Object.values(meeting.actions || {});
            meetingActions.forEach((action, index) => {
                if (!action) return;
                pushActivity({
                    id: `capa-meeting-${meetingKey}-${index}`,
                    sourceId: 'CAPA',
                    date: action.status === 'Closed' ? (action.closedAt || action.deadline || action.due) : (action.deadline || action.due),
                    title: action.action || action.item || 'Committee CAPA',
                    subtitle: meeting.subject || meeting.type || 'Meeting action',
                    siteId: action.siteId || meeting.siteId,
                    status: action.status || 'Open'
                });
            });
        });

        safeObjectEntries(orgData.inspectionRecords).forEach(([recordKey, record]) => {
            const capaItems = Array.isArray(record.capa) ? record.capa : Object.values(record.capa || {});
            capaItems.forEach((action, index) => {
                if (!action) return;
                pushActivity({
                    id: `capa-inspection-${recordKey}-${index}`,
                    sourceId: 'CAPA',
                    date: action.status === 'Closed' ? (action.closedAt || action.dueDate || action.due) : (action.dueDate || action.due),
                    title: action.desc || action.act || action.action || 'Inspection CAPA',
                    subtitle: record.templateTitle || 'Inspection finding',
                    siteId: action.siteId || record.siteId,
                    status: action.status || 'Open'
                });
            });
        });

        return items.sort((left, right) => {
            if (left.date !== right.date) return left.date.localeCompare(right.date);
            if (left.sourceId !== right.sourceId) return left.sourceId.localeCompare(right.sourceId);
            return left.title.localeCompare(right.title);
        });
    }, [currentMonth, orgData, session, sites]);

    const filteredActivities = useMemo(() => {
        return activities.filter((activity) => {
            if (!isGlobalUser && activity.siteId !== 'Global' && activity.siteId !== 'GLOBAL' && !allowedSiteCodes.has(activity.siteId)) {
                return false;
            }
            if (siteFilter !== 'All' && activity.siteId !== siteFilter) return false;
            if (sourceFilter !== 'All' && activity.sourceId !== sourceFilter) return false;
            return true;
        });
    }, [activities, allowedSiteCodes, isGlobalUser, siteFilter, sourceFilter]);

    const selectedDateValue = useMemo(() => parseDateOnly(selectedDate) || new Date(), [selectedDate]);
    const { weekStart, weekEnd } = useMemo(() => ({
        weekStart: getStartOfWeek(selectedDateValue),
        weekEnd: getEndOfWeek(selectedDateValue)
    }), [selectedDateValue]);
    const { monthStart, monthLastDay } = useMemo(() => ({
        monthStart: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
        monthLastDay: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    }), [currentMonth]);

    const { activeRangeStart, activeRangeEnd } = useMemo(() => {
        if (viewMode === 'day') return { activeRangeStart: selectedDateValue, activeRangeEnd: selectedDateValue };
        if (viewMode === 'week') return { activeRangeStart: weekStart, activeRangeEnd: weekEnd };
        return { activeRangeStart: monthStart, activeRangeEnd: monthLastDay };
    }, [monthLastDay, monthStart, selectedDateValue, viewMode, weekEnd, weekStart]);

    const activeRangeActivities = useMemo(() => {
        return filteredActivities.filter((activity) => isDateWithinRange(activity.date, activeRangeStart, activeRangeEnd));
    }, [activeRangeEnd, activeRangeStart, filteredActivities]);

    const monthActivities = useMemo(() => {
        return filteredActivities.filter((activity) => isDateWithinRange(activity.date, monthStart, monthLastDay));
    }, [filteredActivities, monthLastDay, monthStart]);

    const selectedDayActivities = useMemo(() => {
        const selectedKey = formatDateKey(selectedDateValue);
        return filteredActivities.filter((activity) => activity.date === selectedKey);
    }, [filteredActivities, selectedDateValue]);

    const periodSourceSummary = useMemo(() => {
        return Object.keys(SOURCE_CONFIG)
            .filter((sourceId) => sourceFilter === 'All' || sourceId === sourceFilter)
            .map((sourceId) => ({
                sourceId,
                count: activeRangeActivities.filter((activity) => activity.sourceId === sourceId).length
            }))
            .filter((entry) => entry.count > 0);
    }, [activeRangeActivities, sourceFilter]);

    const uniqueSitesInRange = new Set(activeRangeActivities.map((activity) => activity.siteId)).size;
    const activeSourcesInRange = new Set(activeRangeActivities.map((activity) => activity.sourceId)).size;
    const periodLabel = viewMode === 'day'
        ? formatReadableDate(selectedDateValue)
        : viewMode === 'week'
            ? formatReadableRange(weekStart, weekEnd)
            : `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

    const updateSelectedDate = (date) => {
        const nextKey = formatDateKey(date);
        setSelectedDate(nextKey);
        setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    };

    const moveRange = (direction) => {
        if (viewMode === 'day') {
            updateSelectedDate(addDays(selectedDateValue, direction));
            return;
        }

        if (viewMode === 'week') {
            updateSelectedDate(addDays(selectedDateValue, direction * 7));
            return;
        }

        const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1);
        setCurrentMonth(nextMonth);
        setSelectedDate(formatDateKey(nextMonth));
    };

    const jumpToToday = () => {
        const today = new Date();
        setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        setSelectedDate(formatDateKey(today));
    };

    const openActivity = (activity) => {
        playTransition({
            label: `Opening ${SOURCE_CONFIG[activity.sourceId].label}`,
            action: () => navigate(activity.path)
        });
    };

    const renderMonthView = () => (
        <>
            <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--myth-muted)]">
                {DAY_NAMES.map((dayName) => (
                    <div key={dayName} className="rounded-2xl border border-[rgba(242,201,120,0.08)] bg-[rgba(12,10,8,0.6)] px-2 py-3">
                        {dayName}
                    </div>
                ))}
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2">
                {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                    <div key={`blank-${index}`} className="min-h-[140px] rounded-[1.5rem] border border-[rgba(242,201,120,0.05)] bg-[rgba(6,5,4,0.58)]"></div>
                ))}

                {Array.from({ length: daysInMonth }).map((_, index) => {
                    const day = index + 1;
                    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                    const dateKey = formatDateKey(date);
                    const dayActivities = monthActivities.filter((activity) => activity.date === dateKey);
                    const isSelected = selectedDate === dateKey;
                    const isToday = formatDateKey(new Date()) === dateKey;

                    return (
                        <button
                            type="button"
                            key={dateKey}
                            onClick={() => updateSelectedDate(date)}
                            className={`min-h-[140px] rounded-[1.5rem] border p-3 text-left transition-all ${
                                isSelected
                                    ? 'border-[var(--myth-cyan)] bg-[rgba(17,40,48,0.72)] shadow-[0_0_0_1px_rgba(91,199,220,0.18)]'
                                    : 'border-[rgba(242,201,120,0.08)] bg-[rgba(12,10,8,0.72)] hover:border-[rgba(242,201,120,0.22)]'
                            }`}
                        >
                            <div className="mb-2 flex items-center justify-between">
                                <span className={`text-sm font-black ${isToday ? 'text-[var(--myth-cyan)]' : 'text-white'}`}>{day}</span>
                                {dayActivities.length > 0 && (
                                    <span className="rounded-full bg-[rgba(215,131,57,0.18)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--myth-gold)]">
                                        {dayActivities.length}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                {dayActivities.slice(0, 3).map(renderActivityBadge)}
                                {dayActivities.length > 3 && (
                                    <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--myth-muted)]">
                                        + {dayActivities.length - 3} more
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </>
    );

    const renderWeekView = () => (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {weekDays.map((day) => {
                const dateKey = formatDateKey(day);
                const dayActivities = activeRangeActivities.filter((activity) => activity.date === dateKey);
                const isSelected = selectedDate === dateKey;
                const isToday = formatDateKey(new Date()) === dateKey;

                return (
                    <button
                        type="button"
                        key={dateKey}
                        onClick={() => updateSelectedDate(day)}
                        className={`min-h-[220px] rounded-[1.5rem] border p-4 text-left transition-all ${
                            isSelected
                                ? 'border-[var(--myth-cyan)] bg-[rgba(17,40,48,0.72)] shadow-[0_0_0_1px_rgba(91,199,220,0.18)]'
                                : 'border-[rgba(242,201,120,0.08)] bg-[rgba(12,10,8,0.72)] hover:border-[rgba(242,201,120,0.22)]'
                        }`}
                    >
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--myth-muted)]">{DAY_NAMES[day.getDay()]}</p>
                                <h3 className={`mt-2 text-lg font-black ${isToday ? 'text-[var(--myth-cyan)]' : 'text-white'}`}>{formatReadableDate(day)}</h3>
                            </div>
                            <span className="rounded-full bg-[rgba(215,131,57,0.18)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--myth-gold)]">
                                {dayActivities.length}
                            </span>
                        </div>

                        <div className="space-y-2">
                            {dayActivities.length === 0 && (
                                <div className="rounded-xl border border-dashed border-[rgba(242,201,120,0.1)] px-3 py-4 text-center text-[11px] text-[var(--myth-muted)]">
                                    No logged items
                                </div>
                            )}
                            {dayActivities.slice(0, 5).map(renderActivityBadge)}
                            {dayActivities.length > 5 && (
                                <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--myth-muted)]">
                                    + {dayActivities.length - 5} more
                                </div>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );

    const renderDayView = () => (
        <div className="rounded-[1.8rem] border border-[rgba(242,201,120,0.08)] bg-[rgba(12,10,8,0.72)] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="myth-kicker">Focused Day</p>
                    <h3 className="mt-2 text-3xl text-white">{formatReadableDate(selectedDateValue)}</h3>
                    <p className="mt-2 text-sm text-[var(--myth-muted)]">
                        Review everything logged, completed, or due on this single day.
                    </p>
                </div>

                <span className="rounded-2xl border border-[rgba(242,201,120,0.12)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--myth-gold)]">
                    {selectedDayActivities.length} item{selectedDayActivities.length === 1 ? '' : 's'}
                </span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {periodSourceSummary.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[rgba(242,201,120,0.1)] px-3 py-5 text-center text-sm text-[var(--myth-muted)] md:col-span-2 xl:col-span-4">
                        No activities match the current filters for this day.
                    </div>
                )}
                {periodSourceSummary.map((entry) => (
                    <div key={entry.sourceId} className="rounded-xl border border-[rgba(242,201,120,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--myth-muted)]">{SOURCE_CONFIG[entry.sourceId].label}</p>
                        <div className="mt-3 text-3xl font-black text-white">{entry.count}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="myth-shell flex h-screen items-center justify-center bg-[#080705] text-white">
                <div className="command-panel rounded-[2rem] px-8 py-7">
                    <div className="flex items-center gap-4">
                        <i className="fas fa-circle-notch fa-spin text-3xl text-[var(--myth-cyan)]"></i>
                        <div>
                            <p className="legendary-title text-[11px] font-bold uppercase tracking-[0.35em] text-[var(--myth-cyan)]">Activity Sync</p>
                            <h2 className="mt-1 text-2xl font-black uppercase tracking-[0.22em] text-white">Loading Calendar</h2>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="myth-shell min-h-screen bg-[#080705] px-4 py-6 text-white sm:px-6 sm:py-8">
            <div className="mx-auto max-w-7xl">
                <div className="command-panel mb-8 rounded-[2.2rem] p-6 sm:p-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="myth-kicker">Activity Calendar</p>
                            <h1 className="mt-2 text-4xl text-white sm:text-5xl">Operational Daybook</h1>
                            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--myth-muted)] sm:text-base">
                                Switch between day, week, and month views to see exactly what has been done across permits, incidents, health logs, inspections, emergency events, committee meetings, and CAPA actions.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => playTransition({ label: 'Returning to Dashboard', action: () => navigate('/dashboard') })}
                                className="myth-outline-button rounded-2xl px-5 py-3 text-xs"
                            >
                                <i className="fas fa-arrow-left mr-2"></i>
                                Back to Hub
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                        <div className="myth-stat-card p-5">
                            <p className="myth-kicker relative z-10">Current {viewMode}</p>
                            <div className="relative z-10 mt-3 text-5xl font-black text-white">{activeRangeActivities.length}</div>
                            <p className="relative z-10 mt-2 text-sm text-[var(--myth-muted)]">Activities visible in the active {viewMode} range.</p>
                        </div>
                        <div className="myth-stat-card p-5">
                            <p className="myth-kicker relative z-10">Focused Day</p>
                            <div className="relative z-10 mt-3 text-5xl font-black text-white">{selectedDayActivities.length}</div>
                            <p className="relative z-10 mt-2 text-sm text-[var(--myth-muted)]">Items aligned to the highlighted day.</p>
                        </div>
                        <div className="myth-stat-card p-5">
                            <p className="myth-kicker relative z-10">Coverage</p>
                            <div className="relative z-10 mt-3 text-5xl font-black text-white">{uniqueSitesInRange}</div>
                            <p className="relative z-10 mt-2 text-sm text-[var(--myth-muted)]">{activeSourcesInRange} source streams active in this range.</p>
                        </div>
                    </div>
                </div>

                <div className="mb-6 space-y-4">
                    <div className="command-panel rounded-[1.8rem] p-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap gap-2">
                                {VIEW_MODES.map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => {
                                            setViewMode(mode);
                                            if (mode === 'month') {
                                                setCurrentMonth(new Date(selectedDateValue.getFullYear(), selectedDateValue.getMonth(), 1));
                                            }
                                        }}
                                        className={`rounded-2xl border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.18em] transition-all ${
                                            viewMode === mode
                                                ? 'border-[var(--myth-cyan)] bg-[rgba(51,145,169,0.18)] text-white'
                                                : 'border-[rgba(242,201,120,0.1)] bg-[rgba(12,10,8,0.72)] text-[var(--myth-muted)] hover:border-[rgba(242,201,120,0.28)] hover:text-white'
                                        }`}
                                    >
                                        {mode} view
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col gap-3 lg:flex-row">
                                <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm text-[var(--myth-muted)]">
                                    <label className="mr-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--myth-gold)]">Site</label>
                                    <select
                                        value={siteFilter}
                                        onChange={(event) => {
                                            const nextSite = event.target.value;
                                            setSiteFilter(nextSite);
                                            sessionStorage.setItem('isoCurrentSite', nextSite === 'All' ? 'GLOBAL' : nextSite);
                                        }}
                                        className="min-w-[200px] bg-transparent font-bold text-white outline-none"
                                    >
                                        {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {visibleSites.map((site) => (
                                            <option key={site.code} value={site.code}>
                                                {site.name} ({site.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm text-[var(--myth-muted)]">
                                    <label className="mr-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--myth-gold)]">Source</label>
                                    <select
                                        value={sourceFilter}
                                        onChange={(event) => setSourceFilter(event.target.value)}
                                        className="min-w-[220px] bg-transparent font-bold text-white outline-none"
                                    >
                                        {availableSources.map((sourceId) => (
                                            <option key={sourceId} value={sourceId}>
                                                {sourceId === 'All' ? 'All Activity Sources' : SOURCE_CONFIG[sourceId].label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
                    <section className="command-panel rounded-[2rem] p-5 sm:p-6">
                        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="myth-kicker">Calendar Scope</p>
                                <h2 className="mt-2 text-3xl text-white">{periodLabel}</h2>
                            </div>

                            <div className="flex gap-2">
                                <button type="button" onClick={() => moveRange(-1)} className="myth-outline-button flex h-11 w-11 items-center justify-center rounded-2xl">
                                    <i className="fas fa-chevron-left"></i>
                                </button>
                                <button type="button" onClick={jumpToToday} className="myth-outline-button rounded-2xl px-4 py-2.5 text-xs">
                                    Today
                                </button>
                                <button type="button" onClick={() => moveRange(1)} className="myth-outline-button flex h-11 w-11 items-center justify-center rounded-2xl">
                                    <i className="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        </div>

                        {viewMode === 'month' && renderMonthView()}
                        {viewMode === 'week' && renderWeekView()}
                        {viewMode === 'day' && renderDayView()}
                    </section>

                    <section className="command-panel rounded-[2rem] p-5 sm:p-6">
                        <div className="border-b border-[rgba(242,201,120,0.08)] pb-4">
                            <p className="myth-kicker">{viewMode === 'month' ? 'Month Feed' : viewMode === 'week' ? 'Week Feed' : 'Day Feed'}</p>
                            <h2 className="mt-2 text-3xl text-white">{periodLabel}</h2>
                            <p className="mt-2 text-sm text-[var(--myth-muted)]">
                                {activeRangeActivities.length > 0
                                    ? `${activeRangeActivities.length} activity item${activeRangeActivities.length > 1 ? 's' : ''} visible in this ${viewMode} range.`
                                    : `No activities match the current filters in this ${viewMode} range.`}
                            </p>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                            {periodSourceSummary.length === 0 && (
                                <span className="rounded-xl border border-dashed border-[rgba(242,201,120,0.12)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--myth-muted)]">
                                    No source activity in range
                                </span>
                            )}
                            {periodSourceSummary.map((entry) => (
                                <span key={entry.sourceId} className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] ${SOURCE_CONFIG[entry.sourceId].badgeClass}`}>
                                    {SOURCE_CONFIG[entry.sourceId].label}: {entry.count}
                                </span>
                            ))}
                        </div>

                        {viewMode !== 'day' && (
                            <div className="mt-5 rounded-[1.5rem] border border-[rgba(242,201,120,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--myth-muted)]">Focused Day</p>
                                <h3 className="mt-2 text-xl font-bold text-white">{formatReadableDate(selectedDateValue)}</h3>
                                <p className="mt-2 text-sm text-[var(--myth-muted)]">
                                    {selectedDayActivities.length > 0
                                        ? `${selectedDayActivities.length} item${selectedDayActivities.length > 1 ? 's are' : ' is'} linked to the selected date.`
                                        : 'No activity is linked to the selected date.'}
                                </p>
                            </div>
                        )}

                        <div className="mt-5 space-y-4">
                            {activeRangeActivities.length === 0 && (
                                <div className="rounded-[1.5rem] border border-dashed border-[rgba(242,201,120,0.12)] bg-[rgba(12,10,8,0.6)] px-5 py-10 text-center">
                                    <div className="myth-icon-frame mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-[var(--myth-muted)]">
                                        <i className="fas fa-calendar-day"></i>
                                    </div>
                                    <p className="text-sm leading-relaxed text-[var(--myth-muted)]">
                                        Try another site, source, or time scope to surface more history.
                                    </p>
                                </div>
                            )}

                            {activeRangeActivities.map((activity) => (
                                <div key={activity.id} className="rounded-[1.5rem] border border-[rgba(242,201,120,0.08)] bg-[rgba(12,10,8,0.72)] p-4">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-xl border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${SOURCE_CONFIG[activity.sourceId].badgeClass}`}>
                                                    <i className={`fas ${SOURCE_CONFIG[activity.sourceId].icon} mr-2`}></i>
                                                    {SOURCE_CONFIG[activity.sourceId].label}
                                                </span>
                                                {activity.status && (
                                                    <span className="rounded-xl border border-[rgba(242,201,120,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--myth-muted)]">
                                                        {activity.status}
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="mt-3 text-lg font-bold text-white">{activity.title}</h3>
                                            <p className="mt-1 text-sm text-[var(--myth-muted)]">{activity.subtitle || 'No additional details available.'}</p>

                                            <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--myth-muted)]">
                                                <span><i className="fas fa-location-dot mr-2 text-[var(--myth-cyan)]"></i>{activity.siteName}</span>
                                                <span><i className="fas fa-calendar-day mr-2 text-[var(--myth-gold)]"></i>{formatReadableDate(activity.date)}</span>
                                            </div>
                                        </div>

                                        <button type="button" onClick={() => openActivity(activity)} className="myth-button myth-button-cyan shrink-0 rounded-2xl px-4 py-3 text-xs">
                                            Open Module
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
