/**
 * api/admin/_lib/verify-caller.js
 *
 * Caller-token verification used by every authenticated admin endpoint.
 *
 * Given a Firebase ID token (issued by the org's Firebase Auth project) and
 * the orgId the caller claims to act on, this:
 *
 *   1. Verifies the ID token against the org's project (per-org Admin SDK).
 *   2. Looks up the caller's userDirectory mapping and asserts it points
 *      at the same orgId — prevents cross-org token replay.
 *   3. Loads the caller's user record and asserts status === 'Active'.
 *   4. Optionally asserts the caller's role meets a minimum bar.
 *
 * Throws an Error with `.statusCode` (401 / 403) on any failure. Callers
 * map that to the HTTP response.
 */

import { getAuthForOrg, getDbForOrg } from './firebase-admin.js';

const dbGet = async (db, path) => (await db.ref(path).once('value')).val();

/**
 * @param {string} idToken          Firebase ID token from the client.
 * @param {string} targetOrgId      The orgId the request claims to act on.
 * @param {object} [opts]
 * @param {'Global Owner' | 'Site Owner or Global Owner' | null} [opts.requiredRole]
 * @returns {Promise<{uid, orgId, role, assignedSite, app, auth, db}>}
 *           Plus the resolved Admin SDK handles so the caller doesn't
 *           re-resolve them.
 */
export const verifyCallerToken = async (idToken, targetOrgId, opts = {}) => {
    const requiredRole = opts.requiredRole ?? null;

    if (!idToken) {
        throw Object.assign(new Error('Missing caller ID token.'), { statusCode: 401 });
    }
    if (!targetOrgId) {
        throw Object.assign(new Error('Missing orgId in request.'), { statusCode: 400 });
    }

    const auth = await getAuthForOrg(targetOrgId);
    const db = await getDbForOrg(targetOrgId);

    let decoded;
    try {
        decoded = await auth.verifyIdToken(idToken);
    } catch {
        throw Object.assign(new Error('Invalid or expired caller ID token.'), { statusCode: 401 });
    }

    const callerUid = decoded.uid;

    const userDirOrgId = await dbGet(db, `userDirectory/${callerUid}/orgId`);
    if (!userDirOrgId) {
        throw Object.assign(new Error('Caller account is not mapped to any organization.'), { statusCode: 403 });
    }
    if (userDirOrgId !== targetOrgId) {
        throw Object.assign(new Error('Caller does not belong to the target organization.'), { statusCode: 403 });
    }

    const callerRecord = await dbGet(db, `organizations/${targetOrgId}/users/${callerUid}`);
    if (!callerRecord) {
        throw Object.assign(new Error('Caller user record not found in organization.'), { statusCode: 403 });
    }
    if (callerRecord.status !== 'Active') {
        throw Object.assign(new Error('Caller account is not Active.'), { statusCode: 403 });
    }

    const callerRole = callerRecord.role || '';

    if (requiredRole === 'Global Owner' && callerRole !== 'Global Owner') {
        throw Object.assign(new Error('This operation requires Global Owner role.'), { statusCode: 403 });
    }
    if (requiredRole === 'Site Owner or Global Owner') {
        if (callerRole !== 'Global Owner' && callerRole !== 'Site Owner') {
            throw Object.assign(new Error('This operation requires Site Owner or Global Owner role.'), { statusCode: 403 });
        }
    }

    return {
        uid: callerUid,
        orgId: userDirOrgId,
        role: callerRole,
        assignedSite: callerRecord.assignedSite || '',
        auth,
        db,
    };
};
