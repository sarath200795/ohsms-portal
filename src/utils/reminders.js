// Reminders engine — PURE functions, no I/O.
//
// Given org collection data (already site-scoped by the caller) and a reference
// date, produce a normalized list of "what needs attention" items: overdue and
// upcoming CAPA actions, emergency-equipment inspections, and training renewals.
//
// Kept side-effect-free so it can be unit-tested directly under node.

export const SEVERITY = {
    OVERDUE: 'overdue',
    DUE_SOON: 'dueSoon',
    UPCOMING: 'upcoming'
};

export const DEFAULT_WINDOWS = { dueSoonDays: 7, upcomingDays: 30 };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toArray = (collection) => {
    if (!collection) return [];
    if (Array.isArray(collection)) {
        return collection.map((value, index) => [String(index), value]).filter(([, v]) => v);
    }
    if (typeof collection === 'object') {
        return Object.entries(collection).filter(([, v]) => v);
    }
    return [];
};

export const parseDate = (value) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text || text.toUpperCase() === 'N/A') return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
};

export const daysUntil = (dueDate, today) => Math.round(
    (startOfDay(dueDate).getTime() - startOfDay(today).getTime()) / MS_PER_DAY
);

export const classifySeverity = (dueDate, today, windows = DEFAULT_WINDOWS) => {
    if (!dueDate) return null;
    const diff = daysUntil(dueDate, today);
    if (diff < 0) return SEVERITY.OVERDUE;
    if (diff <= windows.dueSoonDays) return SEVERITY.DUE_SOON;
    if (diff <= windows.upcomingDays) return SEVERITY.UPCOMING;
    return null;
};

