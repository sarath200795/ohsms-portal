/**
 * Firebase RTDB REST helper
 *
 * Provides HTTPS-based read/write operations for Firebase Realtime Database,
 * bypassing the SDK WebSocket.  Use this on critical initial-load paths where
 * a blocked or slow WebSocket would hang the UI indefinitely.
 *
 * Every method has a built-in 15-second AbortController timeout.
 *
 * Usage:
 *   import { rtdbRest, isFirebaseRestAvailable } from '../utils/rtdbRest.js';
 *   if (isFirebaseRestAvailable()) {
 *     const idToken = await authService.getIdToken();
 *     const data = await rtdbRest.get('organizations/orgId/details', idToken);
 *   }
 */

import { firebaseConfig } from '../config/firebase.js';

const TIMEOUT_MS = 5_000;

// ─── Circuit breaker ─────────────────────────────────────────────────────────
// When a burst of parallel REST fetches exhausts the browser's per-origin
// connection pool (Chrome throws ERR_INSUFFICIENT_RESOURCES), every
// subsequent fetch in the same tick also fails. Retrying REST in that state
// just slows the page down — fall through to the SDK immediately instead.
//
// After CIRCUIT_THRESHOLD failures inside CIRCUIT_WINDOW_MS, isFirebase-
// RestAvailable() flips to false for CIRCUIT_COOLDOWN_MS. Callers that
// honour the helper (e.g. orgData.readOrgChild) skip straight to the SDK.

const CIRCUIT_WINDOW_MS = 5_000;
const CIRCUIT_THRESHOLD = 2;
const CIRCUIT_COOLDOWN_MS = 30_000;

let _recentFailures = [];
let _circuitOpenedAt = 0;

const _circuitIsOpen = () => {
    if (_circuitOpenedAt && Date.now() - _circuitOpenedAt < CIRCUIT_COOLDOWN_MS) return true;
    if (_circuitOpenedAt) _circuitOpenedAt = 0;
    return false;
};

const _recordFailure = () => {
    const now = Date.now();
    _recentFailures = _recentFailures.filter((t) => now - t < CIRCUIT_WINDOW_MS);
    _recentFailures.push(now);
    if (_recentFailures.length >= CIRCUIT_THRESHOLD) {
        _circuitOpenedAt = now;
        _recentFailures = [];
        console.warn(`[rtdbRest] Circuit breaker tripped — skipping REST for ${CIRCUIT_COOLDOWN_MS / 1000}s and falling back to SDK.`);
    }
};

// ─── In-flight request dedup ─────────────────────────────────────────────────
// When multiple components (Dashboard + useReminders, etc.) mount in the
// same tick and ask for the same path, share one fetch instead of opening
// a new connection per caller.

const _inflight = new Map();

/** Resolve the active DB adapter ('firebase' | 'rest'). */
const _getAdapter = () => {
    try {
        return (
            localStorage.getItem('ohsms_db_adapter') ||
            (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_DB_ADAPTER : '') ||
            'firebase'
        );
    } catch {
        return 'firebase';
    }
};

/**
 * Returns the RTDB base URL (no trailing slash), or '' if not configured.
 * Reads from the already-resolved `firebaseConfig` object which handles
 * the localStorage → env-var priority chain automatically.
 */
export const getDbUrl = () => String(firebaseConfig.databaseURL || '').replace(/\/$/, '');

/**
 * Whether Firebase RTDB REST calls are available for the current session.
 * Returns false when:
 *   • the active adapter is a custom REST backend (not Firebase), OR
 *   • the database URL isn't configured, OR
 *   • the circuit breaker is open (recent REST failures — fall back to SDK).
 *
 * In all three cases callers should use dbGet / dbSet instead.
 */
export const isFirebaseRestAvailable = () =>
    _getAdapter() === 'firebase' && Boolean(getDbUrl()) && !_circuitIsOpen();

// ─── Internal fetch helper ────────────────────────────────────────────────────

const _fetch = async (url, options = {}) => {
    if (_circuitIsOpen()) {
        throw new Error('[rtdbRest] Circuit open — REST temporarily disabled after recent failures.');
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
            // Firebase returns null for nodes that don't exist (not a 404),
            // but handle 404 defensively.
            if (res.status === 404) return null;
            const msg =
                json && typeof json === 'object'
                    ? json.error || `HTTP ${res.status}`
                    : `HTTP ${res.status}`;
            const httpErr = new Error(`[rtdbRest] ${msg}`);
            // 5xx + 429 contribute to the breaker; 4xx (auth / not-found / bad
            // path) is the caller's problem and shouldn't trip the breaker.
            if (res.status >= 500 || res.status === 429) _recordFailure();
            throw httpErr;
        }

        return json; // null when the RTDB node does not exist
    } catch (err) {
        if (err.name === 'AbortError') {
            _recordFailure();
            throw new Error(
                '[rtdbRest] Request timed out after 5 s. ' +
                'Check that your Firebase Realtime Database is accessible and that ' +
                'the database URL is correct.'
            );
        }
        // TypeError: Failed to fetch — this is the ERR_INSUFFICIENT_RESOURCES /
        // CORS / DNS class of failure. The connection never reached the server,
        // so retrying just compounds the problem. Trip the breaker.
        if (err instanceof TypeError) _recordFailure();
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

// Dedup GET requests by URL — concurrent callers share one fetch promise.
// We only dedup GETs because writes (PUT/POST/PATCH/DELETE) MUST send each
// caller's payload exactly once.
const _dedupedGet = (url) => {
    if (_inflight.has(url)) return _inflight.get(url);
    const p = _fetch(url).finally(() => _inflight.delete(url));
    _inflight.set(url, p);
    return p;
};

const buildUrl = (path, idToken) => {
    const dbUrl = getDbUrl();
    if (!dbUrl) throw new Error('[rtdbRest] Firebase Database URL is not configured.');
    const auth = idToken ? `?auth=${encodeURIComponent(idToken)}` : '';
    // Normalise path — strip leading slash so we don't get double slashes.
    const cleanPath = String(path).replace(/^\//, '');
    return `${dbUrl}/${cleanPath}.json${auth}`;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const rtdbRest = {
    /**
     * GET a RTDB path. Concurrent calls for the same URL share one fetch
     * (in-flight dedup).
     * @returns {Promise<any>} the node value, or null if it does not exist.
     */
    async get(path, idToken) {
        return _dedupedGet(buildUrl(path, idToken));
    },

    /**
     * PUT (overwrite) a RTDB path.
     */
    async set(path, data, idToken) {
        return _fetch(buildUrl(path, idToken), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    /**
     * POST to a RTDB path (generates a push key like dbPush).
     * @returns {Promise<{name: string}>} where name is the generated push key.
     */
    async push(path, data, idToken) {
        return _fetch(buildUrl(path, idToken), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    /**
     * PATCH (shallow merge) a RTDB path.
     */
    async update(path, data, idToken) {
        return _fetch(buildUrl(path, idToken), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    /**
     * DELETE a RTDB path.
     */
    async remove(path, idToken) {
        return _fetch(buildUrl(path, idToken), { method: 'DELETE' });
    },
};
