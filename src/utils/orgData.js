import { equalTo, get, orderByChild, query, ref } from 'firebase/database';
import { isGlobalOwnerRole } from './permissions.js';
import { readStoredSession } from './session';

const SITE_SCOPED_COLLECTIONS = new Set([
    'riskAssessments',
    'incidents',
    'consultations',
    'auditPlans',
    'auditFindings',
    'improvements',
    'ptwRecords',
    'mockDrills',
    'emergencyEquipment',
    'inspectionTemplates',
    'inspectionRecords',
    'trainings',
    'manHours',
    'healthCases',
    'healthSurveillance',
    'vaccinationRecords',
    'illnessRecords'
]);

const mergeSnapshots = (snapshots) => {
    const merged = {};
    snapshots.forEach((snap) => {
        if (!snap.exists()) return;
        Object.entries(snap.val() || {}).forEach(([key, value]) => {
            merged[key] = value;
        });
    });
    return Object.keys(merged).length > 0 ? merged : null;
};

const getScopedSiteCodes = (session) => {
    if (!session || isGlobalOwnerRole(session.role) || session.assignedSite === 'GLOBAL') return [];
    return [session.assignedSite].filter(Boolean);
};

const getScopedQuerySites = (session, childName) => {
    const scopedSites = getScopedSiteCodes(session);
    if (childName === 'inspectionTemplates' && scopedSites.length > 0) {
        return [...new Set([...scopedSites, 'GLOBAL'])];
    }
    return scopedSites;
};

export const readOrgChild = async (db, orgId, childName, options = {}) => {
    const session = options.session || readStoredSession();

    if (SITE_SCOPED_COLLECTIONS.has(childName)) {
        const scopedSites = getScopedQuerySites(session, childName);
        if (scopedSites.length > 0) {
            const snapshots = await Promise.all(
                scopedSites.map((siteId) =>
                    get(query(ref(db, `organizations/${orgId}/${childName}`), orderByChild('siteId'), equalTo(siteId)))
                )
            );
            return mergeSnapshots(snapshots);
        }
    }

    const snap = await get(ref(db, `organizations/${orgId}/${childName}`));
    return snap.exists() ? snap.val() : null;
};

export const readOrgChildren = async (db, orgId, childNames = [], options = {}) => {
    const uniqueChildren = [...new Set(childNames.filter(Boolean))];
    const entries = await Promise.all(
        uniqueChildren.map(async (childName) => [childName, await readOrgChild(db, orgId, childName, options)])
    );

    return Object.fromEntries(entries);
};
