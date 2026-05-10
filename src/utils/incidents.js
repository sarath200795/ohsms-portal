const DEFAULT_FIVE_WHY_PATH = {
    id: 1,
    name: 'Analysis Path 1',
    whys: ['', '', '', '', '']
};
const DEFAULT_INCIDENT_REPORTING = {
    initialSubmittedAt: '',
    investigationCompletedAt: '',
    investigationRequired: false,
    investigationStatus: 'Not Required',
    currentStage: 'initial'
};

const HIGH_SEVERITY_VERIFICATION_LEVELS = new Set(['Level C', 'Level D']);
const INVESTIGATION_REQUIRED_TYPES = new Set([
    'First Aid injury',
    'Property Damage',
    'Lost Time injury',
    'Reportable Injury'
]);
const OPTIONAL_NEAR_MISS_INVESTIGATION_LEVELS = new Set(['Level C', 'Level D']);

const ensureIncidentActionArray = (actions) => (
    Array.isArray(actions) ? actions.filter(Boolean) : []
);

const ensureArray = (value) => (
    Array.isArray(value) ? value.filter(Boolean) : []
);

const hasTextValue = (value) => Boolean(String(value || '').trim());

const hasFiveWhyContent = (fiveWhys) => ensureArray(fiveWhys).some((path) => (
    ensureArray(path?.whys).some((why) => hasTextValue(why))
));

const hasFishboneContent = (fishbone) => Object.values(fishbone || {}).some((values) => (
    ensureArray(values).some((value) => hasTextValue(value))
));

const hasFaultTreeContent = (node) => {
    if (!node) return false;
    if (hasTextValue(node.label) && String(node.label).trim() !== 'Top Event') return true;
    return ensureArray(node.children).some((child) => hasFaultTreeContent(child));
};

const createIncidentCapaActionId = (createId = () => Date.now(), index = 0) => (
    `capa-${createId()}-${index}`
);

export const buildVerificationActionDescription = (actionText) => (
    `Verification of CAPA closure: ${String(actionText || '').trim()}`
);

export const incidentSeverityNeedsVerification = (severity) => (
    HIGH_SEVERITY_VERIFICATION_LEVELS.has(String(severity || '').trim())
);

export const createDefaultIncidentReporting = () => ({
    ...DEFAULT_INCIDENT_REPORTING
});

export const incidentNeedsInvestigation = ({ type, smartType, severity } = {}) => {
    const normalizedType = String(type || '').trim();
    const normalizedSmartType = String(smartType || '').trim();
    const normalizedSeverity = String(severity || '').trim();

    if (normalizedSmartType === 'Fire & Explosion') return true;
    if (INVESTIGATION_REQUIRED_TYPES.has(normalizedType)) return true;
    if (normalizedType === 'Near Miss') {
        return !OPTIONAL_NEAR_MISS_INVESTIGATION_LEVELS.has(normalizedSeverity);
    }

    return false;
};

export const incidentHasInvestigationContent = (incident = {}) => (
    ensureArray(incident.investigationTeam).length > 0
    || hasTextValue(incident.consultationSummary)
    || hasTextValue(incident.investigation?.rootCause)
    || hasFiveWhyContent(incident.investigation?.fiveWhys)
    || hasFishboneContent(incident.investigation?.fishbone)
    || hasFaultTreeContent(incident.investigation?.faultTree)
    || ensureIncidentActionArray(incident.capa).length > 0
    || ensureArray(incident.linkedHazards).length > 0
    || Boolean(incident.riskUpdated)
);

export const resolveIncidentReportingState = (
    incident = {},
    {
        saveStage = '',
        timestamp = '',
        assumeLegacyCompletion = Boolean(incident?.firebaseKey)
    } = {}
) => {
    const existingReporting = incident?.reporting || {};
    const hasInvestigationContent = incidentHasInvestigationContent(incident);
    const investigationRequired = incidentNeedsInvestigation(incident);
    const baselineTimestamp = String(timestamp || '').trim() || String(incident?.timestamp || '').trim() || '';

    let initialSubmittedAt = String(existingReporting.initialSubmittedAt || '').trim() || baselineTimestamp;
    let investigationCompletedAt = String(existingReporting.investigationCompletedAt || '').trim();

    if (!investigationCompletedAt && assumeLegacyCompletion && !existingReporting.investigationStatus && hasInvestigationContent) {
        investigationCompletedAt = String(incident?.timestamp || '').trim() || initialSubmittedAt;
    }

    let investigationStatus = String(existingReporting.investigationStatus || '').trim();
    let currentStage = String(existingReporting.currentStage || '').trim();

    if (saveStage === 'initial') {
        initialSubmittedAt = initialSubmittedAt || baselineTimestamp;
    }

    if (saveStage === 'investigation-draft') {
        initialSubmittedAt = initialSubmittedAt || baselineTimestamp;
        if (!investigationCompletedAt) {
            investigationStatus = hasInvestigationContent ? 'Draft' : (investigationRequired ? 'Pending' : 'Not Required');
            currentStage = 'initial';
        }
    }

    if (saveStage === 'investigation-final') {
        initialSubmittedAt = initialSubmittedAt || baselineTimestamp;
        investigationCompletedAt = baselineTimestamp || investigationCompletedAt;
        investigationStatus = 'Completed';
        currentStage = 'investigation';
    }

    if (!saveStage) {
        if (investigationCompletedAt) {
            investigationStatus = 'Completed';
            currentStage = 'investigation';
        } else if (hasInvestigationContent) {
            investigationStatus = investigationRequired ? 'Draft' : 'Draft';
            currentStage = 'initial';
        } else {
            investigationStatus = investigationRequired ? 'Pending' : 'Not Required';
            currentStage = 'initial';
        }
    } else if (investigationCompletedAt && saveStage !== 'initial') {
        investigationStatus = 'Completed';
        currentStage = 'investigation';
    } else if (!investigationStatus) {
        investigationStatus = investigationRequired ? 'Pending' : 'Not Required';
        currentStage = 'initial';
    }

    if (saveStage === 'initial' && !investigationCompletedAt) {
        investigationStatus = investigationRequired ? 'Pending' : 'Not Required';
        currentStage = 'initial';
    }

    return {
        ...DEFAULT_INCIDENT_REPORTING,
        ...existingReporting,
        initialSubmittedAt,
        investigationCompletedAt,
        investigationRequired,
        investigationStatus,
        currentStage
    };
};

