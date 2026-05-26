import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearFieldModuleHomeContext } from './FieldApp/portalAuth';
import { useAppTransition } from '../hooks/useAppTransition';
import { readStoredSession } from '../utils/session';

const OHS_MODULES = [
    { id: 'health-dashboard', label: 'Health Dashboard', desc: 'Occupational Health & Wellness', icon: 'fa-heart-pulse', color: 'text-rose-400' },
    { id: 'ptw', label: 'Permit to Work', desc: 'Manage PTW Lifecycle', icon: 'fa-file-signature', color: 'text-amber-400' },
    { id: 'loto', label: 'LOTO System', desc: 'Lockout Tagout Controls', icon: 'fa-lock', color: 'text-red-500' },
    { id: 'legal', label: 'Legal Register', desc: 'Statutory Compliance', icon: 'fa-gavel', color: 'text-amber-600' },
    // Changed id from 'procedures' to 'standards' to link to Standards.jsx
    { id: 'standards', label: 'Site Standards & SOPs', desc: 'Document Control & Versioning', icon: 'fa-book-open', color: 'text-indigo-400' },
    { id: 'stakeholders', label: 'Stakeholder Management', desc: 'Needs & Expectations Tracker', icon: 'fa-users-viewfinder', color: 'text-teal-400' },
    // --- NEW: Emergency Equipment ---
    { id: 'emergency-equipment', label: 'Emergency Equipment', desc: 'Fire, First Aid & Life Safety', icon: 'fa-fire-extinguisher', color: 'text-orange-500' }
];

const NavCard = ({ module, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="command-panel myth-hover group relative flex h-full min-h-[15rem] w-full flex-col overflow-hidden rounded-[1.8rem] p-6 text-left"
    >
        <div className="myth-card-glow"></div>
        <div className="relative z-10 mb-5 flex items-start justify-between gap-4">
            <div className={`myth-icon-frame flex h-14 w-14 items-center justify-center rounded-[1.15rem] text-2xl ${module.color}`}>
                <i className={`fas ${module.icon}`}></i>
            </div>
            <span className="war-chip !text-[var(--myth-muted)]">toolset</span>
        </div>

        <div className="relative z-10 mt-auto">
            <p className="myth-kicker mb-2">Operational Control</p>
            <h3 className="text-3xl text-white">{module.label}</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--myth-muted)]">{module.desc}</p>
            <div className="mt-5 flex items-center justify-between border-t border-[rgba(242,201,120,0.12)] pt-4">
                <span className={`text-xs font-bold uppercase tracking-[0.2em] ${module.color}`}>
                    Open Tool
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(242,201,120,0.14)] bg-[rgba(10,8,6,0.72)] text-[var(--myth-gold)] transition-transform group-hover:translate-x-1">
                    <i className="fas fa-arrow-right"></i>
                </span>
            </div>
        </div>
    </button>
);

export default function OhsTools() {
    const navigate = useNavigate();
    const location = useLocation();
    const playTransition = useAppTransition();
    const [session] = useState(() => {
        return readStoredSession();
    });
    const selectedSite = new URLSearchParams(location.search).get('site') || session?.assignedSite || 'GLOBAL';

    useEffect(() => {
        clearFieldModuleHomeContext();
    }, []);

    useEffect(() => {
        if (!session) {
            navigate('/');
        }
    }, [navigate, session]);

    const handleNav = (moduleId) => {
        // Navigate to respective sub-module while maintaining the site context parameter
        playTransition({
            label: `Opening ${OHS_MODULES.find((module) => module.id === moduleId)?.label || 'Tool'}`,
            action: () => navigate(`/${moduleId}?site=${selectedSite}`)
        });
    };

    if (!session) return null;

    return (
        <div className="myth-shell flex h-screen flex-col overflow-hidden bg-[var(--myth-bg)]">
            <header className="myth-topbar z-20 px-4 sm:px-6">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => playTransition({ label: 'Returning to Dashboard', action: () => navigate('/dashboard') })} className="myth-outline-button flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.18em]">
                            <i className="fas fa-arrow-left"></i> Hub
                        </button>
                        <div className="myth-icon-frame flex h-12 w-12 items-center justify-center rounded-[1.1rem] text-[var(--myth-gold)]">
                            <i className="fas fa-toolbox text-xl"></i>
                        </div>
                        <div>
                            <p className="myth-kicker">Control Arsenal</p>
                            <h1 className="text-3xl text-white">OHS Tools</h1>
                        </div>
                    </div>

                    <div className="myth-surface-soft flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white">
                        <i className="fas fa-location-dot text-[var(--myth-cyan)]"></i>
                        {selectedSite}
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto flex-1 w-full max-w-7xl overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
                <section className="hero-banner mb-8 rounded-[2.2rem] p-6 sm:p-8">
                    <img src="/safety-transition.svg" alt="" className="hero-safety-visual hidden lg:block" aria-hidden="true" />
                    <p className="hud-chip mb-4">Hazard Control Suite</p>
                    <h2 className="text-5xl text-white sm:text-6xl">Operational Controls and Compliance</h2>
                    <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--myth-muted)]">
                        Enter the specialist tools used to govern permits, isolations, legal obligations, standards, stakeholders, and emergency life-safety readiness.
                    </p>
                </section>

                <section>
                    <div className="mb-5">
                        <p className="myth-kicker">Available Toolsets</p>
                        <h3 className="text-4xl text-white">Control Stations</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {OHS_MODULES.map(module => (
                            <NavCard
                                key={module.id}
                                module={module}
                                onClick={() => handleNav(module.id)}
                            />
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}
