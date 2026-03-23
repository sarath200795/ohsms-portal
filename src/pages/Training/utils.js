export const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
};

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
});

export const ROLE_REQUIREMENTS = {
    'Office Staff': ['Fire Safety', 'First Aid'],
    Driver: ['Fire Safety', 'First Aid', 'Forklift Safety', 'Chemical Handling'],
    Manager: ['Fire Safety', 'First Aid', 'LOTO', 'Work at Height', 'Chemical Handling']
};

export const BASE_TOPICS = ['LOTO', 'Fire Safety', 'First Aid', 'Work at Height', 'Chemical Handling', 'Forklift Safety'];

export const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toISOString().split('T')[0];
};

export const addMonths = (dateStr, months) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
};
