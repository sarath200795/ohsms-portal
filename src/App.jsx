import { Suspense, lazy, useEffect, useRef } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  FileCheck2,
  Lock,
  ClipboardList,
  Wrench,
  GraduationCap,
  HardHat,
  SearchCheck,
  Siren,
  FireExtinguisher,
  TrendingUp,
  MessagesSquare,
  HeartPulse,
  QrCode,
  Database,
  Users,
  BadgeCheck,
  MousePointerClick,
} from 'lucide-react';

const Scene = lazy(() => import('./Scene.jsx'));

function Reveal({ className = '', children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-visible')),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

const MODULES = [
  { icon: AlertTriangle, label: 'Incidents' },
  { icon: ShieldAlert, label: 'Risk Assessments' },
  { icon: FileCheck2, label: 'Permit to Work' },
  { icon: Lock, label: 'LOTO' },
  { icon: ClipboardList, label: 'Audits' },
  { icon: Wrench, label: 'CAPA' },
  { icon: GraduationCap, label: 'Training' },
  { icon: HardHat, label: 'Contractors' },
  { icon: SearchCheck, label: 'Inspections' },
  { icon: Siren, label: 'Mock Drills' },
  { icon: FireExtinguisher, label: 'Emergency Equipment' },
  { icon: TrendingUp, label: 'Improvements' },
  { icon: MessagesSquare, label: 'Consultations' },
  { icon: HeartPulse, label: 'Occupational Health' },
];

const PILLARS = [
  {
    icon: AlertTriangle,
    title: 'Report & Resolve',
    text: 'Incidents and hazards flow in from any device — even a QR scan in the field — and drive investigations, root causes and CAPA to closure.',
  },
  {
    icon: ShieldAlert,
    title: 'Assess & Control',
    text: 'Risk assessments, permits to work and LOTO procedures keep high-risk work planned, authorized and locked down before it starts.',
  },
  {
    icon: BadgeCheck,
    title: 'Prove & Improve',
    text: 'Audits, inspections, drills and training records stay live and audit-ready — evidence for ISO 45001 without the spreadsheet chase.',
  },
];

const STATS = [
  { value: '14', label: 'Integrated HSE modules' },
  { value: '3', label: 'Roles with site-scoped access' },
  { value: '1 QR', label: 'From field report to dashboard' },
  { value: '100%', label: 'Realtime, multi-site records' },
];

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>

      <div className="content-layer">
        {/* Nav */}
        <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-night/70 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6" aria-label="Main">
            <a href="#top" className="flex items-center gap-2.5">
              <img src="/we-ehs-logo.jpg" alt="" className="size-9 rounded-lg object-cover" />
              <span className="text-lg leading-tight font-extrabold text-white">
                WE EHS
                <span className="block text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                  OHSMS Suite
                </span>
              </span>
            </a>
            <div className="hidden items-center gap-6 text-sm font-semibold text-slate-300 md:flex">
              <a href="#suite" className="transition-colors hover:text-white">The Suite</a>
              <a href="#modules" className="transition-colors hover:text-white">Modules</a>
              <a href="#launch" className="transition-colors hover:text-white">Launch</a>
            </div>
            <a
              href="#launch"
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-primary-deep"
            >
              Get started <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </nav>
        </header>

        {/* Hero */}
        <section id="top" className="flex min-h-dvh items-center">
          <div className="mx-auto w-full max-w-7xl px-4 pt-24 pb-16 sm:px-6">
            <div className="max-w-2xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold tracking-widest text-slate-200 uppercase">
                <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
                WE EHS Suite Launch
              </p>
              <h1 className="text-5xl leading-[1.05] font-extrabold text-white sm:text-6xl lg:text-7xl">
                Safety,
                <span
                  className="block text-transparent"
                  style={{
                    backgroundImage: 'linear-gradient(90deg,#60a5fa,#34d399)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                  }}
                >
                  unified.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-300 sm:text-xl">
                The WE EHS Suite brings your entire occupational health & safety management system —
                14 modules, every site, every worker — into one living, breathing platform.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <a
                  href="#suite"
                  className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg bg-primary px-7 py-3 text-base font-semibold text-white shadow-lg shadow-primary/30 transition-colors duration-150 hover:bg-primary-deep"
                >
                  Explore the suite <ArrowRight className="size-4" aria-hidden="true" />
                </a>
                <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                  <MousePointerClick className="size-4" aria-hidden="true" />
                  Move, scroll and click — the scene responds
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section id="suite" className="scroll-mt-20 bg-gradient-to-b from-transparent via-night/80 to-night">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">One suite. Three promises.</h2>
              <p className="mt-3 text-lg text-slate-400">
                Everything a modern OHSMS must do — connected end to end.
              </p>
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {PILLARS.map((p) => (
                <Reveal
                  key={p.title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur transition-colors duration-200 hover:border-primary/60 hover:bg-primary/10"
                >
                  <span className="inline-flex rounded-xl bg-primary/20 p-3 text-blue-300" aria-hidden="true">
                    <p.icon className="size-6" />
                  </span>
                  <h3 className="mt-4 text-xl font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-slate-400">{p.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Modules */}
        <section id="modules" className="scroll-mt-20 bg-night">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Fourteen modules, day one</h2>
              <p className="mt-3 text-lg text-slate-400">
                Every register your HSE team keeps — already built, already connected.
              </p>
            </Reveal>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {MODULES.map((m) => (
                <Reveal
                  key={m.label}
                  className="flex flex-col items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-center transition-colors duration-200 hover:border-accent/60 hover:bg-accent/10"
                >
                  <m.icon className="size-6 text-blue-300" aria-hidden="true" />
                  <span className="text-sm font-semibold text-slate-200">{m.label}</span>
                </Reveal>
              ))}
            </div>

            <div className="mt-16 grid gap-6 lg:grid-cols-3">
              <Reveal className="rounded-2xl border border-white/10 bg-white/5 p-7">
                <QrCode className="size-6 text-gold" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-white">QR field reporting</h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  Workers scan a site code and report hazards in under a minute — no app, no login.
                </p>
              </Reveal>
              <Reveal className="rounded-2xl border border-white/10 bg-white/5 p-7">
                <Users className="size-6 text-gold" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-white">Role & site scoped</h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  Global owners, site owners and workers each see exactly what they should — nothing more.
                </p>
              </Reveal>
              <Reveal className="rounded-2xl border border-white/10 bg-white/5 p-7">
                <Database className="size-6 text-gold" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-white">Your data, your database</h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  Runs on your own Firebase or REST backend, switchable at runtime — no vendor lock-in.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-y border-white/10 bg-night-soft">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-14 sm:px-6 lg:grid-cols-4">
            {STATS.map((s) => (
              <Reveal key={s.label} className="text-center">
                <p className="text-4xl font-extrabold text-white tabular-nums">{s.value}</p>
                <p className="mt-1.5 text-sm text-slate-400">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Launch CTA */}
        <section id="launch" className="scroll-mt-20 bg-night">
          <div className="mx-auto max-w-4xl px-4 py-28 text-center sm:px-6">
            <Reveal>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-bold tracking-widest text-emerald-300 uppercase">
                Now launching
              </p>
              <h2 className="text-4xl font-extrabold text-white sm:text-5xl">
                Every worker home safe.
                <span className="block text-slate-400">Every record audit-ready.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400">
                Be first in line as the WE EHS Suite rolls out. Bring your sites, your teams and
                your standards — we bring everything else.
              </p>
              <div className="mt-9 flex justify-center gap-3">
                <a
                  href="mailto:sarath200795@gmail.com?subject=WE%20EHS%20Suite%20—%20Early%20access"
                  className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg bg-accent px-7 py-3 text-base font-semibold text-white shadow-lg shadow-accent/30 transition-colors duration-150 hover:bg-emerald-700"
                >
                  Request early access <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            </Reveal>
          </div>
          <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-500">
            WE EHS — Occupational Health & Safety Management System · Built for multi-site enterprises
          </footer>
        </section>
      </div>
    </>
  );
}
