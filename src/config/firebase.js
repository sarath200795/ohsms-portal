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
// Priority: localStorage → VITE_ env vars → built-in fallback defaults
const _runtimeFirebaseConfig = (() => {
  try {
    const stored = localStorage.getItem('ohsms_firebase_config');
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
})();

export const firebaseConfig = _runtimeFirebaseConfig || {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyBHqeQN4s9PA5UUDfLtAajVkoRK2BrRjwk",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "ohsms-3894f.firebaseapp.com",
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || "https://ohsms-3894f-default-rtdb.firebaseio.com/",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "ohsms-3894f",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "ohsms-3894f.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "871919638023",
  appId: env.VITE_FIREBASE_APP_ID || "1:871919638023:web:69d325f99f71af7a337ca2"
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
