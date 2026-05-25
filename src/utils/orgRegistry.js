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

// ─── types (JSDoc only, no TS) ─────────────────────────────────────────────

/**
 * @typedef {Object} OrgRegistryEntry
 * @property {string}           orgId
 * @property {string}           orgName
 * @property {string|null}      logoBase64       Base-64 JPEG, or null
 * @property {'firebase'|'rest'} dbAdapter
 * @property {string|null}      firebaseConfig   JSON string of the firebase SDK config
 * @property {string|null}      restUrl          Base URL for the REST adapter
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
        if (entry.dbAdapter === 'firebase' && entry.firebaseConfig) {
            localStorage.setItem('ohsms_firebase_config', entry.firebaseConfig);
        }
        if (entry.dbAdapter === 'rest' && entry.restUrl) {
            localStorage.setItem('ohsms_rest_base_url', entry.restUrl);
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
 * @returns {boolean}
 */
export function isCurrentDb(entry) {
    try {
        const currentAdapter =
            localStorage.getItem('ohsms_db_adapter') || 'firebase';
        if (entry.dbAdapter !== currentAdapter) return false;

        if (entry.dbAdapter === 'firebase') {
            const currentFb = localStorage.getItem('ohsms_firebase_config') || '';
            return (entry.firebaseConfig || '') === currentFb;
        }
        if (entry.dbAdapter === 'rest') {
            const currentUrl = localStorage.getItem('ohsms_rest_base_url') || '';
            return (entry.restUrl || '') === currentUrl;
        }
        return false;
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
