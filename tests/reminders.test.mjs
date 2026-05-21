import test from 'node:test';
import assert from 'node:assert';
import {
    buildReminders,
    summarizeReminders,
    classifySeverity,
    parseDate,
    formatDueLabel,
    SEVERITY
} from '../src/utils/reminders.js';

const TODAY = '2026-05-21';
const day = (offset) => {
    const date = new Date(TODAY);
    date.setDate(date.getDate() + offset);
    return date.toISOString().split('T')[0];
};

test('classifySeverity buckets by due date and window', () => {
    const today = new Date(TODAY);
    assert.equal(classifySeverity(parseDate(day(-3)), today), SEVERITY.OVERDUE);
    assert.equal(classifySeverity(parseDate(day(3)), today), SEVERITY.DUE_SOON);
    assert.equal(classifySeverity(parseDate(day(20)), today), SEVERITY.UPCOMING);
    assert.equal(classifySeverity(parseDate(day(60)), today), null);
    assert.equal(classifySeverity(parseDate('N/A'), today), null);
});

test('buildReminders includes open/dated items and excludes done, undated, far-out', () => {
    const data = {
        incidents: {
            INC1: {
                siteId: 'S1',
                capa: [
                    { desc: 'Replace guard', owner: 'Sam', due: day(-5), status: 'Open' },
                    { desc: 'Already fixed', owner: 'Sam', due: day(-9), status: 'Closed' },
                    { desc: 'Toolbox talk', owner: 'Lee', dueDate: day(4), status: 'Open' }
                ]
            }
        },
        auditFindings: { A1: { siteId: 'S2', capa: [{ action: 'Update SOP', due: day(40), status: 'Open' }] } },
        inspectionRecords: { R1: { siteId: 'S1', capa: [{ desc: 'Fix signage', due: 'N/A', status: 'Open' }] } },
        emergencyEquipment: {
            EQ1: { name: 'Extinguisher A', nextInspection: day(-2), status: 'Active' },
            EQ2: { name: 'Hydrant B', nextInspection: day(2), status: 'Active' },
            EQ3: { name: 'Eyewash C', status: 'Out of Service' },
            EQ4: { name: 'Alarm D', nextInspection: day(90), status: 'Active' }
        },
        trainings: {
            T1: { topic: 'Working at Height', expiryDate: day(-1) },
            T3: { topic: 'Fire Safety', expiryDate: day(200) }
        }
    };

    const items = buildReminders(data, { today: TODAY });
    const ids = items.map((item) => item.id);

    assert.equal(items.length, 6, ids.join(', '));
    assert.ok(!items.some((item) => item.title.includes('Already fixed')), 'done action excluded');
    assert.ok(!ids.some((id) => id.startsWith('capa:auditFindings')), 'far-out action excluded');
    assert.ok(!ids.includes('capa:inspectionRecords:R1:0'), 'undated action excluded');
    assert.ok(!ids.includes('equipment:EQ4'), 'far equipment excluded');
    assert.ok(!ids.includes('training:T3'), 'far training excluded');
    assert.equal(items[0].severity, SEVERITY.OVERDUE, 'overdue sorted first');
});

test('equipment status flag is overdue even without a date', () => {
    const items = buildReminders(
        { emergencyEquipment: { EQ: { name: 'Eyewash', status: 'Missing' } } },
        { today: TODAY }
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].severity, SEVERITY.OVERDUE);
    assert.equal(items[0].dueDate, null);
});

test('training expiry falls back to training date + 6 months', () => {
    const items = buildReminders({ trainings: { T: { topic: 'First Aid', date: day(-170) } } }, { today: TODAY });
    assert.equal(items.length, 1, 'date+6mo expiry surfaces');
    assert.equal(items[0].category, 'Training Renewal');
});

test('summarizeReminders counts by severity and category', () => {
    const items = buildReminders(
        {
            incidents: { I: { capa: [{ desc: 'x', due: day(-1), status: 'Open' }] } },
            emergencyEquipment: { E: { name: 'Ext', nextInspection: day(3) } }
        },
        { today: TODAY }
    );
    const summary = summarizeReminders(items);
    assert.equal(summary.total, 2);
    assert.equal(summary.overdue, 1);
    assert.equal(summary.dueSoon, 1);
    assert.equal(summary.byCategory['CAPA Action'], 1);
    assert.equal(summary.byCategory['Equipment Inspection'], 1);
});

test('formatDueLabel renders relative labels', () => {
    assert.equal(formatDueLabel({ daysUntil: -3 }), '3d overdue');
    assert.equal(formatDueLabel({ daysUntil: 0 }), 'Due today');
    assert.equal(formatDueLabel({ daysUntil: 1 }), 'Due tomorrow');
    assert.equal(formatDueLabel({ daysUntil: 5 }), 'in 5d');
    assert.equal(formatDueLabel({ daysUntil: null }), 'No date');
});
