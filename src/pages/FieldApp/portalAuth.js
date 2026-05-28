import { dbGet } from '../../services/db/index.js';
import { auth, firebaseConfig } from '../../config/firebase';
import { getVisibleFieldModules } from './utils';
import { ACCOUNT_STATUS, canAuthenticateStatus, isPendingStatus, normalizeSessionData, readStoredSession } from '../../utils/session';

/**
 * Quick HTTPS probe of the configured databaseURL — fails in <3s with a
 * clear, actionable error instead of letting the 15s RTDB read-timeout
 * fire for an unreachable host (typically caused by a wrong databaseURL
 * saved to localStorage by the org picker).
 *
 * Firebase's REST endpoint at /<path>.json responds even without auth:
 *   • 401/403 → URL is correct, just unauthorized (treat as reachable)
 *   • any 2xx → URL is correct and the path is public
 *   • network error / timeout → URL is wrong, DB doesn't exist, or region mismatch
 */
const probeDatabaseUrl = async () => {
    const url = firebaseConfig?.databaseURL;
    if (!url) {
        throw new Error(
            'Firebase databaseURL is not configured. Open /setup or pick an ' +
            'organisation from the field portal home to connect a database.'
        );
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/.json?shallow=true`, {
            method: 'GET',
            signal: controller.signal,
            // Anonymous probe — no auth headers; 401/403 still proves reachability.
            mode: 'cors',
        });
        // Any HTTP response (even 401/403) means the host is reachable.
        return res.status;
    } catch {
        throw new Error(
            `Cannot reach Firebase Realtime Database at ${url}.\n\n` +
            'Likely causes:\n' +
            '  • The databaseURL is wrong (typo) — check Firebase Console → Realtime Database.\n' +
            '  • The database is in a different region — the URL should include the region for non-US databases ' +
            '(e.g. https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app).\n' +
            '  • The RTDB has not been created in this Firebase project yet.\n' +
            '  • A CSP/network policy is blocking the host.\n\n' +
            'Fix: open /setup or re-pick the organisation with the correct database URL.'
        );
    } finally {
        clearTimeout(t);
    }
};

export const FIELD_PORTAL_APP_NAME = 'field-portal-app';
export const FIELD_PORTAL_SESSION_KEY = 'fieldPortalSession';
export const FIELD_MODULE_HOME_CONTEXT_KEY = 'fieldModuleHomeContext';

/**
 * Return the auth instance the field portal should use for sign-in.
 *
 * IMPORTANT — we deliberately return the PRIMARY app's auth (not a secondary
 * "field-portal-app" instance) so that the RTDB connection used by dbGet()
 * inherits the field-portal user's auth token.  Without this, every RTDB
 * read in fetchFieldPortalContext() runs as unauthenticated against rules
 * that require `auth != null`, leaving the request indefinitely stalled
 * while the SDK waits for an auth token — which surfaces to the user as
 * "[db:firebase] read timed out after 5 s".
 *
 * Trade-off: signing into the field portal on the same browser as the main
 * app will sign out the main-app session.  This is acceptable because the
 * field portal is intended for dedicated mobile devices, and the main app
 * detects auth-state changes and redirects to /login automatically.
 */
export const getFieldPortalFirebase = () => {
    return { fieldAuth: auth };
};

export const readFieldPortalSession = () => {
    return readStoredSession(FIELD_PORTAL_SESSION_KEY);
};

const normalizePortalSite = (site) => {
    const value = String(site || '').trim();
    if (!value) return '';
    if (value === 'GLOBAL') return 'All';
    return value;
};

export const isFieldPortalSessionActive = () => {
    const session = readFieldPortalSession();
    return Boolean(session && canAuthenticateStatus(session.status));
};

export const setFieldModuleHomeContext = (context) => {
    const value = String(context || '').trim();
    if (!value) {
        sessionStorage.removeItem(FIELD_MODULE_HOME_CONTEXT_KEY);
        return;
    }
    sessionStorage.setItem(FIELD_MODULE_HOME_CONTEXT_KEY, value);
};

export const readFieldModuleHomeContext = () => sessionStorage.getItem(FIELD_MODULE_HOME_CONTEXT_KEY) || '';

export const isFieldPortalHomeContext = () => readFieldModuleHomeContext() === 'field-portal';

export const getFieldPortalVerificationMessage = (subject = 'report') => (
    `Submission completed successfully. Please log in to the web portal to verify the ${subject}.`
);

export const clearFieldModuleHomeContext = () => {
    sessionStorage.removeItem(FIELD_MODULE_HOME_CONTEXT_KEY);
};

export const getPortalAwareHomePath = ({ site = '', fallbackPath = '/dashboard' } = {}) => {
    const resolvedSite = normalizePortalSite(site || sessionStorage.getItem('isoCurrentSite'));
    const homeContext = readFieldModuleHomeContext();
    const homePath = homeContext === 'field-portal'
        ? '/field-portal'
        : homeContext === 'field-app'
            ? '/field-app'
            : fallbackPath;

    if (!resolvedSite) return homePath;

    const separator = homePath.includes('?') ? '&' : '?';
    return `${homePath}${separator}site=${encodeURIComponent(resolvedSite)}`;
};

export const getFieldPortalLoginPath = (redirectPath = '') => {
    const cleanRedirect = String(redirectPath || '').trim();
    if (!cleanRedirect) return '/field-portal';
    return `/field-portal?redirect=${encodeURIComponent(cleanRedirect)}`;
};

export const buildFieldPortalAuthErrorMessage = (error) => {
    const code = error?.code || '';

    if (code === 'auth/operation-not-allowed') {
        return 'Firebase Email/Password sign-in is disabled for this project. Enable Authentication > Sign-in method > Email/Password in Firebase Console.';
    }

    if (
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
    ) {
        return 'The field portal email or password is incorrect.';
    }

    if (code === 'auth/invalid-email') {
        return 'Please enter a valid email address.';
    }

    return 'Could not sign in: ' + (error?.message || 'Unknown error.');
};

export const fetchFieldPortalContext = async ({ user, expectedOrgId = '' }) => {
    if (!user?.uid || !user?.email) {
        throw new Error('No authenticated field portal session found. Please sign in again.');
    }

    // Fail fast (<3s) with a clear, actionable error if the configured
    // databaseURL is unreachable — typical when the org picker has saved a
    // wrong URL to localStorage.  Without this probe, the WebSocket retries
    // silently and the user waits the full 15s for a vague timeout.
    await probeDatabaseUrl();

    // Pre-warm the auth token so the RTDB WebSocket has a credential to
    // present on its first read.  Without this, signInWithEmailAndPassword
    // can resolve before the SDK has propagated the token to RTDB; the first
    // dbGet then opens a fresh WebSocket WITHOUT an auth token, the server
    // queues the request waiting for auth that never arrives, and our 15s
    // read-timeout wrapper rejects with the generic "WebSocket may be
    // blocked" message — even though the real cause is a token race.
    try { await user.getIdToken(); } catch { /* best-effort */ }

    const userDirData = await dbGet(`userDirectory/${user.uid}`);
    if (!userDirData) {
        throw new Error('This account is not mapped to any organization.');
    }

    const orgId = userDirData.orgId;
    if (expectedOrgId && expectedOrgId !== orgId) {
        throw new Error('This login belongs to a different organization than the saved field portal session.');
    }

    const orgUserData = await dbGet(`organizations/${orgId}/users/${user.uid}`);
    if (!orgUserData) {
        throw new Error('Your account exists but was removed from the organization directory.');
    }

    const userData = orgUserData;
    if (isPendingStatus(userData.status)) {
        throw new Error('Your account is currently pending approval. Please contact your administrator.');
    }
    if (!canAuthenticateStatus(userData.status)) {
        throw new Error('This account has been deactivated.');
    }

    const sessionData = normalizeSessionData({
        uid: user.uid,
        email: user.email,
        orgId,
        name: userData.name || user.email.split('@')[0],
        role: userData.role || 'User',
        status: userData.status || ACCOUNT_STATUS.ACTIVE,
        assignedSite: userData.assignedSite || 'GLOBAL',
        accessibleSites: userData.accessibleSites || [],
        accessibleModules: userData.accessibleModules || [],
        mustChangePassword: Boolean(userData.mustChangePassword),
        temporaryPasswordIssued: Boolean(userData.temporaryPasswordIssued),
        temporaryPasswordIssuedAt: userData.temporaryPasswordIssuedAt || '',
        passwordUpdatedAt: userData.passwordUpdatedAt || ''
    });

    if (sessionData.mustChangePassword) {
        throw new Error('Password update required. Sign in to the main portal first and change your temporary password before using the field portal.');
    }

    if (getVisibleFieldModules(sessionData).length === 0) {
        throw new Error('This account does not have access to any field portal modules.');
    }

    const sitesData = await dbGet(`organizations/${orgId}/sites`);
    const sites = sitesData !== null
        ? Object.keys(sitesData).map((key) => ({
            code: sitesData[key].code || key,
            name: sitesData[key].name || key
        }))
        : [];

    return { sessionData, sites };
};
