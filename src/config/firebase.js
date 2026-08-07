// Runtime configuration resolution.
// Priority: localStorage overrides (written by /setup) → Vite env vars.

const FIREBASE_CONFIG_KEY = 'ohsms_firebase_config';
const DB_ADAPTER_KEY = 'ohsms_db_adapter';
const REST_CONFIG_KEY = 'ohsms_rest_config';

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getFirebaseConfig() {
  const stored = readJson(FIREBASE_CONFIG_KEY);
  if (stored?.apiKey && stored?.databaseURL) return stored;
  const env = import.meta.env;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

export function getDbAdapterChoice() {
  try {
    const stored = localStorage.getItem(DB_ADAPTER_KEY);
    if (stored === 'firebase' || stored === 'rest') return stored;
  } catch {
    /* sessionless environments fall through to env */
  }
  return import.meta.env.VITE_DB_ADAPTER === 'rest' ? 'rest' : 'firebase';
}

export function getRestConfig() {
  const stored = readJson(REST_CONFIG_KEY);
  return {
    baseUrl: stored?.baseUrl || import.meta.env.VITE_REST_API_BASE_URL || '',
    authToken: stored?.authToken || '',
  };
}

export function writeRuntimeConfig({ firebaseConfig, adapter, restConfig }) {
  if (firebaseConfig) localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(firebaseConfig));
  if (adapter) localStorage.setItem(DB_ADAPTER_KEY, adapter);
  if (restConfig) localStorage.setItem(REST_CONFIG_KEY, JSON.stringify(restConfig));
}

export function clearRuntimeConfig() {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
  localStorage.removeItem(DB_ADAPTER_KEY);
  localStorage.removeItem(REST_CONFIG_KEY);
}
