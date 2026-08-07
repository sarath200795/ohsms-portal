import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Factory } from 'lucide-react';
import useStore from '../store/useStore.js';
import { orgSubscribe, orgPush, dbUpdate, dbRemove, orgPath, toRecords } from '../services/db/index.js';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
} from '../components/ui.jsx';

const EMPTY = { name: '', code: '', address: '', manager: '' };

/** Global site registry — Global Owner only. */
export default function Sites() {
  const session = useStore((s) => s.session);
  const [state, setState] = useState({ loading: true, sites: [] });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.orgId) return undefined;
    return orgSubscribe(session.orgId, 'sites', (value) =>
      setState({ loading: false, sites: toRecords(value) }),
    );
  }, [session?.orgId]);

  function openCreate() {
    setDraft(EMPTY);
    setEditing({ isNew: true });
    setError('');
  }
  function openEdit(site) {
    setDraft({ ...EMPTY, ...site });
    setEditing({ isNew: false, id: site.id });
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError('Site name is required.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editing.isNew) {
        await orgPush(session.orgId, 'sites', { ...draft, createdAt: now, updatedAt: now });
      } else {
        const { id: _id, ...payload } = draft;
        await dbUpdate(`${orgPath(session.orgId, 'sites')}/${editing.id}`, { ...payload, updatedAt: now });
      }
      setEditing(null);
    } catch (err) {
      setError(err.message || 'Saving failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      await dbRemove(`${orgPath(session.orgId, 'sites')}/${deleting.id}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sites"
        description="Physical locations your organization operates. Users and records are scoped per site."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" /> New Site
          </Button>
        }
      />

      {state.loading ? (
        <Card>
          <Spinner label="Loading sites…" />
        </Card>
      ) : state.sites.length === 0 ? (
        <Card>
          <EmptyState
            title="No sites yet"
            hint="Create your first site — every record in the portal is scoped to a site."
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" aria-hidden="true" /> New Site
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.sites.map((site) => (
            <Card key={site.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-xl bg-primary-soft p-2.5 text-primary-deep" aria-hidden="true">
                  <Factory className="size-5" />
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(site)}
                    aria-label={`Edit ${site.name}`}
                    className="cursor-pointer rounded-lg p-2 text-soft transition-colors hover:bg-primary-soft hover:text-primary-deep"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => setDeleting(site)}
                    aria-label={`Delete ${site.name}`}
                    className="cursor-pointer rounded-lg p-2 text-soft transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <h2 className="mt-3 font-bold">{site.name}</h2>
              {site.code && <p className="text-xs font-semibold text-faint">Code: {site.code}</p>}
              {site.address && <p className="mt-1 text-sm text-soft">{site.address}</p>}
              {site.manager && (
                <p className="mt-2 text-xs text-soft">
                  <span className="font-semibold">Site manager:</span> {site.manager}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? 'New site' : `Edit ${draft.name}`}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Site name" htmlFor="s-name" required error={error || undefined}>
            <Input
              id="s-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Short code" htmlFor="s-code" hint="Used on QR codes and reports.">
              <Input
                id="s-code"
                value={draft.code}
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
              />
            </Field>
            <Field label="Site manager" htmlFor="s-manager">
              <Input
                id="s-manager"
                value={draft.manager}
                onChange={(e) => setDraft((d) => ({ ...d, manager: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Address" htmlFor="s-address">
            <Input
              id="s-address"
              value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing?.isNew ? 'Create site' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete site?">
        <p className="text-sm text-soft">
          “{deleting?.name}” will be removed from the registry. Records already scoped to it keep
          their site name. This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete site
          </Button>
        </div>
      </Modal>
    </div>
  );
}
