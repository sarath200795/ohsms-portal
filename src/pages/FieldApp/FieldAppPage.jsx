import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { rtdb } from '../../config/firebase';
import FieldHeader from './components/FieldHeader';
import FieldModuleCard from './components/FieldModuleCard';
import {
    getVisibleFieldModules,
    getVisibleSites,
    isGlobalRole,
    resolveInitialSite
} from './utils';

export default function FieldAppPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [sites, setSites] = useState([]);
    const [selectedSite, setSelectedSite] = useState('All');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const rawSession = sessionStorage.getItem('isoSession');
        if (!rawSession) {
            navigate('/');
            return;
        }

        const sess = JSON.parse(rawSession);
        setSession(sess);

        const fetchFieldContext = async () => {
            try {
                const snap = await get(ref(rtdb, `organizations/${sess.orgId}/sites`));
                if (snap.exists()) {
                    setSites(
                        Object.keys(snap.val()).map((key) => ({
                            code: snap.val()[key].code || key,
                            name: snap.val()[key].name || key
                        }))
                    );
                } else {
                    setSites([]);
                }
            } catch (error) {
                console.error('Field app context load failed:', error);
                setSites([]);
            } finally {
                setLoading(false);
            }
        };

        fetchFieldContext();
    }, [navigate]);

    const visibleSites = useMemo(() => getVisibleSites(sites, session), [sites, session]);
    const visibleModules = useMemo(() => getVisibleFieldModules(session), [session]);
    const isGlobalUser = isGlobalRole(session?.role);

    useEffect(() => {
        if (!session || loading) return;
        const initialSite = resolveInitialSite({ search: location.search, session, visibleSites });
        if (initialSite) {
            setSelectedSite(initialSite);
            sessionStorage.setItem('isoCurrentSite', initialSite === 'All' ? 'GLOBAL' : initialSite);
        }
    }, [loading, location.search, session, visibleSites]);

    const activeSite = useMemo(() => {
        if (selectedSite === 'All') return { code: 'All', name: 'All Sites' };
        return visibleSites.find((site) => site.code === selectedSite) || { code: selectedSite, name: selectedSite };
    }, [selectedSite, visibleSites]);

    const firstName = session?.name?.split(' ')[0] || session?.email?.split('@')[0] || 'Team';

    const handleSiteChange = (event) => {
        const nextSite = event.target.value;
        setSelectedSite(nextSite);
        sessionStorage.setItem('isoCurrentSite', nextSite === 'All' ? 'GLOBAL' : nextSite);
    };

    const openModule = (modulePath) => {
        const siteParam = selectedSite === 'All' ? 'All' : selectedSite;
        navigate(`${modulePath}?site=${siteParam}`);
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 font-['Space_Grotesk'] text-cyan-300">
                <div className="mr-3 h-10 w-10 animate-spin rounded-full border-2 border-slate-800 border-t-cyan-400"></div>
                <span className="text-xs font-bold uppercase tracking-[0.3em]">Loading Field App</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 font-['Space_Grotesk'] text-white">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute left-[-8rem] top-[-6rem] h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl"></div>
                <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl"></div>
                <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl"></div>
            </div>

            <FieldHeader
                firstName={firstName}
                isGlobalUser={isGlobalUser}
                selectedSite={selectedSite}
                onBack={() => navigate('/dashboard')}
                onSiteChange={handleSiteChange}
                visibleSites={visibleSites}
            />

            <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
                <section className="mb-8 overflow-hidden rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl sm:p-8">
                    <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">
                                <span className="h-2 w-2 rounded-full bg-cyan-300"></span>
                                Live Site Workspace
                            </p>
                            <h2 className="mb-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                One field-ready workspace for operational safety.
                            </h2>
                            <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                                Launch inspections, permits, isolations, incidents, and emergency tools from one mobile-first screen while keeping the active site context with you.
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
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Quick Launch</p>
                                <p className="mt-2 text-sm font-bold text-white">Site-aware deep links enabled</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
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

                <section className="mb-6">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-black tracking-tight text-white">Field Modules</h3>
                            <p className="text-sm text-slate-400">Every module below opens with the selected site context.</p>
                        </div>
                    </div>

                    {visibleModules.length === 0 ? (
                        <div className="rounded-[2rem] border-2 border-dashed border-slate-800 bg-slate-900/50 p-10 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-slate-500">
                                <i className="fas fa-lock text-2xl"></i>
                            </div>
                            <h4 className="mb-2 text-lg font-black text-white">No field modules available</h4>
                            <p className="mx-auto max-w-md text-sm text-slate-400">
                                This user does not currently have access to the field operations modules. Once permissions are granted, they will appear here automatically.
                            </p>
                        </div>
                    ) : (
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
                    )}
                </section>
            </main>
        </div>
    );
}
