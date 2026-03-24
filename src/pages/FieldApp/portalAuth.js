import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase, get, ref } from 'firebase/database';
import { auth } from '../../config/firebase';
import { getVisibleFieldModules } from './utils';

export const FIELD_PORTAL_APP_NAME = 'field-portal-app';
export const FIELD_PORTAL_SESSION_KEY = 'fieldPortalSession';

export const getFieldPortalFirebase = () => {
    const existingApp = getApps().find((app) => app.name === FIELD_PORTAL_APP_NAME);
    const portalApp = existingApp || initializeApp(auth.app.options, FIELD_PORTAL_APP_NAME);

    return {
        fieldAuth: getAuth(portalApp),
        fieldDb: getDatabase(portalApp)
    };
};

export const readFieldPortalSession = () => {
    try {
        const raw = sessionStorage.getItem(FIELD_PORTAL_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const normalizePortalSite = (site) => {
    const value = String(site || '').trim();
    if (!value) return '';
    if (value === 'GLOBAL') return 'All';
    return value;
};

export const isFieldPortalSessionActive = () => Boolean(readFieldPortalSession());

export const getPortalAwareHomePath = ({ site = '', fallbackPath = '/dashboard' } = {}) => {
    const resolvedSite = normalizePortalSite(site || sessionStorage.getItem('isoCurrentSite'));
    const homePath = isFieldPortalSessionActive() ? '/field-portal' : fallbackPath;

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

export const fetchFieldPortalContext = async ({ fieldDb, user, expectedOrgId = '' }) => {
    if (!user?.uid || !user?.email) {
        throw new Error('No authenticated field portal session found. Please sign in again.');
    }

    const userDirSnap = await get(ref(fieldDb, `userDirectory/${user.uid}`));
    if (!userDirSnap.exists()) {
        throw new Error('This account is not mapped to any organization.');
    }

    const orgId = userDirSnap.val().orgId;
    if (expectedOrgId && expectedOrgId !== orgId) {
        throw new Error('This login belongs to a different organization than the saved field portal session.');
    }

    const orgUserSnap = await get(ref(fieldDb, `organizations/${orgId}/users/${user.uid}`));
    if (!orgUserSnap.exists()) {
        throw new Error('Your account exists but was removed from the organization directory.');
    }

    const userData = orgUserSnap.val();
    if (userData.status === 'Pending') {
        throw new Error('Your account is currently pending approval. Please contact your administrator.');
    }
    if (userData.status === 'Deleted' || userData.status === 'Inactive') {
        throw new Error('This account has been deactivated.');
    }

    const sessionData = {
        uid: user.uid,
        email: user.email,
        orgId,
        name: userData.name || user.email.split('@')[0],
        role: userData.role || 'User',
        assignedSite: userData.assignedSite || 'GLOBAL',
        accessibleSites: userData.accessibleSites || [],
        accessibleModules: userData.accessibleModules || []
    };

    if (getVisibleFieldModules(sessionData).length === 0) {
        throw new Error('This account does not have access to any field portal modules.');
    }

    const sitesSnap = await get(ref(fieldDb, `organizations/${orgId}/sites`));
    const sites = sitesSnap.exists()
        ? Object.keys(sitesSnap.val()).map((key) => ({
            code: sitesSnap.val()[key].code || key,
            name: sitesSnap.val()[key].name || key
        }))
        : [];

    return { sessionData, sites };
};
