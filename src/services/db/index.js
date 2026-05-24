/**
 * Database Service — active adapter entry point
 *
 * Which adapter runs is controlled by VITE_DB_ADAPTER in your .env:
 *
 *   VITE_DB_ADAPTER=firebase   → uses Firebase Realtime Database (default)
 *   VITE_DB_ADAPTER=rest       → uses any REST API backend
 *
 * Every component, hook, and utility that needs to read or write data imports
 * from THIS file — never from firebase/database directly.
 *
 * Usage:
 *   import { dbGet, dbPush, dbUpdate, dbRemove, dbSet, dbSubscribe } from '../../services/db';
 *
 *   // Read
 *   const data = await dbGet(`organizations/${orgId}/incidents`);
 *
 *   // Write
 *   const newId = await dbPush(`organizations/${orgId}/incidents`, payload);
 *   await dbUpdate(`organizations/${orgId}/incidents/${id}`, changes);
 *   await dbRemove(`organizations/${orgId}/incidents/${id}`);
 *
 *   // Real-time
 *   const unsub = dbSubscribe(`organizations/${orgId}/users/${uid}`, (value) => { ... });
 *   // later: unsub();
 */

import firebaseAdapter from './adapters/firebase.js';
import restAdapter    from './adapters/rest.js';

// ─── adapter selection ────────────────────────────────────────────────────────
// Priority: localStorage (set by /setup page) → VITE_DB_ADAPTER env var → 'firebase'
const _runtimeAdapter = (() => {
    try { return localStorage.getItem('ohsms_db_adapter'); } catch { return null; }
})();

const ADAPTER_KEY = _runtimeAdapter || import.meta.env.VITE_DB_ADAPTER || 'firebase';

const ADAPTERS = {
    firebase: firebaseAdapter,
    rest:     restAdapter,
};

const adapter = ADAPTERS[ADAPTER_KEY];

if (!adapter) {
    throw new Error(
        `[db] Unknown VITE_DB_ADAPTER="${ADAPTER_KEY}". ` +
        `Valid options: ${Object.keys(ADAPTERS).join(', ')}.`
    );
}

// ─── named exports (the public API used by components) ───────────────────────

/**
 * Read a path and return its value, or null if it doesn't exist.
 * @param {string} path
 * @returns {Promise<any|null>}
 */
export const dbGet = (path) => adapter.get(path);

/**
 * Query a collection filtered by a single field=value constraint.
 * @param {string} path
 * @param {string} field
 * @param {*}      value
 * @returns {Promise<Record<string,any>|null>}
 */
export const dbQuery = (path, field, value) => adapter.query(path, field, value);

/**
 * Overwrite a path completely.
 * @param {string} path
 * @param {*}      data
 */
export const dbSet = (path, data) => adapter.set(path, data);

/**
 * Create a new child under the given path and return its generated ID.
 * @param {string} path
 * @param {*}      data
 * @returns {Promise<string>}
 */
export const dbPush = (path, data) => adapter.push(path, data);

/**
 * Merge partial data into a path (shallow update).
 * @param {string} path
 * @param {object} data
 */
export const dbUpdate = (path, data) => adapter.update(path, data);

/**
 * Delete a path entirely.
 * @param {string} path
 */
export const dbRemove = (path) => adapter.remove(path);

/**
 * Atomic multi-path update using full root-relative paths as keys.
 * In Firebase this is a single atomic operation; in REST it's parallel requests.
 *
 * @param {Record<string, any>} pathsObj  e.g. { "organizations/o1/users/u1/role": "Admin" }
 */
export const dbMultiUpdate = (pathsObj) => adapter.multiUpdate(pathsObj);

/**
 * Subscribe to real-time changes at a path.
 * With the Firebase adapter this is a live listener; with REST it polls.
 *
 * @param {string}   path
 * @param {function} callback   Called with the value whenever it changes
 * @param {function} [errCb]    Called on error
 * @returns {function}          Unsubscribe / stop-polling function
 */
export const dbSubscribe = (path, callback, errCb) =>
    adapter.subscribe(path, callback, errCb);

// ─── convenience: org-scoped helpers ─────────────────────────────────────────
// These mirror the most common pattern: `organizations/${orgId}/${collection}`

export const orgPath = (orgId, ...segments) =>
    ['organizations', orgId, ...segments].filter(Boolean).join('/');

export const orgGet    = (orgId, ...segments) => dbGet(orgPath(orgId, ...segments));
export const orgSet    = (orgId, data, ...segments) => dbSet(orgPath(orgId, ...segments), data);
export const orgPush   = (orgId, collection, data) => dbPush(orgPath(orgId, collection), data);
export const orgUpdate = (orgId, data, ...segments) => dbUpdate(orgPath(orgId, ...segments), data);
export const orgRemove = (orgId, ...segments) => dbRemove(orgPath(orgId, ...segments));
export const orgSubscribe = (orgId, callback, errCb, ...segments) =>
    dbSubscribe(orgPath(orgId, ...segments), callback, errCb);

// ─── re-export REST token helpers ────────────────────────────────────────────
// The auth service uses these when signing in/out with the REST adapter.
export { setRestToken, clearRestToken } from './adapters/rest.js';

// ─── default export (the raw adapter, for advanced/edge cases) ───────────────
export default adapter;
