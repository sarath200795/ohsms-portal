import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildIncidentCapaWithVerificationActions,
    buildVerificationActionDescription,
    buildEditableIncidentData,
    buildPrintableIncidentData,
    incidentSeverityNeedsVerification,
    normalizeIncidentFiveWhys
} from '../src/utils/incidents.js';

test('legacy five-why arrays are normalized into named analysis paths', () => {
    const normalized = normalizeIncidentFiveWhys(['why one', 'why two'], () => 99);

    assert.deepEqual(normalized, [{
        id: 99,
        name: 'Legacy Analysis',
        whys: ['why one', 'why two']
    }]);
});

test('editable incident payload merges defaults and enables manual overrides', () => {
    const initialDataState = {
        title: '',
        horizontalDeployment: false,
        investigation: { fiveWhys: [] },
        manualOverrides: { type: false, severity: false, smartType: false }
    };
    const incident = {
        title: 'Forklift near miss',
        horizontalDeployment: true,
        investigation: { fiveWhys: ['legacy why'] }
    };

    const editable = buildEditableIncidentData(initialDataState, incident, () => 42);

    assert.equal(editable.title, 'Forklift near miss');
    assert.equal(editable.horizontalDeployment, true);
    assert.deepEqual(editable.investigation.fiveWhys, [{
        id: 42,
        name: 'Legacy Analysis',
        whys: ['legacy why']
    }]);
    assert.deepEqual(editable.manualOverrides, { type: true, severity: true, smartType: true });
});

test('printable incident payload preserves structured five-why paths', () => {
    const incident = {
        investigation: {
            fiveWhys: [{ id: 7, name: 'Analysis Path 7', whys: ['a', 'b'] }]
        }
    };

    const printable = buildPrintableIncidentData(incident, () => 100);

    assert.deepEqual(printable.investigation.fiveWhys, [{ id: 7, name: 'Analysis Path 7', whys: ['a', 'b'] }]);
});

test('high severity incident CAPA closure creates one verification follow-up action', () => {
    const capa = buildIncidentCapaWithVerificationActions({
        actions: [{
            act: 'Replace damaged machine guard',
            actionId: 'capa-1',
            siteId: 'SITE-01',
            own: 'Maintenance Lead',
            due: '2026-05-10',
            status: 'Closed'
        }],
        severity: 'Level C',
        defaultSiteId: 'SITE-01',
        createId: () => 500
    });

    assert.equal(capa.length, 2);
    assert.equal(capa[1].actionType, 'Verification');
    assert.equal(capa[1].verificationForActionId, 'capa-1');
    assert.equal(capa[1].status, 'Open');
    assert.equal(capa[1].act, buildVerificationActionDescription('Replace damaged machine guard'));
});

test('verification follow-up is not duplicated on later saves', () => {
    const capa = buildIncidentCapaWithVerificationActions({
        actions: [
            {
                act: 'Repair emergency stop circuit',
                actionId: 'capa-2',
                siteId: 'SITE-02',
                status: 'Closed'
            },
            {
                act: buildVerificationActionDescription('Repair emergency stop circuit'),
                actionId: 'capa-2::verification',
                actionType: 'Verification',
                verificationForActionId: 'capa-2',
                siteId: 'SITE-02',
                status: 'Open'
            }
        ],
        severity: 'Level D',
        defaultSiteId: 'SITE-02',
        createId: () => 900
    });

    assert.equal(capa.length, 2);
    assert.equal(capa.filter((item) => item.actionType === 'Verification').length, 1);
});

test('low severity incidents do not require CAPA verification follow-up', () => {
    assert.equal(incidentSeverityNeedsVerification('Level B'), false);
    assert.equal(incidentSeverityNeedsVerification('Level C'), true);
});
