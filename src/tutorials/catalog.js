export const TUTORIAL_CATALOG = [
    {
        id: 'platform-overview',
        title: 'Platform Overview',
        description: 'A guided introduction to the platform, reports, portals, and the overall safety workflow.',
        category: 'Platform',
        duration: '03:06',
        videoUrl: '/tutorial-videos/intro/ohsms-enterprise-intro-promo.mp4',
        routePrefixes: []
    },
    {
        id: 'incidents',
        title: 'Incidents Module Tutorial',
        description: 'Report incidents, complete investigation steps, raise CAPA, and connect actions back to risk and training.',
        category: 'Enterprise Modules',
        duration: '03:31',
        videoUrl: '/tutorial-videos/module-deep-dives/incident-module-live-tutorial.mp4',
        routePrefixes: ['/incidents']
    },
    {
        id: 'inspections',
        title: 'Inspections Module Tutorial',
        description: 'Understand scheduled inspections, execution flow, generated reports, CAPA linkage, and training handoff.',
        category: 'Enterprise Modules',
        duration: '03:24',
        videoUrl: '/tutorial-videos/module-deep-dives/inspections-module-live-tutorial.mp4',
        routePrefixes: ['/inspections']
    },
    {
        id: 'risk',
        title: 'Risk Module Tutorial',
        description: 'Walk through risk register management, assessments, controls, and review workflows.',
        category: 'Enterprise Modules',
        duration: '02:20',
        videoUrl: '/tutorial-videos/module-deep-dives/risk-module-live-tutorial.mp4',
        routePrefixes: ['/risk']
    },
    {
        id: 'training',
        title: 'Training Module Tutorial',
        description: 'Review training plans, linked corrective actions, completion records, and learning coordination.',
        category: 'Enterprise Modules',
        duration: '02:01',
        videoUrl: '/tutorial-videos/module-deep-dives/training-module-live-tutorial.mp4',
        routePrefixes: ['/training']
    },
    {
        id: 'contractors',
        title: 'Contractor Safety Tutorial',
        description: 'Follow contractor onboarding, worker profiles, compliance tracking, and linked safety records.',
        category: 'Enterprise Modules',
        duration: '02:07',
        videoUrl: '/tutorial-videos/module-deep-dives/contractors-module-live-tutorial.mp4',
        routePrefixes: ['/contractors']
    },
    {
        id: 'ptw',
        title: 'Permit to Work Tutorial',
        description: 'See the permit lifecycle, approvals, QR access, field inspections, and active permit controls.',
        category: 'OHS Tools',
        duration: '02:15',
        videoUrl: '/tutorial-videos/module-deep-dives/ptw-module-live-tutorial.mp4',
        routePrefixes: ['/ptw']
    },
    {
        id: 'loto',
        title: 'LOTO Tutorial',
        description: 'Cover procedure generation, tags, QR access, field execution, and isolation control workflows.',
        category: 'OHS Tools',
        duration: '02:34',
        videoUrl: '/tutorial-videos/module-deep-dives/loto-module-live-tutorial.mp4',
        routePrefixes: ['/loto']
    },
    {
        id: 'emergency',
        title: 'Emergency Module Tutorial',
        description: 'Walk through drill setup, response logs, debriefing, CAPA creation, and the emergency report flow.',
        category: 'OHS Tools',
        duration: '03:07',
        videoUrl: '/tutorial-videos/module-deep-dives/emergency-module-live-tutorial.mp4',
        routePrefixes: ['/mock-drill']
    },
    {
        id: 'emergency-equipment',
        title: 'Emergency Equipment Tutorial',
        description: 'Manage equipment tags, inspection records, PDF outputs, and the equipment-specific inspection process.',
        category: 'OHS Tools',
        duration: '05:26',
        videoUrl: '/tutorial-videos/module-deep-dives/emergency-equipment-module-live-tutorial.mp4',
        routePrefixes: ['/emergency-equipment']
    },
    {
        id: 'vendor-portal',
        title: 'Vendor Portal Tutorial',
        description: 'Understand vendor-facing access, portal workflows, and how external parties interact with the system.',
        category: 'Portals',
        duration: '01:49',
        videoUrl: '/tutorial-videos/module-deep-dives/vendor-portal-live-tutorial.mp4',
        routePrefixes: ['/vendor-portal']
    }
];

export const getTutorialForPath = (pathname) => {
    const path = String(pathname || '').toLowerCase();

    return TUTORIAL_CATALOG.find((tutorial) =>
        (tutorial.routePrefixes || []).some((prefix) => {
            const normalizedPrefix = String(prefix || '').toLowerCase();
            return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
        })
    ) || null;
};

export const getTutorialById = (id) => TUTORIAL_CATALOG.find((tutorial) => tutorial.id === id) || null;
