export const getCompanyIncidentKey = (incident = {}, index = 0, fallbackPrefix = 'local-incident') => {
    if (incident.firebaseKey) return incident.firebaseKey;
    if (incident.id) return incident.id;

    const incidentDate = incident.incidentDate || incident.date || 'undated';
    return `${fallbackPrefix}-${incidentDate}-${index}`;
};

export const buildCompanyIncidentEntries = ({
    vendorIncidents = [],
    globalIncidents = [],
    contractorId = '',
    fallbackPrefix = 'local-incident'
} = {}) => {
    const localEntries = vendorIncidents
        .filter(Boolean)
        .map((incident, index) => ({
            id: incident.id || 'INC',
            date: incident.date,
            type: incident.type || 'Incident',
            desc: incident.desc || incident.description,
            key: getCompanyIncidentKey(incident, index, fallbackPrefix)
        }));

    const syncedEntries = globalIncidents
        .filter((incident) => incident?.affectedPersonType === 'Contractor' && incident?.contractorId === contractorId)
        .map((incident, index) => ({
            id: incident.id,
            date: incident.incidentDate || incident.date,
            type: incident.incidentType || incident.type,
            desc: incident.description || incident.title,
            key: getCompanyIncidentKey(incident, index, `${contractorId || fallbackPrefix}-global`)
        }));

    return [...localEntries, ...syncedEntries]
        .sort((left, right) => new Date(right.date || '1970-01-01') - new Date(left.date || '1970-01-01'));
};
