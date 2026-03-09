import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

// --- SMART HIRA KNOWLEDGE BASE & DICTIONARIES ---
const defaultElec = { who: "Electricians, Operators", controls: [{ type: "Elimination", desc: "Isolate power source" }, { type: "Engineering", desc: "RCD / ELCB installed" }, { type: "Administrative", desc: "LOTO procedure" }, { type: "PPE", desc: "Arc flash suit and insulated gloves" }] };
const defaultTher = { who: "Workers, Occupants", controls: [{ type: "Elimination", desc: "Remove combustibles" }, { type: "Engineering", desc: "Thermal insulation/shields" }, { type: "Administrative", desc: "Hot Work Permit" }, { type: "PPE", desc: "Heat resistant gloves" }] };
const defaultGrav = { who: "Workers at height, Staff below", controls: [{ type: "Elimination", desc: "Work from ground level" }, { type: "Engineering", desc: "Guardrails/Edge protection" }, { type: "Administrative", desc: "Exclusion zones below" }, { type: "PPE", desc: "Fall arrest harness" }] };
const defaultMach = { who: "Machine Operators", controls: [{ type: "Elimination", desc: "Automate process" }, { type: "Engineering", desc: "Fixed interlocked guards" }, { type: "Administrative", desc: "Pre-use checks" }, { type: "PPE", desc: "No loose clothing/jewelry" }] };
const defaultRad = { who: "Specialist Staff", controls: [{ type: "Elimination", desc: "Use non-radioactive methods" }, { type: "Engineering", desc: "Lead shielding / Enclosures" }, { type: "Administrative", desc: "Limit exposure time / Dosimeters" }, { type: "PPE", desc: "Specialist shielded PPE" }] };
const defaultVeh = { who: "Drivers, Pedestrians", controls: [{ type: "Elimination", desc: "Complete pedestrian segregation" }, { type: "Engineering", desc: "Speed limiters / Sensors" }, { type: "Administrative", desc: "Traffic management plan" }, { type: "PPE", desc: "High visibility clothing" }] };
const defaultBio = { who: "Cleaners, First Aiders", controls: [{ type: "Elimination", desc: "Avoid contaminated areas" }, { type: "Engineering", desc: "Bio-hazard disposal bins" }, { type: "Administrative", desc: "Vaccinations & Hygiene protocols" }, { type: "PPE", desc: "Nitrile gloves and face shields" }] };
const defaultChem = { who: "Chemical Handlers", controls: [{ type: "Substitution", desc: "Use less hazardous alternative" }, { type: "Engineering", desc: "Local Exhaust Ventilation (LEV)" }, { type: "Administrative", desc: "COSHH Assessment" }, { type: "PPE", desc: "Chemical suit and respirator" }] };
const defaultErgo = { who: "Manual Workers", controls: [{ type: "Elimination", desc: "Automated lifting equipment" }, { type: "Engineering", desc: "Adjustable workstations" }, { type: "Administrative", desc: "Job rotation / Kinetic lifting training" }, { type: "PPE", desc: "Ergonomic floor mats" }] };
const defaultEnv = { who: "All Staff", controls: [{ type: "Elimination", desc: "Remove source of noise/vibration" }, { type: "Engineering", desc: "Acoustic enclosures / HVAC" }, { type: "Administrative", desc: "Monitor exposure limits" }, { type: "PPE", desc: "Ear defenders / warm clothing" }] };
const defaultPsy = { who: "All Staff", controls: [{ type: "Elimination", desc: "Redesign work patterns" }, { type: "Engineering", desc: "Panic buttons (Violence)" }, { type: "Administrative", desc: "EAP & regular check-ins" }, { type: "Administrative", desc: "Zero tolerance policy" }] };

const HAZARD_DICTIONARY = {
    "Electrical": { "Broken plugs, sockets, switches": defaultElec, "Electrical exposed to liquids": defaultElec, "Electromagnetic phenomena": defaultElec, "Exposed wiring/cords": defaultElec, "Fixed installations": defaultElec, "High voltage": defaultElec, "Live parts": defaultElec, "Incorrect wiring": defaultElec, "Insulation damage": defaultElec, "Low voltage": defaultElec, "Overloading": defaultElec, "Rodent damage": defaultElec, "Short circuit": defaultElec, "Thermal radiation": defaultElec, "Other": defaultElec },
    "Thermal": { "Explosion": defaultTher, "Fire/Flame": defaultTher, "Radiation from heat source": defaultTher, "Contact with hot objects": defaultTher, "Contact with cold objects": defaultTher, "Hot works (e.g., welding)": defaultTher, "Other": defaultTher },
    "Gravity_Access": { "Confined space": defaultGrav, "Excavations": defaultGrav, "Falling/moving object or structure": defaultGrav, "Obstruction of": defaultGrav, "Projection of": defaultGrav, "Suspended load": defaultGrav, "Uneven or slippery surfaces": defaultGrav, "Working at height": defaultGrav, "Other": defaultGrav },
    "Equipment_Machine": { "Acceleration, deceleration": defaultMach, "Air or high pressure fluid injection": defaultMach, "Caught by": defaultMach, "Crushed by": defaultMach, "Drawing in": defaultMach, "Elastic elements": defaultMach, "Entangled by": defaultMach, "Equipment malfunction": defaultMach, "Friction/abrasion": defaultMach, "Instability": defaultMach, "Machine/mobility": defaultMach, "Puncture/sever": defaultMach, "Rough surface": defaultMach, "Severed by": defaultMach, "Slippery surface": defaultMach, "Struck by": defaultMach, "Unexpected start": defaultMach, "Other": defaultMach },
    "Radiation": { "Extra low frequency (ELF) radiation": defaultRad, "Infrared radiation": defaultRad, "Interference from other equipment": defaultRad, "Ionizing radiation (alpha, beta or gamma ray)": defaultRad, "Lasers": defaultRad, "LGACs Laser generated air contaminants": defaultRad, "Low frequency electromagnetic radiation": defaultRad, "Other non-ionizing radiation": defaultRad, "Un-ionized arc-rays": defaultRad, "Ultraviolet radiation": defaultRad, "Microwave radiation": defaultRad, "Radiofrequency radiation": defaultRad, "Visible light": defaultRad, "Other": defaultRad },
    "Motorized_Vehicle_Operation": { "Intersection (PIT/Pedestrian)": defaultVeh, "Intersection (PIT/Vehicle)": defaultVeh, "Intersection (PIT/PIT)": defaultVeh, "Intersection (PIT/Object)": defaultVeh, "Intersection (Vehicle/Pedestrian)": defaultVeh, "Intersection (Vehicle/Vehicle)": defaultVeh, "Intersection (Vehicle/Object)": defaultVeh, "Poor road conditions": defaultVeh, "Poor vehicle design": defaultVeh, "Vehicle malfunction": defaultVeh, "Other": defaultVeh },
    "Biological": { "Bites by": defaultBio, "Bacteria and viruses": defaultBio, "Blood or other bodily fluids": defaultBio, "Contaminated drinking water": defaultBio, "Contaminated sharps or equipment": defaultBio, "Fungi/molds": defaultBio, "Human waste": defaultBio, "Stung by": defaultBio, "Other": defaultBio },
    "Chemical": { "Asbestos": defaultChem, "Carcinogenic substances": defaultChem, "Combustible materials": defaultChem, "Compressed gas": defaultChem, "Contaminated drinking water": defaultChem, "Corrosives": defaultChem, "Dust": defaultChem, "Enriched oxygen environment (>23.5% oxygen)": defaultChem, "Explosives": defaultChem, "Fibers": defaultChem, "Flammables": defaultChem, "Fluid": defaultChem, "Fumes and vapors": defaultChem, "Low oxygen environment (<19.5% oxygen)": defaultChem, "Mist": defaultChem, "Mutagenic or teratogenic substances": defaultChem, "Oxidizer": defaultChem, "Pharmaceuticals": defaultChem, "Poisons": defaultChem, "Smoking": defaultChem, "Vehicle exhausts": defaultChem, "Other": defaultChem },
    "Ergonomic": { "Awkward posture (technique)": defaultErgo, "Design/location of controls": defaultErgo, "Effort/force/exertion": defaultErgo, "Head room/clearance": defaultErgo, "Manual handling": defaultErgo, "Mechanical handling": defaultErgo, "Poor housekeeping": defaultErgo, "Poor lighting and glare": defaultErgo, "Poor workstation design": defaultErgo, "Repetition/repetitive movement": defaultErgo, "Restricted access": defaultErgo, "Slippery surface": defaultErgo, "Sustained/static postures": defaultErgo, "Other": defaultErgo },
    "Noise_Vibration_Work_Env": { "Combustible material": defaultEnv, "Flammable material": defaultEnv, "Humidity": defaultEnv, "Poor lighting": defaultEnv, "Mobile equipment": defaultEnv, "Moving parts": defaultEnv, "Noise": defaultEnv, "Over-crowding": defaultEnv, "Poor ventilation": defaultEnv, "Scraping surfaces": defaultEnv, "Speed of process": defaultEnv, "Temperature - High": defaultEnv, "Temperature - Low": defaultEnv, "Vibration": defaultEnv, "Other": defaultEnv },
    "Psychosocial": { "Bullying": defaultPsy, "Criminal or malicious intent": defaultPsy, "Conflicting demands": defaultPsy, "Distraction": defaultPsy, "Discrimination": defaultPsy, "Harassment": defaultPsy, "High/low work demand": defaultPsy, "Inadequate rest breaks": defaultPsy, "Inadequate staffing": defaultPsy, "Interpersonal issues": defaultPsy, "Intimidation": defaultPsy, "Job insecurity": defaultPsy, "Lack of role clarity": defaultPsy, "Low control": defaultPsy, "Personal medical condition": defaultPsy, "Poor communication": defaultPsy, "Poorly managed change": defaultPsy, "Poor support": defaultPsy, "Remote/isolated work": defaultPsy, "Social support and conflict": defaultPsy, "Terrorism": defaultPsy, "Violence in the workplace": defaultPsy, "Work duration or shift pattern": defaultPsy, "Other": defaultPsy }
};

