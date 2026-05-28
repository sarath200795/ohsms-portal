export const SITE_REGION_OPTIONS = ['North', 'East', 'West', 'South'];

const safeObjectEntries = (value) => {
    if (!value || typeof value !== 'object') return [];
    return Array.isArray(value)
        ? value.map((item, index) => [String(index), item]).filter(([, item]) => item && typeof item === 'object')
        : Object.entries(value).filter(([, item]) => item && typeof item === 'object');
};

// Normalise the `centers` payload that may come back from the database
// in either array OR object-of-objects form.  Keeps the rest of the app
// from having to care which shape it is.
const normalizeCentersField = (raw) => {
    if (!raw) return [];
    const entries = Array.isArray(raw)
        ? raw
        : (typeof raw === 'object' ? Object.values(raw) : []);
    return entries
        .map((c) => {
            if (!c || typeof c !== 'object') return null;
            const code = String(c.code || '').trim();
            const name = String(c.name || '').trim();
            if (!code && !name) return null;
            return { code, name };
        })
        .filter(Boolean);
};

export const normalizeSites = (rawSites = {}) => (
    safeObjectEntries(rawSites)
        .map(([key, site]) => {
            const siteValue = typeof site === 'object' && site !== null ? site : { code: key, name: site };
            return {
                firebaseKey: key,
                code: siteValue.code || key,
                name: siteValue.name || siteValue.code || key,
                region: siteValue.region || '',
                address: siteValue.address || '',
                manager: siteValue.manager || '',
                centers: normalizeCentersField(siteValue.centers)
            };
        })
        .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')))
);

export const buildRegionOptions = (sites = []) => (
    SITE_REGION_OPTIONS.filter((region) => sites.some((site) => site.region === region))
);

export const filterSitesByRegion = (sites = [], regionFilter = 'All') => (
    regionFilter === 'All' ? sites : sites.filter((site) => site.region === regionFilter)
);

export const getSiteRegion = (sites = [], siteId = '') => (
    sites.find((site) => site.code === siteId)?.region || ''
);

export const matchesRegionFilter = (siteId, sites = [], regionFilter = 'All') => {
    if (regionFilter === 'All') return true;
    if (!siteId || siteId === 'GLOBAL' || siteId === 'Global' || siteId === 'All') return false;
    return getSiteRegion(sites, siteId) === regionFilter;
};

export const passesSiteAndRegionFilter = ({ siteId, siteFilter = 'All', regionFilter = 'All', sites = [] }) => {
    const siteMatch = siteFilter === 'All' || siteId === siteFilter;
    const regionMatch = matchesRegionFilter(siteId, sites, regionFilter);
    return siteMatch && regionMatch;
};
