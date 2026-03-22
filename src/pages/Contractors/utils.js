import { getMandatoryDocs } from '../../utils/constants';
import { safeArr } from '../../utils/helpers';

export const generateVendorCode = () => {
    return 'VEN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
export const normalizeVendorCode = (value) => String(value || '').trim().toUpperCase();

export const createEmptyVendorForm = () => ({
    id: '',
    allocatedSites: [],
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    serviceType: 'General / Housekeeping',
    goodsType: 'PPE',
    notes: '',
    status: 'Pending Review',
    documents: getMandatoryDocs('General / Housekeeping'),
    workers: []
});

export const parseContractors = (dataObj) => {
    if (!dataObj) return [];

    return Object.entries(dataObj).map(([key, value]) => ({
        ...value,
        firebaseKey: key,
        allocatedSites: safeArr(value.allocatedSites).length > 0
            ? safeArr(value.allocatedSites)
            : (value.siteId && value.siteId !== 'GLOBAL' ? [value.siteId] : []),
        documents: safeArr(value.documents),
        workers: safeArr(value.workers).map((worker) => ({
            ...worker,
            additionalDocs: safeArr(worker.additionalDocs)
        })),
        trainings: safeArr(value.trainings),
        incidents: safeArr(value.incidents),
        nonCompliances: safeArr(value.nonCompliances)
    }));
};

export const getComplianceStatus = (docsData) => {
    const docs = safeArr(docsData);
    if (docs.length === 0) {
        return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct: 0 };
    }

    const requiredDocs = docs.filter((doc) => doc.isMandatory || doc.status === 'Requested');
    const uploadedDocs = requiredDocs.filter((doc) => doc.status === 'Uploaded' || doc.status === 'Verified' || doc.file);
    const pct = requiredDocs.length === 0 ? 100 : Math.round((uploadedDocs.length / requiredDocs.length) * 100);

    if (requiredDocs.length === 0) {
        return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
    }
    if (uploadedDocs.length === 0) {
        return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30', pct };
    }
    if (uploadedDocs.length < requiredDocs.length) {
        return { label: 'Partially Complied', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };
    }

    const hasExpired = uploadedDocs.some((doc) => doc.expiryDate && new Date(doc.expiryDate) < new Date());
    if (hasExpired) {
        return { label: 'Partially Complied (Expired)', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30', pct };
    }

    return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30', pct };
};
