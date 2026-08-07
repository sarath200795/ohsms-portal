import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import useStore from '../store/useStore.js';
import { orgSubscribe, orgPush, dbUpdate, dbRemove, orgPath, toRecords } from '../services/db/index.js';
import { scopeRecordsToSite, hasAllSitesAccess } from '../utils/permissions.js';
import {
  Button,
  Card,
  StatCard,
  StatusBadge,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  EmptyState,
  Spinner,
  PageHeader,
} from './ui.jsx';

function useOrgCollection(orgId, collection) {
  const [state, setState] = useState({ loading: true, records: [] });
  useEffect(() => {
    if (!orgId) return undefined;
    // ModulePage routes are keyed by module id, so this hook mounts fresh per
    // collection and the initial loading state needs no reset here.
    return orgSubscribe(orgId, collection, (value) =>
      setState({ loading: false, records: toRecords(value) }),
    );
  }, [orgId, collection]);
  return state;
}

function useSiteNames(orgId) {
  const { records } = useOrgCollection(orgId, 'sites');
  return records.map((s) => s.name || s.title || s.id);
}

function emptyDraft(config, session) {
  const draft = { status: config.statuses[0] };
  for (const field of config.fields) {
    draft[field.key] = field.type === 'site' && !hasAllSitesAccess(session) ? session.assignedSite : '';
  }
  draft.status = config.statuses[0];
  return draft;
}

function FormControl({ field, value, onChange, siteNames, session }) {
  const id = `f-${field.key}`;
  const common = { id, value: value ?? '', onChange: (e) => onChange(field.key, e.target.value) };
  switch (field.type) {
    case 'textarea':
      return <Textarea {...common} />;
    case 'date':
      return <Input type="date" {...common} />;
    case 'number':
      return <Input type="number" min={field.min} max={field.max} {...common} />;
    case 'select':
      return (
        <Select {...common}>
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      );
    case 'site': {
      if (!hasAllSitesAccess(session)) {
        return <Input {...common} value={session.assignedSite} disabled readOnly />;
      }
      return (
        <Select {...common}>
          <option value="">Select site…</option>
          {siteNames.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      );
    }
    default:
      return <Input type="text" {...common} />;
  }
}

/**
 * Generic module engine: realtime list with stats, search, status filter,
 * and create/edit/delete driven entirely by the module config from
 * modules/registry.js.
 */
export default function ModulePage({ config }) {
  const session = useStore((s) => s.session);
  const { loading, records } = useOrgCollection(session?.orgId, config.collection);
  const siteNames = useSiteNames(session?.orgId);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | { record | draft }
  const [deleting, setDeleting] = useState(null);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const scoped = useMemo(() => scopeRecordsToSite(session, records), [session, records]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      return config.fields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(q));
    });
  }, [scoped, query, statusFilter, config]);

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(config.statuses.map((s) => [s, 0]));
    for (const r of scoped) if (r.status in byStatus) byStatus[r.status] += 1;
    return byStatus;
  }, [scoped, config]);

  const openCreate = () => {
    setDraft(emptyDraft(config, session));
    setEditing({ isNew: true });
    setErrors({});
  };
  const openEdit = (record) => {
    setDraft({ ...record });
    setEditing({ isNew: false, id: record.id });
    setErrors({});
  };

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
  };

  async function save() {
    const nextErrors = {};
    for (const f of config.fields) {
      if (f.required && !String(draft[f.key] ?? '').trim()) {
        nextErrors[f.key] = `${f.label} is required.`;
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { id: _id, ...payload } = draft;
      if (editing.isNew) {
        await orgPush(session.orgId, config.collection, {
          ...payload,
          createdAt: now,
          createdBy: session.name || session.email,
          updatedAt: now,
        });
      } else {
        await dbUpdate(`${orgPath(session.orgId, config.collection)}/${editing.id}`, {
          ...payload,
          updatedAt: now,
        });
      }
      setEditing(null);
    } catch (err) {
      setErrors({ _form: err.message || 'Save failed. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      await dbRemove(`${orgPath(session.orgId, config.collection)}/${deleting.id}`);
    } finally {
      setDeleting(null);
    }
  }

  const columnLabel = (key) =>
    key === 'status' ? 'Status' : config.fields.find((f) => f.key === key)?.label || key;

  return (
    <div>
      <PageHeader
        title={config.label}
        description={config.description}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" /> New {config.singular}
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={scoped.length} icon={config.icon} />
        {config.statuses.slice(0, 3).map((s) => (
          <StatCard key={s} label={s} value={counts[s]} tone="slate" />
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-52 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label={`Search ${config.label}`}
              placeholder={`Search ${config.label.toLowerCase()}…`}
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select
            aria-label="Filter by status"
            className="w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {config.statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>

        {loading ? (
          <Spinner label={`Loading ${config.label.toLowerCase()}…`} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={scoped.length === 0 ? `No ${config.label.toLowerCase()} yet` : 'No matches'}
            hint={
              scoped.length === 0
                ? `Create your first ${config.singular.toLowerCase()} to get started.`
                : 'Try a different search term or clear the status filter.'
            }
            action={
              scoped.length === 0 && (
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden="true" /> New {config.singular}
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-soft uppercase">
                  {config.listColumns.map((c) => (
                    <th key={c} className="px-4 py-2.5 font-semibold">
                      {columnLabel(c)}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-mist/60">
                    {config.listColumns.map((c) => (
                      <td key={c} className="max-w-64 truncate px-4 py-3">
                        {c === 'status' ? (
                          <StatusBadge status={r.status} />
                        ) : c === 'title' ? (
                          <span className="font-semibold">{r[c] || '—'}</span>
                        ) : (
                          <span className={/date|Due|Expiry/i.test(c) ? 'tabular-nums' : ''}>{r[c] || '—'}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          aria-label={`Edit ${r.title || config.singular}`}
                          className="cursor-pointer rounded-lg p-2 text-soft transition-colors hover:bg-primary-soft hover:text-primary-deep"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => setDeleting(r)}
                          aria-label={`Delete ${r.title || config.singular}`}
                          className="cursor-pointer rounded-lg p-2 text-soft transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? `New ${config.singular}` : `Edit ${config.singular}`}
        wide
      >
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            {config.fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <Field label={f.label} required={f.required} error={errors[f.key]} htmlFor={`f-${f.key}`}>
                  <FormControl
                    field={f}
                    value={draft[f.key]}
                    onChange={setField}
                    siteNames={siteNames}
                    session={session}
                  />
                </Field>
              </div>
            ))}
            <Field label="Status" htmlFor="f-status">
              <Select id="f-status" value={draft.status} onChange={(e) => setField('status', e.target.value)}>
                {config.statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            {errors._form && (
              <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">
                {errors._form}
              </p>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing?.isNew ? `Create ${config.singular}` : 'Save changes'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete ${config.singular}?`}>
        <p className="text-sm text-soft">
          “{deleting?.title}” will be permanently removed. This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
