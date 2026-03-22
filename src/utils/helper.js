// src/utils/helpers.js

/**
 * Ensures a value is always returned as a valid, flat array without nulls.
 */
export const ensureArray = (val) => {
    if (val === null || val === undefined) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [val].filter(Boolean);
};

// Alias for quicker typing in some of your older files
export const safeArr = ensureArray;

/**
 * Safely parses Firebase object lists into arrays and injects the firebaseKey.
 */
export const safeArrayParse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) {
        return data.map((item, idx) => {
            if (item && typeof item === 'object') {
                return { ...item, firebaseKey: String(idx) };
            }
            return null;
        }).filter(Boolean);
    }
    if (typeof data !== 'object') return [];
    return Object.keys(data).reduce((acc, key) => {
        if (typeof data[key] === 'object' && data[key] !== null) {
            acc.push({ ...data[key], firebaseKey: key });
        }
        return acc;
    }, []);
};

export const safeArrWithKeys = (dataObj) => {
    if (!dataObj) return [];
    if (Array.isArray(dataObj)) return dataObj.filter(Boolean).map((v, i) => ({ ...v, firebaseKey: String(i) }));
    return Object.entries(dataObj).map(([k, v]) => ({ ...v, firebaseKey: k }));
};

/**
 * Converts a File object into a Base64 string for database storage.
 */
export const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

/**
 * Calculates the compliance percentage and UI styling for Vendor Documents.
 */
export const getComplianceStatus = (docsData) => {
    const docs = safeArr(docsData);
    if (docs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct: 0 };
    
    const requiredDocs = docs.filter(d => d.isMandatory || d.status === 'Requested');
    const uploadedDocs = requiredDocs.filter(d => d.status === 'Uploaded' || d.status === 'Verified' || d.file);
    const pct = requiredDocs.length === 0 ? 100 : Math.round((uploadedDocs.length / requiredDocs.length) * 100);

    if (requiredDocs.length === 0) return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
    if (uploadedDocs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct };
    if (uploadedDocs.length < requiredDocs.length) return { label: 'Partially Complied', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };
    
    const hasExpired = uploadedDocs.some(d => d.expiryDate && new Date(d.expiryDate) < new Date());
    if (hasExpired) return { label: 'Partially Complied (Expired)', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };

    return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
};