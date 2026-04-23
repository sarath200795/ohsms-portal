import { get, ref } from 'firebase/database';

export const readOrgChild = async (db, orgId, childName) => {
    const snap = await get(ref(db, `organizations/${orgId}/${childName}`));
    return snap.exists() ? snap.val() : null;
};

export const readOrgChildren = async (db, orgId, childNames = []) => {
    const uniqueChildren = [...new Set(childNames.filter(Boolean))];
    const entries = await Promise.all(
        uniqueChildren.map(async (childName) => [childName, await readOrgChild(db, orgId, childName)])
    );

    return Object.fromEntries(entries);
};
