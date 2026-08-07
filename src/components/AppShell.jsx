import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Factory,
  Settings,
  LogOut,
  Menu,
  X,
  MapPin,
} from 'lucide-react';
import useStore from '../store/useStore.js';
import authService from '../services/auth/index.js';
import { canAccessModule } from '../utils/permissions.js';
import { MODULES } from '../modules/registry.js';

function NavItem({ to, icon: Icon, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
          isActive ? 'bg-primary text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function SidebarContent({ session, onNavigate }) {
  const operational = MODULES.filter((m) => canAccessModule(session, m.id));
  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Primary">
      <div className="mb-3 flex items-center gap-2.5 px-2 pt-1">
        <img src="/we-ehs-logo.jpg" alt="" className="size-8 rounded-lg object-cover" />
        <div>
          <p className="text-sm leading-tight font-extrabold text-white">WE EHS</p>
          <p className="text-[11px] leading-tight text-slate-400">OHSMS Portal</p>
        </div>
      </div>

      <p className="px-3 pt-1 pb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Overview</p>
      <NavItem to="/app" icon={LayoutDashboard} label="Dashboard" onNavigate={onNavigate} />

      <p className="px-3 pt-3 pb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Operations</p>
      {operational.map((m) => (
        <NavItem key={m.id} to={`/app/${m.id}`} icon={m.icon} label={m.label} onNavigate={onNavigate} />
      ))}

      {(canAccessModule(session, 'users') || canAccessModule(session, 'sites')) && (
        <>
          <p className="px-3 pt-3 pb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Administration
          </p>
          {canAccessModule(session, 'users') && (
            <NavItem to="/app/users" icon={Users} label="Users" onNavigate={onNavigate} />
          )}
          {canAccessModule(session, 'sites') && (
            <NavItem to="/app/sites" icon={Factory} label="Sites" onNavigate={onNavigate} />
          )}
          <NavItem to="/setup" icon={Settings} label="Database Setup" onNavigate={onNavigate} />
        </>
      )}
    </nav>
  );
}

export default function AppShell() {
  const session = useStore((s) => s.session);
  const clearSession = useStore((s) => s.clearSession);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!session) return null;

  async function handleLogout() {
    await authService.logout();
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 bg-night lg:block">
        <SidebarContent session={session} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-night shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-3 right-3 cursor-pointer rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
            <SidebarContent session={session} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="cursor-pointer rounded-lg p-2 text-soft hover:bg-mist lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1 text-xs font-semibold text-soft">
              <MapPin className="size-3.5" aria-hidden="true" />
              {session.assignedSite}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-bold">{session.name || session.email}</p>
              <p className="text-xs leading-tight text-soft">{session.role}</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
              className="cursor-pointer rounded-lg border border-line p-2 text-soft transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
