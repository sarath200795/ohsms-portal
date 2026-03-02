import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

// --- ENHANCED HSE SMART KNOWLEDGE BASE ---
const SMART_DB = {
    "Fire & Explosion": { keywords: ["fire", "burn", "smoke", "flame", "hot", "ignition", "combust", "explosion", "spark", "caught fire", "burnt"], fishbone: { man: ["Lack of fire training"], machine: ["Overheated equipment", "Faulty wiring"], material: ["Flammable liquids", "Waste buildup"], method: ["Hot work permit violation"], environment: ["High temp", "Dry conditions"] }, root_causes: ["Failure to control ignition sources", "Inadequate housekeeping & waste management"], five_whys: [{ id: 1, name: 'Ignition Source Path', whys: ["Combustible material ignited", "Sparks from hot work fell on waste", "No fire blanket used", "Hot work permit not issued", "Supervisor bypassed procedure"] }], fault_tree: { id: 1, label: "Fire Outbreak", type: "AND", children: [{ id: 2, label: "Ignition Source", type: "OR", children: [{ id: 3, label: "Sparks", type: "EVENT" }, { id: 4, label: "Electrical Fault", type: "EVENT" }] }, { id: 5, label: "Fuel Present", type: "EVENT" }] }, capa: ["Refresher Fire Safety Training", "Install auto-suppression system", "Audit Hot Work Permits"] },
    "COSHH / Chemical Exposure": { keywords: ["chemical", "spill", "leak", "acid", "fume", "toxic", "gas", "solvent", "liquid", "coshh", "inhal"], fishbone: { man: ["No PPE worn", "Improper handling"], machine: ["Valve failure", "Pump leak"], material: ["Defective container", "Wrong label"], method: ["Mixing error"], environment: ["Poor ventilation"] }, root_causes: ["Lack of COSHH assessment", "Inadequate preventative maintenance on transfer systems"], five_whys: [{ id: 1, name: 'Exposure Path', whys: ["Worker inhaled toxic fumes", "Ventilation system failed", "Extract fan motor seized", "Maintenance schedule missed", "No automated tracking system for maintenance"] }], fault_tree: { id: 1, label: "Chemical Exposure", type: "AND", children: [{ id: 2, label: "Loss of Containment", type: "OR", children: [{ id: 3, label: "Seal Failure", type: "EVENT" }, { id: 4, label: "Container Drop", type: "EVENT" }] }, { id: 5, label: "Worker in Area", type: "EVENT" }] }, capa: ["Install secondary containment (bunding)", "COSHH Awareness Training", "Review MSDS compliance", "Upgrade LEV extraction"] },
    "Asbestos": { keywords: ["asbestos", "acm", "fibre", "dust", "insulation", "lagging", "mesothelioma"], fishbone: { man: ["Unaware of ACMs"], machine: ["Drilling into walls"], material: ["Old insulation"], method: ["No asbestos register check"], environment: ["Older building"] }, root_causes: ["Failure to consult Asbestos Register prior to maintenance work"], five_whys: [{ id: 1, name: 'Disturbance Path', whys: ["Asbestos fibres released", "Worker drilled into lagging", "Did not know it contained asbestos", "Asbestos register not checked", "Permit to work process did not mandate check"] }], fault_tree: { id: 1, label: "Asbestos Exposure", type: "AND", children: [{ id: 2, label: "ACM Disturbed", type: "EVENT" }, { id: 3, label: "Inhalation of Fibres", type: "OR", children: [{ id: 4, label: "No RPE used", type: "EVENT" }, { id: 5, label: "No wet method", type: "EVENT" }] }] }, capa: ["Conduct full Asbestos Survey", "Implement Asbestos Permit to Work", "Asbestos Awareness Training"] },
    "Work at Height": { keywords: ["fall", "ladder", "scaffold", "roof", "height", "drop", "edge", "platform", "fragile"], fishbone: { man: ["Unsafe act", "No harness"], machine: ["Damaged ladder", "Scaffold defect"], material: ["Fragile roof lights"], method: ["No permit to work"], environment: ["Windy", "Slippery"] }, root_causes: ["Failure to plan work at height safely", "Inadequate fall protection or edge protection"], five_whys: [{ id: 1, name: 'Fall Path', whys: ["Worker fell from height", "Ladder slipped", "Ladder not tied off", "No tie-off point available", "Work planned without considering proper access equipment (MEWP)"] }], fault_tree: { id: 1, label: "Fall from Height", type: "AND", children: [{ id: 2, label: "Unstable Access", type: "OR", children: [{ id: 3, label: "Untied Ladder", type: "EVENT" }, { id: 4, label: "Fragile Roof", type: "EVENT" }] }, { id: 5, label: "No Fall Arrest System", type: "EVENT" }] }, capa: ["Enforce 100% tie-off policy", "Switch to MEWPs instead of ladders", "Weekly Scaffold Inspections"] },
    "Slips, Trips & Falls": { keywords: ["slip", "trip", "floor", "wet", "uneven", "cable", "obstruction", "ice", "housekeeping", "tripped", "slipped", "fell", "puddle"], fishbone: { man: ["Rushing", "Distracted (phone)"], machine: ["Leaking machine"], material: ["Spilled oil/water"], method: ["Poor housekeeping routines"], environment: ["Poor lighting", "Wet floor"] }, root_causes: ["Floor contamination not promptly cleaned", "Walkways obstructed due to lack of storage"], five_whys: [{ id: 1, name: 'Trip Path', whys: ["Employee tripped and fell", "Caught foot on trailing cable", "Cable stretched across walkway", "No floor sockets available", "Workspace design didn't account for equipment needs"] }], fault_tree: { id: 1, label: "Slip/Trip Event", type: "AND", children: [{ id: 2, label: "Hazard Present", type: "OR", children: [{ id: 3, label: "Wet Floor", type: "EVENT" }, { id: 4, label: "Trailing Cable", type: "EVENT" }] }, { id: 5, label: "Hazard Not Seen", type: "EVENT" }] }, capa: ["Implement clean-as-you-go policy", "Install Anti-slip flooring", "Cable Management Review"] },
    "Manual Handling": { keywords: ["lift", "back", "strain", "heavy", "twist", "spine", "load", "carrying", "ergonomic", "push", "pull"], fishbone: { man: ["Poor lifting technique", "Fatigue"], machine: ["No trolley/hoist available"], material: ["Heavy/Bulky load"], method: ["Lifting alone", "Repetitive motion"], environment: ["Cramped space", "Uneven floor"] }, root_causes: ["Failure to avoid manual handling operations", "Lack of mechanical lifting aids"], five_whys: [{ id: 1, name: 'Strain Path', whys: ["Employee suffered back strain", "Lifting a 25kg box", "Trolley was broken", "Not reported to maintenance", "No defect reporting culture"] }], fault_tree: { id: 1, label: "Musculoskeletal Injury", type: "AND", children: [{ id: 2, label: "High Exertion Force", type: "EVENT" }, { id: 3, label: "Poor Posture", type: "OR", children: [{ id: 4, label: "Twisting", type: "EVENT" }, { id: 5, label: "Bending", type: "EVENT" }] }] }, capa: ["Provide Mechanical Lifting Aids", "Manual Handling Assessment (MAC Tool)", "Manual Handling Training"] },
    "Machinery & Equipment": { keywords: ["guard", "cut", "crush", "entangle", "machine", "nip", "blade", "conveyor", "amputation", "loto", "tool"], fishbone: { man: ["Bypassed guard", "Loose clothing"], machine: ["Missing guard", "E-stop failure"], material: ["Jammed workpiece"], method: ["Maintenance on live machine"], environment: ["Poor lighting"] }, root_causes: ["Inadequate machine guarding", "Failure to follow Lockout/Tagout (LOTO) procedures"], five_whys: [{ id: 1, name: 'Contact Path', whys: ["Operator cut hand", "Reached into moving machine", "Interlock guard was overridden", "To clear a jam quickly", "Production pressure encouraged bypassing safety"] }], fault_tree: { id: 1, label: "Contact with Moving Part", type: "AND", children: [{ id: 2, label: "Access to Danger Zone", type: "EVENT" }, { id: 3, label: "Machine Running", type: "OR", children: [{ id: 4, label: "No LOTO", type: "EVENT" }, { id: 5, label: "Interlock Failure", type: "EVENT" }] }] }, capa: ["Full Machine Guarding Audit", "LOTO Training & Lock Provision", "Daily Pre-start checks"] },
    "Workplace Transport / Vehicles": { keywords: ["vehicle", "forklift", "truck", "flt", "reverse", "collision", "hit", "driver", "pedestrian", "crush", "run over"], fishbone: { man: ["Speeding", "Blind spot", "No seatbelt"], machine: ["Brake failure", "No reverse alarm"], material: ["Unstable load blocking vision"], method: ["No pedestrian segregation"], environment: ["Busy yard", "Poor weather"] }, root_causes: ["Lack of pedestrian and vehicle segregation", "Inadequate traffic management plan"], five_whys: [{ id: 1, name: 'Collision Path', whys: ["Forklift struck pedestrian", "Driver didn't see pedestrian", "Load was carried too high", "Driver untrained on specific load types", "Training matrix not updated"] }], fault_tree: { id: 1, label: "Vehicle/Pedestrian Collision", type: "AND", children: [{ id: 2, label: "Vehicle in Area", type: "EVENT" }, { id: 3, label: "Pedestrian in Area", type: "EVENT" }, { id: 4, label: "No Segregation Barrier", type: "EVENT" }] }, capa: ["Install Physical Pedestrian Barriers", "Implement designated walkways", "Forklift Refresher Training"] },
    "Electrical Safety": { keywords: ["electric", "shock", "wire", "cable", "voltage", "panel", "fuse", "short", "arc", "electrocution"], fishbone: { man: ["Unqualified person", "Did not test for dead"], machine: ["Exposed live wire"], material: ["Water/moisture ingress"], method: ["Working live", "No isolation"], environment: ["Damp conditions"] }, root_causes: ["Equipment not PAT tested", "Failure to safely isolate electrical supplies"], five_whys: [{ id: 1, name: 'Shock Path', whys: ["Worker received electric shock", "Touched live exposed wire", "Cable outer sheath was damaged", "Run over by forklift previously", "Cables not protected in high traffic areas"] }], fault_tree: { id: 1, label: "Electric Shock", type: "AND", children: [{ id: 2, label: "Contact with Live Conductor", type: "EVENT" }, { id: 3, label: "Path to Ground", type: "OR", children: [{ id: 4, label: "No insulated mat", type: "EVENT" }, { id: 5, label: "Wet hands", type: "EVENT" }] }] }, capa: ["Implement routine PAT Testing", "Strict LOTO Lockout policy for electrical work", "Electrical Safety Training"] }
};
const SMART_CATEGORIES = Object.keys(SMART_DB);