export const getIncidentPreferredPrintStage = (incident = {}) => {
    const reporting = resolveIncidentReportingState(incident);
    return reporting.investigationCompletedAt ? 'investigation' : 'initial';
};

export const getIncidentReportTitle = (stage = 'initial') => (
    stage === 'investigation' ? 'INCIDENT INVESTIGATION REPORT' : 'INITIAL INFORMATION REPORT'
);

export const normalizeIncidentFiveWhys = (fiveWhys, createId = () => Date.now()) => {
    if (!fiveWhys) return [DEFAULT_FIVE_WHY_PATH];
    if (Array.isArray(fiveWhys) && typeof fiveWhys[0] === 'string') {
        return [{ id: createId(), name: 'Legacy Analysis', whys: fiveWhys }];
    }
    return fiveWhys;
};

export const buildEditableIncidentData = (initialDataState, incident, createId = () => Date.now()) => ({
    ...initialDataState,
    ...incident,
    horizontalDeployment: incident?.horizontalDeployment || false,
    reporting: resolveIncidentReportingState(incident),
    investigation: {
        ...(incident?.investigation || {}),
        fiveWhys: normalizeIncidentFiveWhys(incident?.investigation?.fiveWhys, createId)
    },
    manualOverrides: { type: true, severity: true, smartType: true }
});

export const buildPrintableIncidentData = (incident, createId = () => Date.now(), requestedStage = '') => {
    const reporting = resolveIncidentReportingState(incident);
    const printStage = requestedStage || getIncidentPreferredPrintStage(incident);

    return {
        ...incident,
        reporting,
        printStage,
        reportTitle: getIncidentReportTitle(printStage),
        investigation: {
            ...(incident?.investigation || {}),
            fiveWhys: normalizeIncidentFiveWhys(incident?.investigation?.fiveWhys, createId)
        }
    };
};

export const buildIncidentCapaWithVerificationActions = ({
    actions,
    severity,
    defaultSiteId = '',
    createId = () => Date.now()
}) => {
    const normalizedActions = ensureIncidentActionArray(actions).map((action, index) => {
        const actionId = String(action?.actionId || createIncidentCapaActionId(createId, index));
        const siteId = String(action?.siteId || defaultSiteId || '');
        const verificationForActionId = String(action?.verificationForActionId || '').trim();

        return {
            ...action,
            actionId,
            siteId,
            actionType: action?.actionType || (verificationForActionId ? 'Verification' : 'Corrective'),
            verificationForActionId
        };
    });

    if (!incidentSeverityNeedsVerification(severity)) {
        return normalizedActions;
    }

    const nextActions = [...normalizedActions];

    normalizedActions.forEach((action) => {
        if (action.actionType === 'Verification') return;
        if (String(action.status || '').trim() !== 'Closed') return;
        if (!String(action.act || '').trim()) return;

        const verificationDescription = buildVerificationActionDescription(action.act);
        const existingVerification = normalizedActions.find((candidate) => {
            if (candidate.actionType !== 'Verification') return false;

            const sameSource = String(candidate.verificationForActionId || '').trim() === action.actionId;
            const sameFallbackSignature = String(candidate.act || '').trim() === verificationDescription
                && String(candidate.siteId || defaultSiteId || '').trim() === String(action.siteId || defaultSiteId || '').trim();

            return sameSource || sameFallbackSignature;
        });

        if (existingVerification) return;

        nextActions.push({
            actionId: `${action.actionId}::verification`,
            actionType: 'Verification',
            verificationForActionId: action.actionId,
            act: verificationDescription,
            siteId: action.siteId || defaultSiteId || '',
            own: '',
            due: '',
            status: 'Open',
            generatedByRule: 'high-severity-capa-verification'
        });
    });

    return nextActions;
};
