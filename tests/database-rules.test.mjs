import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rules = JSON.parse(readFileSync('database.rules.json', 'utf8')).rules;
const orgRules = rules.organizations.$orgId;

const sensitiveCollections = [
    'documents',
    'riskAssessments',
    'incidents',
    'consultations',
    'auditPlans',
    'auditFindings',
    'improvements',
    'contractors',
    'ptwRecords',
    'lotoProcedures',
    'lotoLogs',
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
];

const activeOnlyWrite =
    "auth != null && root.child('userDirectory/' + auth.uid + '/orgId').val() === $orgId && root.child('organizations/' + $orgId + '/users/' + auth.uid + '/status').val() === 'Active'";

test('sensitive organization collections are not writable by any active user', () => {
    for (const collection of sensitiveCollections) {
        const writeRule = orgRules[collection]?.$id?.['.write'];
        assert.ok(writeRule, `${collection} must define an explicit write rule`);
        assert.notEqual(writeRule, activeOnlyWrite, `${collection} must not use the broad active-user write rule`);
        assert.match(writeRule, /role|assignedSite|newData\.child/, `${collection} write rule should be role or site scoped`);
    }
});

test('public QR flows read only explicit single-record QR resources', () => {
    assert.match(orgRules.ptwRecords.$id['.read'], /publicQrEnabled/, 'PTW QR reads must be limited to public QR records');
    assert.match(orgRules.lotoProcedures.$id['.read'], /publicQrEnabled|Approved/, 'LOTO QR reads must be limited to approved/public procedures');
    assert.match(orgRules.emergencyEquipment.$id['.read'], /publicQrEnabled|assetId/, 'Emergency equipment QR reads must be single-record public tag reads');
});

