// Centers (sometimes called "points" or "areas") sit under a Site.  A Site
// can have many Centers — e.g. site NYC-01 might have centers Assembly
// Line 1, Warehouse East, Loading Dock, Maintenance Bay.
//
// Storage shape: site records carry a `centers` array.  Each center is
//   { code: string, name: string }   (code is unique within the site)
//
// We deliberately keep centers EMBEDDED on the site record rather than in
// a separate RTDB sub-path so that any caller already holding a site
// object also has its centers — no extra reads, no rule edits, no race
// between site delete and orphan-center cleanup.

import * as XLSX from 'xlsx';

/** Trim + normalise a single center record. Returns null if invalid. */
export const normalizeCenter = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const code = String(raw.code || '').trim();
    const name = String(raw.name || '').trim();
    if (!code && !name) return null;
    return { code, name };
};

/** Normalise the centers array on a site record (handles object form too). */
export const normalizeSiteCenters = (site) => {
    if (!site) return [];
    const raw = site.centers;
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map(normalizeCenter).filter(Boolean);
    }
    if (typeof raw === 'object') {
        return Object.values(raw).map(normalizeCenter).filter(Boolean);
    }
    return [];
};

/** Find the centers list for a given site code from the sites array. */
export const findCentersForSite = (sites, siteCode) => {
    if (!Array.isArray(sites) || !siteCode || siteCode === 'All' || siteCode === 'GLOBAL') return [];
    const site = sites.find((s) => s.code === siteCode);
    return normalizeSiteCenters(site);
};

/**
 * Case-insensitive duplicate check on a center code within a single site.
 */
export const isDuplicateCenterCode = (existing, candidateCode) => {
    const needle = String(candidateCode || '').trim().toLowerCase();
    if (!needle) return false;
    return existing.some((c) => String(c?.code || '').trim().toLowerCase() === needle);
};

// ── Bulk import: XLSX ────────────────────────────────────────────────────────

/**
 * Parse an uploaded XLSX/CSV file into an array of
 *   { siteCode, centerCode, centerName }
 * rows.  Accepts any of:
 *   • "Site Code" / "SiteCode" / "site code" / "site"
 *   • "Center Code" / "CenterCode" / "center code" / "code"
 *   • "Center Name" / "CenterName" / "center name" / "name"
 */
export const parseCentersWorkbook = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Uploaded file has no sheets.');
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const out = [];
    rows.forEach((row, index) => {
        const lower = {};
        Object.keys(row).forEach((k) => {
            lower[String(k).trim().toLowerCase().replace(/\s+/g, '')] = row[k];
        });
        const siteCode = String(
            lower.sitecode ?? lower.site ?? ''
        ).trim().toUpperCase();
        const centerCode = String(
            lower.centercode ?? lower.code ?? ''
        ).trim().toUpperCase();
        const centerName = String(
            lower.centername ?? lower.name ?? ''
        ).trim();

        if (!siteCode && !centerCode && !centerName) return; // blank row
        out.push({
            row: index + 2, // header row is row 1 in the spreadsheet
            siteCode,
            centerCode,
            centerName
        });
    });
    return out;
};

/**
 * Group parsed rows by site code and report rows that can't be applied
 * (no matching site, missing center code, missing center name, duplicate
 * code within the site).
 *
 * Returns { plan: Map<siteCode, [{code, name}]>, errors: [{row, message}] }
 */
export const planCentersImport = (rows, sites) => {
    const plan = new Map();
    const errors = [];
    const seenWithinSite = new Map(); // siteCode -> Set<centerCode>

    const siteByCode = new Map(
        (sites || []).map((s) => [String(s.code || '').toUpperCase(), s])
    );

    rows.forEach((row) => {
        if (!row.siteCode) {
            errors.push({ row: row.row, message: 'Missing Site Code' });
            return;
        }
        if (!row.centerCode) {
            errors.push({ row: row.row, message: 'Missing Center Code' });
            return;
        }
        if (!row.centerName) {
            errors.push({ row: row.row, message: 'Missing Center Name' });
            return;
        }

        const site = siteByCode.get(row.siteCode);
        if (!site) {
            errors.push({
                row: row.row,
                message: `Site "${row.siteCode}" not found — register the site first`
            });
            return;
        }

        // Duplicate within the import itself
        if (!seenWithinSite.has(row.siteCode)) {
            seenWithinSite.set(row.siteCode, new Set());
        }
        const seen = seenWithinSite.get(row.siteCode);
        if (seen.has(row.centerCode)) {
            errors.push({
                row: row.row,
                message: `Duplicate Center Code "${row.centerCode}" within the upload`
            });
            return;
        }

        // Duplicate against centers already on the site
        const existing = normalizeSiteCenters(site);
        if (isDuplicateCenterCode(existing, row.centerCode)) {
            errors.push({
                row: row.row,
                message: `Center "${row.centerCode}" already exists on site ${row.siteCode}`
            });
            return;
        }

        seen.add(row.centerCode);
        if (!plan.has(row.siteCode)) plan.set(row.siteCode, []);
        plan.get(row.siteCode).push({ code: row.centerCode, name: row.centerName });
    });

    return { plan, errors };
};

/**
 * Build and download a bulk-import template XLSX with a header row and
 * one example row, so users have a worked sample to fill in.
 */
export const downloadCentersTemplate = () => {
    const sheetData = [
        ['Site Code', 'Center Code', 'Center Name'],
        ['NYC-01', 'NYC-01-A1', 'Assembly Line 1'],
        ['NYC-01', 'NYC-01-WH', 'Warehouse East']
    ];
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    sheet['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Centers');
    XLSX.writeFile(wb, 'centers-import-template.xlsx');
};
