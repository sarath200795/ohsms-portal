const DEFAULT_FIVE_WHY_PATH = {
    id: 1,
    name: 'Analysis Path 1',
    whys: ['', '', '', '', '']
};

const HIGH_SEVERITY_VERIFICATION_LEVELS = new Set(['Level C', 'Level D']);

const ensureIncidentActionArray = (actions) => (
    Array.isArray(actions) ? actions.filter(Boolean) : []
);

const createIncidentCapaActionId = (createId = () => Date.now(), index = 0) => (
    `capa-${createId()}-${index}`
);

export const buildVerificationActionDescription = (actionText) => (
    `Verification of CAPA closure: ${String(actionText || '').trim()}`
);

export const incidentSeverityNeedsVerification = (severity) => (
    HIGH_SEVERITY_VERIFICATION_LEVELS.has(String(severity || '').trim())
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
    investigation: {
        ...(incident?.investigation || {}),
        fiveWhys: normalizeIncidentFiveWhys(incident?.investigation?.fiveWhys, createId)
    },
    manualOverrides: { type: true, severity: true, smartType: true }
});

export const buildPrintableIncidentData = (incident, createId = () => Date.now()) => ({
    ...incident,
    investigation: {
        ...(incident?.investigation || {}),
        fiveWhys: normalizeIncidentFiveWhys(incident?.investigation?.fiveWhys, createId)
    }
});

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
