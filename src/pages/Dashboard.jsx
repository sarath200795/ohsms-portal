import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, rtdb } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import useStore from '../store/useStore';
import { clearFieldModuleHomeContext } from './FieldApp/portalAuth';
import { useAppTransition } from '../hooks/useAppTransition';
import { hasAccessibleModule, normalizeSessionPermissions } from '../utils/permissions';

const getDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const DASHBOARD_ACTIVITY_MODULES = ['Incidents', 'OHS Tools', 'Health Dashboard', 'Inspections', 'Record Emergency', 'Participation', 'CAPA Manager'];

const NavCard = ({ module, actions = [], onClick }) => {
    const topActions = actions.slice(0, 3);
    const extraCount = actions.length - 3;

    return (
        <button
            type="button"
            onClick={onClick}
            className="command-panel myth-hover group relative flex min-h-[15rem] w-full flex-col overflow-hidden rounded-[1.9rem] p-6 text-left"
        >
            <div className="myth-card-glow"></div>
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(242,201,120,0.35)] to-transparent"></div>

            <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className={`myth-icon-frame flex h-14 w-14 items-center justify-center rounded-[1.25rem] text-2xl transition-transform duration-300 group-hover:scale-110 ${module.color}`}>
                        <i className={`fas ${module.icon}`}></i>
                    </div>
                    <div>
                        <p className="myth-kicker">{module.id}</p>
                        <h3 className="mt-2 text-3xl text-white">{module.label}</h3>
                    </div>
                </div>

                {actions.length > 0 ? (
                    <span className="war-chip !border-[rgba(215,131,57,0.3)] !bg-[rgba(88,37,19,0.55)] !text-[var(--myth-ember)]">
                        {actions.length} active
                    </span>
                ) : (
                    <span className="war-chip !text-[var(--myth-muted)]">standby</span>
                )}
            </div>

            <div className="relative z-10 mt-5 flex-1">
                <p className="max-w-sm text-sm leading-relaxed text-[var(--myth-muted)]">
                    Enter the module workspace, review operational status, and execute assigned actions from the central command deck.
                </p>

                {actions.length > 0 ? (
                    <div className="mt-5 rounded-[1.3rem] border border-[rgba(242,201,120,0.12)] bg-[rgba(12,10,8,0.68)] p-4">
                        <p className="myth-kicker mb-3 text-[10px]">Priority Queue</p>
                        <div className="space-y-2">
                            {topActions.map((act, i) => (
                                <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--myth-ink)]">
                                    <i className="fas fa-diamond mt-1 text-[7px] text-[var(--myth-ember)]"></i>
                                    <span className="block truncate">{act.title}</span>
                                </div>
                            ))}
                            {extraCount > 0 ? (
                                <div className="pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--myth-muted)]">
                                    + {extraCount} more pending
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 flex items-center justify-between border-t border-[rgba(242,201,120,0.12)] pt-4">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--myth-muted)]">
                            No queued tasks
                        </span>
                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(242,201,120,0.14)] bg-[rgba(10,8,6,0.72)] text-[var(--myth-gold)] transition-transform group-hover:translate-x-1">
                            <i className="fas fa-arrow-right"></i>
                        </span>
                    </div>
                )}
            </div>
        </button>
    );
};

