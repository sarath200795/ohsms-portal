/**
 * Auth Service — active adapter entry point
 *
 * Controlled by VITE_DB_ADAPTER (same env var as the database adapter):
 *   firebase  → Firebase Authentication
 *   rest      → JWT / REST API backend
 *
 * Usage (replaces direct firebase/auth imports in components):
 *
 *   import { authService } from '../../services/auth';
 *
 *   await authService.signIn(email, password);
 *   await authService.signOut();
 *   const uid = await authService.register(email, password);        // self-signup
 *   const r   = await authService.createUser(email, payload);       // admin provisioning
 *   authService.onAuthStateChanged((user) => { ... });
 */

import firebaseAuthAdapter from './adapters/firebase.js';
import restAuthAdapter     from './adapters/rest.js';

// Priority: localStorage (set by /setup page) → VITE_DB_ADAPTER env var → 'firebase'
const _runtimeAdapter = (() => {
    try { return localStorage.getItem('ohsms_db_adapter'); } catch { return null; }
})();

const ADAPTER_KEY = _runtimeAdapter || import.meta.env.VITE_DB_ADAPTER || 'firebase';

const ADAPTERS = {
    firebase: firebaseAuthAdapter,
    rest:     restAuthAdapter,
};

export const authService = ADAPTERS[ADAPTER_KEY];

if (!authService) {
    throw new Error(
        `[auth] Unknown VITE_DB_ADAPTER="${ADAPTER_KEY}". ` +
        `Valid options: ${Object.keys(ADAPTERS).join(', ')}.`
    );
}

export default authService;