// --- UTILITIES ---
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const safeArrayParse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) {
        return data.map((item, idx) => {
            if (item && typeof item === 'object') return { ...item, firebaseKey: String(idx) };
            return null;
        }).filter(Boolean);
    }
    if (typeof data !== 'object') return [];
    return Object.keys(data).reduce((acc, key) => {
        if (typeof data[key] === 'object' && data[key] !== null) acc.push({ ...data[key], firebaseKey: key });
        return acc;
    }, []);
};

// --- SUB-COMPONENTS ---
const UserSelect = ({ users, value, onChange, disabled, placeholder }) => (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white text-xs outline-none focus:border-blue-500">
        <option value="">{placeholder || 'Select User...'}</option>
        {users.map(u => <option key={u.id} value={u.name || u.email}>{u.name || u.email} ({u.role || 'User'})</option>)}
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
    const update = (cat, i, val) => { const arr = [...(data[cat] || [])]; arr[i] = val; onChange({ ...data, [cat]: arr }); };
    const add = (cat) => onChange({ ...data, [cat]: [...(data[cat] || []), ''] });
    const remove = (cat, i) => { const arr = [...(data[cat] || [])]; arr.splice(i, 1); onChange({ ...data, [cat]: arr }); };
    return (
        <div className="fishbone-container mt-8">
            <div className="spine"></div><div className="head">INCIDENT</div>
            <div className="ribs-top">
                <RibBox title="Man" cat="man" data={data} onAdd={add} onUpdate={update} onRemove={remove} disabled={disabled} />
                <RibBox title="Machine" cat="machine" data={data} onAdd={add} onUpdate={update} onRemove={remove} disabled={disabled} />
                <RibBox title="Material" cat="material" data={data} onAdd={add} onUpdate={update} onRemove={remove} disabled={disabled} />
            </div>
            <div className="ribs-bottom">
                <RibBox title="Method" cat="method" data={data} onAdd={add} onUpdate={update} onRemove={remove} disabled={disabled} />
                <RibBox title="Environment" cat="environment" data={data} onAdd={add} onUpdate={update} onRemove={remove} disabled={disabled} />
                <div style={{ width: '18%' }}></div>
            </div>
        </div>
    );
};

const FaultTreeNode = ({ node, onUpdate, onDelete, onAddSibling, disabled }) => {
    if (!node) return null;
    const handleAddChild = () => { onUpdate({ ...node, children: [...(node.children || []), { id: Date.now(), label: 'New Cause', type: 'EVENT', children: [] }] }); };
    const toggleType = () => { const types = ['EVENT', 'AND', 'OR', 'ROOT']; onUpdate({ ...node, type: types[(types.indexOf(node.type) + 1) % types.length] }); };
    const updateChild = (i, d) => { const k = [...(node.children || [])]; k[i] = d; onUpdate({ ...node, children: k }); };
    const deleteChild = (i) => { onUpdate({ ...node, children: (node.children || []).filter((_, x) => x !== i) }); };
    const addSiblingToChild = () => { onUpdate({ ...node, children: [...(node.children || []), { id: Date.now(), label: 'Parallel Cause', type: 'EVENT', children: [] }] }); };

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
                <input value={node.label || ''} onChange={e => onUpdate({ ...node, label: e.target.value })} disabled={disabled} className="bg-transparent text-center text-xs font-bold w-full outline-none border-b border-transparent focus:border-blue-500 pb-1" placeholder="Event..." />
                {!disabled && <div onClick={toggleType} className="mt-1 cursor-pointer select-none no-print"><span className={`text-[9px] px-1.5 rounded font-mono border ${node.type === 'AND' ? 'border-purple-500 text-purple-400' : node.type === 'OR' ? 'border-orange-500 text-orange-400' : node.type === 'ROOT' ? 'border-emerald-500 text-emerald-400' : 'border-slate-600 text-slate-500'}`}>{node.type || 'EVENT'}</span></div>}
                <div className="hidden print:block text-[8px] font-bold text-center mt-1">[{node.type || 'EVENT'}]</div>
            </div>
            {node.children && node.children.length > 0 && <ul>{node.children.map((child, i) => (<FaultTreeNode key={child.id || i} node={child} onUpdate={d => updateChild(i, d)} onDelete={() => deleteChild(i)} onAddSibling={addSiblingToChild} disabled={disabled} />))}</ul>}
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
                    {node.children.map(child => renderPrintFaultTree(child))}
                </ul>
            )}
        </li>
    );
};

