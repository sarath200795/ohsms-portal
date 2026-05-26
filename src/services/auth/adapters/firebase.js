/**
 * Firebase Authentication Adapter
 *
 * Wraps firebase/auth so no other file needs to import it directly.
 *
 * User provisioning (createUser / deleteUser) is delegated to the server-side
 * /api/admin/users endpoint which uses Firebase Admin SDK.  This prevents
 * client-side Auth manipulation with a stolen Global Owner token.
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
     * Create a new Firebase Auth account via the server-side Admin SDK endpoint.
     * The browser never directly creates Auth accounts; all provisioning is
     * delegated to /api/admin/users which verifies caller permissions server-side.
     *
     * @param {string} email
     * @param {object} payload  { name, role, assignedSite, accessibleSites, accessibleModules, orgId }
     * @returns {Promise<{uid: string, temporaryPassword: string}>}
     */
    async createUser(email, payload) {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('No authenticated admin session found.');

        const idToken = await currentUser.getIdToken();
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, email, callerIdToken: idToken }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
        return data; // { uid, temporaryPassword }
    },

    /**
     * Delete a user's Firebase Auth account via the server-side Admin SDK endpoint.
     * Also removes the RTDB user records server-side.
     *
     * @param {string} uid    Firebase Auth UID of the user to delete
     * @param {string} orgId  Organisation ID (used to verify caller belongs to org)
     */
    async deleteUser(uid, orgId) {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('No authenticated admin session found.');

        const idToken = await currentUser.getIdToken();
        const res = await fetch('/api/admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, orgId, callerIdToken: idToken }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
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
