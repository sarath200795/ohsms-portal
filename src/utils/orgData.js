/**
 * orgData — organisation-scoped data helpers
 *
 * These helpers are the single source of truth for READING organisation data.
 * They route through the database service (dbGet / dbQuery) which in turn
 * uses whichever adapter is configured by VITE_DB_ADAPTER.
 *
 * The legacy `db` / `rtdb` first argument is accepted but IGNORED — the
 * active database adapter is resolved at module initialisation time.  This
 * keeps all existing call sites working without touching every page component.
 */

import { dbGet, dbQuery } from '../services/db/index.js';
import { isGlobalOwnerRole } from './permissions.js';
import { readStoredSession } from './session';
import { rtdbRest, isFirebaseRestAvailable } from './rtdbRest.js';
import authService from '../services/auth/index.js';

// ─── site-scoped collections ─────────────────────────────────────────────────
// Records in these collections are filtered by siteId when the user is
// assigned to a specific site (not GLOBAL).

const SITE_SCOPED_COLLECTIONS = new Set([
    'riskAssessments',
    'incidents',
    'consultations',
    'auditPlans',
    'auditFindings',
    'improvements',
    'ptwRecords',
    'mockDrills',
    'emergencyEquipment',
    'inspectionTemplates',
    'inspectionRecords',
    'trainings',
    'manHours',
    'healthCases',
    'healthSurveillance',
    'vaccinationRecords',
    'illnessRecords'
]);

// ─── helpers ─────────────────────────────────────────────────────────────────

const mergeRecords = (results) => {
    const merged = {};
    results.forEach((rec) => {
        if (!rec || typeof rec !== 'object') return;
        Object.entries(rec).forEach(([key, value]) => {
            merged[key] = value;
        });
    });
    return Object.keys(merged).length > 0 ? merged : null;
};

const getScopedSiteCodes = (session) => {
    if (!session || isGlobalOwnerRole(session.role) || session.assignedSite === 'GLOBAL') return [];
    return [session.assignedSite].filter(Boolean);
};

const getScopedQuerySites = (session, childName) => {
    const scopedSites = getScopedSiteCodes(session);
    if (childName === 'inspectionTemplates' && scopedSites.length > 0) {
        return [...new Set([...scopedSites, 'GLOBAL'])];
    }
    return scopedSites;
};

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Read one named child of an organisation node, applying site-scoping where
 * applicable.
 *
 * @param {*}      _db        Ignored — kept for backward compatibility.
 * @param {string} orgId
 * @param {string} childName  e.g. "incidents", "users", "sites"
 * @param {object} [options]
 * @param {object} [options.session]  Override for the current session (optional).
 * @returns {Promise<Record<string,any>|null>}
 */
export const readOrgChild = async (_db, orgId, childName, options = {}) => {
    const session = options.session || readStoredSession();
    const basePath = `organizations/${orgId}/${childName}`;

    try {
        // Site-scoped collections: must use SDK query (orderByChild + equalTo).
        // The REST helper does not support indexed queries, so we keep the SDK
        // path here.  The 5 s withReadTimeout wrapper in the Firebase adapter
        // guarantees this throws (not hangs) if the WebSocket is blocked.
        if (SITE_SCOPED_COLLECTIONS.has(childName)) {
            const scopedSites = getScopedQuerySites(session, childName);
            if (scopedSites.length > 0) {
                const results = await Promise.all(
                    scopedSites.map((siteId) => dbQuery(basePath, 'siteId', siteId))
                );
                return mergeRecords(results);
            }
        }

        // For plain GET paths (global user or non-scoped collections) try the
        // HTTPS REST API first — it bypasses the WebSocket entirely and is
        // unaffected by WebSocket blocks / CSP / regional URL mismatches.
        if (isFirebaseRestAvailable()) {
            try {
                const idToken = await authService.getIdToken();
                return await rtdbRest.get(basePath, idToken);
            } catch (restErr) {
                console.warn(`[orgData] REST fetch for "${childName}" failed, falling back to SDK:`, restErr.message);
                // Fall through to SDK path below.
            }
        }

        return await dbGet(basePath);
    } catch (err) {
        // Never let a failed read block the module from rendering.
        // The module will receive null for this child and can render empty state.
        console.warn(`[orgData] readOrgChild("${childName}") error — returning null:`, err.message);
        return null;
    }
};

/**
 * Read multiple named children of an organisation node in parallel.
 *
 * @param {*}        _db       Ignored — kept for backward compatibility.
 * @param {string}   orgId
 * @param {string[]} childNames
 * @param {object}   [options]
 * @returns {Promise<Record<string, Record<string,any>|null>>}
 */
export const readOrgChildren = async (_db, orgId, childNames = [], options = {}) => {
    const unique = [...new Set(childNames.filter(Boolean))];
    const entries = await Promise.all(
        unique.map(async (name) => [name, await readOrgChild(null, orgId, name, options)])
    );
    return Object.fromEntries(entries);
};
