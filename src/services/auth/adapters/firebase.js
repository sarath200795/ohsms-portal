/**
 * Firebase Authentication Adapter
 *
 * Wraps firebase/auth so no other file needs to import it directly.
 *
 * User provisioning strategy
 * ──────────────────────────
 * createUser  — calls the Firebase Auth REST API (accounts:signUp) directly
 *               via fetch rather than via the SDK.  This creates the Auth
 *               account without touching the SDK's auth-state machinery, so
 *               the admin's primary session and RTDB WebSocket connection are
 *               never disrupted.  RTDB records are then written immediately
 *               using the admin's already-authenticated primary app.
 *               No server env vars required.
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

/**
 * Create a Firebase Auth account via the REST API without touching the
 * SDK auth-state.  Returns the new user's UID.
 *
 * Using fetch directly (instead of createUserWithEmailAndPassword) means:
 *  - No secondary app instance is created or signed in.
 *  - The admin's primary session and RTDB WebSocket stay untouched.
 *  - PERMISSION_DENIED from a disrupted auth context is impossible.
 */
const createAuthAccountViaRest = async (email, password) => {
    const apiKey = firebaseConfig.apiKey;
    if (!apiKey) {
        throw new Error(
            'Firebase API key is not configured.  ' +
            'Set VITE_FIREBASE_API_KEY or use the /setup wizard.'
        );
    }

    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: false }),
        }
    );

    const data = await res.json();

    if (!res.ok) {
        const msg = data?.error?.message || `Auth REST error ${res.status}`;
        // Translate common Firebase error codes to human-readable messages.
        if (msg === 'EMAIL_EXISTS') throw new Error('This email address is already registered.');
        if (msg === 'INVALID_EMAIL') throw new Error('The email address is not valid.');
        if (msg === 'WEAK_PASSWORD : Password should be at least 6 characters') {
            throw new Error('Generated password is too weak — this should not happen.');
        }
        throw new Error(msg);
    }

    // `localId` is Firebase's name for the user's UID in REST responses.
    if (!data.localId) throw new Error('Firebase did not return a user ID.');
    return data.localId;
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
     * The Auth account is created via the Firebase Auth REST API (not the
     * SDK) to avoid any disruption to the admin's active session.  RTDB
     * records are then written immediately under the admin's auth.
     *
     * @param {string} email
     * @param {object} payload  { name, role, assignedSite, accessibleSites,
     *                            accessibleModules, orgId }
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

        // 1. Create the Firebase Auth account via REST (no SDK auth-state impact).
        const uid = await createAuthAccountViaRest(
            email.trim().toLowerCase(),
            temporaryPassword
        );

        // 2. Write RTDB records under the admin's authenticated primary session.
        //    Write org record FIRST — the userDirectory write rule verifies that
        //    the org user record already exists before allowing the mapping write.
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

        // Step A — org user record (must exist before step C).
        // Split into separate try-catch blocks so the exact failing path is
        // surfaced in the error message for easier debugging.
        try {
            await dbSet(`organizations/${orgId}/users/${uid}`, userRecord);
        } catch (dbErr) {
            // Best-effort rollback.  Auth account cannot be deleted client-side;
            // without RTDB records the account is effectively locked out.
            await dbRemove(`organizations/${orgId}/users/${uid}`).catch(() => {});
            throw new Error(
                `Failed writing user record [organizations/${orgId}/users/${uid}]: ` +
                dbErr.message
            );
        }

        // Step B — password state.
        // NOTE: Firebase RTDB silently drops empty-string values, which would
        // cause the `.validate` rule (hasChildren + isString on passwordUpdatedAt)
        // to fail with PERMISSION_DENIED.  Use the provisionedAt timestamp here
        // instead of an empty string.
        try {
            await dbSet(`organizations/${orgId}/userPasswordState/${uid}`, {
                mustChangePassword:        true,
                temporaryPasswordIssued:   true,
                temporaryPasswordIssuedAt: provisionedAt,
                passwordUpdatedAt:         provisionedAt, // never empty — Firebase drops ''
            });
        } catch (dbErr) {
            await dbRemove(`organizations/${orgId}/users/${uid}`).catch(() => {});
            await dbRemove(`organizations/${orgId}/userPasswordState/${uid}`).catch(() => {});
            throw new Error(
                `Failed writing password state [organizations/${orgId}/userPasswordState/${uid}]: ` +
                dbErr.message
            );
        }

        // Step C — userDirectory mapping (rule verifies step A record exists first).
        try {
            await dbSet(`userDirectory/${uid}`, { orgId });
        } catch (dbErr) {
            await dbRemove(`organizations/${orgId}/users/${uid}`).catch(() => {});
            await dbRemove(`organizations/${orgId}/userPasswordState/${uid}`).catch(() => {});
            await dbRemove(`userDirectory/${uid}`).catch(() => {});
            throw new Error(
                `Failed writing userDirectory mapping [userDirectory/${uid}]: ` +
                dbErr.message
            );
        }

        return { uid, temporaryPassword };
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
