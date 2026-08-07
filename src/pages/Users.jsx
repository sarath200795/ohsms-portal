import { useEffect, useMemo, useState } from 'react';
import { Pencil, ShieldCheck, Info } from 'lucide-react';
import useStore from '../store/useStore.js';
import { orgSubscribe, dbUpdate, toRecords } from '../services/db/index.js';
import { ROLES, ALL_SITES, MODULE_IDS, MANAGEMENT_MODULE_IDS, hasAllSitesAccess } from '../utils/permissions.js';
import { MODULES } from '../modules/registry.js';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
} from '../components/ui.jsx';

const ASSIGNABLE_MODULES = MODULE_IDS.filter(
  (id) => id !== 'dashboard' && !MANAGEMENT_MODULE_IDS.includes(id),
);

/**
 * User access management. Edits profiles under organizations/{orgId}/users —
 * role, site, module access and active status — which the live session
 * listener applies to signed-in users immediately. Creating the Firebase Auth
 * account itself is an admin task (Firebase console or Admin SDK backend).
 */
export default function Users() {
  const session = useStore((s) => s.session);
  const [state, setState] = useState({ loading: true, users: [] });
  const [sites, setSites] = useState([]);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.orgId) return undefined;
    const unsubUsers = orgSubscribe(session.orgId, 'users', (value) => {
      const users = value
        ? Object.entries(value).map(([uid, u]) => ({ uid, ...u }))
        : [];
      setState({ loading: false, users });
    });
    const unsubSites = orgSubscribe(session.orgId, 'sites', (value) =>
      setSites(toRecords(value).map((s) => s.name || s.title || s.id)),
    );
    return () => {
      unsubUsers?.();
      unsubSites?.();
    };
  }, [session?.orgId]);

  const visibleUsers = useMemo(() => {
    if (hasAllSitesAccess(session)) return state.users;
    return state.users.filter((u) => u.assignedSite === session.assignedSite);
  }, [state.users, session]);

  function openEdit(user) {
    setDraft({
      name: user.name || '',
      role: user.role || ROLES.USER,
      assignedSite: user.assignedSite || session.assignedSite,
      status: user.status || 'Active',
      accessibleModules: Array.isArray(user.accessibleModules) ? user.accessibleModules : [],
    });
    setEditing(user);
    setError('');
  }

  function toggleModule(id) {
    setDraft((d) => ({
      ...d,
      accessibleModules: d.accessibleModules.includes(id)
        ? d.accessibleModules.filter((m) => m !== id)
        : [...d.accessibleModules, id],
    }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await dbUpdate(`organizations/${session.orgId}/users/${editing.uid}`, {
        ...draft,
        updatedAt: new Date().toISOString(),
        updatedBy: session.name || session.email,
      });
      setEditing(null);
    } catch (err) {
      setError(err.message || 'Saving failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const roleOptions =
    session.role === ROLES.GLOBAL_OWNER
      ? [ROLES.GLOBAL_OWNER, ROLES.SITE_OWNER, ROLES.USER]
      : [ROLES.SITE_OWNER, ROLES.USER];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Control who can sign in, what role they hold and which modules they see."
      />

      <Card className="mb-5 flex items-start gap-2.5 border-primary-soft bg-mist p-3.5">
        <Info className="mt-0.5 size-4 shrink-0 text-primary-deep" aria-hidden="true" />
        <p className="text-sm text-soft">
          Permission changes apply to signed-in users in real time. New sign-in accounts are
          provisioned by your Firebase administrator; once the account exists, manage its access here.
        </p>
      </Card>

      <Card>
        {state.loading ? (
          <Spinner label="Loading users…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-soft uppercase">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Email</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Site</th>
                  <th className="px-4 py-2.5 font-semibold">Modules</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => (
                  <tr key={u.uid} className="border-b border-line/60 last:border-0 hover:bg-mist/60">
                    <td className="px-4 py-3 font-semibold">
                      <span className="flex items-center gap-1.5">
                        {u.name || '—'}
                        {u.uid === session.uid && <Badge tone="blue">You</Badge>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-soft">{u.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        {u.role !== ROLES.USER && (
                          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                        )}
                        {u.role || ROLES.USER}
                      </span>
                    </td>
                    <td className="px-4 py-3">{u.role === ROLES.GLOBAL_OWNER ? ALL_SITES : u.assignedSite || '—'}</td>
                    <td className="px-4 py-3 text-soft">
                      {u.role === ROLES.USER
                        ? `${(u.accessibleModules || []).length} module${(u.accessibleModules || []).length === 1 ? '' : 's'}`
                        : 'All (role)'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status || 'Active'} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(u)}
                        aria-label={`Edit access for ${u.name || u.email}`}
                        className="cursor-pointer rounded-lg p-2 text-soft transition-colors hover:bg-primary-soft hover:text-primary-deep"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`Edit access — ${editing?.name || editing?.email}`} wide>
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="u-name">
                <Input id="u-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </Field>
              <Field label="Role" htmlFor="u-role">
                <Select
                  id="u-role"
                  value={draft.role}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                >
                  {roleOptions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              {draft.role !== ROLES.GLOBAL_OWNER && (
                <Field label="Assigned site" htmlFor="u-site">
                  {hasAllSitesAccess(session) ? (
                    <Select
                      id="u-site"
                      value={draft.assignedSite}
                      onChange={(e) => setDraft((d) => ({ ...d, assignedSite: e.target.value }))}
                    >
                      <option value="">Select site…</option>
                      {sites.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input id="u-site" value={session.assignedSite} disabled readOnly />
                  )}
                </Field>
              )}
              <Field label="Status" htmlFor="u-status">
                <Select
                  id="u-status"
                  value={draft.status}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </Select>
              </Field>
            </div>

            {draft.role === ROLES.USER && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Accessible modules</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ASSIGNABLE_MODULES.map((id) => {
                    const mod = MODULES.find((m) => m.id === id);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm transition-colors has-checked:border-primary has-checked:bg-primary-soft/50"
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-[#2563eb]"
                          checked={draft.accessibleModules.includes(id)}
                          onChange={() => toggleModule(id)}
                        />
                        {mod?.label || id}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save access
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
