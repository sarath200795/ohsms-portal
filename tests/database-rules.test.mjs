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

const siteScopedCollections = [
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
    assert.doesNotMatch(orgRootRead, /Global Manager|Admin|Site Manager|HSE Rep|Lead Auditor/, 'legacy roles must not remain in organization root access');
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

test('self-service org-name registry is not enumerable from the client', () => {
    assert.equal(rules.orgRegistry.$orgName['.read'], false, 'orgRegistry must not expose workspace names');
    assert.equal(rules.orgRegistry.$orgName['.write'], false, 'orgRegistry should no longer be client-writable');
});

test('new-user join requests require an admin-issued join code', () => {
    assert.ok(rules.joinRegistry.$joinCode, 'joinRegistry rules must exist');
    assert.match(rules.joinRegistry.$joinCode['.read'], /!root\.child\('userDirectory\/' \+ auth\.uid\)\.exists\(\)/, 'join code reads should only be available before an account is mapped to an org');
    assert.match(orgRules.users.$uid['.write'], /joinCode/, 'pending user creation must include a join code');
    assert.match(orgRules.users.$uid['.write'], /joinRegistry/, 'pending user creation must validate the join code registry mapping');
});

test('legacy organization owners can recover user-management join code access', () => {
    const protectedRules = [
        rules.joinRegistry.$joinCode['.write'],
        rules.userDirectory.$uid['.write'],
        orgRules.details['.read'],
        orgRules.details['.write'],
        orgRules.sites['.read'],
        orgRules.users['.read'],
        orgRules.users.$uid['.write'],
        orgRules.permissionRequests['.read'],
        orgRules.permissionRequests.$requestId['.write']
    ];

    for (const rule of protectedRules) {
        assert.match(rule, /ownerEmail/, 'legacy owner fallback must be present');
        assert.match(rule, /auth\.token\.email != null/, 'legacy owner fallback must require an authenticated email token');
    }
});

test('only global owners can rotate join-code metadata', () => {
    const joinWrite = rules.joinRegistry.$joinCode['.write'];
    const joinMetadataRules = [
        orgRules.details.joinCode['.write'],
        orgRules.details.joinCodeUpdatedAt['.write'],
        orgRules.details.joinCodeUpdatedBy['.write']
    ];

    assert.match(joinWrite, /Global Owner/, 'join registry rotation must require the Global Owner role');
    assert.match(joinWrite, /status'\)\.val\(\) === 'Active'/, 'join registry rotation must require active org membership');
    assert.doesNotMatch(joinWrite, /Site Owner/, 'site owners must not rotate workspace join codes');

    for (const rule of joinMetadataRules) {
        assert.match(rule, /status'\)\.val\(\) === 'Active'/, 'join metadata updates must require active org membership');
        assert.match(rule, /Global Owner/, 'join metadata updates must require the Global Owner role');
        assert.doesNotMatch(rule, /Site Owner/, 'site owners must not rotate join metadata');
    }

    assert.match(orgRules.details['.write'], /\/role/, 'full organization details writes must remain role-restricted');
});

test('site owners can manage only same-site non-global users', () => {
    const userWriteRule = orgRules.users.$uid['.write'];

    assert.match(userWriteRule, /Site Owner/, 'site owners must be able to manage users for their site');
    assert.match(userWriteRule, /assignedSite/, 'site owner user writes must stay site scoped');
    assert.match(userWriteRule, /role'\)\.val\(\) !== 'Global Owner'/, 'site owners must not grant or edit global owner access');
});

test('user record validation allows only the supported three roles', () => {
    const validateRule = orgRules.users.$uid['.validate'];

    assert.match(validateRule, /Global Owner/, 'Global Owner must remain a valid stored role');
    assert.match(validateRule, /Site Owner/, 'Site Owner must remain a valid stored role');
    assert.match(validateRule, /'User'/, 'User must remain a valid stored role');
    assert.doesNotMatch(validateRule, /Global Manager|Site Manager|HSE Rep|Lead Auditor|Admin/, 'legacy roles must not remain valid in stored user records');
});

test('site-owned collections require site-scoped queries for non-global users', () => {
    for (const collection of siteScopedCollections) {
        const readRule = orgRules[collection]?.['.read'];
        assert.match(readRule, /query\.orderByChild === 'siteId'/, `${collection} must require a siteId query for non-global reads`);
        assert.match(readRule, /query\.equalTo/, `${collection} must bind non-global reads to a site value`);
        assert.deepEqual(orgRules[collection]?.['.indexOn'], ['siteId'], `${collection} must index siteId for scoped reads`);
    }
});

test('public QR flows read only explicit single-record QR resources', () => {
    assert.match(orgRules.ptwRecords.$id['.read'], /publicQrEnabled/, 'PTW QR reads must be limited to public QR records');
    assert.match(orgRules.lotoProcedures.$id['.read'], /publicQrEnabled/, 'LOTO QR reads must be limited to public QR records');
    assert.match(orgRules.emergencyEquipment.$id['.read'], /publicQrEnabled/, 'Emergency equipment QR reads must be limited to public QR records');
    assert.doesNotMatch(orgRules.lotoProcedures.$id['.read'], /status'\)\.val\(\) === 'Approved'/, 'LOTO QR reads must not expose every approved procedure publicly');
    assert.doesNotMatch(orgRules.emergencyEquipment.$id['.read'], /assetId/, 'Emergency equipment QR reads must not expose every tagged asset publicly');
});

test('linked vendor portal users can read their own contractor record directly', () => {
    const contractorChildRead = orgRules.contractors.$id['.read'];

    assert.ok(contractorChildRead, 'contractor child read rule must exist');
    assert.match(contractorChildRead, /portalLinkedContractorId/, 'contractor child read must support vendor-linked access');
    assert.match(contractorChildRead, /Global Owner/, 'contractor child read must still support global owner access');
});

test('linked vendor portal users can update only their own contractor documents and workers', () => {
    const contractorChildWrite = orgRules.contractors.$id['.write'];

    assert.ok(contractorChildWrite, 'contractor child write rule must exist');
    assert.match(contractorChildWrite, /portalLinkedContractorId/, 'contractor child write must recognize the linked vendor user');
    assert.match(contractorChildWrite, /newData\.child\('companyName'\)\.val\(\) === data\.child\('companyName'\)\.val\(\)/, 'vendor writes must keep company identity immutable');
    assert.match(contractorChildWrite, /newData\.child\('portalUid'\)\.val\(\) === data\.child\('portalUid'\)\.val\(\)/, 'vendor writes must not alter portal linkage');
    assert.match(contractorChildWrite, /portalLastVendorUpdateAt/, 'vendor writes should allow audit metadata');
});

test('application code no longer opens organization-root realtime database reads', () => {
    const offenders = listSourceFiles('src')
        .map((filePath) => [filePath, readFileSync(filePath, 'utf8')])
        .filter(([, source]) => /ref\(rtdb,\s*`organizations\/\$\{[^}]+}\s*`\)/.test(source))
        .map(([filePath]) => filePath);

    assert.deepEqual(offenders, [], `organization-root ref reads/listeners found in: ${offenders.join(', ')}`);
});

test('video automation scripts do not embed Firebase API keys', () => {
    const offenders = listSourceFiles('scripts')
        .map((filePath) => [filePath, readFileSync(filePath, 'utf8')])
        .filter(([, source]) => /AIzaSy[A-Za-z0-9_-]+/.test(source))
        .map(([filePath]) => filePath);

    assert.deepEqual(offenders, [], `hardcoded Firebase API keys found in: ${offenders.join(', ')}`);
});
