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
// Priority: localStorage → VITE_ env vars (no hardcoded fallback credentials)
const _runtimeFirebaseConfig = (() => {
  try {
    const stored = localStorage.getItem('ohsms_firebase_config');
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
})();

// ── Warn if no credentials are configured ───────────────────────────────────
// This fires in the browser console when neither the /setup wizard nor the
// VITE_FIREBASE_* environment variables have provided a Firebase project.
if (typeof window !== 'undefined' && !env.VITE_FIREBASE_API_KEY && !_runtimeFirebaseConfig) {
  console.warn(
    '[OHSMS] No Firebase credentials found.\n' +
    '  • Development: copy .env.example → .env and fill in your Firebase project values.\n' +
    '  • Production:  set VITE_FIREBASE_* environment variables in your hosting provider.\n' +
    '  • Or:          use the Database Setup wizard at /setup to connect via the UI.'
  );
}

export const firebaseConfig = _runtimeFirebaseConfig || {
  apiKey:            env.VITE_FIREBASE_API_KEY             || '',
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN         || '',
  databaseURL:       env.VITE_FIREBASE_DATABASE_URL        || '',
  projectId:         env.VITE_FIREBASE_PROJECT_ID          || '',
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET      || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             env.VITE_FIREBASE_APP_ID              || '',
};

// Initialize Firebase
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
