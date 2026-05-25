/**
 * LandingPage.jsx — Public marketing page  (route: "/")
 *
 * Sections:
 *  1. Sticky navbar
 *  2. Hero
 *  3. Stats strip
 *  4. Database portability
 *  5. All EHS modules grid
 *  6. Cross-cutting smart features
 *  7. How it works
 *  8. Create Organisation CTA → /setup wizard
 *  9. Footer
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const MODULES = [
    { icon: 'fa-triangle-exclamation', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',    title: 'Incident Management',      tag: 'RCA + HIRA',          desc: 'Report incidents, build 5-Why / fishbone / fault-tree, assign CAPA, and link back to risk assessments automatically.' },
    { icon: 'fa-shield-virus',         color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', title: 'Risk Assessment (HIRA)',   tag: 'Hazard Register',     desc: 'Create task-based HIRA records with hazard scoring, ALARP review, revision history, and PDF export.' },
    { icon: 'fa-file-signature',       color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', title: 'Permit to Work (PTW)',    tag: 'Permit Control',      desc: 'Manage permit lifecycle — request, approve, inspect, observe, close. QR access for field workers.' },
    { icon: 'fa-lock',                 color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20',   title: 'LOTO',                     tag: 'Isolation Safety',    desc: 'Generate step-by-step isolation procedures, QR tags, and field verification records for energy control.' },
    { icon: 'fa-clipboard-check',      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20', title: 'Inspections',              tag: 'Scheduled Checks',    desc: 'Schedule, assign, and track inspections with due-date alerts, CAPA linkage, and PDF completion records.' },
    { icon: 'fa-fire-extinguisher',    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20', title: 'Emergency Equipment',      tag: 'Asset Readiness',     desc: 'Tag every extinguisher, AED, spill kit, and SCBA. Monthly inspection checklists with overdue alerts.' },
    { icon: 'fa-tower-broadcast',      color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', title: 'Emergency Response',     tag: 'Drills + Events',     desc: 'Record mock drills, lessons learned, response times, action plans, and training links.' },
    { icon: 'fa-person-chalkboard',    color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20', title: 'Training Management',    tag: 'Competence Matrix',   desc: 'Maintain certificates, expiry alerts, retraining triggers, contractor induction, and CAPA-linked courses.' },
    { icon: 'fa-helmet-safety',        color: 'text-lime-400',   bg: 'bg-lime-500/10 border-lime-500/20',   title: 'Contractors',              tag: 'Vendor Control',      desc: 'Register vendors, workers, documents, safety passports, induction status, and contractor incidents.' },
    { icon: 'fa-magnifying-glass-chart', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20',    title: 'Audit & CAPA',             tag: 'Assurance Loop',      desc: 'Plan audits, assign findings, capture responses, verify closure across all EHS modules.' },
    { icon: 'fa-heart-pulse',          color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20',   title: 'Health Surveillance',      tag: 'Worker Health',       desc: 'Track occupational health cases, vaccination, restricted access, illness records, and follow-up evidence.' },
    { icon: 'fa-chart-line',           color: 'text-teal-400',   bg: 'bg-teal-500/10 border-teal-500/20',   title: 'Analytics & Calendar',     tag: 'Leadership View',     desc: 'Trend dashboards, exposure hours, incident rates, site filters, and monthly activity calendar.' },
    { icon: 'fa-book-bookmark',        color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', title: 'Standards & Documents',  tag: 'Compliance Register', desc: 'Link legislation, ISO standards, and internal procedures to hazards, risks, and audit findings.' },
    { icon: 'fa-mobile-screen-button', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', title: 'Field Portal',        tag: 'Mobile QR Access',    desc: 'Separate mobile-optimised portal for scan-to-act on PTW, LOTO, equipment, inspections, and incidents.' },
    { icon: 'fa-building-user',        color: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/20',   title: 'Vendor Portal',            tag: 'Contractor Self-Service', desc: 'Controlled area for contractors to view permits, upload docs, log incidents, and check worker records.' },
];

const FEATURES = [
    { emoji: '🧠', title: 'Smart RCA',            desc: 'Auto-generate 5-Why trees, fishbone diagrams, fault-tree analysis, and CAPA suggestions from a single incident form.' },
    { emoji: '📱', title: 'QR Field Access',       desc: 'Every module supports QR scanning. Field teams open the right workflow instantly by scanning a tag or printed code.' },
    { emoji: '📄', title: 'Audit-ready PDFs',      desc: 'Formal PDF reports for incidents, HIRA, PTW, LOTO, equipment, audits, training, and drills — all with one click.' },
    { emoji: '📧', title: 'Email Notifications',   desc: 'Automatic email alerts for new incidents, CAPA due dates, permit status changes, and equipment expiry.' },
    { emoji: '🏢', title: 'Multi-site Control',    desc: 'Site-based access roles. Users see only their sites. Admins see everything across all locations.' },
    { emoji: '🔗', title: 'Connected CAPA',        desc: 'Findings from incidents, audits, drills, inspections, and improvements feed one unified action tracker.' },
    { emoji: '👥', title: 'Role-based Access',     desc: 'Global Owner → Site Admin → HSE Officer → Supervisor → Worker. Granular module and site permissions.' },
    { emoji: '⚡', title: 'Real-time Updates',     desc: 'Live data sync across all users. Changes appear instantly — no page refresh required.' },
];

const DB_OPTIONS = [
    { emoji: '🔥', name: 'Firebase',    badge: 'Default',    color: 'border-orange-500/40 bg-orange-950/20', badgeColor: 'bg-orange-500/20 text-orange-400', desc: 'Google-managed RTDB. Free tier, real-time, no backend server needed. Best for quick start.' },
    { emoji: '🐘', name: 'PostgreSQL',  badge: 'Via REST',   color: 'border-blue-500/40 bg-blue-950/20',     badgeColor: 'bg-blue-500/20 text-blue-400',     desc: 'Production-grade SQL. Deploy on Railway, Render, or your own server.' },
    { emoji: '🍃', name: 'MongoDB',     badge: 'Via REST',   color: 'border-green-500/40 bg-green-950/20',   badgeColor: 'bg-green-500/20 text-green-400',   desc: 'Flexible document store. Schema-free migration from Firebase.' },
    { emoji: '⭐', name: 'Supabase',    badge: 'Easiest',    color: 'border-emerald-500/40 bg-emerald-950/20', badgeColor: 'bg-emerald-500/20 text-emerald-400', desc: 'Free PostgreSQL + built-in REST API. Zero backend code.' },
    { emoji: '📦', name: 'PocketBase',  badge: 'Self-host',  color: 'border-cyan-500/40 bg-cyan-950/20',     badgeColor: 'bg-cyan-500/20 text-cyan-400',     desc: 'Single binary. Download, run, done. Full control on any machine.' },
    { emoji: '🐬', name: 'MySQL',       badge: 'Via REST',   color: 'border-yellow-500/40 bg-yellow-950/20', badgeColor: 'bg-yellow-500/20 text-yellow-400', desc: 'Enterprise standard. Works with Laravel, Django, Spring Boot, etc.' },
];

const STEPS = [
    { n: '01', icon: '🗄️', title: 'Configure Your Database',  desc: 'Open /setup and choose Firebase (free, instant) or connect your own PostgreSQL / MongoDB / MySQL / REST API backend. No code changes needed.' },
    { n: '02', icon: '🏢', title: 'Create Your Organisation', desc: 'Register your company workspace below. You become the Global Owner with full access to all 15+ EHS modules.' },
    { n: '03', icon: '👥', title: 'Invite Your Team',          desc: 'Share your unique join code with team members. Approve their accounts, assign roles, sites, and module access from User Management.' },
    { n: '04', icon: '🚀', title: 'Go Live',                   desc: 'Start logging incidents, permits, inspections, and more. All data is stored in your chosen database — fully yours.' },
];

// ─── small shared ui ──────────────────────────────────────────────────────────

function SectionLabel({ children }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-cyan-400 mb-5">
            {children}
        </div>
    );
}

function inputCls(extra = '') {
    return `w-full rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500 transition-colors ${extra}`;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function LandingPage() {
    const navigate  = useNavigate();
    const createRef = useRef(null);

    const [mobileMenu, setMobileMenu] = useState(false);

    // ── render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#080705] text-white overflow-x-hidden">

            {/* subtle grid bg */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{
                backgroundImage:
                    'linear-gradient(rgba(0,255,255,.6) 1px,transparent 1px),' +
                    'linear-gradient(90deg,rgba(0,255,255,.6) 1px,transparent 1px)',
                backgroundSize: '48px 48px',
            }} />

            {/* ══════════════════════════════════════════════════
                NAVBAR
            ══════════════════════════════════════════════════ */}
            <nav className="sticky top-0 z-50 border-b border-gray-800/60 bg-[#080705]/90 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
                    {/* logo */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <img src="/we-ehs-logo.jpg" alt="WE EHS" className="h-8 w-8 rounded-lg object-cover" />
                        <span className="text-sm font-black tracking-tight text-white hidden sm:block">
                            OHSMS <span className="text-cyan-400">Enterprise</span>
                        </span>
                    </div>

                    {/* desktop nav */}
                    <div className="hidden md:flex items-center gap-6 text-[12px] font-bold uppercase tracking-widest text-gray-400">
                        <button onClick={() => document.getElementById('modules')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Modules</button>
                        <button onClick={() => document.getElementById('database')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Database</button>
                        <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">How it works</button>
                    </div>

                    {/* CTAs */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => navigate('/login')}
                            className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition-colors hidden sm:block">
                            Sign In
                        </button>
                        <button onClick={() => navigate('/setup')}
                            className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-xs font-black hover:bg-cyan-400 transition-colors">
                            Create Organisation
                        </button>
                        {/* mobile menu toggle */}
                        <button onClick={() => setMobileMenu(v => !v)} className="md:hidden text-gray-400 hover:text-white ml-1">
                            <i className={`fas ${mobileMenu ? 'fa-xmark' : 'fa-bars'}`} />
                        </button>
                    </div>
                </div>

                {/* mobile menu */}
                {mobileMenu && (
                    <div className="md:hidden border-t border-gray-800/60 bg-[#080705]/95 px-4 py-3 space-y-2">
                        {[
                            { label: 'Modules',      id: 'modules' },
                            { label: 'Database',     id: 'database' },
                            { label: 'How it works', id: 'how-it-works' },
                        ].map(({ label, id }) => (
                            <button key={id} onClick={() => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); setMobileMenu(false); }}
                                className="block w-full text-left text-sm text-gray-400 hover:text-white py-1.5 transition-colors">
                                {label}
                            </button>
                        ))}
                        <button onClick={() => { navigate('/login'); setMobileMenu(false); }}
                            className="block w-full text-left text-sm text-gray-400 hover:text-white py-1.5 transition-colors">
                            Sign In
                        </button>
                    </div>
                )}
            </nav>

            {/* ══════════════════════════════════════════════════
                HERO
            ══════════════════════════════════════════════════ */}
            <section className="relative px-4 sm:px-6 pt-20 pb-24 text-center overflow-hidden">
                {/* glow blob */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

                <div className="relative max-w-4xl mx-auto">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-cyan-400 mb-6">
                        🛡️ Enterprise EHS Safety Management Platform
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
                        Every EHS Module.<br />
                        <span style={{ background: 'linear-gradient(90deg, #22d3ee, #06b6d4, #0ea5e9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Any Database. One Platform.
                        </span>
                    </h1>

                    <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
                        15+ integrated safety modules — incidents, permits, LOTO, audits, training, and more —
                        with <strong className="text-white">unique database portability</strong>.
                        Connect Firebase, PostgreSQL, MongoDB, or any REST API without changing a single line of code.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
                        <button onClick={() => navigate('/setup')}
                            className="px-8 py-3.5 rounded-xl bg-cyan-500 text-black font-black text-sm hover:bg-cyan-400 active:bg-cyan-600 transition-all shadow-lg shadow-cyan-500/20">
                            Create Free Organisation →
                        </button>
                        <button onClick={() => navigate('/login')}
                            className="px-8 py-3.5 rounded-xl border border-gray-700 text-gray-300 font-bold text-sm hover:border-gray-500 hover:text-white transition-all">
                            Sign In to Existing Org
                        </button>
                        <a href="/setup" target="_blank" rel="noreferrer"
                            className="px-8 py-3.5 rounded-xl border border-cyan-500/30 text-cyan-400 font-bold text-sm hover:bg-cyan-500/10 transition-all">
                            🗄️ Configure Database
                        </a>
                    </div>

                    {/* hero tags */}
                    <div className="flex flex-wrap justify-center gap-2">
                        {['15+ EHS Modules', 'Firebase / PostgreSQL / MongoDB', 'Real-time Updates', 'QR Field Access', 'Audit-ready PDFs', 'Multi-site Control', 'Free to Start'].map(tag => (
                            <span key={tag} className="px-3 py-1 rounded-full border border-gray-700/60 bg-black/30 text-[11px] text-gray-400 font-semibold">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                STATS STRIP
            ══════════════════════════════════════════════════ */}
            <section className="border-y border-gray-800/60 bg-black/30 py-8 px-4 sm:px-6">
                <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                    {[
                        { value: '15+',   label: 'EHS Modules',         color: 'text-cyan-400' },
                        { value: '3',     label: 'Database Adapters',    color: 'text-orange-400' },
                        { value: '100%',  label: 'Browser-based',        color: 'text-green-400' },
                        { value: '∞',     label: 'Organisations',         color: 'text-purple-400' },
                    ].map(({ value, label, color }) => (
                        <div key={label}>
                            <p className={`text-3xl sm:text-4xl font-black ${color} mb-1`}>{value}</p>
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">{label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                DATABASE PORTABILITY
            ══════════════════════════════════════════════════ */}
            <section id="database" className="px-4 sm:px-6 py-20 max-w-7xl mx-auto">
                <div className="text-center mb-12">
                    <SectionLabel>🗄️ Database Freedom</SectionLabel>
                    <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                        Connect to Any Database.<br />
                        <span className="text-cyan-400">Zero Code Changes.</span>
                    </h2>
                    <p className="text-sm text-gray-400 max-w-2xl mx-auto leading-relaxed">
                        Most EHS software locks you into one vendor's database. OHSMS Enterprise is different —
                        a plug-in adapter layer means you can run on Firebase today, migrate to PostgreSQL tomorrow,
                        and switch to MongoDB next year. Your team never notices. Your data is always yours.
                    </p>
                </div>

                {/* how switching works */}
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-6 mb-10 max-w-3xl mx-auto">
                    <p className="text-sm font-black text-white mb-3 text-center">Switch databases with a single environment variable</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="rounded-xl bg-gray-950 border border-gray-800 p-4">
                            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Firebase (default)</p>
                            <code className="text-xs text-orange-400 font-mono">VITE_DB_ADAPTER=firebase</code>
                        </div>
                        <div className="rounded-xl bg-gray-950 border border-gray-800 p-4">
                            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Your Own Database</p>
                            <code className="text-xs text-cyan-400 font-mono">VITE_DB_ADAPTER=rest<br />VITE_API_BASE_URL=https://your-api.com</code>
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-500 text-center mt-3">Or configure at runtime — no rebuild needed — using the <a href="/setup" className="text-cyan-400 underline hover:text-cyan-300">Database Setup Wizard</a></p>
                </div>

                {/* database cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {DB_OPTIONS.map(({ emoji, name, badge, color, badgeColor, desc }) => (
                        <div key={name} className={`rounded-2xl border p-4 ${color} text-center`}>
                            <div className="text-3xl mb-2">{emoji}</div>
                            <p className="text-sm font-black text-white mb-1">{name}</p>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeColor} mb-2`}>{badge}</span>
                            <p className="text-[10px] text-gray-400 leading-relaxed hidden lg:block">{desc}</p>
                        </div>
                    ))}
                </div>

                <div className="text-center mt-8">
                    <a href="/setup"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-sm hover:bg-cyan-500/20 transition-all">
                        Open Database Setup Wizard →
                    </a>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                ALL MODULES
            ══════════════════════════════════════════════════ */}
            <section id="modules" className="px-4 sm:px-6 py-20 bg-black/20 border-y border-gray-800/40">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-12">
                        <SectionLabel>📦 15+ EHS Modules</SectionLabel>
                        <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                            Every Safety Workflow. One Platform.
                        </h2>
                        <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
                            From first incident report to final audit closure — every EHS process your organisation needs,
                            connected and consistent across all sites.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                        {MODULES.map(({ icon, color, bg, title, tag, desc }) => (
                            <div key={title} className={`rounded-2xl border p-5 ${bg} hover:scale-[1.02] transition-transform duration-200`}>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${bg} border`}>
                                    <i className={`fas ${icon} ${color}`} />
                                </div>
                                <p className={`text-[9px] font-black uppercase tracking-widest ${color} mb-1`}>{tag}</p>
                                <h3 className="text-xs font-black text-white mb-2 leading-tight">{title}</h3>
                                <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-3">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                SMART FEATURES
            ══════════════════════════════════════════════════ */}
            <section className="px-4 sm:px-6 py-20 max-w-7xl mx-auto">
                <div className="text-center mb-12">
                    <SectionLabel>✨ Smart Features</SectionLabel>
                    <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                        Built for Real Operations
                    </h2>
                    <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
                        Cross-cutting capabilities that make every module smarter and faster for your whole team.
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {FEATURES.map(({ emoji, title, desc }) => (
                        <div key={title} className="rounded-2xl border border-gray-700/60 bg-gray-900/30 p-5 hover:border-gray-600 transition-colors">
                            <div className="text-3xl mb-3">{emoji}</div>
                            <h3 className="text-sm font-black text-white mb-2">{title}</h3>
                            <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                HOW IT WORKS
            ══════════════════════════════════════════════════ */}
            <section id="how-it-works" className="px-4 sm:px-6 py-20 bg-black/20 border-y border-gray-800/40">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <SectionLabel>🚀 How It Works</SectionLabel>
                        <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                            From Zero to Live in 4 Steps
                        </h2>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {STEPS.map(({ n, icon, title, desc }) => (
                            <div key={n} className="relative">
                                <div className="rounded-2xl border border-gray-700/60 bg-gray-900/40 p-5 h-full">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="text-2xl">{icon}</span>
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500/60">{n}</span>
                                    </div>
                                    <h3 className="text-sm font-black text-white mb-2 leading-tight">{title}</h3>
                                    <p className="text-[11px] text-gray-400 leading-relaxed">{desc}</p>
                                </div>
                                {/* connector line (not on last) */}
                                {n !== '04' && (
                                    <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-gray-700 z-10" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                CREATE ORGANISATION — guided onboarding CTA
            ══════════════════════════════════════════════════ */}
            <section ref={createRef} id="create-org" className="px-4 sm:px-6 py-20 max-w-4xl mx-auto text-center">
                <SectionLabel>🚀 Get Started</SectionLabel>
                <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
                    Ready to Launch Your<br />
                    <span className="text-cyan-400">EHS Workspace?</span>
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-10 max-w-2xl mx-auto">
                    Our guided setup wizard walks you through connecting your database, uploading your logo,
                    and creating your admin account — all in one place. Takes under 5 minutes.
                </p>

                {/* 4-step visual */}
                <div className="grid sm:grid-cols-4 gap-4 mb-10">
                    {[
                        { n: '01', icon: '🗄️', title: 'Choose Database',  desc: 'Firebase or your own PostgreSQL / MongoDB / REST API' },
                        { n: '02', icon: '🔧', title: 'Configure',         desc: 'Enter credentials and test the connection in one click' },
                        { n: '03', icon: '🏢', title: 'Upload Logo',       desc: 'Brand your workspace with your organisation logo (optional)' },
                        { n: '04', icon: '👤', title: 'Create Admin',      desc: 'Set your org name, email and password — you\'re in as Global Owner' },
                    ].map(({ n, icon, title, desc }) => (
                        <div key={n} className="rounded-2xl border border-gray-800/60 bg-gray-900/30 p-5 text-left">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">{n}</span>
                                <span className="text-lg">{icon}</span>
                            </div>
                            <p className="text-sm font-black text-white mb-1">{title}</p>
                            <p className="text-[11px] text-gray-500 leading-relaxed">{desc}</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4">
                    <button
                        onClick={() => navigate('/setup')}
                        className="px-10 py-4 rounded-xl bg-cyan-500 text-black font-black text-sm hover:bg-cyan-400 active:bg-cyan-600 transition-all shadow-lg shadow-cyan-500/20"
                    >
                        Start Free Setup Wizard →
                    </button>
                    <button
                        onClick={() => navigate('/login')}
                        className="px-8 py-4 rounded-xl border border-gray-700 text-gray-300 font-bold text-sm hover:border-gray-500 hover:text-white transition-all"
                    >
                        Sign In to Existing Org
                    </button>
                </div>

                <p className="mt-5 text-[10px] text-gray-700">
                    Already configured? &nbsp;
                    <button onClick={() => navigate('/login')} className="text-gray-500 hover:text-gray-300 underline transition">Sign in directly</button>
                </p>
            </section>

            {/* ══════════════════════════════════════════════════
                FOOTER
            ══════════════════════════════════════════════════ */}
            <footer className="border-t border-gray-800/60 bg-black/30 px-4 sm:px-6 py-10">
                <div className="max-w-7xl mx-auto">
                    <div className="grid sm:grid-cols-4 gap-8 mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <img src="/we-ehs-logo.jpg" alt="WE EHS" className="h-8 w-8 rounded-lg object-cover" />
                                <span className="text-sm font-black text-white">OHSMS Enterprise</span>
                            </div>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Enterprise EHS platform with database portability.
                                Connect any database. Run anywhere.
                            </p>
                        </div>

                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Platform</p>
                            <div className="space-y-2">
                                {['Modules', 'Database Options', 'Field Portal', 'Vendor Portal'].map(l => (
                                    <p key={l} className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">{l}</p>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Get Started</p>
                            <div className="space-y-2">
                                <button onClick={() => navigate('/setup')} className="block text-xs text-gray-500 hover:text-gray-300 transition-colors">Create Organisation</button>
                                <button onClick={() => navigate('/login')} className="block text-xs text-gray-500 hover:text-gray-300 transition-colors">Sign In</button>
                                <a href="/setup" className="block text-xs text-gray-500 hover:text-gray-300 transition-colors">Configure Database</a>
                                <a href="/setup" className="block text-xs text-gray-500 hover:text-gray-300 transition-colors">Database Setup Wizard</a>
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Portals</p>
                            <div className="space-y-2">
                                <a href="/field-portal" className="block text-xs text-gray-500 hover:text-gray-300 transition-colors">Field Portal</a>
                                <a href="/vendor-portal" className="block text-xs text-gray-500 hover:text-gray-300 transition-colors">Vendor Portal</a>
                                <a href="/setup" className="block text-xs text-gray-500 hover:text-gray-300 transition-colors">Setup Wizard</a>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-800/40 pt-6 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[11px] text-gray-600">© {new Date().getFullYear()} WE EHS Safety Tool · OHSMS Enterprise</p>
                        <div className="flex items-center gap-4 text-[11px] text-gray-600">
                            <span>Powered by WE EHS Safety Tool</span>
                            <span>·</span>
                            <a href="/setup" className="hover:text-gray-400 transition-colors">Database Setup</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
