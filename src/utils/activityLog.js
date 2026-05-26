/**
 * activityLog.js
 *
 * Append-only activity audit trail for all module-level CRUD operations.
 *
 * Every create, update, and delete across safety-critical modules (Incidents,
 * Risk, Audit, CAPA, Training, Inspections, PTW, Contractors, Improvement)
 * writes a timestamped, immutable entry to `organizations/{orgId}/activityLog`.
 *
 * The RTDB rule for this collection includes `.validate: "!data.exists()"` which
 * prevents any existing entry from being overwritten or deleted — making the log
 * tamper-proof from the client.
 *
 * Usage:
 *   import { writeActivityLog, buildActivityEntry } from '../../utils/activityLog.js';
 *
 *   // After a successful dbPush / dbUpdate / dbRemove:
 *   await writeActivityLog(session.orgId, buildActivityEntry({
 *     session,
 *     action: 'incident.created',
 *     module: 'Incidents',
 *     collection: 'incidents',
 *     recordId: newKey,
 *     recordTitle: data.title,
 *     siteId: data.siteId,
 *   }));
 */

import { dbPush } from '../services/db/index.js';

// ── Entry builder ─────────────────────────────────────────────────────────────

/**
 * Build a structured activity log entry.
 *
 * @param {object} opts
 * @param {object} opts.session       The current user session (uid, name, email, role, assignedSite)
 * @param {string} opts.action        Dot-notation action: '<module>.<verb>'
 *                                    e.g. 'incident.created' | 'risk.updated' | 'audit.deleted'
 * @param {string} opts.module        Human-readable module name, e.g. 'Incidents'
 * @param {string} opts.collection    RTDB collection name, e.g. 'incidents'
 * @param {string} opts.recordId      RTDB push key of the affected record
 * @param {string} [opts.recordTitle] Human-readable label (title, name, code, etc.)
 * @param {string} [opts.siteId]      Site the record belongs to
 * @param {object} [opts.changes]     For updates: { before: {...}, after: {...} } (optional)
 * @returns {object}
 */
export const buildActivityEntry = ({
    session,
    action,
    module,
    collection,
    recordId,
    recordTitle = '',
    siteId,
    changes = null,
}) => ({
    action,
    module,
    collection,
    recordId: String(recordId || ''),
    recordTitle: String(recordTitle || ''),
    siteId: String(siteId || session?.assignedSite || ''),
    actorUid: String(session?.uid || ''),
    actorName: String(session?.name || session?.email || ''),
    actorRole: String(session?.role || ''),
    ...(changes ? { changes } : {}),
});

// ── Writer ────────────────────────────────────────────────────────────────────

/**
 * Append an activity log entry to `organizations/{orgId}/activityLog`.
 *
 * This is fire-and-forget — a failure to write the audit log must NEVER
 * prevent the module save from completing.  Errors are surfaced as console
 * warnings only.
 *
 * @param {string} orgId
 * @param {object} entry  Built via buildActivityEntry()
 */
export const writeActivityLog = async (orgId, entry) => {
    try {
        if (!orgId || !entry?.action) return;
        await dbPush(`organizations/${orgId}/activityLog`, {
            ...entry,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.warn('[activityLog] write failed (non-blocking):', err?.message || err);
    }
};
