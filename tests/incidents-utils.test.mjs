import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildEditableIncidentData,
    buildPrintableIncidentData,
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
