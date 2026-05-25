/**
 * LandingPage.jsx — Public marketing page  (route: "/")
 *
 * Design: vibrant coloured sections, floating PPE animations, Inter font.
 *
 * Sections:
 *  1.  Sticky navbar          — white
 *  2.  Hero                   — deep navy gradient + floating PPE icons
 *  3.  Stats strip            — orange gradient
 *  4.  Database portability   — sky-blue tinted
 *  5.  All EHS modules grid   — amber/warm tinted
 *  6.  Smart features         — emerald tinted
 *  7.  How it works           — indigo tinted
 *  8.  Tutorial Videos        — dark cinematic
 *  9.  Animated CTA + FAQ     — white
 *  10. Footer                 — dark navy + contact details
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

// ─── data ─────────────────────────────────────────────────────────────────────

const MODULES = [
    { icon: 'fa-triangle-exclamation', color: '#ef4444', title: 'Incident Management',    tag: 'RCA + HIRA',              desc: 'Report incidents, build 5-Why / fishbone / fault-tree, assign CAPA, and link back to risk assessments.' },
    { icon: 'fa-shield-virus',         color: '#f97316', title: 'Risk Assessment (HIRA)', tag: 'Hazard Register',         desc: 'Task-based HIRA with hazard scoring, ALARP review, revision history, and PDF export.' },
    { icon: 'fa-file-signature',       color: '#eab308', title: 'Permit to Work (PTW)',   tag: 'Permit Control',          desc: 'Full permit lifecycle — request, approve, inspect, observe, close. QR access for field workers.' },
    { icon: 'fa-lock',                 color: '#06b6d4', title: 'LOTO',                   tag: 'Isolation Safety',        desc: 'Step-by-step isolation procedures, QR tags, and field verification records for energy control.' },
    { icon: 'fa-clipboard-check',      color: '#22c55e', title: 'Inspections',             tag: 'Scheduled Checks',        desc: 'Schedule, assign, and track inspections with due-date alerts, CAPA linkage, and PDF records.' },
    { icon: 'fa-fire-extinguisher',    color: '#f59e0b', title: 'Emergency Equipment',    tag: 'Asset Readiness',         desc: 'Tag every extinguisher, AED, spill kit, and SCBA. Monthly inspection checklists with overdue alerts.' },
    { icon: 'fa-tower-broadcast',      color: '#a855f7', title: 'Emergency Response',     tag: 'Drills + Events',         desc: 'Record mock drills, lessons learned, response times, action plans, and training links.' },
    { icon: 'fa-person-chalkboard',    color: '#6366f1', title: 'Training Management',    tag: 'Competence Matrix',       desc: 'Certificates, expiry alerts, retraining triggers, contractor induction, and CAPA-linked courses.' },
    { icon: 'fa-helmet-safety',        color: '#84cc16', title: 'Contractors',             tag: 'Vendor Control',          desc: 'Register vendors, workers, documents, safety passports, induction status, and contractor incidents.' },
    { icon: 'fa-magnifying-glass-chart', color: '#0ea5e9', title: 'Audit & CAPA',         tag: 'Assurance Loop',          desc: 'Plan audits, assign findings, capture responses, verify closure across all EHS modules.' },
    { icon: 'fa-heart-pulse',          color: '#ec4899', title: 'Health Surveillance',    tag: 'Worker Health',           desc: 'Occupational health cases, vaccination, restricted access, illness records, and follow-up evidence.' },
    { icon: 'fa-chart-line',           color: '#14b8a6', title: 'Analytics & Calendar',   tag: 'Leadership View',         desc: 'Trend dashboards, exposure hours, incident rates, site filters, and monthly activity calendar.' },
    { icon: 'fa-book-bookmark',        color: '#8b5cf6', title: 'Standards & Documents',  tag: 'Compliance Register',     desc: 'Link legislation, ISO standards, and internal procedures to hazards, risks, and audit findings.' },
    { icon: 'fa-mobile-screen-button', color: '#10b981', title: 'Field Portal',           tag: 'Mobile QR Access',        desc: 'Mobile-optimised portal for scan-to-act on PTW, LOTO, equipment, inspections, and incidents.' },
    { icon: 'fa-building-user',        color: '#f43f5e', title: 'Vendor Portal',          tag: 'Contractor Self-Service', desc: 'Controlled area for contractors to view permits, upload docs, log incidents, and check worker records.' },
];

const FEATURES = [
    { icon: 'fa-brain',       color: '#8b5cf6', title: 'Smart RCA',          desc: 'Auto-generate 5-Why trees, fishbone diagrams, fault-tree analysis, and CAPA suggestions from a single incident form.' },
    { icon: 'fa-qrcode',      color: '#0ea5e9', title: 'QR Field Access',     desc: 'Every module supports QR scanning. Field teams open the right workflow instantly by scanning a tag or printed code.' },
    { icon: 'fa-file-pdf',    color: '#ef4444', title: 'Audit-ready PDFs',    desc: 'Formal PDF reports for incidents, HIRA, PTW, LOTO, equipment, audits, training, and drills — all in one click.' },
    { icon: 'fa-envelope',    color: '#f97316', title: 'Email Notifications', desc: 'Automatic email alerts for new incidents, CAPA due dates, permit status changes, and equipment expiry.' },
    { icon: 'fa-building',    color: '#06b6d4', title: 'Multi-site Control',  desc: 'Site-based access roles. Users see only their sites. Admins see everything across all locations.' },
    { icon: 'fa-link',        color: '#22c55e', title: 'Connected CAPA',      desc: 'Findings from incidents, audits, drills, inspections, and improvements feed one unified action tracker.' },
    { icon: 'fa-users',       color: '#a855f7', title: 'Role-based Access',   desc: 'Global Owner → Site Admin → HSE Officer → Supervisor → Worker. Granular module and site permissions.' },
    { icon: 'fa-bolt',        color: '#eab308', title: 'Real-time Updates',   desc: 'Live data sync across all users. Changes appear instantly — no page refresh required.' },
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
    { n: '01', icon: 'fa-database',      color: '#f97316', title: 'Configure Database',  desc: 'Open /setup and choose Firebase (free, instant) or connect your own PostgreSQL / MongoDB / REST API. No code changes.' },
    { n: '02', icon: 'fa-building',      color: '#0ea5e9', title: 'Create Organisation', desc: 'Register your company workspace. You become the Global Owner with full access to all 15+ EHS modules.' },
    { n: '03', icon: 'fa-user-plus',     color: '#22c55e', title: 'Invite Your Team',    desc: 'Share your unique join code. Approve accounts, assign roles, sites, and module access from User Management.' },
    { n: '04', icon: 'fa-rocket',        color: '#a855f7', title: 'Go Live',             desc: 'Start logging incidents, permits, inspections, and more. All data is stored in your chosen database — fully yours.' },
];

const FAQ = [
    { q: 'What EHS modules are included?',           a: '15+ integrated modules: Incidents, Risk Assessment (HIRA), Permit to Work, LOTO, Inspections, Emergency Equipment, Emergency Response, Training, Contractors, Audit & CAPA, Health Surveillance, Analytics, Standards & Documents, Field Portal, and Vendor Portal.' },
    { q: 'Which databases are supported?',            a: 'Firebase (free, instant), PostgreSQL, MongoDB, MySQL, Supabase, PocketBase, or any REST API backend — switch adapters at runtime without changing a single line of code.' },
    { q: 'Do team members need individual accounts?', a: 'Yes. After creating the workspace you become the Global Owner. Invite your team via a unique join code, then approve accounts and assign roles, sites, and module access from User Management.' },
    { q: 'Is there mobile access for field workers?', a: 'Yes — the Field Portal is a mobile-optimised web app. Workers scan a QR code to open permits, LOTO procedures, inspections, and incident reports directly on their phone. No app store download needed.' },
    { q: 'Who owns the data?',                        a: 'You do. All data is stored in your own chosen database — your Firebase project, your PostgreSQL server, or any backend you control. Nothing is stored on our servers.' },
];

const TUTORIALS = [
    {
        id: 'onboarding',
        category: 'Getting Started',
        title: 'How to Onboard an Organisation',
        desc: 'Step-by-step walkthrough: configure Firebase, create your workspace, and invite your team — all in under 5 minutes.',
        duration: '5:20',
        icon: 'fa-rocket',
        color: '#f97316',
        featured: true,
        ytId: null,
    },
    {
        id: 'firebase-setup',
        category: 'Getting Started',
        title: 'Firebase Free Database Setup',
        desc: 'Create a Firebase project, copy credentials, set security rules, and connect in the setup wizard.',
        duration: '3:45',
        icon: 'fa-database',
        color: '#fbbf24',
        featured: false,
        ytId: null,
    },
    {
        id: 'incident-reporting',
        category: 'EHS Modules',
        title: 'Incident Reporting & RCA',
        desc: 'Log an incident, auto-generate a 5-Why tree, assign CAPA, and export the formal PDF report.',
        duration: '6:10',
        icon: 'fa-triangle-exclamation',
        color: '#ef4444',
        featured: false,
        ytId: null,
    },
    {
        id: 'ptw',
        category: 'EHS Modules',
        title: 'Permit to Work Lifecycle',
        desc: 'Create, approve, inspect, and close a hot-work permit. QR access for field teams.',
        duration: '4:55',
        icon: 'fa-file-signature',
        color: '#eab308',
        featured: false,
        ytId: null,
    },
    {
        id: 'loto',
        category: 'EHS Modules',
        title: 'LOTO Isolation Procedures',
        desc: 'Build an isolation procedure, tag equipment with QR codes, and record field verification.',
        duration: '5:30',
        icon: 'fa-lock',
        color: '#06b6d4',
        featured: false,
        ytId: null,
    },
    {
        id: 'inspections',
        category: 'Operations',
        title: 'Scheduled Inspections',
        desc: 'Schedule an inspection, complete it on mobile, raise findings, and link to CAPA.',
        duration: '4:20',
        icon: 'fa-clipboard-check',
        color: '#22c55e',
        featured: false,
        ytId: null,
    },
    {
        id: 'contractors',
        category: 'Operations',
        title: 'Contractor Management',
        desc: 'Register a contractor company, onboard workers, issue safety passports, and log contractor incidents.',
        duration: '5:00',
        icon: 'fa-helmet-safety',
        color: '#84cc16',
        featured: false,
        ytId: null,
    },
    {
        id: 'audit-capa',
        category: 'Operations',
        title: 'Audit Planning & CAPA',
        desc: 'Plan a site audit, assign findings, capture responses, and verify closure with evidence.',
        duration: '4:40',
        icon: 'fa-magnifying-glass-chart',
        color: '#0ea5e9',
        featured: false,
        ytId: null,
    },
];

// ─── floating PPE icons in the hero ──────────────────────────────────────────

const PPE_ICONS = [
    { icon: 'fa-helmet-safety',        color: '#fbbf24', size: 56, top: '10%',  left:  '4%',   anim: 'a', delay: '0s'    },
    { icon: 'fa-fire-extinguisher',    color: '#f87171', size: 48, top: '8%',   right: '6%',   anim: 'b', delay: '1.2s'  },
    { icon: 'fa-shield-halved',        color: '#60a5fa', size: 52, top: '52%',  left:  '2%',   anim: 'c', delay: '0.6s'  },
    { icon: 'fa-kit-medical',          color: '#4ade80', size: 44, top: '58%',  right: '4%',   anim: 'd', delay: '1.8s'  },
    { icon: 'fa-triangle-exclamation', color: '#fb923c', size: 38, top: '28%',  left:  '9%',   anim: 'b', delay: '2.4s'  },
    { icon: 'fa-person-walking',       color: '#c084fc', size: 42, top: '32%',  right: '8%',   anim: 'a', delay: '0.9s'  },
    { icon: 'fa-eye',                  color: '#67e8f9', size: 34, top: '78%',  left:  '12%',  anim: 'd', delay: '1.5s'  },
    { icon: 'fa-bolt',                 color: '#fde047', size: 32, top: '72%',  right: '12%',  anim: 'c', delay: '3.0s'  },
    { icon: 'fa-vest-patches',         color: '#86efac', size: 36, top: '42%',  left:  '18%',  anim: 'a', delay: '2.1s'  },
    { icon: 'fa-radiation',            color: '#fca5a5', size: 30, top: '20%',  right: '18%',  anim: 'b', delay: '0.3s'  },
];

// ─── shared ───────────────────────────────────────────────────────────────────

const C = 'max-w-[1100px] w-full mx-auto px-5';

function SectionBadge({ children }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest mb-5"
            style={{ borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
            {children}
        </div>
    );
}

function LightBadge({ children }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-600 mb-5">
            {children}
        </div>
    );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function LandingPage() {
    const navigate = useNavigate();

    const [mobileMenu, setMobileMenu]       = useState(false);
    const [activeIndex, setActiveIndex]     = useState(0);
    const [btnShadow, setBtnShadow]         = useState(false);
    const [email, setEmail]                 = useState('');
    const [videoModal, setVideoModal]       = useState(null);
    const [tutorialFilter, setTutorialFilter] = useState(null);

    const toggleFaq = (i) => setActiveIndex(prev => (prev === i ? null : i));
    const scrollTo  = (id) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); setMobileMenu(false); };

    return (
        <div className="lp min-h-screen text-neutral-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* ══════════════════════════════════════════════════
                1. NAVBAR — white, sticky
            ══════════════════════════════════════════════════ */}
            <nav className="sticky top-0 z-50 bg-white/95 border-b border-neutral-100 backdrop-blur"
                style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
                <div className={`${C} h-14 flex items-center justify-between gap-4`}>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                        <img src="/we-ehs-logo.jpg" alt="OHSMS" className="h-8 w-8 rounded-lg object-cover" />
                        <span className="text-sm font-black tracking-tight text-neutral-900 hidden sm:block">
                            OHSMS <span className="text-orange-500">Enterprise</span>
                        </span>
                    </div>

                    <div className="hidden md:flex items-center gap-7 text-[13px] font-medium text-neutral-500">
                        <button onClick={() => scrollTo('modules')}      className="hover:text-orange-500 transition-colors">Modules</button>
                        <button onClick={() => scrollTo('database')}     className="hover:text-orange-500 transition-colors">Database</button>
                        <button onClick={() => scrollTo('how-it-works')} className="hover:text-orange-500 transition-colors">How it works</button>
                        <button onClick={() => scrollTo('tutorials')}    className="hover:text-orange-500 transition-colors">Tutorials</button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => navigate('/login')}
                            className="px-4 py-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors hidden sm:block">
                            Sign In
                        </button>
                        <button onClick={() => navigate('/setup')}
                            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5"
                            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 4px 12px rgba(234,88,12,0.35)' }}>
                            Create Organisation
                        </button>
                        <button onClick={() => setMobileMenu(v => !v)} className="md:hidden text-neutral-500 hover:text-neutral-900 ml-1">
                            <i className={`fas ${mobileMenu ? 'fa-xmark' : 'fa-bars'}`} />
                        </button>
                    </div>
                </div>

                {mobileMenu && (
                    <div className="md:hidden border-t border-neutral-100 bg-white px-5 py-3 space-y-1">
                        {[{ label: 'Modules', id: 'modules' }, { label: 'Database', id: 'database' }, { label: 'How it works', id: 'how-it-works' }, { label: 'Tutorials', id: 'tutorials' }].map(({ label, id }) => (
                            <button key={id} onClick={() => scrollTo(id)}
                                className="block w-full text-left text-sm text-neutral-600 hover:text-orange-500 py-2 transition-colors">{label}</button>
                        ))}
                        <button onClick={() => { navigate('/login'); setMobileMenu(false); }}
                            className="block w-full text-left text-sm text-neutral-600 hover:text-orange-500 py-2 transition-colors">Sign In</button>
                    </div>
                )}
            </nav>

            {/* ══════════════════════════════════════════════════
                2. HERO — deep navy + PPE icons
            ══════════════════════════════════════════════════ */}
            <section className="relative px-5 pt-24 pb-24 text-center overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #0c4a6e 75%, #134e4a 100%)' }}>

                {/* coloured glow blobs */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full"
                        style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)' }} />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full"
                        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)' }} />
                    <div className="absolute top-[30%] left-[40%] w-[400px] h-[400px] rounded-full"
                        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)' }} />
                </div>

                {/* ── Floating PPE icons ── */}
                {PPE_ICONS.map(({ icon, color, size, top, left, right, anim, delay }) => (
                    <div
                        key={icon + (left || right)}
                        className={`ppe-icon ${anim}`}
                        style={{ top, left, right, animationDelay: delay }}
                    >
                        <i className={`fas ${icon}`} style={{ fontSize: size, color, filter: `drop-shadow(0 0 12px ${color}66)` }} />
                    </div>
                ))}

                {/* ── Content ── */}
                <div className={`${C} relative z-10`}>
                    <SectionBadge>🛡️ Enterprise EHS Safety Management Platform</SectionBadge>

                    <h1 className="font-bold leading-[1.1] mb-6 text-white"
                        style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4rem)', letterSpacing: '-0.03em' }}>
                        Every EHS Module.<br />
                        <span style={{ background: 'linear-gradient(90deg,#fbbf24,#f97316,#fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Any Database. One Platform.
                        </span>
                    </h1>

                    <p className="text-[1.05rem] max-w-2xl mx-auto leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.72)' }}>
                        15+ integrated safety modules — incidents, permits, LOTO, audits, training, and more —
                        with <strong className="text-white">unique database portability</strong>. Connect Firebase,
                        PostgreSQL, MongoDB, or any REST API without changing a single line of code.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
                        <button onClick={() => navigate('/setup')}
                            className="font-semibold text-[0.95rem] text-white border-none cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                            style={{ padding: '14px 32px', borderRadius: '12px', background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 10px 28px rgba(234,88,12,0.5)' }}>
                            Create Free Organisation →
                        </button>
                        <button onClick={() => navigate('/login')}
                            className="font-semibold text-[0.95rem] cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                            style={{ padding: '14px 32px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                            Sign In to Existing Org
                        </button>
                        <a href="/setup"
                            className="font-semibold text-[0.95rem] no-underline transition-all duration-200 hover:-translate-y-0.5"
                            style={{ padding: '14px 32px', borderRadius: '12px', border: '1px solid rgba(6,182,212,0.4)', background: 'rgba(6,182,212,0.1)', color: '#67e8f9', display: 'inline-block' }}>
                            🗄️ Configure Database
                        </a>
                    </div>

                    {/* hero tags */}
                    <div className="flex flex-wrap justify-center gap-2">
                        {['15+ EHS Modules', 'Firebase / PostgreSQL / MongoDB', 'Real-time Updates', 'QR Field Access', 'Audit-ready PDFs', 'Multi-site Control', 'Free to Start'].map(tag => (
                            <span key={tag} className="px-3 py-1 rounded-full text-[11px] font-medium"
                                style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                3. STATS STRIP — vibrant orange gradient
            ══════════════════════════════════════════════════ */}
            <section className="py-12 px-5" style={{ background: 'linear-gradient(90deg,#ea580c,#f97316,#f59e0b)' }}>
                <div className={`${C} grid grid-cols-2 sm:grid-cols-4 gap-6 text-center`}>
                    {[
                        { value: '15+',  label: 'EHS Modules'       },
                        { value: '6',    label: 'Database Adapters'  },
                        { value: '100%', label: 'Browser-based'      },
                        { value: '∞',   label: 'Organisations'       },
                    ].map(({ value, label }) => (
                        <div key={label}>
                            <p className="text-4xl sm:text-5xl font-black text-white mb-1" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>{value}</p>
                            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.75)' }}>{label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                4. DATABASE PORTABILITY — sky-blue tinted
            ══════════════════════════════════════════════════ */}
            <section id="database" className="py-20 px-5" style={{ background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 55%,#ecfdf5 100%)' }}>
                <div className={C}>
                    <div className="text-center mb-12">
                        <LightBadge>🗄️ Database Freedom</LightBadge>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', letterSpacing: '-0.02em' }}>
                            Connect to Any Database.<br />
                            <span style={{ color: '#0891b2' }}>Zero Code Changes.</span>
                        </h2>
                        <p className="text-[0.95rem] text-neutral-500 max-w-2xl mx-auto leading-relaxed">
                            A plug-in adapter layer means you can run on Firebase today, migrate to PostgreSQL tomorrow, and switch to MongoDB next year. Your data is always yours.
                        </p>
                    </div>

                    {/* switch demo */}
                    <div className="rounded-2xl border border-sky-200 bg-white/70 p-6 mb-10 max-w-3xl mx-auto" style={{ boxShadow: '0 4px 20px rgba(14,165,233,0.08)' }}>
                        <p className="text-[0.85rem] font-semibold text-neutral-700 mb-3 text-center">Switch databases with a single environment variable</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="rounded-xl bg-white border border-sky-100 p-4">
                                <p className="text-[10px] text-sky-400 uppercase tracking-widest mb-2 font-bold">Firebase (default)</p>
                                <code className="text-xs text-orange-500 font-mono">VITE_DB_ADAPTER=firebase</code>
                            </div>
                            <div className="rounded-xl bg-white border border-sky-100 p-4">
                                <p className="text-[10px] text-sky-400 uppercase tracking-widest mb-2 font-bold">Your Own Database</p>
                                <code className="text-xs text-neutral-700 font-mono">VITE_DB_ADAPTER=rest<br />VITE_API_BASE_URL=https://your-api.com</code>
                            </div>
                        </div>
                        <p className="text-[11px] text-neutral-400 text-center mt-3">
                            Or configure at runtime — no rebuild needed — using the{' '}
                            <a href="/setup" className="text-sky-500 underline hover:text-sky-600">Database Setup Wizard</a>
                        </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {DB_OPTIONS.map(({ emoji, name, badge, desc }) => (
                            <div key={name} className="rounded-2xl bg-white border border-sky-100 p-4 text-center hover:-translate-y-1 transition-all duration-200"
                                style={{ boxShadow: '0 2px 12px rgba(14,165,233,0.07)' }}>
                                <div className="text-3xl mb-2">{emoji}</div>
                                <p className="text-sm font-bold text-neutral-900 mb-1">{name}</p>
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-600 mb-2">{badge}</span>
                                <p className="text-[10px] text-neutral-400 leading-relaxed hidden lg:block">{desc}</p>
                            </div>
                        ))}
                    </div>

                    <div className="text-center mt-8">
                        <a href="/setup" className="inline-flex items-center gap-2 font-semibold text-[0.9rem] text-white no-underline px-6 py-3 rounded-xl hover:-translate-y-0.5 transition-all"
                            style={{ background: 'linear-gradient(135deg,#0891b2,#0ea5e9)', boxShadow: '0 8px 24px rgba(14,165,233,0.35)' }}>
                            Open Database Setup Wizard →
                        </a>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                5. ALL MODULES — amber/warm tinted + PPE strip
            ══════════════════════════════════════════════════ */}
            <section id="modules" className="py-20 px-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg,#fffbeb 0%,#fef3c7 50%,#fff7ed 100%)' }}>

                {/* subtle safety-sign background element */}
                <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 text-[260px] opacity-[0.04] pointer-events-none select-none">
                    <i className="fas fa-triangle-exclamation" style={{ color: '#f59e0b' }} />
                </div>

                <div className={`${C} relative z-10`}>
                    <div className="text-center mb-12">
                        <LightBadge>🦺 15+ EHS Modules</LightBadge>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', letterSpacing: '-0.02em' }}>
                            Every Safety Workflow.<br />
                            <span style={{ color: '#d97706' }}>One Platform.</span>
                        </h2>
                        <p className="text-[0.95rem] text-neutral-500 max-w-xl mx-auto leading-relaxed">
                            From first incident report to final audit closure — every EHS process your organisation needs, connected and consistent.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                        {MODULES.map(({ icon, color, title, tag, desc }) => (
                            <div key={title} className="rounded-2xl bg-white border p-5 hover:-translate-y-1 transition-all duration-200 cursor-default"
                                style={{ borderColor: `${color}30`, boxShadow: `0 4px 16px ${color}12` }}>
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                                    style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
                                    <i className={`fas ${icon} text-base`} style={{ color }} />
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
                6. SMART FEATURES — emerald tinted
            ══════════════════════════════════════════════════ */}
            <section className="py-20 px-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 55%,#ecfdf5 100%)' }}>

                <div className="absolute left-[-60px] bottom-[-40px] text-[220px] opacity-[0.04] pointer-events-none select-none">
                    <i className="fas fa-shield-halved" style={{ color: '#22c55e' }} />
                </div>

                <div className={`${C} relative z-10`}>
                    <div className="text-center mb-12">
                        <LightBadge>✨ Smart Features</LightBadge>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', letterSpacing: '-0.02em' }}>
                            Built for Real Operations
                        </h2>
                        <p className="text-[0.95rem] text-neutral-500 max-w-xl mx-auto leading-relaxed">
                            Cross-cutting capabilities that make every module smarter and faster for your whole team.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {FEATURES.map(({ icon, color, title, desc }) => (
                            <div key={title} className="rounded-2xl bg-white border p-5 hover:-translate-y-1 transition-all duration-200"
                                style={{ borderColor: `${color}25`, boxShadow: `0 4px 16px ${color}10` }}>
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 text-lg"
                                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                                    <i className={`fas ${icon}`} style={{ color }} />
                                </div>
                                <h3 className="text-[0.9rem] font-bold text-neutral-900 mb-2">{title}</h3>
                                <p className="text-[0.8rem] text-neutral-400 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                7. HOW IT WORKS — indigo tinted with steps
            ══════════════════════════════════════════════════ */}
            <section id="how-it-works" className="py-20 px-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg,#eef2ff 0%,#dbeafe 50%,#ede9fe 100%)' }}>

                <div className="absolute right-[-40px] top-[10%] text-[200px] opacity-[0.04] pointer-events-none select-none">
                    <i className="fas fa-helmet-safety" style={{ color: '#6366f1' }} />
                </div>

                <div className={`${C} relative z-10`}>
                    <div className="text-center mb-14">
                        <LightBadge>🚀 How It Works</LightBadge>
                        <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', letterSpacing: '-0.02em' }}>
                            From Zero to Live in <span style={{ color: '#6366f1' }}>4 Steps</span>
                        </h2>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {STEPS.map(({ n, icon, color, title, desc }) => (
                            <div key={n} className="rounded-2xl bg-white border p-6 hover:-translate-y-1 transition-all duration-200 relative"
                                style={{ borderColor: `${color}25`, boxShadow: `0 4px 20px ${color}10` }}>
                                <div className="absolute top-4 right-4 text-[11px] font-black tracking-[0.2em]" style={{ color: `${color}60` }}>{n}</div>
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-xl"
                                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                                    <i className={`fas ${icon}`} style={{ color }} />
                                </div>
                                <h3 className="text-[0.95rem] font-bold text-neutral-900 mb-2 leading-tight">{title}</h3>
                                <p className="text-[0.8rem] text-neutral-500 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                8. TUTORIAL VIDEOS — dark cinematic
            ══════════════════════════════════════════════════ */}
            <section id="tutorials" className="py-20 px-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg,#0f172a 0%,#0a1628 60%,#0d1117 100%)' }}>

                {/* ambient glow orbs */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full"
                        style={{ background: 'radial-gradient(circle,rgba(249,115,22,0.08) 0%,transparent 70%)' }} />
                    <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full"
                        style={{ background: 'radial-gradient(circle,rgba(6,182,212,0.07) 0%,transparent 70%)' }} />
                    <div className="absolute top-[40%] left-[45%] w-[400px] h-[400px] rounded-full"
                        style={{ background: 'radial-gradient(circle,rgba(139,92,246,0.05) 0%,transparent 70%)' }} />
                </div>

                <div className={`${C} relative z-10`}>

                    {/* heading */}
                    <div className="text-center mb-12">
                        <SectionBadge>📹 Tutorial Videos</SectionBadge>
                        <h2 className="font-bold mb-4 text-white" style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', letterSpacing: '-0.02em' }}>
                            See OHSMS Enterprise <span style={{ color: '#f97316' }}>in Action</span>
                        </h2>
                        <p className="text-[0.95rem] max-w-2xl mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            Step-by-step video walkthroughs for every module. Follow along and get productive in minutes.
                        </p>
                    </div>

                    {/* category filter pills */}
                    <div className="flex flex-wrap justify-center gap-2 mb-10">
                        {[null, 'Getting Started', 'EHS Modules', 'Operations'].map(cat => (
                            <button key={cat || 'all'} onClick={() => setTutorialFilter(cat)}
                                className="px-5 py-2 rounded-full text-[12px] font-semibold transition-all duration-200 border"
                                style={{
                                    background:   tutorialFilter === cat ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'rgba(255,255,255,0.05)',
                                    color:        tutorialFilter === cat ? '#fff' : 'rgba(255,255,255,0.5)',
                                    borderColor:  tutorialFilter === cat ? 'transparent' : 'rgba(255,255,255,0.1)',
                                    boxShadow:    tutorialFilter === cat ? '0 4px 14px rgba(249,115,22,0.35)' : 'none',
                                }}>
                                {cat || 'All Videos'}
                            </button>
                        ))}
                    </div>

                    {/* ── Featured card ── */}
                    {TUTORIALS
                        .filter(t => !tutorialFilter || t.category === tutorialFilter)
                        .filter(t => t.featured)
                        .map(tut => (
                            <div key={tut.id}
                                className="rounded-2xl overflow-hidden mb-7 cursor-pointer group transition-all duration-300 hover:-translate-y-1"
                                style={{ border: `1px solid ${tut.color}30`, boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px ${tut.color}10` }}
                                onClick={() => setVideoModal(tut)}>
                                <div className="grid sm:grid-cols-[1.6fr_1fr]">
                                    {/* thumbnail area */}
                                    <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg,${tut.color}18,${tut.color}05)`, minHeight: '220px' }}>
                                        {/* play button */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-20 h-20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
                                                style={{ background: `${tut.color}35`, border: `2px solid ${tut.color}70`, boxShadow: `0 0 40px ${tut.color}30` }}>
                                                <i className="fas fa-play ml-1.5 text-3xl" style={{ color: tut.color }} />
                                            </div>
                                        </div>
                                        {/* badge row */}
                                        <div className="absolute top-4 left-4 flex gap-2">
                                            <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
                                                style={{ background: tut.color, color: '#fff' }}>★ Featured</span>
                                            <span className="px-3 py-1 rounded-full text-[11px] font-semibold"
                                                style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.8)' }}>
                                                <i className="fas fa-clock mr-1" />{tut.duration}
                                            </span>
                                        </div>
                                        {/* gradient fade at bottom */}
                                        <div className="absolute bottom-0 left-0 right-0 h-16"
                                            style={{ background: 'linear-gradient(transparent,rgba(0,0,0,0.45))' }} />
                                        {/* ghost icon watermark */}
                                        <div className="absolute bottom-3 right-4 text-[90px] opacity-[0.08] pointer-events-none select-none">
                                            <i className={`fas ${tut.icon}`} style={{ color: tut.color }} />
                                        </div>
                                    </div>
                                    {/* text area */}
                                    <div className="p-8 flex flex-col justify-center" style={{ background: 'rgba(255,255,255,0.025)' }}>
                                        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold mb-4 self-start"
                                            style={{ background: `${tut.color}20`, color: tut.color, border: `1px solid ${tut.color}35` }}>
                                            {tut.category}
                                        </span>
                                        <h3 className="text-[1.25rem] font-bold text-white mb-3 leading-snug">{tut.title}</h3>
                                        <p className="text-[0.85rem] leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{tut.desc}</p>
                                        <div className="flex items-center gap-3">
                                            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[0.85rem] font-semibold transition-all hover:-translate-y-0.5"
                                                style={{ background: `linear-gradient(135deg,${tut.color},${tut.color}cc)`, color: '#fff', boxShadow: `0 6px 20px ${tut.color}45` }}>
                                                <i className="fas fa-play text-[10px]" /> Watch Tutorial
                                            </button>
                                            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                <i className="fas fa-film mr-1" />Screen recording + narration
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    }

                    {/* ── Grid cards ── */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {TUTORIALS
                            .filter(t => !tutorialFilter || t.category === tutorialFilter)
                            .filter(t => !t.featured)
                            .map(tut => (
                                <div key={tut.id} onClick={() => setVideoModal(tut)}
                                    className="rounded-2xl overflow-hidden cursor-pointer group transition-all duration-200 hover:-translate-y-1.5"
                                    style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', boxShadow: '0 8px 28px rgba(0,0,0,0.35)' }}>
                                    {/* thumbnail */}
                                    <div className="relative overflow-hidden" style={{ height: '130px', background: `linear-gradient(135deg,${tut.color}18,${tut.color}05)` }}>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-12 h-12 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
                                                style={{ background: `${tut.color}30`, border: `1.5px solid ${tut.color}60`, boxShadow: `0 0 20px ${tut.color}25` }}>
                                                <i className="fas fa-play ml-0.5 text-lg" style={{ color: tut.color }} />
                                            </div>
                                        </div>
                                        <div className="absolute top-2.5 left-2.5">
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                style={{ background: `${tut.color}25`, color: tut.color, border: `1px solid ${tut.color}35` }}>
                                                {tut.category}
                                            </span>
                                        </div>
                                        <div className="absolute bottom-2 right-2.5 text-[9px] font-semibold px-2 py-0.5 rounded-full"
                                            style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)' }}>
                                            <i className="fas fa-clock mr-1" />{tut.duration}
                                        </div>
                                        <div className="absolute bottom-[-8px] right-[-8px] text-[72px] opacity-[0.07] pointer-events-none select-none">
                                            <i className={`fas ${tut.icon}`} style={{ color: tut.color }} />
                                        </div>
                                    </div>
                                    {/* card body */}
                                    <div className="p-4">
                                        <h4 className="text-[0.85rem] font-bold text-white mb-1.5 leading-snug group-hover:text-orange-400 transition-colors">{tut.title}</h4>
                                        <p className="text-[0.75rem] leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>{tut.desc}</p>
                                    </div>
                                </div>
                            ))
                        }
                    </div>

                    {/* coming soon note */}
                    <p className="text-center mt-10 text-[0.8rem]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        <i className="fas fa-film mr-2" />More tutorials being recorded ·{' '}
                        <button onClick={() => scrollTo('footer')} className="border-none bg-transparent cursor-pointer p-0 transition-colors hover:text-orange-400"
                            style={{ color: 'rgba(249,115,22,0.6)', textDecoration: 'underline', textUnderlineOffset: '3px', fontSize: 'inherit' }}>
                            Subscribe for updates
                        </button>
                    </p>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                9. CTA (animated gradient) + FAQ
            ══════════════════════════════════════════════════ */}
            <section className="py-20 max-[900px]:py-[60px] px-5 bg-white">
                <div className={C}>
                    <div className="grid grid-cols-[1.6fr_1fr] gap-[30px] items-stretch max-[900px]:grid-cols-1 max-[900px]:gap-[60px]">

                        {/* ── Left: animated gradient CTA ── */}
                        <div className="c5-animated-gradient rounded-[24px] py-20 px-10 text-white flex flex-col justify-center items-center text-center relative overflow-hidden"
                            style={{ boxShadow: '0 20px 60px rgba(249,115,22,0.25)' }}>
                            {/* large ghost helmet in bg */}
                            <div className="absolute bottom-[-20px] right-[-20px] text-[140px] opacity-10 pointer-events-none select-none">
                                <i className="fas fa-helmet-safety" />
                            </div>
                            <div className="absolute top-[-20px] left-[-20px] text-[100px] opacity-[0.08] pointer-events-none select-none">
                                <i className="fas fa-fire-extinguisher" />
                            </div>

                            <h2 className="font-normal leading-[1.1] mb-[15px] relative z-10"
                                style={{ fontSize: '3.5rem', letterSpacing: '-0.03em' }}>
                                Ready to Launch<br />Your EHS Workspace?
                            </h2>
                            <p className="text-[0.9rem] mb-[30px] font-normal opacity-85 relative z-10">
                                All 15+ modules, your database, your data — set up in under 5 minutes.
                            </p>
                            <button onClick={() => navigate('/setup')}
                                className="bg-neutral-900 text-white font-semibold cursor-pointer border-none text-[0.95rem] transition-all duration-200 hover:-translate-y-0.5 relative z-10"
                                style={{
                                    padding: '14px 32px',
                                    borderRadius: '12px',
                                    boxShadow: btnShadow ? '0 14px 30px rgba(0,0,0,0.45)' : '0 10px 20px rgba(0,0,0,0.3)',
                                }}
                                onMouseEnter={() => setBtnShadow(true)}
                                onMouseLeave={() => setBtnShadow(false)}>
                                Get Started Today
                            </button>
                        </div>

                        {/* ── Right: FAQ accordion ── */}
                        <div className="flex flex-col justify-center gap-3">
                            {FAQ.map((item, i) => {
                                const active = activeIndex === i;
                                return (
                                    <div key={i} onClick={() => toggleFaq(i)}
                                        className="bg-white cursor-pointer transition-all duration-200"
                                        style={{
                                            border: `1px solid ${active ? '#fed7aa' : '#f0f0f0'}`,
                                            borderRadius: '10px',
                                            padding: '18px 20px',
                                            boxShadow: active ? '0 4px 16px rgba(249,115,22,0.08)' : '0 2px 8px rgba(0,0,0,0.02)',
                                        }}
                                        onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = '#fed7aa'; }}
                                        onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#f0f0f0'; }}>
                                        <div className="flex justify-between items-center font-normal text-[0.9rem] text-neutral-900">
                                            <span className={active ? 'font-semibold text-orange-600' : ''}>{item.q}</span>
                                            {active
                                                ? <ChevronUp   size={20} className="flex-shrink-0 ml-3 text-orange-400" />
                                                : <ChevronDown size={20} className="flex-shrink-0 ml-3 text-neutral-400" />}
                                        </div>
                                        {active && (
                                            <p className="mt-3 text-[0.88rem] leading-[1.65]" style={{ color: '#555' }}>
                                                {item.a}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════
                10. FOOTER — dark navy
            ══════════════════════════════════════════════════ */}
            <footer id="footer" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', paddingTop: '80px', paddingBottom: '20px' }}>
                <div className={C}>

                    {/* 5-column grid */}
                    <div className="grid gap-10 mb-[60px]"
                        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>

                        {/* Logo + tagline + contact */}
                        <div style={{ gridColumn: 'span 2' }} className="max-[640px]:col-span-1">
                            <div className="flex items-center gap-2.5 mb-4">
                                <img src="/we-ehs-logo.jpg" alt="OHSMS Enterprise" className="h-7 w-7 rounded-md object-cover" />
                                <span className="font-black text-white text-[0.95rem]">OHSMS <span style={{ color: '#fb923c' }}>Enterprise</span></span>
                            </div>
                            <p className="text-[0.82rem] leading-[1.7] mb-5 max-w-[230px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                Enterprise EHS platform with full database portability. Your data, your rules, your database.
                            </p>

                            {/* Contact details */}
                            <div className="space-y-2.5">
                                <a href="tel:+7457400662" className="flex items-center gap-2.5 no-underline group">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.25)' }}>
                                        <i className="fas fa-phone text-[10px]" style={{ color: '#fb923c' }} />
                                    </div>
                                    <span className="text-[0.82rem] transition-colors group-hover:text-white" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                        +91 74574006625
                                    </span>
                                </a>
                                <a href="mailto:Sarathchandra200795@gmail.com" className="flex items-center gap-2.5 no-underline group">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)' }}>
                                        <i className="fas fa-envelope text-[10px]" style={{ color: '#67e8f9' }} />
                                    </div>
                                    <span className="text-[0.82rem] transition-colors group-hover:text-white break-all" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                        Sarathchandra200795@gmail.com
                                    </span>
                                </a>
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)' }}>
                                        <i className="fas fa-shield-halved text-[10px]" style={{ color: '#4ade80' }} />
                                    </div>
                                    <span className="text-[0.82rem]" style={{ color: 'rgba(255,255,255,0.55)' }}>ISO 45001 Compliant</span>
                                </div>
                            </div>
                        </div>

                        {/* Navigation */}
                        <div>
                            <h4 className="font-semibold mb-5 text-[0.9rem] text-white">Navigation</h4>
                            <ul className="list-none p-0 m-0 space-y-2.5">
                                {[
                                    { label: 'Modules',      id: 'modules' },
                                    { label: 'Database',     id: 'database' },
                                    { label: 'How It Works', id: 'how-it-works' },
                                    { label: 'Tutorials',    id: 'tutorials' },
                                    { label: 'FAQ',          id: 'faq' },
                                ].map(({ label, id }) => (
                                    <li key={label}>
                                        <button onClick={() => scrollTo(id)}
                                            className="text-[0.82rem] border-none bg-transparent cursor-pointer p-0 transition-colors hover:text-white"
                                            style={{ color: 'rgba(255,255,255,0.5)' }}>
                                            {label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Pages */}
                        <div>
                            <h4 className="font-semibold mb-5 text-[0.9rem] text-white">Pages</h4>
                            <ul className="list-none p-0 m-0 space-y-2.5">
                                {[
                                    { label: 'Home',         href: '/' },
                                    { label: 'Sign In',      href: '/login' },
                                    { label: 'Setup Wizard', href: '/setup' },
                                    { label: 'Field Portal', href: '/field-portal' },
                                ].map(({ label, href }) => (
                                    <li key={label}>
                                        <a href={href} className="text-[0.82rem] no-underline transition-colors hover:text-white"
                                            style={{ color: 'rgba(255,255,255,0.5)' }}>
                                            {label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Newsletter */}
                        <div>
                            <h4 className="font-semibold mb-5 text-[0.9rem] text-white">Newsletter</h4>
                            <p className="text-[0.82rem] mb-4 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                Get notified about new modules and platform updates.
                            </p>
                            <div className="flex flex-col gap-2">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="Enter your email..."
                                    className="outline-none text-[0.85rem] w-full"
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.07)',
                                        color: '#fff',
                                        backgroundColor: 'rgba(255,255,255,0.07)',
                                    }}
                                />
                                <button
                                    onClick={() => setEmail('')}
                                    className="font-semibold cursor-pointer border-none text-[0.85rem] text-white transition-all duration-200 hover:-translate-y-0.5 w-full"
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '10px',
                                        background: 'linear-gradient(135deg,#f97316,#ea580c)',
                                        boxShadow: '0 8px 20px rgba(234,88,12,0.35)',
                                    }}>
                                    Subscribe
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* PPE safety icons strip */}
                    <div className="flex flex-wrap justify-center gap-6 py-6 mb-4"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {[
                            { icon: 'fa-helmet-safety',        label: 'Hard Hat',      color: '#fbbf24' },
                            { icon: 'fa-fire-extinguisher',    label: 'Fire Safety',   color: '#f87171' },
                            { icon: 'fa-shield-halved',        label: 'Protection',    color: '#60a5fa' },
                            { icon: 'fa-kit-medical',          label: 'First Aid',     color: '#4ade80' },
                            { icon: 'fa-eye',                  label: 'Eye Safety',    color: '#67e8f9' },
                            { icon: 'fa-triangle-exclamation', label: 'Hazard',        color: '#fb923c' },
                            { icon: 'fa-vest-patches',         label: 'Hi-Vis',        color: '#86efac' },
                            { icon: 'fa-person-walking',       label: 'Site Access',   color: '#c084fc' },
                        ].map(({ icon, label, color }) => (
                            <div key={label} className="flex flex-col items-center gap-1.5 opacity-40 hover:opacity-75 transition-opacity cursor-default">
                                <i className={`fas ${icon} text-xl`} style={{ color }} />
                                <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                            </div>
                        ))}
                    </div>

                    {/* bottom bar */}
                    <div className="pt-5 pb-2 flex flex-wrap justify-between items-center gap-3 text-[0.8rem]"
                        style={{ color: 'rgba(255,255,255,0.35)' }}>
                        <span>© {new Date().getFullYear()} OHSMS Enterprise · All rights reserved</span>
                        <div className="flex items-center gap-3">
                            <a href="mailto:Sarathchandra200795@gmail.com" className="hover:text-white transition-colors no-underline" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                Sarathchandra200795@gmail.com
                            </a>
                            <span>·</span>
                            <span>Built by WE EHS Safety Tool</span>
                        </div>
                    </div>

                </div>
            </footer>

            {/* ══════════════════════════════════════════════════
                VIDEO MODAL — full-screen overlay
            ══════════════════════════════════════════════════ */}
            {videoModal && (
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
                    onClick={() => setVideoModal(null)}>
                    <div
                        className="w-full max-w-2xl rounded-2xl overflow-hidden relative"
                        style={{ border: `1px solid ${videoModal.color}30`, boxShadow: `0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px ${videoModal.color}15` }}
                        onClick={e => e.stopPropagation()}>

                        {/* if YouTube ID available, embed; otherwise show placeholder */}
                        {videoModal.ytId ? (
                            <div className="relative" style={{ paddingBottom: '56.25%' }}>
                                <iframe
                                    className="absolute inset-0 w-full h-full"
                                    src={`https://www.youtube.com/embed/${videoModal.ytId}?autoplay=1&rel=0`}
                                    title={videoModal.title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center py-16 px-8"
                                style={{ background: `linear-gradient(135deg,${videoModal.color}12,rgba(15,23,42,0.98))`, minHeight: '320px' }}>
                                {/* big icon */}
                                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
                                    style={{ background: `${videoModal.color}20`, border: `2px solid ${videoModal.color}50`, animation: 'ppe-pulse 2.5s ease-in-out infinite' }}>
                                    <i className={`fas ${videoModal.icon} text-4xl`} style={{ color: videoModal.color }} />
                                </div>
                                <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest mb-4"
                                    style={{ background: `${videoModal.color}25`, color: videoModal.color, border: `1px solid ${videoModal.color}40` }}>
                                    {videoModal.category}
                                </span>
                                <h3 className="text-xl font-bold text-white mb-3">{videoModal.title}</h3>
                                <p className="text-[0.88rem] leading-relaxed mb-6 max-w-sm" style={{ color: 'rgba(255,255,255,0.52)' }}>
                                    This tutorial is being recorded. Subscribe for updates when it goes live.
                                </p>
                                <div className="flex items-center gap-3 flex-wrap justify-center">
                                    {[
                                        { icon: 'fa-clock',  label: `${videoModal.duration} runtime` },
                                        { icon: 'fa-film',   label: 'Screen recording' },
                                        { icon: 'fa-music',  label: 'Narration + music' },
                                    ].map(({ icon, label }) => (
                                        <span key={label} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[0.8rem] font-semibold"
                                            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.09)' }}>
                                            <i className={`fas ${icon}`} /> {label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* modal info bar */}
                        <div className="px-6 py-4 flex items-center justify-between gap-4"
                            style={{ background: '#0d1117', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                            <div className="min-w-0">
                                <p className="text-[0.85rem] font-bold text-white truncate">{videoModal.title}</p>
                                <p className="text-[0.75rem] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                    <i className="fas fa-clock mr-1" />{videoModal.duration} · {videoModal.category}
                                </p>
                            </div>
                            <button onClick={() => setVideoModal(null)}
                                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer transition-all hover:bg-white/10"
                                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>
                                <i className="fas fa-xmark" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
