const DEFAULT_FIVE_WHY_PATH = {
    id: 1,
    name: 'Analysis Path 1',
    whys: ['', '', '', '', '']
};

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
