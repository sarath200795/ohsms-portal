import { Suspense, lazy, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  QrCode,
  Database,
  Users,
  BadgeCheck,
  Award,
  FileSearch,
} from 'lucide-react';
import { MODULES } from '../modules/registry.js';
import { Button } from '../components/ui.jsx';

const SafetyScene = lazy(() => import('../components/three/SafetyScene.jsx'));

/** Reveal-on-scroll for direct children — subtle fade per design system. */
function Reveal({ as = 'div', className = '', children, ...props }) {
  const Tag = as;
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
    <Tag ref={ref} className={`reveal ${className}`} {...props}>
      {children}
    </Tag>
  );
}

const TRUST_POINTS = [
  { icon: BadgeCheck, label: 'ISO 45001 aligned' },
  { icon: ShieldCheck, label: 'Role-based access control' },
  { icon: Database, label: 'Bring your own database' },
  { icon: Award, label: 'Audit-ready records' },
];

const STATS = [
  { value: '14', label: 'Integrated HSE modules' },
  { value: '3', label: 'Access roles, site-scoped' },
  { value: '100%', label: 'Realtime, multi-tenant' },
  { value: '1 QR', label: 'From field to dashboard' },
];

const STEPS = [
  {
    icon: Database,
    title: 'Connect your database',
    text: 'Use our Firebase setup or point the portal at your own backend at runtime — no redeploy needed.',
  },
  {
    icon: Users,
    title: 'Invite your team',
    text: 'Global owners, site owners and workers each see exactly the modules and sites they need.',
  },
  {
    icon: FileSearch,
    title: 'Run your OHSMS',
    text: 'Incidents, risk, permits, audits and training flow into one live, audit-ready system.',
  },
];

export default function Landing() {
  return (
    <div className="bg-night text-slate-100">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-night/85 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6" aria-label="Main">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/we-ehs-logo.jpg" alt="" className="size-9 rounded-lg object-cover" />
            <span className="text-lg leading-tight font-extrabold text-white">
              WE EHS
              <span className="block text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                OHSMS Suite
              </span>
            </span>
          </Link>
          <div className="hidden items-center gap-6 text-sm font-semibold text-slate-300 md:flex">
            <a href="#modules" className="transition-colors hover:text-white">
              Modules
            </a>
            <a href="#how" className="transition-colors hover:text-white">
              How it works
            </a>
            <a href="#field" className="transition-colors hover:text-white">
              Field Portal
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
                Sign in
              </Button>
            </Link>
            <Link to="/login">
              <Button>
                Launch portal <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero with interactive 3D scene */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 50% at 70% 40%, rgba(37,99,235,0.25) 0%, rgba(11,18,32,0) 70%)',
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold tracking-wide text-slate-200 uppercase">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
              WE EHS Suite Launch
            </p>
            <h1 className="text-4xl leading-tight font-extrabold text-white sm:text-5xl">
              Every worker home safe.
              <span className="block text-transparent" style={{ backgroundImage: 'linear-gradient(90deg,#60a5fa,#34d399)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
                Every record audit-ready.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              WE EHS unifies your entire occupational health & safety management system — incident
              reporting, risk assessment, permits to work, audits, training and 10 more modules — in
              one realtime, multi-site portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login">
                <Button className="px-6 py-3 text-base">
                  Launch portal <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </Link>
              <a href="#modules">
                <Button variant="ghost" className="border border-white/15 px-6 py-3 text-base text-slate-200 hover:bg-white/10 hover:text-white">
                  Explore modules
                </Button>
              </a>
            </div>
            <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TRUST_POINTS.map((t) => (
                <li key={t.label} className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <t.icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  {t.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative h-80 sm:h-96 lg:h-[30rem]" aria-hidden="false">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Loading 3D scene…
                </div>
              }
            >
              <SafetyScene />
            </Suspense>
            <p className="pointer-events-none absolute right-0 bottom-0 left-0 text-center text-[11px] text-slate-500">
              Move your cursor — the safety core follows.
            </p>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="border-y border-white/10 bg-night-soft">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {STATS.map((s) => (
            <Reveal key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-white tabular-nums">{s.value}</p>
              <p className="mt-1 text-sm text-slate-400">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Modules grid */}
      <section id="modules" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold text-white">One suite. Fourteen modules.</h2>
          <p className="mt-3 text-slate-400">
            Everything your HSE team runs today — connected, site-scoped and permission-aware out of
            the box.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MODULES.map((m) => (
            <Reveal
              key={m.id}
              className="group rounded-xl border border-white/10 bg-white/5 p-5 transition-colors duration-200 hover:border-primary/60 hover:bg-primary/10"
            >
              <span className="inline-flex rounded-lg bg-primary/20 p-2.5 text-blue-300" aria-hidden="true">
                <m.icon className="size-5" />
              </span>
              <h3 className="mt-3 font-bold text-white">{m.label}</h3>
              <p className="mt-1 text-sm text-slate-400">{m.description}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-white/10 bg-night-soft scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold text-white">Running in an afternoon</h2>
            <p className="mt-3 text-slate-400">
              No procurement marathon. Connect, invite, operate — your data stays in your
              infrastructure.
            </p>
          </Reveal>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} className="relative rounded-xl border border-white/10 bg-night p-6">
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-extrabold text-white">
                  {i + 1}
                </span>
                <s.icon className="size-6 text-accent" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-400">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Field portal callout */}
      <section id="field" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <Reveal className="grid items-center gap-10 rounded-2xl border border-white/10 bg-gradient-to-br from-primary/20 to-transparent p-8 sm:p-12 lg:grid-cols-2">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold tracking-widest text-blue-300 uppercase">
              <QrCode className="size-4" aria-hidden="true" /> Field Portal
            </p>
            <h2 className="text-3xl font-extrabold text-white">
              A QR code on the wall is your fastest safety officer
            </h2>
            <p className="mt-3 text-slate-300">
              Field workers scan a site QR code and report hazards or incidents from their phone in
              under a minute — no app install, no account. Reports land in the incident register
              instantly, scoped to the right site.
            </p>
            <div className="mt-6">
              <a href={import.meta.env.VITE_FIELD_PORTAL_URL || '/field-portal.html'}>
                <Button variant="accent">
                  Open Field Portal <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </a>
            </div>
          </div>
          <div className="mx-auto w-full max-w-60 rounded-2xl bg-white p-6 text-center shadow-xl">
            <QrCode className="mx-auto size-32 text-ink" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-ink">Scan to report</p>
            <p className="text-xs text-soft">WE EHS Field Portal</p>
          </div>
        </Reveal>
      </section>

      {/* Final CTA + footer */}
      <footer className="border-t border-white/10 bg-night-soft">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold text-white">Ready to run a safer operation?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Sign in to your organization's portal, or configure a database connection to start
            fresh.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Link to="/login">
              <Button className="px-6 py-3 text-base">Sign in</Button>
            </Link>
            <Link to="/setup">
              <Button variant="ghost" className="border border-white/15 px-6 py-3 text-base text-slate-200 hover:bg-white/10 hover:text-white">
                Database setup
              </Button>
            </Link>
          </div>
          <p className="mt-12 text-xs text-slate-500">
            WE EHS — Occupational Health & Safety Management System. Built for multi-site
            enterprises.
          </p>
        </div>
      </footer>
    </div>
  );
}
