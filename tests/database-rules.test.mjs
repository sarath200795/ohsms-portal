import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

const listSourceFiles = (dir) => readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    return /\.(jsx?|mjs)$/.test(entry) ? [fullPath] : [];
});

test('organization root reads are restricted to privileged administrators only', () => {
    const orgRootRead = orgRules['.read'];

    assert.ok(orgRootRead, 'organization root must define an explicit read rule');
    assert.notEqual(orgRootRead, activeOnlyWrite, 'organization root must not be readable by every active org user');
    assert.match(orgRootRead, /Global Owner/, 'organization root read must be role scoped');
    assert.match(orgRootRead, /Global Manager/, 'organization root read must include privileged global management');
    assert.match(orgRootRead, /Admin/, 'organization root read must include admin role scoping');
});

test('sensitive organization collections are not writable by any active user', () => {
    for (const collection of sensitiveCollections) {
        const writeRule = orgRules[collection]?.$id?.['.write'];
        assert.ok(writeRule, `${collection} must define an explicit write rule`);
        assert.notEqual(writeRule, activeOnlyWrite, `${collection} must not use the broad active-user write rule`);
        assert.match(writeRule, /role|assignedSite|newData\.child/, `${collection} write rule should be role or site scoped`);
    }
});

test('sensitive organization collections have explicit scoped collection reads', () => {
    for (const collection of sensitiveCollections) {
        const readRule = orgRules[collection]?.['.read'];
        assert.ok(readRule, `${collection} must define an explicit collection read rule`);
        assert.match(readRule, /userDirectory/, `${collection} read rule must require same organization`);
        assert.match(readRule, /status'\)\.val\(\) === 'Active'|status'\)\.val\(\) === "Active"/, `${collection} read rule must require an active user`);
    }
});

test('public QR flows read only explicit single-record QR resources', () => {
    assert.match(orgRules.ptwRecords.$id['.read'], /publicQrEnabled/, 'PTW QR reads must be limited to public QR records');
    assert.match(orgRules.lotoProcedures.$id['.read'], /publicQrEnabled/, 'LOTO QR reads must be limited to public QR records');
    assert.match(orgRules.emergencyEquipment.$id['.read'], /publicQrEnabled/, 'Emergency equipment QR reads must be limited to public QR records');
    assert.doesNotMatch(orgRules.lotoProcedures.$id['.read'], /status'\)\.val\(\) === 'Approved'/, 'LOTO QR reads must not expose every approved procedure publicly');
    assert.doesNotMatch(orgRules.emergencyEquipment.$id['.read'], /assetId/, 'Emergency equipment QR reads must not expose every tagged asset publicly');
});

test('application code no longer opens organization-root realtime database reads', () => {
    const offenders = listSourceFiles('src')
        .map((filePath) => [filePath, readFileSync(filePath, 'utf8')])
        .filter(([, source]) => /ref\(rtdb,\s*`organizations\/\$\{[^}]+}\s*`\)/.test(source))
        .map(([filePath]) => filePath);

    assert.deepEqual(offenders, [], `organization-root ref reads/listeners found in: ${offenders.join(', ')}`);
});
