/**
 * orgRegistry.js
 *
 * Manages a local registry (localStorage) of organisations configured on this
 * browser.  Each entry stores the org's display info and the DB config needed
 * to connect to it, so the Login page can show a logo picker and switch
 * databases without a manual setup step.
 *
 * Storage key: 'ohsms_org_registry'  (array of OrgRegistryEntry)
 *
 * Usage:
 *   import { getOrgRegistry, saveOrgToRegistry, applyOrgDbConfig,
 *            isCurrentDb, getDbTypeLabel } from '../utils/orgRegistry.js';
 */

const REGISTRY_KEY = 'ohsms_org_registry';

// ─── Public Shared Directory (multi-device discovery) ─────────────────────
//
// localStorage entries are per-browser per-device. For "open /login on any
// phone or new browser and see every org" we publish each org's config to a
// PUBLIC path on a shared Firebase project (ohsms-3894f's RTDB). Read access
// is open via the RTDB rule: publicOrgDirectory .read = true.
//
// What gets stored: orgId, orgName, dbAdapter, firebaseConfig (JSON string),
// restUrl, publishedAt. The Firebase config is already client-public (ships
// in every page bundle for the originating org) so this exposes nothing new
// — sign-in still requires authentication on the destination project.
//
// Hardcoded URL because (a) this directory has no auth so SDK init isn't
// needed and (b) a single canonical project simplifies the multi-tenant
// experience. If you fork this codebase, point this at your own master
// project's databaseURL.
const PUBLIC_DIRECTORY_URL = 'https://ohsms-3894f-default-rtdb.firebaseio.com/publicOrgDirectory';

/**
 * Fetch every entry published to the shared directory. Returns [] on any
 * failure so the local-only flow keeps working.
 *
 * @returns {Promise<OrgRegistryEntry[]>}
 */
export async function fetchPublicOrgDirectory() {
    try {
        const res = await fetch(`${PUBLIC_DIRECTORY_URL}.json`, { method: 'GET' });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data || typeof data !== 'object') return [];
        return Object.values(data).filter((e) => e && e.orgId);
    } catch (err) {
        console.warn('[orgRegistry] public directory fetch failed:', err);
        return [];
    }
}

/**
 * Push an entry to the shared directory so other devices can see it on
 * their next /login mount. Requires the user to be authenticated against
 * the shared project (rule: publicOrgDirectory/$orgId .write = auth != null).
 *
 * For now we use unauthenticated REST writes via the auth=null branch — the
 * rule allows it if the entry passes the .validate check. Returns a boolean
 * for caller diagnostics.
 *
 * @param {OrgRegistryEntry} entry
 * @returns {Promise<boolean>}
 */
