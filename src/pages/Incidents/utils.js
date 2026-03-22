export const SMART_CATEGORIES = [
    'Fire & Explosion', 'COSHH / Chemical Exposure', 'Asbestos',
    'Work at Height', 'Slips, Trips & Falls', 'Manual Handling',
    'Machinery & Equipment', 'Workplace Transport / Vehicles', 'Electrical Safety'
];

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
});

export const safeArrayParse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) {
        return data
            .map((item, idx) => {
                if (item && typeof item === 'object') return { ...item, firebaseKey: String(idx) };
                return null;
            })
            .filter(Boolean);
    }
    if (typeof data !== 'object') return [];
    return Object.keys(data).reduce((acc, key) => {
        if (typeof data[key] === 'object' && data[key] !== null) acc.push({ ...data[key], firebaseKey: key });
        return acc;
    }, []);
};

export const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
};

export const getIncidentTypeCode = (type) => {
    if (type === 'Near Miss') return 'NM';
    if (type === 'Property Damage') return 'PD';
    if (type === 'First Aid injury') return 'FIR';
    if (type === 'Lost Time injury') return 'LTIR';
    if (type === 'Reportable Injury') return 'RIR';
    return 'XX';
};
