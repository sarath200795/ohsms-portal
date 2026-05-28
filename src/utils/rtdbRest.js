/**
 * Firebase RTDB REST helper
 *
 * Provides HTTPS-based read/write operations for Firebase Realtime Database,
 * bypassing the SDK WebSocket.  Use this on critical initial-load paths where
 * a blocked or slow WebSocket would hang the UI indefinitely.
 *
 * Every method has a built-in 15-second AbortController timeout.
 *
 * Usage:
 *   import { rtdbRest, isFirebaseRestAvailable } from '../utils/rtdbRest.js';
 *   if (isFirebaseRestAvailable()) {
 *     const idToken = await authService.getIdToken();
 *     const data = await rtdbRest.get('organizations/orgId/details', idToken);
 *   }
 */

import { firebaseConfig } from '../config/firebase.js';

const TIMEOUT_MS = 5_000;

/** Resolve the active DB adapter ('firebase' | 'rest'). */
const _getAdapter = () => {
    try {
        return (
            localStorage.getItem('ohsms_db_adapter') ||
            (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_DB_ADAPTER : '') ||
            'firebase'
        );
    } catch {
        return 'firebase';
    }
};

/**
 * Returns the RTDB base URL (no trailing slash), or '' if not configured.
 * Reads from the already-resolved `firebaseConfig` object which handles
 * the localStorage → env-var priority chain automatically.
 */
export const getDbUrl = () => String(firebaseConfig.databaseURL || '').replace(/\/$/, '');

/**
 * Whether Firebase RTDB REST calls are available for the current session.
 * Returns false when the active adapter is a custom REST backend (not
 * Firebase), in which case callers should use dbGet / dbSet instead.
 */
export const isFirebaseRestAvailable = () => _getAdapter() === 'firebase' && Boolean(getDbUrl());

// ─── Internal fetch helper ────────────────────────────────────────────────────

const _fetch = async (url, options = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
            // Firebase returns null for nodes that don't exist (not a 404),
            // but handle 404 defensively.
            if (res.status === 404) return null;
            const msg =
                json && typeof json === 'object'
                    ? json.error || `HTTP ${res.status}`
                    : `HTTP ${res.status}`;
            throw new Error(`[rtdbRest] ${msg}`);
        }

        return json; // null when the RTDB node does not exist
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(
                '[rtdbRest] Request timed out after 5 s. ' +
                'Check that your Firebase Realtime Database is accessible and that ' +
                'the database URL is correct.'
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

const buildUrl = (path, idToken) => {
    const dbUrl = getDbUrl();
    if (!dbUrl) throw new Error('[rtdbRest] Firebase Database URL is not configured.');
    const auth = idToken ? `?auth=${encodeURIComponent(idToken)}` : '';
    // Normalise path — strip leading slash so we don't get double slashes.
    const cleanPath = String(path).replace(/^\//, '');
    return `${dbUrl}/${cleanPath}.json${auth}`;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const rtdbRest = {
    /**
     * GET a RTDB path.
     * @returns {Promise<any>} the node value, or null if it does not exist.
     */
    async get(path, idToken) {
        return _fetch(buildUrl(path, idToken));
    },

    /**
     * PUT (overwrite) a RTDB path.
     */
    async set(path, data, idToken) {
        return _fetch(buildUrl(path, idToken), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    /**
     * POST to a RTDB path (generates a push key like dbPush).
     * @returns {Promise<{name: string}>} where name is the generated push key.
     */
    async push(path, data, idToken) {
        return _fetch(buildUrl(path, idToken), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    /**
     * PATCH (shallow merge) a RTDB path.
     */
    async update(path, data, idToken) {
        return _fetch(buildUrl(path, idToken), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    /**
     * DELETE a RTDB path.
     */
    async remove(path, idToken) {
        return _fetch(buildUrl(path, idToken), { method: 'DELETE' });
    },
};
