import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Wrench, FileCheck2, GraduationCap, ArrowRight } from 'lucide-react';
import useStore from '../store/useStore.js';
import { orgSubscribe, toRecords } from '../services/db/index.js';
import { scopeRecordsToSite } from '../utils/permissions.js';
import { Card, StatCard, StatusBadge, PageHeader, EmptyState } from '../components/ui.jsx';
import { MODULES } from '../modules/registry.js';

// Severity palette — validated categorical set (dataviz six-checks, light surface).
// Amber is below 3:1 contrast, so every segment is also labeled in the legend.
const SEVERITY_COLORS = {
  Low: '#0891b2',
  Medium: '#f59e0b',
  High: '#dc2626',
  Critical: '#7c3aed',
};

function useCollections(orgId, collections) {
  const [data, setData] = useState({});
  useEffect(() => {
    if (!orgId) return undefined;
    const unsubs = collections.map((c) =>
      orgSubscribe(orgId, c, (value) => setData((d) => ({ ...d, [c]: toRecords(value) }))),
    );
    return () => unsubs.forEach((u) => u?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, collections.join()]);
  return data;
}

function monthKey(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return d.toISOString().slice(0, 7);
}

/** Monthly incident counts, last 6 months — single-series bar, direct labels. */
function IncidentTrendChart({ incidents }) {
  const months = [5, 4, 3, 2, 1, 0].map((offset) => {
    const key = monthKey(offset);
    return {
      key,
      label: new Date(`${key}-01T00:00:00`).toLocaleString('en', { month: 'short' }),
      count: incidents.filter((i) => String(i.date || i.createdAt || '').startsWith(key)).length,
    };
  });
  const max = Math.max(1, ...months.map((m) => m.count));
  const W = 320;
  const H = 150;
  const plotH = 110;
  const barW = 26;
  const step = W / months.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Incidents per month, last six months">
      {[0.5, 1].map((t) => (
        <line
          key={t}
          x1="0"
          x2={W}
          y1={16 + plotH - plotH * t}
          y2={16 + plotH - plotH * t}
          stroke="#e4ecfc"
          strokeWidth="1"
        />
      ))}
      {months.map((m, i) => {
        const h = (m.count / max) * plotH;
        const x = i * step + (step - barW) / 2;
        const y = 16 + plotH - h;
        return (
          <g key={m.key}>
            {m.count > 0 && (
              <rect x={x} y={y} width={barW} height={h} rx="4" fill="#2563eb">
                <title>{`${m.label}: ${m.count} incident${m.count === 1 ? '' : 's'}`}</title>
              </rect>
            )}
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">
              {m.count}
            </text>
            <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b">
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Severity share donut with 2px surface gaps and a fully labeled legend. */
function SeverityDonut({ incidents }) {
  const counts = ['Low', 'Medium', 'High', 'Critical']
    .map((s) => ({ severity: s, count: incidents.filter((i) => i.severity === s).length }))
    .filter((s) => s.count > 0);
  const total = counts.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-soft">No incidents recorded yet.</p>;
  }

  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center justify-center gap-6">
      <svg viewBox="0 0 140 140" className="size-36" role="img" aria-label="Incidents by severity">
        {counts.map((s) => {
          const frac = s.count / total;
          const dash = Math.max(frac * C - 2, 1); // 2px surface gap between segments
          const el = (
            <circle
              key={s.severity}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={SEVERITY_COLORS[s.severity]}
              strokeWidth="18"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset * C + C / 4}
              strokeLinecap="butt"
            >
              <title>{`${s.severity}: ${s.count} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
          offset += frac;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0f172a">
          {total}
        </text>
        <text x="70" y="84" textAnchor="middle" fontSize="10" fill="#64748b">
          incidents
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {counts.map((s) => (
          <li key={s.severity} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SEVERITY_COLORS[s.severity] }}
              aria-hidden="true"
            />
            <span className="font-medium">{s.severity}</span>
            <span className="tabular-nums text-soft">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DASH_COLLECTIONS = ['incidents', 'capaActions', 'ptwRecords', 'trainings'];

export default function Dashboard() {
  const session = useStore((s) => s.session);
  const data = useCollections(session?.orgId, DASH_COLLECTIONS);

  const scoped = useMemo(() => {
    const out = {};
    for (const c of DASH_COLLECTIONS) out[c] = scopeRecordsToSite(session, data[c] || []);
    return out;
  }, [session, data]);

  const today = new Date().toISOString().slice(0, 10);
  const openIncidents = scoped.incidents.filter((i) => i.status !== 'Closed').length;
  const overdueCapa = scoped.capaActions.filter(
    (a) => !['Completed', 'Verified'].includes(a.status) && a.date && a.date < today,
  ).length;
  const activePermits = scoped.ptwRecords.filter((p) => ['Issued', 'Active'].includes(p.status)).length;
  const upcomingTrainings = scoped.trainings.filter((t) => t.status === 'Scheduled').length;

  const recent = useMemo(
    () =>
      DASH_COLLECTIONS.flatMap((c) =>
        scoped[c].slice(0, 5).map((r) => ({
          ...r,
          module: MODULES.find((m) => m.collection === c),
        })),
      )
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 8),
    [scoped],
  );

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${(session?.name || '').split(' ')[0] || 'there'}`}
        description={`Safety performance overview for ${session?.assignedSite}.`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open incidents" value={openIncidents} icon={AlertTriangle} tone={openIncidents ? 'red' : 'green'} />
        <StatCard label="Overdue CAPAs" value={overdueCapa} icon={Wrench} tone={overdueCapa ? 'amber' : 'green'} />
        <StatCard label="Active permits" value={activePermits} icon={FileCheck2} tone="blue" />
        <StatCard label="Trainings scheduled" value={upcomingTrainings} icon={GraduationCap} tone="blue" />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold">Incidents — last 6 months</h2>
          <IncidentTrendChart incidents={scoped.incidents} />
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold">Incidents by severity</h2>
          <SeverityDonut incidents={scoped.incidents} />
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold">Recent activity</h2>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            hint="Records you and your team create will appear here in real time."
          />
        ) : (
          <ul>
            {recent.map((r) => (
              <li key={`${r.module?.id}-${r.id}`} className="border-b border-line/60 last:border-0">
                <Link
                  to={`/app/${r.module?.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist/60"
                >
                  {r.module && (
                    <span className="rounded-lg bg-mist p-2 text-soft" aria-hidden="true">
                      <r.module.icon className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.title || '—'}</span>
                    <span className="block text-xs text-soft">
                      {r.module?.singular} · {r.site || '—'}
                    </span>
                  </span>
                  <StatusBadge status={r.status} />
                  <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
