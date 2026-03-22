import { ensureArray } from '../../utils/helpers';

export const normalizePermit = (permit) => {
    if (!permit) return null;
    return {
        ...permit,
        description: String(permit.description || permit.workDescription || ''),
        location: String(permit.location || ''),
        equipment: String(permit.equipment || ''),
        issuingDept: String(permit.issuingDept || ''),
        issuedToName: String(permit.issuedToName || ''),
        issuedToPh: String(permit.issuedToPh || ''),
        validFromDate: String(permit.validFromDate || ''),
        validToDate: String(permit.validToDate || ''),
        validFromTime: String(permit.validFromTime || ''),
        validToTime: String(permit.validToTime || ''),
        statusUpdatedOn: String(permit.statusUpdatedOn || ''),
        engApproverEmail: String(permit.engApproverEmail || ''),
        prodApproverEmail: String(permit.prodApproverEmail || ''),
        engStatus: String(permit.engStatus || 'Pending'),
        prodStatus: String(permit.prodStatus || 'Pending'),
        creatorEmail: String(permit.creatorEmail || ''),
        requestedBy: String(permit.requestedBy || ''),
        workerType: String(permit.workerType || 'Internal'),
        contractorId: String(permit.contractorId || ''),
        contractorName: String(permit.contractorName || ''),
        wms: ensureArray(permit.wms),
        entrantNames: ensureArray(permit.entrantNames),
        wahEquipment: ensureArray(permit.wahEquipment),
        ppe: ensureArray(permit.ppe),
        checklist: ensureArray(permit.checklist),
        nonCompliances: ensureArray(permit.nonCompliances)
    };
};

export const getStatusColor = (status) => {
    switch (status) {
        case 'Pending Approval':
            return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
        case 'Work in Progress':
            return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        case 'Pending Closure':
            return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
        case 'Closed':
            return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        case 'Cancelled':
            return 'bg-red-500/20 text-red-400 border-red-500/30';
        default:
            return 'bg-slate-800 text-slate-400 border-slate-700';
    }
};
