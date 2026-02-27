import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const OHS_MODULES = [
    { id: 'health-dashboard', label: 'Health Dashboard', desc: 'Occupational Health & Wellness', icon: 'fa-heart-pulse', color: 'text-rose-400' },
    { id: 'ptw', label: 'Permit to Work', desc: 'Manage PTW Lifecycle', icon: 'fa-file-signature', color: 'text-amber-400' },
    { id: 'loto', label: 'LOTO System', desc: 'Lockout Tagout Controls', icon: 'fa-lock', color: 'text-red-500' },
    { id: 'legal', label: 'Legal Register', desc: 'Statutory Compliance', icon: 'fa-gavel', color: 'text-amber-600' },
    // Changed id from 'procedures' to 'standards' to link to Standards.jsx
    { id: 'standards', label: 'Site Standards & SOPs', desc: 'Document Control & Versioning', icon: 'fa-book-open', color: 'text-indigo-400' },
    { id: 'stakeholders', label: 'Stakeholder Management', desc: 'Needs & Expectations Tracker', icon: 'fa-users-viewfinder', color: 'text-teal-400' }
];

const NavCard = ({ module, onClick }) => (
    <div
        onClick={onClick}
        className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 hover:border-fuchsia-400/40 p-6 rounded-2xl relative overflow-hidden group h-40 flex flex-col justify-between cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
    >
        {/* Hover Glow Effect */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(232,121,249,0.1),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

        <div className="relative z-10 flex justify-between items-start">
            <div className={`w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-lg shadow-lg ${module.color}`}>
                <i className={`fas ${module.icon}`}></i>
            </div>
        </div>

        <div className="relative z-10">
            <h3 className="text-base font-bold text-white mb-0.5 group-hover:text-fuchsia-400 transition-colors">{module.label}</h3>
            <p className="text-[10px] text-slate-400">{module.desc}</p>
        </div>
    </div>
);

export default function OhsTools() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [selectedSite, setSelectedSite] = useState('');

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) {
            navigate('/');
            return;
        }

        const sess = JSON.parse(s);
        setSession(sess);

        // Derive site context from URL or fallback to assigned site / Global
        const params = new URLSearchParams(location.search);
        const site = params.get('site') || sess.assignedSite || 'GLOBAL';
        setSelectedSite(site);
    }, [navigate, location]);

    const handleNav = (moduleId) => {
        // Navigate to respective sub-module while maintaining the site context parameter
        navigate(`/${moduleId}?site=${selectedSite}`);
    };

    if (!session) return null;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-fuchsia-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-fuchsia-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i className="fas fa-toolbox"></i>
                    </div>
                    <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">OHS Tools</h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-xs bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-fuchsia-400 font-bold flex items-center gap-2 shadow-inner">
                        <i className="fas fa-location-dot"></i> {selectedSite}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 max-w-7xl mx-auto w-full">
                <div className="mb-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
                    <h2 className="text-3xl font-bold text-white mb-2">Operational Controls & Compliance</h2>
                    <p className="text-slate-400 text-sm">Access specialized tools for hazard isolation, health monitoring, and document control.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-in fade-in duration-700 slide-in-from-bottom-8">
                    {OHS_MODULES.map(module => (
                        <NavCard
                            key={module.id}
                            module={module}
                            onClick={() => handleNav(module.id)}
                        />
                    ))}
                </div>
            </main>
        </div>
    );
}