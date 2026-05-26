/**
 * api/admin/users.js
 *
 * Vercel serverless function — server-side Firebase Auth user provisioning.
 *
 * Replaces the client-side secondary-app provisioning pattern so that
 * creating or deleting Firebase Auth accounts never happens in the browser.
 *
 * POST   /api/admin/users  — create a new Firebase Auth account + RTDB records
 * DELETE /api/admin/users  — delete a Firebase Auth account + RTDB records
 *
 * Both endpoints require a valid Firebase ID token from an Active Global Owner
 * (or Site Owner for same-site user creation).  The token is verified server-side
 * using firebase-admin — it is never trusted on face value.
 *
 * Env vars required (same as the incident-ai backend):
 *   FIREBASE_SERVICE_ACCOUNT_JSON   JSON string of the service-account credentials
 *   FIREBASE_DATABASE_URL           https://<project>-default-rtdb.firebaseio.com
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

// ── Admin SDK — initialise once ─────────────────────────────────────────────

const getAdminApp = () => {
    const existing = getApps().find((a) => a.name === '[DEFAULT]') || getApps()[0];
    if (existing) return existing;

    const serviceAccount = (() => {
        try {
            return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
        } catch {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing or invalid JSON.');
        }
    })();

    return initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const json = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const err = (message, status = 400) => json({ error: message }, status);

/** Cryptographically random temporary password: 12 chars, mixed case + digits + symbol */
const generateTemporaryPassword = () => {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => charset[b % charset.length]).join('');
};

/** RTDB helper — set a path */
const dbSet = async (db, path, data) => {
    await db.ref(path).set(data);
};

/** RTDB helper — remove a path (silently ignore missing) */
const dbRemove = async (db, path) => {
    await db.ref(path).remove();
};

/** RTDB helper — get a path value */
const dbGet = async (db, path) => {
    const snap = await db.ref(path).once('value');
    return snap.val();
};

// ── Token verification ───────────────────────────────────────────────────────

/**
 * Verify the caller's Firebase ID token and assert they are an Active
 * member of the target org with at least the required role.
 *
 * Returns { uid, orgId, role } on success; throws on failure.
 */
const verifyCallerToken = async (adminAuth, db, idToken, targetOrgId, requiredRole = 'Global Owner') => {
    let decoded;
    try {
        decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
        throw Object.assign(new Error('Invalid or expired caller ID token.'), { statusCode: 401 });
    }

    const callerUid = decoded.uid;

    // Check userDirectory mapping
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

    return { uid: callerUid, orgId: userDirOrgId, role: callerRole, assignedSite: callerRecord.assignedSite || '' };
};

// ── POST — Create user ───────────────────────────────────────────────────────

