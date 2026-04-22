const ROUTE_META = [
    { prefixes: ['/'], exact: true, pageTitle: 'Login', transitionLabel: 'Opening enterprise access' },
    { prefixes: ['/dashboard'], pageTitle: 'Enterprise Hub', transitionLabel: 'Loading command hub' },
    { prefixes: ['/activity-calendar'], pageTitle: 'Activity Calendar', transitionLabel: 'Opening activity calendar' },
    { prefixes: ['/tutorials'], pageTitle: 'Tutorial Library', transitionLabel: 'Opening tutorial library' },
    { prefixes: ['/users'], pageTitle: 'Users', transitionLabel: 'Opening user administration' },
    { prefixes: ['/sites'], pageTitle: 'Sites', transitionLabel: 'Opening site administration' },
    { prefixes: ['/analytics'], pageTitle: 'Analytics', transitionLabel: 'Opening analytics workspace' },
    { prefixes: ['/incidents'], pageTitle: 'Incidents', transitionLabel: 'Opening incident workspace' },
    { prefixes: ['/risk'], pageTitle: 'Risk', transitionLabel: 'Opening risk controls' },
    { prefixes: ['/consultation'], pageTitle: 'Consultation', transitionLabel: 'Opening consultation workspace' },
    { prefixes: ['/audit'], pageTitle: 'Audit', transitionLabel: 'Opening audit workspace' },
    { prefixes: ['/standards'], pageTitle: 'Standards', transitionLabel: 'Opening standards workspace' },
    { prefixes: ['/capa'], pageTitle: 'CAPA', transitionLabel: 'Opening corrective actions' },
    { prefixes: ['/training'], pageTitle: 'Training', transitionLabel: 'Opening training center' },
    { prefixes: ['/improvement'], pageTitle: 'Improvement', transitionLabel: 'Opening improvement workspace' },
    { prefixes: ['/contractors'], pageTitle: 'Contractors', transitionLabel: 'Opening contractor workspace' },
    { prefixes: ['/ohs-tools'], pageTitle: 'OHS Tools', transitionLabel: 'Opening OHS tools' },
    { prefixes: ['/health-dashboard'], pageTitle: 'Health', transitionLabel: 'Opening health workspace' },
    { prefixes: ['/mock-drill'], pageTitle: 'Emergency Module', transitionLabel: 'Opening emergency workspace' },
    { prefixes: ['/emergency-equipment'], pageTitle: 'Emergency Equipment', transitionLabel: 'Opening emergency equipment' },
    { prefixes: ['/inspections'], pageTitle: 'Inspections', transitionLabel: 'Opening inspection workspace' },
    { prefixes: ['/ptw'], pageTitle: 'Permit to Work', transitionLabel: 'Opening permit controls' },
    { prefixes: ['/loto'], pageTitle: 'LOTO', transitionLabel: 'Opening loto controls' },
    { prefixes: ['/field-app', '/field-portal'], pageTitle: 'Field Portal', transitionLabel: 'Switching to field mode' },
    { prefixes: ['/vendor-portal'], pageTitle: 'Vendor Portal', transitionLabel: 'Opening vendor workspace' }
];

const normalizePath = (pathname = '') => {
    const cleanPath = String(pathname || '').trim().toLowerCase();
    return cleanPath || '/';
};

const findRouteMeta = (pathname = '') => {
    const path = normalizePath(pathname);

    return ROUTE_META.find((entry) => {
        const matchesPrefix = (entry.prefixes || []).some((prefix) => {
            const normalizedPrefix = normalizePath(prefix);
            if (entry.exact) {
                return path === normalizedPrefix;
            }
            return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
        });

        return matchesPrefix;
    }) || null;
};

export const getTransitionLabel = (pathname = '') => {
    return findRouteMeta(pathname)?.transitionLabel || 'Loading safety workspace';
};

export const getPageTitle = (pathname = '') => {
    const pageTitle = findRouteMeta(pathname)?.pageTitle || 'Enterprise Hub';
    return `${pageTitle} | ISO 45001`;
};

export const getRecoveryPath = (pathname = '') => {
    const path = normalizePath(pathname);
    const canUseSessionStorage = typeof sessionStorage !== 'undefined';
    const fieldHomeContext = canUseSessionStorage ? sessionStorage.getItem('fieldModuleHomeContext') : '';
    const hasFieldSession = canUseSessionStorage ? Boolean(sessionStorage.getItem('fieldPortalSession')) : false;
    const hasVendorSession = canUseSessionStorage ? Boolean(sessionStorage.getItem('vendorSession')) : false;
    const isFieldScopedTool = path.startsWith('/ptw') || path.startsWith('/loto') || path.startsWith('/emergency-equipment');

    if (path === '/') return '/';
    if (path.startsWith('/vendor-portal') || hasVendorSession) return '/vendor-portal';
    if (
        path.startsWith('/field-portal')
        || path.startsWith('/field-app')
        || ((fieldHomeContext === 'field-portal' || fieldHomeContext === 'field-app' || hasFieldSession) && isFieldScopedTool)
    ) {
        return '/field-portal';
    }

    return '/dashboard';
};

export const getRecoveryLabel = (pathname = '') => {
    const recoveryPath = getRecoveryPath(pathname);

    if (recoveryPath === '/field-portal') return 'Return to Field Portal';
    if (recoveryPath === '/vendor-portal') return 'Return to Vendor Portal';
    if (recoveryPath === '/dashboard') return 'Return to Dashboard';
    return 'Return to Login';
};
