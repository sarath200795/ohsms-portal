/**
 * LandingPage.jsx — Public marketing page  (route: "/")
 *
 * Design: white / Inter, clean light theme.
 *
 * Sections:
 *  1. Sticky navbar
 *  2. Hero
 *  3. Stats strip
 *  4. Database portability
 *  5. All EHS modules grid
 *  6. Cross-cutting smart features
 *  7. How it works
 *  8. Animated gradient CTA card  +  FAQ accordion  (two-column)
 *  9. Footer (4-column: logo | nav | pages | newsletter)
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

// ─── data ─────────────────────────────────────────────────────────────────────

const MODULES = [
    { icon: 'fa-triangle-exclamation', color: '#ef4444', title: 'Incident Management',   tag: 'RCA + HIRA',           desc: 'Report incidents, build 5-Why / fishbone / fault-tree, assign CAPA, and link back to risk assessments.' },
    { icon: 'fa-shield-virus',         color: '#f97316', title: 'Risk Assessment (HIRA)', tag: 'Hazard Register',      desc: 'Task-based HIRA with hazard scoring, ALARP review, revision history, and PDF export.' },
    { icon: 'fa-file-signature',       color: '#eab308', title: 'Permit to Work (PTW)',   tag: 'Permit Control',       desc: 'Full permit lifecycle — request, approve, inspect, observe, close. QR access for field workers.' },
    { icon: 'fa-lock',                 color: '#06b6d4', title: 'LOTO',                   tag: 'Isolation Safety',     desc: 'Step-by-step isolation procedures, QR tags, and field verification records for energy control.' },
    { icon: 'fa-clipboard-check',      color: '#22c55e', title: 'Inspections',             tag: 'Scheduled Checks',     desc: 'Schedule, assign, and track inspections with due-date alerts, CAPA linkage, and PDF records.' },
    { icon: 'fa-fire-extinguisher',    color: '#f59e0b', title: 'Emergency Equipment',    tag: 'Asset Readiness',      desc: 'Tag every extinguisher, AED, spill kit, and SCBA. Monthly inspection checklists with overdue alerts.' },
    { icon: 'fa-tower-broadcast',      color: '#a855f7', title: 'Emergency Response',     tag: 'Drills + Events',      desc: 'Record mock drills, lessons learned, response times, action plans, and training links.' },
    { icon: 'fa-person-chalkboard',    color: '#6366f1', title: 'Training Management',    tag: 'Competence Matrix',    desc: 'Certificates, expiry alerts, retraining triggers, contractor induction, and CAPA-linked courses.' },
    { icon: 'fa-helmet-safety',        color: '#84cc16', title: 'Contractors',             tag: 'Vendor Control',       desc: 'Register vendors, workers, documents, safety passports, induction status, and contractor incidents.' },
    { icon: 'fa-magnifying-glass-chart', color: '#0ea5e9', title: 'Audit & CAPA',         tag: 'Assurance Loop',       desc: 'Plan audits, assign findings, capture responses, verify closure across all EHS modules.' },
    { icon: 'fa-heart-pulse',          color: '#ec4899', title: 'Health Surveillance',    tag: 'Worker Health',        desc: 'Occupational health cases, vaccination, restricted access, illness records, and follow-up evidence.' },
    { icon: 'fa-chart-line',           color: '#14b8a6', title: 'Analytics & Calendar',   tag: 'Leadership View',      desc: 'Trend dashboards, exposure hours, incident rates, site filters, and monthly activity calendar.' },
    { icon: 'fa-book-bookmark',        color: '#8b5cf6', title: 'Standards & Documents',  tag: 'Compliance Register',  desc: 'Link legislation, ISO standards, and internal procedures to hazards, risks, and audit findings.' },
    { icon: 'fa-mobile-screen-button', color: '#10b981', title: 'Field Portal',           tag: 'Mobile QR Access',     desc: 'Mobile-optimised portal for scan-to-act on PTW, LOTO, equipment, inspections, and incidents.' },
    { icon: 'fa-building-user',        color: '#f43f5e', title: 'Vendor Portal',          tag: 'Contractor Self-Service', desc: 'Controlled area for contractors to view permits, upload docs, log incidents, and check worker records.' },
];

const FEATURES = [
    { emoji: '🧠', title: 'Smart RCA',          desc: 'Auto-generate 5-Why trees, fishbone diagrams, fault-tree analysis, and CAPA suggestions from a single incident form.' },
    { emoji: '📱', title: 'QR Field Access',     desc: 'Every module supports QR scanning. Field teams open the right workflow instantly by scanning a tag or printed code.' },
    { emoji: '📄', title: 'Audit-ready PDFs',    desc: 'Formal PDF reports for incidents, HIRA, PTW, LOTO, equipment, audits, training, and drills — all in one click.' },
    { emoji: '📧', title: 'Email Notifications', desc: 'Automatic email alerts for new incidents, CAPA due dates, permit status changes, and equipment expiry.' },
    { emoji: '🏢', title: 'Multi-site Control',  desc: 'Site-based access roles. Users see only their sites. Admins see everything across all locations.' },
    { emoji: '🔗', title: 'Connected CAPA',      desc: 'Findings from incidents, audits, drills, inspections, and improvements feed one unified action tracker.' },
    { emoji: '👥', title: 'Role-based Access',   desc: 'Global Owner → Site Admin → HSE Officer → Supervisor → Worker. Granular module and site permissions.' },
    { emoji: '⚡', title: 'Real-time Updates',   desc: 'Live data sync across all users. Changes appear instantly — no page refresh required.' },
];

const DB_OPTIONS = [
    { emoji: '🔥', name: 'Firebase',   badge: 'Default',   desc: 'Google RTDB. Free tier, real-time, no backend needed.' },
    { emoji: '🐘', name: 'PostgreSQL', badge: 'Via REST',  desc: 'Production-grade SQL on Railway, Render, or your own server.' },
    { emoji: '🍃', name: 'MongoDB',    badge: 'Via REST',  desc: 'Flexible document store. Schema-free migration from Firebase.' },
    { emoji: '⭐', name: 'Supabase',   badge: 'Easiest',   desc: 'Free PostgreSQL + built-in REST API. Zero backend code.' },
    { emoji: '📦', name: 'PocketBase', badge: 'Self-host', desc: 'Single binary. Download, run, done. Full control on any machine.' },
    { emoji: '🐬', name: 'MySQL',      badge: 'Via REST',  desc: 'Enterprise standard. Works with Laravel, Django, Spring Boot.' },
];

const STEPS = [
    { n: '01', icon: '🗄️', title: 'Configure Database',   desc: 'Open /setup and choose Firebase (free, instant) or connect your own PostgreSQL / MongoDB / REST API. No code changes.' },
    { n: '02', icon: '🏢', title: 'Create Organisation',  desc: 'Register your company workspace. You become the Global Owner with full access to all 15+ EHS modules.' },
    { n: '03', icon: '👥', title: 'Invite Your Team',     desc: 'Share your unique join code. Approve accounts, assign roles, sites, and module access from User Management.' },
    { n: '04', icon: '🚀', title: 'Go Live',              desc: 'Start logging incidents, permits, inspections, and more. All data is stored in your chosen database — fully yours.' },
];

const FAQ = [
    {
        q: 'What EHS modules are included?',
        a: '15+ integrated modules: Incidents, Risk Assessment (HIRA), Permit to Work, LOTO, Inspections, Emergency Equipment, Emergency Response, Training, Contractors, Audit & CAPA, Health Surveillance, Analytics, Standards & Documents, Field Portal, and Vendor Portal.',
    },
    {
        q: 'Which databases are supported?',
        a: 'Firebase (free, instant), PostgreSQL, MongoDB, MySQL, Supabase, PocketBase, or any REST API backend — switch adapters at runtime without changing a single line of code.',
    },
    {
        q: 'Do team members need individual accounts?',
        a: 'Yes. After creating the workspace you become the Global Owner. Invite your team via a unique join code, then approve accounts and assign roles, sites, and module access from User Management.',
    },
    {
        q: 'Is there mobile access for field workers?',
        a: 'Yes — the Field Portal is a mobile-optimised web app. Workers scan a QR code to open permits, LOTO procedures, inspections, and incident reports directly on their phone. No app store download needed.',
    },
    {
        q: 'Who owns the data?',
        a: 'You do. All data is stored in your own chosen database — your Firebase project, your PostgreSQL server, or any backend you control. Nothing is stored on our servers.',
    },
];

// ─── container ────────────────────────────────────────────────────────────────
const CONTAINER = 'max-w-[1100px] w-full mx-auto px-5';

// ─── main component ───────────────────────────────────────────────────────────

export default function LandingPage() {
    const navigate = useNavigate();

    const [mobileMenu, setMobileMenu]   = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [btnShadow, setBtnShadow]     = useState(false);
    const [email, setEmail]             = useState('');

    const toggleFaq = (i) => setActiveIndex(prev => (prev === i ? null : i));

    const scrollTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        setMobileMenu(false);
    };

    // ── render ─────────────────────────────────────────────────────────────────
    return (
        <div
            className="lp min-h-screen bg-white text-neutral-900 overflow-x-hidden"
            style={{ fontFamily: "'Inter', sans-serif" }}
        >

            {/* ══════════════════════════════════════════════════
                1. NAVBAR
            ══════════════════════════════════════════════════ */}
            <nav className="sticky top-0 z-50 bg-white border-b border-neutral-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className={`${CONTAINER} h-14 flex items-center justify-between gap-4`}>
                    {/* logo */}
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                        <img src="/we-ehs-logo.jpg" alt="OHSMS" className="h-8 w-8 rounded-lg object-cover" />
                        <span className="text-sm font-black tracking-tight text-neutral-900 hidden sm:block">
                            OHSMS <span className="text-orange-500">Enterprise</span>
                        </span>
                    </div>

                    {/* desktop nav */}
                    <div className="hidden md:flex items-center gap-7 text-[13px] font-medium text-neutral-500">
                        <button onClick={() => scrollTo('modules')}  className="hover:text-neutral-900 transition-colors">Modules</button>
                        <button onClick={() => scrollTo('database')} className="hover:text-neutral-900 transition-colors">Database</button>
                        <button onClick={() => scrollTo('how-it-works')} className="hover:text-neutral-900 transition-colors">How it works</button>
                    </div>

                    {/* CTAs */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate('/login')}
                            className="px-4 py-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors hidden sm:block"
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => navigate('/setup')}
                            className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[13px] font-semibold hover:bg-neutral-700 transition-colors"
                        >
                            Create Organisation
                        </button>
                        <button onClick={() => setMobileMenu(v => !v)} className="md:hidden text-neutral-500 hover:text-neutral-900 ml-1">
                            <i className={`fas ${mobileMenu ? 'fa-xmark' : 'fa-bars'}`} />
                        </button>
                    </div>
                </div>

                {/* mobile menu */}
                {mobileMenu && (
                    <div className="md:hidden border-t border-neutral-100 bg-white px-5 py-3 space-y-1">
                        {[
                            { label: 'Modules',       id: 'modules' },
                            { label: 'Database',      id: 'database' },
                            { label: 'How it works',  id: 'how-it-works' },
                        ].map(({ label, id }) => (
                            <button key={id} onClick={() => scrollTo(id)}
                                className="block w-full text-left text-sm text-neutral-600 hover:text-neutral-900 py-2 transition-colors">
                                {label}
                            </button>
                        ))}
                        <button onClick={() => { navigate('/login'); setMobileMenu(false); }}
                            className="block w-full text-left text-sm text-neutral-600 hover:text-neutral-900 py-2 transition-colors">
                            Sign In
                        </button>
                    </div>
                )}
            </nav>

            {/* ══════════════════════════════════════════════════
                2. HERO
            ══════════════════════════════════════════════════ */}
            <section className="px-5 pt-24 pb-20 text-center">
                <div className={CONTAINER}>
                    <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-orange-600 mb-6">
                        🛡️ Enterprise EHS Safety Management Platform
                    </div>

                    <h1 className="font-bold leading-[1.1] mb-6"
                        style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', letterSpacing: '-0.03em' }}>
                        Every EHS Module.<br />
                        <span style={{
                            background: 'linear-gradient(90deg, #f97316, #ea580c)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>
                            Any Database. One Platform.
                        </span>
                    </h1>

                    <p className="text-[1.05rem] text-neutral-500 max-w-2xl mx-auto leading-relaxed mb-10">
                        15+ integrated safety modules — incidents, permits, LOTO, audits, training, and more —
                        with <strong className="text-neutral-800">unique database portability</strong>. Connect Firebase,
                        PostgreSQL, MongoDB, or any REST API without changing a single line of code.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
                        <button
                            onClick={() => navigate('/setup')}
                            className="font-semibold text-[0.95rem] text-white bg-neutral-900 border-none cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                            style={{ padding: '14px 32px', borderRadius: '12px', boxShadow: '0 10px 20px rgba(0,0,0,0.2)' }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 14px 30px rgba(0,0,0,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)'}
                        >
                            Create Free Organisation →
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            className="font-semibold text-[0.95rem] text-neutral-700 border border-neutral-200 bg-white cursor-pointer transition-all duration-200 hover:border-neutral-400 hover:-translate-y-0.5"
                            style={{ padding: '14px 32px', borderRadius: '12px' }}
                        >
                            Sign In to Existing Org
                        </button>
                        <a href="/setup"
                            className="font-semibold text-[0.95rem] text-orange-600 border border-orange-200 bg-orange-50 no-underline transition-all duration-200 hover:bg-orange-100 hover:-translate-y-0.5"
                            style={{ padding: '14px 32px', borderRadius: '12px', display: 'inline-block' }}
                        >
                            🗄️ Configure Database
                        </a>
                    </div>

                    {/* hero tags */}
                    <div className="flex flex-wrap justify-center gap-2">
                        {['15+ EHS Modules', 'Firebase / PostgreSQL / MongoDB', 'Real-time Updates', 'QR Field Access', 'Audit-ready PDFs', 'Multi-site Control', 'Free to Start'].map(tag => (
                            <span key={tag} className="px-3 py-1 rounded-full border border-neutral-200 bg-neutral-50 text-[11px] text-neutral-500 font-medium">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                3. STATS STRIP
            ══════════════════════════════════════════════════ */}
            <section className="border-y border-neutral-100 bg-neutral-50 py-10 px-5">
                <div className={`${CONTAINER} grid grid-cols-2 sm:grid-cols-4 gap-6 text-center`}>
                    {[
                        { value: '15+',  label: 'EHS Modules',      color: '#f97316' },
                        { value: '6',    label: 'Database Adapters', color: '#171717' },
                        { value: '100%', label: 'Browser-based',     color: '#171717' },
                        { value: '∞',   label: 'Organisations',      color: '#f97316' },
                    ].map(({ value, label, color }) => (
                        <div key={label}>
                            <p className="text-4xl font-black mb-1" style={{ color }}>{value}</p>
                            <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-widest">{label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                4. DATABASE PORTABILITY
            ══════════════════════════════════════════════════ */}
            <section id="database" className="py-20 px-5">
                <div className={CONTAINER}>
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-600 mb-5">
                            🗄️ Database Freedom
                        </div>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-0.02em' }}>
                            Connect to Any Database.<br />
                            <span style={{ color: '#f97316' }}>Zero Code Changes.</span>
                        </h2>
                        <p className="text-[0.95rem] text-neutral-500 max-w-2xl mx-auto leading-relaxed">
                            A plug-in adapter layer means you can run on Firebase today, migrate to PostgreSQL tomorrow,
                            and switch to MongoDB next year. Your data is always yours.
                        </p>
                    </div>

                    {/* switch demo */}
                    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6 mb-10 max-w-3xl mx-auto">
                        <p className="text-[0.85rem] font-semibold text-neutral-700 mb-3 text-center">Switch databases with a single environment variable</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="rounded-xl bg-white border border-neutral-100 p-4">
                                <p className="text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-semibold">Firebase (default)</p>
                                <code className="text-xs text-orange-500 font-mono">VITE_DB_ADAPTER=firebase</code>
                            </div>
                            <div className="rounded-xl bg-white border border-neutral-100 p-4">
                                <p className="text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-semibold">Your Own Database</p>
                                <code className="text-xs text-neutral-700 font-mono">VITE_DB_ADAPTER=rest<br />VITE_API_BASE_URL=https://your-api.com</code>
                            </div>
                        </div>
                        <p className="text-[11px] text-neutral-400 text-center mt-3">
                            Or configure at runtime — no rebuild needed — using the{' '}
                            <a href="/setup" className="text-orange-500 underline hover:text-orange-600">Database Setup Wizard</a>
                        </p>
                    </div>

                    {/* DB cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {DB_OPTIONS.map(({ emoji, name, badge, desc }) => (
                            <div key={name} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-center hover:border-neutral-300 hover:-translate-y-0.5 transition-all duration-200">
                                <div className="text-3xl mb-2">{emoji}</div>
                                <p className="text-sm font-bold text-neutral-900 mb-1">{name}</p>
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-600 mb-2">{badge}</span>
                                <p className="text-[10px] text-neutral-400 leading-relaxed hidden lg:block">{desc}</p>
                            </div>
                        ))}
                    </div>

                    <div className="text-center mt-8">
                        <a href="/setup"
                            className="inline-flex items-center gap-2 font-semibold text-[0.9rem] text-orange-600 border border-orange-200 bg-orange-50 no-underline px-6 py-3 rounded-xl hover:bg-orange-100 transition-all">
                            Open Database Setup Wizard →
                        </a>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                5. ALL MODULES
            ══════════════════════════════════════════════════ */}
            <section id="modules" className="py-20 px-5 bg-neutral-50 border-y border-neutral-100">
                <div className={CONTAINER}>
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-600 mb-5">
                            📦 15+ EHS Modules
                        </div>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-0.02em' }}>
                            Every Safety Workflow. One Platform.
                        </h2>
                        <p className="text-[0.95rem] text-neutral-500 max-w-xl mx-auto leading-relaxed">
                            From first incident report to final audit closure — every EHS process your organisation needs, connected and consistent across all sites.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                        {MODULES.map(({ icon, color, title, tag, desc }) => (
                            <div key={title} className="rounded-2xl border border-neutral-100 bg-white p-5 hover:-translate-y-0.5 hover:border-neutral-200 transition-all duration-200"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                                    <i className={`fas ${icon}`} style={{ color }} />
                                </div>
                                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color }}>{tag}</p>
                                <h3 className="text-[0.8rem] font-bold text-neutral-900 mb-2 leading-tight">{title}</h3>
                                <p className="text-[0.75rem] text-neutral-400 leading-relaxed line-clamp-3">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                6. SMART FEATURES
            ══════════════════════════════════════════════════ */}
            <section className="py-20 px-5">
                <div className={CONTAINER}>
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-600 mb-5">
                            ✨ Smart Features
                        </div>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-0.02em' }}>
                            Built for Real Operations
                        </h2>
                        <p className="text-[0.95rem] text-neutral-500 max-w-xl mx-auto leading-relaxed">
                            Cross-cutting capabilities that make every module smarter and faster for your whole team.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {FEATURES.map(({ emoji, title, desc }) => (
                            <div key={title} className="rounded-2xl border border-neutral-100 bg-white p-5 hover:-translate-y-0.5 hover:border-neutral-200 transition-all duration-200"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                                <div className="text-3xl mb-3">{emoji}</div>
                                <h3 className="text-[0.9rem] font-bold text-neutral-900 mb-2">{title}</h3>
                                <p className="text-[0.8rem] text-neutral-400 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                7. HOW IT WORKS
            ══════════════════════════════════════════════════ */}
            <section id="how-it-works" className="py-20 px-5 bg-neutral-50 border-y border-neutral-100">
                <div className={CONTAINER}>
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-600 mb-5">
                            🚀 How It Works
                        </div>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-0.02em' }}>
                            From Zero to Live in 4 Steps
                        </h2>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {STEPS.map(({ n, icon, title, desc }) => (
                            <div key={n} className="rounded-2xl border border-neutral-100 bg-white p-5 hover:-translate-y-0.5 transition-all duration-200"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-2xl">{icon}</span>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">{n}</span>
                                </div>
                                <h3 className="text-[0.9rem] font-bold text-neutral-900 mb-2 leading-tight">{title}</h3>
                                <p className="text-[0.78rem] text-neutral-400 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                8. CTA + FAQ
            ══════════════════════════════════════════════════ */}
            <main className="py-20 max-[900px]:py-[60px] px-5">
                <div className={CONTAINER}>
                    <div className="grid grid-cols-[1.6fr_1fr] gap-[30px] items-stretch max-[900px]:grid-cols-1 max-[900px]:gap-[60px]">

                        {/* ── Left: Animated Gradient CTA card ── */}
                        <div
                            className="c5-animated-gradient rounded-[24px] py-20 px-10 text-white flex flex-col justify-center items-center text-center"
                            style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
                        >
                            <h2
                                className="font-normal leading-[1.1] mb-[15px]"
                                style={{ fontSize: '3.5rem', letterSpacing: '-0.03em' }}
                            >
                                Ready to Launch<br />Your EHS Workspace?
                            </h2>
                            <p className="text-[0.9rem] mb-[30px] font-normal opacity-85">
                                All 15+ modules, your database, your data — set up in under 5 minutes.
                            </p>
                            <button
                                onClick={() => navigate('/setup')}
                                className="bg-neutral-900 text-white font-semibold cursor-pointer border-none text-[0.95rem] transition-all duration-200 hover:-translate-y-0.5"
                                style={{
                                    padding: '14px 32px',
                                    borderRadius: '12px',
                                    boxShadow: btnShadow
                                        ? '0 14px 30px rgba(0,0,0,0.4)'
                                        : '0 10px 20px rgba(0,0,0,0.3)',
                                }}
                                onMouseEnter={() => setBtnShadow(true)}
                                onMouseLeave={() => setBtnShadow(false)}
                            >
                                Get Started Today
                            </button>
                        </div>

                        {/* ── Right: FAQ accordion ── */}
                        <div className="flex flex-col justify-center gap-3">
                            {FAQ.map((item, i) => {
                                const isActive = activeIndex === i;
                                return (
                                    <div
                                        key={i}
                                        onClick={() => toggleFaq(i)}
                                        className="bg-white cursor-pointer transition-all duration-200"
                                        style={{
                                            border: `1px solid ${isActive ? '#eaeaea' : '#f0f0f0'}`,
                                            borderRadius: '10px',
                                            padding: '18px 20px',
                                            boxShadow: isActive
                                                ? '0 4px 12px rgba(0,0,0,0.04)'
                                                : '0 2px 8px rgba(0,0,0,0.02)',
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = '#eaeaea'; }}
                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = '#f0f0f0'; }}
                                    >
                                        <div className="flex justify-between items-center font-normal text-[0.9rem] text-neutral-900">
                                            <span>{item.q}</span>
                                            {isActive
                                                ? <ChevronUp size={20} className="flex-shrink-0 ml-3 text-neutral-400" />
                                                : <ChevronDown size={20} className="flex-shrink-0 ml-3 text-neutral-400" />}
                                        </div>
                                        {isActive && (
                                            <p className="mt-3 text-[0.9rem] leading-[1.6]" style={{ color: '#666' }}>
                                                {item.a}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                    </div>
                </div>
            </main>

            {/* ══════════════════════════════════════════════════
                9. FOOTER
            ══════════════════════════════════════════════════ */}
            <footer className="bg-[#fafafa] pt-20 pb-5 max-[900px]:pt-[60px]">
                <div className={CONTAINER}>

                    {/* 4-column grid */}
                    <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-10 mb-[50px] max-[900px]:grid-cols-2 max-[480px]:grid-cols-1">

                        {/* Logo + tagline */}
                        <div>
                            <img
                                src="/we-ehs-logo.jpg"
                                alt="OHSMS Enterprise"
                                className="h-6 mb-[15px] rounded object-cover"
                                style={{ filter: 'brightness(0)' }}
                            />
                            <p className="text-[0.85rem] leading-[1.6] max-w-[220px]" style={{ color: '#888' }}>
                                Enterprise EHS platform with full database portability. Your data, your rules.
                            </p>
                        </div>

                        {/* Navigation */}
                        <div>
                            <h4 className="font-semibold mb-5 text-[0.95rem] text-neutral-900">Navigation</h4>
                            <ul className="list-none p-0 m-0">
                                {['Features', 'Database', 'Modules', 'How It Works'].map(label => (
                                    <li key={label} className="mb-3">
                                        <button
                                            onClick={() => scrollTo(label.toLowerCase().replace(/\s+/g, '-').replace('features', 'modules').replace('how-it-works', 'how-it-works').replace('modules', 'modules').replace('database', 'database'))}
                                            className="text-[0.85rem] no-underline transition-colors duration-200 hover:text-neutral-900 border-none bg-transparent cursor-pointer p-0"
                                            style={{ color: '#888' }}
                                        >
                                            {label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Pages */}
                        <div>
                            <h4 className="font-semibold mb-5 text-[0.95rem] text-neutral-900">Pages</h4>
                            <ul className="list-none p-0 m-0">
                                {[
                                    { label: 'Home',         href: '/' },
                                    { label: 'Sign In',      href: '/login' },
                                    { label: 'Setup Wizard', href: '/setup' },
                                ].map(({ label, href }) => (
                                    <li key={label} className="mb-3">
                                        <a href={href} className="text-[0.85rem] no-underline transition-colors duration-200 hover:text-neutral-900"
                                            style={{ color: '#888' }}>
                                            {label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Newsletter */}
                        <div>
                            <h4 className="font-semibold mb-5 text-[0.95rem] text-neutral-900">Newsletter</h4>
                            <p className="text-[0.85rem] mb-[15px]" style={{ color: '#888' }}>
                                Join our newsletter and get notified about new modules and updates.
                            </p>
                            <div className="flex gap-[10px]">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="Enter your email..."
                                    className="flex-grow border border-[#f0f0f0] bg-white outline-none transition-colors duration-200 focus:border-[#ccc] text-[0.9rem]"
                                    style={{
                                        padding: '12px 16px',
                                        borderRadius: '10px',
                                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
                                        /* override global dark input styles */
                                        backgroundColor: '#ffffff',
                                        color: '#171717',
                                    }}
                                />
                                <button
                                    className="bg-neutral-900 text-white border-none font-semibold cursor-pointer transition-all duration-200 hover:-translate-y-0.5 text-[0.9rem] flex-shrink-0"
                                    style={{
                                        padding: '12px 28px',
                                        borderRadius: '10px',
                                        boxShadow: '0 12px 24px rgba(0,0,0,0.4)',
                                    }}
                                    onClick={() => { setEmail(''); }}
                                >
                                    Subscribe
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* Bottom bar */}
                    <div className="border-t border-[#f0f0f0] pt-[25px] pb-[10px] flex justify-between text-[0.85rem] max-[480px]:flex-col max-[480px]:gap-[15px] max-[480px]:items-center"
                        style={{ color: '#888' }}>
                        <span>All rights reserved. © {new Date().getFullYear()} OHSMS Enterprise</span>
                        <span>Built by WE EHS Safety Tool</span>
                    </div>

                </div>
            </footer>

        </div>
    );
}
