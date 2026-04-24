import test from 'node:test';
import assert from 'node:assert/strict';

import {
    expandAccessibleModules,
    hasAccessibleModule,
    normalizeRole,
    normalizeSessionPermissions,
    toCanonicalModuleIds
} from '../src/utils/permissions.js';

test('legacy module labels normalize to canonical ids', () => {
    const normalized = toCanonicalModuleIds([
        'Risk Assessments',
        'CAPA',
        'Mock Drills',
        'Contractor Management',
        'Management of Change',
        'PTW'
    ]);

    assert.deepEqual(normalized, [
        'CAPA Manager',
        'Contractors',
        'MOC',
        'OHS Tools',
        'Record Emergency',
        'Risk Assessment'
    ]);
});

test('expanded access keeps backward-compatible aliases', () => {
    const expanded = expandAccessibleModules(['CAPA Manager', 'OHS Tools']);

    assert.ok(expanded.includes('CAPA'));
    assert.ok(expanded.includes('CAPA Manager'));
    assert.ok(expanded.includes('PTW'));
    assert.ok(expanded.includes('LOTO'));
    assert.ok(expanded.includes('Health Dashboard'));
});

test('module access checks succeed for legacy and canonical permission names', () => {
    assert.equal(hasAccessibleModule(['CAPA'], 'CAPA Manager'), true);
    assert.equal(hasAccessibleModule(['PTW'], 'OHS Tools'), true);
    assert.equal(hasAccessibleModule(['Mock Drills'], 'Record Emergency'), true);
    assert.equal(hasAccessibleModule(['Training'], 'Incidents'), false);
});

test('backward-compatible aliases normalize into the shared canonical permission model', () => {
    const normalized = toCanonicalModuleIds([
        'Dashboard',
        'Consultation',
        'Meetings',
        'Documents',
        'Occupational Health'
    ]);

    assert.deepEqual(normalized, [
        'Analytics',
        'OHS Tools',
        'Participation',
        'Standards'
    ]);
});

test('legacy roles normalize into the supported three-role RBAC model', () => {
    assert.equal(normalizeRole('Admin'), 'Global Owner');
    assert.equal(normalizeRole('Global Manager'), 'Global Owner');
    assert.equal(normalizeRole('Site Manager'), 'User');
    assert.equal(normalizeRole('HSE Rep'), 'User');
});

test('global owner sessions auto-grant all modules and global scope', () => {
    const session = normalizeSessionPermissions({
        role: 'Global Owner',
        assignedSite: 'HQ-01',
        accessibleModules: ['Incidents']
    });

    assert.equal(session.assignedSite, 'GLOBAL');
    assert.ok(session.accessibleModules.includes('Users'));
    assert.ok(session.accessibleModules.includes('Sites'));
    assert.ok(session.accessibleModules.includes('Incidents'));
});

test('site owner sessions auto-grant site-wide modules but not sites management', () => {
    const session = normalizeSessionPermissions({
        role: 'Site Owner',
        assignedSite: 'HQ-01',
        accessibleModules: []
    });

    assert.equal(session.assignedSite, 'HQ-01');
    assert.ok(session.accessibleModules.includes('Users'));
    assert.ok(session.accessibleModules.includes('Incidents'));
    assert.equal(session.accessibleModules.includes('Sites'), false);
});
