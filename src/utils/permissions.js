const CANONICAL_MODULE_ALIASES = {
    analytics: 'Analytics',
    incidents: 'Incidents',
    'risk assessment': 'Risk Assessment',
    'risk assessments': 'Risk Assessment',
    participation: 'Participation',
    'consultation & participation': 'Participation',
    'internal audit': 'Internal Audit',
    audits: 'Internal Audit',
    standards: 'Standards',
    standard: 'Standards',
    'document control': 'Standards',
    'capa manager': 'CAPA Manager',
    capa: 'CAPA Manager',
    training: 'Training',
    improvement: 'Improvement',
    'ohs tools': 'OHS Tools',
    ptw: 'OHS Tools',
    'permit to work': 'OHS Tools',
    loto: 'OHS Tools',
    'lockout tagout': 'OHS Tools',
    'health dashboard': 'OHS Tools',
    'emergency equipment': 'OHS Tools',
    'record emergency': 'Record Emergency',
    'mock drills': 'Record Emergency',
    contractors: 'Contractors',
    'contractor management': 'Contractors',
    moc: 'MOC',
    'management of change': 'MOC',
    inspections: 'Inspections',
    sites: 'Sites',
    users: 'Users'
};

const MODULE_EXPANSION_MAP = {
    Analytics: ['Analytics'],
    Incidents: ['Incidents'],
    'Risk Assessment': ['Risk Assessment', 'Risk Assessments'],
    Participation: ['Participation', 'Consultation & Participation'],
    'Internal Audit': ['Internal Audit', 'Audits'],
    Standards: ['Standards', 'Standard', 'Document Control', 'OHS Tools'],
    'CAPA Manager': ['CAPA Manager', 'CAPA'],
    Training: ['Training'],
    Improvement: ['Improvement'],
    'OHS Tools': ['OHS Tools', 'PTW', 'Permit to Work', 'LOTO', 'Lockout Tagout', 'Health Dashboard', 'Emergency Equipment', 'Standards', 'Standard', 'Document Control'],
    'Record Emergency': ['Record Emergency', 'Mock Drills'],
    Contractors: ['Contractors', 'Contractor Management'],
    MOC: ['MOC', 'Management of Change'],
    Inspections: ['Inspections'],
    Sites: ['Sites'],
    Users: ['Users']
};

const safeArr = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'object') return Object.values(value).filter(Boolean);
    return [];
};

const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const toCanonicalModuleId = (value) => CANONICAL_MODULE_ALIASES[String(value || '').trim().toLowerCase()] || String(value || '').trim();

export const USER_ASSIGNABLE_MODULES = [
    { id: 'Analytics', label: 'Analytics' },
    { id: 'Incidents', label: 'Incidents' },
    { id: 'Risk Assessment', label: 'Risk Assessment' },
    { id: 'Participation', label: 'Participation' },
    { id: 'Internal Audit', label: 'Internal Audit' },
    { id: 'Standards', label: 'Standards & Documents' },
    { id: 'CAPA Manager', label: 'CAPA Manager' },
    { id: 'Training', label: 'Training' },
    { id: 'Improvement', label: 'Improvement' },
    { id: 'OHS Tools', label: 'OHS Tools (PTW / LOTO / Health / Emergency Equipment)' },
    { id: 'Record Emergency', label: 'Record Emergency' },
    { id: 'Contractors', label: 'Contractor Safety' },
    { id: 'MOC', label: 'Management of Change' },
    { id: 'Inspections', label: 'Inspections' }
];

export const toCanonicalModuleIds = (modules = []) => {
    const canonical = safeArr(modules).map((moduleName) => {
        const raw = String(moduleName || '').trim();
        if (!raw) return '';
        return toCanonicalModuleId(raw);
    });
    return uniqueSorted(canonical);
};

export const expandAccessibleModules = (modules = []) => {
    const expanded = [];

    safeArr(modules).forEach((moduleName) => {
        const raw = String(moduleName || '').trim();
        if (!raw) return;

        expanded.push(raw);

        const canonicalId = toCanonicalModuleId(raw);
        const relatedModules = MODULE_EXPANSION_MAP[canonicalId];
        if (!relatedModules) return;

        expanded.push(canonicalId);
        expanded.push(...relatedModules);
    });

    return uniqueSorted(expanded);
};

export const hasAccessibleModule = (modules = [], targetModule = '') => {
    if (!targetModule) return false;
    const expanded = new Set(expandAccessibleModules(modules));
    return expanded.has(targetModule);
};

export const normalizeSessionPermissions = (session) => {
    if (!session || typeof session !== 'object') return session;

    return {
        ...session,
        accessibleModules: expandAccessibleModules(session.accessibleModules || [])
    };
};

export const haveModulesChanged = (currentModules = [], nextModules = []) => {
    const current = uniqueSorted(safeArr(currentModules).map((item) => String(item).trim()));
    const next = uniqueSorted(safeArr(nextModules).map((item) => String(item).trim()));

    if (current.length !== next.length) return true;
    return current.some((value, index) => value !== next[index]);
};