export async function publishOrgToDirectory(entry) {
    if (!entry?.orgId) return false;
    const payload = {
        orgId: entry.orgId,
        orgName: entry.orgName || entry.orgId,
        dbAdapter: entry.dbAdapter || 'firebase',
        firebaseConfig: entry.firebaseConfig || null,
        restUrl: entry.restUrl || null,
        publishedAt: new Date().toISOString()
    };
    try {
        const res = await fetch(`${PUBLIC_DIRECTORY_URL}/${encodeURIComponent(entry.orgId)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn('[orgRegistry] publish failed:', res.status, body);
            return false;
        }
        return true;
    } catch (err) {
        console.warn('[orgRegistry] publish error:', err);
        return false;
    }
}

/**
 * Remove an entry from the shared directory. Same auth rules apply.
 * @param {string} orgId
 * @returns {Promise<boolean>}
 */
export async function unpublishOrgFromDirectory(orgId) {
    if (!orgId) return false;
    try {
        const res = await fetch(`${PUBLIC_DIRECTORY_URL}/${encodeURIComponent(orgId)}.json`, { method: 'DELETE' });
        return res.ok;
    } catch {
        return false;
    }
}

// ─── types (JSDoc only, no TS) ─────────────────────────────────────────────

/**
 * @typedef {Object} OrgRegistryEntry
 * @property {string}           orgId
 * @property {string}           orgName
 * @property {string|null}      logoBase64       Base-64 JPEG, or null
 * @property {'firebase'|'rest'} dbAdapter
 * @property {string|null}      firebaseConfig   JSON string of the firebase SDK config
 * @property {string|null}      restUrl          Base URL for the REST adapter
 * @property {boolean=}         hidden           When true, omitted from the
 *   default picker view. Restorable via unhideOrgInRegistry(orgId).
 */

// ─── read ──────────────────────────────────────────────────────────────────

/** @returns {OrgRegistryEntry[]} */
export function getOrgRegistry() {
    try {
        const raw = localStorage.getItem(REGISTRY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// ─── write ─────────────────────────────────────────────────────────────────

/**
 * Save or update an org entry.
 * If an entry with the same orgId already exists it is merged/updated;
 * otherwise the entry is appended.
 *
 * @param {OrgRegistryEntry} entry
 */
export function saveOrgToRegistry(entry) {
    try {
        const registry = getOrgRegistry();
        const idx = registry.findIndex((e) => e.orgId === entry.orgId);
        if (idx >= 0) {
            registry[idx] = { ...registry[idx], ...entry };
        } else {
            registry.push(entry);
        }
        localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    } catch (err) {
        console.warn('[orgRegistry] Failed to save entry:', err);
    }
}

/**
 * Mark an org entry as hidden in the local picker.  The entry STAYS in the
 * registry — just with `hidden: true` — so it can be restored later via
 * unhideOrgInRegistry(orgId) without re-running the setup wizard.
 *
 * Use this for the picker ✕ button (soft-delete / dismissable).  For the
 * rare "actually wipe it from this browser" case, see removeOrgFromRegistry.
 *
 * @param {string} orgId
 * @returns {OrgRegistryEntry[]} the updated registry
 */
export function hideOrgInRegistry(orgId) {
    try {
        const next = getOrgRegistry().map((e) =>
            e.orgId === orgId ? { ...e, hidden: true } : e
        );
        localStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
        return next;
    } catch (err) {
        console.warn('[orgRegistry] Failed to hide entry:', err);
        return getOrgRegistry();
    }
}

/**
 * Reverse of hideOrgInRegistry — clears the `hidden` flag so the entry
 * reappears in the picker.
 *
 * @param {string} orgId
 * @returns {OrgRegistryEntry[]} the updated registry
 */
export function unhideOrgInRegistry(orgId) {
    try {
        const next = getOrgRegistry().map((e) => {
            if (e.orgId !== orgId) return e;
            const { hidden: _ignored, ...rest } = e;
            return rest;
        });
        localStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
        return next;
    } catch (err) {
        console.warn('[orgRegistry] Failed to unhide entry:', err);
        return getOrgRegistry();
    }
}

/**
 * Permanently delete an org entry from the local registry.  Use only when
 * the entry is genuinely garbage (wrong project, typo) and you don't want
 * it cluttering even the "hidden" list. Otherwise prefer hideOrgInRegistry.
 *
 * @param {string} orgId
 * @returns {OrgRegistryEntry[]} the updated registry
 */
export function removeOrgFromRegistry(orgId) {
    try {
        const next = getOrgRegistry().filter((e) => e.orgId !== orgId);
        localStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
        return next;
    } catch (err) {
        console.warn('[orgRegistry] Failed to remove entry:', err);
        return getOrgRegistry();
    }
}

// ─── apply ────────────────────────────────────────────────────────────────

/**
 * Write an org's DB config to localStorage so the next page load uses that
 * organisation's database.  Call this before `window.location.reload()`.
 *
 * @param {OrgRegistryEntry} entry
 */
export function applyOrgDbConfig(entry) {
    try {
        localStorage.setItem('ohsms_db_adapter', entry.dbAdapter);

        if (entry.dbAdapter === 'firebase') {
            if (entry.firebaseConfig) {
                // Switch to the stored config (different Firebase project)
                localStorage.setItem('ohsms_firebase_config', entry.firebaseConfig);
            } else {
                // No stored config — REMOVE the override so firebase.js falls
                // back to VITE_ env vars or built-in defaults (the "home" project).
                // Without this removal the old project's config would survive the reload.
                localStorage.removeItem('ohsms_firebase_config');
            }
        }

        if (entry.dbAdapter === 'rest') {
            if (entry.restUrl) {
                localStorage.setItem('ohsms_rest_base_url', entry.restUrl);
            } else {
                localStorage.removeItem('ohsms_rest_base_url');
            }
        }
    } catch (err) {
        console.warn('[orgRegistry] Failed to apply DB config:', err);
    }
}

// ─── helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the entry's DB config matches what is currently active
 * in localStorage — meaning no page reload is needed to switch to it.
 *
 * @param {OrgRegistryEntry} entry
 * @param {string|null}      activeOrgId  Optional: the orgId of the currently
 *   signed-in session.  When provided, the check is narrowed so that only the
 *   entry whose orgId matches is considered "active".  This prevents multiple
 *   organisations that share the same Firebase project from all showing the
 *   green "Active" indicator simultaneously.
 * @returns {boolean}
 */
export function isCurrentDb(entry, activeOrgId = null) {
    try {
        const currentAdapter =
            localStorage.getItem('ohsms_db_adapter') || 'firebase';
        if (entry.dbAdapter !== currentAdapter) return false;

        let dbConfigMatches = false;

        if (entry.dbAdapter === 'firebase') {
            const currentFb = localStorage.getItem('ohsms_firebase_config') || '';
            dbConfigMatches = (entry.firebaseConfig || '') === currentFb;
        } else if (entry.dbAdapter === 'rest') {
            // Normalise trailing slash so 'http://x.com/' and 'http://x.com' match
            const norm = (u) => (u || '').replace(/\/$/, '').toLowerCase();
            dbConfigMatches =
                norm(entry.restUrl) === norm(localStorage.getItem('ohsms_rest_base_url'));
        }

        if (!dbConfigMatches) return false;

        // If a current org context is available, also verify the org matches.
        // Without this, multiple orgs that share the same Firebase project would
        // all show as "Active" because their database credentials are identical.
        if (activeOrgId) return entry.orgId === activeOrgId;

        return true;
    } catch {
        return false;
    }
}

/**
 * Short human-readable label for the entry's DB adapter.
 *
 * @param {OrgRegistryEntry} entry
 * @returns {string}
 */
export function getDbTypeLabel(entry) {
    if (entry.dbAdapter === 'rest') {
        const url = (entry.restUrl || '').replace(/https?:\/\//, '');
        return url ? `REST: ${url.substring(0, 22)}` : 'REST API';
    }
    return 'Firebase RTDB';
}
