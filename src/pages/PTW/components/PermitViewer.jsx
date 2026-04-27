import React from 'react';

import { getTypeConfig } from '../../../utils/constants';
import { safeArr } from '../../../utils/helpers';
import { getPermitDeadline, getStatusColor, isPermitOverdue } from '../utils';

function SummaryCard({ label, value, mono = false }) {
    return (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-lg">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
            <div className={`text-sm font-bold text-white ${mono ? 'font-mono' : ''}`}>{value || 'N/A'}</div>
        </div>
    );
}

function Section({ title, icon, children }) {
    return (
        <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl">
            <h3 className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 text-sm font-bold uppercase tracking-widest text-white">
                <i className={`${icon} text-amber-400`}></i> {title}
            </h3>
            {children}
        </section>
    );
}

export default function PermitViewer({
    canInspect,
    onBack,
    onInspect,
    permit
}) {
    if (!permit) return null;

    const typeConfig = getTypeConfig(permit.typeId);
    const overdue = isPermitOverdue(permit);
    const deadline = getPermitDeadline(permit);

    return (
        <div className="mx-auto max-w-6xl animate-fade-in p-6 font-['Space_Grotesk'] md:p-8">
            <div className={`mb-8 rounded-3xl border p-6 shadow-2xl backdrop-blur-md ${overdue ? 'border-red-500/50 bg-red-950/20' : 'border-slate-700 bg-slate-900/80'}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-xl shadow-lg ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                            <i className="fas fa-file-signature"></i>
                        </div>
                        <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h2 className="text-2xl font-black text-white">{permit.id}</h2>
                                <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                                    {typeConfig.label}
                                </span>
                                <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${getStatusColor(permit.status)}`}>
                                    {permit.status}
                                </span>
                                {overdue && (
                                    <span className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
                                        Overdue
                                    </span>
                                )}
                            </div>
                            <p className="max-w-3xl text-sm text-slate-300">{permit.description}</p>
                            {deadline && (
                                <p className={`mt-2 text-xs font-bold uppercase tracking-widest ${overdue ? 'text-red-400' : 'text-slate-500'}`}>
                                    Deadline: {permit.validToDate} {permit.validToTime}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {canInspect && (
                            <button
                                type="button"
                                onClick={() => onInspect(permit)}
                                className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition hover:bg-orange-500"
                            >
                                <i className="fas fa-search mr-2"></i> Inspect / Observe
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onBack}
                            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-slate-700"
                        >
                            <i className="fas fa-arrow-left mr-2"></i> Back
                        </button>
                    </div>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Site" value={permit.siteId} />
                <SummaryCard label="Location" value={permit.location} />
                <SummaryCard label="Issuing Dept" value={permit.issuingDept} />
                <SummaryCard label="Equipment" value={permit.equipment} />
                <SummaryCard label="Worker Type" value={permit.workerType} />
                <SummaryCard label="Contractor" value={permit.contractorName || permit.contractorId || 'Internal'} />
                <SummaryCard label="Requested By" value={permit.creatorEmail || permit.requestedBy} />
                <SummaryCard label="Validity" value={`${permit.validFromDate || 'N/A'} ${permit.validFromTime || ''} to ${permit.validToDate || 'N/A'} ${permit.validToTime || ''}`} mono />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Section title="Execution Team" icon="fas fa-users">
                    <div className="space-y-3 text-sm text-slate-300">
                        <div><span className="font-bold text-white">Supervisor:</span> {permit.issuedToName || 'N/A'}</div>
                        <div><span className="font-bold text-white">Supervisor Phone:</span> {permit.issuedToPh || 'N/A'}</div>
                        <div>
                            <span className="font-bold text-white">Workers:</span>{' '}
                            {safeArr(permit.entrantNames).length > 0 ? safeArr(permit.entrantNames).join(', ') : 'None assigned'}
                        </div>
                    </div>
                </Section>

                <Section title="Approvals" icon="fas fa-user-check">
                    <div className="space-y-3 text-sm text-slate-300">
                        <div><span className="font-bold text-white">Engineering:</span> {permit.engApproverEmail || 'N/A'} ({permit.engStatus || 'N/A'})</div>
                        <div><span className="font-bold text-white">Production:</span> {permit.prodApproverEmail || 'N/A'} ({permit.prodStatus || 'N/A'})</div>
                        <div><span className="font-bold text-white">Last Status Update:</span> {permit.statusUpdatedOn || permit.lastUpdated || 'N/A'}</div>
                    </div>
                </Section>

                <Section title="Work Method Statement" icon="fas fa-list-check">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-sm">
                            <thead className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                <tr>
                                    <th className="p-3">Step</th>
                                    <th className="p-3">Hazard</th>
                                    <th className="p-3">Control</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {safeArr(permit.wms).map((row, index) => (
                                    <tr key={`${row?.step || 'step'}-${index}`}>
                                        <td className="p-3 text-slate-200">{row?.step || '-'}</td>
                                        <td className="p-3 text-red-200">{row?.hazard || '-'}</td>
                                        <td className="p-3 text-emerald-200">{row?.precaution || '-'}</td>
                                    </tr>
                                ))}
                                {safeArr(permit.wms).length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="p-3 text-center italic text-slate-500">No WMS entries recorded.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <Section title="PPE & Checklist" icon="fas fa-helmet-safety">
                    <div className="mb-4">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Required PPE</div>
                        <div className="flex flex-wrap gap-2">
                            {safeArr(permit.ppe).length > 0 ? safeArr(permit.ppe).map((item) => (
                                <span key={item} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">{item}</span>
                            )) : <span className="text-sm text-slate-500">No PPE selected.</span>}
                        </div>
                    </div>
                    <div className="space-y-2">
                        {safeArr(permit.checklist).length > 0 ? safeArr(permit.checklist).map((item, index) => (
                            <div key={`${item?.label || 'check'}-${index}`} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${item?.checked ? 'border-emerald-500/30 bg-emerald-900/10 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>
                                <i className={`fas ${item?.checked ? 'fa-check-circle text-emerald-400' : 'fa-circle text-slate-600'} mt-0.5`}></i>
                                <span>{item?.label || ''}</span>
                            </div>
                        )) : <div className="text-sm italic text-slate-500">No checklist items recorded.</div>}
                    </div>
                </Section>

                <Section title="Specialized Controls" icon="fas fa-shield-halved">
                    <div className="grid grid-cols-1 gap-3 text-sm text-slate-300">
                        {permit.fireWatcherName && <div><span className="font-bold text-white">Fire Watcher:</span> {permit.fireWatcherName}</div>}
                        {permit.attendantName && <div><span className="font-bold text-white">Attendant:</span> {permit.attendantName}</div>}
                        {permit.entrySupervisorName && <div><span className="font-bold text-white">Entry Supervisor:</span> {permit.entrySupervisorName}</div>}
                        {permit.oxygenLevel && <div><span className="font-bold text-white">Oxygen:</span> {permit.oxygenLevel}</div>}
                        {permit.flammability && <div><span className="font-bold text-white">Flammability:</span> {permit.flammability}</div>}
                        {permit.toxicGas && <div><span className="font-bold text-white">Toxic Gas:</span> {permit.toxicGas}</div>}
                        {permit.lotoRef && (
                            <div>
                                <span className="font-bold text-white">LOTO Ref:</span> {permit.lotoRef}
                                {permit.lotoProcedureDescription ? ` - ${permit.lotoProcedureDescription}` : ''}
                                {permit.lotoProcedureSite ? ` (${permit.lotoProcedureSite})` : ''}
                            </div>
                        )}
                        {safeArr(permit.wahEquipment).length > 0 && <div><span className="font-bold text-white">WAH Equipment:</span> {safeArr(permit.wahEquipment).join(', ')}</div>}
                        {!permit.fireWatcherName && !permit.attendantName && !permit.entrySupervisorName && !permit.oxygenLevel && !permit.flammability && !permit.toxicGas && !permit.lotoRef && safeArr(permit.wahEquipment).length === 0 && (
                            <div className="italic text-slate-500">No specialized controls recorded.</div>
                        )}
                    </div>
                </Section>

                <Section title="Inspection & Non-Compliances" icon="fas fa-clipboard-question">
                    <div className="space-y-3 text-sm text-slate-300">
                        <div><span className="font-bold text-white">Last Inspector:</span> {permit.lastInspector || 'N/A'}</div>
                        <div><span className="font-bold text-white">Last Inspection Date:</span> {permit.lastInspectionDate || 'N/A'}</div>
                        <div><span className="font-bold text-white">Observation:</span> {permit.lastInspection || 'No observations recorded.'}</div>
                        {permit.cancellationReason && <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-red-200"><span className="font-bold">Cancellation Reason:</span> {permit.cancellationReason}</div>}
                        {safeArr(permit.nonCompliances).length > 0 && (
                            <div className="space-y-2">
                                {safeArr(permit.nonCompliances).map((entry) => (
                                    <div key={entry.id} className="rounded-xl border border-red-500/30 bg-red-950/20 p-3">
                                        <div className="font-bold text-white">{entry.desc}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-red-300">{entry.date}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Section>
            </div>
        </div>
    );
}
