import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ALL_SITES,
  MODULE_IDS,
  normalizeRole,
  normalizeSessionPermissions,
  isSessionActive,
  canAccessModule,
  canManageUsers,
  scopeRecordsToSite,
} from '../src/utils/permissions.js';

const base = { uid: 'u1', orgId: 'org1', name: 'Alex', email: 'alex@x.com', status: 'Active' };

test('normalizeRole maps loose values onto the three roles', () => {
  assert.equal(normalizeRole('global owner'), ROLES.GLOBAL_OWNER);
  assert.equal(normalizeRole('Admin'), ROLES.GLOBAL_OWNER);
  assert.equal(normalizeRole('Site Owner'), ROLES.SITE_OWNER);
  assert.equal(normalizeRole('worker-whatever'), ROLES.USER);
  assert.equal(normalizeRole(undefined), ROLES.USER);
});

test('global owner gets every module and All Sites', () => {
  const s = normalizeSessionPermissions({ ...base, role: 'Global Owner', assignedSite: 'Plant A' });
  assert.deepEqual(s.accessibleModules, MODULE_IDS);
  assert.equal(s.assignedSite, ALL_SITES);
  assert.ok(canManageUsers(s));
  assert.ok(canAccessModule(s, 'sites'));
});

test('site owner gets all modules except sites, scoped to their site', () => {
  const s = normalizeSessionPermissions({ ...base, role: 'Site Owner', assignedSite: 'Plant A' });
  assert.equal(s.assignedSite, 'Plant A');
  assert.ok(s.accessibleModules.includes('users'));
  assert.ok(!s.accessibleModules.includes('sites'));
  assert.ok(canAccessModule(s, 'incidents'));
});

test('plain user gets only requested valid modules plus dashboard', () => {
  const s = normalizeSessionPermissions({
    ...base,
    role: 'User',
    assignedSite: 'Plant B',
    accessibleModules: ['incidents', 'users', 'sites', 'nope', 'trainings', 'dashboard'],
  });
  assert.deepEqual(s.accessibleModules, ['dashboard', 'incidents', 'trainings']);
  assert.ok(!canManageUsers(s));
});

test('inactive or incomplete sessions are not active', () => {
  assert.ok(isSessionActive(normalizeSessionPermissions({ ...base, role: 'User' })));
  assert.ok(!isSessionActive(normalizeSessionPermissions({ ...base, status: 'Inactive' })));
  assert.ok(!isSessionActive(normalizeSessionPermissions({ ...base, uid: null })));
  assert.ok(!isSessionActive(null));
  assert.ok(!canAccessModule(null, 'incidents'));
});

test('scopeRecordsToSite filters by assigned site but passes All Sites through', () => {
  const records = [
    { id: 1, site: 'Plant A' },
    { id: 2, site: 'Plant B' },
    { id: 3 }, // legacy record without a site stays visible
  ];
  const owner = normalizeSessionPermissions({ ...base, role: 'Global Owner' });
  const scopedOwner = scopeRecordsToSite(owner, records);
  assert.equal(scopedOwner.length, 3);

  const siteUser = normalizeSessionPermissions({ ...base, role: 'User', assignedSite: 'Plant A' });
  const scopedUser = scopeRecordsToSite(siteUser, records);
  assert.deepEqual(scopedUser.map((r) => r.id), [1, 3]);
});
