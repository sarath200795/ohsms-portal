import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, DatabaseZap } from 'lucide-react';
import {
  getFirebaseConfig,
  getDbAdapterChoice,
  getRestConfig,
  writeRuntimeConfig,
  clearRuntimeConfig,
} from '../config/firebase.js';
import { Button, Card, Field, Input, Select } from '../components/ui.jsx';

const FIREBASE_FIELDS = [
  ['apiKey', 'API key'],
  ['authDomain', 'Auth domain'],
  ['databaseURL', 'Database URL'],
  ['projectId', 'Project ID'],
  ['storageBucket', 'Storage bucket'],
  ['messagingSenderId', 'Messaging sender ID'],
  ['appId', 'App ID'],
];

/**
 * Runtime database configuration. Writes to localStorage so an organization
 * can point the deployed app at its own Firebase project or REST backend
 * without a redeploy. Changes apply after reload.
 */
export default function Setup() {
  const navigate = useNavigate();
  const [adapter, setAdapter] = useState(getDbAdapterChoice());
  const [firebase, setFirebase] = useState(getFirebaseConfig() || {});
  const [rest, setRest] = useState(getRestConfig());
  const [saved, setSaved] = useState(false);

  function save(e) {
    e.preventDefault();
    writeRuntimeConfig({
      adapter,
      firebaseConfig: adapter === 'firebase' ? firebase : undefined,
      restConfig: adapter === 'rest' ? rest : undefined,
    });
    setSaved(true);
    setTimeout(() => window.location.assign('/login'), 800);
  }

  function reset() {
    clearRuntimeConfig();
    navigate(0);
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
        </Link>
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-xl bg-primary-soft p-2.5 text-primary-deep" aria-hidden="true">
              <DatabaseZap className="size-6" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold">Database setup</h1>
              <p className="text-sm text-soft">
                Runtime configuration — stored in this browser only, applied on next load.
              </p>
            </div>
          </div>

          <form onSubmit={save} className="space-y-4">
            <Field label="Database adapter" htmlFor="adapter">
              <Select id="adapter" value={adapter} onChange={(e) => setAdapter(e.target.value)}>
                <option value="firebase">Firebase Realtime Database (default)</option>
                <option value="rest">REST API</option>
              </Select>
            </Field>

            {adapter === 'firebase' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {FIREBASE_FIELDS.map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={`fb-${key}`}>
                    <Input
                      id={`fb-${key}`}
                      value={firebase[key] || ''}
                      onChange={(e) => setFirebase((c) => ({ ...c, [key]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
            ) : (
              <>
                <Field
                  label="REST base URL"
                  htmlFor="rest-base"
                  hint="Endpoints must mirror the Firebase RTDB JSON API shape."
                >
                  <Input
                    id="rest-base"
                    type="url"
                    value={rest.baseUrl}
                    onChange={(e) => setRest((c) => ({ ...c, baseUrl: e.target.value }))}
                    placeholder="https://api.example.com/ohsms"
                  />
                </Field>
                <Field label="Bearer token (optional)" htmlFor="rest-token">
                  <Input
                    id="rest-token"
                    value={rest.authToken}
                    onChange={(e) => setRest((c) => ({ ...c, authToken: e.target.value }))}
                  />
                </Field>
              </>
            )}

            {saved && (
              <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-emerald-800">
                Saved — reloading to apply…
              </p>
            )}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                Reset to build defaults
              </Button>
              <Button type="submit">Save configuration</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
