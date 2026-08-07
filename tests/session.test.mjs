import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_KEY,
  writeStoredSession,
  readStoredSession,
  clearStoredSession,
} from '../src/utils/session.js';
import { ROLES, ALL_SITES } from '../src/utils/permissions.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const base = { uid: 'u1', orgId: 'org1', name: 'Alex', role: 'Global Owner', status: 'Active' };

test('write → read round-trips a normalized session', () => {
  const store = fakeStorage();
  const written = writeStoredSession(base, store);
  assert.equal(written.role, ROLES.GLOBAL_OWNER);
  assert.equal(written.assignedSite, ALL_SITES);

  const read = readStoredSession(store);
  assert.deepEqual(read, written);
});

test('read returns null for missing, corrupt, or inactive sessions', () => {
  const store = fakeStorage();
  assert.equal(readStoredSession(store), null);

  store.setItem(SESSION_KEY, '{not json');
  assert.equal(readStoredSession(store), null);

  writeStoredSession({ ...base, status: 'Inactive' }, store);
  assert.equal(readStoredSession(store), null);

  writeStoredSession({ ...base, orgId: null }, store);
  assert.equal(readStoredSession(store), null);
});

test('clearStoredSession removes the session', () => {
  const store = fakeStorage();
  writeStoredSession(base, store);
  clearStoredSession(store);
  assert.equal(readStoredSession(store), null);
});
