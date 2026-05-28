import {
    GLOBAL_OWNER_ROLE,
    SITE_OWNER_ROLE,
    SUPPORTED_USER_ROLES,
    USER_ROLE,
    normalizeRole,
    toCanonicalModuleIds
} from './permissions.js';
import { ACCOUNT_STATUS, normalizeUserStatus } from './session.js';

export const USER_ROLES = SUPPORTED_USER_ROLES;

export const normalizeUserEmail = (email) => String(email || '').trim().toLowerCase();

export const toUserRecordKey = (email) => normalizeUserEmail(email).replace(/[.#$[\]/]/g, '_');

export const normalizeStoredUserRecord = (payload = {}) => {
    const role = normalizeRole(payload.role || USER_ROLE);
    const baseAssignedSite = String(payload.assignedSite || '').trim();
    const fallbackSite = Array.isArray(payload.accessibleSites)
        ? payload.accessibleSites.find(Boolean)
        : '';
    const assignedSite = role === GLOBAL_OWNER_ROLE
        ? 'GLOBAL'
        : baseAssignedSite || String(fallbackSite || '').trim();
    // Build accessibleSites for SITE_OWNER_ROLE the same way as USER_ROLE
    // — keep every site the form ticked, dedupe, and guarantee the primary
    // assignedSite is included so the Site Owner can never be granted
    // EXTRA sites without retaining their primary.  (Previously this
    // forced [assignedSite] only, silently dropping any extra sites the
    // form had ticked, which is why the "additional sites" UI never took
    // effect for Site Owners.)
    const collectExtraSites = (raw) => Array.isArray(raw)
        ? raw.filter(Boolean).map((site) => String(site).trim()).filter(Boolean)
        : [];
    const accessibleSites = role === GLOBAL_OWNER_ROLE
        ? []
        : role === SITE_OWNER_ROLE
            ? Array.from(new Set(
                [assignedSite, ...collectExtraSites(payload.accessibleSites)].filter(Boolean)
            ))
            : collectExtraSites(payload.accessibleSites);
    const accessibleModules = role === USER_ROLE
        ? toCanonicalModuleIds(payload.accessibleModules)
        : [];

    // Derived object map of accessible sites. Stored as a sibling to the
    // array form because Firebase RTDB security rules CAN'T iterate arrays —
    // they CAN check object-key existence in O(1). Rules for site-scoped
    // collections look up `accessibleSitesMap/<siteId>` to decide whether a
    // multi-site Site Owner / User may read/write data tagged with that site.
    // Always overwritten on save so it stays in sync with the array.
    const accessibleSitesMap = accessibleSites.reduce((acc, site) => {
        const code = String(site || '').trim();
        if (code && code !== 'GLOBAL') acc[code] = true;
        return acc;
    }, {});

    return {
        ...payload,
        name: String(payload.name || '').trim(),
        email: normalizeUserEmail(payload.email),
        role,
        assignedSite,
        accessibleSites,
        accessibleSitesMap,
        accessibleModules,
        status: normalizeUserStatus(payload.status || ACCOUNT_STATUS.ACTIVE)
    };
};

export const normalizeUserAccessPayload = (payload = {}, { editingExistingUser = false } = {}) => {
    const normalizedStatus = normalizeUserStatus(payload.status || ACCOUNT_STATUS.ACTIVE);
    const role = normalizeRole(payload.role || USER_ROLE);
    const baseAssignedSite = String(payload.assignedSite || '').trim();
    const fallbackSite = Array.isArray(payload.accessibleSites)
        ? payload.accessibleSites.find(Boolean)
        : '';
    const assignedSite = role === GLOBAL_OWNER_ROLE
        ? 'GLOBAL'
        : baseAssignedSite || String(fallbackSite || '').trim();
    // Same logic as normalizeStoredUserRecord above — Site Owners now keep
    // every site the form selected, with the primary assignedSite always
    // included for free.
    const collectExtraSites = (raw) => Array.isArray(raw)
        ? raw.filter(Boolean).map((site) => String(site).trim()).filter(Boolean)
        : [];
    const accessibleSites = role === GLOBAL_OWNER_ROLE
        ? []
        : role === SITE_OWNER_ROLE
            ? Array.from(new Set(
                [assignedSite, ...collectExtraSites(payload.accessibleSites)].filter(Boolean)
            ))
            : collectExtraSites(payload.accessibleSites);
    const accessibleModules = role === USER_ROLE ? toCanonicalModuleIds(payload.accessibleModules) : [];

    // Derived object map — see normalizeStoredUserRecord above for why.
    const accessibleSitesMap = accessibleSites.reduce((acc, site) => {
        const code = String(site || '').trim();
        if (code && code !== 'GLOBAL') acc[code] = true;
        return acc;
    }, {});

    return {
        ...payload,
        name: String(payload.name || '').trim(),
        email: normalizeUserEmail(payload.email),
        role,
        assignedSite,
        accessibleSites,
        accessibleSitesMap,
        accessibleModules,
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

    if (payload.role === SITE_OWNER_ROLE && !payload.assignedSite) {
        errors.push('Site Owner must have a primary site assigned.');
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
