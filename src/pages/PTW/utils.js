import { ensureArray } from '../../utils/helpers';

export const normalizePermit = (permit) => {
    if (!permit) return null;
    return {
        ...permit,
        typeId: String(permit.typeId || permit.permitType || 'GEN'),
        description: String(permit.description || permit.workDescription || ''),
        location: String(permit.location || ''),
        siteId: String(permit.siteId || permit.facility || ''),
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
        lotoRef: String(permit.lotoRef || ''),
        lotoProcedureKey: String(permit.lotoProcedureKey || ''),
        lotoProcedureDescription: String(permit.lotoProcedureDescription || ''),
        lotoProcedureSite: String(permit.lotoProcedureSite || ''),
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

export const getPermitDeadline = (permit) => {
    if (!permit?.validToDate) return null;
    const deadline = new Date(`${permit.validToDate}T${permit.validToTime || '23:59'}`);
    return Number.isNaN(deadline.getTime()) ? null : deadline;
};

export const isPermitOverdue = (permit, now = new Date()) => {
    if (!permit || permit.status === 'Closed' || permit.status === 'Cancelled') return false;
    const deadline = getPermitDeadline(permit);
    if (!deadline) return false;
    return deadline.getTime() < now.getTime();
};
