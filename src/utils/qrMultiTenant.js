// Multi-tenant QR helpers. Each org runs its own Firebase project, configured
// via the /setup wizard and stored in localStorage('ohsms_firebase_config').
// That works for the signed-in user who set the org up, but a phone scanning
// a QR has no localStorage entry and falls back to the build-time env vars —
// which may be empty. Embedding the org's databaseURL in the QR lets ANY
// scanner resolve the record by direct REST against the right project,
// bypassing the locally-initialized Firebase SDK.
//
// The databaseURL is already public (it ships in every page bundle) so
// adding it to the QR doesn't leak anything new.

/**
 * Validate + strip trailing slash from a databaseURL pulled out of a QR's
 * `db` query param. Returns '' when missing/malformed so the caller can fall
 * back to its SDK path. We hard-restrict to Firebase's own domains so an
 * attacker-supplied QR can't redirect the public REST fetch to malicious
 * infrastructure.
 */
export const sanitizeDatabaseURL = (rawUrl) => {
    const value = String(rawUrl || '').trim().replace(/\/$/, '');
    if (!value) return '';
    if (!/^https:\/\/[a-zA-Z0-9-]+\.(firebaseio\.com|firebasedatabase\.app)/.test(value)) return '';
    return value;
};

/**
 * Public REST read against a specific Firebase RTDB instance.
 * Used by the public QR scan path on EmergencyEquipment / PTW / LOTO when
 * the URL carries `db=...`. Bypasses the locally-initialized Firebase SDK
 * so a fresh phone with no /setup config still resolves any org's record.
 *
 * The corresponding RTDB rules must allow public read at the target path
 * (e.g. emergencyEquipment/$id .read = data.exists(); ptwRecords/$id and
 * lotoProcedures/$id .read = data.child('publicQrEnabled').val() === true).
 *
 * @param {string} databaseURL  Validated by sanitizeDatabaseURL().
 * @param {string} fullPath     e.g. 'organizations/<orgId>/ptwRecords/<id>'
 * @returns {Promise<object|null>}
 */
export const restReadPublic = async (databaseURL, fullPath) => {
    const url = `${databaseURL}/${fullPath.split('/').map(encodeURIComponent).join('/')}.json`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`REST read ${res.status}: ${body || res.statusText}`);
    }
    return res.json();
};

/**
 * Build the `&db=<encoded>` URL suffix for a QR value. Returns '' when the
 * caller has no databaseURL available (e.g., REST adapter mode) so the QR
 * just degrades to SDK-only resolution.
 */
export const buildDbSuffix = (databaseURL) => {
    const clean = sanitizeDatabaseURL(databaseURL);
    return clean ? `&db=${encodeURIComponent(clean)}` : '';
};