const HAZARD_CATS = Object.keys(HAZARD_DICTIONARY);
const PROBABILITY = [{ v: 1, l: '1 - Rare' }, { v: 2, l: '2 - Unlikely' }, { v: 3, l: '3 - Possible' }, { v: 4, l: '4 - Likely' }, { v: 5, l: '5 - Almost Certain' }];
const SEVERITY = [{ v: 1, l: '1 - Negligible' }, { v: 2, l: '2 - Minor' }, { v: 3, l: '3 - Moderate' }, { v: 4, l: '4 - Major' }, { v: 5, l: '5 - Catastrophic' }];
const CHANGE_SOURCES = ["Incident Investigation", "Management of Change", "Annual Review", "Audit Finding", "Process Update", "Other"];

const getRiskClass = (score) => {
    if (score >= 15) return 'bg-red-900 text-white border border-red-500';
    if (score >= 10) return 'bg-red-500 text-white border border-red-400';
    if (score >= 5) return 'bg-yellow-500 text-black border border-yellow-400';
    return 'bg-emerald-500 text-white border border-emerald-400';
};

const getRiskStyle = (score) => {
    if (score >= 15) return { backgroundColor: '#7f1d1d', color: 'white' };
    if (score >= 10) return { backgroundColor: '#ef4444', color: 'white' };
    if (score >= 5) return { backgroundColor: '#eab308', color: 'black' };
    return { backgroundColor: '#10b981', color: 'white' };
};

// --- UTILITIES ---
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

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
        {(data[cat] || []).map((v, i) => (
            <div key={i} className="flex group mb-1 items-center">
                <input value={v} onChange={(e) => onUpdate(cat, i, e.target.value)} disabled={disabled} className="w-full bg-transparent text-[10px] border-b border-slate-700 mb-1 outline-none text-white print:text-black focus:border-blue-500" />
                {!disabled && <button type="button" onClick={() => onRemove(cat, i)} className="text-red-400 bg-red-400/10 hover:bg-red-500 hover:text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] ml-1 no-print transition-colors" title="Delete">x</button>}
            </div>
        ))}
    </div>
);

