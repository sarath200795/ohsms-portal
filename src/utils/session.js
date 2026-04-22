import { normalizeSessionPermissions } from './permissions.js';

export const SESSION_STORAGE_KEY = 'isoSession';

export const ACCOUNT_STATUS = {
    PENDING: 'Pending',
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    DELETED: 'Deleted'
};

const STATUS_LOOKUP = {
    pending: ACCOUNT_STATUS.PENDING,
    active: ACCOUNT_STATUS.ACTIVE,
    inactive: ACCOUNT_STATUS.INACTIVE,
    deleted: ACCOUNT_STATUS.DELETED
};

export const normalizeUserStatus = (status) => {
    const normalized = String(status || '').trim().toLowerCase();
    return STATUS_LOOKUP[normalized] || ACCOUNT_STATUS.ACTIVE;
};

export const isPendingStatus = (status) => normalizeUserStatus(status) === ACCOUNT_STATUS.PENDING;
export const isInactiveStatus = (status) => normalizeUserStatus(status) === ACCOUNT_STATUS.INACTIVE;
export const isDeletedStatus = (status) => normalizeUserStatus(status) === ACCOUNT_STATUS.DELETED;
export const canAuthenticateStatus = (status) => normalizeUserStatus(status) === ACCOUNT_STATUS.ACTIVE;

export const normalizeSessionData = (session) => {
    if (!session || typeof session !== 'object') return session;

    return {
        ...normalizeSessionPermissions(session),
        status: normalizeUserStatus(session.status || ACCOUNT_STATUS.ACTIVE)
    };
};

export const readStoredSession = (storageKey = SESSION_STORAGE_KEY) => {
    if (typeof sessionStorage === 'undefined') return null;

    try {
        const raw = sessionStorage.getItem(storageKey);
        return raw ? normalizeSessionData(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
};

export const writeStoredSession = (session, storageKey = SESSION_STORAGE_KEY) => {
    if (typeof sessionStorage === 'undefined') return null;
    const normalized = normalizeSessionData(session);
    sessionStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
};

export const clearStoredSession = (storageKey = SESSION_STORAGE_KEY) => {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(storageKey);
};
