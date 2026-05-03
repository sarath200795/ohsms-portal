import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { push, ref, remove, update } from 'firebase/database';
import * as XLSX from 'xlsx';
import { rtdb } from '../../config/firebase';
import { getPortalAwareHomePath } from '../FieldApp/portalAuth';
import {
    buildEditableIncidentData,
    buildIncidentCapaWithVerificationActions,
    buildPrintableIncidentData
} from '../../utils/incidents';
import { readOrgChild, readOrgChildren } from '../../utils/orgData';
import {
    canDeleteForRole,
    canEditCreateForRole,
    getAllowedSiteCodes,
    hasAccessibleModule,
    isGlobalOwnerRole,
    isGlobalScopeUserRecord
} from '../../utils/permissions';
import { canAuthenticateStatus, readStoredSession } from '../../utils/session';
import IncidentBuilder from './components/IncidentBuilder';
import IncidentHazardEditorModal from './components/IncidentHazardEditorModal';
import IncidentHazardMatchesModal from './components/IncidentHazardMatchesModal';
import IncidentPrintOverlay from './components/IncidentPrintOverlay';
import IncidentRegistry from './components/IncidentRegistry';

const SMART_CATEGORIES = [
    'Fire & Explosion', 'COSHH / Chemical Exposure', 'Asbestos',
    'Work at Height', 'Slips, Trips & Falls', 'Manual Handling',
    'Machinery & Equipment', 'Workplace Transport / Vehicles', 'Electrical Safety'
];

const createInitialDataState = () => ({
    id: '',
    title: '',
    siteId: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    type: 'Near Miss',
    severity: 'Level A',
    smartType: 'Fire & Explosion',
    equipmentInvolved: '',
    description: '',
    immediateAction: '',
    affectedPersonType: 'None',
    contractorId: '',
    affectedPersonId: '',
    affectedPersonName: '',
    imageEvidence: null,
    consultationSummary: '',
    investigationTeam: [],
    investigation: {
        fiveWhys: [{ id: 1, name: 'Analysis Path 1', whys: ['', '', '', '', ''] }],
        fishbone: { man: [], machine: [], material: [], method: [], environment: [] },
        faultTree: { id: 1, label: 'Top Event', type: 'AND', children: [] },
        rootCause: ''
    },
    capa: [],
    linkedHazards: [],
    riskUpdated: false,
    horizontalDeployment: false,
    manualOverrides: { type: false, severity: false, smartType: false }
});

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
});

const safeArrayParse = (data) => {
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

const safeArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') return Object.values(val).filter(Boolean);
    return [];
};

const getTypeCode = (type) => {
    if (type === 'Near Miss') return 'NM';
    if (type === 'Property Damage') return 'PD';
    if (type === 'First Aid injury') return 'FIR';
    if (type === 'Lost Time injury') return 'LTIR';
    if (type === 'Reportable Injury') return 'RIR';
    return 'XX';
};

const buildIncidentPermissions = (session) => {
    const role = session?.role || '';
    const canDelete = canDeleteForRole(role);
    const canEditCreate = canEditCreateForRole(role);

    return {
        viewOnly: !canEditCreate,
        canEditOwnedActions: true,
        canDelete,
        canEditCreate
    };
};

const resolveInitialSiteFilter = ({ session, search, isGlobalUser }) => {
    const params = new URLSearchParams(search);
    const urlSite = params.get('site');

    let storedSite = sessionStorage.getItem('isoCurrentSite');
    if (storedSite === 'GLOBAL') storedSite = 'All';

    let nextSite = urlSite || storedSite || 'All';
    if (!isGlobalUser && nextSite === 'All') {
        nextSite = (session?.assignedSite && session.assignedSite !== 'GLOBAL')
            ? session.assignedSite
            : (session?.accessibleSites?.[0] || '');
    }

    return nextSite;
};

const buildSuggestedIncidentId = ({ siteId, type, incidentsList }) => {
    const nextSiteId = siteId || 'GEN';
    const typeCode = getTypeCode(type);
    const matchingRecords = incidentsList.filter((incident) => incident.siteId === nextSiteId && getTypeCode(incident.type) === typeCode);
    const serialNumber = String(matchingRecords.length + 1).padStart(3, '0');
    return `${nextSiteId}-${typeCode}-${serialNumber}`;
};

const UserSelect = ({ users, value, onChange, disabled, placeholder }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white text-xs outline-none focus:border-blue-500">
        <option value="">{placeholder || 'Select User...'}</option>
        {users.map((u) => <option key={u.id} value={u.name || u.email}>{u.name || u.email} ({u.role || 'User'})</option>)}
    </select>
);

const RibBox = ({ title, cat, data, onAdd, onUpdate, onRemove, disabled }) => (
    <div className="rib-box">
        <div className="flex justify-between mb-2 border-b border-slate-600 pb-1">
            <span className="text-[9px] font-bold uppercase text-slate-400 print:text-black">{title}</span>
            {!disabled && <button type="button" onClick={() => onAdd(cat)} className="text-[10px] text-emerald-400 hover:text-emerald-300 no-print font-bold bg-emerald-400/10 px-2 rounded">+</button>}
        </div>
        {((data && data[cat]) || []).map((v, i) => (
            <div key={i} className="flex group mb-1 items-center">
                <input value={v || ''} onChange={(e) => onUpdate(cat, i, e.target.value)} disabled={disabled} className="w-full bg-transparent text-[10px] border-b border-slate-700 mb-1 outline-none text-white print:text-black focus:border-blue-500" />
                {!disabled && <button type="button" onClick={() => onRemove(cat, i)} className="text-red-400 bg-red-400/10 hover:bg-red-500 hover:text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] ml-1 no-print transition-colors" title="Delete">x</button>}
            </div>
        ))}
    </div>
);

const Fishbone = ({ data = {}, onChange, disabled }) => {
    const updateFishboneValue = (cat, i, val) => {
        const arr = [...(data[cat] || [])];
        arr[i] = val;
        onChange({ ...data, [cat]: arr });
    };
    const add = (cat) => onChange({ ...data, [cat]: [...(data[cat] || []), ''] });
    const removeItem = (cat, i) => {
        const arr = [...(data[cat] || [])];
        arr.splice(i, 1);
        onChange({ ...data, [cat]: arr });
    };

    return (
        <div className="fishbone-container mt-8">
            <div className="spine"></div>
            <div className="head">INCIDENT</div>
            <div className="ribs-top">
                <RibBox title="Man" cat="man" data={data} onAdd={add} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <RibBox title="Machine" cat="machine" data={data} onAdd={add} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <RibBox title="Material" cat="material" data={data} onAdd={add} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
            </div>
            <div className="ribs-bottom">
                <RibBox title="Method" cat="method" data={data} onAdd={add} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <RibBox title="Environment" cat="environment" data={data} onAdd={add} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <div style={{ width: '18%' }}></div>
            </div>
        </div>
    );
};

const FaultTreeNode = ({ node, onUpdate, onDelete, onAddSibling, disabled }) => {
    if (!node) return null;

    const handleAddChild = () => {
        onUpdate({
            ...node,
            children: [...(node.children || []), { id: Date.now(), label: 'New Cause', type: 'EVENT', children: [] }]
        });
    };

    const toggleType = () => {
        const types = ['EVENT', 'AND', 'OR', 'ROOT'];
        onUpdate({ ...node, type: types[(types.indexOf(node.type) + 1) % types.length] });
    };

    const updateChild = (i, d) => {
        const nextChildren = [...(node.children || [])];
        nextChildren[i] = d;
        onUpdate({ ...node, children: nextChildren });
    };

    const deleteChild = (i) => {
        onUpdate({ ...node, children: (node.children || []).filter((_, x) => x !== i) });
    };

    const addSiblingToChild = () => {
        onUpdate({
            ...node,
            children: [...(node.children || []), { id: Date.now(), label: 'Parallel Cause', type: 'EVENT', children: [] }]
        });
    };

    return (
        <li>
            <div className="tree-node group">
                {!disabled && (
                    <div className="absolute -top-4 right-0 flex gap-1 z-30 transition-opacity no-print opacity-0 group-hover:opacity-100">
                        <button type="button" onClick={handleAddChild} className="bg-blue-600 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center shadow hover:scale-110" title="Add Child Node">↓</button>
                        {onAddSibling && <button type="button" onClick={onAddSibling} className="bg-purple-600 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center shadow hover:scale-110" title="Add Parallel Node">→</button>}
                        {onDelete && <button type="button" onClick={onDelete} className="bg-red-600 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center shadow hover:scale-110" title="Delete Node">x</button>}
                    </div>
                )}
                <input value={node.label || ''} onChange={(e) => onUpdate({ ...node, label: e.target.value })} disabled={disabled} className="bg-transparent text-center text-xs font-bold w-full outline-none border-b border-transparent focus:border-blue-500 pb-1" placeholder="Event..." />
                {!disabled && <div onClick={toggleType} className="mt-1 cursor-pointer select-none no-print"><span className={`text-[9px] px-1.5 rounded font-mono border ${node.type === 'AND' ? 'border-purple-500 text-purple-400' : node.type === 'OR' ? 'border-orange-500 text-orange-400' : node.type === 'ROOT' ? 'border-emerald-500 text-emerald-400' : 'border-slate-600 text-slate-500'}`}>{node.type || 'EVENT'}</span></div>}
                <div className="hidden print:block text-[8px] font-bold text-center mt-1">[{node.type || 'EVENT'}]</div>
            </div>
            {node.children && node.children.length > 0 && <ul>{node.children.map((child, i) => (<FaultTreeNode key={child.id || i} node={child} onUpdate={(d) => updateChild(i, d)} onDelete={() => deleteChild(i)} onAddSibling={addSiblingToChild} disabled={disabled} />))}</ul>}
        </li>
    );
};

const renderPrintFaultTree = (node) => {
    if (!node) return null;
    return (
        <li key={node.id} style={{ marginBottom: '4px' }}>
            <strong>{node.label}</strong> <span style={{ fontSize: '10px', color: '#555' }}>[{node.type}]</span>
            {node.children && node.children.length > 0 && (
                <ul style={{ listStyleType: 'circle', paddingLeft: '20px', marginTop: '4px' }}>
                    {node.children.map((child) => renderPrintFaultTree(child))}
                </ul>
            )}
        </li>
    );
};