const handleCreateUser = async (body, adminAuth, db) => {
    const {
        email,
        name,
        role,
        assignedSite,
        accessibleSites,
        accessibleModules,
        orgId,
        callerIdToken,
    } = body || {};

    if (!email || !name || !role || !orgId || !callerIdToken) {
        throw Object.assign(
            new Error('email, name, role, orgId, and callerIdToken are required.'),
            { statusCode: 400 }
        );
    }

    // Verify the caller
    const caller = await verifyCallerToken(adminAuth, db, callerIdToken, orgId, 'Site Owner or Global Owner');

    // Site Owners can only create Users for their own site
    if (caller.role === 'Site Owner') {
        if (role === 'Global Owner') {
            throw Object.assign(
                new Error('Site Owners cannot assign the Global Owner role.'),
                { statusCode: 403 }
            );
        }
        const targetSite = String(assignedSite || '').trim();
        if (targetSite && targetSite !== caller.assignedSite) {
            throw Object.assign(
                new Error('Site Owners can only create users for their own site.'),
                { statusCode: 403 }
            );
        }
    }

    const temporaryPassword = generateTemporaryPassword();
    const provisionedAt = new Date().toISOString();

    // Create Firebase Auth account
    let newUid;
    try {
        const userRecord = await adminAuth.createUser({
            email: email.trim().toLowerCase(),
            password: temporaryPassword,
            displayName: name.trim(),
        });
        newUid = userRecord.uid;
    } catch (authErr) {
        if (authErr.code === 'auth/email-already-exists') {
            throw Object.assign(
                new Error('This email already has an existing Firebase Auth account. Ask the user to use the join code or reset their password.'),
                { statusCode: 409 }
            );
        }
        throw authErr;
    }

    // Write RTDB records
    const newUserPayload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        assignedSite: role === 'Global Owner' ? 'GLOBAL' : (assignedSite || ''),
        accessibleSites: role === 'Global Owner' ? [] : (Array.isArray(accessibleSites) ? accessibleSites : []),
        accessibleModules: role !== 'User' ? [] : (Array.isArray(accessibleModules) ? accessibleModules : []),
        status: 'Active',
        mustChangePassword: true,
        temporaryPasswordIssued: true,
        temporaryPasswordIssuedAt: provisionedAt,
        provisionedBy: caller.uid,
        createdAt: provisionedAt,
    };

    try {
        await dbSet(db, `organizations/${orgId}/users/${newUid}`, newUserPayload);
        await dbSet(db, `organizations/${orgId}/userPasswordState/${newUid}`, {
            mustChangePassword: true,
            temporaryPasswordIssued: true,
            temporaryPasswordIssuedAt: provisionedAt,
            passwordUpdatedAt: '',
        });
        await dbSet(db, `userDirectory/${newUid}`, { orgId });
    } catch (dbErr) {
        // Rollback: remove partial DB writes and delete the Auth account
        await dbRemove(db, `organizations/${orgId}/users/${newUid}`).catch(() => {});
        await dbRemove(db, `organizations/${orgId}/userPasswordState/${newUid}`).catch(() => {});
        await dbRemove(db, `userDirectory/${newUid}`).catch(() => {});
        await adminAuth.deleteUser(newUid).catch(() => {});
        throw Object.assign(
            new Error('Failed to write user records to database. The Auth account was rolled back.'),
            { statusCode: 500 }
        );
    }

    return json({ uid: newUid, temporaryPassword }, 201);
};

// ── DELETE — Remove user ─────────────────────────────────────────────────────

const handleDeleteUser = async (body, adminAuth, db) => {
    const { uid, orgId, callerIdToken } = body || {};

    if (!uid || !orgId || !callerIdToken) {
        throw Object.assign(new Error('uid, orgId, and callerIdToken are required.'), { statusCode: 400 });
    }

    await verifyCallerToken(adminAuth, db, callerIdToken, orgId, 'Global Owner');

    // Delete from Firebase Auth (best-effort — account may already be gone)
    await adminAuth.deleteUser(uid).catch((authErr) => {
        if (authErr.code !== 'auth/user-not-found') throw authErr;
    });

    // Remove RTDB records
    await dbRemove(db, `organizations/${orgId}/users/${uid}`);
    await dbRemove(db, `organizations/${orgId}/userPasswordState/${uid}`);
    await dbRemove(db, `userDirectory/${uid}`);

    return json({ success: true });
};

// ── Main handler ─────────────────────────────────────────────────────────────

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: { Allow: 'POST,DELETE,OPTIONS' } });
        }

        let adminAuth, db;
        try {
            const app = getAdminApp();
            adminAuth = getAuth(app);
            db = getDatabase(app);
        } catch (initErr) {
            console.error('[admin/users] Firebase Admin init failed:', initErr);
            return err('Server configuration error. Check FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_DATABASE_URL.', 500);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return err('Request body must be valid JSON.', 400);
        }

        try {
            if (request.method === 'POST') {
                return await handleCreateUser(body, adminAuth, db);
            }
            if (request.method === 'DELETE') {
                return await handleDeleteUser(body, adminAuth, db);
            }
            return err('Method not allowed.', 405);
        } catch (e) {
            const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
            const message = status < 500 ? e.message : 'Internal server error.';
            if (status >= 500) console.error('[admin/users] error:', e);
            return err(message, status);
        }
    },
};
