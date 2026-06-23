/**
 * api/admin/users.js
 *
 * Vercel serverless function — server-side Firebase Auth user provisioning.
 *
 * Replaces the client-side secondary-app / REST provisioning pattern so that
 * creating or deleting Firebase Auth accounts never happens in the browser.
 *
 * POST   /api/admin/users  — create a new Firebase Auth account + RTDB records
 * DELETE /api/admin/users  — delete a Firebase Auth account + RTDB records
 *
 * Both endpoints require:
 *   1. A valid Firebase App Check token (X-Firebase-AppCheck header — enforced
 *      when ENFORCE_APP_CHECK=true, see api/_lib/app-check.js).
 *   2. A valid Firebase ID token in the request body (callerIdToken) from an
 *      Active Global Owner (or Site Owner for same-site user creation). The
 *      token is verified server-side against the target org's project — it
 *      is never trusted on face value.
 *
 * Multi-tenant: per-request, the Admin SDK app is resolved for the body's
 * `orgId` via api/admin/_lib/firebase-admin.js. Single-project deployments
 * fall through to the default env-var-configured app.
 *
 * Env vars required:
 *   FIREBASE_SERVICE_ACCOUNT_JSON   default / control-plane SA
 *   FIREBASE_DATABASE_URL           default / control-plane DB URL
 */

import { verifyAppCheck } from '../_lib/app-check.js';
import { getAuthForOrg, getDbForOrg } from './_lib/firebase-admin.js';
import { verifyCallerToken } from './_lib/verify-caller.js';

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

const dbSet = async (db, path, data) => { await db.ref(path).set(data); };
const dbRemove = async (db, path) => { await db.ref(path).remove(); };

// ── POST — Create user ───────────────────────────────────────────────────────

const handleCreateUser = async (body) => {
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

    // Resolve Admin SDK for the target org + verify the caller in one go.
    const caller = await verifyCallerToken(callerIdToken, orgId, {
        requiredRole: 'Site Owner or Global Owner',
    });
    const { auth: adminAuth, db } = caller;

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
    } catch {
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

const handleDeleteUser = async (body) => {
    const { uid, orgId, callerIdToken } = body || {};

    if (!uid || !orgId || !callerIdToken) {
        throw Object.assign(new Error('uid, orgId, and callerIdToken are required.'), { statusCode: 400 });
    }

    const caller = await verifyCallerToken(callerIdToken, orgId, {
        requiredRole: 'Global Owner',
    });
    const { auth: adminAuth, db } = caller;

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

        // Verify App Check before doing any work — chokepoint for
        // client-attested provisioning calls. (Per-org Admin SDK init
        // happens lazily inside the handler via verifyCallerToken.)
        try {
            // Touch the default Admin app once so getAppCheck has a default app
            // to verify the token against. Cheap — cached after first call.
            const { getControlPlaneApp } = await import('./_lib/firebase-admin.js');
            getControlPlaneApp();
            await verifyAppCheck(request, { label: 'admin/users' });
        } catch (appCheckErr) {
            const status = typeof appCheckErr.statusCode === 'number' ? appCheckErr.statusCode : 401;
            return err(appCheckErr.message || 'App Check verification failed.', status);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return err('Request body must be valid JSON.', 400);
        }

        try {
            if (request.method === 'POST') {
                return await handleCreateUser(body);
            }
            if (request.method === 'DELETE') {
                return await handleDeleteUser(body);
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
