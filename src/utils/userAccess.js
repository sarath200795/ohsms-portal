import { toCanonicalModuleIds } from './permissions.js';
import { ACCOUNT_STATUS, normalizeUserStatus } from './session.js';

export const USER_ROLES = [
    'Global Owner',
    'Global Manager',
    'Admin',
    'Site Owner',
    'Site Manager',
    'Lead Auditor',
    'User'
];

export const normalizeUserEmail = (email) => String(email || '').trim().toLowerCase();

export const normalizeUserAccessPayload = (payload = {}, { editingExistingUser = false } = {}) => {
    const normalizedStatus = normalizeUserStatus(payload.status || ACCOUNT_STATUS.ACTIVE);

    return {
        ...payload,
        name: String(payload.name || '').trim(),
        email: normalizeUserEmail(payload.email),
        role: String(payload.role || 'User').trim() || 'User',
        assignedSite: String(payload.assignedSite || '').trim(),
        accessibleSites: Array.isArray(payload.accessibleSites)
            ? payload.accessibleSites.filter(Boolean).map((site) => String(site).trim())
            : [],
        accessibleModules: toCanonicalModuleIds(payload.accessibleModules),
        status: editingExistingUser && normalizedStatus === ACCOUNT_STATUS.PENDING
            ? ACCOUNT_STATUS.ACTIVE
            : normalizedStatus
    };
};

export const validateUserAccessPayload = (payload = {}) => {
    const errors = [];

    if (!payload.name) errors.push('Name is required.');
    if (!payload.email) errors.push('Email is required.');
    if (!payload.role) errors.push('Role is required.');

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (payload.email && !emailPattern.test(payload.email)) {
        errors.push('Email address is invalid.');
    }

    if (payload.role && !USER_ROLES.includes(payload.role)) {
        errors.push('Role is invalid.');
    }

    const status = normalizeUserStatus(payload.status);
    if (![ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.INACTIVE, ACCOUNT_STATUS.DELETED].includes(status)) {
        errors.push('Account status is invalid.');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

const trackedFields = ['role', 'status', 'assignedSite'];

export const buildUserAccessAuditEntry = ({ actorSession, beforeUser = null, afterUser, targetUserId, action }) => {
    const beforeModules = toCanonicalModuleIds(beforeUser?.accessibleModules);
    const afterModules = toCanonicalModuleIds(afterUser?.accessibleModules);
    const beforeSites = Array.isArray(beforeUser?.accessibleSites) ? beforeUser.accessibleSites : [];
    const afterSites = Array.isArray(afterUser?.accessibleSites) ? afterUser.accessibleSites : [];

    const changedFields = trackedFields.filter((field) => String(beforeUser?.[field] || '') !== String(afterUser?.[field] || ''));

    if (JSON.stringify(beforeModules) !== JSON.stringify(afterModules)) changedFields.push('accessibleModules');
    if (JSON.stringify(beforeSites) !== JSON.stringify(afterSites)) changedFields.push('accessibleSites');

    return {
        action,
        actorUid: actorSession?.uid || 'unknown',
        actorName: actorSession?.name || actorSession?.email || 'System',
        actorRole: actorSession?.role || 'Unknown',
        targetUserId,
        targetEmail: afterUser?.email || beforeUser?.email || '',
        targetName: afterUser?.name || beforeUser?.name || '',
        before: beforeUser
            ? {
                role: beforeUser.role || '',
                status: normalizeUserStatus(beforeUser.status),
                assignedSite: beforeUser.assignedSite || '',
                accessibleSites: beforeSites,
                accessibleModules: beforeModules
            }
            : null,
        after: {
            role: afterUser?.role || '',
            status: normalizeUserStatus(afterUser?.status),
            assignedSite: afterUser?.assignedSite || '',
            accessibleSites: afterSites,
            accessibleModules: afterModules
        },
        changedFields,
        timestamp: new Date().toISOString()
    };
};

export const buildPermissionRequestUpdates = ({ permissionRequests = {}, email, nextStatus, actorSession }) => {
    const normalizedEmail = normalizeUserEmail(email);
    const nextRequestStatus = normalizeUserStatus(nextStatus) === ACCOUNT_STATUS.ACTIVE ? 'Approved' : normalizeUserStatus(nextStatus);

    return Object.entries(permissionRequests).reduce((updates, [requestId, request]) => {
        if (normalizeUserEmail(request?.userEmail) !== normalizedEmail) return updates;
        if (String(request?.status || '') !== 'Pending') return updates;

        updates[`${requestId}/status`] = nextRequestStatus;
        updates[`${requestId}/reviewedAt`] = new Date().toISOString();
        updates[`${requestId}/reviewedBy`] = actorSession?.name || actorSession?.email || 'Admin';
        return updates;
    }, {});
};
