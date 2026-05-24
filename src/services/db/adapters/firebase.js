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

// ─── adapter ─────────────────────────────────────────────────────────────────

const firebaseAdapter = {
    /**
     * Read an entire path (object or primitive).
     * @param {string} path  e.g. "organizations/org123/incidents"
     * @returns {Promise<any|null>}
     */
    async get(path) {
        const snap = await get(dbRef(path));
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
        const snap = await get(fbQuery(dbRef(path), orderByChild(field), equalTo(value)));
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
