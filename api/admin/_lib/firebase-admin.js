/**
 * api/admin/_lib/firebase-admin.js
 *
 * Per-org Firebase Admin SDK resolver.
 *
 * In a multi-tenant deployment each organisation runs its own Firebase
 * project — different RTDB instance, different Auth user pool, different
 * Storage bucket. A single hardcoded service account can only act against
 * one project, so we need to resolve the right Admin SDK instance per
 * request.
 *
 * Resolution order (per orgId):
 *   1. Per-org service-account JSON stored in the **control plane**
 *      Firebase project at  controlPlane/orgs/{orgId}/serviceAccount
 *      (read using the control-plane SA from env).
 *   2. Default SA from env (single-project deployments + the control
 *      plane project itself).
 *
 * Resolved Admin apps are cached per-orgId in module memory so cold
 * starts only pay the init cost once per tenant.
 *
 * Env vars consumed:
 *   FIREBASE_SERVICE_ACCOUNT_JSON          default SA (also the control-plane SA)
 *   FIREBASE_DATABASE_URL                  default DB URL
 *   CONTROL_PLANE_FIREBASE_DATABASE_URL    optional override for the control plane
 *                                          (defaults to FIREBASE_DATABASE_URL)
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

// ── Default app (control plane + single-project deploys) ────────────────────

const _appByName = new Map();

const parseServiceAccount = (raw, source) => {
    try {
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object' || !parsed.project_id) {
            throw new Error('parsed JSON has no project_id field');
        }
        return parsed;
    } catch (err) {
        throw new Error(`Invalid service-account JSON from ${source}: ${err.message}`);
    }
};

const ensureDefaultApp = () => {
    if (_appByName.has('[DEFAULT]')) return _appByName.get('[DEFAULT]');

    const existingDefault = getApps().find((a) => a.name === '[DEFAULT]') || getApps()[0];
    if (existingDefault) {
        _appByName.set('[DEFAULT]', existingDefault);
        return existingDefault;
    }

    const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'FIREBASE_SERVICE_ACCOUNT_JSON');
    const app = initializeApp({
        credential: cert(sa),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
    _appByName.set('[DEFAULT]', app);
    return app;
};

/** Admin SDK app for the control plane (where per-org SAs are stored). */
export const getControlPlaneApp = () => ensureDefaultApp();

// ── Per-org app cache ───────────────────────────────────────────────────────

const _orgAppCache = new Map(); // orgId → app

/**
 * Resolve the Admin SDK app for `orgId`. Returns the default app if no
 * per-org SA is registered in the control plane (single-project deploys
 * land here).
 *
 * Lookups + cache are case-sensitive on orgId.
 */
export const getAdminAppForOrg = async (orgId) => {
    if (!orgId) throw new Error('getAdminAppForOrg: orgId is required.');
    if (_orgAppCache.has(orgId)) return _orgAppCache.get(orgId);

    const controlPlane = ensureDefaultApp();
    const controlDb = getDatabase(controlPlane);

    let tenantSa = null;
    let tenantDbUrl = null;
    try {
        const snap = await controlDb.ref(`controlPlane/orgs/${orgId}`).once('value');
        const row = snap.val();
        if (row && typeof row === 'object') {
            // SA can be a JSON string OR an object — accept both, normalise to object.
            if (typeof row.serviceAccount === 'string' && row.serviceAccount.trim()) {
                tenantSa = parseServiceAccount(row.serviceAccount, `controlPlane/orgs/${orgId}/serviceAccount`);
            } else if (row.serviceAccount && typeof row.serviceAccount === 'object' && row.serviceAccount.project_id) {
                tenantSa = row.serviceAccount;
            }
            if (typeof row.databaseURL === 'string' && row.databaseURL.trim()) {
                tenantDbUrl = row.databaseURL.trim();
            }
        }
    } catch (lookupErr) {
        // Control plane unreachable or no entry — fall through to default.
        console.warn(`[admin/firebase-admin] control-plane lookup for "${orgId}" failed:`, lookupErr.message);
    }

    if (!tenantSa) {
        // No per-org SA → use the default app. This is the single-project
        // deployment path and the control-plane-only path.
        _orgAppCache.set(orgId, controlPlane);
        return controlPlane;
    }

    // Spin up a named app for this tenant. Name MUST be deterministic per
    // orgId so re-resolution returns the same app (firebase-admin throws
    // on duplicate name + different credential).
    const appName = `tenant:${tenantSa.project_id}`;
    const existing = getApps().find((a) => a.name === appName);
    const app = existing || initializeApp(
        {
            credential: cert(tenantSa),
            databaseURL: tenantDbUrl || `https://${tenantSa.project_id}-default-rtdb.firebaseio.com`,
        },
        appName,
    );
    _orgAppCache.set(orgId, app);
    _appByName.set(appName, app);
    return app;
};

/** Convenience: Auth instance for `orgId`. */
export const getAuthForOrg = async (orgId) => getAuth(await getAdminAppForOrg(orgId));

/** Convenience: RTDB instance for `orgId`. */
export const getDbForOrg = async (orgId) => getDatabase(await getAdminAppForOrg(orgId));

// ── Test hooks (do not use in production code paths) ────────────────────────

export const __resetCachesForTests = () => {
    _orgAppCache.clear();
    _appByName.clear();
};
