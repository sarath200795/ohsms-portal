import { getDbAdapterChoice } from '../../config/firebase.js';
import { firebaseAdapter } from './firebaseAdapter.js';
import { restAdapter } from './restAdapter.js';

// Adapter is selected once at module load:
// localStorage('ohsms_db_adapter') → VITE_DB_ADAPTER → 'firebase'.
const adapter = getDbAdapterChoice() === 'rest' ? restAdapter : firebaseAdapter;

export const dbGet = (path) => adapter.get(path);
export const dbSet = (path, value) => adapter.set(path, value);
export const dbUpdate = (path, value) => adapter.update(path, value);
export const dbPush = (path, value) => adapter.push(path, value);
export const dbRemove = (path) => adapter.remove(path);
export const dbSubscribe = (path, callback) => adapter.subscribe(path, callback);

// Org-scoped helpers: orgGet(orgId, 'incidents') → organizations/{orgId}/incidents
export const orgPath = (orgId, collection) => `organizations/${orgId}/${collection}`;
export const orgGet = (orgId, collection) => dbGet(orgPath(orgId, collection));
export const orgSet = (orgId, collection, value) => dbSet(orgPath(orgId, collection), value);
export const orgUpdate = (orgId, collection, value) => dbUpdate(orgPath(orgId, collection), value);
export const orgPush = (orgId, collection, value) => dbPush(orgPath(orgId, collection), value);
export const orgRemove = (orgId, collection) => dbRemove(orgPath(orgId, collection));
export const orgSubscribe = (orgId, collection, callback) =>
  dbSubscribe(orgPath(orgId, collection), callback);

// Normalize an RTDB object map into a sorted array of records with ids.
export function toRecords(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .map(([id, record]) => ({ id, ...record }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
