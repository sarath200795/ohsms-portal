import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    browserSessionPersistence,
    onAuthStateChanged,
    setPersistence,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import FieldModuleCard from './FieldApp/components/FieldModuleCard';
import FieldQrScannerModal from './FieldApp/components/FieldQrScannerModal';
import {
    clearFieldModuleHomeContext,
    FIELD_PORTAL_SESSION_KEY,
    buildFieldPortalAuthErrorMessage,
    fetchFieldPortalContext,
    getFieldPortalFirebase,
    readFieldPortalSession,
    setFieldModuleHomeContext
} from './FieldApp/portalAuth';
import {
    getVisibleFieldModules,
    getVisibleSites,
    isGlobalRole,
    resolveFieldQrNavigation,
    resolveInitialSite
} from './FieldApp/utils';
import { useAppTransition } from '../hooks/useAppTransition';

const { fieldAuth } = getFieldPortalFirebase();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const getDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

export default function FieldPortal() {
    const navigate = useNavigate();
    const location = useLocation();
    const playTransition = useAppTransition();

    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [portalSession, setPortalSession] = useState(null);
    const [sites, setSites] = useState([]);
    const [selectedSite, setSelectedSite] = useState('All');
    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [scannerOpen, setScannerOpen] = useState(false);
    const manualLoginRef = useRef(false);

    const visibleSites = useMemo(() => getVisibleSites(sites, portalSession), [sites, portalSession]);
    const visibleModules = useMemo(() => getVisibleFieldModules(portalSession), [portalSession]);
    const isGlobalUser = isGlobalRole(portalSession?.role);

    const syncMainSession = useCallback((sessionData, targetSite) => {
        sessionStorage.setItem('isoSession', JSON.stringify(sessionData));
        sessionStorage.setItem('isoCurrentSite', targetSite === 'All' ? 'GLOBAL' : targetSite);
    }, []);

    const resetPortalState = (clearForm = false) => {
        setIsAuthenticated(false);
        setPortalSession(null);
        setSites([]);
        setSelectedSite('All');
        if (clearForm) {
            setLoginData({ email: '', password: '' });
        }
    };

    const finalizePortalContext = useCallback(({ sessionData, orgSites, showAlert = false }) => {
        const allowedSites = getVisibleSites(orgSites, sessionData);
        const resolvedSite = resolveInitialSite({ search: location.search, session: sessionData, visibleSites: allowedSites });
        const redirectPath = new URLSearchParams(location.search).get('redirect');
        const redirectParams = redirectPath ? new URLSearchParams(redirectPath.split('?')[1] || '') : null;
        const redirectSite = redirectParams?.get('site');
        const targetSite = redirectSite || resolvedSite || 'All';

        setPortalSession(sessionData);
        setSites(orgSites);
        setSelectedSite(targetSite);
        setIsAuthenticated(true);
        setLoginData((prev) => ({ ...prev, email: normalizeEmail(sessionData.email) }));
        sessionStorage.setItem(FIELD_PORTAL_SESSION_KEY, JSON.stringify(sessionData));
        setFieldModuleHomeContext('field-portal');
        syncMainSession(sessionData, targetSite);

        if (showAlert) {
            alert('Field portal login successful.');
        }

        if (redirectPath && redirectPath.startsWith('/')) {
            playTransition({
                label: 'Opening Requested Workspace',
                action: () => navigate(redirectPath, { replace: true })
            });
        }
    }, [location.search, navigate, playTransition, syncMainSession]);

    useEffect(() => {
        let cancelled = false;
        let unsubscribe = () => {};

        const init = async () => {
            try {
                await setPersistence(fieldAuth, browserSessionPersistence);
            } catch (error) {
                console.warn('Field portal auth persistence setup failed.', error);
            }

            unsubscribe = onAuthStateChanged(fieldAuth, async (user) => {
                if (cancelled || manualLoginRef.current) return;

                const storedSession = readFieldPortalSession();

                if (!user) {
                    sessionStorage.removeItem(FIELD_PORTAL_SESSION_KEY);
                    resetPortalState(false);
                    setLoading(false);
                    return;
                }

                try {
                    const context = await fetchFieldPortalContext({
                        user,
                        expectedOrgId: storedSession?.orgId || ''
                    });

                    finalizePortalContext({
                        sessionData: context.sessionData,
                        orgSites: context.sites,
                        showAlert: false
                    });
                } catch (error) {
                    console.error('Field portal restore failed:', error);
                    sessionStorage.removeItem(FIELD_PORTAL_SESSION_KEY);
                    resetPortalState(false);
                    await signOut(fieldAuth).catch(() => {});
                    alert(error.message || 'Failed to restore field portal session.');
                } finally {
                    setLoading(false);
                }
            });

            if (cancelled) unsubscribe();
        };

        init();

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [finalizePortalContext, location.search]);

    useEffect(() => {
        if (!portalSession) return undefined;

        const syncSharedPortalContext = () => {
            const nextSite = resolveInitialSite({
                search: location.search,
                session: portalSession,
                visibleSites
            }) || 'All';

            setSelectedSite((currentSite) => (currentSite === nextSite ? currentSite : nextSite));
            syncMainSession(portalSession, nextSite);
        };

        syncSharedPortalContext();
        window.addEventListener('focus', syncSharedPortalContext);
        window.addEventListener('pageshow', syncSharedPortalContext);

        return () => {
            window.removeEventListener('focus', syncSharedPortalContext);
            window.removeEventListener('pageshow', syncSharedPortalContext);
        };
    }, [location.search, portalSession, syncMainSession, visibleSites]);

    const handleLogin = async (event) => {
        event.preventDefault();

        const cleanEmail = normalizeEmail(loginData.email);
        const password = loginData.password;

        if (!cleanEmail || !password) {
            alert('Please enter your email and password.');
            return;
        }

        setLoading(true);

        try {
            manualLoginRef.current = true;
            const userCredential = await signInWithEmailAndPassword(fieldAuth, cleanEmail, password);
            const context = await fetchFieldPortalContext({ user: userCredential.user });

            finalizePortalContext({
                sessionData: context.sessionData,
                orgSites: context.sites,
                showAlert: true
            });
        } catch (error) {
            console.error('Field portal sign-in failed:', error);
            alert(buildFieldPortalAuthErrorMessage(error));
        } finally {
            manualLoginRef.current = false;
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        const rawMainSession = sessionStorage.getItem('isoSession');
        if (rawMainSession) {
            try {
                const parsedMainSession = JSON.parse(rawMainSession);
                if (parsedMainSession?.uid === portalSession?.uid) {
                    sessionStorage.removeItem('isoSession');
                }
            } catch {
                sessionStorage.removeItem('isoSession');
            }
        }

        sessionStorage.removeItem(FIELD_PORTAL_SESSION_KEY);
        clearFieldModuleHomeContext();
        resetPortalState(true);
        setLoading(false);
        await signOut(fieldAuth).catch(() => {});
    };

    const handleSiteChange = (event) => {
        const nextSite = event.target.value;
        setSelectedSite(nextSite);
        sessionStorage.setItem('isoCurrentSite', nextSite === 'All' ? 'GLOBAL' : nextSite);
    };

    const openModule = (modulePath) => {
        if (!portalSession) return;
        setFieldModuleHomeContext('field-portal');
        syncMainSession(portalSession, selectedSite);
        const siteParam = selectedSite === 'All' ? 'All' : selectedSite;
        playTransition({
            label: 'Opening Field Module',
            action: () => navigate(`${modulePath}?site=${siteParam}`)
        });
    };

    const handleQrDetected = (decodedText) => {
        if (!portalSession) return;

        const target = resolveFieldQrNavigation({ decodedText, fallbackSite: selectedSite });
        if (!target) {
            setScannerOpen(false);
            alert('Unsupported QR code. Scan a PTW, LOTO, or emergency equipment tag.');
            return;
        }

        if (!visibleModules.some((module) => module.id === target.moduleId)) {
            setScannerOpen(false);
            alert('You do not have access to this field module.');
            return;
        }

        const nextSite = target.site || selectedSite;
        setSelectedSite(nextSite);
        setScannerOpen(false);
        setFieldModuleHomeContext('field-portal');
        syncMainSession(portalSession, nextSite);
        playTransition({
            label: 'Opening Scanned Record',
            action: () => navigate(target.path)
        });
    };

    if (loading) {
        return (
            <div className="myth-shell flex h-screen items-center justify-center bg-[var(--myth-bg)] text-[var(--myth-ink)]">
                <div className="command-panel flex items-center gap-4 rounded-[1.8rem] px-8 py-6">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-[rgba(242,201,120,0.12)] border-t-[var(--myth-cyan)]"></div>
                    <span className="myth-kicker">Verifying Field Access</span>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="myth-shell min-h-screen overflow-hidden bg-[var(--myth-bg)] text-[var(--myth-ink)]">
                <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
                    <div className="grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                        <section className="hero-banner flex flex-col justify-between rounded-[2.2rem] p-8 lg:p-10">
                            <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                            <div>
                                <p className="hud-chip mb-5">Standalone Portal</p>
                                <h1 className="text-6xl text-white sm:text-7xl">Field Command</h1>
                                <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--myth-muted)] sm:text-lg">
                                    Separate operational access for mobile teams executing inspections, permits, isolations, incidents, and emergency tasks in live site conditions.
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="command-panel rounded-[1.5rem] p-5">
                                    <p className="myth-kicker">Rapid Entry</p>
                                    <h3 className="mt-2 text-3xl text-white">Scan QR</h3>
                                    <p className="mt-2 text-sm text-[var(--myth-muted)]">Jump straight into PTW, LOTO, or equipment tasks.</p>
                                </div>
                                <div className="command-panel rounded-[1.5rem] p-5">
                                    <p className="myth-kicker">Field Ready</p>
                                    <h3 className="mt-2 text-3xl text-white">Operate</h3>
                                    <p className="mt-2 text-sm text-[var(--myth-muted)]">Use the same live records without the enterprise dashboard.</p>
                                </div>
                                <div className="command-panel rounded-[1.5rem] p-5">
                                    <p className="myth-kicker">Secure Role Sync</p>
                                    <h3 className="mt-2 text-3xl text-white">Auth Bridge</h3>
                                    <p className="mt-2 text-sm text-[var(--myth-muted)]">Permissions follow the employee account automatically.</p>
                                </div>
                            </div>
                        </section>

                        <section className="command-panel rounded-[2.2rem] p-8 shadow-2xl">
                            <div className="mb-8 text-center">
                                <div className="myth-icon-frame mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.75rem] text-3xl text-[var(--myth-cyan)] shadow-xl">
                                    <i className="fas fa-mobile-screen-button"></i>
                                </div>
                                <p className="myth-kicker mb-2">Portal Authentication</p>
                                <h2 className="text-5xl text-white">Field Portal</h2>
                                <p className="mt-3 text-sm leading-relaxed text-[var(--myth-muted)]">
                                    Secure field access for inspections, permits, isolations, incidents, and emergency tools.
                                </p>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="myth-kicker mb-2 block text-[10px]">Email</label>
                                <input
                                    type="email"
                                    value={loginData.email}
                                    onChange={(event) => setLoginData((prev) => ({ ...prev, email: event.target.value }))}
                                    className="w-full rounded-2xl border px-4 py-3 text-white outline-none transition-colors"
                                    placeholder="you@company.com"
                                />
                            </div>

                            <div>
                                <label className="myth-kicker mb-2 block text-[10px]">Password</label>
                                <input
                                    type="password"
                                    value={loginData.password}
                                    onChange={(event) => setLoginData((prev) => ({ ...prev, password: event.target.value }))}
                                    className="w-full rounded-2xl border px-4 py-3 text-white outline-none transition-colors"
                                    placeholder="Enter your employee password"
                                />
                            </div>

                            <div className="myth-surface-soft rounded-2xl p-4 text-[11px] leading-relaxed text-[var(--myth-muted)]">
                                Use the same employee email and password that you use for the main WE EHS workspace. Your field module permissions are applied automatically after sign-in.
                            </div>

                            <button
                                type="submit"
                                className="myth-button myth-button-cyan flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm"
                            >
                                <i className="fas fa-right-to-bracket"></i>
                                Access Field Portal
                            </button>
                        </form>
                        </section>
                    </div>
                </div>
            </div>
        );
    }

    const firstName = portalSession?.name?.split(' ')[0] || portalSession?.email?.split('@')[0] || 'Team';
    const activeSite = selectedSite === 'All'
        ? { code: 'All', name: 'All Sites' }
        : visibleSites.find((site) => site.code === selectedSite) || { code: selectedSite, name: selectedSite };
    const greeting = getDayGreeting();

    return (
        <div className="myth-shell min-h-screen bg-[var(--myth-bg)] text-[var(--myth-ink)]">
            <header className="myth-topbar sticky top-0 z-30">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="myth-outline-button flex h-11 w-11 items-center justify-center rounded-2xl"
                            title="Back to Field Portal Login"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div className="myth-icon-frame flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--myth-cyan)]">
                            <i className="fas fa-mobile-screen-button"></i>
                        </div>
                        <div>
                            <p className="myth-kicker">Field Portal</p>
                            <h1 className="text-3xl text-white sm:text-[2.15rem]">Site Operations for {firstName}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="myth-surface-soft rounded-2xl px-3 py-2">
                            <label className="myth-kicker mb-1 block text-[10px]">
                                Site
                            </label>
                            <select
                                value={selectedSite}
                                onChange={handleSiteChange}
                                className="min-w-[140px] bg-transparent text-sm font-bold text-white outline-none"
                            >
                                {isGlobalUser && <option value="All">All Sites</option>}
                                {visibleSites.map((site) => (
                                    <option key={site.code} value={site.code}>
                                        {site.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={() => setScannerOpen(true)}
                            className="myth-button myth-button-cyan flex h-11 w-11 items-center justify-center rounded-2xl"
                            title="Scan QR"
                        >
                            <i className="fas fa-qrcode"></i>
                        </button>

                        <button
                            type="button"
                            onClick={handleLogout}
                            className="myth-button myth-button-danger flex h-11 w-11 items-center justify-center rounded-2xl"
                        >
                            <i className="fas fa-power-off"></i>
                        </button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
                <section className="hero-banner mb-8 overflow-hidden rounded-[2.2rem] p-6 sm:p-8">
                    <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                    <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="hud-chip mb-3">
                                <span className="h-2 w-2 rounded-full bg-[var(--myth-cyan)]"></span>
                                Hosted Field Workspace
                            </p>
                            <h2 className="mb-3 text-5xl tracking-tight text-white sm:text-6xl">{greeting}, {firstName}</h2>
                            <p className="max-w-xl text-sm leading-relaxed text-[var(--myth-muted)] sm:text-base">
                                Open the same live safety modules from a dedicated field portal without going through the enterprise dashboard.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div className="myth-stat-card p-4">
                                <p className="myth-kicker relative z-10 text-[10px]">Modules</p>
                                <p className="mt-2 text-2xl font-black text-white">{visibleModules.length}</p>
                            </div>
                            <div className="myth-stat-card p-4">
                                <p className="myth-kicker relative z-10 text-[10px]">Active Site</p>
                                <p className="mt-2 text-sm font-bold text-white">{activeSite.name}</p>
                            </div>
                            <div className="myth-stat-card col-span-2 p-4 sm:col-span-1">
                                <p className="myth-kicker relative z-10 text-[10px]">Session</p>
                                <p className="mt-2 text-sm font-bold text-white">Standalone portal auth</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => setScannerOpen(true)}
                            className="myth-button myth-button-cyan rounded-2xl px-4 py-3 text-left"
                        >
                            <div className="mb-2 text-sm font-black">Scan Any QR</div>
                            <div className="text-xs uppercase tracking-[0.2em] text-[#081114]">PTW, LOTO, equipment</div>
                        </button>
                        {visibleModules.slice(0, 3).map((module) => (
                            <button
                                key={module.id}
                                type="button"
                                onClick={() => openModule(module.path)}
                                className="myth-surface-soft rounded-2xl px-4 py-3 text-left transition-colors hover:border-[rgba(242,201,120,0.35)]"
                            >
                                <div className={`mb-2 text-sm font-black ${module.accent}`}>{module.label}</div>
                                {module.entryBadge && (
                                    <div className={`mb-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.22em] ${module.entryBadgeClass || 'border-[rgba(242,201,120,0.14)] text-[var(--myth-gold)] bg-[rgba(8,7,5,0.55)]'}`}>
                                        {module.entryIcon && <i className={`fas ${module.entryIcon}`}></i>}
                                        <span>{module.entryBadge}</span>
                                    </div>
                                )}
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--myth-muted)]">{module.actionLabel}</div>
                                {module.fieldHint && (
                                    <div className="mt-2 text-[11px] leading-relaxed text-[var(--myth-ink)]">
                                        {module.fieldHint}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </section>

                <section>
                    <div className="mb-4">
                        <p className="myth-kicker">Field Modules</p>
                        <h3 className="text-4xl tracking-tight text-white">Operational Stations</h3>
                        <p className="text-sm text-[var(--myth-muted)]">Every module opens with the current site selection and field portal session.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleModules.map((module) => (
                            <FieldModuleCard
                                key={module.id}
                                module={module}
                                onOpen={() => openModule(module.path)}
                                siteLabel={activeSite.code || activeSite.name}
                            />
                        ))}
                    </div>
                </section>
            </main>

            <FieldQrScannerModal
                isOpen={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onDetected={handleQrDetected}
            />
        </div>
    );
}
