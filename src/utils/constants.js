// src/utils/constants.js

// --- PERMIT TO WORK CONSTANTS ---
export const PERMIT_TYPES = [
    { id: 'HOT', label: 'HOT WORK PERMIT', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    { id: 'WAH', label: 'HEIGHT WORK PERMIT', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    { id: 'CSE', label: 'CONFINED SPACE PERMIT', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    { id: 'ELE', label: 'ELECTRICAL / HAZARDOUS ENERGY', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    { id: 'EXC', label: 'EXCAVATION PERMIT', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
    { id: 'GEN', label: 'GENERAL / COLD WORK', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
];

export const getTypeConfig = (tId) => PERMIT_TYPES.find(t => t.id === tId) || PERMIT_TYPES[5];

export const CHECKLIST_ITEMS = {
    'HOT': ["Fire extinguisher/fire hose available", "Combustible materials removed (>10m)", "Gas test done (LFL < 10%)", "Fire watcher assigned", "Welding screens used", "Adequate ventilation for fumes", "Sparks contained"],
    'WAH': ["Scaffold tag is green", "Full body harness used", "Lifeline / Fall arrester used", "Safety nets provided", "Safe access / egress provided", "Anchorage Point verified", "Usage of Roof lifeline"],
    'CSE': ["Oxygen level checked (>19.5%)", "Toxic gas checked", "Adequate ventilation provided", "Attendant present outside", "Rescue Team on alert", "Communication established", "Respirator / SCBA provided"],
    'ELE': ["LOTO applied (Lockout/Tagout)", "Insulated tools to be used", "Rubber mat provided", "Proper PPE (Arc flash) used", "Zero energy verified"],
    'EXC': ["Underground cables checked", "Underground pipes checked", "Shoring/Sloping done", "Barricades & warning signs provided", "Safe access / egress"],
    'GEN': ["Job briefed to all personnel", "Warning signs displayed", "Equipment / Tools checked", "Safe access / egress provided", "Housekeeping maintained"]
};

export const COMMON_PPE = ["Hard Hat", "Safety Glasses", "Safety Shoes", "Gloves", "Hi-Vis Vest", "Ear Protection", "Face Shield", "Fall Harness", "Respirator", "FR Clothing"];

export const WAH_EQUIP_OPTIONS = ["Fixed Scaffold", "Mobile Scaffold", "A-Frame Ladder", "Extension Ladder", "MEWP / Boom Lift", "Scissor Lift", "Rope Access System"];

// --- CONTRACTOR CONSTANTS ---
export const SERVICE_TYPES = [
    'General / Housekeeping', 'Construction / Civil', 'Electrical', 'Mechanical',
    'Chemical / Hazardous', 'Supply of Goods', 'Transportation',
    'Manpower Supply (Technical)', 'Manpower Supply (Non-Technical)',
    'Fire Fighting Equipment'
];

// Service types that should see the Fire Equipment tab in the vendor portal
// (so they can mark extinguishers as taken for refill / HPT).
export const FIRE_EQUIPMENT_SERVICE_TYPES = ['Fire Fighting Equipment'];

export const GOODS_TYPES = ['PPE', 'Chemicals', 'Machinery', '4M', 'Other'];

export const getMandatoryDocs = (serviceType, goodsType = '') => {
    const baseDocs = [
        { type: 'GST Registration', isMandatory: true, status: 'Pending' },
        { type: 'Trade License / Incorporation', isMandatory: true, status: 'Pending' },
        { type: 'Company PAN / TAN', isMandatory: true, status: 'Pending' }
    ];

    const labourIntensive = ['General / Housekeeping', 'Construction / Civil', 'Electrical', 'Mechanical', 'Chemical / Hazardous', 'Manpower Supply (Technical)', 'Manpower Supply (Non-Technical)'];
    
    if (labourIntensive.includes(serviceType)) {
        baseDocs.push({ type: 'PF Registration', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'ESI / Workmen Compensation Policy', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'Labour License (Form VI)', isMandatory: true, status: 'Pending' });
    }

    if (serviceType === 'Construction / Civil') {
        baseDocs.push({ type: 'BOCW Registration', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Electrical') {
        baseDocs.push({ type: 'Valid Electrical Contractor License (CEA)', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Chemical / Hazardous') {
        baseDocs.push({ type: 'Hazardous Waste Handling Permit', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Transportation') {
        baseDocs.push({ type: 'Fleet Vehicle Insurance (Master)', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'Transport Carrier License', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Supply of Goods' && goodsType === 'Chemicals') {
        baseDocs.push({ type: 'PESO License / SDS Declarations', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Fire Fighting Equipment') {
        // Indian regulatory: refill/HPT vendors operate under IS 2190, IS 15683
        // and state fire-services licensing. Refill activity also touches
        // explosive/pressure stores so PESO + BIS certification are required.
        baseDocs.push({ type: 'State Fire Services Refilling License', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'BIS / IS 2190 Service Certification', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'PESO License (Refilling / HPT Station)', isMandatory: true, status: 'Pending' });
        baseDocs.push({ type: 'Workmen Compensation Policy', isMandatory: true, status: 'Pending' });
    }

    return baseDocs.map(d => ({ ...d, id: Math.random().toString(36).substr(2, 9), name: d.type }));
};

// --- USER & RBAC CONSTANTS ---
export const ROLES = [
    "Global Owner", "Site Owner", "User"
];

export const ALL_MODULES = [
    "Analytics", "Incidents", "Risk Assessment", "Participation", "Internal Audit",
    "Standards", "CAPA Manager", "Training", "Improvement", "OHS Tools",
    "Record Emergency", "Contractors", "MOC", "Inspections"
];
