import React from 'react';

export const UserSelect = ({ users, value, onChange, disabled, placeholder }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-white text-xs outline-none focus:border-blue-500">
        <option value="">{placeholder || 'Select User...'}</option>
        {users.map((user) => <option key={user.id} value={user.name || user.email}>{user.name || user.email} ({user.role || 'User'})</option>)}
    </select>
);

const RibBox = ({ title, cat, data, disabled, onAdd, onRemove, onUpdate }) => (
    <div className="rib-box">
        <div className="flex justify-between mb-2 border-b border-slate-600 pb-1">
            <span className="text-[9px] font-bold uppercase text-slate-400 print:text-black">{title}</span>
            {!disabled && <button type="button" onClick={() => onAdd(cat)} className="text-[10px] text-emerald-400 hover:text-emerald-300 no-print font-bold bg-emerald-400/10 px-2 rounded">+</button>}
        </div>
        {((data && data[cat]) || []).map((value, index) => (
            <div key={index} className="flex group mb-1 items-center">
                <input value={value || ''} onChange={(e) => onUpdate(cat, index, e.target.value)} disabled={disabled} className="w-full bg-transparent text-[10px] border-b border-slate-700 mb-1 outline-none text-white print:text-black focus:border-blue-500" />
                {!disabled && <button type="button" onClick={() => onRemove(cat, index)} className="text-red-400 bg-red-400/10 hover:bg-red-500 hover:text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] ml-1 no-print transition-colors" title="Delete">x</button>}
            </div>
        ))}
    </div>
);

export const Fishbone = ({ data = {}, disabled, onChange }) => {
    const updateFishboneValue = (cat, index, value) => {
        const next = [...(data[cat] || [])];
        next[index] = value;
        onChange({ ...data, [cat]: next });
    };

    const addItem = (cat) => onChange({ ...data, [cat]: [...(data[cat] || []), ''] });

    const removeItem = (cat, index) => {
        const next = [...(data[cat] || [])];
        next.splice(index, 1);
        onChange({ ...data, [cat]: next });
    };

    return (
        <div className="fishbone-container mt-8">
            <div className="spine"></div>
            <div className="head">INCIDENT</div>
            <div className="ribs-top">
                <RibBox title="Man" cat="man" data={data} onAdd={addItem} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <RibBox title="Machine" cat="machine" data={data} onAdd={addItem} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <RibBox title="Material" cat="material" data={data} onAdd={addItem} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
            </div>
            <div className="ribs-bottom">
                <RibBox title="Method" cat="method" data={data} onAdd={addItem} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <RibBox title="Environment" cat="environment" data={data} onAdd={addItem} onUpdate={updateFishboneValue} onRemove={removeItem} disabled={disabled} />
                <div style={{ width: '18%' }}></div>
            </div>
        </div>
    );
};

export const FaultTreeNode = ({ node, disabled, onAddSibling, onDelete, onUpdate }) => {
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

    const updateChild = (index, nextChild) => {
        const nextChildren = [...(node.children || [])];
        nextChildren[index] = nextChild;
        onUpdate({ ...node, children: nextChildren });
    };

    const deleteChild = (index) => {
        onUpdate({ ...node, children: (node.children || []).filter((_, childIndex) => childIndex !== index) });
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
            {node.children && node.children.length > 0 && <ul>{node.children.map((child, index) => <FaultTreeNode key={child.id || index} node={child} onUpdate={(nextChild) => updateChild(index, nextChild)} onDelete={() => deleteChild(index)} onAddSibling={addSiblingToChild} disabled={disabled} />)}</ul>}
        </li>
    );
};
