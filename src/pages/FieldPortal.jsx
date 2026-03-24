import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    FIELD_PORTAL_SESSION_KEY,
    buildFieldPortalAuthErrorMessage,
    fetchFieldPortalContext,
    getFieldPortalFirebase,
    readFieldPortalSession
} from './FieldApp/portalAuth';
import {
    getVisibleFieldModules,
    getVisibleSites,
    isGlobalRole,
    resolveFieldQrNavigation,
    resolveInitialSite
} from './FieldApp/utils';

const { fieldAuth, fieldDb } = getFieldPortalFirebase();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export default function FieldPortal() {
    const navigate = useNavigate();
    const location = useLocation();

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

    const syncMainSession = (sessionData, targetSite) => {
        sessionStorage.setItem('isoSession', JSON.stringify(sessionData));
        sessionStorage.setItem('isoCurrentSite', targetSite === 'All' ? 'GLOBAL' : targetSite);
    };

    const resetPortalState = (clearForm = false) => {
        setIsAuthenticated(false);
        setPortalSession(null);
        setSites([]);
        setSelectedSite('All');
        if (clearForm) {
            setLoginData({ email: '', password: '' });
        }
    };

    const finalizePortalContext = ({ sessionData, orgSites, showAlert = false }) => {
        const allowedSites = getVisibleSites(orgSites, sessionData);
        const resolvedSite = resolveInitialSite({ search: location.search, session: sessionData, visibleSites: allowedSites });

        setPortalSession(sessionData);
        setSites(orgSites);
        setSelectedSite(resolvedSite || 'All');
        setIsAuthenticated(true);
        setLoginData((prev) => ({ ...prev, email: normalizeEmail(sessionData.email) }));
        sessionStorage.setItem(FIELD_PORTAL_SESSION_KEY, JSON.stringify(sessionData));

        if (showAlert) {
            alert('Field portal login successful.');
        }
    };

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
                        fieldDb,
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
    }, [location.search]);

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
            const context = await fetchFieldPortalContext({ fieldDb, user: userCredential.user });

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
        syncMainSession(portalSession, selectedSite);
        const siteParam = selectedSite === 'All' ? 'All' : selectedSite;
        navigate(`${modulePath}?site=${siteParam}`);
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
        syncMainSession(portalSession, nextSite);
        navigate(target.path);
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 font-['Space_Grotesk'] text-cyan-300">
                <div className="mr-3 h-10 w-10 animate-spin rounded-full border-2 border-slate-800 border-t-cyan-400"></div>
                <span className="text-xs font-bold uppercase tracking-[0.3em]">Verifying Field Access</span>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen overflow-hidden bg-slate-950 font-['Space_Grotesk'] text-white">
                <div className="pointer-events-none fixed inset-0 overflow-hidden">
                    <div className="absolute left-[-6rem] top-[-4rem] h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl"></div>
                    <div className="absolute bottom-[-8rem] right-[-4rem] h-80 w-80 rounded-full bg-orange-500/10 blur-3xl"></div>
                </div>

                <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
                    <div className="w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
                        <div className="mb-8 text-center">
                            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-cyan-500/20 bg-cyan-500/10 text-3xl text-cyan-300 shadow-xl">
                                <i className="fas fa-mobile-screen-button"></i>
                            </div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300">Standalone Portal</p>
                            <h1 className="text-3xl font-black tracking-tight text-white">Field Portal</h1>
                            <p className="mt-3 text-sm leading-relaxed text-slate-400">
                                Secure field access for inspections, permits, isolations, incidents, and emergency tools.
                            </p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Email</label>
                                <input
                                    type="email"
                                    value={loginData.email}
                                    onChange={(event) => setLoginData((prev) => ({ ...prev, email: event.target.value }))}
                                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none transition-colors focus:border-cyan-500"
                                    placeholder="you@company.com"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Password</label>
                                <input
                                    type="password"
                                    value={loginData.password}
                                    onChange={(event) => setLoginData((prev) => ({ ...prev, password: event.target.value }))}
                                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none transition-colors focus:border-cyan-500"
                                    placeholder="Enter your employee password"
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-[11px] leading-relaxed text-slate-400">
                                Use the same employee email and password that you use for the main WE EHS workspace. Your field module permissions are applied automatically after sign-in.
                            </div>

                            <button
                                type="submit"
                                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3.5 text-sm font-black uppercase tracking-[0.25em] text-slate-950 transition-colors hover:bg-cyan-400"
                            >
                                <i className="fas fa-right-to-bracket"></i>
                                Access Field Portal
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    const firstName = portalSession?.name?.split(' ')[0] || portalSession?.email?.split('@')[0] || 'Team';
    const activeSite = selectedSite === 'All'
        ? { code: 'All', name: 'All Sites' }
        : visibleSites.find((site) => site.code === selectedSite) || { code: selectedSite, name: selectedSite };

    return (
        <div className="min-h-screen bg-slate-950 font-['Space_Grotesk'] text-white">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute left-[-8rem] top-[-6rem] h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl"></div>
                <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl"></div>
                <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl"></div>
            </div>

            <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-cyan-300">
                            <i className="fas fa-mobile-screen-button"></i>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">Field Portal</p>
                            <h1 className="text-lg font-black tracking-tight text-white sm:text-xl">Site Operations for {firstName}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                                Site
                            </label>
                            <select
                                value={selectedSite}
                                onChange={handleSiteChange}
                                className="min-w-[140px] bg-transparent text-sm font-bold text-white outline-none"
                            >
                                {isGlobalUser && <option value="All" className="bg-slate-900">All Sites</option>}
                                {visibleSites.map((site) => (
                                    <option key={site.code} value={site.code} className="bg-slate-900">
                                        {site.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={() => setScannerOpen(true)}
                            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 transition-colors hover:bg-cyan-500 hover:text-slate-950"
                            title="Scan QR"
                        >
                            <i className="fas fa-qrcode"></i>
                        </button>

                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500 hover:text-white"
                        >
                            <i className="fas fa-power-off"></i>
                        </button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
                <section className="mb-8 overflow-hidden rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl sm:p-8">
                    <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">
                                <span className="h-2 w-2 rounded-full bg-cyan-300"></span>
                                Hosted Field Workspace
                            </p>
                            <h2 className="mb-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                Separate access for operational teams in the field.
                            </h2>
                            <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                                Open the same live safety modules from a dedicated field portal without going through the enterprise dashboard.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Modules</p>
                                <p className="mt-2 text-2xl font-black text-white">{visibleModules.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Active Site</p>
                                <p className="mt-2 text-sm font-bold text-white">{activeSite.name}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:col-span-1 col-span-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Session</p>
                                <p className="mt-2 text-sm font-bold text-white">Standalone portal auth</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => setScannerOpen(true)}
                            className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-left transition-colors hover:bg-cyan-500 hover:text-slate-950"
                        >
                            <div className="mb-2 text-sm font-black text-cyan-300">Scan Any QR</div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">PTW, LOTO, equipment</div>
                        </button>
                        {visibleModules.slice(0, 3).map((module) => (
                            <button
                                key={module.id}
                                type="button"
                                onClick={() => openModule(module.path)}
                                className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-left transition-colors hover:border-slate-700 hover:bg-slate-900"
                            >
                                <div className={`mb-2 text-sm font-black ${module.accent}`}>{module.label}</div>
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{module.actionLabel}</div>
                            </button>
                        ))}
                    </div>
                </section>

                <section>
                    <div className="mb-4">
                        <h3 className="text-xl font-black tracking-tight text-white">Field Modules</h3>
                        <p className="text-sm text-slate-400">Every module opens with the current site selection and field portal session.</p>
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
