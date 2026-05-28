/**
 * Firebase Realtime Database Adapter
 *
 * Wraps the Firebase SDK so the rest of the app never imports
 * firebase/database directly. Swap this file out (or add a new adapter)
 * to point the app at any other data store.
 */

import {
    equalTo,
    get,
    off,
    onValue,
    orderByChild,
    push as fbPush,
    query as fbQuery,
    ref,
    remove as fbRemove,
    set as fbSet,
    update as fbUpdate,
} from 'firebase/database';
import { rtdb } from '../../../config/firebase.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const dbRef = (path) => ref(rtdb, path);

/**
 * Wraps a Firebase SDK read promise with a 15-second timeout.
 *
 * The RTDB SDK sends read requests over a single shared WebSocket.  If that
 * WebSocket is blocked (CSP, network policy, regional database URL not covered
 * by the wildcard, etc.) the SDK quietly queues every request and NEVER
 * resolves or rejects — causing every page that awaits a dbGet to spin
 * indefinitely.  Wrapping with Promise.race gives callers a guaranteed
 * rejection after 15 s so their `finally` blocks can clear loading states.
 *
 * The 15 s window is intentionally generous: it covers legitimate slow
 * network conditions while still being short enough to unblock the UI in a
 * reasonable time.  After a timeout the underlying SDK operation stays in the
 * internal queue (no side effects for reads) and resolves silently if the
 * connection is later established.
 */
const DB_READ_TIMEOUT_MS = 5_000;

const withReadTimeout = (sdkPromise) => {
    let timer;
    const timeoutP = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(
                '[db:firebase] read timed out after 5 s. ' +
                'The WebSocket connection to Firebase Realtime Database may be ' +
                'blocked. Check the database URL and Content Security Policy.'
            ));
        }, DB_READ_TIMEOUT_MS);
    });
    return Promise.race([sdkPromise, timeoutP]).finally(() => clearTimeout(timer));
};

// ─── adapter ─────────────────────────────────────────────────────────────────

const firebaseAdapter = {
    /**
     * Read an entire path (object or primitive).
     * @param {string} path  e.g. "organizations/org123/incidents"
     * @returns {Promise<any|null>}
     */
    async get(path) {
        const snap = await withReadTimeout(get(dbRef(path)));
        return snap.exists() ? snap.val() : null;
    },

    /**
     * Query a collection by a single field value.
     * @param {string} path
     * @param {string} field      Child field to filter on (orderByChild)
     * @param {*}      value      Value to match (equalTo)
     * @returns {Promise<Record<string,any>|null>}
     */
    async query(path, field, value) {
        const snap = await withReadTimeout(get(fbQuery(dbRef(path), orderByChild(field), equalTo(value))));
        return snap.exists() ? snap.val() : null;
    },

    /**
     * Overwrite a path completely (Firebase set).
     * @param {string} path
     * @param {*}      data
     */
    async set(path, data) {
        await fbSet(dbRef(path), data);
    },

    /**
     * Push a new child under path (Firebase push).
     * @param {string} path
     * @param {*}      data
     * @returns {Promise<string>} The generated child key
     */
    async push(path, data) {
        const newRef = await fbPush(dbRef(path), data);
        return newRef.key;
    },

    /**
     * Merge partial data into path (Firebase update).
     * @param {string} path
     * @param {object} data  Shallow-merge object
     */
    async update(path, data) {
        await fbUpdate(dbRef(path), data);
    },

    /**
     * Delete a path (Firebase remove).
     * @param {string} path
     */
    async remove(path) {
        await fbRemove(dbRef(path));
    },

    /**
     * Atomic multi-path update at the database root.
     * Keys are full paths (e.g. "organizations/org1/users/uid1/role"),
     * values are the new data (null = delete).
     * @param {Record<string, any>} pathsObj
     */
    async multiUpdate(pathsObj) {
        await fbUpdate(ref(rtdb), pathsObj);
    },

    /**
     * Subscribe to real-time changes at a path.
     * @param {string}   path
     * @param {function} callback    Receives the current value (already .val())
     * @param {function} [errCb]     Receives Firebase error
     * @returns {function}           Call to unsubscribe
     */
    subscribe(path, callback, errCb) {
        const r = dbRef(path);
        onValue(
            r,
            (snap) => callback(snap.exists() ? snap.val() : null),
            errCb || ((err) => console.error('[db:firebase] subscribe error', err))
        );
        return () => off(r);
    },
};

export default firebaseAdapter;
