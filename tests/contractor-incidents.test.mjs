import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanyIncidentEntries, getCompanyIncidentKey } from '../src/utils/contractorIncidents.js';

test('company incident keys are deterministic for local incidents without ids', () => {
    const incident = { description: 'Minor cut on hand' };

    const firstKey = getCompanyIncidentKey(incident, 2, 'vendor-a');
    const secondKey = getCompanyIncidentKey(incident, 2, 'vendor-a');

    assert.equal(firstKey, 'vendor-a-undated-2');
    assert.equal(secondKey, firstKey);
});

test('company incident entries merge contractor incidents and filter global incidents by contractor id', () => {
    const entries = buildCompanyIncidentEntries({
        vendorIncidents: [
            { id: 'LOC-1', date: '2026-04-02', description: 'Local incident' }
        ],
        globalIncidents: [
            { firebaseKey: 'glob-1', contractorId: 'vendor-1', affectedPersonType: 'Contractor', date: '2026-04-10', description: 'Synced incident', type: 'First Aid' },
            { firebaseKey: 'glob-2', contractorId: 'vendor-2', affectedPersonType: 'Contractor', date: '2026-04-12', description: 'Different contractor', type: 'Near Miss' }
        ],
        contractorId: 'vendor-1',
        fallbackPrefix: 'vendor-1'
    });

    assert.equal(entries.length, 2);
    assert.equal(entries[0].key, 'glob-1');
    assert.equal(entries[0].desc, 'Synced incident');
    assert.equal(entries[1].key, 'LOC-1');
});
