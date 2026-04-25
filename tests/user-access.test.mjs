import test from 'node:test';
import assert from 'node:assert/strict';

import { ACCOUNT_STATUS, canAuthenticateStatus, normalizeSessionData, normalizeUserStatus } from '../src/utils/session.js';
import {
    buildPermissionRequestUpdates,
    normalizeUserAccessPayload,
    normalizeStoredUserRecord,
    toUserRecordKey,
    validateUserAccessPayload
} from '../src/utils/userAccess.js';

test('editing a pending user normalizes status to active and canonical modules', () => {
    const payload = normalizeUserAccessPayload({
        name: 'Jane Tester',
        email: '  Jane@Test.com ',
        role: 'User',
        status: 'Pending',
        accessibleSites: ['HQ-01'],
        accessibleModules: ['CAPA', 'PTW']
    }, { editingExistingUser: true });

    assert.equal(payload.email, 'jane@test.com');
    assert.equal(payload.status, ACCOUNT_STATUS.ACTIVE);
    assert.deepEqual(payload.accessibleModules, ['CAPA Manager', 'OHS Tools']);
});

test('user access validation rejects invalid payloads', () => {
    const result = validateUserAccessPayload({
        name: '',
        email: 'not-an-email',
        role: 'Super User',
        status: 'Whatever'
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.length >= 3);
});

test('legacy roles normalize into supported stored and editable user records', () => {
    const editablePayload = normalizeUserAccessPayload({
        name: 'Safety Representative',
        email: 'hse.rep@test.com',
        role: 'HSE Rep',
        status: 'Active',
        assignedSite: 'HQ-01'
    });
    const storedPayload = normalizeStoredUserRecord({
        name: 'Admin Owner',
        email: 'admin@test.com',
        role: 'Admin',
        status: 'Active'
    });

    assert.equal(editablePayload.role, 'User');
    assert.equal(validateUserAccessPayload(editablePayload).isValid, true);
    assert.equal(storedPayload.role, 'Global Owner');
    assert.equal(storedPayload.assignedSite, 'GLOBAL');
});

test('manual user records use realtime-database safe email keys', () => {
    assert.equal(toUserRecordKey(' Safety.Admin+1@Test.Co.UK '), 'safety_admin+1@test_co_uk');
    assert.equal(toUserRecordKey('ops#lead$team/[north]@test.com'), 'ops_lead_team__north_@test_com');
});

test('permission request updates resolve pending requests for the approved user', () => {
    const updates = buildPermissionRequestUpdates({
        permissionRequests: {
            req1: { userEmail: 'jane@test.com', status: 'Pending' },
            req2: { userEmail: 'other@test.com', status: 'Pending' },
            req3: { userEmail: 'jane@test.com', status: 'Approved' }
        },
        email: 'Jane@Test.com',
        nextStatus: 'Active',
        actorSession: { name: 'Admin User' }
    });

    assert.equal(updates['req1/status'], 'Approved');
    assert.equal(updates['req1/reviewedBy'], 'Admin User');
    assert.equal(updates['req2/status'], undefined);
    assert.equal(updates['req3/status'], undefined);
});

test('session normalization preserves only authenticatable active users', () => {
    const session = normalizeSessionData({
        uid: 'abc',
        email: 'user@test.com',
        role: 'User',
        status: 'active',
        accessibleModules: ['Mock Drills']
    });

    assert.equal(normalizeUserStatus(session.status), ACCOUNT_STATUS.ACTIVE);
    assert.equal(canAuthenticateStatus(session.status), true);
    assert.ok(session.accessibleModules.includes('Record Emergency'));
});

test('session normalization preserves forced password change flags', () => {
    const session = normalizeSessionData({
        uid: 'temp-user',
        email: 'temp@test.com',
        role: 'User',
        status: 'Active',
        mustChangePassword: true,
        temporaryPasswordIssued: true,
        temporaryPasswordIssuedAt: '2026-04-25T00:00:00.000Z'
    });

    assert.equal(session.mustChangePassword, true);
    assert.equal(session.temporaryPasswordIssued, true);
    assert.equal(session.temporaryPasswordIssuedAt, '2026-04-25T00:00:00.000Z');
});