// --- REPOSITORY VIEW COMPONENT ---
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
        return incidents.filter(item => {
            const matchType = filterType === 'All' || item.type === filterType;
            const matchLevel = filterLevel === 'All' || item.severity === filterLevel;
            let matchDate = true;
            if (dateFrom && dateTo) { matchDate = item.date >= dateFrom && item.date <= dateTo; }
            return matchType && matchLevel && matchDate;
        });
    }, [incidents, filterType, filterLevel, dateFrom, dateTo]);

    const stats = useMemo(() => {
        let total = 0, closed = 0, open = 0;
        incidents.forEach(inc => {
            if (inc.capa) {
                inc.capa.forEach(act => {
                    total++;
                    if (act.status === 'Closed') closed++;
                    else open++;
                });
            }
        });
        return { total, closed, open };
    }, [incidents]);

    const exportToExcel = () => {
        const dataToExport = filteredData.map(({ id, date, time, siteId, type, severity, description }) => ({ ID: id, Date: date, Time: time, Site: siteId, Type: type, Severity: severity, Description: description }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Incidents");
        XLSX.writeFile(wb, "Incident_Repository.xlsx");
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
                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500" /></div>
                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500" /></div>

                    <div>
                        <label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Site Filter</label>
                        <select value={siteFilter} onChange={handleSiteFilterChange} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500">
                            {(isGlobalUser || uniqueSites.length > 1) && <option value="All">All Sites</option>}
                            {uniqueSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                    </div>

                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Type</label><select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500"><option value="All">All Types</option><option>Near Miss</option><option>Property Damage</option><option>First Aid injury</option><option>Lost Time injury</option><option>Reportable Injury</option></select></div>
                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Severity</label><select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500"><option value="All">All Levels</option><option value="Level A">Level A</option><option value="Level B">Level B</option><option value="Level C">Level C</option><option value="Level D">Level D</option></select></div>
                </div>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700 shadow-xl">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-xs uppercase font-bold text-slate-500 border-b border-slate-800">
                        <tr><th className="p-4">Incident ID</th><th className="p-4">Date</th><th className="p-4">Type</th><th className="p-4">CAPA Progress</th><th className="p-4 text-center">HIRA Linked</th><th className="p-4 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {filteredData.map(inc => {
                            const total = inc.capa ? inc.capa.length : 0;
                            const closed = inc.capa ? inc.capa.filter(c => c.status === 'Closed').length : 0;
                            const progress = total > 0 ? (closed / total) * 100 : 0;

                            const canEditRow = permissions.canEditCreate && (isGlobalUser || uniqueSites.some(s => s.code === inc.siteId));

                            return (
                                <tr key={inc.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4 font-mono font-bold text-white">{inc.id}</td>
                                    <td className="p-4">{inc.date}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-200">{inc.type}</div>
                                        <div className={`text-[10px] uppercase font-bold ${inc.severity === 'Level A' ? 'text-emerald-400' : inc.severity === 'Level B' ? 'text-blue-400' : inc.severity === 'Level C' ? 'text-orange-400' : 'text-red-500'}`}>{inc.severity}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex justify-between text-[10px] mb-1 font-bold"><span>{closed}/{total} Closed</span><span>{Math.round(progress)}%</span></div>
                                        <div className="w-full bg-slate-800 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${progress}%` }}></div></div>
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

// ==========================================
// MAIN INCIDENTS COMPONENT
// ==========================================
export default function Incidents() {
    const navigate = useNavigate();
    const location = useLocation();

    const [fbReady, setFbReady] = useState(false);
    const [view, setView] = useState('repo');
    const [step, setStep] = useState(1);
    const [session, setSession] = useState(null);

    // Database Data
    const [incidentsList, setIncidentsList] = useState([]);
    const [riskAssessments, setRiskAssessments] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);

    // Logic States
    const [seq, setSeq] = useState(0);
    const [permissions, setPermissions] = useState({ viewOnly: false, canEditOwnedActions: false, canDelete: false, canEditCreate: false });
    const [printData, setPrintData] = useState(null);
    const [saving, setSaving] = useState(false);

    // Filter States
    const [siteFilter, setSiteFilter] = useState('All');

    // HIRA Linkage States
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [matchedHazards, setMatchedHazards] = useState([]);
    const [editingHazardData, setEditingHazardData] = useState(null);

    // Team Management States
    const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
    const [externalName, setExternalName] = useState('');

    // CAPA Form State
    const [newCapaAct, setNewCapaAct] = useState('');
    const [newCapaOwn, setNewCapaOwn] = useState('');
    const [newCapaDue, setNewCapaDue] = useState('');
    const [newCapaSite, setNewCapaSite] = useState('');

    // THE MASTER INCIDENT DATA OBJECT
    const [data, setData] = useState({
        id: '', siteId: '', date: new Date().toISOString().split('T')[0], time: '',
        type: 'Near Miss', equipmentInvolved: '', description: '', immediateAction: '', smartType: 'Fire & Explosion', severity: 'Level A',
        imageEvidence: null, consultationSummary: '',
        investigationTeam: [],
        investigation: {
            fiveWhys: [{ id: 1, name: 'Analysis Path 1', whys: ['', '', '', '', ''] }],
            fishbone: { man: [], machine: [], material: [], method: [], environment: [] },
            faultTree: { id: 1, label: 'Top Event', type: 'AND', children: [] },
            rootCause: ''
        },
        capa: [], linkedHazards: [], riskUpdated: false,
        horizontalDeployment: false, // <-- NEW FLAG
        manualOverrides: { type: false, severity: false, smartType: false }
    });

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || (sess.accessibleModules || []).includes('Incidents');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission to access the Incidents module.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(sess.role);
        const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(sess.role);

        setPermissions({
            viewOnly: !canEditCr,
            canEditOwnedActions: true,
            canDelete: canDel,
            canEditCreate: canEditCr
        });

        const newSeq = Math.floor(100000 + Math.random() * 900000);
        setSeq(newSeq);

        const params = new URLSearchParams(location.search);
        const urlSite = params.get('site');

        let storedSite = sessionStorage.getItem('isoCurrentSite');
        if (storedSite === 'GLOBAL') storedSite = 'All';

        let ctxSite = urlSite || storedSite || 'All';

        if (!isGlobalAdmin && ctxSite === 'All') {
            ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
        }

        setSiteFilter(ctxSite);
        sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);

        setData(prev => ({ ...prev, siteId: ctxSite !== 'All' ? ctxSite : ((sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : '') }));

        const loadDatabases = async () => {
            try {
                const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                const snap = await get(dbRef);

                let fetchedUsers = [];

                if (snap.exists()) {
                    const orgData = snap.val();

                    if (orgData.sites) {
                        setSites(Object.keys(orgData.sites).map(key => ({
                            code: orgData.sites[key].code || key,
                            name: orgData.sites[key].name || key
                        })));
                    }

                    if (orgData.incidents) {
                        const parsed = safeArrayParse(orgData.incidents);
                        setIncidentsList(parsed.map(inc => ({
                            ...inc,
                            investigation: inc.investigation || { fiveWhys: [], fishbone: {}, faultTree: null, rootCause: '' }
                        })));
                    }
                    if (orgData.riskAssessments) setRiskAssessments(Object.entries(orgData.riskAssessments).map(([k, v]) => ({ firebaseKey: k, ...v })));

                    if (orgData.users) {
                        fetchedUsers = Object.entries(orgData.users).map(([k, v]) => ({ id: k, ...v })).filter(u => u.status !== 'Inactive');
                    }
                }

                if (!fetchedUsers.find(u => u.email === sess.email || u.name === sess.user)) {
                    fetchedUsers.push({
                        id: sess.uid || 'current-user', name: sess.name || sess.email?.split('@')[0] || 'Me',
                        email: sess.email, role: sess.role || 'Owner', assignedSite: 'GLOBAL'
                    });
                }
                setUsers(fetchedUsers);
                setFbReady(true);
            } catch (err) { console.error("Error loading databases:", err); }
        };
        loadDatabases();
    }, [navigate, location]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set([session.assignedSite, ...(session.accessibleSites || [])].filter(Boolean));
        if (!isGlobalUser) {
            codes.delete('GLOBAL');
            codes.delete('All');
        }
        return codes;
    }, [session, isGlobalUser]);

    const allowedSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const visibleIncidents = useMemo(() => {
        return incidentsList.filter(i => {
            return isGlobalUser || allowedSiteCodes.has(i.siteId);
        });
    }, [incidentsList, isGlobalUser, allowedSiteCodes]);

    const siteUsers = useMemo(() => {
        return users.filter(u => {
            const isGlobalUsr = ['Owner', 'Global Owner', 'Global Manager', 'Admin'].includes(u.role) || u.assignedSite === 'GLOBAL' || (u.accessibleSites && u.accessibleSites.includes('GLOBAL'));
            if (data.horizontalDeployment) return true; // Can assign to anyone globally if horizontal
            const targetSite = newCapaSite || data.siteId;
            const siteMatch = isGlobalUsr || !targetSite || u.assignedSite === targetSite || (u.accessibleSites && u.accessibleSites.includes(targetSite));
            return siteMatch;
        });
    }, [users, data.siteId, newCapaSite, data.horizontalDeployment]);

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!data.siteId) return true;
        return allowedSiteCodes.has(data.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, data.siteId]);

    const getTypeCode = (type) => {
        if (type === 'Near Miss') return 'NM';
        if (type === 'Property Damage') return 'PD';
        if (type === 'First Aid injury') return 'FIR';
        if (type === 'Lost Time injury') return 'LTIR';
        if (type === 'Reportable Injury') return 'RIR';
        return 'XX';
    };

    useEffect(() => {
        if (session && !data.firebaseKey && canEditForm) {
            const sId = data.siteId ? data.siteId : 'GEN';
            const typeCode = getTypeCode(data.type);
            const matchingRecords = incidentsList.filter(i => i.siteId === sId && getTypeCode(i.type) === typeCode);
            const srNo = String(matchingRecords.length + 1).padStart(3, '0');
            const newId = `${sId}-${typeCode}-${srNo}`;
            setData(prev => ({ ...prev, id: newId }));
        }
    }, [data.siteId, data.type, session, canEditForm, incidentsList]);

    const handleDescriptionBlur = () => {
        if (!data.description || data.description.trim() === '') return;
        const lower = data.description.toLowerCase();
        let updates = {};

        if (!data.manualOverrides?.smartType) {
            let bestMatch = null;
            let maxScore = 0;
            for (const category in SMART_DB) {
                let score = 0;
                const keywords = SMART_DB[category].keywords || [];
                keywords.forEach(word => {
                    const isPhrase = word.includes(' ');
                    const regex = new RegExp(`\\b${word}\\b`, 'i');
                    if (regex.test(lower) || (isPhrase && lower.includes(word))) {
                        score += isPhrase ? 3 : 1;
                    }
                });
                if (score > maxScore) { maxScore = score; bestMatch = category; }
            }
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
            setData(prev => ({ ...prev, ...updates }));
        }
    };

    const applySmartSuggestions = () => {
        const dynamicGen = generateDynamicInvestigation(data.description, data.smartType);
        if (dynamicGen) {
            let newData = {
                ...data,
                investigation: {
                    ...data.investigation,
                    fishbone: dynamicGen.fishbone,
                    rootCause: dynamicGen.rootCause,
                    fiveWhys: dynamicGen.fiveWhys,
                    faultTree: dynamicGen.faultTree
                }
            };

            if (dynamicGen.capa && dynamicGen.capa.length > 0) {
                const existingActions = (newData.capa || []).map(c => c.act);
                const newActions = dynamicGen.capa.filter(c => !existingActions.includes(c.action)).map(c => ({
                    act: c.action, siteId: data.siteId, own: '', due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], status: 'Open'
                }));
                newData.capa = [...(data.capa || []), ...newActions];
            }

            setData(newData);
            alert("Analysis & CAPA Plan Auto-Generated based on description!");
        }
    };

    const handleAddTeamMember = (type) => {
        if (type === 'external') {
            if (!externalName.trim()) return alert("Enter external member name.");
            if ((data.investigationTeam || []).some(a => a.name.toLowerCase() === externalName.trim().toLowerCase())) return alert("Member is already in the list.");
            const newMember = { userId: 'External', name: externalName.trim(), role: 'External Investigator / Contractor' };
            setData(prev => ({ ...prev, investigationTeam: [...(prev.investigationTeam || []), newMember] }));
            setExternalName('');
        } else {
            if (!selectedUserToAdd) return;
            const userObj = users.find(u => u.id === selectedUserToAdd || u.name === selectedUserToAdd || u.email === selectedUserToAdd);
            if ((data.investigationTeam || []).some(a => a.name === (userObj ? (userObj.name || userObj.email) : selectedUserToAdd))) return alert("Employee is already in the list.");
            const newMember = { userId: userObj ? userObj.id : 'Internal', name: userObj ? (userObj.name || userObj.email) : selectedUserToAdd, role: userObj ? (userObj.designation || userObj.role) : 'Employee' };
            setData(prev => ({ ...prev, investigationTeam: [...(prev.investigationTeam || []), newMember] }));
            setSelectedUserToAdd('');
        }
    };

    const removeTeamMember = (index) => {
        setData(prev => ({ ...prev, investigationTeam: (prev.investigationTeam || []).filter((_, i) => i !== index) }));
    };

    const generateDynamicInvestigation = (description, category) => {
        const lowerDesc = description.toLowerCase();
        let dynFishbone = { man: [], machine: [], material: [], method: [], environment: [] };
        let dynWhys = ["Incident occurred", "", "", "", ""];
        let dynTreeChildren = [];
        let dynCapa = [];
        let matched = false;

        if (/\b(slip|slipped|wet|spill|water|oil|puddle)\b/.test(lowerDesc)) {
            dynFishbone.environment.push(/\b(weather|rain|ice|snow)\b/.test(lowerDesc) ? "Adverse weather conditions" : "Wet / Slippery surface");
            dynFishbone.method.push("Inadequate spill response / Housekeeping");
            dynWhys[1] = "Surface lost traction";
            dynWhys[2] = "Contamination was present on walkway";
            dynTreeChildren.push({ id: Date.now() + 1, label: "Loss of Traction", type: "EVENT" });
            dynCapa.push({ action: "Review local housekeeping schedules", responsible: "", deadline: "", status: "Open" });
            matched = true;
        }
        if (/\b(machine|guard|cut|tool|crush|nip)\b/.test(lowerDesc)) {
            dynFishbone.machine.push("Potential equipment failure or bypassed safeguard");
            dynWhys[1] = "Operator came into contact with hazard";
            dynTreeChildren.push({ id: Date.now() + 2, label: "Equipment Hazard", type: "EVENT" });
            dynCapa.push({ action: "Inspect equipment guarding and interlocks", responsible: "", deadline: "", status: "Open" });
            matched = true;
        }
        if (/\b(training|new|unaware|did not know|untrained)\b/.test(lowerDesc)) {
            dynFishbone.man.push("Lack of task-specific training or awareness");
            dynWhys[3] = "Operator was unaware of the correct safe method";
            dynCapa.push({ action: "Update training matrix & conduct refresher", responsible: "", deadline: "", status: "Open" });
            matched = true;
        }

        for (let i = 0; i < 5; i++) { if (!dynWhys[i]) dynWhys[i] = "Investigate further..."; }

        if (matched) {
            return {
                fishbone: dynFishbone,
                rootCause: "Combination of factors requiring specific investigation.",
                fiveWhys: [{ id: Date.now(), name: 'Description Auto-Path', whys: dynWhys }],
                faultTree: { id: Date.now(), label: "Top Event", type: "AND", children: dynTreeChildren },
                capa: dynCapa
            };
        } else if (SMART_DB[category]) {
            const catData = SMART_DB[category];
            return {
                fishbone: JSON.parse(JSON.stringify(catData.fishbone)),
                rootCause: catData.root_causes.join('. '),
                fiveWhys: catData.five_whys ? JSON.parse(JSON.stringify(catData.five_whys)) : [{ id: 1, name: 'Path 1', whys: ["", "", "", "", ""] }],
                faultTree: catData.fault_tree ? JSON.parse(JSON.stringify(catData.fault_tree)) : { id: 1, label: "Top Event", type: "AND", children: [] },
                capa: catData.capa ? catData.capa.map(c => ({ action: c, responsible: "", deadline: "", status: "Open" })) : []
            };
        }
        return null;
    };

    // --- HORIZONTAL EXPLOSION FOR INCIDENTS ---
    const saveData = async () => {
        if (!canEditForm) return alert("Security Error: You do not have permission to create or edit incidents for this site.");
        if (!data.siteId) { alert("Please select a Site"); return; }

        setSaving(true);
        try {
            const cleanCapa = (data.capa || []).filter(c => c.act && c.act.trim() !== '');
            let explodedCapa = [];

            if (data.horizontalDeployment) {
                const uniqueActionDesc = [...new Set(cleanCapa.map(a => a.act))];
                uniqueActionDesc.forEach(desc => {
                    const template = cleanCapa.find(a => a.act === desc);
                    sites.forEach(site => {
                        const existing = cleanCapa.find(a => a.act === desc && (a.siteId === site.code || (!a.siteId && data.siteId === site.code)));
                        if (existing) {
                            explodedCapa.push({ ...existing, siteId: site.code });
                        } else {
                            explodedCapa.push({ act: desc, siteId: site.code, own: 'Unassigned', due: template.due, status: 'Open' });
                        }
                    });
                });
            } else {
                explodedCapa = cleanCapa.map(a => ({ ...a, siteId: a.siteId || data.siteId }));
            }

            const cleanLinks = data.linkedHazards || [];

            const payload = JSON.parse(JSON.stringify({
                ...data,
                capa: explodedCapa, // Saved exploded capabilities
                linkedHazards: cleanLinks,
                timestamp: new Date().toISOString(),
                reportedBy: session.user || session.name || session.email
            }));

            if (data.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/incidents/${data.firebaseKey}`), payload);
                alert(data.horizontalDeployment ? "Horizontal Deployment Updated. Actions pushed globally!" : "Incident Saved Successfully!");
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/incidents`), payload);
                alert(data.horizontalDeployment ? "Horizontal Deployment Active. CAPAs deployed globally!" : "Incident Saved Successfully!");
            }

            const dbRef = ref(rtdb, `organizations/${session.orgId}/incidents`);
            const snap = await get(dbRef);
            if (snap.exists()) {
                setIncidentsList(Object.entries(snap.val()).map(([k, v]) => ({ firebaseKey: k, ...v })));
            }
            setView('repo');
        } catch (e) {
            alert("Save failed: " + e.message);
        }
        setSaving(false);
    };

    const handleDeleteRecord = async (incident) => {
        if (!permissions.canDelete) return alert("Security Error: Only Global Owners and Site Owners can permanently delete records.");
        if (window.confirm("Permanently delete incident?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/incidents/${incident.firebaseKey}`));
            setIncidentsList(prev => prev.filter(i => i.firebaseKey !== incident.firebaseKey));
        }
    };

    const handleEdit = (incident) => {
        let updatedWhys = incident.investigation?.fiveWhys || [{ id: 1, name: 'Analysis Path 1', whys: ['', '', '', '', ''] }];
        if (Array.isArray(updatedWhys) && typeof updatedWhys[0] === 'string') {
            updatedWhys = [{ id: Date.now(), name: 'Legacy Analysis', whys: updatedWhys }];
        }
        setData({
            ...incident,
            horizontalDeployment: incident.horizontalDeployment || false,
            investigation: { ...incident.investigation, fiveWhys: updatedWhys },
            manualOverrides: { type: true, severity: true, smartType: true }
        });
        setView('form');
        setStep(1);
    };

    const triggerPrint = (dataObj) => {
        let updatedWhys = dataObj.investigation?.fiveWhys || [{ id: 1, name: 'Analysis Path 1', whys: ['', '', '', '', ''] }];
        if (Array.isArray(updatedWhys) && typeof updatedWhys[0] === 'string') {
            updatedWhys = [{ id: Date.now(), name: 'Legacy Analysis', whys: updatedWhys }];
        }
        const formattedData = { ...dataObj, investigation: { ...dataObj.investigation, fiveWhys: updatedWhys } };
        setPrintData(formattedData);
        setTimeout(() => window.print(), 800);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (file) { const base64 = await fileToBase64(file); setData({ ...data, imageEvidence: base64 }); }
    };

    const scanHiraDatabase = () => {
        if (!data.siteId) return alert("Please select a Site in Step 1 first.");
        if (!data.description || data.description.length < 10) return alert("Please write a detailed incident description in Step 1 to extract keywords.");

        const keywords = data.description.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 3);
        const matches = [];

        riskAssessments.filter(ra => ra.siteId === data.siteId).forEach(ra => {
            (ra.activities || []).forEach((act, actIdx) => {
                (act.hazards || []).forEach((haz, hazIdx) => {
                    let score = 0;
                    const textToSearch = `${haz.category} ${haz.subCategory} ${haz.desc}`.toLowerCase();

                    keywords.forEach(kw => {
                        if (textToSearch.includes(kw)) score++;
                    });

                    if (score > 0) {
                        matches.push({
                            raKey: ra.firebaseKey, raDocId: ra.docId, raName: ra.assessmentName || 'Unnamed HIRA',
                            actIdx, hazIdx, actName: act.name, hazard: haz, score
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
        if (!editingHazardData) return;
        setSaving(true);
        try {
            const { raKey, actIdx, hazIdx, modifiedHazard, raDocId, actName } = editingHazardData;

            const currentRA = riskAssessments.find(r => r.firebaseKey === raKey) || {};
            const currentLogs = currentRA.changeLogs || [];
            const newLog = {
                date: new Date().toISOString(),
                user: session.name || session.user || 'Admin',
                source: 'Incident Investigation',
                reason: `System Auto-Log: Controls modified post-incident review (Incident ID: ${data.id || 'Draft'})`
            };

            const updates = {};
            updates[`activities/${actIdx}/hazards/${hazIdx}`] = modifiedHazard;
            updates[`changeLogs`] = [...currentLogs, newLog];

            await update(ref(rtdb, `organizations/${session.orgId}/riskAssessments/${raKey}`), updates);

            const linkRecord = {
                raDocId,
                actName,
                category: modifiedHazard.category,
                subCategory: modifiedHazard.subCategory,
                newRiskScore: modifiedHazard.r2,
                reviewDate: new Date().toISOString().split('T')[0]
            };

            setData(prev => ({
                ...prev,
                linkedHazards: [...(prev.linkedHazards || []), linkRecord],
                riskUpdated: true
            }));

            const updatedRAs = [...riskAssessments];
            const raIndex = updatedRAs.findIndex(r => r.firebaseKey === raKey);
            if (raIndex > -1) {
                updatedRAs[raIndex].activities[actIdx].hazards[hazIdx] = modifiedHazard;
                updatedRAs[raIndex].changeLogs = [...currentLogs, newLog];
                setRiskAssessments(updatedRAs);
            }

            alert("HIRA Updated and Linked Successfully! Change logged to Risk Revision History.");
            setEditingHazardData(null);
            setSearchModalOpen(false);

        } catch (e) { alert("Failed to update HIRA: " + e.message); }
        setSaving(false);
    };

    const addFiveWhyPath = () => { const newCount = data.investigation?.fiveWhys?.length + 1 || 1; setData(prev => ({ ...prev, investigation: { ...prev.investigation, fiveWhys: [...(prev.investigation?.fiveWhys || []), { id: Date.now(), name: `Analysis Path ${newCount}`, whys: ['', '', '', '', ''] }] } })); };
    const updateFiveWhy = (pIdx, wIdx, val) => { const paths = [...data.investigation.fiveWhys]; paths[pIdx].whys[wIdx] = val; setData(prev => ({ ...prev, investigation: { ...prev.investigation, fiveWhys: paths } })); };
    const updatePathName = (pIdx, val) => { const paths = [...data.investigation.fiveWhys]; paths[pIdx].name = val; setData(prev => ({ ...prev, investigation: { ...prev.investigation, fiveWhys: paths } })); };
    const removeFiveWhyPath = (idx) => { setData(prev => ({ ...prev, investigation: { ...prev.investigation, fiveWhys: prev.investigation.fiveWhys.filter((_, i) => i !== idx) } })); };

    const addCapa = () => {
        if (newCapaAct) {
            setData({ ...data, capa: [...(data.capa || []), { act: newCapaAct, siteId: newCapaSite || data.siteId, own: newCapaOwn, due: newCapaDue, status: 'Open' }] });
            setNewCapaAct('');
            setNewCapaOwn('');
            setNewCapaDue('');
            setNewCapaSite('');
        } else {
            alert("Action Description is required to add a CAPA.");
        }
    };

    const removeCapa = (idx) => {
        const newCapa = data.capa.filter((_, i) => i !== idx);
        setData({ ...data, capa: newCapa });
    };

    const canEditCapa = (row) => {
        if (canEditForm) return true;
        if (permissions.viewOnly && permissions.canEditOwnedActions && row.own === (session?.name || session?.user || session?.email)) return true;
        return false;
    };

    if (!fbReady) return (
        <div className="h-screen flex items-center justify-center bg-slate-950 text-white font-['Space_Grotesk']">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-red-500 rounded-full animate-spin mb-4 mr-4"></div>
            Loading Incident Engine...
        </div>
    );

    const STEPS = [{ id: 1, label: 'Initial' }, ...(data.severity !== 'Level D' ? [{ id: 2, label: 'Team & Details' }] : []), { id: 3, label: 'Investigate' }, { id: 4, label: 'CAPA' }, { id: 5, label: 'Review & HIRA' }];

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative print:h-auto print:overflow-visible">
            <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none no-print"></div>

            <div className="app-ui flex flex-col h-full relative z-10 no-print">
                <header className="h-20 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/50 backdrop-blur-md shadow-md">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
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
                            <button type="button" onClick={() => { setView('form'); setStep(1); setData({ id: '', siteId: (!isGlobalUser && allowedSites.length === 1) ? allowedSites[0].code : (siteFilter !== 'All' ? siteFilter : ''), date: new Date().toISOString().split('T')[0], time: '', type: 'Near Miss', equipmentInvolved: '', description: '', immediateAction: '', smartType: 'Fire & Explosion', severity: 'Level A', imageEvidence: null, consultationSummary: '', investigationTeam: [], investigation: { fiveWhys: [{ id: 1, name: 'Analysis Path 1', whys: ['', '', '', '', ''] }], fishbone: { man: [], machine: [], material: [], method: [], environment: [] }, faultTree: { id: 1, label: 'Top Event', type: 'AND', children: [] }, rootCause: '' }, capa: [], linkedHazards: [], riskUpdated: false, horizontalDeployment: false, manualOverrides: { type: false, severity: false, smartType: false } }); }} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'form' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>New Report</button>
                        )}
                        <button type="button" onClick={() => setView('repo')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'repo' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>Repository</button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 w-full print:overflow-visible custom-scroll">
                    {view === 'repo' ? (
                        <div className="max-w-7xl mx-auto">
                            <IncidentRepository incidents={visibleIncidents} onEdit={handleEdit} onPrint={triggerPrint} onDelete={handleDeleteRecord} permissions={permissions} siteFilter={siteFilter} setSiteFilter={setSiteFilter} uniqueSites={allowedSites} isGlobalUser={isGlobalUser} />
                        </div>
                    ) : (
                        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

                            <div className="flex gap-2 mb-8 form-view-tabs bg-slate-900/40 p-2 rounded-2xl border border-slate-800 backdrop-blur-sm shadow-xl">
                                {STEPS.map((s, i) => (
                                    <button key={s.id} type="button" onClick={() => setStep(s.id)} className={`flex-1 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${step === s.id ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 scale-[1.02]' : 'bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
                                        <span className="opacity-50 mr-1">{i + 1}.</span> {s.label}
                                    </button>
                                ))}
                            </div>

                            {/* --- STEP 1 --- */}
                            {step === 1 && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <h2 className="text-xl font-bold text-red-400 mb-8 flex items-center gap-3 border-b border-red-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-clipboard-list text-2xl"></i> 1. Initial Report Details</h2>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Site ID</label>
                                            <select value={data.siteId} onChange={e => setData({ ...data, siteId: e.target.value })} disabled={!canEditForm || (!isGlobalUser && allowedSites.length <= 1)} className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-lg text-white text-xs outline-none focus:border-red-500">
                                                {(isGlobalUser || allowedSites.length > 1) && <option value="">Select Authorized Site...</option>}
                                                {allowedSites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                                            </select>
                                        </div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Date</label><input type="date" value={data.date} onChange={e => setData({ ...data, date: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-white text-xs outline-none focus:border-red-500" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Time</label><input type="time" value={data.time} onChange={e => setData({ ...data, time: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-white text-xs outline-none focus:border-red-500" /></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Record ID</label><input value={data.id} className="w-full bg-slate-950/50 border border-slate-800 p-2.5 rounded-lg text-slate-500 text-xs font-mono" disabled /></div>

                                        <div><label className="text-[10px] uppercase font-bold text-purple-400 ml-1 mb-2 block">Smart Category (AI)</label><select value={data.smartType} onChange={e => setData({ ...data, smartType: e.target.value, manualOverrides: { ...data.manualOverrides, smartType: true } })} disabled={!canEditForm} className="w-full bg-purple-900/10 border border-purple-500/30 p-2.5 rounded-lg text-purple-300 font-bold text-xs outline-none focus:border-purple-500">{SMART_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>

                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Incident Type</label><select value={data.type} onChange={e => setData({ ...data, type: e.target.value, manualOverrides: { ...data.manualOverrides, type: true } })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-white text-xs outline-none focus:border-red-500"><option>Near Miss</option><option>Property Damage</option><option>First Aid injury</option><option>Lost Time injury</option><option>Reportable Injury</option></select></div>
                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Severity</label><select value={data.severity} onChange={e => setData({ ...data, severity: e.target.value, manualOverrides: { ...data.manualOverrides, severity: true } })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-white text-xs outline-none focus:border-red-500"><option>Level A</option><option>Level B</option><option>Level C</option><option>Level D</option></select></div>

                                        <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Equipment</label><input value={data.equipmentInvolved} onChange={e => setData({ ...data, equipmentInvolved: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-white text-xs outline-none focus:border-red-500" placeholder="e.g., Forklift" /></div>
                                    </div>

                                    <div className="mb-6">
                                        <label className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 ml-1">
                                            Description of Event
                                            {!data.manualOverrides?.smartType && <span className="text-purple-400 animate-pulse bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/30 tracking-widest"><i className="fas fa-robot mr-1"></i> AI Auto-Classify on blur</span>}
                                        </label>
                                        <textarea rows="4" value={data.description} onChange={e => setData({ ...data, description: e.target.value })} onBlur={handleDescriptionBlur} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-purple-500 outline-none shadow-inner" disabled={!canEditForm} placeholder="Describe the incident in detail. Click outside this box when finished to auto-classify..."></textarea>
                                    </div>
                                    <div className="mb-6">
                                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-2 ml-1">Immediate Actions Taken</label>
                                        <textarea rows="3" value={data.immediateAction} onChange={e => setData({ ...data, immediateAction: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-red-500 outline-none shadow-inner" disabled={!canEditForm} placeholder="What was done immediately to secure the scene or treat the injured?"></textarea>
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
                                </div>
                            )}

                            {/* --- STEP 2 --- */}
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
                                                            <select value={selectedUserToAdd} onChange={e => setSelectedUserToAdd(e.target.value)} className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-teal-500 text-white">
                                                                <option value="">Select Employee...</option>
                                                                {siteUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>)}
                                                            </select>
                                                            <button type="button" onClick={() => handleAddTeamMember('internal')} className="bg-teal-600 hover:bg-teal-500 text-white px-4 rounded-lg text-sm font-bold shadow-lg transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Add External Contractor/Expert</label>
                                                        <div className="flex gap-2">
                                                            <input value={externalName} onChange={e => setExternalName(e.target.value)} placeholder="Type Name..." className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-purple-500 text-white" />
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
                                            <textarea className="w-full flex-1 bg-slate-900 border border-slate-700 p-5 rounded-xl text-white focus:border-teal-500 outline-none resize-none custom-scroll text-sm shadow-inner min-h-[300px]" value={data.consultationSummary} onChange={e => setData({ ...data, consultationSummary: e.target.value })} placeholder="Summarize the investigation details, witness statements, and initial findings here..." disabled={!canEditForm}></textarea>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- STEP 3 --- */}
                            {step === 3 && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <div className="flex justify-between items-center mb-8 border-b border-purple-500/20 pb-4">
                                        <h2 className="text-xl font-bold text-purple-400 flex items-center gap-3 uppercase tracking-widest"><i className="fas fa-search-location text-2xl"></i> 3. Root Cause Analysis</h2>
                                        {canEditForm && (
                                            <button type="button" onClick={applySmartSuggestions} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-lg shadow-purple-600/20 flex items-center gap-2 transition-transform active:scale-95 uppercase tracking-widest">
                                                <i className="fas fa-wand-magic-sparkles"></i> AI Auto-Analyze
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-12">
                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                                            <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs flex items-center"><i className="fas fa-fish text-blue-400 mr-2"></i> Fishbone Diagram</h3>
                                            <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 overflow-x-auto">
                                                <Fishbone data={data.investigation?.fishbone || { man: [], machine: [], material: [], method: [], environment: [] }} onChange={fb => setData({ ...data, investigation: { ...data.investigation, fishbone: fb } })} disabled={!canEditForm} />
                                            </div>
                                        </div>

                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                                            <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs flex items-center"><i className="fas fa-project-diagram text-orange-400 mr-2"></i> Fault Tree Analysis</h3>
                                            <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 overflow-x-auto tree">
                                                <ul className="m-0 p-0"><FaultTreeNode node={data.investigation?.faultTree || { id: 1, label: 'Top Event', type: 'AND', children: [] }} onUpdate={rt => setData({ ...data, investigation: { ...data.investigation, faultTree: rt } })} disabled={!canEditForm} /></ul>
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
                                                            <input value={path.name || `Analysis Path ${pIdx + 1}`} onChange={e => updatePathName(pIdx, e.target.value)} disabled={!canEditForm} className="bg-transparent text-xs font-bold text-purple-400 uppercase tracking-widest outline-none border-b border-transparent focus:border-purple-500 w-full transition-all" />
                                                            {canEditForm && data.investigation.fiveWhys.length > 1 && <button type="button" onClick={() => removeFiveWhyPath(pIdx)} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/10 hover:bg-red-500 w-8 h-8 rounded flex items-center justify-center no-print ml-4"><i className="fas fa-trash-alt"></i></button>}
                                                        </div>
                                                        <div className="space-y-3">
                                                            {path.whys?.map((w, i) => (
                                                                <div key={i} className="flex gap-4 items-center">
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-12 text-right border-r border-slate-700 pr-3">Why {i + 1}</span>
                                                                    <input className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white focus:border-purple-500 outline-none" value={w} onChange={e => updateFiveWhy(pIdx, i, e.target.value)} disabled={!canEditForm} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-emerald-950/30 p-6 rounded-2xl border border-emerald-900/50">
                                            <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-bullseye mr-2"></i> Final Root Cause Conclusion</label>
                                            <textarea rows="4" value={data.investigation?.rootCause || ''} onChange={e => setData({ ...data, investigation: { ...(data.investigation || {}), rootCause: e.target.value } })} disabled={!canEditForm} className="w-full bg-emerald-900/10 border border-emerald-500/30 rounded-xl p-5 text-sm text-emerald-100 focus:border-emerald-500 outline-none resize-none shadow-inner" placeholder="State the conclusive root cause based on the analysis above..."></textarea>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- STEP 4 --- */}
                            {step === 4 && (
                                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                                    <h2 className="text-xl font-bold text-orange-400 mb-8 flex items-center gap-3 border-b border-orange-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-list-check text-2xl"></i> 4. CAPA Plan</h2>

                                    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">

                                        {/* HORIZONTAL DEPLOYMENT TOGGLE */}
                                        <div className="col-span-1 md:col-span-5 mt-2 bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl flex items-center justify-between shadow-inner mb-6">
                                            <div>
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input type="checkbox" checked={data.horizontalDeployment || false} onChange={e => setData({ ...data, horizontalDeployment: e.target.checked })} disabled={!canEditForm} className="w-5 h-5 accent-blue-500 cursor-pointer" />
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
                                                    <input value={newCapaAct} onChange={e => setNewCapaAct(e.target.value)} placeholder="Describe action..." className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white focus:border-orange-500 outline-none" />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Target Site</label>
                                                    <select value={newCapaSite} onChange={e => setNewCapaSite(e.target.value)} disabled={data.horizontalDeployment} className={`w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white outline-none focus:border-orange-500 ${data.horizontalDeployment && 'opacity-50'}`}>
                                                        <option value="">{data.horizontalDeployment ? 'All Sites' : 'Default'}</option>
                                                        {!data.horizontalDeployment && sites.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Owner</label>
                                                    <UserSelect users={siteUsers} value={newCapaOwn} onChange={v => setNewCapaOwn(v)} disabled={false} placeholder="Assign to..." />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Due Date</label>
                                                    <input type="date" value={newCapaDue} onChange={e => setNewCapaDue(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white focus:border-orange-500 outline-none" />
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
                                                            <td className="p-5"><input className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-orange-500 text-xs py-1 outline-none text-white font-medium" value={c.act} onChange={e => { const n = [...data.capa]; n[i].act = e.target.value; setData({ ...data, capa: n }); }} disabled={!canEditCapa(c)} /></td>
                                                            <td className="p-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                                {data.horizontalDeployment ? <span className="bg-blue-900/30 text-blue-400 px-2 py-1 rounded border border-blue-500/30">All Sites</span> : (c.siteId || data.siteId)}
                                                            </td>
                                                            <td className="p-5 text-blue-400 font-bold"><UserSelect users={siteUsers} value={c.own} onChange={v => { const n = [...data.capa]; n[i].own = v; setData({ ...data, capa: n }); }} disabled={!canEditCapa(c)} /></td>
                                                            <td className="p-5"><input type="date" className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-orange-500 text-[10px] py-1 outline-none font-mono" value={c.due} onChange={e => { const n = [...data.capa]; n[i].due = e.target.value; setData({ ...data, capa: n }); }} disabled={!canEditCapa(c)} /></td>
                                                            <td className="p-5">
                                                                {canEditCapa(c) ? (
                                                                    <select value={c.status} onChange={e => { const newCapa = [...data.capa]; newCapa[i].status = e.target.value; setData({ ...data, capa: newCapa }); }} className={`w-full bg-slate-950 text-xs px-3 py-2 rounded-lg outline-none border font-bold ${c.status === 'Closed' ? 'text-emerald-400 border-emerald-500/30' : c.status === 'In Progress' ? 'text-blue-400 border-blue-500/30' : 'text-orange-400 border-orange-500/30'}`}>
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
                                </div>
                            )}

                            {/* --- STEP 5 --- */}
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
                    )}
                </div>
            </div>

            {/* --- MODALS FOR SMART HIRA LINKING --- */}
            {searchModalOpen && !editingHazardData && (
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

            {editingHazardData && (
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
                                    <div className="flex-1"><label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">Probability (P)</label><select value={editingHazardData.modifiedHazard.p2} onChange={e => {
                                        const p2 = parseInt(e.target.value);
                                        const s2 = editingHazardData.modifiedHazard.s2;
                                        setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, p2, r2: p2 * s2 } });
                                    }} className="w-full bg-slate-950 text-sm p-3 rounded-xl border border-slate-700 outline-none focus:border-orange-500 text-white"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
                                    <div className="flex-1"><label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">Severity (S)</label><select value={editingHazardData.modifiedHazard.s2} onChange={e => {
                                        const s2 = parseInt(e.target.value);
                                        const p2 = editingHazardData.modifiedHazard.p2;
                                        setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, s2, r2: p2 * s2 } });
                                    }} className="w-full bg-slate-950 text-sm p-3 rounded-xl border border-slate-700 outline-none focus:border-orange-500 text-white"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
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
                                    <button type="button" onClick={() => {
                                        const ctrl = document.getElementById('new-hira-ctrl').value;
                                        if (ctrl) {
                                            const n = [...(editingHazardData.modifiedHazard.additionalControls || []), { category: 'Administrative', desc: ctrl, owner: session.name || session.email, status: 'Open' }];
                                            setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, additionalControls: n } });
                                            document.getElementById('new-hira-ctrl').value = '';
                                        }
                                    }} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold py-3 rounded-xl hover:bg-emerald-600 hover:text-white transition-colors uppercase tracking-widest">Append Control</button>
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
                                        <button type="button" onClick={() => {
                                            const n = editingHazardData.modifiedHazard.additionalControls.filter((_, idx) => idx !== i);
                                            setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, additionalControls: n } });
                                        }} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center"><i className="fas fa-trash-alt"></i></button>
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

            {/* --- DEDICATED PRINT OVERLAY --- */}
            {printData && (
                <div className="print-overlay p-8 bg-white text-black min-h-screen w-full absolute top-0 left-0 z-50">
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                        <div>
                            <div className="text-sm text-gray-500 font-bold mb-1">ISO 45001 OHSMS - FORMAL RECORD</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">INCIDENT INVESTIGATION REPORT</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold">Ref ID: {printData.id || 'DRAFT'}</p>
                            <p className="text-sm font-bold mt-1">Status: <span className="uppercase">{printData.capa && printData.capa.length > 0 && printData.capa.every(c => c.status === 'Closed') ? 'Closed' : 'Open'}</span></p>
                        </div>
                    </div>

                    <div className="mb-6 border border-black p-4 bg-gray-50">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Initial Details</h2>
                        <table className="w-full text-sm border-none">
                            <tbody>
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
                    <div className="text-center text-xs text-gray-500 mt-10 border-t border-gray-300 pt-4">Generated by OHSMS Enterprise Portal | Document Control Date: {new Date().toLocaleString()}</div>
                </div>
            )}
        </div>
    );
}