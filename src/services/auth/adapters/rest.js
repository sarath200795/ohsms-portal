/**
 * REST / JWT Authentication Adapter
 *
 * Talks to any HTTP backend that implements the OHSMS Auth contract:
 *
 *   POST   /auth/login            body: { email, password }
 *                                 returns: { token, uid, email, ... }
 *   POST   /auth/logout           header: Authorization: Bearer <token>
 *   POST   /auth/users            body: { email, password }  (admin create)
 *                                 returns: { uid }
 *   DELETE /auth/users/:uid       (admin delete)
 *   POST   /auth/password-reset   body: { email }
 *   PATCH  /auth/password         body: { newPassword }
 *   POST   /auth/reauth           body: { email, password }
 *
 * The JWT is stored in sessionStorage under OHSMS_JWT_KEY and injected into
 * every db/rest request via setRestToken().
 */

import { setRestToken, clearRestToken } from '../../db/adapters/rest.js';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const JWT_KEY  = 'ohsms_jwt';

let _token = sessionStorage.getItem(JWT_KEY) || null;
if (_token) setRestToken(_token);

// auth-state listeners (mirrors Firebase's onAuthStateChanged pattern)
const _listeners = new Set();
let _currentUser = null;

const _notify = (user) => {
    _currentUser = user;
    _listeners.forEach((cb) => cb(user));
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
});

async function authRequest(method, path, body) {
    const res = await fetch(`${BASE_URL}/${path}`, {
        method,
        headers: authHeaders(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`[auth:rest] ${method} /${path} → ${res.status}: ${text}`);
    }

    if (res.status === 204) return null;
    return res.json().catch(() => null);
}

// ─── adapter ─────────────────────────────────────────────────────────────────

const restAuthAdapter = {
    async signIn(email, password) {
        const result = await authRequest('POST', 'auth/login', { email, password });
        _token = result.token;
        sessionStorage.setItem(JWT_KEY, _token);
        setRestToken(_token);
        const user = { uid: result.uid, email: result.email };
        _notify(user);
        return user;
    },

    async signOut() {
        try { await authRequest('POST', 'auth/logout'); } catch { /* ignore */ }
        _token = null;
        sessionStorage.removeItem(JWT_KEY);
        clearRestToken();
        _notify(null);
    },

    getCurrentUser() {
        return _currentUser;
    },

    onAuthStateChanged(callback) {
        _listeners.add(callback);
        // Fire immediately with current state
        callback(_currentUser);
        return () => _listeners.delete(callback);
    },

    async createUser(email, password) {
        const result = await authRequest('POST', 'auth/users', { email, password });
        return result?.uid ?? null;
    },

    /**
     * Self-signup — same wire call as createUser for the REST backend, but
     * exposed as a separate method to mirror the Firebase adapter's API
     * (where register/createUser have distinct responsibilities).
     */
    async register(email, password) {
        const result = await authRequest('POST', 'auth/users', { email, password });
        return result?.uid ?? null;
    },

    /**
     * Best-effort cleanup of an orphaned account created by register().
     * Hits the same /auth/users/:uid endpoint as deleteUser but requires the
     * caller to sign in first so the REST backend can authorise self-delete.
     * Never throws.
     */
    async unregister(email, password) {
        try {
            const signInResult = await authRequest('POST', 'auth/login', { email, password });
            if (!signInResult?.uid) return false;
            await authRequest('DELETE', `auth/users/${signInResult.uid}`);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Not applicable for REST/JWT adapter — returns empty string.
     * (Firebase ID tokens are only available in the Firebase adapter.)
     */
    async getIdToken() {
        return '';
    },

    async deleteUser(uid) {
        await authRequest('DELETE', `auth/users/${uid}`);
    },

    async sendPasswordReset(email) {
        await authRequest('POST', 'auth/password-reset', { email });
    },

    async updatePassword(newPassword) {
        await authRequest('PATCH', 'auth/password', { newPassword });
    },

    async reauthenticate(email, password) {
        await authRequest('POST', 'auth/reauth', { email, password });
    },
};

export default restAuthAdapter;