const firstDefined = (object, keys) => {
    for (const key of keys) {
        const value = object?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return undefined;
};

const DONE_STATUSES = new Set(['closed', 'completed', 'complete', 'done', 'verified', 'resolved']);
const isActionDone = (status) => DONE_STATUSES.has(String(status || '').trim().toLowerCase());

const CAPA_SOURCES = [
    { collection: 'incidents', label: 'Incident' },
    { collection: 'auditFindings', label: 'Audit' },
    { collection: 'mockDrills', label: 'Drill' },
    { collection: 'inspectionRecords', label: 'Inspection' }
];

const collectCapaReminders = (data, today, windows) => {
    const items = [];
    CAPA_SOURCES.forEach(({ collection, label }) => {
        toArray(data[collection]).forEach(([recordId, record]) => {
            const actions = Array.isArray(record?.capa) ? record.capa : [];
            actions.forEach((action, index) => {
                if (!action || isActionDone(action.status)) return;
                const dueRaw = firstDefined(action, ['dueDate', 'due', 'targetDate']);
                const dueDate = parseDate(dueRaw);
                const severity = classifySeverity(dueDate, today, windows);
                if (!severity) return;
                const desc = firstDefined(action, ['desc', 'action', 'act', 'title']) || 'Corrective action';
                items.push({
                    id: `capa:${collection}:${recordId}:${index}`,
                    category: 'CAPA Action',
                    source: label,
                    title: `${label} action: ${desc}`,
                    owner: firstDefined(action, ['owner', 'own', 'assignedTo']) || 'Unassigned',
                    siteId: firstDefined(action, ['siteId']) || firstDefined(record, ['siteId']) || 'Global',
                    dueDate: dueDate.toISOString(),
                    daysUntil: daysUntil(dueDate, today),
                    severity,
                    link: '/capa'
                });
            });
        });
    });
    return items;
};

const EQUIPMENT_ATTENTION_STATUSES = new Set(['out of service', 'missing', 'needs inspection']);

const collectEquipmentReminders = (data, today, windows) => {
    const items = [];
    toArray(data.emergencyEquipment).forEach(([recordId, record]) => {
        if (!record) return;
        const dueRaw = firstDefined(record, ['nextInspection', 'nextDueDate', 'nextDue', 'expiry', 'expiryDate']);
        const dueDate = parseDate(dueRaw);
        const statusText = String(record.status || '').trim().toLowerCase();
        const statusFlag = EQUIPMENT_ATTENTION_STATUSES.has(statusText);
        const severity = statusFlag ? SEVERITY.OVERDUE : classifySeverity(dueDate, today, windows);
        if (!severity) return;
        const name = firstDefined(record, ['name', 'equipmentName', 'tagNo', 'tagNumber', 'type']) || 'Equipment';
        items.push({
            id: `equipment:${recordId}`,
            category: 'Equipment Inspection',
            source: 'Emergency Equipment',
            title: statusFlag ? `${name} — ${record.status}` : `Inspection due: ${name}`,
            owner: firstDefined(record, ['owner', 'responsible', 'assignedTo']) || 'Unassigned',
            siteId: firstDefined(record, ['siteId']) || 'Global',
            dueDate: dueDate ? dueDate.toISOString() : null,
            daysUntil: dueDate ? daysUntil(dueDate, today) : null,
            severity,
            link: '/emergency-equipment'
        });
    });
    return items;
};

const addMonths = (date, months) => {
    const copy = new Date(date);
    copy.setMonth(copy.getMonth() + months);
    return copy;
};

const collectTrainingReminders = (data, today, windows) => {
    const items = [];
    toArray(data.trainings).forEach(([recordId, record]) => {
        if (!record) return;
        let expiry = parseDate(firstDefined(record, ['expiryDate', 'expiry', 'validUntil']));
        if (!expiry) {
            const given = parseDate(firstDefined(record, ['date', 'trainingDate', 'completedDate']));
            if (given) expiry = addMonths(given, 6);
        }
        const severity = classifySeverity(expiry, today, windows);
        if (!severity) return;
        const topic = firstDefined(record, ['topic', 'title', 'courseName']) || 'Training';
        items.push({
            id: `training:${recordId}`,
            category: 'Training Renewal',
            source: 'Training',
            title: `Training renewal: ${topic}`,
            owner: firstDefined(record, ['trainer', 'owner']) || 'Training team',
            siteId: firstDefined(record, ['siteId']) || 'Global',
            dueDate: expiry.toISOString(),
            daysUntil: daysUntil(expiry, today),
            severity,
            link: '/training'
        });
    });
    return items;
};

const SEVERITY_RANK = { [SEVERITY.OVERDUE]: 0, [SEVERITY.DUE_SOON]: 1, [SEVERITY.UPCOMING]: 2 };

export const buildReminders = (data = {}, options = {}) => {
    const today = options.today ? new Date(options.today) : new Date();
    const windows = { ...DEFAULT_WINDOWS, ...(options.windows || {}) };

    const items = [
        ...collectCapaReminders(data, today, windows),
        ...collectEquipmentReminders(data, today, windows),
        ...collectTrainingReminders(data, today, windows)
    ];

    items.sort((a, b) => {
        const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (rank !== 0) return rank;
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDue - bDue;
    });

    return items;
};

export const formatDueLabel = (item) => {
    const days = item?.daysUntil;
    if (days === null || days === undefined) return 'No date';
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `in ${days}d`;
};

export const summarizeReminders = (items = []) => {
    const summary = {
        total: items.length,
        overdue: 0,
        dueSoon: 0,
        upcoming: 0,
        byCategory: {}
    };
    items.forEach((item) => {
        if (item.severity === SEVERITY.OVERDUE) summary.overdue += 1;
        else if (item.severity === SEVERITY.DUE_SOON) summary.dueSoon += 1;
        else if (item.severity === SEVERITY.UPCOMING) summary.upcoming += 1;
        summary.byCategory[item.category] = (summary.byCategory[item.category] || 0) + 1;
    });
    return summary;
};

// Collections the reminders engine needs loaded from Firebase.
export const REMINDER_COLLECTIONS = [
    'incidents',
    'auditFindings',
    'mockDrills',
    'inspectionRecords',
    'emergencyEquipment',
    'trainings'
];
