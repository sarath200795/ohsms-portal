/**
 * Firebase Authentication Adapter
 *
 * Wraps firebase/auth so no other file needs to import it directly.
 *
 * User provisioning strategy
 * ──────────────────────────
 * createUser  — POSTs to /api/admin/users (Vercel serverless function).
 *               The Firebase Admin SDK on the server creates the Auth account
 *               and writes all three RTDB records atomically, bypassing all
 *               client-side RTDB security rules.  Requires env vars:
 *               FIREBASE_SERVICE_ACCOUNT_JSON + FIREBASE_DATABASE_URL (Vercel).
 *
 * deleteUser  — tries the server-side /api/admin/users endpoint first so the
 *               Firebase Auth account is fully removed.  If the endpoint is not
 *               configured (FIREBASE_SERVICE_ACCOUNT_JSON missing), falls back
 *               to removing RTDB records only — the Auth account survives but
 *               the user is effectively locked out because RTDB rules deny
 *               access without valid userDirectory / org records.
 */

import {
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut as fbSignOut,
    updatePassword as fbUpdatePassword,
} from 'firebase/auth';
import { auth } from '../../../config/firebase.js';
import { dbRemove } from '../../db/index.js';

// ── Adapter ──────────────────────────────────────────────────────────────────

const firebaseAuthAdapter = {
    /**
     * Sign in with email + password.
     * @returns {Promise<{uid, email}>}
     */
    async signIn(email, password) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return { uid: cred.user.uid, email: cred.user.email };
    },

    /** Sign out the current user. */
    async signOut() {
        await fbSignOut(auth);
    },

    /**
     * Return the currently signed-in user, or null.
     * @returns {{uid, email}|null}
     */
    getCurrentUser() {
        const u = auth.currentUser;
        return u ? { uid: u.uid, email: u.email } : null;
    },

    /**
     * Subscribe to auth-state changes.
     * @param {function} callback  Receives {uid, email} or null
     * @returns {function}         Unsubscribe
     */
    onAuthStateChanged(callback) {
        return onAuthStateChanged(auth, (user) =>
            callback(user ? { uid: user.uid, email: user.email } : null)
        );
    },

    /**
     * Create a new Firebase Auth account + RTDB records via the server-side
     * /api/admin/users endpoint.
     *
     * The Admin SDK on the server bypasses RTDB security rules entirely, so
     * the userDirectory mapping and org user record are written atomically
     * without any client-side permission issues.
     *
     * @param {string} email
     * @param {object} payload  { name, role, assignedSite, accessibleSites,
     *                            accessibleModules, orgId }
     * @returns {Promise<{uid: string, temporaryPassword: string}>}
     */
    async createUser(email, payload) {
        const { orgId } = payload || {};
        if (!orgId) throw new Error('orgId is required to provision a user.');

        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('No authenticated admin session found.');

        const idToken = await currentUser.getIdToken();

        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, email, callerIdToken: idToken }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || `Server error ${res.status}`);
        }

        // data = { uid, temporaryPassword }
        return data;
    },

    /**
     * Delete a user's Firebase Auth account and RTDB records.
     *
     * Tries /api/admin/users first (fully removes the Auth account when the
     * server env vars are configured).  On a 500 "Server configuration error"
     * falls back to removing RTDB records only — the user is locked out even
     * though the Auth account survives.
     *
     * @param {string} uid
     * @param {string} orgId
     */
    async deleteUser(uid, orgId) {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('No authenticated admin session found.');

        // Try full server-side deletion first.
        try {
            const idToken = await currentUser.getIdToken();
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, orgId, callerIdToken: idToken }),
            });

            if (res.ok) return;

            const data = await res.json().catch(() => ({}));
            const isConfigError =
                res.status === 500 &&
                (data.error || '').toLowerCase().includes('server configuration');

            if (!isConfigError) {
                throw new Error(data.error || `Server error ${res.status}`);
            }

            console.warn(
                '[authService.deleteUser] Server-side deletion not configured. ' +
                'Falling back to RTDB-only removal.'
            );
        } catch (fetchErr) {
            if (fetchErr.message?.includes('Server error') || fetchErr.message?.includes('admin session')) throw fetchErr;
            console.warn('[authService.deleteUser] Server endpoint unreachable:', fetchErr.message);
        }

        // Fallback — remove RTDB records so the account is locked out.
        await dbRemove(`organizations/${orgId}/users/${uid}`);
        await dbRemove(`organizations/${orgId}/userPasswordState/${uid}`);
        await dbRemove(`userDirectory/${uid}`);
    },

    /** Send a password-reset email. */
    async sendPasswordReset(email) {
        await sendPasswordResetEmail(auth, email);
    },

    /**
     * Update the currently signed-in user's password.
     * @param {string} newPassword
     */
    async updatePassword(newPassword) {
        if (!auth.currentUser) throw new Error('No user signed in');
        await fbUpdatePassword(auth.currentUser, newPassword);
    },

    /**
     * Re-authenticate the current user (required before sensitive operations).
     * @param {string} email
     * @param {string} password
     */
    async reauthenticate(email, password) {
        if (!auth.currentUser) throw new Error('No user signed in');
        const credential = EmailAuthProvider.credential(email, password);
        await reauthenticateWithCredential(auth.currentUser, credential);
    },
};

export default firebaseAuthAdapter;
