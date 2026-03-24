export const FIELD_MODULES = [
    {
        id: 'inspections',
        label: 'Inspection',
        desc: 'Run assigned site inspections and close scheduled checks in the field.',
        path: '/inspections',
        icon: 'fa-clipboard-check',
        accent: 'text-lime-300',
        surface: 'from-lime-500/20 via-emerald-500/10 to-transparent',
        border: 'border-lime-500/30',
        requiredModules: ['Inspections'],
        actionLabel: 'Open Inspection'
    },
    {
        id: 'ptw',
        label: 'PTW',
        desc: 'Issue, review, and progress live permits for work activities on site.',
        path: '/ptw',
        icon: 'fa-file-signature',
        accent: 'text-amber-300',
        surface: 'from-amber-500/20 via-orange-500/10 to-transparent',
        border: 'border-amber-500/30',
        requiredModules: ['OHS Tools'],
        actionLabel: 'Open PTW'
    },
    {
        id: 'loto',
        label: 'LOTO',
        desc: 'Access approved isolation procedures and execute lockout work safely.',
        path: '/loto',
        icon: 'fa-lock',
        accent: 'text-red-300',
        surface: 'from-red-500/20 via-rose-500/10 to-transparent',
        border: 'border-red-500/30',
        requiredModules: ['OHS Tools'],
        actionLabel: 'Open LOTO'
    },
    {
        id: 'incidents',
        label: 'Incidents',
        desc: 'Report field incidents fast and review active investigation records.',
        path: '/incidents',
        icon: 'fa-triangle-exclamation',
        accent: 'text-orange-300',
        surface: 'from-orange-500/20 via-red-500/10 to-transparent',
        border: 'border-orange-500/30',
        requiredModules: ['Incidents'],
        actionLabel: 'Open Incidents'
    },
    {
        id: 'emergency-module',
        label: 'Emergency Module',
        desc: 'Launch emergency response workflows, drills, and event records on site.',
        path: '/mock-drill',
        icon: 'fa-person-running',
        accent: 'text-sky-300',
        surface: 'from-sky-500/20 via-cyan-500/10 to-transparent',
        border: 'border-sky-500/30',
        requiredModules: ['Record Emergency'],
        actionLabel: 'Open Emergency'
    },
    {
        id: 'emergency-equipment',
        label: 'Emergency Equipment',
        desc: 'Inspect and maintain extinguishers, first aid kits, AEDs, and spill kits.',
        path: '/emergency-equipment',
        icon: 'fa-fire-extinguisher',
        accent: 'text-fuchsia-300',
        surface: 'from-fuchsia-500/20 via-pink-500/10 to-transparent',
        border: 'border-fuchsia-500/30',
        requiredModules: ['OHS Tools'],
        actionLabel: 'Open Equipment'
    }
];

export const GLOBAL_ROLES = ['Global Owner', 'Global Manager', 'Owner', 'Admin'];

export const isGlobalRole = (role) => GLOBAL_ROLES.includes(role);

export const getVisibleSites = (sites, session) => {
    if (!session) return [];
    if (isGlobalRole(session.role)) return sites;

    const allowedCodes = new Set([session.assignedSite, ...(session.accessibleSites || [])].filter(Boolean));
    allowedCodes.delete('GLOBAL');
    allowedCodes.delete('All');

    const matchedSites = sites.filter((site) => allowedCodes.has(site.code));
    if (matchedSites.length > 0) return matchedSites;

    return [...allowedCodes].map((code) => ({ code, name: code }));
};

export const getVisibleFieldModules = (session) => {
    if (!session) return [];
    if (isGlobalRole(session.role)) return FIELD_MODULES;

    const accessibleModules = new Set(session.accessibleModules || []);
    return FIELD_MODULES.filter((module) => module.requiredModules.some((requiredModule) => accessibleModules.has(requiredModule)));
};

export const resolveInitialSite = ({ search, session, visibleSites }) => {
    const params = new URLSearchParams(search);
    const urlSite = params.get('site');
    let storedSite = sessionStorage.getItem('isoCurrentSite');

    if (storedSite === 'GLOBAL') storedSite = 'All';

    let nextSite = urlSite || storedSite || (isGlobalRole(session?.role) ? 'All' : session?.assignedSite) || 'All';

    if (!isGlobalRole(session?.role) && nextSite === 'All') {
        nextSite = session?.assignedSite || visibleSites[0]?.code || '';
    }

    return nextSite;
};
