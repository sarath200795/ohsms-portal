import { hasAccessibleModule, isGlobalOwnerRole } from '../../utils/permissions.js';

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

export const isGlobalRole = (role) => isGlobalOwnerRole(role);

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

    return FIELD_MODULES.filter((module) => module.requiredModules.some((requiredModule) => hasAccessibleModule(session.accessibleModules, requiredModule)));
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

const normalizeFieldQrSite = (site, fallbackSite = 'All') => {
    const value = String(site || fallbackSite || 'All').trim();
    if (!value || value === 'GLOBAL') return 'All';
    return value;
};

const getFirstParamValue = (params, names) => {
    for (const name of names) {
        const value = String(params.get(name) || '').trim();
        if (value) return value;
    }

    return '';
};

export const resolveFieldQrNavigation = ({ decodedText, fallbackSite = 'All' }) => {
    const rawValue = String(decodedText || '').trim();
    if (!rawValue) return null;

    let pathname = '';
    let params = new URLSearchParams();

    try {
        const parsedUrl = new URL(rawValue);
        pathname = parsedUrl.pathname.toLowerCase();
        params = new URLSearchParams(parsedUrl.search);
    } catch {
        const queryIndex = rawValue.indexOf('?');
        pathname = rawValue.toLowerCase();
        params = new URLSearchParams(queryIndex >= 0 ? rawValue.slice(queryIndex + 1) : rawValue);
    }

    if (params.has('ptw') || params.has('permit') || params.has('permitId') || pathname.includes('/ptw')) {
        const permitId = getFirstParamValue(params, ['ptw', 'permit', 'permitId', 'id']);
        if (!permitId) return null;

        const site = normalizeFieldQrSite(params.get('site'), fallbackSite);
        const nextParams = new URLSearchParams({
            ptw: permitId,
            site,
            fieldQr: '1'
        });

        if (params.get('org')) nextParams.set('org', params.get('org'));

        return {
            moduleId: 'ptw',
            site,
            path: `/ptw?${nextParams.toString()}`
        };
    }

    if (params.has('execute') || params.has('loto') || params.has('procedure') || pathname.includes('/loto')) {
        const procedureId = getFirstParamValue(params, ['execute', 'loto', 'procedure', 'id']);
        if (!procedureId) return null;

        const site = normalizeFieldQrSite(params.get('site'), fallbackSite);
        const nextParams = new URLSearchParams({
            execute: procedureId,
            site,
            fieldQr: '1'
        });

        if (params.get('org')) nextParams.set('org', params.get('org'));

        return {
            moduleId: 'loto',
            site,
            path: `/loto?${nextParams.toString()}`
        };
    }

    if (params.has('scan') || params.has('equipment') || params.has('asset') || pathname.includes('/emergency-equipment')) {
        const equipmentId = getFirstParamValue(params, ['scan', 'equipment', 'asset', 'id']);
        if (!equipmentId) return null;

        const site = normalizeFieldQrSite(params.get('site'), fallbackSite);
        const nextParams = new URLSearchParams({
            scan: equipmentId,
            site,
            fieldQr: '1'
        });

        if (params.get('org')) nextParams.set('org', params.get('org'));

        return {
            moduleId: 'emergency-equipment',
            site,
            path: `/emergency-equipment?${nextParams.toString()}`
        };
    }

    return null;
};
