import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { dbGet } from '../../services/db/index.js';
import FieldHeader from './components/FieldHeader';
import FieldModuleCard from './components/FieldModuleCard';
import { clearFieldModuleHomeContext, setFieldModuleHomeContext } from './portalAuth';
import { readStoredSession } from '../../utils/session';
import {
    getVisibleFieldModules,
    getVisibleSites,
    isGlobalRole,
    resolveInitialSite
} from './utils';
import { useAppTransition } from '../../hooks/useAppTransition';

const getDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

export default function FieldAppPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const playTransition = useAppTransition();

    const [session, setSession] = useState(null);
    const [sites, setSites] = useState([]);
    const [selectedSite, setSelectedSite] = useState('All');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) {
            navigate('/');
            return;
        }
        setSession(sess);

        const fetchFieldContext = async () => {
            try {
                const snap = await dbGet(`organizations/${sess.orgId}/sites`);
                if (snap !== null) {
                    setSites(
                        Object.keys(snap).map((key) => ({
                            code: snap[key].code || key,
                            name: snap[key].name || key
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
    const greeting = getDayGreeting();

    const handleSiteChange = (event) => {
        const nextSite = event.target.value;
        setSelectedSite(nextSite);
        sessionStorage.setItem('isoCurrentSite', nextSite === 'All' ? 'GLOBAL' : nextSite);
    };

    const openModule = (modulePath) => {
        const siteParam = selectedSite === 'All' ? 'All' : selectedSite;
        setFieldModuleHomeContext('field-app');
        playTransition({
            label: 'Opening Field Module',
            action: () => navigate(`${modulePath}?site=${siteParam}`)
        });
    };

    if (loading) {
        return (
            <div className="myth-shell flex h-screen items-center justify-center bg-[var(--myth-bg)] text-[var(--myth-ink)]">
                <div className="command-panel flex items-center gap-4 rounded-[1.8rem] px-8 py-6">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-[rgba(242,201,120,0.12)] border-t-[var(--myth-cyan)]"></div>
                    <span className="myth-kicker">Loading Field App</span>
                </div>
            </div>
        );
    }

    return (
        <div className="myth-shell min-h-screen bg-[var(--myth-bg)] text-[var(--myth-ink)]">

            <FieldHeader
                firstName={firstName}
                isGlobalUser={isGlobalUser}
                selectedSite={selectedSite}
                onBack={() => {
                    clearFieldModuleHomeContext();
                    playTransition({
                        label: 'Returning to Dashboard',
                        action: () => navigate('/dashboard')
                    });
                }}
                onSiteChange={handleSiteChange}
                visibleSites={visibleSites}
            />

            <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
                <section className="hero-banner mb-8 overflow-hidden rounded-[2.2rem] p-6 sm:p-8">
                    <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                    <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="hud-chip mb-3">
                                <span className="h-2 w-2 rounded-full bg-[var(--myth-cyan)]"></span>
                                Live Site Workspace
                            </p>
                            <h2 className="mb-3 text-5xl tracking-tight text-white sm:text-6xl">
                                {greeting}, {firstName}
                            </h2>
                            <p className="max-w-xl text-sm leading-relaxed text-[var(--myth-muted)] sm:text-base">
                                Launch inspections, permits, isolations, incidents, and emergency tools from one mobile-first screen while keeping the active site context with you.
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
                                <p className="myth-kicker relative z-10 text-[10px]">Quick Launch</p>
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
                                className="myth-surface-soft rounded-2xl px-4 py-3 text-left transition-colors hover:border-[rgba(242,201,120,0.35)]"
                            >
                                <div className={`mb-2 text-sm font-black ${module.accent}`}>{module.label}</div>
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--myth-muted)]">{module.actionLabel}</div>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="mb-6">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <p className="myth-kicker">Field Modules</p>
                            <h3 className="text-4xl tracking-tight text-white">Operational Stations</h3>
                            <p className="text-sm text-[var(--myth-muted)]">Every module below opens with the selected site context.</p>
                        </div>
                    </div>

                    {visibleModules.length === 0 ? (
                        <div className="command-panel rounded-[2rem] p-10 text-center">
                            <div className="myth-icon-frame mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-[var(--myth-muted)]">
                                <i className="fas fa-lock text-2xl"></i>
                            </div>
                            <h4 className="mb-2 text-3xl text-white">No field modules available</h4>
                            <p className="mx-auto max-w-md text-sm text-[var(--myth-muted)]">
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
