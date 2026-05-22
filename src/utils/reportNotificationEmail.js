/**
 * Report notification emails — sent to all org members whenever a report
 * is created, updated, or exported.
 *
 * Uses the same EmailJS service as vendorPortalEmail.js.
 * Requires one extra env var:
 *   VITE_EMAILJS_TEMPLATE_ID_REPORT_NOTIFICATION
 *
 * The EmailJS template should expose these variables:
 *   {{to_name}}, {{to_email}}, {{report_type}}, {{report_title}},
 *   {{report_id}}, {{site_id}}, {{severity}}, {{action_label}},
 *   {{triggered_by}}, {{report_date}}
 */

const env = typeof import.meta !== 'undefined' ? import.meta.env : {};
const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

const getVal = (key) => String(env[key] || '').trim();

const getNotificationConfig = () => ({
    publicKey: getVal('VITE_EMAILJS_PUBLIC_KEY'),
    serviceId: getVal('VITE_EMAILJS_SERVICE_ID'),
    templateId: getVal('VITE_EMAILJS_TEMPLATE_ID_REPORT_NOTIFICATION'),
});

export const isReportNotificationConfigured = () => {
    const { publicKey, serviceId, templateId } = getNotificationConfig();
    return Boolean(publicKey && serviceId && templateId);
};

/**
 * Fire a single EmailJS send. Returns a promise; does NOT throw —
 * failures are swallowed so a bad send never blocks the user.
 */
const sendOne = (config, templateParams) =>
    fetch(EMAILJS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            service_id: config.serviceId,
            template_id: config.templateId,
            user_id: config.publicKey,
            template_params: templateParams,
        }),
    }).catch(() => { /* network error — swallow */ });

/**
 * Send a report notification to every org member who has a valid email.
 *
 * This is intentionally fire-and-forget: call without `await` so the UI
 * is never blocked waiting for email delivery.
 *
 * @param {Object} opts
 * @param {Array<{name:string, email:string}>} opts.recipients  All org users
 * @param {string} opts.reportType    e.g. "Incident Report"
 * @param {string} opts.reportTitle   Human-readable title of the report
 * @param {string} opts.reportId      Reference ID / Firebase key
 * @param {string} opts.siteId        Site code
 * @param {string} opts.severity      Severity / priority level
 * @param {string} opts.actionLabel   e.g. "Submitted", "Draft Updated", "PDF Exported"
 * @param {string} opts.triggeredBy   Name/email of the user who made the change
 * @param {string} opts.reportDate    ISO date string of the change
 */
export const sendReportNotification = ({
    recipients = [],
    reportType = 'Report',
    reportTitle = '',
    reportId = '',
    siteId = '',
    severity = '',
    actionLabel = 'Updated',
    triggeredBy = '',
    reportDate = '',
}) => {
    const config = getNotificationConfig();
    if (!config.publicKey || !config.serviceId || !config.templateId) return;

    const validRecipients = recipients.filter(
        (r) => r.email && r.email.includes('@')
    );
    if (validRecipients.length === 0) return;

    const dateStr = reportDate
        ? new Date(reportDate).toLocaleString()
        : new Date().toLocaleString();

    // Parallel — don't await; fire and forget
    Promise.allSettled(
        validRecipients.map((r) =>
            sendOne(config, {
                to_name: r.name || r.email,
                to_email: r.email,
                report_type: reportType,
                report_title: reportTitle || '(Untitled)',
                report_id: reportId || 'DRAFT',
                site_id: siteId || 'N/A',
                severity: severity || 'N/A',
                action_label: actionLabel,
                triggered_by: triggeredBy || 'System',
                report_date: dateStr,
            })
        )
    );
};

/* ── Convenience wrappers for each module ───────────────────────── */

export const notifyIncidentSaved = (incident, users, saveStage, triggeredBy) => {
    const actionLabel =
        saveStage === 'initial' ? 'Initial Report Submitted' :
        saveStage === 'investigation-final' ? 'Investigation Report Completed' :
        'Investigation Draft Updated';

    sendReportNotification({
        recipients: users,
        reportType: 'Incident Report',
        reportTitle: incident.title,
        reportId: incident.id || incident.firebaseKey,
        siteId: incident.siteId,
        severity: incident.severity,
        actionLabel,
        triggeredBy,
        reportDate: new Date().toISOString(),
    });
};

export const notifyInspectionSubmitted = (inspection, users, triggeredBy) => {
    sendReportNotification({
        recipients: users,
        reportType: 'Inspection Report',
        reportTitle: inspection.templateName || inspection.title || 'Inspection',
        reportId: inspection.firebaseKey || inspection.id,
        siteId: inspection.siteId,
        severity: inspection.priority || '',
        actionLabel: 'Inspection Submitted',
        triggeredBy,
        reportDate: new Date().toISOString(),
    });
};

export const notifyAuditSaved = (audit, users, actionLabel, triggeredBy) => {
    sendReportNotification({
        recipients: users,
        reportType: 'Audit Report',
        reportTitle: audit.title || audit.auditType || 'Audit',
        reportId: audit.firebaseKey || audit.id,
        siteId: audit.siteId,
        severity: audit.priority || '',
        actionLabel: actionLabel || 'Audit Updated',
        triggeredBy,
        reportDate: new Date().toISOString(),
    });
};

export const notifyCapaUpdated = (action, users, triggeredBy) => {
    sendReportNotification({
        recipients: users,
        reportType: 'CAPA Action',
        reportTitle: action.act || action.title || 'CAPA Action',
        reportId: action.actionId || action.firebaseKey,
        siteId: action.siteId,
        severity: action.status || '',
        actionLabel: `Status Changed to ${action.status || 'Updated'}`,
        triggeredBy,
        reportDate: new Date().toISOString(),
    });
};
