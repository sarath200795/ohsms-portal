// Bulk-import helpers for one-off / recurring inspection assignments.
//
// Workflow:
//   1. parseAssignmentsWorkbook(file)        → raw rows
//   2. planAssignmentsImport(rows, ctx)      → { perTemplate: Map<templateKey, [assignment]>,
//                                                 errors: [{row, message}] }
//   3. caller applies perTemplate to each affected template
//
// CSV / XLSX columns (header casing is forgiving):
//   Template Title    — must match an existing template (case-insensitive)
//   Site Code         — must exist; GLOBAL templates allow any site, others must match
//   Center Code       — optional; if provided must exist under the site
//   Frequency         — One-off | Daily | Weekly | Monthly | Quarterly | Annual
//   Start Date        — YYYY-MM-DD; for One-off this IS the inspection date
//   End Date          — YYYY-MM-DD; optional; only meaningful for recurring
//   Notes             — optional

import * as XLSX from 'xlsx';
import { findCentersForSite } from './centers';

export const ASSIGNMENT_FREQUENCIES = ['One-off', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'];

const normaliseHeader = (key) => String(key).trim().toLowerCase().replace(/\s+/g, '');

// ── Parsing ──────────────────────────────────────────────────────────────────

export const parseAssignmentsWorkbook = async (file) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Uploaded file has no sheets.');
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    return rows.map((row, index) => {
        const lower = {};
        Object.keys(row).forEach((k) => { lower[normaliseHeader(k)] = row[k]; });

        const isoLike = (raw) => {
            if (!raw && raw !== 0) return '';
            // Excel returns numeric dates as serial numbers; XLSX has a helper.
            if (typeof raw === 'number') {
                const d = XLSX.SSF.parse_date_code(raw);
                if (!d) return '';
                const pad = (n) => String(n).padStart(2, '0');
                return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
            }
            const text = String(raw).trim();
            // Already ISO-ish
            if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
            // Try parsing common formats
            const d = new Date(text);
            if (Number.isNaN(d.getTime())) return text; // surface raw for error msg
            return d.toISOString().slice(0, 10);
        };

        return {
            row: index + 2, // header is row 1
            templateTitle: String(
                lower.templatetitle ?? lower.template ?? lower.checklist ?? ''
            ).trim(),
            siteCode: String(
                lower.sitecode ?? lower.site ?? ''
            ).trim().toUpperCase(),
            centerCode: String(
                lower.centercode ?? lower.center ?? lower.point ?? ''
            ).trim().toUpperCase(),
            frequency: String(
                lower.frequency ?? ''
            ).trim(),
            startDate: isoLike(lower.startdate ?? lower.scheduleddate ?? lower.date ?? ''),
            endDate: isoLike(lower.enddate ?? ''),
            notes: String(lower.notes ?? '').trim()
        };
    }).filter((row) => (
        // Skip completely blank rows
        row.templateTitle || row.siteCode || row.centerCode || row.startDate
    ));
};

// ── Planning / validation ────────────────────────────────────────────────────

const findTemplate = (templates, title) => {
    const needle = String(title || '').trim().toLowerCase();
    const matches = templates.filter((t) => String(t.title || '').trim().toLowerCase() === needle);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return { _ambiguous: true, count: matches.length };
    return null;
};

const normaliseFrequency = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return 'One-off';
    const lower = value.toLowerCase();
    return ASSIGNMENT_FREQUENCIES.find((f) => f.toLowerCase() === lower) || null;
};

export const planAssignmentsImport = (rows, { templates, sites }) => {
    const errors = [];
    const perTemplate = new Map(); // templateKey -> array of new assignment objects
    const counters = { added: 0 };

    const siteByCode = new Map(
        (sites || []).map((s) => [String(s.code || '').toUpperCase(), s])
    );

    rows.forEach((row) => {
        if (!row.templateTitle) {
            errors.push({ row: row.row, message: 'Missing Template Title' });
            return;
        }
        const template = findTemplate(templates, row.templateTitle);
        if (!template) {
            errors.push({ row: row.row, message: `Template "${row.templateTitle}" not found` });
            return;
        }
        if (template._ambiguous) {
            errors.push({ row: row.row, message: `Template title "${row.templateTitle}" matches ${template.count} templates — rename them or use unique titles` });
            return;
        }

        if (!row.siteCode) {
            errors.push({ row: row.row, message: 'Missing Site Code' });
            return;
        }
        const site = siteByCode.get(row.siteCode);
        if (!site) {
            errors.push({ row: row.row, message: `Site "${row.siteCode}" not found` });
            return;
        }

        // GLOBAL templates allow any site; site-bound templates must match
        const isGlobalTemplate = template.siteId === 'GLOBAL';
        if (!isGlobalTemplate && template.siteId !== row.siteCode) {
            errors.push({ row: row.row, message: `Template "${template.title}" is bound to site ${template.siteId} but row targets ${row.siteCode}` });
            return;
        }

        // Optional centerCode — if present must exist under the site
        if (row.centerCode) {
            const centers = findCentersForSite(sites, row.siteCode);
            const matchCenter = centers.find((c) => String(c.code || '').toUpperCase() === row.centerCode);
            if (!matchCenter) {
                errors.push({ row: row.row, message: `Center "${row.centerCode}" not found under site ${row.siteCode}` });
                return;
            }
        }

        const frequency = normaliseFrequency(row.frequency);
        if (!frequency) {
            errors.push({ row: row.row, message: `Frequency "${row.frequency}" is not one of: ${ASSIGNMENT_FREQUENCIES.join(', ')}` });
            return;
        }

        if (!row.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.startDate)) {
            errors.push({ row: row.row, message: `Start Date "${row.startDate}" is not a valid YYYY-MM-DD date` });
            return;
        }
        if (row.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.endDate)) {
            errors.push({ row: row.row, message: `End Date "${row.endDate}" is not a valid YYYY-MM-DD date` });
            return;
        }
        if (row.endDate && row.endDate < row.startDate) {
            errors.push({ row: row.row, message: 'End Date is before Start Date' });
            return;
        }

        const assignment = {
            id: `asn-${Date.now()}-${Math.floor(Math.random() * 100000)}-${row.row}`,
            siteId: row.siteCode,
            centerCode: row.centerCode || '',
            scheduledDate: row.startDate,
            frequency: frequency === 'One-off' ? '' : frequency,
            endDate: row.endDate || '',
            status: 'Pending',
            notes: row.notes,
            createdAt: new Date().toISOString(),
            createdBy: 'csv-import',
            history: []
        };

        if (!perTemplate.has(template.firebaseKey)) perTemplate.set(template.firebaseKey, []);
        perTemplate.get(template.firebaseKey).push(assignment);
        counters.added += 1;
    });

    return { perTemplate, errors, counters };
};

// ── Template download ────────────────────────────────────────────────────────

export const downloadAssignmentsTemplate = () => {
    const sheetData = [
        ['Template Title', 'Site Code', 'Center Code', 'Frequency', 'Start Date', 'End Date', 'Notes'],
        ['Daily Forklift Pre-Use Check', 'NYC-01', 'NYC-01-A1', 'Daily', '2026-06-01', '2026-12-31', 'Morning shift assignment'],
        ['Monthly Fire Extinguisher Audit', 'NYC-01', '', 'Monthly', '2026-06-15', '', 'Whole-site walk'],
        ['Annual Insurance Inspection', 'LON-02', 'LON-02-WH', 'One-off', '2026-09-30', '', '']
    ];
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    sheet['!cols'] = [
        { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 36 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Assignments');
    XLSX.writeFile(wb, 'inspection-assignments-template.xlsx');
};
