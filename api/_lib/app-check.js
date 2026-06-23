/**
 * api/_lib/app-check.js
 *
 * Server-side verification of Firebase App Check tokens.
 *
 * App Check produces a short-lived token (via reCAPTCHA Enterprise on the
 * web) that proves the request came from a registered, attested instance
 * of the app — not a curl script, not a Postman collection, not a stolen
 * ID token replayed from another origin.
 *
 * The client SDK auto-attaches the token as the `X-Firebase-AppCheck`
 * header on Firebase API calls; on our own admin endpoints we read and
 * verify it explicitly.
 *
 * Two enforcement modes:
 *   ENFORCE_APP_CHECK=true   → reject missing / invalid tokens with 401
 *   anything else            → log a warning, but allow the request
 *
 * Keep ENFORCE_APP_CHECK=false during initial rollout, watch logs for
 * legitimate calls that arrive without a token (legacy clients, server-
 * to-server jobs), then flip to true once the warning count is zero.
 */

import { getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';

const HEADER = 'x-firebase-appcheck';

const enforce = () => String(process.env.ENFORCE_APP_CHECK || '').toLowerCase() === 'true';

const readHeader = (request) => {
    // Vercel passes Headers as a fetch-style object (case-insensitive get).
    if (typeof request?.headers?.get === 'function') {
        return request.headers.get(HEADER) || request.headers.get('X-Firebase-AppCheck') || '';
    }
    // Node-style header bag (Express, raw IncomingMessage).
    const bag = request?.headers || {};
    return bag[HEADER] || bag['X-Firebase-AppCheck'] || '';
};

/**
 * Verify the X-Firebase-AppCheck header on `request`.
 *
 * Returns `{ appId, token }` on success, or throws an Error with
 * `.statusCode = 401` on failure (when enforced).
 *
 * When enforcement is off, missing / invalid tokens log a warning and
 * return `{ appId: null, token: null }` so the request can proceed.
 */
export const verifyAppCheck = async (request, { label = 'api' } = {}) => {
    const token = readHeader(request);

    if (!token) {
        if (enforce()) {
            throw Object.assign(new Error('Missing App Check token.'), { statusCode: 401 });
        }
        console.warn(`[${label}] App Check token missing (enforcement off).`);
        return { appId: null, token: null };
    }

    const app = getApps().find((a) => a.name === '[DEFAULT]') || getApps()[0];
    if (!app) {
        // Admin SDK not initialised yet — the caller initialises it before
        // calling us, so this is a programmer error.
        throw new Error('Firebase Admin SDK not initialised before verifyAppCheck.');
    }

    try {
        const decoded = await getAppCheck(app).verifyToken(token);
        return { appId: decoded.appId, token };
    } catch (verifyErr) {
        if (enforce()) {
            throw Object.assign(new Error('Invalid or expired App Check token.'), { statusCode: 401 });
        }
        console.warn(`[${label}] App Check token invalid (enforcement off):`, verifyErr.message);
        return { appId: null, token: null };
    }
};
