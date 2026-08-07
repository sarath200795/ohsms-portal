import { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, MapPin } from 'lucide-react';
import { orgPush, orgGet, toRecords } from './services/db/index.js';
import { Button, Card, Field, Input, Select, Textarea } from './components/ui.jsx';

const FIELD_SESSION_KEY = 'fieldPortalSession';

const CATEGORIES = ['Hazard / Unsafe Condition', 'Near Miss', 'Injury', 'Property Damage', 'Environmental', 'Other'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

function readFieldSession() {
  try {
    return JSON.parse(sessionStorage.getItem(FIELD_SESSION_KEY)) || {};
  } catch {
    return {};
  }
}

/**
 * Standalone field portal — reached from a site QR code carrying
 * ?org={orgId}&site={siteName}. No account needed: a worker reports an
 * incident straight into the org's incident register.
 */
export default function FieldPortalApp() {
  const params = new URLSearchParams(window.location.search);
  const orgId = params.get('org') || '';
  const siteParam = params.get('site') || '';

  const [sites, setSites] = useState(siteParam ? [siteParam] : []);
  const [form, setForm] = useState(() => ({
    reporter: readFieldSession().reporter || '',
    site: siteParam,
    category: '',
    severity: 'Medium',
    location: '',
    description: '',
  }));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (!orgId || siteParam) return;
    orgGet(orgId, 'sites')
      .then((value) => setSites(toRecords(value).map((s) => s.name || s.id)))
      .catch(() => setSites([]));
  }, [orgId, siteParam]);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
  };

  async function submit(e) {
    e.preventDefault();
    const required = { reporter: 'Your name', site: 'Site', category: 'Category', description: 'Description' };
    const nextErrors = {};
    for (const [key, label] of Object.entries(required)) {
      if (!String(form[key]).trim()) nextErrors[key] = `${label} is required.`;
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    setFailure('');
    try {
      const now = new Date().toISOString();
      await orgPush(orgId, 'incidents', {
        title: `${form.category} — reported from field`,
        site: form.site,
        date: now.slice(0, 10),
        category: form.category === 'Hazard / Unsafe Condition' ? 'Other' : form.category,
        severity: form.severity,
        location: form.location,
        description: form.description,
        status: 'Open',
        source: 'Field Portal',
        createdAt: now,
        createdBy: form.reporter,
      });
      sessionStorage.setItem(FIELD_SESSION_KEY, JSON.stringify({ reporter: form.reporter }));
      setDone(true);
    } catch {
      setFailure('Could not submit your report. Check your signal and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!orgId) {
    return (
      <Shell>
        <Card className="p-6 text-center">
          <h1 className="text-lg font-extrabold">Invalid link</h1>
          <p className="mt-2 text-sm text-soft">
            This page must be opened from your site's WE EHS QR code. Ask your supervisor for the
            correct code.
          </p>
        </Card>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-accent" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-extrabold">Report submitted</h1>
          <p className="mt-2 text-sm text-soft">
            Thank you for speaking up — your report is already with the safety team.
          </p>
          <Button
            className="mt-5 w-full"
            onClick={() => {
              setDone(false);
              setForm((f) => ({ ...f, category: '', severity: 'Medium', location: '', description: '' }));
            }}
          >
            Report something else
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell site={form.site}>
      <Card className="p-5">
        <h1 className="text-lg font-extrabold">Report a safety issue</h1>
        <p className="mt-1 mb-4 text-sm text-soft">Takes under a minute. No account needed.</p>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Your name" htmlFor="fp-name" required error={errors.reporter}>
            <Input
              id="fp-name"
              autoComplete="name"
              value={form.reporter}
              onChange={(e) => setField('reporter', e.target.value)}
            />
          </Field>
          {!siteParam && (
            <Field label="Site" htmlFor="fp-site" required error={errors.site}>
              <Select id="fp-site" value={form.site} onChange={(e) => setField('site', e.target.value)}>
                <option value="">Select site…</option>
                {sites.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="What are you reporting?" htmlFor="fp-category" required error={errors.category}>
            <Select id="fp-category" value={form.category} onChange={(e) => setField('category', e.target.value)}>
              <option value="">Select…</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="How serious is it?" htmlFor="fp-severity">
            <Select id="fp-severity" value={form.severity} onChange={(e) => setField('severity', e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Where exactly?" htmlFor="fp-location" hint="Building, floor, machine…">
            <Input id="fp-location" value={form.location} onChange={(e) => setField('location', e.target.value)} />
          </Field>
          <Field label="Describe it" htmlFor="fp-description" required error={errors.description}>
            <Textarea
              id="fp-description"
              rows={4}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </Field>
          {failure && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-red-800">
              {failure}
            </p>
          )}
          <Button type="submit" loading={submitting} className="w-full py-3">
            Submit report
          </Button>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ site, children }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-night px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <span className="flex items-center gap-2">
            <img src="/we-ehs-logo.jpg" alt="" className="size-8 rounded-lg object-cover" />
            <span className="text-sm font-extrabold text-white">WE EHS Field Portal</span>
          </span>
          {site && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">
              <MapPin className="size-3.5" aria-hidden="true" />
              {site}
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
      <p className="flex items-center justify-center gap-1.5 pb-6 text-xs text-faint">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Reports go directly to your safety team.
      </p>
    </div>
  );
}
