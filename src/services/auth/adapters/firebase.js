/**
 * Firebase Authentication Adapter
 *
 * Wraps firebase/auth so no other file needs to import it directly.
 */

import {
    createUserWithEmailAndPassword,
    deleteUser as fbDeleteUser,
    EmailAuthProvider,
    getAuth,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut as fbSignOut,
    updatePassword as fbUpdatePassword,
} from 'firebase/auth';
import { deleteApp, getApps, initializeApp } from 'firebase/app';
import { auth, firebaseConfig } from '../../../config/firebase.js';

// Secondary app used when an admin creates new users without destroying the
// admin's own session (the standard Firebase multi-app pattern).
const PROVISIONING_APP = 'ohsms-user-provisioning';

const getProvisioningAuth = () => {
    const existing = getApps().find((a) => a.name === PROVISIONING_APP);
    return getAuth(existing || initializeApp(firebaseConfig, PROVISIONING_APP));
};

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
     * Create a new Firebase Auth account (using the secondary provisioning app
     * so the admin's session is not affected).
     * @returns {Promise<string>}  The new user's UID
     */
    async createUser(email, password) {
        const provAuth = getProvisioningAuth();
        const cred = await createUserWithEmailAndPassword(provAuth, email, password);
        const uid = cred.user.uid;
        await fbSignOut(provAuth); // always sign out of the provisioning app
        return uid;
    },

    /**
     * Delete a user's Firebase Auth account.
     * NOTE: Requires re-auth for the current user in some security models;
     * for admin deletion we re-use the provisioning app approach.
     * @param {string} uid  Not directly usable — Firebase can only delete the
     *                      currently-signed-in user. Pass the provisioning auth
     *                      user object from a prior createUser flow when possible.
     */
    async deleteUser(userOrUid) {
        if (typeof userOrUid === 'object' && userOrUid.delete) {
            // Firebase User object passed directly
            await fbDeleteUser(userOrUid);
        } else {
            // uid string — we can only delete the currently-signed-in user
            const current = auth.currentUser;
            if (current && current.uid === userOrUid) {
                await fbDeleteUser(current);
            } else {
                console.warn('[auth:firebase] deleteUser: cannot delete other users from client side. Use Admin SDK on the server.');
            }
        }
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