const Fishbone = ({ data, onChange, disabled }) => {
    const update = (cat, i, val) => { const arr = [...data[cat]]; arr[i] = val; onChange({ ...data, [cat]: arr }); };
    const add = (cat) => onChange({ ...data, [cat]: [...(data[cat] || []), ''] });
    const remove = (cat, i) => { const arr = [...data[cat]]; arr.splice(i, 1); onChange({ ...data, [cat]: arr }); };
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

// ==========================================
// SUB-COMPONENT: HAZARD ROW
// ==========================================
const HazardRow = ({ idx, hIdx, haz, updateHazard, removeHazard, handleCategoryChange, handleSubCategoryChange, users, canEdit }) => {

    const manuallyAddExistingControl = () => {
        const type = document.getElementById(`ext-type-${haz.id}`).value;
        const desc = document.getElementById(`ext-desc-${haz.id}`).value;
        if (desc) {
            const updatedArray = [...(Array.isArray(haz.existingControls) ? haz.existingControls : []), { type, desc }];
            updateHazard(idx, hIdx, 'existingControls', updatedArray);
            document.getElementById(`ext-desc-${haz.id}`).value = '';
        }
    };

    const removeExistingControl = (cIdx) => {
        updateHazard(idx, hIdx, 'existingControls', haz.existingControls.filter((_, i) => i !== cIdx));
    };

    const addSuggestedToExisting = (suggestionObj) => {
        const safeArray = Array.isArray(haz.existingControls) ? haz.existingControls : [];
        if (safeArray.some(c => c.desc === suggestionObj.desc)) return;
        updateHazard(idx, hIdx, 'existingControls', [...safeArray, suggestionObj]);
    };

    const manuallyAddAdditionalControl = () => {
        const cat = document.getElementById(`add-type-${haz.id}`).value;
        const desc = document.getElementById(`add-desc-${haz.id}`).value;
        const own = document.getElementById(`add-own-${haz.id}`).value || 'Unassigned';
        if (desc) {
            const updatedArray = [...(Array.isArray(haz.additionalControls) ? haz.additionalControls : []), { category: cat, desc, owner: own, status: 'Open' }];
            updateHazard(idx, hIdx, 'additionalControls', updatedArray);
            document.getElementById(`add-desc-${haz.id}`).value = '';
        }
    };

    const removeAdditionalControl = (cIdx) => {
        updateHazard(idx, hIdx, 'additionalControls', haz.additionalControls.filter((_, i) => i !== cIdx));
    };

    const addSuggestedToAdditional = (suggestionObj) => {
        const safeArray = Array.isArray(haz.additionalControls) ? haz.additionalControls : [];
        if (safeArray.some(c => c.desc === suggestionObj.desc)) return;
        updateHazard(idx, hIdx, 'additionalControls', [...safeArray, { category: suggestionObj.type, desc: suggestionObj.desc, owner: 'Unassigned', status: 'Open' }]);
    };

    return (
        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-700 relative group shadow-inner">
            {canEdit && <button type="button" onClick={() => removeHazard(idx, hIdx)} className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-times text-lg"></i></button>}

            <div className="grid grid-cols-12 gap-4 mb-4 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-purple-400 uppercase block mb-1">Specific Location</label>
                    <input value={haz.location || ''} onChange={e => updateHazard(idx, hIdx, 'location', e.target.value)} disabled={!canEdit} placeholder="e.g. Ceiling, Pump Room" className="bg-slate-900 border border-slate-700 p-2 rounded text-sm w-full outline-none focus:border-purple-500 text-white" />
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-blue-400 uppercase block mb-1">Hazard Category</label>
                    <select value={haz.category} onChange={e => handleCategoryChange(idx, hIdx, e.target.value)} disabled={!canEdit} className="bg-slate-900 border border-slate-700 p-2 rounded text-sm focus:border-blue-500 w-full outline-none text-white">
                        <option value="">Select Category...</option>
                        {HAZARD_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-orange-400 uppercase block mb-1">Hazard Type</label>
                    <select value={haz.subCategory} onChange={e => handleSubCategoryChange(idx, hIdx, e.target.value)} disabled={!canEdit || !haz.category} className="bg-slate-900 border border-slate-700 p-2 rounded text-sm focus:border-orange-500 w-full outline-none text-white">
                        <option value="">Select Hazard...</option>
                        {haz.category && HAZARD_DICTIONARY[haz.category] && Object.keys(HAZARD_DICTIONARY[haz.category]).map(sc => <option key={sc} value={sc}>{sc}</option>)}
                    </select>
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Who Might Be Harmed?</label>
                    <input value={haz.who || ''} onChange={e => updateHazard(idx, hIdx, 'who', e.target.value)} disabled={!canEdit} placeholder="Operators..." className="bg-slate-900 border border-slate-700 p-2 rounded text-sm w-full outline-none text-white" />
                </div>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-700 pb-4">
                <div className="col-span-8 flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Description / Context</label>
                    <textarea rows="1" value={haz.desc} onChange={e => updateHazard(idx, hIdx, 'desc', e.target.value)} disabled={!canEdit} className="resize-none bg-slate-950 border border-slate-600 text-sm w-full focus:border-blue-500 p-2 rounded outline-none text-white"></textarea>
                </div>
                <div className="bg-slate-950 border border-slate-700 p-2 rounded flex gap-4 w-1/3 shadow">
                    <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Prob</label><select value={haz.p1} onChange={e => updateHazard(idx, hIdx, 'p1', parseInt(e.target.value))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-blue-500 rounded text-white">{PROBABILITY.map(p => <option key={p.v} value={p.v}>{p.v}</option>)}</select></div>
                    <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Sevr</label><select value={haz.s1} onChange={e => updateHazard(idx, hIdx, 's1', parseInt(e.target.value))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-blue-500 rounded text-white">{SEVERITY.map(s => <option key={s.v} value={s.v}>{s.v}</option>)}</select></div>
                    <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Risk</label><div className={`font-bold text-center text-sm ${getRiskClass(haz.r1)} rounded p-1`}>{haz.r1}</div></div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* EXISTING CONTROLS */}
                <div>
                    <label className="text-xs font-bold text-emerald-400 uppercase block mb-2 border-b border-emerald-500/20 pb-1">Existing Controls</label>

                    <div className="flex flex-col gap-2 mb-3 min-h-[40px]">
                        {(Array.isArray(haz.existingControls) ? haz.existingControls : []).map((c, i) => (
                            <div key={i} className="flex justify-between items-center bg-emerald-900/20 border border-emerald-700/30 px-3 py-2 rounded text-sm group">
                                <div className="flex items-center gap-2"><span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded font-bold border border-emerald-500/50">{c.type}</span><span className="text-slate-200">{c.desc}</span></div>
                                {canEdit && <button type="button" onClick={() => removeExistingControl(i)} className="text-emerald-700 hover:text-red-400 opacity-0 group-hover:opacity-100"><i className="fas fa-times"></i></button>}
                            </div>
                        ))}
                        {(!haz.existingControls || haz.existingControls.length === 0) && <span className="text-xs text-slate-600 italic px-2">No existing controls documented.</span>}
                    </div>

                    {canEdit && (
                        <div className="flex gap-2 mb-4">
                            <select id={`ext-type-${haz.id}`} className="text-[10px] w-28 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded"><option>Elimination</option><option>Substitution</option><option>Engineering</option><option>Administrative</option><option>PPE</option></select>
                            <input id={`ext-desc-${haz.id}`} className="text-xs flex-1 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded" placeholder="Add custom control..." />
                            <button type="button" onClick={manuallyAddExistingControl} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 rounded text-white font-bold transition-colors">+</button>
                        </div>
                    )}

                    {canEdit && haz.suggestedControls?.length > 0 && (
                        <div className="border-t border-slate-800 pt-2">
                            <span className="text-[9px] text-slate-500 uppercase font-bold block mb-2"><i className="fas fa-magic text-blue-400 mr-1"></i> Add from HSE Library</span>
                            <div className="flex flex-wrap gap-2">
                                {haz.suggestedControls.map((sug, i) => (
                                    <button key={i} type="button" onClick={() => addSuggestedToExisting(sug)} className="text-[10px] bg-slate-800 hover:bg-emerald-900/50 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 px-2 py-1 rounded border border-slate-700 transition-colors text-left flex items-center gap-1 shadow-sm">
                                        <i className="fas fa-plus"></i> <span className="text-blue-300 font-bold border border-blue-500/30 px-1 rounded">[{sug.type}]</span> {sug.desc}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ADDITIONAL CONTROLS / RESIDUAL */}
                <div className="border-l border-slate-700 pl-6 flex flex-col">
                    <div className="flex justify-between items-center mb-2 border-b border-orange-500/20 pb-1">
                        <label className="text-xs font-bold text-orange-400 uppercase">Additional Actions (CAPA)</label>
                        <label className="flex items-center gap-2 text-[10px] font-bold text-red-400 cursor-pointer">
                            <input type="checkbox" className="accent-red-500 w-3 h-3" checked={haz.alarp || false} onChange={e => updateHazard(idx, hIdx, 'alarp', e.target.checked)} disabled={!canEdit} /> Declare ALARP
                        </label>
                    </div>

                    {haz.alarp ? (
                        <div className="bg-red-900/10 border border-red-500/30 p-3 rounded mb-4">
                            <label className="text-[10px] text-red-400 font-bold block mb-1">ALARP Justification (Mandatory)</label>
                            <textarea placeholder="Why can't risk be reduced further?..." value={haz.alarpJustification || ''} onChange={e => updateHazard(idx, hIdx, 'alarpJustification', e.target.value)} disabled={!canEdit} className="w-full text-xs bg-slate-950 border border-red-500/50 text-white outline-none p-2 rounded" rows="2"></textarea>
                        </div>
                    ) : (
                        <div className="mb-4">
                            <div className="flex flex-col gap-2 mb-3 min-h-[40px]">
                                {(Array.isArray(haz.additionalControls) ? haz.additionalControls : []).map((c, i) => (
                                    <div key={i} className="flex flex-col bg-orange-900/20 border border-orange-700/30 px-3 py-2 rounded text-sm group relative">
                                        <div className="flex items-center gap-2 mb-1"><span className="text-[10px] bg-orange-900/50 text-orange-400 px-1.5 py-0.5 rounded font-bold border border-orange-500/50">{c.category}</span><span className="text-slate-200">{c.desc}</span></div>
                                        <div className="text-[10px] text-slate-500 pl-1"><i className="fas fa-user mr-1"></i> {c.owner}</div>
                                        {canEdit && <button type="button" onClick={() => removeAdditionalControl(i)} className="absolute top-2 right-2 text-orange-700 hover:text-red-400 opacity-0 group-hover:opacity-100"><i className="fas fa-times"></i></button>}
                                    </div>
                                ))}
                                {(!haz.additionalControls || haz.additionalControls.length === 0) && <span className="text-xs text-slate-600 italic px-2">No additional controls mapped.</span>}
                            </div>

                            {canEdit && (
                                <div className="flex gap-2 mb-4">
                                    <select id={`add-type-${haz.id}`} className="text-[10px] w-28 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded"><option>Elimination</option><option>Substitution</option><option>Engineering</option><option>Administrative</option><option>PPE</option></select>
                                    <input id={`add-desc-${haz.id}`} className="text-xs flex-1 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded" placeholder="Add custom action..." />
                                    <select id={`add-own-${haz.id}`} className="text-[10px] w-24 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded"><option value="">Owner</option>{users.map(u => <option key={u.id} value={u.name || u.email}>{u.name || u.email}</option>)}</select>
                                    <button type="button" onClick={manuallyAddAdditionalControl} className="bg-slate-700 hover:bg-slate-600 text-xs px-2 rounded text-white font-bold transition-colors">+</button>
                                </div>
                            )}

                            {canEdit && haz.suggestedControls?.length > 0 && (
                                <div className="border-t border-slate-800 pt-2">
                                    <span className="text-[9px] text-slate-500 uppercase font-bold block mb-2"><i className="fas fa-magic text-blue-400 mr-1"></i> Add from HSE Library</span>
                                    <div className="flex flex-col gap-1">
                                        {haz.suggestedControls.map((sug, i) => (
                                            <button key={i} type="button" onClick={() => addSuggestedToAdditional(sug)} className="text-[10px] bg-slate-800 hover:bg-orange-900/50 hover:border-orange-500/50 text-slate-300 hover:text-orange-300 px-2 py-1.5 rounded border border-slate-700 transition-colors text-left flex items-center gap-2 shadow-sm">
                                                <i className="fas fa-plus"></i> <span className="font-bold w-16 truncate text-blue-300 border border-blue-500/30 px-1 rounded text-center">[{sug.type}]</span> <span className="truncate">{sug.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Residual Risk Score */}
                    <div className="bg-slate-950 border border-slate-700 p-2 rounded flex gap-4 shadow mt-auto">
                        <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Res. Prob</label><select value={haz.p2} onChange={e => updateHazard(idx, hIdx, 'p2', parseInt(e.target.value))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-orange-500 rounded text-white">{PROBABILITY.map(p => <option key={p.v} value={p.v}>{p.v}</option>)}</select></div>
                        <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Res. Sevr</label><select value={haz.s2} onChange={e => updateHazard(idx, hIdx, 's2', parseInt(e.target.value))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-orange-500 rounded text-white">{SEVERITY.map(s => <option key={s.v} value={s.v}>{s.v}</option>)}</select></div>
                        <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Res. Risk</label><div className={`font-bold text-center text-sm ${getRiskClass(haz.r2)} rounded p-1`}>{haz.r2}</div></div>
                    </div>
                    {haz.r2 > 8 && !haz.alarp && <div className="text-[10px] text-red-500 font-bold text-center mt-2 animate-pulse">Warning: Residual risk remains high. Must declare ALARP or add controls.</div>}
                </div>
            </div>
        </div>
    );
};

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function Risk() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Data states
    const [repo, setRepo] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);

    // View states
    const [view, setView] = useState('list');
    const [printData, setPrintData] = useState(null);

    // Filter States
    const [filterSite, setFilterSite] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [importing, setImporting] = useState(false);

    // RBAC States
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });

    // Form state
    const [formData, setFormData] = useState({
        id: '', assessmentName: '', siteId: '', location: '', date: new Date().toISOString().split('T')[0], status: 'Draft',
        team: [{ name: '', role: '' }],
        activities: [],
        changeLogs: []
    });

    // Change Log Modal State
    const [showChangeModal, setShowChangeModal] = useState(false);
    const [changeDetails, setChangeDetails] = useState({ source: 'Annual Review', reason: '' });

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        // ==========================================
        // 1. STRICT MODULE GUARD
        // ==========================================
        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || (sess.accessibleModules || []).includes('Risk Assessment');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission to access the Risk Assessment module.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        // ==========================================
        // 2. STRICT RBAC MATRIX
        // ==========================================
        const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(sess.role);
        const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(sess.role);

        setPermissions({
            viewOnly: !canEditCr,
            canDelete: canDel,
            canEditCreate: canEditCr
        });

        // ==========================================
        // 3. SYNCHRONIZED SITE PERSISTENCE
        // ==========================================
        const params = new URLSearchParams(location.search);
        const urlSite = params.get('site');

        let storedSite = sessionStorage.getItem('isoCurrentSite');
        if (storedSite === 'GLOBAL') storedSite = 'All';

        let ctxSite = urlSite || storedSite || 'All';

        if (!isGlobalAdmin && ctxSite === 'All') {
            ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
        }

        setFilterSite(ctxSite);
        sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);
        setFormData(f => ({ ...f, siteId: ctxSite !== 'All' ? ctxSite : ((sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : '') }));

        const fetchAll = async () => {
            try {
                const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                const snap = await get(dbRef);
                if (snap.exists()) {
                    const val = snap.val();
                    if (val.riskAssessments) {
                        const parsedAssessments = Object.keys(val.riskAssessments).map(k => {
                            const v = val.riskAssessments[k];
                            const acts = Array.isArray(v.activities) ? v.activities : (v.activities ? Object.values(v.activities) : []);
                            const safeActs = acts.map(act => ({
                                ...act,
                                hazards: Array.isArray(act.hazards) ? act.hazards : (act.hazards ? Object.values(act.hazards) : [])
                            }));
                            const logs = Array.isArray(v.changeLogs) ? v.changeLogs : (v.changeLogs ? Object.values(v.changeLogs) : []);
                            return { firebaseKey: k, ...v, activities: safeActs, changeLogs: logs };
                        }).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
                        setRepo(parsedAssessments);
                    }
                    if (val.sites) {
                        const parsedSites = Object.keys(val.sites).map(key => {
                            const sVal = val.sites[key];
                            return typeof sVal === 'object' ? { code: sVal.code || key, name: sVal.name || sVal.code || key } : { code: sVal, name: sVal };
                        });
                        setSites(parsedSites);
                    }
                    if (val.users) {
                        setUsers(Object.entries(val.users).map(([k, v]) => ({ id: k, ...v })).filter(u => u.status !== 'Inactive'));
                    }
                }
            } catch (err) {
                console.error("Load error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, [navigate, location]);

    // ==========================================
    // 4. STRICT ROW-LEVEL SECURITY (RLS)
    // ==========================================
    const role = session?.role || 'User';
    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(role);

    // Creates an absolute set of what the user is allowed to touch, stripping legacy 'GLOBAL' string for non-admins
    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set();
        if (session.assignedSite && session.assignedSite !== 'GLOBAL') codes.add(session.assignedSite);
        if (Array.isArray(session.accessibleSites)) {
            session.accessibleSites.forEach(s => {
                if (s && s !== 'GLOBAL') codes.add(s);
            });
        }
        return codes;
    }, [session]);

    // UI Filter: Site Dropdowns
    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    // Active users for Dropdown Assignments
    const activeUsers = useMemo(() => {
        if (!formData.siteId) return users;
        return users.filter(u => ['Owner', 'Global Owner', 'Global Manager', 'Admin'].includes(u.role) || u.assignedSite === formData.siteId || (u.accessibleSites && u.accessibleSites.includes(formData.siteId)));
    }, [users, formData.siteId]);

    // --- ROW LEVEL READ/WRITE GUARDS ---
    const canViewRecord = (siteId) => isGlobalUser || allowedSiteCodes.has(siteId);

    const canEditRecord = (siteId) => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        return allowedSiteCodes.has(siteId);
    };

    const canDeleteRecord = (siteId) => {
        if (['Global Owner', 'Owner', 'Admin'].includes(role)) return true;
        if (role === 'Site Owner' && allowedSiteCodes.has(siteId)) return true;
        return false;
    };

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!formData.siteId) return true; // Before selecting site
        return allowedSiteCodes.has(formData.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, formData.siteId]);

    const handleSiteFilterChange = (e) => {
        const newSite = e.target.value;
        setFilterSite(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite === 'All' ? 'GLOBAL' : newSite);
    };

    // --- DATA FILTERS ---
    const filteredRepo = useMemo(() => {
        return repo.filter(r => {
            if (!canViewRecord(r.siteId)) return false; // HARD BLOCK

            const matchSite = filterSite === 'All' || r.siteId === filterSite;
            const matchStatus = filterStatus === 'All' || r.status === filterStatus;
            return matchSite && matchStatus;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [repo, filterSite, filterStatus, canViewRecord]);

    const totalGlobalHazards = useMemo(() => {
        let sum = 0;
        filteredRepo.forEach(a => {
            if (a.activities) a.activities.forEach(act => { if (act.hazards) sum += act.hazards.length; });
        });
        return sum;
    }, [filteredRepo]);

    const allChangeLogs = useMemo(() => {
        let logs = [];
        filteredRepo.forEach(a => {
            if (a.changeLogs) {
                a.changeLogs.forEach(l => {
                    logs.push({ ...l, docId: a.docId, assessmentName: a.assessmentName, siteId: a.siteId, firebaseKey: a.firebaseKey });
                });
            }
        });
        return logs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }, [filteredRepo]);

    // --- FORM HANDLERS ---
    const openNewForm = () => {
        if (!permissions.canEditCreate) return alert("Security Error: Lead Auditors do not have permission to create Risk Assessments.");
        setFormData({
            firebaseKey: null,
            docId: `HIRA-${Math.floor(100000 + Math.random() * 900000)}`,
            assessmentName: '', siteId: (!isGlobalUser && visibleSites.length === 1) ? visibleSites[0].code : (filterSite !== 'All' ? filterSite : ''), location: '',
            date: new Date().toISOString().split('T')[0], status: 'Draft',
            team: [{ name: session.name || session.email, role: 'Lead Assessor' }],
            activities: [], changeLogs: []
        });
        setView('form');
    };

    const openEditForm = (record) => {
        setFormData({ ...record });
        setView('form');
    };

    // --- SMART EXCEL IMPORT ENGINE ---
    const downloadTemplate = () => {
        const headers = ["Activity/Sub activity/ Equipment/ Material", "S.No", "Potential Hazards (Unsafe Conditions/ Unsafe Acts)", "Consequences (Impact on Human Health & Safety and to Whom)", "Current Controls (EC, AC, PPE)", "PR (Prob)", "S (Sev)", "Risk Score", "Risk Level", "Additional Controls", "Res. PR", "Res. S", "Res. Score", "Res. Risk Level", "Remarks/Owner"];
        const data = [headers, ["Ceiling - Maintenance of Fans/AC [Non- Routine]", "1", "Physical / Fall from Height: Falling from ladder", "Harm to Technicians", "Ladder (Administrative Controls)", 2, 4, 8, "Medium", "A-frame ladders; Buddy system; Harness. (Administrative Controls)", 1, 4, 4, "Low", "Owner: Facility Manager | Due: As needed"]];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "HIRA_Template");
        XLSX.writeFile(wb, "HIRA_Upload_Template.xlsx");
    };

    const handleExcelImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImporting(true);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) throw new Error("Excel sheet is empty.");

                const keys = Object.keys(data[0]);
                const getCol = (keywords) => keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw)));

                const actCol = getCol(['activity', 'task', 'equipment']);
                const hazCol = getCol(['hazard', 'unsafe']);
                const whoCol = getCol(['consequence', 'whom', 'impact']);
                const extCol = getCol(['current control', 'existing control']);
                const pr1Col = getCol(['pr (prob)', 'pr', 'prob']);
                const s1Col = getCol(['s (sev)', 'sev']);
                const addCol = getCol(['additional control']);
                const pr2Col = getCol(['res. pr', 'res p']);
                const s2Col = getCol(['res. s', 'res s']);
                const ownCol = getCol(['owner', 'remark']);

                const generatedActivities = [];
                let actMap = {};

                const parseControls = (str, isAdditional = false, ownerStr = '') => {
                    if (!str || str.toLowerCase().includes('none')) return [];
                    let owner = 'Unassigned';
                    if (isAdditional && ownerStr && ownerStr.includes('Owner:')) {
                        const oMatch = ownerStr.match(/Owner:\s*([^|]+)/);
                        if (oMatch) owner = oMatch[1].trim();
                    }

                    let cleanStr = str;
                    let type = 'Administrative';
                    const typeMatch = str.match(/\(([^)]+)\)$/);
                    if (typeMatch) {
                        const rawType = typeMatch[1].toLowerCase();
                        if (rawType.includes('engineer')) type = 'Engineering';
                        else if (rawType.includes('substitut')) type = 'Substitution';
                        else if (rawType.includes('eliminat')) type = 'Elimination';
                        else if (rawType.includes('ppe')) type = 'PPE';
                        cleanStr = str.replace(/\([^)]+\)$/, '').trim();
                    }

                    return cleanStr.split(';').map(c => {
                        let desc = c.trim();
                        if (desc.endsWith('.')) desc = desc.slice(0, -1).trim();
                        if (!desc) return null;
                        return isAdditional ? { category: type, desc, owner, status: 'Open' } : { type, desc };
                    }).filter(Boolean);
                };

                data.forEach(row => {
                    const rawAct = row[actCol] || 'Unspecified Activity';

                    let loc = '';
                    let actName = rawAct;
                    if (rawAct.includes(' - ')) {
                        const parts = rawAct.split(' - ');
                        loc = parts[0].trim();
                        actName = parts.slice(1).join(' - ').trim();
                    }

                    const hazDesc = row[hazCol] || 'Unspecified Hazard';
                    const whoDesc = row[whoCol] || '';

                    let detectedCat = 'Equipment_Machine';
                    let detectedSub = 'Other';
                    let suggestedControls = [];

                    const lowerDesc = hazDesc.toLowerCase();
                    for (const cat of HAZARD_CATS) {
                        for (const sub of Object.keys(HAZARD_DICTIONARY[cat])) {
                            const words = sub.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 3);
                            if (words.some(w => lowerDesc.includes(w)) || lowerDesc.includes(cat.toLowerCase())) {
                                detectedCat = cat; detectedSub = sub;
                                suggestedControls = HAZARD_DICTIONARY[cat][sub].controls;
                                break;
                            }
                        }
                        if (suggestedControls.length > 0) break;
                    }

                    if (!actMap[actName]) {
                        actMap[actName] = { id: Date.now() + Math.random(), name: actName, hazards: [] };
                        generatedActivities.push(actMap[actName]);
                    }

                    const p1 = parseInt(row[pr1Col]) || 3;
                    const s1 = parseInt(row[s1Col]) || 3;
                    const p2 = parseInt(row[pr2Col]) || 1;
                    const s2 = parseInt(row[s2Col]) || 3;

                    actMap[actName].hazards.push({
                        id: Date.now() + Math.random(),
                        location: loc,
                        category: detectedCat,
                        subCategory: detectedSub,
                        desc: hazDesc,
                        who: whoDesc || HAZARD_DICTIONARY[detectedCat][detectedSub].who,
                        p1: p1, s1: s1, r1: p1 * s1,
                        existingControls: parseControls(row[extCol]),
                        suggestedControls: suggestedControls,
                        p2: p2, s2: s2, r2: p2 * s2,
                        additionalControls: parseControls(row[addCol], true, row[ownCol]),
                        alarp: false, alarpJustification: ''
                    });
                });

                setFormData({
                    id: '', assessmentName: `Imported HIRA - ${new Date().toISOString().split('T')[0]}`, siteId: filterSite !== 'All' ? filterSite : (visibleSites[0]?.code || ''), location: 'Imported Data',
                    date: new Date().toISOString().split('T')[0], status: 'Draft',
                    team: [{ name: session.name || session.email, role: 'Lead Assessor' }],
                    activities: generatedActivities, changeLogs: []
                });
                setView('form');
                alert(`Smart Import successful! Mapped ${generatedActivities.length} activities with intelligent controls.`);
            } catch (err) {
                alert("Failed to parse Excel file. Please ensure it matches the Standard Upload Format.\n" + err.message);
            }
            setImporting(false);
            e.target.value = null;
        };
        reader.readAsBinaryString(file);
    };

    // Activity functions
    const addActivity = () => setFormData({ ...formData, activities: [...formData.activities, { id: Date.now(), name: '', hazards: [] }] });
    const updateActivityName = (idx, name) => {
        const newActs = [...formData.activities];
        newActs[idx].name = name;
        setFormData({ ...formData, activities: newActs });
    };
    const removeActivity = (idx) => {
        if (window.confirm("Remove this entire activity and all its hazards?")) {
            setFormData({ ...formData, activities: formData.activities.filter((_, i) => i !== idx) });
        }
    };

    // Hazard functions
    const addHazard = (actIdx) => {
        const newActivities = [...formData.activities];
        newActivities[actIdx].hazards.push({
            id: Date.now(), location: '', category: '', subCategory: '', desc: '', who: '',
            p1: 3, s1: 3, r1: 9, existingControls: [], suggestedControls: [],
            p2: 1, s2: 3, r2: 3, additionalControls: [], alarp: false, alarpJustification: ''
        });
        setFormData({ ...formData, activities: newActivities });
    };

    const updateHazard = (actIdx, hazIdx, field, val) => {
        const newActivities = [...formData.activities];
        const hazard = newActivities[actIdx].hazards[hazIdx];
        hazard[field] = val;
        if (field === 'p1' || field === 's1') hazard.r1 = hazard.p1 * hazard.s1;
        if (field === 'p2' || field === 's2') hazard.r2 = hazard.p2 * hazard.s2;
        setFormData({ ...formData, activities: newActivities });
    };

    const handleCategoryChange = (actIdx, hazIdx, newCat) => {
        const newActivities = [...formData.activities];
        const hazard = newActivities[actIdx].hazards[hazIdx];
        hazard.category = newCat;
        hazard.subCategory = '';
        hazard.who = '';
        hazard.suggestedControls = [];
        setFormData({ ...formData, activities: newActivities });
    };

    const handleSubCategoryChange = (actIdx, hazIdx, newSub) => {
        const newActivities = [...formData.activities];
        const hazard = newActivities[actIdx].hazards[hazIdx];
        hazard.subCategory = newSub;
        const suggestionDB = HAZARD_DICTIONARY[hazard.category];
        if (suggestionDB && suggestionDB[newSub]) {
            const data = suggestionDB[newSub];
            hazard.who = data.who;
            hazard.suggestedControls = data.controls;
        }
        setFormData({ ...formData, activities: newActivities });
    };

    const removeHazard = (actIdx, hazIdx) => {
        const newActivities = [...formData.activities];
        newActivities[actIdx].hazards = newActivities[actIdx].hazards.filter((_, i) => i !== hazIdx);
        setFormData({ ...formData, activities: newActivities });
    };

    // Team functions
    const addTeamMember = () => setFormData({ ...formData, team: [...formData.team, { name: '', role: '' }] });
    const updateTeam = (idx, field, val) => {
        const newTeam = [...formData.team];
        newTeam[idx][field] = val;
        setFormData({ ...formData, team: newTeam });
    };
    const removeTeam = (idx) => setFormData({ ...formData, team: formData.team.filter((_, i) => i !== idx) });

    // Saving Logic
    const processSave = async () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to edit.");
        if (!formData.assessmentName) return alert("Assessment Name is required.");
        if (!formData.siteId) return alert("Site is required.");

        if (!isGlobalUser && !allowedSiteCodes.has(formData.siteId)) {
            return alert("Security Error: You do not have permission to save records to this specific site.");
        }

        if (formData.firebaseKey && !showChangeModal) {
            setShowChangeModal(true);
            return;
        }

        if (formData.firebaseKey && showChangeModal) {
            if (!changeDetails.reason.trim()) return alert("Please provide a reason for this change/revision.");
        }

        setSaving(true);
        const docId = formData.docId || `HIRA-${formData.siteId}-${Date.now().toString().slice(-6)}`;

        const cleanActivities = formData.activities.map(act => ({
            id: act.id, name: act.name,
            hazards: (Array.isArray(act.hazards) ? act.hazards : []).map(h => {
                return {
                    id: h.id, location: h.location || '', category: h.category, subCategory: h.subCategory, desc: h.desc, who: h.who,
                    p1: h.p1, s1: h.s1, r1: h.r1, p2: h.p2, s2: h.s2, r2: h.r2, alarp: h.alarp || false, alarpJustification: h.alarpJustification || '',
                    existingControls: Array.isArray(h.existingControls) ? h.existingControls : [],
                    additionalControls: Array.isArray(h.additionalControls) ? h.additionalControls : []
                };
            })
        }));

        let updatedLogs = Array.isArray(formData.changeLogs) ? formData.changeLogs : [];
        if (formData.firebaseKey && showChangeModal) {
            updatedLogs = [...updatedLogs, {
                date: new Date().toISOString(),
                user: session.name || session.email,
                source: changeDetails.source,
                reason: changeDetails.reason
            }];
        }

        const payload = JSON.parse(JSON.stringify({
            assessmentName: formData.assessmentName,
            siteId: formData.siteId,
            location: formData.location || '',
            date: formData.date,
            status: formData.status,
            team: formData.team,
            activities: cleanActivities,
            changeLogs: updatedLogs,
            docId,
            createdBy: formData.createdBy || session.name || session.email,
            updatedBy: formData.firebaseKey ? (session.name || session.email) : null,
            timestamp: formData.timestamp || new Date().toISOString()
        }));

        try {
            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/riskAssessments/${formData.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/riskAssessments`), payload);
            }
            alert("Risk Assessment Saved Successfully!");
            setShowChangeModal(false);
            setChangeDetails({ source: 'Annual Review', reason: '' });

            const dbRef = ref(rtdb, `organizations/${session.orgId}/riskAssessments`);
            const snap = await get(dbRef);
            if (snap.exists()) {
                const parsedAssessments = Object.keys(snap.val()).map(k => {
                    const v = snap.val()[k];
                    const acts = Array.isArray(v.activities) ? v.activities : (v.activities ? Object.values(v.activities) : []);
                    const safeActs = acts.map(act => ({
                        ...act,
                        hazards: Array.isArray(act.hazards) ? act.hazards : (act.hazards ? Object.values(act.hazards) : [])
                    }));
                    const logs = Array.isArray(v.changeLogs) ? v.changeLogs : (v.changeLogs ? Object.values(v.changeLogs) : []);
                    return { firebaseKey: k, ...v, activities: safeActs, changeLogs: logs };
                }).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
                setRepo(parsedAssessments);
            }
            setView('list');
        } catch (e) { alert("Save failed: " + e.message); }
        setSaving(false);
    };

    const deleteAssessment = async (key) => {
        if (!permissions.canDelete) return alert("Security Error: Only Global Owners and Site Owners can delete Risk Assessments.");
        if (window.confirm("Permanently delete this Risk Assessment?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/riskAssessments/${key}`));
            setRepo(repo.filter(r => r.firebaseKey !== key));
        }
    };

    const exportExcel = () => {
        const dataToExport = [];
        filteredRepo.forEach(r => {
            (r.activities || []).forEach(act => {
                (act.hazards || []).forEach(haz => {
                    dataToExport.push({
                        "Doc ID": r.docId, "Assessment": r.assessmentName, "Site": r.siteId, "Date": r.date, "Status": r.status,
                        "Activity": act.name, "Category": haz.category, "Hazard": haz.subCategory, "Description": haz.desc,
                        "Initial Risk (R1)": haz.r1,
                        "Current Controls": (haz.existingControls || []).map(c => `[${c.type}] ${c.desc}`).join("; "),
                        "Residual Risk (R2)": haz.r2,
                        "Additional Controls Needed?": (haz.additionalControls && haz.additionalControls.length > 0) ? 'Yes' : 'No',
                        "ALARP": haz.alarp ? 'Yes' : 'No'
                    });
                });
            });
        });
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "HIRA_Export");
        XLSX.writeFile(wb, `HIRA_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const triggerPrint = (record) => {
        setPrintData(record);
        setTimeout(() => window.print(), 800);
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col font-['Space_Grotesk']">
            <i className="fas fa-shield-virus fa-spin text-4xl text-blue-500 mb-4"></i>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Risk Matrix...</h2>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

            {/* APP HEADER - Hidden on Print */}
            <header className="app-ui h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-20 flex-shrink-0 print:hidden">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50">
                        <i className="fas fa-shield-virus"></i>
                    </div>
                    <h1 className="font-bold text-lg tracking-wide hidden md:block text-blue-400">HIRA Risk Management</h1>
                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
                <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 shadow-inner">
                    <button type="button" onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-database mr-1"></i> Dashboard</button>
                    <button type="button" onClick={() => setView('logs')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'logs' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-history mr-1"></i> Revision Logs</button>

                    {permissions.canEditCreate && (
                        <>
                            <button type="button" onClick={() => setView('import')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'import' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-file-excel mr-1"></i> Smart Import</button>
                            <button type="button" onClick={openNewForm} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'form' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-plus mr-1"></i> New Assessment</button>
                        </>
                    )}
                </div>
            </header>

            {/* MAIN APP CONTENT - Hidden on Print */}
            <div className="app-ui flex-1 overflow-y-auto p-8 custom-scroll relative z-10 print:hidden">

                {/* MODAL OVERLAY FOR CHANGE LOG PROMPT */}
                {showChangeModal && (
                    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-lg w-full">
                            <h3 className="text-xl font-bold text-orange-400 mb-2"><i className="fas fa-code-branch mr-2"></i> Document Revision Log</h3>
                            <p className="text-slate-400 text-sm mb-6">ISO 45001 requires tracking why risk assessments are modified. Please detail the reason for this update.</p>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Source of Change</label>
                                    <select value={changeDetails.source} onChange={e => setChangeDetails({ ...changeDetails, source: e.target.value })} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none focus:border-orange-500">
                                        {CHANGE_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Reason / Description of Update</label>
                                    <textarea rows="3" placeholder="e.g. Added new engineering control following incident IN-291..." value={changeDetails.reason} onChange={e => setChangeDetails({ ...changeDetails, reason: e.target.value })} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none focus:border-orange-500 resize-none"></textarea>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                                <button type="button" onClick={() => setShowChangeModal(false)} className="px-6 py-2.5 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition">Cancel</button>
                                <button type="button" onClick={processSave} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold bg-orange-600 text-white shadow-lg hover:bg-orange-500 transition">{saving ? <i className="fas fa-spinner fa-spin"></i> : "Confirm & Save Update"}</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="max-w-[1400px] mx-auto">

                    {/* DASHBOARD VIEW */}
                    {view === 'list' && (
                        <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2">HIRA Repository</h2>
                                    <p className="text-sm text-slate-400">Master database of all facility risk assessments.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="bg-slate-900 border border-slate-700 p-1.5 rounded-xl flex gap-2 shadow-inner">
                                        <select value={filterSite} onChange={handleSiteFilterChange} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                                            {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                            {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                                            <option value="All">All Statuses</option>
                                            <option value="Draft">Draft</option>
                                            <option value="Active">Active / Approved</option>
                                            <option value="Archived">Archived</option>
                                        </select>
                                    </div>
                                    <button type="button" onClick={exportExcel} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors shadow flex items-center gap-2"><i className="fas fa-file-excel text-emerald-500"></i> Export</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-blue-500 shadow-xl">
                                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">Total Hazards Identified</div>
                                    <div className="text-4xl font-bold">{totalGlobalHazards}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-500 shadow-xl">
                                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">High Risk (Residual)</div>
                                    <div className="text-4xl font-bold text-red-500">
                                        {filteredRepo.filter(a => {
                                            let hasHigh = false;
                                            if (a.activities) a.activities.forEach(act => { if (act.hazards) act.hazards.forEach(h => { if (h.r2 > 10) hasHigh = true; }) });
                                            return hasHigh;
                                        }).length}
                                    </div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl">
                                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">ALARP Cases</div>
                                    <div className="text-4xl font-bold text-yellow-400">
                                        {filteredRepo.filter(a => {
                                            let hasAlarp = false;
                                            if (a.activities) a.activities.forEach(act => { if (act.hazards) act.hazards.forEach(h => { if (h.alarp) hasAlarp = true; }) });
                                            return hasAlarp;
                                        }).length}
                                    </div>
                                </div>
                            </div>

                            <div className="glass-panel rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                                        <tr>
                                            <th className="p-5 pl-6">Doc ID</th><th className="p-5">Assessment Name</th><th className="p-5">Site</th><th className="p-5">Date</th><th className="p-5 text-center">Hazards</th><th className="p-5 text-center">Max Risk</th><th className="p-5 pr-6 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                                        {filteredRepo.map(a => {
                                            let maxRisk = 0;
                                            let hazCount = 0;
                                            if (a.activities) {
                                                a.activities.forEach(act => {
                                                    if (act.hazards) {
                                                        hazCount += act.hazards.length;
                                                        act.hazards.forEach(h => { if (h.r2 > maxRisk) maxRisk = h.r2; });
                                                    }
                                                });
                                            }

                                            return (
                                                <tr key={a.firebaseKey} className="hover:bg-slate-800/50 transition-colors">
                                                    <td className="p-5 pl-6 font-mono text-xs text-blue-400 font-bold">{a.docId}</td>
                                                    <td className="p-5 font-bold text-white text-base">{a.assessmentName || 'Unnamed Assessment'}</td>
                                                    <td className="p-5 text-xs text-slate-300">{a.siteId}</td>
                                                    <td className="p-5 text-xs font-mono text-slate-400">{a.date}</td>
                                                    <td className="p-5 text-center"><span className="bg-slate-800/80 text-slate-300 px-3 py-1 rounded-lg text-[10px] font-bold border border-slate-700">{hazCount}</span></td>
                                                    <td className="p-5 text-center"><span className={`px-2 py-1 rounded font-bold text-[10px] uppercase tracking-wider shadow-sm ${getRiskClass(maxRisk)}`}>{maxRisk}</span></td>
                                                    <td className="p-5 pr-6 text-right flex justify-end gap-3">
                                                        <button type="button" onClick={() => triggerPrint(a)} className="text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/30" title="Print PDF"><i className="fas fa-print"></i></button>

                                                        {canEditRecord(a.siteId) ? (
                                                            <button type="button" onClick={() => openEditForm(a)} className="text-purple-400 hover:text-white bg-purple-900/20 hover:bg-purple-600 px-3 py-1.5 rounded-lg transition-colors border border-purple-500/30" title="Edit"><i className="fas fa-edit"></i></button>
                                                        ) : (
                                                            <button type="button" onClick={() => openEditForm(a)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-600" title="View"><i className="fas fa-eye"></i></button>
                                                        )}

                                                        {canDeleteRecord(a.siteId) && (
                                                            <button type="button" onClick={() => deleteAssessment(a.firebaseKey)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors border border-red-500/30" title="Delete"><i className="fas fa-trash-alt"></i></button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredRepo.length === 0 && <tr><td colSpan="7" className="p-16 text-center italic text-slate-500">No records found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* REVISION LOGS VIEW */}
                    {view === 'logs' && (
                        <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2"><i className="fas fa-history text-orange-400 mr-3"></i>HIRA Revision History</h2>
                                    <p className="text-sm text-slate-400">Audit trail of all modifications made to active Risk Assessments.</p>
                                </div>
                                <div className="bg-slate-900 border border-slate-700 p-1.5 rounded-xl shadow-inner flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase ml-2">Filter Site:</span>
                                    <select value={filterSite} onChange={handleSiteFilterChange} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                                        {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="glass-panel rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                                        <tr>
                                            <th className="p-5 pl-6">Date & Time</th>
                                            <th className="p-5">HIRA Document</th>
                                            <th className="p-5">Site</th>
                                            <th className="p-5">Source of Change</th>
                                            <th className="p-5 w-1/3">Reason / Details</th>
                                            <th className="p-5">Updated By</th>
                                            <th className="p-5 pr-6 text-right">View</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                                        {allChangeLogs.map((log, idx) => (
                                            <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                                                <td className="p-5 pl-6 whitespace-nowrap font-mono text-xs">{log.date ? new Date(log.date).toLocaleString() : 'N/A'}</td>
                                                <td className="p-5 font-bold text-blue-400">{log.docId}<br /><span className="text-[10px] text-slate-500 font-normal">{log.assessmentName}</span></td>
                                                <td className="p-5 text-xs">{log.siteId}</td>
                                                <td className="p-5"><span className="bg-orange-900/20 text-orange-400 border border-orange-500/30 px-2 py-1 rounded font-bold text-[10px] uppercase tracking-widest">{log.source}</span></td>
                                                <td className="p-5 text-xs text-slate-300">{log.reason}</td>
                                                <td className="p-5 text-xs font-bold text-slate-400"><i className="fas fa-user-circle mr-1"></i> {log.user}</td>
                                                <td className="p-5 pr-6 text-right">
                                                    <button type="button" onClick={() => {
                                                        const matchingAssesment = repo.find(a => a.firebaseKey === log.firebaseKey);
                                                        if (matchingAssesment) { setFormData(matchingAssesment); setView('form'); }
                                                    }} className="text-blue-400 hover:text-white px-4 py-2 bg-blue-900/20 rounded-lg transition-colors text-[10px] font-bold uppercase tracking-widest border border-blue-500/30 hover:bg-blue-600">Open</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {allChangeLogs.length === 0 && <tr><td colSpan="7" className="p-16 text-center italic text-slate-500">No revisions found for the selected filters.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* SMART IMPORT VIEW */}
                    {view === 'import' && permissions.canEditCreate && (
                        <div className="animate-in fade-in duration-500 max-w-6xl mx-auto">
                            <div className="glass-panel p-10 rounded-3xl border border-blue-500/30 shadow-2xl text-center mb-8">
                                <div className="w-24 h-24 rounded-2xl bg-blue-900/30 flex items-center justify-center text-5xl text-blue-400 mx-auto mb-6 shadow-inner border border-blue-500/20"><i className="fas fa-file-excel"></i></div>
                                <h2 className="text-3xl font-bold text-white mb-4">Smart Excel Import</h2>
                                <p className="text-slate-400 mb-8 max-w-xl mx-auto leading-relaxed">Upload your existing Risk Assessment spreadsheet (.xlsx, .csv). Our AI engine will read the rows, detect the hazard types, match them against the HSE framework, and pre-fill the HIRA form for you.</p>

                                <div className="relative border-2 border-dashed border-blue-500/50 rounded-2xl p-12 hover:bg-blue-900/10 transition-colors cursor-pointer max-w-2xl mx-auto bg-slate-900/50 group">
                                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleExcelImport} disabled={importing} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                    {importing ? (
                                        <div className="text-blue-400 font-bold text-xl flex items-center justify-center gap-3"><i className="fas fa-spinner fa-spin"></i> Analyzing Data...</div>
                                    ) : (
                                        <div>
                                            <i className="fas fa-cloud-upload-alt text-5xl text-slate-500 mb-4 group-hover:text-blue-400 transition-colors"></i>
                                            <div className="text-xl font-bold text-white mb-1">Drag & Drop File Here</div>
                                            <div className="text-sm text-slate-500 font-medium">or click to browse your computer</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-xl">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-emerald-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2"><i className="fas fa-info-circle"></i> Standard Upload Format Required</h3>
                                    <button type="button" onClick={downloadTemplate} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-transform active:scale-95 shadow-lg"><i className="fas fa-download"></i> Download Template</button>
                                </div>
                                <p className="text-sm text-slate-400 mb-6">To ensure accurate mapping, your uploaded file must contain column headers similar to the structure below. The Location should be grouped with the Activity separated by a hyphen (e.g., <span className="text-white bg-slate-800 px-2 py-0.5 rounded font-mono text-xs">Ceiling - Maintenance</span>).</p>

                                <div className="overflow-x-auto custom-scroll pb-4">
                                    <table className="w-full text-left text-xs text-slate-300 border border-slate-700 whitespace-nowrap bg-slate-950 rounded-xl overflow-hidden">
                                        <thead className="bg-slate-900 font-bold text-slate-500 border-b border-slate-800">
                                            <tr>
                                                <th className="p-4 border-r border-slate-800">Activity/Sub activity/ Equipment</th>
                                                <th className="p-4 border-r border-slate-800">Potential Hazards</th>
                                                <th className="p-4 border-r border-slate-800">Consequences (Who)</th>
                                                <th className="p-4 border-r border-slate-800">Current Controls (EC, AC, PPE)</th>
                                                <th className="p-4 border-r border-slate-800 text-center">PR</th>
                                                <th className="p-4 border-r border-slate-800 text-center">S</th>
                                                <th className="p-4 border-r border-slate-800">Additional Controls</th>
                                                <th className="p-4 border-r border-slate-800 text-center">Res. PR</th>
                                                <th className="p-4 border-r border-slate-800 text-center">Res. S</th>
                                                <th className="p-4">Remarks/Owner</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="hover:bg-slate-900/50 transition-colors">
                                                <td className="p-4 border-r border-slate-800 text-white font-bold">Ceiling - Maintenance of Fans</td>
                                                <td className="p-4 border-r border-slate-800">Physical / Fall from Height</td>
                                                <td className="p-4 border-r border-slate-800">Harm to Technicians</td>
                                                <td className="p-4 border-r border-slate-800">Ladder (Administrative Controls)</td>
                                                <td className="p-4 border-r border-slate-800 text-center text-red-400 font-bold bg-red-950/20">4</td>
                                                <td className="p-4 border-r border-slate-800 text-center text-red-400 font-bold bg-red-950/20">4</td>
                                                <td className="p-4 border-r border-slate-800">A-frame ladders; Buddy system.</td>
                                                <td className="p-4 border-r border-slate-800 text-center text-emerald-400 font-bold bg-emerald-950/20">1</td>
                                                <td className="p-4 border-r border-slate-800 text-center text-emerald-400 font-bold bg-emerald-950/20">4</td>
                                                <td className="p-4 text-slate-400 font-mono text-[10px]">Owner: Facility Manager</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FORM VIEW */}
                    {view === 'form' && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500 pb-20 max-w-7xl mx-auto">
                            {/* Top Action Bar */}
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-1"><i className="fas fa-clipboard-list text-blue-500 mr-3"></i> {formData.firebaseKey ? 'Edit Risk Assessment' : 'New Risk Assessment'}</h2>
                                    <p className="text-sm text-slate-400 font-mono ml-10">Ref: {formData.docId}</p>
                                </div>
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => setView('list')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                                    {canEditForm && (
                                        <button type="button" onClick={processSave} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/30 transition-transform active:scale-95 flex items-center gap-2">
                                            {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save Assessment
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Core Details */}
                            <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-xl">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-700 pb-3 mb-6">1. Core Context</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Assessment Name / Task Area</label>
                                        <input value={formData.assessmentName || ''} onChange={e => setFormData({ ...formData, assessmentName: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-base font-bold text-white outline-none focus:border-blue-500 transition-colors shadow-inner" placeholder="e.g. Warehouse FLT Operations..." disabled={!canEditForm} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Facility / Site</label>
                                        <select value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value })} disabled={formData.firebaseKey || !canEditForm || (!isGlobalUser && visibleSites.length <= 1)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-white outline-none focus:border-blue-500 transition-colors shadow-inner">
                                            {(isGlobalUser || visibleSites.length > 1) && <option value="">Select Authorized Site...</option>}
                                            {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Assessment Date</label>
                                        <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-white outline-none focus:border-blue-500 transition-colors shadow-inner font-mono" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Document Status</label>
                                        <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} disabled={!canEditForm} className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm font-bold outline-none focus:border-blue-500 transition-colors shadow-inner ${formData.status === 'Active' ? 'text-emerald-400' : 'text-orange-400'}`}>
                                            <option value="Draft">Draft (In Progress)</option>
                                            <option value="Active">Active (Approved)</option>
                                            <option value="Archived">Archived</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Assessment Team */}
                            <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-xl">
                                <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-6">
                                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest">2. Assessment Team</h3>
                                    {canEditForm && <button type="button" onClick={addTeamMember} className="text-[10px] bg-purple-900/30 text-purple-400 hover:bg-purple-600 hover:text-white px-3 py-1.5 rounded-lg border border-purple-500/30 font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus mr-1"></i> Add Member</button>}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {formData.team.map((t, idx) => (
                                        <div key={idx} className="flex gap-2 items-center bg-slate-950/50 p-2 rounded-xl border border-slate-800 shadow-inner">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500"><i className="fas fa-user"></i></div>
                                            <input value={t.name} onChange={e => updateTeam(idx, 'name', e.target.value)} placeholder="Full Name" disabled={!canEditForm} className="flex-1 bg-transparent border-none outline-none text-sm text-white font-bold px-2" />
                                            <select value={t.role} onChange={e => updateTeam(idx, 'role', e.target.value)} disabled={!canEditForm} className="w-32 bg-slate-900 border border-slate-700 rounded-lg text-[10px] text-slate-400 font-bold uppercase tracking-widest outline-none p-2">
                                                <option>Lead Assessor</option><option>Manager</option><option>Operator</option><option>HSE Rep</option><option>Contractor</option>
                                            </select>
                                            {idx > 0 && canEditForm && <button type="button" onClick={() => removeTeam(idx)} className="text-slate-600 hover:text-red-500 w-8 h-8 flex items-center justify-center transition-colors"><i className="fas fa-times"></i></button>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Hazards Matrix */}
                            <div>
                                <div className="flex justify-between items-end mb-6">
                                    <h3 className="text-2xl font-bold text-white"><i className="fas fa-layer-group text-orange-500 mr-3"></i> Hazard Analysis Matrix</h3>
                                    {canEditForm && <button type="button" onClick={addActivity} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-orange-900/30 transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-plus"></i> Add Activity / Area</button>}
                                </div>

                                <div className="space-y-8">
                                    {formData.activities.map((act, actIdx) => (
                                        <div key={act.id} className="glass-panel rounded-3xl border border-slate-700 overflow-hidden shadow-2xl relative">

                                            {/* Top Color Bar */}
                                            <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                                            <div className="bg-slate-900/80 p-6 flex justify-between items-center border-b border-slate-700">
                                                <div className="flex-1 mr-8 relative group">
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Process / Task / Area Name</label>
                                                    <input value={act.name} onChange={e => updateActivityName(actIdx, e.target.value)} disabled={!canEditForm} placeholder="e.g., 'Hot Work on Main Boiler Pipes'..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-lg font-bold text-white outline-none focus:border-blue-500 shadow-inner pr-12 transition-colors" />
                                                </div>
                                                {canEditForm && (
                                                    <div className="flex gap-3 mt-5">
                                                        <button type="button" onClick={() => addHazard(actIdx)} className="bg-slate-800 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg border border-slate-700 flex items-center gap-2"><i className="fas fa-plus"></i> Add Hazard</button>
                                                        <button type="button" onClick={() => removeActivity(actIdx)} className="bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white w-12 h-12 rounded-xl transition-colors border border-slate-700 flex items-center justify-center shadow-lg"><i className="fas fa-trash-alt"></i></button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-6 bg-slate-950/40 space-y-6">
                                                {(act.hazards || []).map((haz, hazIdx) => (
                                                    <HazardRow
                                                        key={haz.id}
                                                        idx={actIdx}
                                                        hIdx={hazIdx}
                                                        haz={haz}
                                                        updateHazard={updateHazard}
                                                        removeHazard={removeHazard}
                                                        handleCategoryChange={handleCategoryChange}
                                                        handleSubCategoryChange={handleSubCategoryChange}
                                                        users={activeUsers}
                                                        canEdit={canEditForm}
                                                    />
                                                ))}
                                                {(!act.hazards || act.hazards.length === 0) && (
                                                    <div className="text-center p-12 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 italic bg-slate-900/20">No specific hazards identified for this activity step yet. Click "Add Hazard" to begin.</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {formData.activities.length === 0 && (
                                        <div className="text-center p-20 border-2 border-dashed border-slate-700 rounded-3xl text-slate-400 text-lg bg-slate-900/30 shadow-inner">
                                            <i className="fas fa-arrow-up text-3xl mb-4 block text-slate-600"></i>
                                            Click <strong className="text-orange-500">"Add Activity / Area"</strong> above to start building your risk assessment matrix.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Bottom Action Bar */}
                            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                                <button type="button" onClick={() => setView('list')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                                {canEditForm && (
                                    <button type="button" onClick={processSave} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/30 transition-transform active:scale-95 flex items-center gap-2">
                                        {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save Assessment
                                    </button>
                                )}
                            </div>

                        </div>
                    )}
                </div>
            </div>

            {/* --- PRINT OVERLAY --- */}
            {printData && (
                <div className="hidden print:block p-8 bg-white text-black w-full absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                        <div>
                            <div className="text-sm font-bold text-gray-500 mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Document Control</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Hazard Identification & Risk Assessment</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold font-mono">Ref ID: {printData.docId}</p>
                            <p className="text-sm font-bold mt-1 uppercase">Date: {printData.date}</p>
                        </div>
                    </div>

                    <div className="mb-6 border border-black p-4 bg-gray-50">
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-[15%] font-bold py-1 border-b border-gray-300">Assessment Name:</td>
                                    <td colSpan="3" className="text-lg font-bold py-1 border-b border-gray-300">{printData.assessmentName}</td>
                                </tr>
                                <tr>
                                    <td className="font-bold py-2 border-none">Site / Location:</td>
                                    <td className="w-[35%] py-2 border-none">{printData.siteId}</td>
                                    <td className="w-[15%] font-bold py-2 pl-4 border-none">Status:</td>
                                    <td className="w-[35%] py-2 border-none font-bold uppercase">{printData.status}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 border border-black p-4">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Assessment Team</h2>
                        <div className="text-sm flex flex-wrap gap-x-8 gap-y-2">
                            {printData.team && printData.team.map((t, i) => (
                                <span key={i}><strong>{t.name}</strong> ({t.role})</span>
                            ))}
                        </div>
                    </div>

                    {printData.activities && printData.activities.map((act, i) => (
                        <div key={i} className="mb-8 page-break-inside-avoid">
                            <h2 className="text-base font-black mb-2 uppercase bg-gray-800 text-white p-2">Activity {i + 1}: {act.name}</h2>
                            <table className="w-full text-[10px] border-collapse border border-black">
                                <thead>
                                    <tr className="bg-gray-200">
                                        <th className="border border-black p-2 w-[15%]">Category / Type</th>
                                        <th className="border border-black p-2 w-[25%] text-left">Hazard Event</th>
                                        <th className="border border-black p-2 w-[5%] text-center">R1</th>
                                        <th className="border border-black p-2 w-[25%] text-left">Current Controls</th>
                                        <th className="border border-black p-2 w-[5%] text-center">R2</th>
                                        <th className="border border-black p-2 w-[25%] text-left">Additional Actions (CAPA)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {act.hazards && act.hazards.map((haz, hIdx) => (
                                        <tr key={hIdx}>
                                            <td className="border border-black p-2 font-bold">{haz.category}<br /><span className="font-normal italic text-gray-600">{haz.subCategory}</span></td>
                                            <td className="border border-black p-2">{haz.desc}</td>
                                            <td className="border border-black p-2 text-center font-bold text-sm" style={getRiskStyle(haz.r1)}>{haz.r1}</td>
                                            <td className="border border-black p-2">
                                                <ul className="list-disc pl-3 m-0">
                                                    {(haz.existingControls || []).map((c, k) => <li key={k}>[{c.type}] {c.desc}</li>)}
                                                </ul>
                                            </td>
                                            <td className="border border-black p-2 text-center font-bold text-sm" style={getRiskStyle(haz.r2)}>{haz.r2}</td>
                                            <td className="border border-black p-2">
                                                {haz.alarp ?
                                                    <div><strong className="text-red-600">ALARP Declared:</strong><br />{haz.alarpJustification}</div>
                                                    :
                                                    haz.additionalControls && haz.additionalControls.length > 0 ? (
                                                        <ul className="list-disc pl-3 m-0">
                                                            {haz.additionalControls.map((c, cIdx) => (
                                                                <li key={cIdx} className="mb-1"><strong>[{c.category}]</strong> {c.desc} <em>(Owner: {c.owner || 'TBA'})</em></li>
                                                            ))}
                                                        </ul>
                                                    ) : <span className="italic text-gray-500">None required.</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                    {(!act.hazards || act.hazards.length === 0) && <tr><td colSpan="6" className="border border-black p-4 text-center italic text-gray-500">No hazards assessed for this activity.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    <div className="mt-8 text-[10px] border-t border-dashed border-gray-400 pt-4 page-break-inside-avoid">
                        <strong>Risk Matrix Legend:</strong> P = Probability (1-5), S = Severity (1-5), R = Risk Score (P x S). R1 = Initial Score, R2 = Residual Score. <br />
                        <span className="inline-block w-3 h-3 border border-black mr-1 align-middle" style={{ backgroundColor: '#10b981' }}></span>Low (1-4) |
                        <span className="inline-block w-3 h-3 border border-black ml-4 mr-1 align-middle" style={{ backgroundColor: '#eab308' }}></span>Medium (5-9) |
                        <span className="inline-block w-3 h-3 border border-black ml-4 mr-1 align-middle" style={{ backgroundColor: '#ef4444' }}></span>High (10-16) |
                        <span className="inline-block w-3 h-3 border border-black ml-4 mr-1 align-middle" style={{ backgroundColor: '#7f1d1d' }}></span>Extreme (17-25)
                    </div>

                    <table className="w-full border-none mt-16 text-sm page-break-inside-avoid">
                        <tbody>
                            <tr>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Lead Assessor Signature</td>
                                <td className="w-[10%] border-none"></td>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Site Manager Approval</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="text-center text-xs text-gray-500 mt-10 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                </div>
            )}
        </div>
    );
}