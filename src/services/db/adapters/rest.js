/**
 * REST API Database Adapter
 *
 * Talks to any HTTP backend that follows the OHSMS REST contract:
 *
 *   GET    /{path}                → returns the stored value (object or array)
 *   GET    /{path}?{field}={val}  → filtered list query
 *   POST   /{path}                → creates a child, returns { id: "..." }
 *   PUT    /{path}                → overwrites (set)
 *   PATCH  /{path}                → partial update (update)
 *   DELETE /{path}                → removes
 *
 * Set VITE_API_BASE_URL in your .env (e.g. "https://api.example.com/v1").
 *
 * Real-time subscriptions fall back to configurable polling.  If your backend
 * supports Server-Sent Events, set VITE_API_SSE=true and expose
 *   GET /{path}?stream=1
 * that returns an event-stream with `data: <json>\n\n` events.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const SSE_ENABLED = import.meta.env.VITE_API_SSE === 'true';
const POLL_INTERVAL_MS = Number(import.meta.env.VITE_API_POLL_MS || 5000);

// ─── JWT token store ──────────────────────────────────────────────────────────
// The auth adapter writes the token here; this adapter reads it for every request.
let _jwtToken = null;
export const setRestToken = (token) => { _jwtToken = token; };
export const clearRestToken = () => { _jwtToken = null; };

// ─── helpers ─────────────────────────────────────────────────────────────────

const headers = (extra = {}) => ({
    'Content-Type': 'application/json',
    ...((_jwtToken) ? { Authorization: `Bearer ${_jwtToken}` } : {}),
    ...extra,
});

const url = (path) => `${BASE_URL}/${path}`;

async function request(method, path, body, queryParams = {}) {
    const qs = Object.keys(queryParams).length
        ? '?' + new URLSearchParams(queryParams).toString()
        : '';

    const res = await fetch(url(path) + qs, {
        method,
        headers: headers(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`[db:rest] ${method} /${path} → ${res.status}: ${text}`);
    }

    // 204 No Content
    if (res.status === 204) return null;

    return res.json().catch(() => null);
}

// ─── adapter ─────────────────────────────────────────────────────────────────

const restAdapter = {
    /**
     * Read an entire path.
     * @param {string} path
     * @returns {Promise<any|null>}
     */
    async get(path) {
        return request('GET', path);
    },

    /**
     * Query a collection by a single field=value filter.
     * Sends as a query parameter: GET /{path}?{field}={value}
     * @param {string} path
     * @param {string} field
     * @param {*}      value
     * @returns {Promise<Record<string,any>|null>}
     */
    async query(path, field, value) {
        return request('GET', path, undefined, { [field]: value });
    },

    /**
     * Overwrite a path completely (PUT).
     * @param {string} path
     * @param {*}      data
     */
    async set(path, data) {
        await request('PUT', path, data);
    },

    /**
     * Create a new child under path (POST).
     * @param {string} path
     * @param {*}      data
     * @returns {Promise<string>} The generated ID returned by the server as { id }
     */
    async push(path, data) {
        const result = await request('POST', path, data);
        return result?.id ?? result?.key ?? null;
    },

    /**
     * Partial update (PATCH).
     * @param {string} path
     * @param {object} data
     */
    async update(path, data) {
        await request('PATCH', path, data);
    },

    /**
     * Delete a path (DELETE).
     * @param {string} path
     */
    async remove(path) {
        await request('DELETE', path);
    },

    /**
     * Atomic multi-path update.
     * With REST adapters, this is executed as parallel individual requests.
     * Backends may optionally expose POST /__batch/update for true atomicity.
     * @param {Record<string, any>} pathsObj  key = full path, value = data (null = delete)
     */
    async multiUpdate(pathsObj) {
        const entries = Object.entries(pathsObj);
        await Promise.all(
            entries.map(([path, value]) =>
                value === null ? restAdapter.remove(path) : restAdapter.update(path, value)
            )
        );
    },

    /**
     * Subscribe to real-time changes.
     * Uses Server-Sent Events if VITE_API_SSE=true, otherwise polls.
     *
     * @param {string}   path
     * @param {function} callback   Called with the current value on every change
     * @param {function} [errCb]
     * @returns {function}          Unsubscribe function
     */
    subscribe(path, callback, errCb) {
        if (SSE_ENABLED) {
            // Server-Sent Events mode
            const sseUrl = `${url(path)}?stream=1${_jwtToken ? `&token=${_jwtToken}` : ''}`;
            const source = new EventSource(sseUrl);
            source.onmessage = (e) => {
                try { callback(JSON.parse(e.data)); }
                catch { callback(null); }
            };
            source.onerror = (err) => {
                if (errCb) errCb(err);
                else console.error('[db:rest] SSE error', err);
            };
            return () => source.close();
        }

        // Polling fallback
        let active = true;
        const poll = async () => {
            if (!active) return;
            try {
                const data = await restAdapter.get(path);
                if (active) callback(data);
            } catch (err) {
                if (errCb) errCb(err);
                else console.error('[db:rest] poll error', err);
            }
            if (active) setTimeout(poll, POLL_INTERVAL_MS);
        };
        poll();
        return () => { active = false; };
    },
};

export default restAdapter;
