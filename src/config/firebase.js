import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const env = typeof import.meta !== 'undefined' ? import.meta.env : {};

// ── Runtime config override ──────────────────────────────────────────────────
// The Database Setup page (/setup) lets users enter Firebase credentials via
// the UI and stores them in localStorage under 'ohsms_firebase_config'.
// We read that here at module-load time so the app switches databases on reload
// without requiring a new build or environment-variable redeploy.
//
// Priority: localStorage → VITE_ env vars → placeholder
//
// Critical: validate that the stored config has at minimum a non-empty
// `apiKey`. Without this guard, a localStorage entry shaped like {} or
// { apiKey: '', ... } takes priority over the placeholder fallback and the
// Firebase SDK throws `auth/invalid-api-key` during module load — the SPA
// never mounts and the org picker never gets a chance to fix it. Same goes
// for `projectId` (Firebase needs both).
const _runtimeFirebaseConfig = (() => {
  try {
    const stored = localStorage.getItem('ohsms_firebase_config');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.apiKey === 'string' &&
      parsed.apiKey.trim() &&
      typeof parsed.projectId === 'string' &&
      parsed.projectId.trim()
    ) {
      return parsed;
    }
    // Garbage entry — purge so the next reload doesn't trip the same trap.
    console.warn('[OHSMS] localStorage ohsms_firebase_config is malformed (missing apiKey/projectId). Discarding so the org picker can take over.');
    localStorage.removeItem('ohsms_firebase_config');
  } catch (err) {
    console.warn('[OHSMS] Failed to parse localStorage ohsms_firebase_config:', err);
    try { localStorage.removeItem('ohsms_firebase_config'); } catch { /* no-op */ }
  }
  return null;
})();

// ── Warn if no credentials are configured ───────────────────────────────────
// This fires in the browser console when neither the /setup wizard nor the
// VITE_FIREBASE_* environment variables have provided a Firebase project.
if (typeof window !== 'undefined' && !env.VITE_FIREBASE_API_KEY && !_runtimeFirebaseConfig) {
  console.warn(
    '[OHSMS] No Firebase credentials configured for this device yet.\n' +
    '  • The login picker will fetch the public directory and let you select an org.\n' +
    '  • Picking an org writes its config to localStorage and reloads, after which Firebase\n' +
    '    re-initializes against the right project.\n' +
    '  • To bake credentials at build time, set VITE_FIREBASE_* env vars.\n' +
    '  • Or run the /setup wizard once to configure manually.'
  );
}

// Placeholder config used only when neither localStorage nor build-time env
// vars supply real credentials. Without these defaults, initializeApp() and
// getAuth() throw `auth/invalid-api-key` during module load and the SPA can
// never render — so the user can't even reach the org picker to choose a
// real project.
//
// The values are intentionally clearly-fake (apiKey reads as 'placeholder').
// Firebase only validates SHAPE at init time; it never connects until a
// real call is made. The first time the user picks an org from the picker,
// applyOrgDbConfig writes the real firebaseConfig to localStorage and the
// page reloads, after which initializeApp() uses the real values.
const PLACEHOLDER_FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAplaceholderkey-replace-after-org-pick-XXX',
  authDomain:        'placeholder.firebaseapp.com',
  databaseURL:       'https://placeholder-default-rtdb.firebaseio.com',
  projectId:         'placeholder',
  storageBucket:     'placeholder.appspot.com',
  messagingSenderId: '000000000000',
  appId:             '1:000000000000:web:0000000000000000000000',
};

export const firebaseConfig = _runtimeFirebaseConfig || {
  apiKey:            env.VITE_FIREBASE_API_KEY             || PLACEHOLDER_FIREBASE_CONFIG.apiKey,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN         || PLACEHOLDER_FIREBASE_CONFIG.authDomain,
  databaseURL:       env.VITE_FIREBASE_DATABASE_URL        || PLACEHOLDER_FIREBASE_CONFIG.databaseURL,
  projectId:         env.VITE_FIREBASE_PROJECT_ID          || PLACEHOLDER_FIREBASE_CONFIG.projectId,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET      || PLACEHOLDER_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || PLACEHOLDER_FIREBASE_CONFIG.messagingSenderId,
  appId:             env.VITE_FIREBASE_APP_ID              || PLACEHOLDER_FIREBASE_CONFIG.appId,
};

// Track whether we're running on real or placeholder credentials so the rest
// of the app can avoid making blocking RTDB / Auth calls before the user
// picks an org from the directory.
export const isPlaceholderFirebaseConfig =
  firebaseConfig.apiKey === PLACEHOLDER_FIREBASE_CONFIG.apiKey;

// Initialize Firebase. With placeholder values the SDK initialises cleanly
// (it doesn't validate the api key until a real call is made), so /login
// can render and the picker can fetch the public directory.
export const app = initializeApp(firebaseConfig);

export let appCheck = null;
const appCheckSiteKey = env.VITE_FIREBASE_APP_CHECK_SITE_KEY || '';
if (typeof window !== 'undefined' && appCheckSiteKey) {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn('Firebase App Check failed to initialize:', error);
  }
}

// Initialize Authentication
export const auth = getAuth(app);

// Initialize Realtime Database
const databaseInstance = getDatabase(app);
export const storage = getStorage(app);

// EXPORT TWICE TO FIX ALL ERRORS:
// Export as 'rtdb' for all the newly built modules (PTW, Audit, Capa, etc.)
export const rtdb = databaseInstance;

// Export as 'db' for older modules (Standards, etc.)
export const db = databaseInstance;
