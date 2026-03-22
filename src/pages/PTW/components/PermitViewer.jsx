import React, { useState } from 'react';
import { ref, update } from 'firebase/database';
import { rtdb } from '../../../config/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getTypeConfig } from '../../../utils/constants';

export default function PermitViewer({ permit, session, onCancel, onUpdate }) {
    const [isProcessing, setIsProcessing] = useState(false);
    const tConfig = getTypeConfig(permit.permitType || permit.typeId);

    const handleStatusChange = async (newStatus) => {
        if (!window.confirm(`Are you sure you want to mark this permit as ${newStatus}?`)) return;
        setIsProcessing(true);
        try {
            const updates = {
                status: newStatus,
                [`${newStatus.toLowerCase()}By`]: session.name || session.email,
                [`${newStatus.toLowerCase()}At`]: new Date().toISOString()
            };
            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            alert(`Permit successfully marked as ${newStatus}`);
            onUpdate();
        } catch (error) {
            console.error("Status update failed:", error);
            alert("Failed to update status.");
        } finally {
            setIsProcessing(false);
        }
    };

    const generatePDF = () => {
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 35, 'F');
            doc.setTextColor(255); doc.setFontSize(20); doc.setFont("helvetica", "bold");
            doc.text("PERMIT TO WORK", 14, 15);
            doc.setFontSize(10); doc.setTextColor(200);
            doc.text(`ID: ${permit.id} | TYPE: ${tConfig.label}`, 14, 25);

            doc.setTextColor(0);
            autoTable(doc, {
                startY: 45,
                head: [['Permit Details', '']],
                body: [
                    ['Site / Location', `${permit.siteId || 'N/A'} - ${permit.location || 'N/A'}`],
                    ['Executing Agency', permit.contractorId === 'INTERNAL' ? 'Internal Team' : permit.contractorId || 'N/A'],
                    ['Valid From', permit.validFromDate ? new Date(permit.validFromDate).toLocaleString() : 'N/A'],
                    ['Status', permit.status || 'Unknown'],
                    ['Created By', permit.createdBy || 'System']
                ],
                theme: 'grid', headStyles: { fillColor: [30, 41, 59] }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
            });

            doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Scope of Work:", 14, doc.lastAutoTable.finalY + 15);
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            doc.text(doc.splitTextToSize(permit.workDescription || 'No description provided.', 180), 14, doc.lastAutoTable.finalY + 22);

            const checklistKeys = Object.keys(permit.checklist || {});
            const checklistBody = checklistKeys.length > 0 ? checklistKeys.map(item => [item, permit.checklist[item] ? 'VERIFIED (YES)' : 'NO']) : [['No checklist items recorded', '']];

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 40,
                head: [['Safety Pre-Requisites (Checklist)', 'Status']],
                body: checklistBody, theme: 'grid', headStyles: { fillColor: [30, 41, 59] }, columnStyles: { 1: { fontStyle: 'bold', halign: 'center', cellWidth: 40 } },
                willDrawCell: (data) => { if (data.section === 'body' && data.column.index === 1) doc.setTextColor(data.cell.raw.includes('YES') ? 21 : 220, data.cell.raw.includes('YES') ? 128 : 38, data.cell.raw.includes('YES') ? 61 : 38); }
            });

            doc.save(`${permit.id}_PTW.pdf`);
        } catch (error) { alert("Failed to generate PDF. Ensure jspdf and jspdf-autotable are installed."); }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-8 bg-slate-900/80 p-6 rounded-3xl border border-slate-700 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black shadow-lg ${tConfig.bg} ${tConfig.color} border ${tConfig.border}`}><i className="fas fa-file-signature"></i></div>
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-wide">{permit.id}</h2>
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${tConfig.color} ${tConfig.bg} ${tConfig.border}`}>{tConfig.label}</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={generatePDF} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-blue-900/50 transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-file-pdf"></i> PDF</button>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-colors border border-slate-700 hover:bg-slate-800"><i className="fas fa-times mr-1"></i> Close</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="md:col-span-2 glass-panel p-6 rounded-3xl shadow-xl border border-slate-700">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">Scope of Work</h3>
                    <p className="text-white text-lg font-medium leading-relaxed">{permit.workDescription}</p>
                </div>
                <div className="glass-panel p-6 rounded-3xl shadow-xl border border-slate-700 space-y-4">
                    <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Site & Location</span><span className="text-white font-bold">{permit.siteId} - {permit.location}</span></div>
                    <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Executing Agency</span><span className="text-white font-bold">{permit.contractorId === 'INTERNAL' ? 'Internal Team' : permit.contractorId || 'N/A'}</span></div>
                    <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Current Status</span><span className={`text-xs font-bold uppercase tracking-widest ${permit.status === 'Closed' ? 'text-emerald-400' : permit.status === 'Pending' ? 'text-orange-400' : 'text-blue-400'}`}>{permit.status}</span></div>
                </div>
            </div>

            <div className="glass-panel p-8 rounded-3xl shadow-xl border border-slate-700 mb-8">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-800 pb-2">Verified Safety Pre-Requisites</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(permit.checklist || {}).map(([item, isChecked], idx) => (
                        <div key={idx} className={`p-4 rounded-xl border flex items-center gap-4 ${isChecked ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
                            <i className={`fas ${isChecked ? 'fa-check-circle text-emerald-500' : 'fa-times-circle text-red-500'} text-xl`}></i><span className={isChecked ? 'text-slate-300' : 'text-slate-500 line-through'}>{item}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-4 border-t border-slate-800 pt-6">
                {permit.status === 'Pending' && <button disabled={isProcessing} onClick={() => handleStatusChange('Approved')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-emerald-900/50 transition-transform active:scale-95 text-sm flex items-center gap-2">{isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-double"></i>} Approve Permit</button>}
                {permit.status === 'Approved' && <button disabled={isProcessing} onClick={() => handleStatusChange('Closed')} className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest shadow-lg transition-transform active:scale-95 text-sm flex items-center gap-2 border border-slate-500">{isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-lock"></i>} Close Permit</button>}
            </div>
        </div>
    );
}