export default function Dashboard() {
    const navigate = useNavigate();
    const playTransition = useAppTransition();

    useEffect(() => {
        clearFieldModuleHomeContext();
    }, []);
    const { session, initializeSession, clearSession } = useStore();

    const [selectedSite, setSelectedSite] = useState('');
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isFabOpen, setIsFabOpen] = useState(false);

    // --- PHASE 2 TARGETED FETCHING STATE ---
    const [localOrgData, setLocalOrgData] = useState(null);
    const [localLoading, setLocalLoading] = useState(true);

    const ALL_MODULES = [
        { id: 'Analytics', label: 'Analytics', icon: 'fa-chart-pie', color: 'text-purple-400', path: '/analytics' },
        { id: 'Tutorials', label: 'Tutorials', icon: 'fa-circle-play', color: 'text-amber-300', path: '/tutorials' },
        { id: 'Activity Calendar', label: 'Activity Calendar', icon: 'fa-calendar-days', color: 'text-cyan-300', path: '/activity-calendar' },
        { id: 'Incidents', label: 'Incidents', icon: 'fa-triangle-exclamation', color: 'text-orange-400', path: '/incidents' },
        { id: 'Risk Assessment', label: 'Risk Assessment', icon: 'fa-shield-virus', color: 'text-red-400', path: '/risk' },
        { id: 'Participation', label: 'Participation', icon: 'fa-comments', color: 'text-teal-400', path: '/consultation' },
        { id: 'Internal Audit', label: 'Internal Audit', icon: 'fa-clipboard-check', color: 'text-emerald-400', path: '/audit' },
        { id: 'CAPA Manager', label: 'CAPA Manager', icon: 'fa-list-check', color: 'text-cyan-400', path: '/capa' },
        { id: 'Training', label: 'Training', icon: 'fa-graduation-cap', color: 'text-yellow-400', path: '/training' },
        { id: 'Improvement', label: 'Improvement', icon: 'fa-chart-line', color: 'text-blue-400', path: '/improvement' },
        { id: 'Record Emergency', label: 'Record Emergency', icon: 'fa-person-running', color: 'text-pink-400', path: '/mock-drill' },
        { id: 'OHS Tools', label: 'OHS Tools', icon: 'fa-toolbox', color: 'text-fuchsia-400', path: '/ohs-tools' },
        { id: 'Contractors', label: 'Contractor Safety', icon: 'fa-hard-hat', color: 'text-indigo-400', path: '/contractors' },
        { id: 'MOC', label: 'Mgmt of Change', icon: 'fa-code-branch', color: 'text-rose-400', path: '/moc' },
        { id: 'Inspections', label: 'Inspections', icon: 'fa-search-location', color: 'text-lime-400', path: '/inspections' },
        { id: 'Users', label: 'Users', icon: 'fa-users-gear', color: 'text-slate-300', path: '/users' },
        { id: 'Sites', label: 'Sites', icon: 'fa-building-shield', color: 'text-slate-300', path: '/sites' },
    ];

    useEffect(() => {
        const raw = sessionStorage.getItem('isoSession');
        if (!raw) return navigate('/');
        const sess = normalizeSessionPermissions(JSON.parse(raw));
        sessionStorage.setItem('isoSession', JSON.stringify(sess));

        initializeSession(sess);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);

        let initialSite = sessionStorage.getItem('isoCurrentSite');
        if (!initialSite) initialSite = isGlobalAdmin ? 'GLOBAL' : sess.assignedSite;
        if (!isGlobalAdmin && initialSite === 'GLOBAL') initialSite = sess.assignedSite;

        setSelectedSite(initialSite || 'GLOBAL');
        sessionStorage.setItem('isoCurrentSite', initialSite || 'GLOBAL');

        // --- PHASE 2 TARGETED FETCHING ENGINE ---
        // Only pull the exact tables needed to calculate notifications and site lists
        const fetchDashboardData = async () => {
            try {
                const orgRef = `organizations/${sess.orgId}`;
                const [detailsSnap, sitesSnap, ptwSnap, incidentsSnap, requestsSnap] = await Promise.all([
                    get(ref(rtdb, `${orgRef}/details`)),
                    get(ref(rtdb, `${orgRef}/sites`)),
                    get(ref(rtdb, `${orgRef}/ptwRecords`)),
                    get(ref(rtdb, `${orgRef}/incidents`)),
                    get(ref(rtdb, `${orgRef}/permissionRequests`))
                ]);

                setLocalOrgData({
                    details: detailsSnap.exists() ? detailsSnap.val() : null,
                    sites: sitesSnap.exists() ? sitesSnap.val() : null,
                    ptwRecords: ptwSnap.exists() ? ptwSnap.val() : null,
                    incidents: incidentsSnap.exists() ? incidentsSnap.val() : null,
                    permissionRequests: requestsSnap.exists() ? requestsSnap.val() : null,
                });
            } catch (error) {
                console.error("Dashboard Fetch Error:", error);
            } finally {
                setLocalLoading(false);
            }
        };

        fetchDashboardData();
    }, [navigate, initializeSession]);

    const { orgName, sites, myActions, visibleModules } = useMemo(() => {
        let orgName = 'OHS Portal';
        let parsedSites = [];
        let actions = [];
        let vModules = [];

        if (session && localOrgData) {
            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session.role);
            const myEmail = session.email?.toLowerCase().trim();
            const myName = session.name?.toLowerCase().trim();
            const checkUserMatch = (val) => val?.toLowerCase().trim() === myEmail || val?.toLowerCase().trim() === myName;

            if (localOrgData.details?.name) orgName = localOrgData.details.name;

            if (localOrgData.sites) {
                const allSites = Object.values(localOrgData.sites);
                if (isGlobalAdmin) {
                    parsedSites = allSites;
                } else {
                    const allowedCodes = new Set([session.assignedSite, ...(session.accessibleSites || [])]);
                    parsedSites = allSites.filter(s => allowedCodes.has(s.code));
                }
            }

            const hasActivityCalendarAccess = isGlobalAdmin || DASHBOARD_ACTIVITY_MODULES.some((moduleId) => hasAccessibleModule(session.accessibleModules, moduleId));

            if (isGlobalAdmin) vModules = ALL_MODULES;
            else {
                vModules = ALL_MODULES.filter((mod) => {
                    if (mod.id === 'Tutorials') return true;
                    if (mod.id === 'Activity Calendar') return hasActivityCalendarAccess;
                    return hasAccessibleModule(session.accessibleModules, mod.id);
                });
            }

            if (localOrgData.ptwRecords) {
                Object.values(localOrgData.ptwRecords).forEach(p => {
                    const isPending = p.status === 'Pending Approval' || p.status === 'Pending Closure';
                    const isMyTurn = (p.engApproverEmail && checkUserMatch(p.engApproverEmail) && p.engStatus.includes('Pending')) ||
                        (p.prodApproverEmail && checkUserMatch(p.prodApproverEmail) && p.prodStatus.includes('Pending'));
                    if (isPending && isMyTurn) {
                        actions.push({ title: `Permit Auth: ${p.id}`, module: 'OHS Tools', path: `/ptw?site=${p.siteId}` });
                    }
                });
            }

            if (localOrgData.incidents) {
                Object.values(localOrgData.incidents).forEach(inc => {
                    const capas = inc.capa || (inc.investigation && inc.investigation.capa);
                    if (capas) {
                        Object.values(capas).forEach(act => {
                            if (act && act.status !== 'Closed' && checkUserMatch(act.owner || act.own)) {
                                actions.push({ title: act.action || act.act || act.desc, module: 'CAPA Manager', path: `/capa?site=${inc.siteId || 'All'}` });
                            }
                        });
                    }
                });
            }

            if (isGlobalAdmin && localOrgData.permissionRequests) {
                Object.values(localOrgData.permissionRequests).forEach(req => {
                    if (req.status === 'Pending') {
                        actions.push({ title: `Access Request: ${req.userName}`, module: 'Users', path: '/users' });
                    }
                });
            }
        }

        return { orgName, sites: parsedSites, myActions: actions, visibleModules: vModules };
    }, [localOrgData, session]);

    const handleLogout = async () => {
        await signOut(auth);
        sessionStorage.clear();
        clearSession();
        navigate('/');
    };

    const handleSiteChange = (e) => {
        const newSite = e.target.value;
        setSelectedSite(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite);
    };

    const handleNavigation = (mod) => {
        sessionStorage.setItem('isoCurrentSite', selectedSite);
        const paramSite = selectedSite === 'GLOBAL' ? 'All' : selectedSite;
        playTransition({
            label: `Opening ${mod.label}`,
            action: () => navigate(`${mod.path}?site=${paramSite}`)
        });
    };

    if (localLoading) {
        return (
            <div className="myth-shell flex h-screen flex-col items-center justify-center bg-[#080705] px-6 text-[var(--myth-ink)]">
                <div className="command-panel flex items-center gap-4 rounded-[1.8rem] px-8 py-6">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-[rgba(242,201,120,0.12)] border-t-[var(--myth-ember)]"></div>
                    <div>
                        <p className="myth-kicker">Command Sync</p>
                        <p className="mt-1 text-lg font-semibold text-white">Loading Workspace</p>
                    </div>
                </div>
            </div>
        );
    }

    const firstName = session?.name?.split(' ')[0] || 'Team Member';
    const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const activeSiteName = selectedSite === 'GLOBAL' ? 'Global View (All Sites)' : (sites.find(s => s.code === selectedSite)?.name || selectedSite);
    const hasFieldAppAccess = isGlobalAdmin || visibleModules.some((module) => ['Incidents', 'Inspections', 'OHS Tools', 'Record Emergency'].includes(module.id));
    const greeting = getDayGreeting();

    return (
        <div className="myth-shell relative flex h-screen flex-col overflow-hidden bg-[#080705] text-white">

            {/* FLOATING ACTION BUTTON */}
            <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
                <div className={`origin-bottom transition-all duration-300 ${isFabOpen ? 'mb-2 scale-100 opacity-100' : 'pointer-events-none h-0 scale-0 opacity-0'}`}>
                    <div className="flex flex-col items-end gap-3">
                    {visibleModules.find(m => m.id === 'Incidents') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening Incidents',
                                action: () => navigate('/incidents?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="flex items-center gap-3">
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Report Incident</span>
                            <div className="myth-button myth-button-primary flex h-12 w-12 items-center justify-center rounded-full text-lg"><i className="fas fa-triangle-exclamation"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'Inspections') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening Inspections',
                                action: () => navigate('/inspections?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="flex items-center gap-3">
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Start Inspection</span>
                            <div className="myth-button myth-button-cyan flex h-12 w-12 items-center justify-center rounded-full text-lg"><i className="fas fa-search-location"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'OHS Tools') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening OHS Tools',
                                action: () => navigate('/ohs-tools?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="flex items-center gap-3">
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Safety Tools</span>
                            <div className="myth-outline-button flex h-12 w-12 items-center justify-center rounded-full text-lg text-[var(--myth-gold)]"><i className="fas fa-toolbox"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'CAPA Manager') && (
                        <button onClick={() => {
                            setIsFabOpen(false);
                            playTransition({
                                label: 'Opening CAPA Manager',
                                action: () => navigate('/capa?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite))
                            });
                        }} className="flex items-center gap-3">
                            <span className="myth-surface-soft rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--myth-ink)]">Action Register</span>
                            <div className="myth-outline-button flex h-12 w-12 items-center justify-center rounded-full text-lg text-[var(--myth-cyan)]"><i className="fas fa-list-check"></i></div>
                        </button>
                    )}
                    </div>
                </div>

                <button
                    onClick={() => setIsFabOpen(!isFabOpen)}
                    className={`myth-button myth-button-primary flex h-14 w-14 items-center justify-center rounded-full text-xl ${isFabOpen ? 'rotate-45' : ''}`}>
                    <i className={`fas ${isFabOpen ? 'fa-plus' : 'fa-bolt'}`}></i>
                </button>
            </div>

            <header className="myth-topbar z-40 px-4 sm:px-6">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="myth-icon-frame flex h-12 w-12 items-center justify-center overflow-hidden rounded-[1.1rem]">
                            <img src="/we-ehs-logo.jpg" alt="WE EHS" className="h-full w-full object-cover" />
                        </div>
                        <div>
                            <p className="myth-kicker">Enterprise Command</p>
                            <h1 className="text-3xl text-white">WE EHS Safety Tool</h1>
                        </div>

                        <div className="myth-surface-soft ml-2 hidden items-center gap-2 rounded-2xl px-4 py-3 lg:flex">
                            <i className="fas fa-location-dot text-[var(--myth-cyan)]"></i>
                            <select
                                value={selectedSite}
                                onChange={handleSiteChange}
                                className="w-44 cursor-pointer bg-transparent text-sm font-bold text-white outline-none"
                            >
                                {isGlobalAdmin && <option value="GLOBAL">Global View (All Sites)</option>}
                                {sites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsNotificationOpen(true)} className="myth-outline-button relative flex h-11 w-11 items-center justify-center rounded-2xl">
                            <i className="fas fa-bell text-[var(--myth-gold)]"></i>
                            {myActions.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--myth-ember)] px-1 text-[10px] font-bold text-[#140e08]">{myActions.length}</span>}
                        </button>
                        <div className="myth-surface-soft hidden rounded-2xl px-4 py-2 text-right md:block">
                            <p className="text-sm font-bold text-white">{session?.name || session?.email}</p>
                            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--myth-cyan)]">{session?.role}</p>
                        </div>
                        <button onClick={handleLogout} className="myth-button myth-button-danger flex h-11 w-11 items-center justify-center rounded-2xl text-sm"><i className="fas fa-power-off"></i></button>
                    </div>
                </div>
            </header>

            <main className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
                <div className="mx-auto max-w-7xl pb-24">
                    <section className="hero-banner relative mb-10 overflow-hidden rounded-[2.4rem] p-6 sm:p-8 lg:p-10">
                        <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                        <div className="absolute inset-y-0 right-0 hidden w-[34%] bg-[radial-gradient(circle_at_center,rgba(119,195,214,0.12),transparent_65%)] lg:block"></div>
                        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
                            <div>
                                <p className="hud-chip mb-4">Command Deck</p>
                                <h2 className="myth-section-title text-5xl leading-none text-white sm:text-6xl">
                                    {greeting}, {firstName}
                                </h2>
                                <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--myth-muted)] sm:text-lg">
                                    Orchestrate incidents, permits, audits, training, and field execution from a tactical workspace built for live operational control.
                                </p>

                                <div className="mt-6 flex flex-wrap gap-3">
                                    <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm">
                                        <span className="text-[var(--myth-muted)]">Shift Status:</span>{' '}
                                        <strong className="text-white">{greeting} operations check active</strong>
                                    </div>
                                    <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm">
                                        <span className="text-[var(--myth-muted)]">Organization:</span>{' '}
                                        <strong className="text-white">{orgName}</strong>
                                    </div>
                                    <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm">
                                        <span className="text-[var(--myth-muted)]">Site Context:</span>{' '}
                                        <strong className="text-white">{activeSiteName}</strong>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-3">
                                    {myActions.length > 0 ? (
                                        <button type="button" onClick={() => setIsNotificationOpen(true)} className="myth-button myth-button-primary px-5 py-3 text-xs">
                                            {myActions.length} action{myActions.length > 1 ? 's' : ''} required
                                        </button>
                                    ) : (
                                        <span className="war-chip !bg-[rgba(18,45,31,0.48)] !text-[#8fd0aa] !border-[rgba(113,188,149,0.28)]">
                                            All systems clear
                                        </span>
                                    )}

                                    {hasFieldAppAccess && (
                                        <button
                                            type="button"
                                            onClick={() => playTransition({
                                                label: 'Opening Field Portal',
                                                action: () => navigate(`/field-portal?site=${selectedSite === 'GLOBAL' ? 'All' : selectedSite}`)
                                            })}
                                            className="myth-button myth-button-cyan px-5 py-3 text-xs"
                                        >
                                            Open Field Portal
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                <div className="myth-stat-card p-5">
                                    <p className="myth-kicker relative z-10">Modules Unlocked</p>
                                    <div className="relative z-10 mt-3 text-5xl font-black text-white">{visibleModules.length}</div>
                                    <p className="relative z-10 mt-2 text-sm text-[var(--myth-muted)]">Mission systems available in your command stack.</p>
                                </div>
                                <div className="myth-stat-card p-5">
                                    <p className="myth-kicker relative z-10">Action Queue</p>
                                    <div className="relative z-10 mt-3 text-5xl font-black text-white">{myActions.length}</div>
                                    <p className="relative z-10 mt-2 text-sm text-[var(--myth-muted)]">Items awaiting approval, CAPA closure, or direct response.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="mb-6">
                        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="myth-kicker">Operational Modules</p>
                                <h3 className="text-4xl text-white">Command Stations</h3>
                                <p className="text-sm text-[var(--myth-muted)]">
                                    Each station opens with your selected site context and live authorization state.
                                </p>
                            </div>

                            <div className="myth-surface-soft rounded-2xl px-4 py-3 text-sm text-[var(--myth-muted)] lg:hidden">
                                <label className="mr-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--myth-gold)]">Site</label>
                                <select
                                    value={selectedSite}
                                    onChange={handleSiteChange}
                                    className="min-w-[180px] bg-transparent font-bold text-white outline-none"
                                >
                                    {isGlobalAdmin && <option value="GLOBAL">Global View (All Sites)</option>}
                                    {sites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                </select>
                            </div>
                        </div>

                        {visibleModules.length === 0 ? (
                            <div className="command-panel rounded-[2rem] p-10 text-center">
                                <div className="myth-icon-frame mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl text-[var(--myth-muted)]">
                                    <i className="fas fa-lock"></i>
                                </div>
                                <p className="myth-kicker">Access Gate</p>
                                <h4 className="mt-3 text-3xl text-white">No Modules Assigned</h4>
                                <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--myth-muted)]">
                                    Your account is active, but no operational systems have been assigned yet. Request access to unlock the relevant command stations.
                                </p>
                                <button type="button" onClick={() => navigate('/users')} className="myth-button myth-button-primary mt-6 px-6 py-3 text-xs">
                                    Request Access
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                                {visibleModules.map(mod => {
                                    const modActions = myActions.filter(a => a.module === mod.id);
                                    return <NavCard key={mod.id} module={mod} actions={modActions} onClick={() => handleNavigation(mod)} />;
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </main>

            {isNotificationOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setIsNotificationOpen(false)}></div>
                    <div className="command-panel relative flex h-full w-80 flex-col border-l border-[rgba(242,201,120,0.14)] md:w-[26rem]">
                        <div className="flex items-center justify-between border-b border-[rgba(242,201,120,0.1)] px-6 py-5">
                            <div>
                                <p className="myth-kicker">Action Center</p>
                                <h2 className="mt-1 text-3xl text-white">Priority Inbox</h2>
                            </div>
                            <button onClick={() => setIsNotificationOpen(false)} className="myth-outline-button flex h-10 w-10 items-center justify-center rounded-full"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                            {myActions.map((act, i) => (
                                <button
                                    type="button"
                                    key={i}
                                    onClick={() => { setIsNotificationOpen(false); navigate(act.path); }}
                                    className="command-panel myth-hover w-full rounded-[1.5rem] p-4 text-left"
                                >
                                    <p className="myth-kicker text-[10px]">{act.module}</p>
                                    <div className="mt-3 flex items-start justify-between gap-3">
                                        <p className="text-sm font-semibold leading-snug text-white">{act.title}</p>
                                        <i className="fas fa-arrow-right mt-1 text-[var(--myth-ember)]"></i>
                                    </div>
                                </button>
                            ))}
                            {myActions.length === 0 && (
                                <div className="flex h-full flex-col items-center justify-center text-center">
                                    <div className="myth-icon-frame mb-5 flex h-16 w-16 items-center justify-center rounded-full text-[var(--myth-gold)]">
                                        <i className="fas fa-shield-check text-2xl"></i>
                                    </div>
                                    <p className="myth-kicker">Inbox Zero</p>
                                    <p className="mt-2 text-sm text-[var(--myth-muted)]">No pending actions required.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
