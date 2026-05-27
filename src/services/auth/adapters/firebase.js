/**
 * Firebase Authentication Adapter
 *
 * Wraps firebase/auth so no other file needs to import it directly.
 *
 * User provisioning strategy
 * ──────────────────────────
 * createUser  — Tries the /api/admin/users Vercel serverless endpoint first.
 *               If the endpoint is unavailable (app deployed to Firebase Hosting
 *               without Vercel, or FIREBASE_SERVICE_ACCOUNT_JSON not set), falls
 *               back to client-side provisioning: a secondary Firebase app creates
 *               the Auth account, then the admin client writes the three RTDB
 *               records directly (RTDB rules permit this for Global Owner / Site Owner).
 *
 * deleteUser  — tries the server-side /api/admin/users endpoint first so the
 *               Firebase Auth account is fully removed.  If the endpoint is not
 *               configured (FIREBASE_SERVICE_ACCOUNT_JSON missing), falls back
 *               to removing RTDB records only — the Auth account survives but
 *               the user is effectively locked out because RTDB rules deny
 *               access without valid userDirectory / org records.
 */

import { deleteApp, initializeApp } from 'firebase/app';
import {
    EmailAuthProvider,
    createUserWithEmailAndPassword,
    getAuth,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut as fbSignOut,
    updatePassword as fbUpdatePassword,
} from 'firebase/auth';
import { auth } from '../../../config/firebase.js';
import { dbRemove, dbSet } from '../../db/index.js';

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
     * Create a new Firebase Auth account + RTDB records.
     *
     * Tries the server-side /api/admin/users endpoint first (Vercel). Falls back
     * to client-side provisioning when the endpoint is unavailable — e.g. when
     * the app is deployed to Firebase Hosting without Vercel, where the SPA
     * catch-all rewrite returns 200 HTML instead of the expected JSON.
     *
     * Client-side fallback uses a secondary Firebase app to create the Auth account
     * (same pattern as Contractors vendor portal), then writes the three RTDB
     * records as the admin. RTDB rules permit this for Global Owner / Site Owner
     * provided the org user record is written before the userDirectory entry.
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

        // ── 1. Try server-side endpoint ─────────────────────────────────────
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, email, callerIdToken: idToken }),
            });

            const data = await res.json().catch(() => null);

            if (res.ok && data?.uid) return data;

            // Surface real business errors — do not fall back
            if (!res.ok && data?.error && [400, 401, 403, 409].includes(res.status)) {
                throw Object.assign(new Error(data.error), { _propagate: true });
            }

            // 404, 500 config error, or non-JSON 200 (Firebase Hosting SPA rewrite) — fall back
            console.warn('[authService.createUser] Server endpoint unavailable; using client-side fallback.');
        } catch (err) {
            if (err._propagate || err.message?.includes('admin session')) throw err;
            console.warn('[authService.createUser] Server error:', err.message);
        }

        // ── 2. Client-side fallback ─────────────────────────────────────────
        const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        const temporaryPassword = Array.from(bytes, (b) => charset[b % charset.length]).join('');
        const provisionedAt = new Date().toISOString();

        // Create Auth account via secondary app so the admin session is untouched
        let newUid;
        let tempApp;
        try {
            tempApp = initializeApp(auth.app.options, `ohsms-user-provisioning-${Date.now()}`);
            const tempAuth = getAuth(tempApp);
            const cred = await createUserWithEmailAndPassword(
                tempAuth, email.trim().toLowerCase(), temporaryPassword
            );
            newUid = cred.user.uid;
            await fbSignOut(tempAuth);
        } catch (authErr) {
            if (authErr.code === 'auth/email-already-in-use') {
                throw new Error('This email already has an existing account. Ask the user to use the join code or reset their password.');
            }
            throw authErr;
        } finally {
            if (tempApp) await deleteApp(tempApp).catch(() => {});
        }

        const { name, role, assignedSite, accessibleSites, accessibleModules } = payload;
        const newUserPayload = {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role,
            assignedSite: role === 'Global Owner' ? 'GLOBAL' : (assignedSite || ''),
            accessibleSites: role === 'Global Owner' ? [] : (Array.isArray(accessibleSites) ? accessibleSites : []),
            accessibleModules: role !== 'User' ? [] : (Array.isArray(accessibleModules) ? accessibleModules : []),
            status: 'Active',
            mustChangePassword: true,
            temporaryPasswordIssued: true,
            temporaryPasswordIssuedAt: provisionedAt,
            provisionedBy: currentUser.uid,
            createdAt: provisionedAt,
        };

        try {
            // org user record must exist before userDirectory — RTDB rule dependency
            await dbSet(`organizations/${orgId}/users/${newUid}`, newUserPayload);
            await dbSet(`organizations/${orgId}/userPasswordState/${newUid}`, {
                mustChangePassword: true,
                temporaryPasswordIssued: true,
                temporaryPasswordIssuedAt: provisionedAt,
                passwordUpdatedAt: '',
            });
            await dbSet(`userDirectory/${newUid}`, { orgId });
        } catch (dbErr) {
            // Rollback RTDB records
            await dbRemove(`organizations/${orgId}/users/${newUid}`).catch(() => {});
            await dbRemove(`organizations/${orgId}/userPasswordState/${newUid}`).catch(() => {});
            await dbRemove(`userDirectory/${newUid}`).catch(() => {});
            // Best-effort: delete the orphaned Auth account
            try {
                const rbApp = initializeApp(auth.app.options, `ohsms-rollback-${Date.now()}`);
                const rbAuth = getAuth(rbApp);
                await signInWithEmailAndPassword(rbAuth, email.trim().toLowerCase(), temporaryPassword);
                await rbAuth.currentUser.delete();
                await deleteApp(rbApp).catch(() => {});
            } catch { /* best-effort */ }
            throw new Error('Failed to write user records to database. The Auth account was rolled back.');
        }

        return { uid: newUid, temporaryPassword };
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
