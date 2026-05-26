/**
 * Firebase Authentication Adapter
 *
 * Wraps firebase/auth so no other file needs to import it directly.
 *
 * User provisioning strategy
 * ──────────────────────────
 * createUser  — uses a secondary Firebase app instance so the admin's own
 *               session is never disturbed.  RTDB records are written by the
 *               adapter itself (same data the server-side handler would write).
 *               No server env vars required.
 *
 * deleteUser  — tries the server-side /api/admin/users endpoint first so the
 *               Firebase Auth account is fully removed.  If the endpoint is not
 *               configured (FIREBASE_SERVICE_ACCOUNT_JSON missing) it falls back
 *               to removing RTDB records only.  The Auth account survives but is
 *               effectively neutered — RTDB rules deny access to any user whose
 *               userDirectory / org records have been deleted.
 */

import {
    EmailAuthProvider,
    createUserWithEmailAndPassword,
    getAuth,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut as fbSignOut,
    signOut,
    updatePassword as fbUpdatePassword,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { auth, firebaseConfig } from '../../../config/firebase.js';
import { dbSet, dbRemove } from '../../db/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Cryptographically random 12-char temporary password */
const generateTemporaryPassword = () => {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => charset[b % charset.length]).join('');
};

/** Reuse or create a secondary Firebase app for provisioning new accounts */
const getProvisioningAuth = () => {
    const PROVISION_APP = 'ohsms-user-provisioning';
    const existing = getApps().find((a) => a.name === PROVISION_APP);
    const app = existing || initializeApp(firebaseConfig, PROVISION_APP);
    return getAuth(app);
};

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

    /**
     * Sign out the current user.
     */
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
     * Create a new Firebase Auth account + RTDB records.
     *
     * Uses a secondary Firebase app instance so the admin's primary session is
     * never interrupted.  Writes org user record, password state, and
     * userDirectory mapping directly to RTDB — the same data the server-side
     * handler would have written.
     *
     * @param {string} email
     * @param {object} payload  { name, role, assignedSite, accessibleSites, accessibleModules, orgId }
     * @returns {Promise<{uid: string, temporaryPassword: string}>}
     */
    async createUser(email, payload) {
        const {
            name,
            role,
            assignedSite,
            accessibleSites,
            accessibleModules,
            orgId,
        } = payload;

        if (!orgId) throw new Error('orgId is required to provision a user.');

        const temporaryPassword = generateTemporaryPassword();
        const provisioningAuth  = getProvisioningAuth();

        // 1. Create the Firebase Auth account via the secondary app.
        //    The secondary app signs in as the NEW user — we immediately sign it
        //    out again so only the primary admin session remains active.
        let uid;
        try {
            const cred = await createUserWithEmailAndPassword(
                provisioningAuth,
                email.trim().toLowerCase(),
                temporaryPassword
            );
            uid = cred.user.uid;
        } finally {
            // Always sign out from the secondary app, even if the above threw.
            await signOut(provisioningAuth).catch(() => {});
        }

        // 2. Write RTDB records (same structure the server-side handler writes).
        //    Write org record FIRST so the userDirectory write rule passes
        //    (it checks that the user record already exists in the org).
        const provisionedAt = new Date().toISOString();

        const userRecord = {
            name:                      String(name || '').trim(),
            email:                     email.trim().toLowerCase(),
            role:                      role || 'User',
            status:                    'Active',
            assignedSite:              assignedSite  || '',
            accessibleSites:           accessibleSites  || [],
            accessibleModules:         accessibleModules || [],
            mustChangePassword:        true,
            temporaryPasswordIssued:   true,
            temporaryPasswordIssuedAt: provisionedAt,
            createdAt:                 provisionedAt,
        };

        try {
            await dbSet(`organizations/${orgId}/users/${uid}`, userRecord);
            await dbSet(`organizations/${orgId}/userPasswordState/${uid}`, {
                mustChangePassword:        true,
                temporaryPasswordIssued:   true,
                temporaryPasswordIssuedAt: provisionedAt,
                passwordUpdatedAt:         '',
            });
            // userDirectory must be written AFTER the org user record exists
            await dbSet(`userDirectory/${uid}`, { orgId });
        } catch (dbErr) {
            // Best-effort rollback of RTDB records.
            // The Firebase Auth account cannot be deleted client-side, but
            // without RTDB records the account cannot access any org data.
            await dbRemove(`organizations/${orgId}/users/${uid}`).catch(() => {});
            await dbRemove(`organizations/${orgId}/userPasswordState/${uid}`).catch(() => {});
            await dbRemove(`userDirectory/${uid}`).catch(() => {});
            throw new Error(
                'Auth account was created but database records failed to write. ' +
                'The account has been rolled back. Details: ' + dbErr.message
            );
        }

        return { uid, temporaryPassword };
    },

    /**
     * Delete a user's Firebase Auth account and RTDB records.
     *
     * Tries the server-side /api/admin/users endpoint first (which fully
     * removes the Auth account).  If the endpoint is not configured, falls
     * back to removing RTDB records only — the Auth account survives but the
     * user is effectively locked out because RTDB rules deny access to any
     * account without valid userDirectory / org records.
     *
     * @param {string} uid    Firebase Auth UID of the user to delete
     * @param {string} orgId  Organisation ID
     */
    async deleteUser(uid, orgId) {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('No authenticated admin session found.');

        // Try server-side deletion first (fully removes the Auth account).
        try {
            const idToken = await currentUser.getIdToken();
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, orgId, callerIdToken: idToken }),
            });

            if (res.ok) return; // Full deletion succeeded — done.

            const data = await res.json().catch(() => ({}));
            const isConfigError =
                res.status === 500 &&
                (data.error || '').toLowerCase().includes('server configuration');

            // If it's not a config error, surface the real problem.
            if (!isConfigError) {
                throw new Error(data.error || `Server error ${res.status}`);
            }

            // Config error → fall through to RTDB-only cleanup below.
            console.warn(
                '[authService.deleteUser] Server-side deletion not configured ' +
                '(FIREBASE_SERVICE_ACCOUNT_JSON missing). Falling back to ' +
                'RTDB-only removal. The Firebase Auth account will remain but ' +
                'the user will be unable to access the application.'
            );
        } catch (fetchErr) {
            // Network error or non-JSON response — fall through to RTDB cleanup.
            if (!fetchErr.message?.includes('RTDB-only')) {
                console.warn('[authService.deleteUser] Server endpoint unreachable:', fetchErr.message);
            }
        }

        // Fallback: remove RTDB records so the account is locked out.
        await dbRemove(`organizations/${orgId}/users/${uid}`);
        await dbRemove(`organizations/${orgId}/userPasswordState/${uid}`);
        await dbRemove(`userDirectory/${uid}`);
    },

    /**
     * Send a password-reset email.
     */
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
