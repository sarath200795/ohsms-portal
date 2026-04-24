const CANONICAL_MODULE_ALIASES = {
    analytics: 'Analytics',
    dashboard: 'Analytics',
    dashboards: 'Analytics',
    'analytics dashboard': 'Analytics',
    incidents: 'Incidents',
    'risk assessment': 'Risk Assessment',
    'risk assessments': 'Risk Assessment',
    participation: 'Participation',
    'consultation & participation': 'Participation',
    consultation: 'Participation',
    communication: 'Participation',
    communications: 'Participation',
    meeting: 'Participation',
    meetings: 'Participation',
    'committee meeting': 'Participation',
    'committee meetings': 'Participation',
    'internal audit': 'Internal Audit',
    audits: 'Internal Audit',
    standards: 'Standards',
    standard: 'Standards',
    documents: 'Standards',
    'document library': 'Standards',
    'document management': 'Standards',
    'standards & documents': 'Standards',
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
    'occupational health': 'OHS Tools',
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

export const GLOBAL_OWNER_ROLE = 'Global Owner';
export const SITE_OWNER_ROLE = 'Site Owner';
export const USER_ROLE = 'User';

const LEGACY_ROLE_ALIASES = {
    'global owner': GLOBAL_OWNER_ROLE,
    'global manager': GLOBAL_OWNER_ROLE,
    owner: GLOBAL_OWNER_ROLE,
    admin: GLOBAL_OWNER_ROLE,
    'site owner': SITE_OWNER_ROLE,
    'site manager': USER_ROLE,
    'hse rep': USER_ROLE,
    'lead auditor': USER_ROLE,
    user: USER_ROLE
};

const MODULE_EXPANSION_MAP = {
    Analytics: ['Analytics', 'Dashboard', 'Dashboards', 'Analytics Dashboard'],
    Incidents: ['Incidents'],
    'Risk Assessment': ['Risk Assessment', 'Risk Assessments'],
    Participation: ['Participation', 'Consultation & Participation', 'Consultation', 'Communication', 'Communications', 'Meeting', 'Meetings', 'Committee Meeting', 'Committee Meetings'],
    'Internal Audit': ['Internal Audit', 'Audits'],
    Standards: ['Standards', 'Standard', 'Documents', 'Document Library', 'Document Management', 'Standards & Documents', 'Document Control', 'OHS Tools'],
    'CAPA Manager': ['CAPA Manager', 'CAPA'],
    Training: ['Training'],
    Improvement: ['Improvement'],
    'OHS Tools': ['OHS Tools', 'PTW', 'Permit to Work', 'LOTO', 'Lockout Tagout', 'Occupational Health', 'Health Dashboard', 'Emergency Equipment', 'Standards', 'Standard', 'Document Control'],
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

const ROLE_GRANTED_MODULES = {
    [GLOBAL_OWNER_ROLE]: [...USER_ASSIGNABLE_MODULES.map((module) => module.id), 'Users', 'Sites'],
    [SITE_OWNER_ROLE]: [...USER_ASSIGNABLE_MODULES.map((module) => module.id), 'Users'],
    [USER_ROLE]: []
};

export const SUPPORTED_USER_ROLES = [GLOBAL_OWNER_ROLE, SITE_OWNER_ROLE, USER_ROLE];

export const normalizeRole = (value) => {
    const cleanValue = String(value || '').trim();
    if (!cleanValue) return USER_ROLE;
    return LEGACY_ROLE_ALIASES[cleanValue.toLowerCase()] || cleanValue;
};

export const isGlobalOwnerRole = (role) => normalizeRole(role) === GLOBAL_OWNER_ROLE;
export const isSiteOwnerRole = (role) => normalizeRole(role) === SITE_OWNER_ROLE;
export const isStandardUserRole = (role) => normalizeRole(role) === USER_ROLE;
export const hasSupportedUserRole = (role) => SUPPORTED_USER_ROLES.includes(normalizeRole(role));

export const canEditCreateForRole = (role) => hasSupportedUserRole(role);
export const canDeleteForRole = (role) => isGlobalOwnerRole(role) || isSiteOwnerRole(role);

export const isGlobalSiteCode = (siteCode) => ['GLOBAL', 'Global', 'All'].includes(String(siteCode || '').trim());

export const getAllowedSiteCodes = (session) => {
    if (!session) return new Set();

    const role = normalizeRole(session.role || USER_ROLE);
    if (isGlobalOwnerRole(role)) return new Set();

    const codes = new Set([
        String(session.assignedSite || '').trim(),
        ...safeArr(session.accessibleSites).map((site) => String(site || '').trim())
    ].filter(Boolean));

    codes.delete('GLOBAL');
    codes.delete('Global');
    codes.delete('All');
    return codes;
};

export const canAccessSite = (session, siteId) => {
    if (!session) return false;
    if (isGlobalOwnerRole(session.role) || isGlobalSiteCode(siteId)) return true;
    return getAllowedSiteCodes(session).has(String(siteId || '').trim());
};

export const isGlobalScopeUserRecord = (user) => (
    isGlobalOwnerRole(user?.role)
    || isGlobalSiteCode(user?.assignedSite)
    || safeArr(user?.accessibleSites).some((site) => isGlobalSiteCode(site))
);

export const getRoleGrantedModules = (role) => {
    const normalizedRole = normalizeRole(role);
    return ROLE_GRANTED_MODULES[normalizedRole] || [];
};

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

    const role = normalizeRole(session.role || USER_ROLE);
    const assignedSite = isGlobalOwnerRole(role)
        ? 'GLOBAL'
        : String(session.assignedSite || '').trim() || safeArr(session.accessibleSites)[0] || '';
    const accessibleSites = isGlobalOwnerRole(role)
        ? []
        : uniqueSorted([
            ...safeArr(session.accessibleSites).map((site) => String(site).trim()),
            ...(assignedSite && assignedSite !== 'GLOBAL' ? [assignedSite] : [])
        ]);
    const accessibleModules = expandAccessibleModules([
        ...getRoleGrantedModules(role),
        ...safeArr(session.accessibleModules)
    ]);

    return {
        ...session,
        role,
        assignedSite,
        accessibleSites,
        accessibleModules
    };
};

export const haveModulesChanged = (currentModules = [], nextModules = []) => {
    const current = uniqueSorted(safeArr(currentModules).map((item) => String(item).trim()));
    const next = uniqueSorted(safeArr(nextModules).map((item) => String(item).trim()));

    if (current.length !== next.length) return true;
    return current.some((value, index) => value !== next[index]);
};