const IncidentRepository = ({ incidents, onEdit, onPrint, onDelete, permissions, siteFilter, setSiteFilter, uniqueSites, isGlobalUser }) => {
    const [filterType, setFilterType] = useState('All');
    const [filterLevel, setFilterLevel] = useState('All');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const handleSiteFilterChange = (e) => {
        const newSite = e.target.value;
        setSiteFilter(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite === 'All' ? 'GLOBAL' : newSite);
    };

    const filteredData = useMemo(() => {
        return incidents.filter((item) => {
            const matchType = filterType === 'All' || item.type === filterType;
            const matchLevel = filterLevel === 'All' || item.severity === filterLevel;
            let matchDate = true;
            if (dateFrom && dateTo) {
                matchDate = item.date >= dateFrom && item.date <= dateTo;
            }
            return matchType && matchLevel && matchDate;
        });
    }, [incidents, filterType, filterLevel, dateFrom, dateTo]);

    const stats = useMemo(() => {
        let total = 0;
        let closed = 0;
        let open = 0;

        incidents.forEach((inc) => {
            safeArr(inc.capa).forEach((act) => {
                total += 1;
                if (act.status === 'Closed') closed += 1;
                else open += 1;
            });
        });

        return { total, closed, open };
    }, [incidents]);

    const exportToExcel = () => {
        const dataToExport = filteredData.map(({ id, date, time, siteId, title, type, severity, affectedPersonName, affectedPersonType }) => ({
            ID: id,
            Date: date,
            Time: time,
            Site: siteId,
            Title: title,
            Type: type,
            Severity: severity,
            Affected_Person: affectedPersonName,
            Person_Type: affectedPersonType
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Incidents');
        XLSX.writeFile(wb, 'Incident_Repository.xlsx');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
                <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-xl border-l-4 border-l-blue-500 flex justify-between items-center shadow-lg">
                    <div><p className="text-xs text-slate-400 uppercase font-bold">Total CAPA Raised</p><h3 className="text-3xl font-bold text-white">{stats.total}</h3></div>
                    <i className="fas fa-list-check text-2xl text-blue-500/50"></i>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-xl border-l-4 border-l-emerald-500 flex justify-between items-center shadow-lg">
                    <div><p className="text-xs text-slate-400 uppercase font-bold">Actions Closed</p><h3 className="text-3xl font-bold text-emerald-400">{stats.closed}</h3></div>
                    <i className="fas fa-check-circle text-2xl text-emerald-500/50"></i>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-xl border-l-4 border-l-orange-500 flex justify-between items-center shadow-lg">
                    <div><p className="text-xs text-slate-400 uppercase font-bold">Actions Open</p><h3 className="text-3xl font-bold text-orange-400">{stats.open}</h3></div>
                    <i className="fas fa-clock text-2xl text-orange-500/50"></i>
                </div>
            </div>

            <div className="p-6 rounded-xl bg-gradient-to-r from-purple-900/40 to-slate-900 border border-purple-500/30 mb-6 shadow-xl">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <span className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-lg shadow-lg shadow-purple-600/20"><i className="fas fa-database"></i></span>
                            Incident Repository
                        </h2>
                        <p className="text-slate-400 text-sm mt-1 ml-14">Central database of all reported incidents.</p>
                    </div>
                    <button type="button" onClick={exportToExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-transform active:scale-95"><i className="fas fa-file-excel"></i> Export</button>
                </div>
                <div className="flex gap-4 items-end flex-wrap">
                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">From</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500" /></div>
                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">To</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500" /></div>

                    <div>
                        <label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Site Filter</label>
                        <select value={siteFilter} onChange={handleSiteFilterChange} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500">
                            {(isGlobalUser || uniqueSites.length > 1) && <option value="All">All Sites</option>}
                            {uniqueSites.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                    </div>

                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Type</label><select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500"><option value="All">All Types</option><option>Near Miss</option><option>Property Damage</option><option>First Aid injury</option><option>Lost Time injury</option><option>Reportable Injury</option></select></div>
                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Severity</label><select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500"><option value="All">All Levels</option><option value="Level A">Level A</option><option value="Level B">Level B</option><option value="Level C">Level C</option><option value="Level D">Level D</option></select></div>
                </div>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700 shadow-xl">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-xs uppercase font-bold text-slate-500 border-b border-slate-800">
                        <tr><th className="p-4">Incident ID</th><th className="p-4">Date</th><th className="p-4">Type</th><th className="p-4">Details & Person</th><th className="p-4 text-center">HIRA Linked</th><th className="p-4 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {filteredData.map((inc) => {
                            const total = safeArr(inc.capa).length;
                            const closed = safeArr(inc.capa).filter((c) => c.status === 'Closed').length;
                            const progress = total > 0 ? (closed / total) * 100 : 0;
                            const canEditRow = permissions.canEditCreate && (isGlobalUser || uniqueSites.some((s) => s.code === inc.siteId));

                            return (
                                <tr key={inc.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4 font-mono font-bold text-white">{inc.id}</td>
                                    <td className="p-4">{inc.date}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-200">{inc.type}</div>
                                        <div className={`text-[10px] uppercase font-bold ${inc.severity === 'Level A' ? 'text-emerald-400' : inc.severity === 'Level B' ? 'text-blue-400' : inc.severity === 'Level C' ? 'text-orange-400' : 'text-red-500'}`}>{inc.severity}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-white mb-1 truncate max-w-[200px]">{inc.title || 'No Title'}</div>
                                        {inc.affectedPersonName ? (
                                            <div className="text-[10px] font-bold uppercase tracking-widest flex gap-2">
                                                <span>{inc.affectedPersonName}</span>
                                                {inc.affectedPersonType === 'Contractor' ? <span className="text-indigo-400">(EXT)</span> : <span className="text-emerald-400">(INT)</span>}
                                            </div>
                                        ) : <span className="text-slate-500 italic text-xs">No Person Injured</span>}
                                        {total > 0 && (
                                            <div className="mt-2">
                                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }}></div>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        {inc.linkedHazards && inc.linkedHazards.length > 0 ? <span className="text-emerald-400 font-bold bg-emerald-900/20 px-2 py-1 rounded border border-emerald-500/20"><i className="fas fa-link mr-1"></i> {inc.linkedHazards.length}</span> : <span className="text-slate-600">-</span>}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button type="button" onClick={() => onPrint(inc)} className="text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition" title="Print Report"><i className="fas fa-print"></i></button>

                                        {canEditRow ? (
                                            <button type="button" onClick={() => onEdit(inc)} className="text-purple-400 hover:text-white bg-purple-500/10 hover:bg-purple-600 px-3 py-1.5 rounded-lg transition font-bold text-xs uppercase tracking-widest">Edit</button>
                                        ) : (
                                            <button type="button" onClick={() => onEdit(inc)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition font-bold text-xs uppercase tracking-widest">View</button>
                                        )}

                                        {permissions.canDelete && (
                                            <button type="button" onClick={() => onDelete(inc)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-600 px-3 py-1.5 rounded-lg transition"><i className="fas fa-trash-alt"></i></button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredData.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500 italic">No incidents match your filters.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default function Incidents() {
    const navigate = useNavigate();
    const location = useLocation();

    const [fbReady, setFbReady] = useState(false);
    const [view, setView] = useState('repo');
    const [step, setStep] = useState(1);
    const [session] = useState(() => readStoredSession());
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [incidentsList, setIncidentsList] = useState([]);
    const [riskAssessments, setRiskAssessments] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [contractors, setContractors] = useState([]);

    const [printData, setPrintData] = useState(null);
    const [saving, setSaving] = useState(false);

    const [siteFilterOverride, setSiteFilterOverride] = useState('');

    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [matchedHazards, setMatchedHazards] = useState([]);
    const [editingHazardData, setEditingHazardData] = useState(null);

    const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
    const [externalName, setExternalName] = useState('');

    const [newCapaAct, setNewCapaAct] = useState('');
    const [newCapaOwn, setNewCapaOwn] = useState('');
    const [newCapaDue, setNewCapaDue] = useState('');
    const [newCapaSite, setNewCapaSite] = useState('');

    const initialDataState = useMemo(() => createInitialDataState(), []);
    const [data, setData] = useState(() => createInitialDataState());
    const sessionIsValid = Boolean(session && canAuthenticateStatus(session.status));
    const isGlobalUser = isGlobalOwnerRole(session?.role);
    const permissions = buildIncidentPermissions(session);
    const hasModuleAccess = sessionIsValid && (isGlobalUser || hasAccessibleModule(session.accessibleModules, 'Incidents'));
    const requestedSite = new URLSearchParams(location.search).get('site') || sessionStorage.getItem('isoCurrentSite') || session?.assignedSite || 'All';
    const defaultSiteFilter = resolveInitialSiteFilter({ session, search: location.search, isGlobalUser });
    const siteFilter = siteFilterOverride || defaultSiteFilter;

    useEffect(() => {
        if (!sessionIsValid) {
            navigate('/');
            return;
        }

        if (!hasModuleAccess) {
            alert('Security Alert: You do not have permission to access the Incidents module.');
            navigate(getPortalAwareHomePath({ fallbackPath: '/dashboard', site: requestedSite }));
            return;
        }

        const params = new URLSearchParams(location.search);
        const autoOpenId = params.get('id');
        sessionStorage.setItem('isoCurrentSite', defaultSiteFilter === 'All' ? 'GLOBAL' : defaultSiteFilter);

        const loadDatabases = async () => {
            try {
                const orgData = await readOrgChildren(rtdb, session.orgId, ['sites', 'incidents', 'contractors', 'riskAssessments', 'users']);

                let fetchedUsers = [];
                let loadedIncidents = [];

                if (orgData.sites) {
                    setSites(Object.keys(orgData.sites).map((key) => ({
                        code: orgData.sites[key].code || key,
                        name: orgData.sites[key].name || key
                    })));
                }

                if (orgData.incidents) {
                    const parsed = safeArrayParse(orgData.incidents);
                    loadedIncidents = parsed.map((inc) => ({
                        ...inc,
                        investigation: inc.investigation || { fiveWhys: [], fishbone: {}, faultTree: null, rootCause: '' }
                    }));
                    setIncidentsList(loadedIncidents);
                }

                if (orgData.contractors) {
                    setContractors(Object.entries(orgData.contractors).map(([k, v]) => ({
                        ...v,
                        firebaseKey: k,
                        workers: safeArr(v.workers)
                    })));
                }

                if (orgData.riskAssessments) {
                    setRiskAssessments(Object.entries(orgData.riskAssessments).map(([k, v]) => ({ firebaseKey: k, ...v })));
                }

                if (orgData.users) {
                    fetchedUsers = Object.entries(orgData.users)
                        .map(([k, v]) => ({ id: k, ...v }))
                        .filter((u) => canAuthenticateStatus(u.status));
                }

                if (!fetchedUsers.find((u) => u.email === session.email || u.name === session.user)) {
                    fetchedUsers.push({
                        id: session.uid || 'current-user',
                        name: session.name || session.email?.split('@')[0] || 'Me',
                        email: session.email,
                        role: session.role || 'Global Owner',
                        assignedSite: 'GLOBAL'
                    });
                }

                setUsers(fetchedUsers);
                setFbReady(true);

                if (autoOpenId && loadedIncidents.length > 0) {
                    const target = loadedIncidents.find((i) => i.firebaseKey === autoOpenId);
                    if (target) {
                        setData(buildEditableIncidentData(initialDataState, target));
                        setView('form');
                        setStep(1);
                    }
                }
            } catch (err) {
                console.error('Error loading databases:', err);
            }
        };

        loadDatabases();
    }, [defaultSiteFilter, hasModuleAccess, initialDataState, location.search, navigate, requestedSite, session, sessionIsValid]);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        return getAllowedSiteCodes(session);
    }, [session]);

    const allowedSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((s) => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const visibleIncidents = useMemo(() => {
        return incidentsList.filter((i) => isGlobalUser || allowedSiteCodes.has(i.siteId));
    }, [incidentsList, isGlobalUser, allowedSiteCodes]);

    const siteUsers = useMemo(() => {
        return users.filter((u) => {
            const isGlobalUsr = isGlobalScopeUserRecord(u);
            if (data.horizontalDeployment) return true;
            const targetSite = newCapaSite || data.siteId;
            const siteMatch = isGlobalUsr || !targetSite || u.assignedSite === targetSite || (u.accessibleSites && u.accessibleSites.includes(targetSite));
            return siteMatch;
        });
    }, [users, data.siteId, newCapaSite, data.horizontalDeployment]);

    const activePersonnelList = useMemo(() => {
        if (data.affectedPersonType === 'Internal') {
            return users.filter((u) => !data.siteId || u.assignedSite === data.siteId || safeArr(u.accessibleSites).includes(data.siteId));
        }
        if (data.affectedPersonType === 'Contractor') {
            if (!data.contractorId) return [];
            const vendor = contractors.find((c) => c.firebaseKey === data.contractorId);
            return safeArr(vendor?.workers);
        }
        return [];
    }, [users, contractors, data.affectedPersonType, data.siteId, data.contractorId]);

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!data.siteId) return true;
        return allowedSiteCodes.has(data.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, data.siteId]);

    const suggestedIncidentId = useMemo(() => {
        if (!session || data.firebaseKey || !canEditForm) return '';

        return buildSuggestedIncidentId({
            siteId: data.siteId,
            type: data.type,
            incidentsList
        });
    }, [canEditForm, data.firebaseKey, data.siteId, data.type, incidentsList, session]);

    const currentIncidentId = data.id || suggestedIncidentId || '';

    const handleDescriptionBlur = () => {
        if (!data.description || data.description.trim() === '') return;
        const lower = data.description.toLowerCase();
        const updates = {};

        if (!data.manualOverrides?.smartType) {
            let bestMatch = null;
            let maxScore = 0;
            const smartDb = {
                'Fire & Explosion': { keywords: ['fire', 'burn', 'explosion', 'spark', 'smoke', 'flame'] },
                'COSHH / Chemical Exposure': { keywords: ['chemical', 'acid', 'spill', 'fume', 'inhale', 'toxic', 'burn'] },
                'Asbestos': { keywords: ['asbestos', 'dust', 'fibers', 'insulation'] },
                'Work at Height': { keywords: ['fall', 'ladder', 'scaffold', 'roof', 'dropped', 'edge'] },
                'Slips, Trips & Falls': { keywords: ['slip', 'trip', 'fall', 'wet', 'cable', 'uneven'] },
                'Manual Handling': { keywords: ['lift', 'carry', 'back', 'strain', 'heavy'] },
                'Machinery & Equipment': { keywords: ['machine', 'crush', 'entangle', 'guard', 'cut', 'blade'] },
                'Workplace Transport / Vehicles': { keywords: ['vehicle', 'forklift', 'truck', 'crash', 'hit', 'run over'] },
                'Electrical Safety': { keywords: ['electric', 'shock', 'wire', 'cable', 'power', 'electrocute'] }
            };

            Object.keys(smartDb).forEach((category) => {
                let score = 0;
                const keywords = smartDb[category].keywords || [];
                keywords.forEach((word) => {
                    const isPhrase = word.includes(' ');
                    const regex = new RegExp(`\\b${word}\\b`, 'i');
                    if (regex.test(lower) || (isPhrase && lower.includes(word))) {
                        score += isPhrase ? 3 : 1;
                    }
                });
                if (score > maxScore) {
                    maxScore = score;
                    bestMatch = category;
                }
            });

            if (bestMatch) updates.smartType = bestMatch;
        }

        if (!data.manualOverrides?.severity) {
            if (/(death|fatal|killed|died|fatality|passed away)/i.test(lower)) updates.severity = 'Level D';
            else if (/(fracture|broken|hospital|amputation|severed|crush|loss of consciousness)/i.test(lower)) updates.severity = 'Level C';
            else if (/(medical|doctor|stitch|strain|sprain|burn|concussion|dislocate)/i.test(lower)) updates.severity = 'Level B';
            else if (/(cut|bruise|scratch|scrape|minor|graze|band aid|first aid)/i.test(lower)) updates.severity = 'Level A';
        }

        if (!data.manualOverrides?.type) {
            if (/(near miss|almost|narrowly|avoided|close call|just missed)/i.test(lower)) updates.type = 'Near Miss';
            else if (/(damage|broken equipment|smash|crashed|destroyed|dent|collapsed)/i.test(lower)) updates.type = 'Property Damage';
            else if (/(injury|hurt|pain|cut|wound|bleed|sprain)/i.test(lower)) updates.type = 'First Aid injury';
        }

        if (Object.keys(updates).length > 0) {
            setData((prev) => ({ ...prev, ...updates }));
        }
    };

    const generateSmartInvestigation = (description) => {
        if (!description || description.length < 20) {
            alert('Please provide a detailed sentence explaining what happened, what failed, and why.');
            return;
        }

        setIsAnalyzing(true);

        setTimeout(() => {
            const lower = description.toLowerCase();
            let objectInvolved = 'equipment/material';
            let hazardType = 'generic hazard';

            if (/(forklift|truck|vehicle|flt|crane)/.test(lower)) objectInvolved = 'workplace vehicle';
            if (/(machine|conveyor|press|pump|motor)/.test(lower)) objectInvolved = 'machinery';
            if (/(ladder|scaffold|roof|stairs)/.test(lower)) objectInvolved = 'working at height equipment';
            if (/(chemical|acid|solvent|oil|fluid|water)/.test(lower)) objectInvolved = 'chemical/fluid';
            if (/(gasket|valve|hose|pipe|wire)/.test(lower)) objectInvolved = 'component/part';

            if (/(slip|trip|fall|puddle)/.test(lower)) hazardType = 'loss of traction/stability';
            if (/(cut|laceration|amputation|crush|nip|entangle)/.test(lower)) hazardType = 'contact with moving parts';
            if (/(burn|fire|explosion|spark)/.test(lower)) hazardType = 'uncontrolled thermal energy';
            if (/(leak|spill|fume|inhale)/.test(lower)) hazardType = 'loss of containment';

            const fishbone = { man: [], machine: [], material: [], method: [], environment: [] };

            if (/(rushing|forgot|ignored|untrained|distracted|tired)/.test(lower)) {
                fishbone.man.push('Behavioral deviation or lack of task awareness');
            } else {
                fishbone.man.push('Task execution error during standard operation');
            }

            if (/(broken|failed|blew|snapped|missing|bypassed)/.test(lower)) {
                fishbone.machine.push(`Failure/degradation of ${objectInvolved}`);
            }

            if (/(complained|weeks|days|reported|maintenance|permit|loto)/.test(lower)) {
                fishbone.method.push('Breakdown in defect reporting / CAPA escalation');
                fishbone.method.push('Failure to follow established safe systems of work');
            } else {
                fishbone.method.push(`Inadequate risk assessment for task involving ${objectInvolved}`);
            }

            if (/(wet|dark|noise|weather|rain|cramped)/.test(lower)) {
                fishbone.environment.push('Adverse environmental conditions impacting safety');
            }

            Object.keys(fishbone).forEach((key) => {
                if (fishbone[key].length === 0) fishbone[key].push('No specific deviations identified in initial narrative');
            });

            let w1 = `The incident occurred due to a ${hazardType} involving ${objectInvolved}.`;
            let w2 = `There was a failure in the primary control measure protecting the worker from the ${objectInvolved}.`;
            let w3 = `The ${objectInvolved} was operating outside of normal/safe parameters.`;
            let w4 = 'Preventative maintenance, inspections, or pre-use checks failed to identify or correct the deviation.';
            let w5 = 'Systemic gap in the safety management system regarding hazard identification and operational control.';

            if (/(complained|reported)/.test(lower)) {
                w4 = `Previous reports regarding the ${objectInvolved} were not actioned or escalated appropriately.`;
                w5 = 'Breakdown in the safety culture and the Corrective Action (CAPA) tracking process.';
            }

            if (hazardType === 'loss of traction/stability') {
                w2 = 'The walking/working surface was contaminated or obstructed.';
                w3 = 'Failure to immediately identify and isolate the spill/hazard.';
            }

            const generatedWhys = [
                `Why 1 (The Event): ${w1}`,
                `Why 2 (Immediate Cause): ${w2}`,
                `Why 3 (Contributing Factor): ${w3}`,
                `Why 4 (Systemic Factor): ${w4}`,
                `Why 5 (Root Cause): ${w5}`
            ];

            const generatedFta = {
                id: 1,
                label: `Top Event: ${hazardType.toUpperCase()}`,
                type: 'AND',
                children: [
                    {
                        id: 2,
                        label: `Immediate: ${fishbone.machine[0] !== 'No specific deviations identified in initial narrative' ? fishbone.machine[0] : 'Control Failure'}`,
                        type: 'OR',
                        children: [
                            { id: 4, label: `Condition: ${fishbone.environment[0] !== 'No specific deviations identified in initial narrative' ? 'Adverse Environment' : 'Hazard Present'}`, type: 'EVENT' },
                            { id: 5, label: `Action: ${fishbone.man[0]}`, type: 'EVENT' }
                        ]
                    }
                ]
            };

            const dynamicCapa = [
                { act: `Review and update specific Risk Assessment for task involving ${objectInvolved}`, siteId: data.siteId, own: '', due: '', status: 'Open' },
                { act: `Conduct safety stand-down regarding ${hazardType} hazards`, siteId: data.siteId, own: '', due: '', status: 'Open' }
            ];

            if (/(broken|failed|leak)/.test(lower)) {
                dynamicCapa.push({ act: `Audit preventative maintenance schedule for all ${objectInvolved}s`, siteId: data.siteId, own: '', due: '', status: 'Open' });
            }

            setData((prev) => ({
                ...prev,
                investigation: {
                    ...prev.investigation,
                    rootCause: w5,
                    fiveWhys: [{ id: Date.now(), name: 'Inference Engine Analysis', whys: generatedWhys }],
                    fishbone,
                    faultTree: generatedFta
                },
                capa: [...(prev.capa || []), ...dynamicCapa]
            }));

            setIsAnalyzing(false);
            alert('Contextual RCA Matrix Generated! Move to Step 3 to review the Auto-Analysis.');
        }, 1200);
    };

    const handleAddTeamMember = (type) => {
        if (type === 'external') {
            if (!externalName.trim()) return alert('Enter external member name.');
            if ((data.investigationTeam || []).some((a) => a.name.toLowerCase() === externalName.trim().toLowerCase())) return alert('Member is already in the list.');
            const newMember = { userId: 'External', name: externalName.trim(), role: 'External Investigator / Contractor' };
            setData((prev) => ({ ...prev, investigationTeam: [...(prev.investigationTeam || []), newMember] }));
            setExternalName('');
            return undefined;
        }

        if (!selectedUserToAdd) return undefined;
        const userObj = users.find((u) => u.id === selectedUserToAdd || u.name === selectedUserToAdd || u.email === selectedUserToAdd);
        if ((data.investigationTeam || []).some((a) => a.name === (userObj ? (userObj.name || userObj.email) : selectedUserToAdd))) return alert('Employee is already in the list.');
        const newMember = { userId: userObj ? userObj.id : 'Internal', name: userObj ? (userObj.name || userObj.email) : selectedUserToAdd, role: userObj ? (userObj.designation || userObj.role) : 'Employee' };
        setData((prev) => ({ ...prev, investigationTeam: [...(prev.investigationTeam || []), newMember] }));
        setSelectedUserToAdd('');
        return undefined;
    };

    const removeTeamMember = (index) => {
        setData((prev) => ({ ...prev, investigationTeam: (prev.investigationTeam || []).filter((_, i) => i !== index) }));
    };

    const saveData = async () => {
        if (!session) {
            alert('Session expired. Please sign in again.');
            navigate('/');
            return;
        }

        if (!canEditForm) return alert('Security Error: You do not have permission to create or edit incidents for this site.');
        if (!data.siteId || !data.title) {
            alert('Please provide an Incident Title and select a Site.');
            return;
        }

        setSaving(true);
        try {
            const cleanCapa = (data.capa || [])
                .filter((c) => c.act && c.act.trim() !== '')
                .map((capaItem, index) => ({
                    ...capaItem,
                    actionId: capaItem.actionId || `capa-${Date.now()}-${index}`,
                    actionType: capaItem.actionType || (capaItem.verificationForActionId ? 'Verification' : 'Corrective')
                }));
            let explodedCapa = [];

            if (data.horizontalDeployment) {
                const uniqueActionDesc = [...new Set(cleanCapa.map((a) => a.act))];
                uniqueActionDesc.forEach((desc) => {
                    const template = cleanCapa.find((a) => a.act === desc);
                    sites.forEach((site) => {
                        const existing = cleanCapa.find((a) => a.act === desc && (a.siteId === site.code || (!a.siteId && data.siteId === site.code)));
                        if (existing) {
                            explodedCapa.push({ ...existing, siteId: site.code });
                        } else {
                            explodedCapa.push({
                                act: desc,
                                actionId: `${template?.actionId || `capa-${Date.now()}`}-${site.code}`,
                                actionType: template?.actionType || 'Corrective',
                                verificationForActionId: template?.verificationForActionId || '',
                                siteId: site.code,
                                own: 'Unassigned',
                                due: template?.due,
                                status: 'Open'
                            });
                        }
                    });
                });
            } else {
                explodedCapa = cleanCapa.map((a) => ({ ...a, siteId: a.siteId || data.siteId }));
            }

            const capaWithVerificationActions = buildIncidentCapaWithVerificationActions({
                actions: explodedCapa,
                severity: data.severity,
                defaultSiteId: data.siteId,
                createId: () => Date.now()
            });

            const incidentId = currentIncidentId || 'Draft';
            const payload = JSON.parse(JSON.stringify({
                ...data,
                id: incidentId,
                capa: capaWithVerificationActions,
                linkedHazards: data.linkedHazards || [],
                timestamp: new Date().toISOString(),
                reportedBy: session.user || session.name || session.email
            }));

            if (data.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/incidents/${data.firebaseKey}`), payload);
                alert(data.horizontalDeployment ? 'Horizontal Deployment Updated. Actions pushed globally!' : 'Incident Saved Successfully!');
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/incidents`), payload);
                alert(data.horizontalDeployment ? 'Horizontal Deployment Active. CAPAs deployed globally!' : 'Incident Saved Successfully!');
            }

            const refreshedIncidents = await readOrgChild(rtdb, session.orgId, 'incidents');
            setIncidentsList(refreshedIncidents ? Object.entries(refreshedIncidents).map(([k, v]) => ({ firebaseKey: k, ...v })) : []);
            setView('repo');
        } catch (e) {
            alert(`Save failed: ${e.message}`);
        }
        setSaving(false);
    };

    const handleDeleteRecord = async (incident) => {
        if (!session) {
            alert('Session expired. Please sign in again.');
            navigate('/');
            return;
        }

        if (!permissions.canDelete) return alert('Security Error: Only Global Owners and Site Owners can permanently delete records.');
        if (window.confirm('Permanently delete incident?')) {
            await remove(ref(rtdb, `organizations/${session.orgId}/incidents/${incident.firebaseKey}`));
            setIncidentsList((prev) => prev.filter((i) => i.firebaseKey !== incident.firebaseKey));
        }
    };

    const handleEdit = (incident) => {
        setData(buildEditableIncidentData(initialDataState, incident));
        setView('form');
        setStep(1);
    };

    const triggerPrint = (dataObj) => {
        const incidentId = dataObj.id || currentIncidentId;
        setPrintData(buildPrintableIncidentData({ ...dataObj, id: incidentId }));
        setTimeout(() => window.print(), 800);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const base64 = await fileToBase64(file);
            setData({ ...data, imageEvidence: base64 });
        }
    };

    const scanHiraDatabase = () => {
        if (!data.siteId) return alert('Please select a Site in Step 1 first.');
        if (!data.description || data.description.length < 10) return alert('Please write a detailed incident description in Step 1 to extract keywords.');

        const keywords = data.description.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter((w) => w.length > 3);
        const matches = [];

        riskAssessments.filter((ra) => ra.siteId === data.siteId).forEach((ra) => {
            safeArr(ra.activities).forEach((act, actIdx) => {
                safeArr(act.hazards).forEach((haz, hazIdx) => {
                    let score = 0;
                    const textToSearch = `${haz.category} ${haz.subCategory} ${haz.desc}`.toLowerCase();

                    keywords.forEach((kw) => {
                        if (textToSearch.includes(kw)) score += 1;
                    });

                    if (score > 0) {
                        matches.push({
                            raKey: ra.firebaseKey,
                            raDocId: ra.docId,
                            raName: ra.assessmentName || 'Unnamed HIRA',
                            actIdx,
                            hazIdx,
                            actName: act.name,
                            hazard: haz,
                            score
                        });
                    }
                });
            });
        });

        setMatchedHazards(matches.sort((a, b) => b.score - a.score).slice(0, 10));
        setSearchModalOpen(true);
    };

    const openHazardEditor = (match) => {
        setEditingHazardData({
            ...match,
            modifiedHazard: JSON.parse(JSON.stringify(match.hazard))
        });
    };

    const saveLinkedHazard = async () => {
        if (!editingHazardData || !session) return;
        setSaving(true);
        try {
            const { raKey, actIdx, hazIdx, modifiedHazard, raDocId, actName } = editingHazardData;
            const currentRA = riskAssessments.find((r) => r.firebaseKey === raKey) || {};
            const currentLogs = currentRA.changeLogs || [];
            const newLog = {
                date: new Date().toISOString(),
                user: session.name || session.user || 'Admin',
                source: 'Incident Investigation',
                reason: `System Auto-Log: Controls modified post-incident review (Incident ID: ${currentIncidentId || 'Draft'})`
            };

            const updates = {};
            updates[`activities/${actIdx}/hazards/${hazIdx}`] = modifiedHazard;
            updates.changeLogs = [...currentLogs, newLog];

            await update(ref(rtdb, `organizations/${session.orgId}/riskAssessments/${raKey}`), updates);

            const linkRecord = {
                raDocId,
                actName,
                category: modifiedHazard.category,
                subCategory: modifiedHazard.subCategory,
                newRiskScore: modifiedHazard.r2,
                reviewDate: new Date().toISOString().split('T')[0]
            };

            setData((prev) => ({
                ...prev,
                linkedHazards: [...(prev.linkedHazards || []), linkRecord],
                riskUpdated: true
            }));

            const updatedRas = [...riskAssessments];
            const raIndex = updatedRas.findIndex((r) => r.firebaseKey === raKey);
            if (raIndex > -1) {
                updatedRas[raIndex].activities[actIdx].hazards[hazIdx] = modifiedHazard;
                updatedRas[raIndex].changeLogs = [...currentLogs, newLog];
                setRiskAssessments(updatedRas);
            }

            alert('HIRA Updated and Linked Successfully! Change logged to Risk Revision History.');
            setEditingHazardData(null);
            setSearchModalOpen(false);
        } catch (e) {
            alert(`Failed to update HIRA: ${e.message}`);
        }
        setSaving(false);
    };

    const addFiveWhyPath = () => {
        const newCount = data.investigation?.fiveWhys?.length + 1 || 1;
        setData((prev) => ({
            ...prev,
            investigation: {
                ...prev.investigation,
                fiveWhys: [...(prev.investigation?.fiveWhys || []), { id: Date.now(), name: `Analysis Path ${newCount}`, whys: ['', '', '', '', ''] }]
            }
        }));
    };

    const updateFiveWhy = (pIdx, wIdx, val) => {
        const paths = [...data.investigation.fiveWhys];
        paths[pIdx].whys[wIdx] = val;
        setData((prev) => ({ ...prev, investigation: { ...prev.investigation, fiveWhys: paths } }));
    };

    const updatePathName = (pIdx, val) => {
        const paths = [...data.investigation.fiveWhys];
        paths[pIdx].name = val;
        setData((prev) => ({ ...prev, investigation: { ...prev.investigation, fiveWhys: paths } }));
    };

    const removeFiveWhyPath = (idx) => {
        setData((prev) => ({
            ...prev,
            investigation: {
                ...prev.investigation,
                fiveWhys: prev.investigation.fiveWhys.filter((_, i) => i !== idx)
            }
        }));
    };

    const addCapa = () => {
        if (!newCapaAct) {
            alert('Action Description is required to add a CAPA.');
            return;
        }

        setData({ ...data, capa: [...(data.capa || []), { act: newCapaAct, siteId: newCapaSite || data.siteId, own: newCapaOwn, due: newCapaDue, status: 'Open' }] });
        setNewCapaAct('');
        setNewCapaOwn('');
        setNewCapaDue('');
        setNewCapaSite('');
    };

    const removeCapa = (idx) => {
        setData({ ...data, capa: data.capa.filter((_, i) => i !== idx) });
    };

    const canEditCapa = (row) => {
        if (canEditForm) return true;
        if (permissions.viewOnly && permissions.canEditOwnedActions && row.own === (session?.name || session?.user || session?.email)) return true;
        return false;
    };
    if (!fbReady) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-950 text-white font-['Space_Grotesk']">
                <div className="w-12 h-12 border-4 border-slate-800 border-t-red-500 rounded-full animate-spin mb-4 mr-4"></div>
                Loading Incident Engine...
            </div>
        );
    }

    const steps = [
        { id: 1, label: 'Initial' },
        ...(data.severity !== 'Level D' ? [{ id: 2, label: 'Team & Details' }] : []),
        { id: 3, label: 'Investigate' },
        { id: 4, label: 'CAPA' },
        { id: 5, label: 'Review & HIRA' }
    ];
    const useModularView = true;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative print:h-auto print:overflow-visible">
            <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none no-print"></div>

            <div className="app-ui flex flex-col h-full relative z-10 no-print">
                <header className="h-20 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/50 backdrop-blur-md shadow-md">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate(getPortalAwareHomePath({ fallbackPath: '/dashboard', site: siteFilter }))} className="text-slate-400 hover:text-white transition flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                        <div className="h-6 w-px bg-slate-700 mx-2"></div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-red-600 flex items-center justify-center text-white font-bold shadow-lg shadow-red-900/50"><i className="fas fa-triangle-exclamation"></i></div>
                        <h1 className="font-bold text-white tracking-tight uppercase">Incident Management</h1>

                        <div className="ml-4 flex gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">{session?.role}</span>
                            {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20">View Only</span>}
                        </div>
                    </div>
                    <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner">
                        {permissions.canEditCreate && (
                            <button
                                type="button"
                                onClick={() => {
                                    setView('form');
                                    setStep(1);
                                    setData({
                                        ...initialDataState,
                                        id: '',
                                        siteId: (!isGlobalUser && allowedSites.length === 1) ? allowedSites[0].code : (siteFilter !== 'All' ? siteFilter : '')
                                    });
                                }}
                                className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'form' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                            >
                                New Report
                            </button>
                        )}
                        <button type="button" onClick={() => setView('repo')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'repo' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>Repository</button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 w-full print:overflow-visible custom-scroll">
                    {view === 'repo' ? (
                        <div className="max-w-7xl mx-auto">
                            {useModularView ? (
                                <IncidentRegistry incidents={visibleIncidents} onEdit={handleEdit} onPrint={triggerPrint} onDelete={handleDeleteRecord} permissions={permissions} siteFilter={siteFilter} setSiteFilter={setSiteFilterOverride} uniqueSites={allowedSites} isGlobalUser={isGlobalUser} />
                            ) : (
                                <IncidentRepository incidents={visibleIncidents} onEdit={handleEdit} onPrint={triggerPrint} onDelete={handleDeleteRecord} permissions={permissions} siteFilter={siteFilter} setSiteFilter={setSiteFilterOverride} uniqueSites={allowedSites} isGlobalUser={isGlobalUser} />
                            )}
                        </div>
                    ) : (
                        useModularView ? (
                            <IncidentBuilder
                                activePersonnelList={activePersonnelList}
                                addCapa={addCapa}
                                addFiveWhyPath={addFiveWhyPath}
                                allowedSites={allowedSites}
                                canEditCapa={canEditCapa}
                                canEditForm={canEditForm}
                                contractors={contractors}
                                data={data}
                                externalName={externalName}
                                generateSmartInvestigation={generateSmartInvestigation}
                                handleAddTeamMember={handleAddTeamMember}
                                handleDescriptionBlur={handleDescriptionBlur}
                                handleImageUpload={handleImageUpload}
                                initialDataState={initialDataState}
                                isAnalyzing={isAnalyzing}
                                isGlobalUser={isGlobalUser}
                                newCapaAct={newCapaAct}
                                newCapaDue={newCapaDue}
                                newCapaOwn={newCapaOwn}
                                newCapaSite={newCapaSite}
                                removeCapa={removeCapa}
                                removeFiveWhyPath={removeFiveWhyPath}
                                removeTeamMember={removeTeamMember}
                                saveData={saveData}
                                saving={saving}
                                scanHiraDatabase={scanHiraDatabase}
                                selectedUserToAdd={selectedUserToAdd}
                                setData={setData}
                                setExternalName={setExternalName}
                                setNewCapaAct={setNewCapaAct}
                                setNewCapaDue={setNewCapaDue}
                                setNewCapaOwn={setNewCapaOwn}
                                setNewCapaSite={setNewCapaSite}
                                setSelectedUserToAdd={setSelectedUserToAdd}
                                setStep={setStep}
                                setView={setView}
                                siteUsers={siteUsers}
                                sites={sites}
                                step={step}
                                steps={steps}
                                triggerPrint={triggerPrint}
                                updateFiveWhy={updateFiveWhy}
                                updatePathName={updatePathName}
                            />
                        ) : (
                        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex gap-2 mb-8 form-view-tabs bg-slate-900/40 p-2 rounded-2xl border border-slate-800 backdrop-blur-sm shadow-xl">
                                {steps.map((s, i) => (
                                    <button key={s.id} type="button" onClick={() => setStep(s.id)} className={`flex-1 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${step === s.id ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 scale-[1.02]' : 'bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
                                        <span className="opacity-50 mr-1">{i + 1}.</span> {s.label}
                                    </button>
                                ))}
                            </div>

                            {step === 1 && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <h2 className="text-xl font-bold text-red-400 mb-8 flex items-center gap-3 border-b border-red-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-clipboard-list text-2xl"></i> 1. Initial Report Details</h2>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                                        <div className="md:col-span-4">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Incident Title *</label>
                                            <input value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-red-500 font-bold" placeholder="e.g. Laceration to right hand during grinding" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Site ID *</label>
                                            <select value={data.siteId} onChange={(e) => setData({ ...data, siteId: e.target.value })} disabled={!canEditForm || (!isGlobalUser && allowedSites.length <= 1)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500">
                                                {(isGlobalUser || allowedSites.length > 1) && <option value="">Select Authorized Site...</option>}
                                                {allowedSites.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                            </select>
                                        </div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Date *</label><input type="date" value={data.date} onChange={(e) => setData({ ...data, date: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500 font-mono" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Time</label><input type="time" value={data.time} onChange={(e) => setData({ ...data, time: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500 font-mono" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Record ID</label><input value={currentIncidentId} className="w-full bg-slate-950/50 border border-slate-800 p-3 rounded-lg text-slate-500 text-xs font-mono" disabled placeholder="Auto-generated" /></div>

                                        <div><label className="text-[10px] uppercase font-bold text-purple-400 ml-1 mb-2 block">Smart Category (AI)</label><select value={data.smartType} onChange={(e) => setData({ ...data, smartType: e.target.value, manualOverrides: { ...data.manualOverrides, smartType: true } })} disabled={!canEditForm} className="w-full bg-purple-900/10 border border-purple-500/30 p-3 rounded-lg text-purple-300 font-bold text-xs outline-none focus:border-purple-500">{SMART_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>

                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Incident Type</label><select value={data.type} onChange={(e) => setData({ ...data, type: e.target.value, manualOverrides: { ...data.manualOverrides, type: true } })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500"><option>Near Miss</option><option>Property Damage</option><option>First Aid injury</option><option>Lost Time injury</option><option>Reportable Injury</option></select></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Severity</label><select value={data.severity} onChange={(e) => setData({ ...data, severity: e.target.value, manualOverrides: { ...data.manualOverrides, severity: true } })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500"><option>Level A</option><option>Level B</option><option>Level C</option><option>Level D</option></select></div>

                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Equipment</label><input value={data.equipmentInvolved} onChange={(e) => setData({ ...data, equipmentInvolved: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500" placeholder="e.g., Forklift" /></div>
                                    </div>

                                    <div className="mb-6 bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-inner relative">
                                        <label className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 ml-1">
                                            Detailed Incident Narrative
                                            {!data.manualOverrides?.smartType && <span className="text-purple-400 animate-pulse bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/30 tracking-widest"><i className="fas fa-robot mr-1"></i> Auto-Classify on blur</span>}
                                        </label>
                                        <textarea rows="4" value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} onBlur={handleDescriptionBlur} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-purple-500 outline-none shadow-inner mb-4" disabled={!canEditForm} placeholder="e.g., 'John slipped on a puddle of hydraulic fluid because the forklift gasket blew out, which we complained about for weeks...'" />

                                        {canEditForm && (
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => generateSmartInvestigation(data.description)}
                                                    disabled={isAnalyzing || !data.description || data.description.length < 15}
                                                    className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isAnalyzing ? (
                                                        <><i className="fas fa-spinner fa-spin"></i> Processing Context...</>
                                                    ) : (
                                                        <><i className="fas fa-microchip"></i> Auto-Generate RCA Matrix</>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-indigo-950/20 p-6 rounded-2xl border border-indigo-500/30 shadow-inner mb-6">
                                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-indigo-500/30 pb-2 mb-4"><i className="fas fa-user-injured mr-2"></i> Affected Personnel</h4>
                                        <div className="space-y-4">
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-300">
                                                    <input type="radio" name="pType" value="Internal" checked={data.affectedPersonType === 'Internal'} onChange={() => setData({ ...data, affectedPersonType: 'Internal', contractorId: '', affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="accent-indigo-500 w-4 h-4" /> Internal Staff
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-300">
                                                    <input type="radio" name="pType" value="Contractor" checked={data.affectedPersonType === 'Contractor'} onChange={() => setData({ ...data, affectedPersonType: 'Contractor', affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="accent-indigo-500 w-4 h-4" /> Contractor / External
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-300">
                                                    <input type="radio" name="pType" value="None" checked={data.affectedPersonType === 'None'} onChange={() => setData({ ...data, affectedPersonType: 'None', contractorId: '', affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="accent-indigo-500 w-4 h-4" /> None (Property/Env)
                                                </label>
                                            </div>

                                            {data.affectedPersonType === 'Contractor' && (
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-indigo-300 block mb-2">Select Vendor Company</label>
                                                    <select value={data.contractorId} onChange={(e) => setData({ ...data, contractorId: e.target.value, affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl p-3 text-white outline-none focus:border-indigo-400">
                                                        <option value="">Select Company...</option>
                                                        {contractors.filter((c) => !data.siteId || safeArr(c.allocatedSites).includes(data.siteId) || c.siteId === 'GLOBAL').map((c) => <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>)}
                                                    </select>
                                                </div>
                                            )}

                                            {data.affectedPersonType !== 'None' && (
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-indigo-300 block mb-2">Select Individual Worker</label>
                                                    <select
                                                        value={data.affectedPersonId}
                                                        onChange={(e) => {
                                                            const target = activePersonnelList.find((x) => x.id === e.target.value);
                                                            setData({ ...data, affectedPersonId: e.target.value, affectedPersonName: target ? (target.name || target.email) : '' });
                                                        }}
                                                        disabled={!canEditForm || (data.affectedPersonType === 'Contractor' && !data.contractorId)}
                                                        className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl p-3 text-white outline-none focus:border-indigo-400 font-bold"
                                                    >
                                                        <option value="">Select Person...</option>
                                                        {activePersonnelList.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} {u.role ? `(${u.role})` : ''}</option>)}
                                                    </select>
                                                    <p className="text-[10px] text-slate-500 mt-2 italic">Note: Selecting a contractor worker here will automatically sync this incident to their permanent ISO 45001 Safety Passport.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-2 ml-1">Immediate Actions Taken</label>
                                        <textarea rows="3" value={data.immediateAction} onChange={(e) => setData({ ...data, immediateAction: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-red-500 outline-none shadow-inner" disabled={!canEditForm} placeholder="What was done immediately to secure the scene or treat the injured?"></textarea>
                                    </div>

                                    <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-xl">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 mb-4 block"><i className="fas fa-camera mr-2"></i> Photographic Evidence</label>
                                        {data.imageEvidence && (
                                            <div className="relative inline-block group">
                                                <img src={data.imageEvidence} alt="Evidence" className="h-48 rounded-xl border-2 border-slate-700 object-cover shadow-xl" />
                                                {canEditForm && <button type="button" onClick={() => setData({ ...data, imageEvidence: null })} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-xl w-8 h-8 text-sm opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center justify-center"><i className="fas fa-times"></i></button>}
                                            </div>
                                        )}
                                        {!data.imageEvidence && canEditForm && (
                                            <label className="cursor-pointer bg-slate-900 border-2 border-dashed border-slate-700 hover:border-red-500 hover:bg-slate-800 transition-colors w-48 h-48 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-red-400">
                                                <i className="fas fa-cloud-upload-alt text-3xl mb-2"></i>
                                                <span className="text-xs font-bold uppercase tracking-widest">Upload Photo</span>
                                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                            </label>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                                        <button type="button" onClick={() => setView('repo')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                                        {canEditForm && (
                                            <button type="button" onClick={saveData} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} text-lg`}></i> {saving ? 'Saving...' : 'Save Draft'}</button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {step === 2 && data.severity !== 'Level D' && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <h2 className="text-xl font-bold text-teal-400 mb-8 flex items-center gap-3 border-b border-teal-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-users text-2xl"></i> 2. Investigation Team</h2>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                            <h3 className="font-bold text-white mb-6 uppercase tracking-widest text-xs"><i className="fas fa-user-shield text-teal-400 mr-2"></i> Team Roster ({(data.investigationTeam || []).length})</h3>

                                            {canEditForm && (
                                                <div className="space-y-4 mb-8 pb-8 border-b border-slate-800 no-print">
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Add Internal Employee</label>
                                                        <div className="flex gap-2">
                                                            <select value={selectedUserToAdd} onChange={(e) => setSelectedUserToAdd(e.target.value)} className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-teal-500 text-white">
                                                                <option value="">Select Employee...</option>
                                                                {siteUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>)}
                                                            </select>
                                                            <button type="button" onClick={() => handleAddTeamMember('internal')} className="bg-teal-600 hover:bg-teal-500 text-white px-4 rounded-lg text-sm font-bold shadow-lg transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Add External Contractor/Expert</label>
                                                        <div className="flex gap-2">
                                                            <input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Type Name..." className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-purple-500 text-white" />
                                                            <button type="button" onClick={() => handleAddTeamMember('external')} className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-lg text-sm font-bold shadow-lg transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-900">
                                                <table className="w-full text-left text-xs text-slate-300">
                                                    <thead className="bg-slate-950 uppercase font-bold text-slate-500 border-b border-slate-800">
                                                        <tr><th className="p-4">Name</th><th className="p-4">Role</th><th className="p-4 w-10 text-center"></th></tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/50">
                                                        {(data.investigationTeam || []).map((att, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-800/50">
                                                                <td className="p-4 font-bold text-white">
                                                                    {att.name}
                                                                    {att.userId === 'External' && <span className="ml-2 text-[9px] bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30">EXT</span>}
                                                                </td>
                                                                <td className="p-4">{att.role}</td>
                                                                <td className="p-4 text-center">
                                                                    {canEditForm && <button type="button" onClick={() => removeTeamMember(idx)} className="text-red-500 hover:text-white bg-red-500/10 hover:bg-red-500 px-2 py-1 rounded transition-colors"><i className="fas fa-times"></i></button>}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {(!data.investigationTeam || data.investigationTeam.length === 0) && <tr><td colSpan="3" className="p-8 text-center text-slate-500 italic">No team members assigned.</td></tr>}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-4 tracking-wider"><i className="fas fa-pen-alt mr-2 text-teal-400"></i> Investigation Notes & Summary</label>
                                            <textarea className="w-full flex-1 bg-slate-900 border border-slate-700 p-5 rounded-xl text-white focus:border-teal-500 outline-none resize-none custom-scroll text-sm shadow-inner min-h-[300px]" value={data.consultationSummary} onChange={(e) => setData({ ...data, consultationSummary: e.target.value })} placeholder="Summarize the investigation details, witness statements, and initial findings here..." disabled={!canEditForm}></textarea>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                                        <button type="button" onClick={() => setView('repo')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                                        {canEditForm && (
                                            <button type="button" onClick={saveData} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} text-lg`}></i> {saving ? 'Saving...' : 'Save Draft'}</button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <div className="flex justify-between items-center mb-8 border-b border-purple-500/20 pb-4">
                                        <h2 className="text-xl font-bold text-purple-400 flex items-center gap-3 uppercase tracking-widest"><i className="fas fa-search-location text-2xl"></i> 3. Root Cause Analysis</h2>
                                        {canEditForm && (
                                            <button type="button" onClick={() => generateSmartInvestigation(data.description)} disabled={isAnalyzing || !data.description || data.description.length < 15} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-lg shadow-purple-600/20 flex items-center gap-2 transition-transform active:scale-95 uppercase tracking-widest disabled:opacity-50">
                                                {isAnalyzing ? <><i className="fas fa-spinner fa-spin"></i> Analyzing...</> : <><i className="fas fa-wand-magic-sparkles"></i> AI Auto-Analyze</>}
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-12">
                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                                            <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs flex items-center"><i className="fas fa-fish text-blue-400 mr-2"></i> Fishbone Diagram</h3>
                                            <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 overflow-x-auto">
                                                <Fishbone data={data.investigation?.fishbone || { man: [], machine: [], material: [], method: [], environment: [] }} onChange={(fishbone) => setData({ ...data, investigation: { ...data.investigation, fishbone } })} disabled={!canEditForm} />
                                            </div>
                                        </div>

                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                                            <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs flex items-center"><i className="fas fa-project-diagram text-orange-400 mr-2"></i> Fault Tree Analysis</h3>
                                            <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 overflow-x-auto tree">
                                                <ul className="m-0 p-0"><FaultTreeNode node={data.investigation?.faultTree || { id: 1, label: 'Top Event', type: 'AND', children: [] }} onUpdate={(faultTree) => setData({ ...data, investigation: { ...data.investigation, faultTree } })} disabled={!canEditForm} /></ul>
                                            </div>
                                        </div>

                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                                            <div className="flex justify-between items-center mb-6">
                                                <h3 className="font-bold text-white uppercase tracking-widest text-xs flex items-center"><i className="fas fa-question-circle text-purple-400 mr-2"></i> 5-Whys Analysis</h3>
                                                {canEditForm && <button type="button" onClick={addFiveWhyPath} className="bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-colors no-print"><i className="fas fa-code-branch mr-1"></i> Add Path</button>}
                                            </div>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                {data.investigation?.fiveWhys?.map((path, pIdx) => (
                                                    <div key={path.id || pIdx} className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-inner group">
                                                        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                                                            <input value={path.name || `Analysis Path ${pIdx + 1}`} onChange={(e) => updatePathName(pIdx, e.target.value)} disabled={!canEditForm} className="bg-transparent text-xs font-bold text-purple-400 uppercase tracking-widest outline-none border-b border-transparent focus:border-purple-500 w-full transition-all" />
                                                            {canEditForm && data.investigation.fiveWhys.length > 1 && <button type="button" onClick={() => removeFiveWhyPath(pIdx)} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/10 hover:bg-red-500 w-8 h-8 rounded flex items-center justify-center no-print ml-4"><i className="fas fa-trash-alt"></i></button>}
                                                        </div>
                                                        <div className="space-y-3">
                                                            {path.whys?.map((w, i) => (
                                                                <div key={i} className="flex gap-4 items-center">
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-12 text-right border-r border-slate-700 pr-3">Why {i + 1}</span>
                                                                    <input className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white focus:border-purple-500 outline-none" value={w} onChange={(e) => updateFiveWhy(pIdx, i, e.target.value)} disabled={!canEditForm} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-emerald-950/30 p-6 rounded-2xl border border-emerald-900/50">
                                            <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-bullseye mr-2"></i> Final Root Cause Conclusion</label>
                                            <textarea rows="4" value={data.investigation?.rootCause || ''} onChange={(e) => setData({ ...data, investigation: { ...(data.investigation || {}), rootCause: e.target.value } })} disabled={!canEditForm} className="w-full bg-emerald-900/10 border border-emerald-500/30 rounded-xl p-5 text-sm text-emerald-100 focus:border-emerald-500 outline-none resize-none shadow-inner" placeholder="State the conclusive root cause based on the analysis above..."></textarea>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                                        <button type="button" onClick={() => setView('repo')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                                        {canEditForm && (
                                            <button type="button" onClick={saveData} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} text-lg`}></i> {saving ? 'Saving...' : 'Save Draft'}</button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {step === 4 && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <h2 className="text-xl font-bold text-orange-400 mb-8 flex items-center gap-3 border-b border-orange-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-list-check text-2xl"></i> 4. CAPA Plan</h2>

                                    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                                        <div className="col-span-1 md:col-span-5 mt-2 bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl flex items-center justify-between shadow-inner mb-6">
                                            <div>
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input type="checkbox" checked={data.horizontalDeployment || false} onChange={(e) => setData({ ...data, horizontalDeployment: e.target.checked })} disabled={!canEditForm} className="w-5 h-5 accent-blue-500 cursor-pointer" />
                                                    <span className="text-sm font-bold text-blue-400 uppercase tracking-widest">Horizontal Deployment</span>
                                                </label>
                                                <p className="text-[10px] text-slate-400 mt-1 ml-8">If checked, saving this report will automatically generate a separate CAPA Action for <strong>every site in the organization</strong>.</p>
                                            </div>
                                            <i className="fas fa-globe text-3xl text-blue-500/20"></i>
                                        </div>

                                        {canEditForm && (
                                            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-8 no-print bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-inner">
                                                <div className="md:col-span-2">
                                                    <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Action Required</label>
                                                    <input value={newCapaAct} onChange={(e) => setNewCapaAct(e.target.value)} placeholder="Describe action..." className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white focus:border-orange-500 outline-none" />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Target Site</label>
                                                    <select value={newCapaSite} onChange={(e) => setNewCapaSite(e.target.value)} disabled={data.horizontalDeployment} className={`w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white outline-none focus:border-orange-500 ${data.horizontalDeployment ? 'opacity-50' : ''}`}>
                                                        <option value="">{data.horizontalDeployment ? 'All Sites' : 'Default'}</option>
                                                        {!data.horizontalDeployment && sites.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Owner</label>
                                                    <UserSelect users={siteUsers} value={newCapaOwn} onChange={(v) => setNewCapaOwn(v)} disabled={false} placeholder="Assign to..." />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Due Date</label>
                                                    <input type="date" value={newCapaDue} onChange={(e) => setNewCapaDue(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white focus:border-orange-500 outline-none" />
                                                </div>
                                                <div className="flex items-end">
                                                    <button type="button" onClick={addCapa} className="w-full bg-orange-600 hover:bg-orange-500 text-white p-3 rounded-lg font-bold shadow-lg shadow-orange-600/20 transition-transform active:scale-95 text-xs uppercase tracking-widest"><i className="fas fa-plus mr-1"></i> Add</button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="overflow-hidden rounded-xl border border-slate-700 shadow-lg bg-slate-900">
                                            <table className="w-full text-left text-sm text-slate-300">
                                                <thead className="bg-slate-950 text-[10px] uppercase tracking-widest font-bold text-slate-500 border-b border-slate-800">
                                                    <tr><th className="p-5 w-1/3">Action Details</th><th className="p-5">Site</th><th className="p-5">Owner</th><th className="p-5 w-24">Due Date</th><th className="p-5 w-32">Status</th><th className="p-5 w-12"></th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800">
                                                    {(data.capa || []).map((c, i) => (
                                                        <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                                            <td className="p-5"><input className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-orange-500 text-xs py-1 outline-none text-white font-medium" value={c.act} onChange={(e) => { const next = [...data.capa]; next[i].act = e.target.value; setData({ ...data, capa: next }); }} disabled={!canEditCapa(c)} /></td>
                                                            <td className="p-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                                {data.horizontalDeployment ? <span className="bg-blue-900/30 text-blue-400 px-2 py-1 rounded border border-blue-500/30">All Sites</span> : (c.siteId || data.siteId)}
                                                            </td>
                                                            <td className="p-5 text-blue-400 font-bold"><UserSelect users={siteUsers} value={c.own} onChange={(v) => { const next = [...data.capa]; next[i].own = v; setData({ ...data, capa: next }); }} disabled={!canEditCapa(c)} /></td>
                                                            <td className="p-5"><input type="date" className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-orange-500 text-[10px] py-1 outline-none font-mono" value={c.due} onChange={(e) => { const next = [...data.capa]; next[i].due = e.target.value; setData({ ...data, capa: next }); }} disabled={!canEditCapa(c)} /></td>
                                                            <td className="p-5">
                                                                {canEditCapa(c) ? (
                                                                    <select value={c.status} onChange={(e) => { const next = [...data.capa]; next[i].status = e.target.value; setData({ ...data, capa: next }); }} className={`w-full bg-slate-950 text-xs px-3 py-2 rounded-lg outline-none border font-bold ${c.status === 'Closed' ? 'text-emerald-400 border-emerald-500/30' : c.status === 'In Progress' ? 'text-blue-400 border-blue-500/30' : 'text-orange-400 border-orange-500/30'}`}>
                                                                        <option>Open</option><option>In Progress</option><option>Closed</option>
                                                                    </select>
                                                                ) : <span className={`px-3 py-1.5 rounded border text-[10px] font-bold uppercase tracking-widest ${c.status === 'Closed' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/20' : c.status === 'In Progress' ? 'bg-blue-900/20 text-blue-400 border-blue-500/20' : 'bg-orange-900/20 text-orange-400 border-orange-500/20'}`}>{c.status}</span>}
                                                            </td>
                                                            <td className="p-5 text-center">{canEditForm && <button type="button" onClick={() => removeCapa(i)} className="text-red-500 hover:text-white bg-red-500/10 hover:bg-red-500 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button>}</td>
                                                        </tr>
                                                    ))}
                                                    {(!data.capa || data.capa.length === 0) && <tr><td colSpan="6" className="text-center py-12 text-slate-500 text-sm italic border-t border-slate-800">No actions defined. Add one above.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                                        <button type="button" onClick={() => setView('repo')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                                        {canEditForm && (
                                            <button type="button" onClick={saveData} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} text-lg`}></i> {saving ? 'Saving...' : 'Save Draft'}</button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {step === 5 && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <h2 className="text-xl font-bold text-emerald-400 mb-8 flex items-center gap-3 border-b border-emerald-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-link text-2xl"></i> 5. Review & HIRA Connection</h2>

                                    <div className="bg-slate-950/50 p-8 rounded-2xl border border-slate-800 shadow-inner mb-8">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h3 className="font-bold text-lg text-white">Risk Assessment Integrity</h3>
                                                <p className="text-xs text-slate-400 mt-1">Has the facility Risk Assessment (HIRA) been updated post-incident?</p>
                                            </div>
                                            <button type="button" onClick={scanHiraDatabase} disabled={!canEditForm} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50">
                                                <i className="fas fa-search"></i> Scan HIRA Database
                                            </button>
                                        </div>

                                        {data.linkedHazards && data.linkedHazards.length > 0 && (
                                            <div className="mt-8 border-t border-slate-800 pt-6">
                                                <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-4"><i className="fas fa-check-circle mr-2"></i> Linked HIRA Updates Confirmed</h5>
                                                <ul className="space-y-3">
                                                    {data.linkedHazards.map((link, i) => (
                                                        <li key={i} className="bg-emerald-900/10 p-4 rounded-xl border border-emerald-500/20 flex justify-between items-center">
                                                            <div>
                                                                <span className="font-mono text-emerald-400 font-bold mr-3 bg-emerald-950 px-2 py-1 rounded border border-emerald-900">{link.raDocId}</span>
                                                                <span className="text-white font-bold">{link.actName}</span>
                                                                <span className="text-slate-400 text-xs ml-2">({link.category})</span>
                                                            </div>
                                                            <div className="bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg shadow-emerald-500/20">New Risk Score: {link.newRiskScore}</div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    <div className={`flex gap-4 items-start mb-10 p-6 border rounded-2xl transition-colors cursor-pointer ${data.riskUpdated ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`} onClick={() => canEditForm && setData({ ...data, riskUpdated: !data.riskUpdated })}>
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${data.riskUpdated ? 'bg-emerald-500 text-white' : 'bg-slate-800 border border-slate-600 text-transparent'}`}>
                                            <i className="fas fa-check"></i>
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold text-white block cursor-pointer mb-1">Formal Review Confirmation</label>
                                            <p className="text-xs text-slate-400">I confirm that the site Risk Assessment (HIRA) has been formally reviewed, additional controls have been evaluated, and updated where necessary.</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-4 pt-8 border-t border-slate-800 action-buttons">
                                        <button type="button" onClick={() => triggerPrint(data)} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-8 py-4 rounded-xl transition shadow text-xs uppercase tracking-widest flex items-center gap-2"><i className="fas fa-print text-lg"></i> Print Record</button>
                                        {canEditForm && (
                                            <button type="button" onClick={saveData} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} text-lg`}></i> {saving ? 'Saving...' : 'Save & Submit Record'}</button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        )
                    )}
                </div>
            </div>

            {useModularView && (
                <>
                    {searchModalOpen && !editingHazardData && <IncidentHazardMatchesModal matchedHazards={matchedHazards} onClose={() => setSearchModalOpen(false)} onSelect={openHazardEditor} />}
                    {editingHazardData && <IncidentHazardEditorModal editingHazardData={editingHazardData} onClose={() => setEditingHazardData(null)} onSave={saveLinkedHazard} saving={saving} session={session} setEditingHazardData={setEditingHazardData} />}
                    <IncidentPrintOverlay printData={printData} />
                </>
            )}

            {!useModularView && searchModalOpen && !editingHazardData && (
                <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300 no-print">
                    <div className="bg-slate-900 rounded-3xl max-w-4xl w-full p-8 border border-slate-700 max-h-[85vh] overflow-y-auto custom-scroll shadow-2xl flex flex-col">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-6 flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-bold text-blue-400 flex items-center gap-3"><i className="fas fa-search-location"></i> Relevant HIRA Matches</h2>
                                <p className="text-xs text-slate-400 mt-2">The AI scanned active Risk Assessments matching keywords in your incident description.</p>
                            </div>
                            <button type="button" onClick={() => setSearchModalOpen(false)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 w-10 h-10 flex items-center justify-center rounded-xl transition"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {matchedHazards.length === 0 ? (
                                <div className="text-center py-16 bg-slate-950 rounded-2xl border border-dashed border-slate-800">
                                    <i className="fas fa-folder-open text-5xl text-slate-700 mb-4"></i>
                                    <p className="text-slate-300 font-bold text-lg">No matching hazards found.</p>
                                    <p className="text-sm text-slate-500 mt-2">Try expanding your incident description with more specific keywords.</p>
                                </div>
                            ) : (
                                <div className="space-y-4 pr-2">
                                    {matchedHazards.map((match, idx) => (
                                        <div key={idx} className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 flex justify-between items-center hover:border-blue-500/50 transition group">
                                            <div className="pr-6">
                                                <div className="text-[10px] text-emerald-400 font-bold mb-2 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-file-alt"></i> {match.raName} <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">ID: {match.raDocId}</span></div>
                                                <div className="font-bold text-lg text-white mb-1">{match.actName}</div>
                                                <div className="text-sm text-blue-400 font-bold mb-3 bg-blue-900/10 inline-block px-3 py-1 rounded border border-blue-900/30">[{match.hazard.category}] {match.hazard.subCategory}</div>
                                                <div className="text-xs text-slate-400 leading-relaxed border-l-2 border-slate-700 pl-4 italic">{match.hazard.desc}</div>
                                            </div>
                                            <button type="button" onClick={() => openHazardEditor(match)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-transform active:scale-95 whitespace-nowrap opacity-0 group-hover:opacity-100 flex items-center gap-2">Update Risk <i className="fas fa-arrow-right"></i></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!useModularView && editingHazardData && (
                <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300 no-print">
                    <div className="bg-slate-900 rounded-3xl max-w-4xl w-full p-8 border border-slate-700 max-h-[90vh] overflow-y-auto custom-scroll shadow-2xl">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-6">
                            <h2 className="text-2xl font-bold text-orange-400 flex items-center gap-3"><i className="fas fa-shield-virus"></i> Update HIRA Record</h2>
                            <button type="button" onClick={() => setEditingHazardData(null)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 w-10 h-10 flex items-center justify-center rounded-xl transition"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 mb-8 shadow-inner">
                            <div className="text-[10px] text-emerald-400 font-bold mb-2 uppercase tracking-widest font-mono">{editingHazardData.raDocId} - {editingHazardData.actName}</div>
                            <div className="text-xl text-white font-bold mb-3">[{editingHazardData.modifiedHazard.category}] {editingHazardData.modifiedHazard.subCategory}</div>
                            <div className="text-sm text-slate-400 border-l-2 border-slate-700 pl-4 italic">{editingHazardData.modifiedHazard.desc}</div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                                <label className="text-[10px] uppercase text-slate-400 font-bold tracking-widest block mb-4">Post-Incident Risk Re-evaluation</label>
                                <div className="flex gap-4">
                                    <div className="flex-1"><label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">Probability (P)</label><select value={editingHazardData.modifiedHazard.p2} onChange={(e) => { const p2 = parseInt(e.target.value, 10); const s2 = editingHazardData.modifiedHazard.s2; setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, p2, r2: p2 * s2 } }); }} className="w-full bg-slate-950 text-sm p-3 rounded-xl border border-slate-700 outline-none focus:border-orange-500 text-white"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
                                    <div className="flex-1"><label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">Severity (S)</label><select value={editingHazardData.modifiedHazard.s2} onChange={(e) => { const s2 = parseInt(e.target.value, 10); const p2 = editingHazardData.modifiedHazard.p2; setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, s2, r2: p2 * s2 } }); }} className="w-full bg-slate-950 text-sm p-3 rounded-xl border border-slate-700 outline-none focus:border-orange-500 text-white"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">New Score</label>
                                        <div className={`font-bold text-2xl h-[46px] flex items-center justify-center bg-slate-950 border border-slate-700 rounded-xl shadow-inner ${editingHazardData.modifiedHazard.r2 >= 15 ? 'text-red-500 shadow-red-500/20' : editingHazardData.modifiedHazard.r2 >= 10 ? 'text-orange-500 shadow-orange-500/20' : 'text-emerald-500 shadow-emerald-500/20'}`}>{editingHazardData.modifiedHazard.r2}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col justify-between">
                                <label className="text-[10px] uppercase text-emerald-400 font-bold tracking-widest block mb-4 flex items-center gap-2"><i className="fas fa-plus-circle"></i> Add Additional Control</label>
                                <div className="flex flex-col gap-3 flex-1">
                                    <input id="new-hira-ctrl" placeholder="Describe new safety control implemented..." className="bg-slate-950 text-sm p-4 rounded-xl border border-slate-700 focus:border-emerald-500 outline-none text-white shadow-inner flex-1" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const ctrlInput = document.getElementById('new-hira-ctrl');
                                            const ctrl = ctrlInput?.value;
                                            if (ctrl) {
                                                const next = [...(editingHazardData.modifiedHazard.additionalControls || []), { category: 'Administrative', desc: ctrl, owner: session.name || session.email, status: 'Open' }];
                                                setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, additionalControls: next } });
                                                if (ctrlInput) ctrlInput.value = '';
                                            }
                                        }}
                                        className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold py-3 rounded-xl hover:bg-emerald-600 hover:text-white transition-colors uppercase tracking-widest"
                                    >
                                        Append Control
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mb-10 bg-slate-950 p-6 rounded-2xl border border-slate-800">
                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest block mb-4">Current Registered Controls</label>
                            <ul className="space-y-3">
                                {(editingHazardData.modifiedHazard.additionalControls || []).map((c, i) => (
                                    <li key={i} className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center group">
                                        <div className="flex items-center text-sm text-slate-300">
                                            <span className="text-[9px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded-lg mr-4 font-bold uppercase tracking-widest border border-blue-900">{c.category}</span>
                                            {c.desc}
                                        </div>
                                        <button type="button" onClick={() => { const next = editingHazardData.modifiedHazard.additionalControls.filter((_, idx) => idx !== i); setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, additionalControls: next } }); }} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center"><i className="fas fa-trash-alt"></i></button>
                                    </li>
                                ))}
                                {(!editingHazardData.modifiedHazard.additionalControls || editingHazardData.modifiedHazard.additionalControls.length === 0) && <li className="text-sm text-slate-500 italic p-6 bg-slate-900 rounded-xl border border-dashed border-slate-700 text-center">No additional controls listed.</li>}
                            </ul>
                        </div>

                        <div className="flex justify-end gap-4 pt-6 border-t border-slate-800">
                            <button type="button" onClick={() => setEditingHazardData(null)} className="px-8 py-4 bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-slate-700 transition-colors">Cancel</button>
                            <button type="button" onClick={saveLinkedHazard} disabled={saving} className="px-10 py-4 bg-emerald-600 text-white rounded-xl text-xs uppercase tracking-widest font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 flex items-center gap-3 transition-transform active:scale-95 disabled:opacity-50">
                                {saving ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-link text-lg"></i>}
                                Save & Link Incident
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {!useModularView && printData && (
                <div className="print-overlay p-8 bg-white text-black min-h-screen w-full absolute top-0 left-0 z-50">
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                        <div>
                            <div className="text-sm text-gray-500 font-bold mb-1">ISO 45001 OHSMS - FORMAL RECORD</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">INCIDENT INVESTIGATION REPORT</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold">Ref ID: {printData.id || 'DRAFT'}</p>
                            <p className="text-sm font-bold mt-1">Status: <span className="uppercase">{printData.capa && printData.capa.length > 0 && printData.capa.every((c) => c.status === 'Closed') ? 'Closed' : 'Open'}</span></p>
                        </div>
                    </div>

                    <div className="mb-6 border border-black p-4 bg-gray-50">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Initial Details</h2>
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-[15%] font-bold py-1">Incident Title:</td><td colSpan="3" className="w-[85%] py-1 font-bold text-lg">{printData.title}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-1">Site / Location:</td><td className="w-[35%] py-1">{printData.siteId} {printData.horizontalDeployment && '(Horizontal Deployment)'}</td>
                                    <td className="w-[15%] font-bold py-1">Date & Time:</td><td className="w-[35%] py-1">{printData.date} @ {printData.time || 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-1">Incident Type:</td><td className="w-[35%] py-1">{printData.type}</td>
                                    <td className="w-[15%] font-bold py-1">Severity Level:</td><td className="w-[35%] py-1">{printData.severity}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-1">Category:</td><td className="w-[35%] py-1">{printData.smartType}</td>
                                    <td className="w-[15%] font-bold py-1">Equipment Involved:</td><td className="w-[35%] py-1">{printData.equipmentInvolved || 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-1 border-t border-gray-300 mt-1 pt-2">Affected Person:</td>
                                    <td colSpan="3" className="w-[85%] py-1 border-t border-gray-300 mt-1 pt-2">
                                        {printData.affectedPersonName ? `${printData.affectedPersonName} (${printData.affectedPersonType})` : 'No Person Injured'}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 border border-black p-4">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Description of Event</h2>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{printData.description || 'No description provided.'}</div>
                    </div>

                    <div className="mb-6 border border-black p-4">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Immediate Actions Taken</h2>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{printData.immediateAction || 'No immediate actions documented.'}</div>
                    </div>

                    {printData.imageEvidence && (
                        <div className="mb-6 page-break-inside-avoid">
                            <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Photographic Evidence</h2>
                            <img src={printData.imageEvidence} className="max-h-[300px] border-2 border-black object-contain mt-2" alt="Evidence" />
                        </div>
                    )}

                    <div className="mb-6 border border-black p-4">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Investigation Team</h2>
                        <table className="w-full text-sm border-collapse border border-black mt-2">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border border-black p-2 text-left w-1/2">Name</th>
                                    <th className="border border-black p-2 text-left w-1/2">Role / Designation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(printData.investigationTeam || []).map((member, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-2 font-bold">{member.name} {member.userId === 'External' ? '(EXT)' : ''}</td>
                                        <td className="border border-black p-2">{member.role}</td>
                                    </tr>
                                ))}
                                {(!printData.investigationTeam || printData.investigationTeam.length === 0) && (
                                    <tr><td colSpan="2" className="border border-black p-4 text-center italic">No team members recorded.</td></tr>
                                )}
                            </tbody>
                        </table>

                        <h3 className="text-sm font-bold mt-4 mb-2 underline">Investigation Summary & Notes:</h3>
                        <div className="text-sm whitespace-pre-wrap">{printData.consultationSummary || 'No investigation notes recorded.'}</div>
                    </div>

                    <div className="page-break"></div>

                    <div className="mb-6">
                        <h2 className="text-lg font-black uppercase mb-4 border-b-2 border-black pb-2">3. Root Cause Analysis</h2>

                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.1 Final Root Cause Conclusion</h3>
                            <div className="border-2 border-black p-4 bg-gray-50 font-bold text-sm leading-relaxed">
                                {printData.investigation?.rootCause || 'Analysis incomplete.'}
                            </div>
                        </div>

                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.2 The 5-Whys Logic Paths</h3>
                            {printData.investigation?.fiveWhys?.map((path, index) => {
                                const validWhys = path.whys.filter(Boolean);
                                if (validWhys.length === 0) return null;
                                return (
                                    <div key={index} className="border border-gray-400 p-4 mb-4">
                                        <strong className="underline text-sm uppercase">{path.name}</strong>
                                        <ol className="list-decimal ml-6 mt-2 text-sm space-y-1">
                                            {validWhys.map((why, wIdx) => <li key={wIdx}>{why}</li>)}
                                        </ol>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.3 Fishbone Data Extracted</h3>
                            <table className="w-full text-sm border-collapse border border-black mt-2">
                                <tbody>
                                    {Object.entries(printData.investigation?.fishbone || {}).map(([k, v]) => {
                                        const valid = v.filter(Boolean);
                                        if (valid.length === 0) return null;
                                        return (
                                            <tr key={k}>
                                                <td className="border border-black p-2 w-1/4 font-bold uppercase bg-gray-50">{k}</td>
                                                <td className="border border-black p-2">{valid.join('; ')}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.4 Fault Tree Analysis</h3>
                            <div className="border border-black p-4 bg-gray-50 text-sm">
                                <ul className="list-none p-0 m-0">
                                    {printData.investigation?.faultTree ? renderPrintFaultTree(printData.investigation.faultTree) : <li>No fault tree data generated.</li>}
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mb-6 page-break-inside-avoid">
                        <h2 className="text-lg font-black uppercase mb-4 border-b-2 border-black pb-2">4. Corrective & Preventive Actions (CAPA)</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 text-left">Action Description</th>
                                    <th className="border border-black p-2 text-left w-[15%]">Site</th>
                                    <th className="border border-black p-2 text-left w-[20%]">Owner</th>
                                    <th className="border border-black p-2 w-[15%] text-center">Due Date</th>
                                    <th className="border border-black p-2 w-[15%] text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.capa && printData.capa.length > 0 ? printData.capa.map((c, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-2">{c.act}</td>
                                        <td className="border border-black p-2 font-bold text-gray-600">{c.siteId || printData.siteId}</td>
                                        <td className="border border-black p-2 font-bold">{c.own || 'Unassigned'}</td>
                                        <td className="border border-black p-2 text-center font-mono">{c.due}</td>
                                        <td className="border border-black p-2 text-center font-bold uppercase">{c.status}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="5" className="border border-black p-4 text-center italic">No CAPA items recorded.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 page-break-inside-avoid">
                        <h2 className="text-lg font-black uppercase mb-4 border-b-2 border-black pb-2">5. Review, Sign-Off & HIRA Linkage</h2>
                        <div className="border-2 border-black p-4 bg-gray-50 text-sm mb-12">
                            <div className="mb-4">
                                <strong className="text-base uppercase mr-2">Risk Assessment (HIRA) Reviewed & Updated:</strong>
                                <span className="font-bold border border-black px-2 py-1 bg-white">{printData.riskUpdated ? 'YES - CONFIRMED' : 'NO / PENDING'}</span>
                            </div>

                            {printData.linkedHazards && printData.linkedHazards.length > 0 && (
                                <div className="mt-4 border-t border-gray-300 pt-4">
                                    <strong className="underline uppercase block mb-2">Specific HIRA Records Updated Post-Incident:</strong>
                                    <ul className="list-disc pl-6 space-y-2">
                                        {printData.linkedHazards.map((link, i) => (
                                            <li key={i}>
                                                <strong>{link.raDocId}</strong> - {link.actName} ({link.category}).
                                                <em> New Residual Risk Score: <strong>{link.newRiskScore}</strong></em>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <table className="w-full border-none mt-16 text-sm">
                            <tbody>
                                <tr>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold">Investigator / Reporter Signature</td>
                                    <td className="w-[10%] border-none"></td>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold">Site Manager / EHS Lead Signature</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="text-center text-xs text-gray-500 mt-10 border-t border-gray-300 pt-4">Generated by WE EHS SAFETY TOOL | Document Control Date: {new Date().toLocaleString()}</div>
                </div>
            )}
        </div>
    );
}
