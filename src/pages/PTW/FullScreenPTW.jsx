import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { get, push, ref, update } from 'firebase/database';
import QRious from 'qrious';

import { rtdb } from '../../config/firebase';
import { getPortalAwareHomePath } from '../FieldApp/portalAuth';
import {
    CHECKLIST_ITEMS,
    COMMON_PPE,
    getTypeConfig,
    PERMIT_TYPES,
    WAH_EQUIP_OPTIONS
} from '../../utils/constants';
import { safeArr, safeArrayParse } from '../../utils/helpers';
import PtwDashboardComponent from './components/PtwDashboard';
import PtwRegistryComponent from './components/PtwRegistry';
import PermitViewerComponent from './components/PermitViewer';
import InspectionModalComponent from './components/InspectionModal';
import ReassignModalComponent from './components/ReassignModal';
import PrintViewComponent from './components/PrintView';
import { getStatusColor, isPermitOverdue, normalizePermit } from './utils';

function PtwDashboardView({
    allowedSites,
    handleSiteFilterChange,
    isGlobalUser,
    myPendingApprovals,
    setCurrentView,
    siteFilter,
    visiblePermits
}) {
    return (
        <div className="mx-auto max-w-7xl animate-fade-in p-8 font-['Space_Grotesk']">
            <div className="mb-8 flex items-end justify-between">
                <div>
                    <h2 className="mb-2 text-3xl font-bold text-white">PTW Dashboard</h2>
                    <p className="font-['Inter'] text-sm text-slate-400">Real-time status of safe work permits for your allowed locations.</p>
                </div>
                <div className="flex items-center gap-4 text-sm font-bold">
                    <select value={siteFilter} onChange={handleSiteFilterChange} className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-['Inter'] text-white shadow-lg outline-none focus:border-amber-500">
                        {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Authorized Sites</option>}
                        {allowedSites.map((site) => (
                            <option key={site.code} value={site.code}>
                                {site.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
                <div className="glass-panel rounded-2xl border-l-4 border-l-blue-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-blue-400">Work In Progress</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Work in Progress').length}</div>
                </div>
                <div className="glass-panel rounded-2xl border-l-4 border-l-orange-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orange-400">Pending Approval</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Pending Approval').length}</div>
                </div>
                <div className="glass-panel rounded-2xl border-l-4 border-l-purple-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">Pending Closure</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Pending Closure').length}</div>
                </div>
                <div className="glass-panel rounded-2xl border-l-4 border-l-red-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-red-400">Cancelled / Stopped</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Cancelled').length}</div>
                </div>
            </div>

            {myPendingApprovals.length > 0 && (
                <div className="mb-10 rounded-3xl border border-orange-500/50 bg-orange-900/20 p-6 shadow-2xl">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-orange-400">
                        <i className="fas fa-bell animate-pulse"></i> Tasks Requiring Your Action
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {myPendingApprovals.map((permit) => (
                            <div key={permit.id} className="flex flex-col justify-between rounded-xl border border-slate-700 bg-slate-900 p-4 font-['Inter']">
                                <div>
                                    <span
                                        className={`mb-2 inline-block rounded border px-2 py-1 text-[10px] font-bold uppercase ${
                                            permit.status === 'Pending Closure'
                                                ? 'border-purple-500/30 bg-purple-500/20 text-purple-400'
                                                : 'border-orange-500/30 bg-orange-500/20 text-orange-400'
                                        }`}
                                    >
                                        {permit.status}
                                    </span>
                                    <h4 className="mb-1 line-clamp-2 text-sm font-bold text-white">{permit.description}</h4>
                                    <p className="mb-4 truncate text-xs text-slate-400">{permit.location}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCurrentView('inventory')}
                                    className="rounded-lg bg-slate-800 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-700"
                                >
                                    Go to Registry
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <h3 className="mb-4 text-xl font-bold text-white">Recently Active Permits</h3>
            <div className="grid grid-cols-1 gap-6 font-['Inter'] lg:grid-cols-2 xl:grid-cols-3">
                {visiblePermits
                    .filter((permit) => permit.status === 'Work in Progress' || permit.status === 'Pending Approval')
                    .slice(0, 6)
                    .map((permit) => {
                        const typeConfig = getTypeConfig(permit.typeId);
                        return (
                            <div
                                key={permit.id}
                                className={`glass-panel rounded-2xl border-t-4 p-5 shadow-lg transition-shadow hover:shadow-xl ${typeConfig.border.replace('border-', 'border-t-')}`}
                            >
                                <div className="mb-3 flex items-start justify-between">
                                    <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-widest shadow-sm ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                                        {typeConfig.label}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-slate-400">{permit.id}</span>
                                </div>
                                <h4 className="mb-1 truncate font-bold text-white">{permit.description}</h4>
                                <p className="mb-4 text-xs text-slate-400">
                                    <i className="fas fa-location-dot mr-1"></i> {permit.location} ({permit.siteId})
                                </p>
                                <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] font-bold uppercase tracking-wider">
                                    <span className={permit.status === 'Work in Progress' ? 'animate-pulse text-blue-400' : 'text-orange-400'}>{permit.status}</span>
                                    <span className="text-slate-500">Till: {permit.validToTime}</span>
                                </div>
                            </div>
                        );
                    })}
                {visiblePermits.filter((permit) => permit.status === 'Work in Progress' || permit.status === 'Pending Approval').length === 0 && (
                    <div className="col-span-full rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/50 p-10 text-center italic text-slate-500">
                        No active permits at this time.
                    </div>
                )}
            </div>
        </div>
    );
}

function PtwRegistryView({
    allowedSites,
    handleApproveClosure,
    handleApproveInitiation,
    handleRequestClosure,
    handleSiteFilterChange,
    isCreator,
    isEngApprover,
    isGlobalUser,
    isProdApprover,
    openForm,
    permissions,
    setInspectionModal,
    setInspectionObservation,
    setNewApproverEmail,
    setReassignModal,
    siteFilter,
    triggerPrint,
    visiblePermits
}) {
    return (
        <div className="mx-auto max-w-7xl animate-fade-in p-8 font-['Space_Grotesk']">
            <div className="mb-6 flex items-end justify-between">
                <div>
                    <h2 className="mb-2 text-3xl font-bold text-white">Permit Registry</h2>
                    <p className="font-['Inter'] text-sm text-slate-400">Master log of all drafted, active, and historical permits.</p>
                </div>
                <select
                    value={siteFilter}
                    onChange={handleSiteFilterChange}
                    className="w-48 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-['Inter'] text-sm font-bold text-white shadow-lg outline-none focus:border-amber-500"
                >
                    {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Authorized Sites</option>}
                    {allowedSites.map((site) => (
                        <option key={site.code} value={site.code}>
                            {site.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="glass-panel overflow-hidden rounded-2xl border border-slate-700 shadow-xl font-['Inter']">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="border-b border-slate-700 bg-slate-950 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <tr>
                            <th className="p-4 pl-6">PTW Ref</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Location / Work</th>
                            <th className="p-4">Status & Approvals</th>
                            <th className="p-4 pr-6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                        {visiblePermits.map((permit, index) => {
                            const typeConfig = getTypeConfig(permit.typeId);
                            const amIEng = isEngApprover(permit);
                            const amIProd = isProdApprover(permit);
                            const amICreator = isCreator(permit);

                            const canReassign = amICreator && (permit.status === 'Pending Approval' || permit.status === 'Pending Closure');
                            const canEditPermitRow = permissions.canEditCreate && (
                                permit.status === 'Draft'
                                || permit.status === 'Pending Approval'
                                || permit.status === 'Work in Progress'
                            );

                            return (
                                <tr key={permit.id || index} className={`transition-colors hover:bg-slate-800/50 ${permit.status === 'Closed' ? 'opacity-60' : ''}`}>
                                    <td className="p-4 pl-6 font-mono text-xs font-bold text-white">{permit.id}</td>
                                    <td className="p-4">
                                        <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-widest shadow-sm ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                                            {typeConfig.label}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="max-w-xs truncate font-bold text-slate-200">{permit.description}</div>
                                        <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
                                            {permit.location} ({permit.siteId})
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(permit.status)}`}>
                                            {permit.status}
                                        </span>

                                        <div className="mt-2 flex flex-col gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    ENG: <span className={permit.engStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{permit.engStatus}</span>
                                                </span>
                                                {canReassign && !permit.engStatus.includes('Approved') && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setReassignModal({ permit, role: 'eng' });
                                                            setNewApproverEmail(permit.engApproverEmail);
                                                        }}
                                                        className="text-amber-500 transition hover:text-amber-400"
                                                        title="Reassign Eng Approver"
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    PROD: <span className={permit.prodStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{permit.prodStatus}</span>
                                                </span>
                                                {canReassign && !permit.prodStatus.includes('Approved') && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setReassignModal({ permit, role: 'prod' });
                                                            setNewApproverEmail(permit.prodApproverEmail);
                                                        }}
                                                        className="text-amber-500 transition hover:text-amber-400"
                                                        title="Reassign Prod Approver"
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="ml-auto flex min-w-[200px] flex-wrap justify-end gap-2 p-4 pr-6 text-right">
                                        {permit.status === 'Pending Approval' && amIEng && permit.engStatus === 'Pending' && (
                                            <button type="button" onClick={() => handleApproveInitiation(permit, 'eng')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-emerald-500">
                                                <i className="fas fa-check mr-1"></i> Apprv Eng
                                            </button>
                                        )}
                                        {permit.status === 'Pending Approval' && amIProd && permit.prodStatus === 'Pending' && (
                                            <button type="button" onClick={() => handleApproveInitiation(permit, 'prod')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-emerald-500">
                                                <i className="fas fa-check mr-1"></i> Apprv Prod
                                            </button>
                                        )}

                                        {permit.status === 'Work in Progress' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setInspectionObservation('');
                                                        setInspectionModal(permit);
                                                    }}
                                                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-orange-500"
                                                >
                                                    <i className="fas fa-search mr-1"></i> Inspect
                                                </button>
                                                {amICreator && (
                                                    <button type="button" onClick={() => handleRequestClosure(permit)} className="rounded-lg border border-slate-500 bg-slate-700 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-slate-600">
                                                        Close Work
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        {permit.status === 'Pending Closure' && amIEng && permit.engStatus === 'Closure Pending' && (
                                            <button type="button" onClick={() => handleApproveClosure(permit, 'eng')} className="rounded-lg bg-purple-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-purple-500">
                                                <i className="fas fa-check-double mr-1"></i> Verify Close Eng
                                            </button>
                                        )}
                                        {permit.status === 'Pending Closure' && amIProd && permit.prodStatus === 'Closure Pending' && (
                                            <button type="button" onClick={() => handleApproveClosure(permit, 'prod')} className="rounded-lg bg-purple-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-purple-500">
                                                <i className="fas fa-check-double mr-1"></i> Verify Close Prod
                                            </button>
                                        )}

                                        <button type="button" onClick={() => triggerPrint(permit)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-sm text-white shadow transition hover:bg-slate-700">
                                            <i className="fas fa-print"></i>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openForm(permit)}
                                            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-sm text-white shadow transition ${canEditPermitRow ? 'hover:bg-amber-600' : 'hover:bg-slate-700'}`}
                                        >
                                            <i className={`fas ${canEditPermitRow ? 'fa-edit' : 'fa-eye'}`}></i>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {visiblePermits.length === 0 && (
                            <tr>
                                <td colSpan={5} className="border-t border-slate-800 p-16 text-center text-base italic text-slate-500">
                                    No permits found for authorized locations.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function PermitBuilderView(props) {
    const {
        addNonCompliance,
        addWmsRow,
        allowedSites,
        availableContractors,
        availableWorkers,
        canEditForm,
        formData,
        handleSave,
        handleTypeChange,
        isGlobalUser,
        lotoProcedures,
        myEmail,
        myName,
        newNC,
        removeNonCompliance,
        removeWmsRow,
        saving,
        setCurrentView,
        setFormData,
        setInspectionModal,
        setInspectionObservation,
        setNewNC,
        toggleChecklistItem,
        togglePPE,
        toggleWahEquip,
        toggleWorker,
        triggerPrint,
        updateField,
        updateWmsRow,
        users
    } = props;

    return (
        <div className="mx-auto max-w-5xl animate-fade-in p-6 font-['Space_Grotesk'] md:p-8">
            <div className="mb-8 flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="text-3xl font-bold text-white">Permit Builder</h2>
                <div className="flex gap-3">
                    <button type="button" onClick={() => setCurrentView('inventory')} className="rounded-xl px-5 py-2.5 font-['Inter'] text-sm font-bold text-slate-400 transition hover:text-white">
                        Cancel
                    </button>

                    {formData.status === 'Draft' && canEditForm ? (
                        <>
                            <button type="button" onClick={() => handleSave(true)} className="rounded-xl border border-slate-600 bg-slate-800 px-6 py-2.5 font-['Inter'] text-sm font-bold text-white shadow transition hover:bg-slate-700">
                                Save Draft
                            </button>
                            <button type="button" onClick={() => handleSave(false)} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-8 py-2.5 font-['Inter'] text-sm font-bold text-white shadow-lg shadow-emerald-900/50 transition hover:from-emerald-500 hover:to-teal-400">
                                <i className="fas fa-paper-plane"></i> Submit for Authorization
                            </button>
                        </>
                    ) : (
                        <button type="button" onClick={() => triggerPrint(formData)} className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-6 py-2.5 font-['Inter'] text-sm font-bold text-white shadow transition hover:bg-slate-700">
                            <i className="fas fa-print"></i> Print Permit
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-8 font-['Inter']">
                <div className="rounded-3xl border-t-4 border-amber-500 bg-slate-800/80 p-8 shadow-xl">
                    <div className="mb-6 flex items-center justify-between border-b border-slate-700 pb-4 font-['Space_Grotesk']">
                        <h3 className="flex items-center gap-3 text-xl font-bold text-white">
                            <i className="fas fa-info-circle text-amber-500"></i> Section 1: Job Context
                        </h3>
                        <div className="flex items-center gap-3">
                            <span className={`rounded border px-3 py-1 text-[10px] font-bold uppercase tracking-widest shadow-sm ${getStatusColor(formData.status)}`}>
                                {formData.status}
                            </span>
                            <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs font-bold text-white shadow-inner">
                                {formData.id}
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Permit Category</label>
                            <select value={formData.typeId} onChange={(event) => handleTypeChange(event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="border border-amber-900/50 font-bold text-amber-400 shadow-inner">
                                {PERMIT_TYPES.map((type) => (
                                    <option key={type.id} value={type.id}>
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Site / Facility</label>
                            <select
                                value={formData.siteId}
                                onChange={(event) => {
                                    updateField('siteId', event.target.value);
                                    setFormData((prev) => ({ ...prev, contractorId: '', entrantNames: [] }));
                                }}
                                disabled={formData.status !== 'Draft' || (!isGlobalUser && allowedSites.length <= 1) || !canEditForm}
                                className="font-bold text-white shadow-inner"
                            >
                                {(isGlobalUser || allowedSites.length > 1) && <option value="">Select Authorized Site...</option>}
                                {allowedSites.map((site) => (
                                    <option key={site.code} value={site.code}>
                                        {site.name} ({site.code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mt-2 border-t border-slate-700 pt-6 md:col-span-2">
                            <div className="mb-4 flex gap-4">
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-300">
                                    <input type="radio" value="Internal" checked={formData.workerType === 'Internal'} onChange={() => setFormData({ ...formData, workerType: 'Internal', contractorId: '', entrantNames: [] })} disabled={formData.status !== 'Draft' || !canEditForm} className="h-4 w-4 accent-amber-500" />
                                    Internal Staff
                                </label>
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-300">
                                    <input type="radio" value="Contractor" checked={formData.workerType === 'Contractor'} onChange={() => setFormData({ ...formData, workerType: 'Contractor', entrantNames: [] })} disabled={formData.status !== 'Draft' || !canEditForm} className="h-4 w-4 accent-amber-500" />
                                    External Contractor
                                </label>
                            </div>

                            {formData.workerType === 'Contractor' && (
                                <div className="mb-4">
                                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-amber-400">Select Authorized Vendor</label>
                                    <select value={formData.contractorId} onChange={(event) => setFormData({ ...formData, contractorId: event.target.value, entrantNames: [] })} disabled={formData.status !== 'Draft' || !canEditForm} className="w-full rounded-lg border border-amber-500/30 bg-amber-900/10 p-3 font-bold text-amber-300 outline-none shadow-inner focus:border-amber-500">
                                        <option value="">{formData.siteId ? 'Select Contractor...' : 'Select Site First'}</option>
                                        {availableContractors.map((contractor) => (
                                            <option key={contractor.firebaseKey} value={contractor.firebaseKey}>
                                                {contractor.companyName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {((formData.workerType === 'Internal' && formData.siteId) || (formData.workerType === 'Contractor' && formData.contractorId)) && (
                                <div>
                                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Assign Execution Team (Workers)</label>
                                    <div className="max-h-48 flex-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/50 p-2 pr-2 custom-scroll">
                                        {availableWorkers.length > 0 ? availableWorkers.map((worker, index) => {
                                            const workerName = worker.name || worker.email;
                                            const isChecked = safeArr(formData.entrantNames).includes(workerName);
                                            return (
                                                <label key={`${workerName}-${index}`} className="mb-1 flex cursor-pointer items-center gap-3 rounded border border-transparent p-2 transition hover:border-slate-600 hover:bg-slate-800">
                                                    <input type="checkbox" checked={isChecked} onChange={() => formData.status === 'Draft' && canEditForm && toggleWorker(workerName)} disabled={formData.status !== 'Draft' || !canEditForm} className="h-4 w-4 cursor-pointer accent-amber-500" />
                                                    <div>
                                                        <div className="text-xs font-bold text-white">{workerName}</div>
                                                        <div className="text-[9px] uppercase tracking-widest text-slate-500">{worker.role || 'Worker'}</div>
                                                    </div>
                                                </label>
                                            );
                                        }) : (
                                            <div className="p-4 text-center text-xs italic text-slate-500">No workers available. Ensure Site and Team Type are selected.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Issuing Department</label>
                            <input value={formData.issuingDept} onChange={(event) => updateField('issuingDept', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. Maintenance, Production" className="shadow-inner" />
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Supervisor / In-Charge</label>
                            <input value={formData.issuedToName} onChange={(event) => updateField('issuedToName', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Supervisor Name" className="shadow-inner" />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Detailed Work Description</label>
                            <textarea rows="3" value={formData.description} onChange={(event) => updateField('description', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Describe the exact nature of the work, tools used, and method..." className="resize-none font-medium text-white shadow-inner custom-scroll"></textarea>
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Specific Area / Location</label>
                            <input value={formData.location} onChange={(event) => updateField('location', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. Roof of Boiler Room" className="shadow-inner" />
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Equipment Involved (Optional)</label>
                            <input value={formData.equipment} onChange={(event) => updateField('equipment', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. HVAC Unit B" className="shadow-inner" />
                        </div>
                    </div>
                </div>

                {formData.typeId === 'HOT' && (
                    <div className="animate-fade-in rounded-3xl border border-red-500/30 bg-red-900/20 p-8 shadow-xl">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-red-400 font-['Space_Grotesk']">
                            <i className="fas fa-fire"></i> Hot Work Specifics
                        </h3>
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-300">Name of Fire Watcher</label>
                        <input value={formData.fireWatcherName} onChange={(event) => updateField('fireWatcherName', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Designated Fire Watcher Name" className="border border-red-900/50 shadow-inner focus:border-red-500" />
                    </div>
                )}

                {formData.typeId === 'CSE' && (
                    <div className="animate-fade-in space-y-6 rounded-3xl border border-purple-500/30 bg-purple-900/20 p-8 shadow-xl">
                        <h4 className="border-b border-purple-500/30 pb-2 text-sm font-bold uppercase tracking-widest text-purple-400 font-['Space_Grotesk']">
                            <i className="fas fa-door-open mr-1"></i> CSE Personnel
                        </h4>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-300">Attendant Name (Standby)</label>
                                <input value={formData.attendantName} onChange={(event) => updateField('attendantName', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Person outside space..." className="border border-purple-900/50 shadow-inner focus:border-purple-500" />
                            </div>
                            <div>
                                <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-300">Entry Supervisor</label>
                                <input value={formData.entrySupervisorName} onChange={(event) => updateField('entrySupervisorName', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="Supervisor authorizing..." className="border border-purple-900/50 shadow-inner focus:border-purple-500" />
                            </div>

                            <h4 className="mt-4 border-b border-purple-500/30 pb-2 text-sm font-bold uppercase tracking-widest text-purple-400 font-['Space_Grotesk'] md:col-span-2">
                                <i className="fas fa-wind mr-1"></i> Pre-Entry Gas Test Results
                            </h4>
                            <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Oxygen Level (&gt;19.5%)</label>
                                <input value={formData.oxygenLevel} onChange={(event) => updateField('oxygenLevel', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. 20.9%" className="border border-purple-900/50 font-mono shadow-inner" />
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Flammability (LEL &lt; 10%)</label>
                                <input value={formData.flammability} onChange={(event) => updateField('flammability', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. 0%" className="border border-purple-900/50 font-mono shadow-inner" />
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Toxic Gas Concentration</label>
                                <input value={formData.toxicGas} onChange={(event) => updateField('toxicGas', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} placeholder="e.g. H2S 0ppm" className="border border-purple-900/50 font-mono shadow-inner" />
                            </div>
                        </div>
                    </div>
                )}

                {formData.typeId === 'ELE' && (
                    <div className="animate-fade-in rounded-3xl border border-amber-500/30 bg-amber-900/10 p-8 shadow-xl">
                        <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-amber-400 font-['Space_Grotesk']">
                            <i className="fas fa-lock mr-2"></i> LOTO Linkage Required
                        </label>
                        <select value={formData.lotoRef} onChange={(event) => updateField('lotoRef', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="border border-amber-900/50 p-4 text-base font-bold text-white shadow-inner focus:border-amber-500">
                            <option value="">-- Select Active Approved LOTO Procedure --</option>
                            {lotoProcedures
                                .filter((procedure) => procedure.status === 'Approved' && (procedure.facility === formData.siteId || !formData.siteId))
                                .map((procedure) => (
                                    <option key={procedure.id} value={procedure.id}>
                                        {procedure.id} - {procedure.description}
                                    </option>
                                ))}
                        </select>
                        <p className="mt-3 text-xs text-slate-500">
                            <i className="fas fa-info-circle mr-1"></i> Electrical permits require a designated energy isolation protocol to be selected before authorization.
                        </p>
                    </div>
                )}

                {formData.typeId === 'WAH' && (
                    <div className="animate-fade-in rounded-3xl border border-blue-500/30 bg-blue-900/10 p-8 shadow-xl">
                        <label className="mb-5 block text-sm font-bold uppercase tracking-widest text-blue-400 font-['Space_Grotesk']">
                            <i className="fas fa-arrow-up mr-2"></i> Height Access Equipment to be used
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {WAH_EQUIP_OPTIONS.map((equipment) => (
                                <label key={equipment} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-5 py-3 transition-all ${safeArr(formData.wahEquipment).includes(equipment) ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:bg-slate-800'}`}>
                                    <input type="checkbox" checked={safeArr(formData.wahEquipment).includes(equipment)} onChange={() => formData.status === 'Draft' && toggleWahEquip(equipment)} disabled={formData.status !== 'Draft' || !canEditForm} className="hidden" />
                                    <span className="text-sm font-bold">{equipment}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div className="rounded-3xl border border-slate-700 bg-slate-800/80 p-8 shadow-xl">
                    <h3 className="mb-6 flex items-center gap-3 border-b border-slate-700 pb-4 text-xl font-bold text-white font-['Space_Grotesk']">
                        <i className="fas fa-clock text-amber-500"></i> Section 2: Validity Window
                    </h3>
                    <div className="grid grid-cols-2 gap-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-6 shadow-inner md:grid-cols-4">
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Valid From (Date)</label>
                            <input type="date" value={formData.validFromDate} onChange={(event) => updateField('validFromDate', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="border border-slate-800 font-mono shadow-inner" />
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Start Time</label>
                            <input type="time" value={formData.validFromTime} onChange={(event) => updateField('validFromTime', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="border border-slate-800 font-mono shadow-inner" />
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Valid To (Date)</label>
                            <input type="date" value={formData.validToDate} onChange={(event) => updateField('validToDate', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="border border-slate-800 font-mono shadow-inner" />
                        </div>
                        <div>
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">End Time</label>
                            <input type="time" value={formData.validToTime} onChange={(event) => updateField('validToTime', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="border border-slate-800 font-mono shadow-inner" />
                        </div>
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-700 bg-slate-800/80 p-8 shadow-xl">
                    <div className="mb-6 flex items-center justify-between border-b border-slate-700 pb-4 font-['Space_Grotesk']">
                        <h3 className="flex items-center gap-3 text-xl font-bold text-white">
                            <i className="fas fa-tasks text-amber-500"></i> Section 3: Work Method Statement
                        </h3>
                        {formData.status === 'Draft' && canEditForm && (
                            <button type="button" onClick={addWmsRow} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition hover:bg-emerald-500">
                                <i className="fas fa-plus"></i> Add Step
                            </button>
                        )}
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-700 shadow-2xl">
                        <table className="w-full min-w-[800px] text-left text-sm">
                            <thead className="border-b border-slate-800 bg-slate-900 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                <tr>
                                    <th className="w-12 p-4 text-center">#</th>
                                    <th className="w-1/3 p-4">Work Step / Activity</th>
                                    <th className="w-1/3 p-4">Possible Hazard</th>
                                    <th className="w-1/3 p-4">Control / Precaution</th>
                                    <th className="w-12 p-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 bg-slate-950/80">
                                {safeArr(formData.wms).map((row, index) => (
                                    <tr key={index} className="transition-colors hover:bg-slate-900">
                                        <td className="p-4 text-center font-bold text-slate-500">{index + 1}</td>
                                        <td className="p-3">
                                            <textarea rows="2" value={row?.step || ''} onChange={(event) => updateWmsRow(index, 'step', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="h-full resize-none border border-transparent bg-transparent px-3 py-2 text-sm text-white outline-none transition-colors hover:border-slate-800 focus:border-amber-500 custom-scroll" placeholder="What are you doing?"></textarea>
                                        </td>
                                        <td className="p-3">
                                            <textarea rows="2" value={row?.hazard || ''} onChange={(event) => updateWmsRow(index, 'hazard', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="h-full resize-none border border-transparent bg-transparent px-3 py-2 text-sm text-red-200 outline-none transition-colors hover:border-slate-800 focus:border-red-500 custom-scroll" placeholder="What could go wrong?"></textarea>
                                        </td>
                                        <td className="p-3">
                                            <textarea rows="2" value={row?.precaution || ''} onChange={(event) => updateWmsRow(index, 'precaution', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="h-full resize-none border border-transparent bg-transparent px-3 py-2 text-sm text-emerald-200 outline-none transition-colors hover:border-slate-800 focus:border-emerald-500 custom-scroll" placeholder="How to prevent it?"></textarea>
                                        </td>
                                        <td className="p-3 text-center">
                                            {formData.status === 'Draft' && canEditForm && safeArr(formData.wms).length > 1 && (
                                                <button type="button" onClick={() => removeWmsRow(index)} className="rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-red-500 transition-colors hover:bg-red-600 hover:text-white">
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-700 bg-slate-800/80 p-8 shadow-xl">
                    <h3 className="mb-6 flex items-center gap-3 border-b border-slate-700 pb-4 text-xl font-bold text-white font-['Space_Grotesk']">
                        <i className="fas fa-clipboard-check text-amber-500"></i> Section 4: Standard Safety Checks
                    </h3>

                    <div className="mb-10">
                        <label className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Required General PPE</label>
                        <div className="flex flex-wrap gap-4">
                            {COMMON_PPE.map((ppe) => (
                                <label key={ppe} className={`flex items-center gap-3 rounded-xl border-2 px-5 py-3 transition-all ${safeArr(formData.ppe).includes(ppe) ? 'border-amber-500 bg-amber-900/20 text-amber-400 shadow-lg shadow-amber-900/30' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:bg-slate-800'}`}>
                                    <input type="checkbox" checked={safeArr(formData.ppe).includes(ppe)} onChange={() => formData.status === 'Draft' && togglePPE(ppe)} disabled={formData.status !== 'Draft' || !canEditForm} className="h-4 w-4 accent-amber-500" />
                                    <span className="text-sm font-bold">{ppe}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-slate-700 pt-8">
                        <label className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Pre-Work Verification Checklist ({getTypeConfig(formData.typeId).label})
                        </label>
                        <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-6 shadow-inner">
                            {safeArr(formData.checklist).map((item, index) => (
                                <label key={`${item?.label || 'check'}-${index}`} className={`group flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors ${item?.checked ? 'border-emerald-500/30 bg-emerald-900/10 shadow-inner' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                                    <input type="checkbox" checked={item?.checked || false} onChange={() => formData.status === 'Draft' && toggleChecklistItem(index)} disabled={formData.status !== 'Draft' || !canEditForm} className="mt-0.5 h-5 w-5 accent-emerald-500" />
                                    <span className={`text-base font-medium ${item?.checked ? 'text-emerald-400' : 'text-slate-300 group-hover:text-white'}`}>{item?.label || ''}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {formData.firebaseKey && formData.status !== 'Draft' && (
                    <div className="rounded-3xl border-x border-b border-red-500/30 border-t-4 border-red-500 bg-red-950/20 p-8 shadow-xl">
                        <h3 className="mb-6 flex items-center gap-3 border-b border-red-500/30 pb-4 text-xl font-bold text-white font-['Space_Grotesk']">
                            <i className="fas fa-exclamation-triangle text-red-500"></i> Permit Non-Compliances
                        </h3>
                        <p className="mb-6 text-xs text-slate-300">Log any safety violations observed during the execution of this permit. If this is a Contractor permit, these will be permanently recorded in the vendor&apos;s profile.</p>

                        <div className="mb-6 space-y-3">
                            {safeArr(formData.nonCompliances).map((entry) => (
                                <div key={entry.id} className="group flex items-start justify-between rounded-xl border border-red-500/50 bg-red-950/40 p-4 shadow-inner">
                                    <div>
                                        <div className="mb-1 text-sm font-bold text-white">{entry.desc}</div>
                                        <div className="font-mono text-[10px] text-red-400">{entry.date}</div>
                                    </div>
                                    {canEditForm && (
                                        <button type="button" onClick={() => removeNonCompliance(entry.id)} className="rounded bg-red-900/50 px-2 py-1 text-red-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-600 hover:text-white">
                                            <i className="fas fa-trash-alt text-xs"></i>
                                        </button>
                                    )}
                                </div>
                            ))}
                            {safeArr(formData.nonCompliances).length === 0 && <div className="p-4 text-center text-sm italic text-slate-500">No violations recorded.</div>}
                        </div>

                        {canEditForm && (
                            <div className="flex gap-2">
                                <input value={newNC} onChange={(event) => setNewNC(event.target.value)} placeholder="Describe violation (e.g. Worker not wearing safety harness)..." className="flex-1 rounded-xl border border-red-900/50 bg-slate-950 p-3 text-sm text-white outline-none shadow-inner focus:border-red-500" />
                                <button type="button" onClick={addNonCompliance} className="rounded-xl bg-red-600 px-6 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-transform active:scale-95 hover:bg-red-500">
                                    <i className="fas fa-plus mr-2"></i> Log NC
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="rounded-3xl border-t-4 border-emerald-500 bg-slate-800/80 p-8 shadow-xl">
                    <h3 className="mb-6 flex items-center gap-3 border-b border-slate-700 pb-4 text-xl font-bold text-white font-['Space_Grotesk']">
                        <i className="fas fa-users-cog text-emerald-500"></i> Section 5: Dual Authorization Routing
                    </h3>
                    <p className="mb-6 font-['Inter'] text-sm text-slate-400">Select the required approvers to review and activate this permit. Both parties must approve before work can commence.</p>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-6">
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                <i className="fas fa-cogs mr-1"></i> Engineering Approver
                            </label>
                            <select value={formData.engApproverEmail} onChange={(event) => updateField('engApproverEmail', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-bold text-white outline-none shadow-inner focus:border-emerald-500">
                                <option value="">-- Select Engineering Auth --</option>
                                <option value={myEmail} className="bg-slate-800 font-bold text-emerald-400">Assign to Me ({myName})</option>
                                {users.filter((user) => user.assignedSite === formData.siteId || safeArr(user.accessibleSites).includes(formData.siteId) || user.assignedSite === 'GLOBAL').map((user) => (
                                    <option key={`eng-${user.id}`} value={user.email || user.name}>
                                        {user.name} ({user.email || 'System Auth'})
                                    </option>
                                ))}
                            </select>
                            {formData.status !== 'Draft' && (
                                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                                    Status: <span className={formData.engStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{formData.engStatus}</span>
                                </p>
                            )}
                        </div>

                        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-6">
                            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                <i className="fas fa-industry mr-1"></i> Production Approver
                            </label>
                            <select value={formData.prodApproverEmail} onChange={(event) => updateField('prodApproverEmail', event.target.value)} disabled={formData.status !== 'Draft' || !canEditForm} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-bold text-white outline-none shadow-inner focus:border-emerald-500">
                                <option value="">-- Select Production Auth --</option>
                                <option value={myEmail} className="bg-slate-800 font-bold text-emerald-400">Assign to Me ({myName})</option>
                                {users.filter((user) => user.assignedSite === formData.siteId || safeArr(user.accessibleSites).includes(formData.siteId) || user.assignedSite === 'GLOBAL').map((user) => (
                                    <option key={`prod-${user.id}`} value={user.email || user.name}>
                                        {user.name} ({user.email || 'System Auth'})
                                    </option>
                                ))}
                            </select>
                            {formData.status !== 'Draft' && (
                                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                                    Status: <span className={formData.prodStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{formData.prodStatus}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4 border-t border-slate-800 pt-6">
                {formData.firebaseKey && (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setInspectionObservation('');
                                setInspectionModal(formData);
                            }}
                            className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition hover:bg-orange-500"
                        >
                            <i className="fas fa-search"></i> Inspect Area
                        </button>
                        <button type="button" onClick={() => triggerPrint(formData)} className="flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition hover:bg-slate-700">
                            <i className="fas fa-print"></i> Print
                        </button>
                    </>
                )}
                <div className="flex-1"></div>
                <button type="button" onClick={() => setCurrentView('dashboard')} className="rounded-xl border border-slate-700 px-6 py-3 text-xs font-bold uppercase tracking-widest text-slate-400 transition hover:text-white">
                    Close Form
                </button>
                {canEditForm && (
                    <button type="button" onClick={() => handleSave(formData.status === 'Draft')} disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-10 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:opacity-50">
                        {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                        {formData.status === 'Draft' ? 'Save Draft' : 'Update Permit'}
                    </button>
                )}
            </div>
        </div>
    );
}

function InspectionModal({ inspectionModal, inspectionObservation, onClose, onChange, onSubmit }) {
    if (!inspectionModal) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg animate-fade-in rounded-3xl border border-slate-700 bg-slate-900 p-8 font-['Space_Grotesk'] shadow-2xl">
                <h2 className="mb-2 text-xl font-bold text-white">
                    <i className="fas fa-search mr-2 text-orange-500"></i> Conduct Inspection
                </h2>
                <p className="mb-6 text-xs text-slate-400">
                    Location: <span className="font-bold text-fuchsia-400">{inspectionModal.location}</span>
                </p>

                <label className="mb-2 block text-[10px] font-bold uppercase text-slate-400">Observation Notes</label>
                <textarea value={inspectionObservation} onChange={(event) => onChange(event.target.value)} rows="4" className="mb-6 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-['Inter'] text-sm text-white outline-none focus:border-orange-500" placeholder="Log site conditions, PPE usage, etc..."></textarea>

                <div className="flex flex-col gap-3">
                    <button type="button" onClick={() => onSubmit(false)} className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-emerald-500">
                        <i className="fas fa-check-circle mr-2"></i> Log as Safe & Continue
                    </button>
                    <button type="button" onClick={() => onSubmit(true)} className="w-full rounded-xl border border-red-500/50 bg-red-900/50 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-red-600">
                        <i className="fas fa-ban mr-2"></i> Log Unsafe (Cancel Permit)
                    </button>
                    <button type="button" onClick={onClose} className="mt-2 w-full rounded-xl bg-slate-800 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-slate-700">
                        Close Menu
                    </button>
                </div>
            </div>
        </div>
    );
}

function ReassignModal({ newApproverEmail, onCancel, onConfirm, onSelect, reassignModal, users }) {
    if (!reassignModal) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md animate-fade-in rounded-3xl border border-slate-700 bg-slate-900 p-8 font-['Space_Grotesk'] shadow-2xl">
                <h2 className="mb-2 text-xl font-bold text-white">
                    <i className="fas fa-user-edit mr-2 text-amber-500"></i> Reassign Approver
                </h2>
                <p className="mb-6 text-xs leading-relaxed text-slate-400">
                    Select a new <strong className="text-white">{reassignModal.role === 'eng' ? 'Engineering' : 'Production'}</strong> approver for Permit{' '}
                    <span className="font-mono text-amber-400">{reassignModal.permit.id}</span>.
                </p>

                <select value={newApproverEmail} onChange={(event) => onSelect(event.target.value)} className="mb-6 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm font-bold text-white outline-none focus:border-amber-500">
                    <option value="">-- Select New Approver --</option>
                    {users.filter((user) => user.assignedSite === reassignModal.permit.siteId || safeArr(user.accessibleSites).includes(reassignModal.permit.siteId) || user.assignedSite === 'GLOBAL').map((user) => (
                        <option key={user.id} value={user.email || user.name}>
                            {user.name} ({user.email || 'System Auth'})
                        </option>
                    ))}
                </select>

                <div className="flex gap-3">
                    <button type="button" onClick={onConfirm} className="flex-1 rounded-xl bg-amber-600 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all shadow-lg hover:bg-amber-500">
                        Confirm
                    </button>
                    <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-slate-700">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

function PrintView({ printData, qrImage }) {
    if (!printData) return null;
    return (
        <div className="hidden w-full bg-white p-8 text-black print:block" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <div className="mb-6 flex items-center justify-between border-b-2 border-black pb-4">
                <div className="w-3/4 text-left">
                    <div className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">OHSMS - FORMAL RECORD (ISO 45001)</div>
                    <h1 className="m-0 p-0 text-2xl font-black uppercase leading-tight">{getTypeConfig(printData.typeId).label}</h1>
                </div>
                <div className="flex w-1/4 justify-end text-right">
                    {qrImage && <img src={qrImage} alt="QR Code" className="h-24 w-24 border-2 border-black p-1" />}
                </div>
            </div>

            <div className="mb-6 border border-black bg-gray-50 p-4">
                <table className="w-full border-none text-sm">
                    <tbody>
                        <tr>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 font-bold">Permit No:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-mono text-lg font-black">{printData.id}</td>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 pl-4 font-bold">Status:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-bold uppercase">{printData.status}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 font-bold">Facility:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-bold">{printData.siteId}</td>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 pl-4 font-bold">Location:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-bold">{printData.location}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 font-bold">Issuing Dept:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5">{printData.issuingDept || 'N/A'}</td>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 pl-4 font-bold">Equipment:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5">{printData.equipment || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] align-top border-none py-1.5 font-bold">Execution Team:</td>
                            <td className="w-[35%] align-top border-none py-1.5 font-bold">
                                {printData.workerType === 'Contractor' ? `[Contractor] ${printData.contractorName}` : '[Internal]'} <br />
                                Supervised By: {printData.issuedToName} (Ph: {printData.issuedToPh}) <br />
                                Workers: {safeArr(printData.entrantNames).join(', ') || 'None Assigned'}
                            </td>
                            <td className="w-[15%] align-top border-none py-1.5 pl-4 font-bold">Validity:</td>
                            <td className="w-[35%] align-top border-none py-1.5 font-mono font-bold">
                                {printData.validFromDate} to {printData.validToDate}
                                <br />
                                {printData.validFromTime} - {printData.validToTime}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mb-6">
                <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">1. Description of Work</h2>
                <div className="min-h-[60px] border border-black p-3 text-sm leading-relaxed">{printData.description}</div>
            </div>

            <div className="page-break-inside-avoid mb-6">
                <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">2. Work Method Statement (WMS)</h2>
                <table className="m-0 w-full border-collapse border border-black text-sm">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="w-10 border border-black p-2 text-center">#</th>
                            <th className="w-1/3 border border-black p-2">Step / Activity</th>
                            <th className="w-1/3 border border-black p-2">Possible Hazard</th>
                            <th className="w-1/3 border border-black p-2">Control / Precaution</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeArr(printData.wms).map((row, index) => (
                            <tr key={index}>
                                <td className="border border-black p-2 text-center font-bold">{index + 1}</td>
                                <td className="border border-black p-2">{row?.step || ''}</td>
                                <td className="border border-black p-2">{row?.hazard || ''}</td>
                                <td className="border border-black p-2">{row?.precaution || ''}</td>
                            </tr>
                        ))}
                        {safeArr(printData.wms).length === 0 && (
                            <tr>
                                <td colSpan={4} className="border border-black p-2 text-center italic">
                                    No steps recorded.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="page-break-inside-avoid mb-6 flex gap-6">
                <div className="w-1/2">
                    <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">3. Required PPE</h2>
                    <div className="min-h-[100px] border border-black p-4 text-sm leading-loose">
                        {safeArr(printData.ppe).length > 0 ? safeArr(printData.ppe).join(', ') : 'Standard PPE Only'}
                    </div>
                </div>
                <div className="w-1/2">
                    <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">4. Pre-Work Verification</h2>
                    <div className="min-h-[100px] space-y-2 border border-black p-4 text-xs">
                        {safeArr(printData.checklist).map((check, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <div className="mt-0.5 h-3 w-3 shrink-0 border border-black" style={{ backgroundColor: check?.checked ? 'black' : 'transparent' }}></div>
                                <span>{check?.label || ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {(printData.typeId === 'HOT' || printData.typeId === 'CSE' || printData.typeId === 'ELE' || printData.typeId === 'WAH') && (
                <div className="page-break-inside-avoid mb-6 border-2 border-black bg-gray-50 p-4">
                    <h2 className="mb-3 text-sm font-bold uppercase underline">Specialized Controls</h2>
                    <table className="w-full border-none text-sm">
                        <tbody>
                            {printData.typeId === 'HOT' && (
                                <tr>
                                    <td className="w-1/4 py-1 font-bold">Fire Watcher Name:</td>
                                    <td className="py-1">{printData.fireWatcherName || 'N/A'}</td>
                                </tr>
                            )}
                            {printData.typeId === 'ELE' && (
                                <tr>
                                    <td className="w-1/4 py-1 font-bold">LOTO Procedure Ref:</td>
                                    <td className="py-1 font-mono font-bold">{printData.lotoRef || 'N/A'}</td>
                                </tr>
                            )}
                            {printData.typeId === 'WAH' && (
                                <tr>
                                    <td className="w-1/4 align-top py-1 font-bold">Height Access Equip:</td>
                                    <td className="py-1">{safeArr(printData.wahEquipment).join(', ')}</td>
                                </tr>
                            )}
                            {printData.typeId === 'CSE' && (
                                <>
                                    <tr>
                                        <td className="border-b border-gray-300 py-1 font-bold">Attendant:</td>
                                        <td className="border-b border-gray-300 py-1">{printData.attendantName}</td>
                                        <td className="border-b border-gray-300 py-1 pl-4 font-bold">Supervisor:</td>
                                        <td className="border-b border-gray-300 py-1">{printData.entrySupervisorName}</td>
                                    </tr>
                                    <tr>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 font-bold">Oxygen:</td>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 font-mono">{printData.oxygenLevel}</td>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 pl-4 font-bold">Toxic Gas:</td>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 font-mono">{printData.toxicGas}</td>
                                    </tr>
                                    <tr>
                                        <td className="border-none py-1 font-bold">Flammability:</td>
                                        <td colSpan={3} className="border-none py-1 font-mono">
                                            {printData.flammability}
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="page-break-inside-avoid mt-8 border-2 border-black">
                <h2 className="border-b-2 border-black bg-gray-200 p-2 text-center text-sm font-bold uppercase">5. Dual Authorization Signatures</h2>
                <p className="border-b border-gray-300 bg-gray-50 p-1.5 text-center text-[10px] italic">By signing, I confirm the area is safe, precautions are implemented, and workers are briefed.</p>
                <table className="w-full border-none text-sm">
                    <tbody>
                        <tr>
                            <td className="h-32 w-1/3 border-r border-black p-4 align-top">
                                <strong className="mb-6 block text-xs uppercase tracking-widest text-gray-500">Requested By:</strong>
                                Name: <strong className="text-base">{printData.creatorEmail || printData.requestedBy}</strong>
                                <br />
                                <br />
                                <br />
                                Sign: __________________
                            </td>
                            <td className="h-32 w-1/3 border-r border-black p-4 align-top">
                                <strong className="mb-6 block text-xs uppercase tracking-widest text-gray-500">Engineering Approval:</strong>
                                Name: <strong className="text-base">{printData.engApproverEmail || '________________'}</strong>
                                <br />
                                Status: {printData.engStatus}
                                <br />
                                <br />
                                Sign: __________________
                            </td>
                            <td className="h-32 w-1/3 p-4 align-top">
                                <strong className="mb-6 block text-xs uppercase tracking-widest text-gray-500">Production Approval:</strong>
                                Name: <strong className="text-base">{printData.prodApproverEmail || '________________'}</strong>
                                <br />
                                Status: {printData.prodStatus}
                                <br />
                                <br />
                                Sign/Time: __________________
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
                System Generated Document - Verify Live Status via QR Code
            </div>
        </div>
    );
}

export default function FullScreenPTW() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState('dashboard');
    const [saving, setSaving] = useState(false);

    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [contractors, setContractors] = useState([]);
    const [lotoProcedures, setLotoProcedures] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [permits, setPermits] = useState([]);

    const [printData, setPrintData] = useState(null);
    const [qrImage, setQrImage] = useState(null);
    const [inspectionModal, setInspectionModal] = useState(null);
    const [inspectionObservation, setInspectionObservation] = useState('');
    const [newNC, setNewNC] = useState('');

    const [reassignModal, setReassignModal] = useState(null);
    const [newApproverEmail, setNewApproverEmail] = useState('');

    const [formData, setFormData] = useState(null);
    const [selectedPermitId, setSelectedPermitId] = useState(null);
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });

    const myName = session?.name || session?.user || 'Me';
    const myEmail = session?.email?.toLowerCase().trim() || '';

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('isoSession');
            if (!raw) {
                navigate('/');
                return;
            }

            const sess = JSON.parse(raw);
            const cleanRole = String(sess.role || '').trim();
            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(cleanRole);
            const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(cleanRole);
            const requestedSite = new URLSearchParams(location.search).get('site') || sessionStorage.getItem('isoCurrentSite') || sess.assignedSite || 'All';
            const hasModuleAccess = isGlobalAdmin || isSiteAdmin || safeArr(sess.accessibleModules).some((moduleName) => {
                const lowerModule = String(moduleName).toLowerCase();
                return lowerModule.includes('permit') || lowerModule.includes('ptw');
            });

            if (!hasModuleAccess) {
                alert('Security Alert: You do not have permission to access the Permit to Work module.');
                navigate(getPortalAwareHomePath({ fallbackPath: '/dashboard', site: requestedSite }));
                return;
            }

            setSession(sess);
            setPermissions({
                viewOnly: !['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(cleanRole),
                canDelete: ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(cleanRole),
                canEditCreate: ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(cleanRole)
            });

            const params = new URLSearchParams(location.search);
            let contextSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
            if (!isGlobalAdmin && contextSite === 'All') {
                contextSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL')
                    ? sess.assignedSite
                    : (safeArr(sess.accessibleSites)[0] || '');
            }
            setSiteFilter(contextSite);
            sessionStorage.setItem('isoCurrentSite', contextSite === 'All' ? 'GLOBAL' : contextSite);

            const loadData = async () => {
                try {
                    const snapshot = await get(ref(rtdb, `organizations/${sess.orgId}`));
                    if (!snapshot.exists()) {
                        setLoading(false);
                        return;
                    }
                    const data = snapshot.val();

                    if (data.sites) {
                        setSites(Object.keys(data.sites).map((key) => {
                            const siteValue = data.sites[key];
                            return typeof siteValue === 'object'
                                ? { code: siteValue.code || key, name: siteValue.name || siteValue.code || key }
                                : { code: siteValue, name: siteValue };
                        }));
                    }

                    if (data.users) {
                        setUsers(
                            Object.keys(data.users)
                                .map((key) => {
                                    const userValue = data.users[key];
                                    return typeof userValue === 'object'
                                        ? {
                                            id: key,
                                            name: userValue.name || userValue.email || 'System User',
                                            email: userValue.email || '',
                                            role: userValue.role || 'User',
                                            assignedSite: userValue.assignedSite,
                                            accessibleSites: safeArr(userValue.accessibleSites),
                                            status: userValue.status || 'Active'
                                        }
                                        : {
                                            id: key,
                                            name: userValue || 'System User',
                                            email: userValue || '',
                                            role: 'User',
                                            assignedSite: 'GLOBAL',
                                            accessibleSites: [],
                                            status: 'Active'
                                        };
                                })
                                .filter((user) => user.status !== 'Inactive' && user.status !== 'Deleted')
                        );
                    }

                    if (data.contractors) {
                        setContractors(Object.entries(data.contractors).map(([key, value]) => ({ ...value, firebaseKey: key })));
                    }

                    if (data.ptwRecords) {
                        setPermits(
                            safeArrayParse(data.ptwRecords)
                                .map(normalizePermit)
                                .sort((a, b) => new Date(b.createdDate || 0) - new Date(a.createdDate || 0))
                        );
                    }

                    if (data.lotoProcedures) {
                        setLotoProcedures(safeArrayParse(data.lotoProcedures));
                    }
                } catch (error) {
                    console.error('PTW data load error:', error);
                } finally {
                    setLoading(false);
                }
            };

            loadData();
        } catch (error) {
            console.error('PTW initialization error:', error);
            setLoading(false);
        }
    }, [location.search, navigate]);

    const isGlobalUser = useMemo(() => {
        if (!session) return false;
        const role = session.role || '';
        const site = session.assignedSite || '';
        const access = safeArr(session.accessibleSites);
        return role === 'Owner'
            || role === 'Admin'
            || role === 'Lead Auditor'
            || role === 'Global Owner'
            || role === 'Global Manager'
            || site === 'GLOBAL'
            || access.includes('GLOBAL');
    }, [session]);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set();
        if (session.assignedSite && session.assignedSite !== 'GLOBAL') codes.add(session.assignedSite);
        safeArr(session.accessibleSites).forEach((siteCode) => {
            if (siteCode && siteCode !== 'GLOBAL') codes.add(siteCode);
        });
        return codes;
    }, [session]);

    const allowedSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter((site) => allowedSiteCodes.has(site.code));
    }, [allowedSiteCodes, isGlobalUser, sites]);

    const handleSiteFilterChange = (event) => {
        const value = event.target.value;
        setSiteFilter(value);
        sessionStorage.setItem('isoCurrentSite', value === 'All' ? 'GLOBAL' : value);
    };

    const syncPtwQuery = (permitId = '') => {
        const params = new URLSearchParams(location.search);
        if (permitId) {
            params.set('ptw', permitId);
        } else {
            params.delete('ptw');
        }
        navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
    };

    const checkMatch = (target) => {
        if (!target) return false;
        const targetValue = String(target).toLowerCase().trim();
        const email = String(session?.email || '').toLowerCase().trim();
        const user = String(session?.user || '').toLowerCase().trim();
        const name = String(session?.name || '').toLowerCase().trim();
        return (email && targetValue === email) || (user && targetValue === user) || (name && targetValue === name);
    };

    const isEngApprover = (permit) => checkMatch(permit.engApproverEmail);
    const isProdApprover = (permit) => checkMatch(permit.prodApproverEmail);
    const isCreator = (permit) => checkMatch(permit.creatorEmail) || checkMatch(permit.requestedBy);

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!formData?.siteId) return true;
        return allowedSiteCodes.has(formData.siteId);
    }, [allowedSiteCodes, formData?.siteId, isGlobalUser, permissions.canEditCreate]);

    const visiblePermits = useMemo(() => {
        return permits.filter((permit) => {
            const hasSiteAccess = isGlobalUser || allowedSiteCodes.has(permit.siteId);
            if (!hasSiteAccess) return false;
            if (siteFilter !== 'All' && permit.siteId !== siteFilter) return false;
            return true;
        });
    }, [allowedSiteCodes, isGlobalUser, permits, siteFilter]);

    const selectedPermit = useMemo(() => {
        if (!selectedPermitId) return null;
        return permits.find((permit) => permit.id === selectedPermitId) || null;
    }, [permits, selectedPermitId]);

    const myPendingApprovals = useMemo(() => {
        return visiblePermits.filter((permit) => {
            const engMatch = isEngApprover(permit);
            const prodMatch = isProdApprover(permit);
            if (permit.status === 'Pending Approval') {
                return (engMatch && permit.engStatus === 'Pending') || (prodMatch && permit.prodStatus === 'Pending');
            }
            if (permit.status === 'Pending Closure') {
                return (engMatch && permit.engStatus === 'Closure Pending') || (prodMatch && permit.prodStatus === 'Closure Pending');
            }
            return false;
        });
    }, [visiblePermits]);

    useEffect(() => {
        if (loading || !session) return;
        const permitIdFromQuery = new URLSearchParams(location.search).get('ptw');
        if (!permitIdFromQuery) return;
        const permit = permits.find((entry) => entry.id === permitIdFromQuery);
        if (!permit) return;
        const hasSiteAccess = isGlobalUser || allowedSiteCodes.has(permit.siteId);
        if (!hasSiteAccess) return;
        setSelectedPermitId(permitIdFromQuery);
        if (currentView !== 'builder') {
            setCurrentView('viewer');
        }
    }, [allowedSiteCodes, currentView, isGlobalUser, loading, location.search, permits, session]);

    const availableContractors = useMemo(() => {
        if (!formData?.siteId) return [];
        return contractors.filter((contractor) => safeArr(contractor.allocatedSites).includes(formData.siteId) || contractor.siteId === 'GLOBAL');
    }, [contractors, formData?.siteId]);

    const availableWorkers = useMemo(() => {
        if (!formData) return [];
        if (formData.workerType === 'Internal') {
            return users.filter((user) => user.assignedSite === formData.siteId || safeArr(user.accessibleSites).includes(formData.siteId) || user.assignedSite === 'GLOBAL');
        }
        if (formData.workerType === 'Contractor' && formData.contractorId) {
            const vendor = contractors.find((contractor) => contractor.firebaseKey === formData.contractorId);
            return safeArr(vendor?.workers).filter((worker) => worker.deployedSite === formData.siteId || vendor?.siteId === 'GLOBAL');
        }
        return [];
    }, [contractors, formData, users]);

    const canInspectPermit = (permit) => {
        if (!permit || !session) return false;
        const hasSiteAccess = isGlobalUser || allowedSiteCodes.has(permit.siteId);
        return hasSiteAccess && permit.status === 'Work in Progress';
    };

    const openPermitViewer = (permit) => {
        if (!permit) return;
        setSelectedPermitId(permit.id);
        setCurrentView('viewer');
        syncPtwQuery(permit.id);
    };

    const closePermitViewer = () => {
        setSelectedPermitId(null);
        setCurrentView('inventory');
        syncPtwQuery('');
    };

    const openForm = (record = null) => {
        if (!record && !permissions.canEditCreate) {
            alert('Security Error: You do not have permission to create permits.');
            return;
        }
        setSelectedPermitId(null);
        syncPtwQuery('');
        setPrintData(null);
        if (record) {
            const permitToEdit = normalizePermit({ ...record });
            if (permitToEdit.wms.length === 0) permitToEdit.wms = [{ step: '', hazard: '', precaution: '' }];
            if (permitToEdit.ppe.length === 0) permitToEdit.ppe = ['Hard Hat', 'Safety Glasses', 'Safety Shoes'];
            if (permitToEdit.checklist.length === 0) {
                permitToEdit.checklist = (CHECKLIST_ITEMS[permitToEdit.typeId || 'GEN'] || CHECKLIST_ITEMS.GEN).map((item) => ({ label: item, checked: false }));
            }
            setFormData(permitToEdit);
        } else {
            const typeId = 'GEN';
            const defaultSite = (!isGlobalUser && allowedSites.length === 1) ? allowedSites[0].code : '';
            setFormData({
                id: `PTW-${Math.floor(100000 + Math.random() * 900000)}`,
                typeId,
                permitType: getTypeConfig(typeId).label,
                siteId: defaultSite,
                location: '',
                equipment: '',
                description: '',
                issuingDept: '',
                issuedToName: '',
                issuedToPh: '',
                fireWatcherName: '',
                attendantName: '',
                entrySupervisorName: '',
                workerType: 'Internal',
                contractorId: '',
                contractorName: '',
                entrantNames: [],
                oxygenLevel: '',
                toxicGas: '',
                flammability: '',
                lotoRef: '',
                wahEquipment: [],
                wms: [{ step: '', hazard: '', precaution: '' }],
                validFromDate: new Date().toISOString().split('T')[0],
                validFromTime: '08:00',
                validToDate: new Date().toISOString().split('T')[0],
                validToTime: '17:00',
                status: 'Draft',
                requestedBy: session?.user || session?.email,
                creatorEmail: session?.email || session?.user,
                createdDate: new Date().toISOString(),
                ppe: ['Hard Hat', 'Safety Glasses', 'Safety Shoes'],
                checklist: (CHECKLIST_ITEMS[typeId] || CHECKLIST_ITEMS.GEN).map((item) => ({ label: item, checked: false })),
                engApproverEmail: '',
                prodApproverEmail: '',
                engStatus: 'Pending',
                prodStatus: 'Pending',
                nonCompliances: []
            });
        }
        setCurrentView('builder');
    };

    const handleTypeChange = (newTypeId) => {
        if (!canEditForm) return;
        setFormData((prev) => ({
            ...prev,
            typeId: newTypeId,
            permitType: getTypeConfig(newTypeId).label,
            checklist: prev.status === 'Draft'
                ? (CHECKLIST_ITEMS[newTypeId] || CHECKLIST_ITEMS.GEN).map((item) => ({ label: item, checked: false }))
                : prev.checklist
        }));
    };

    const updateField = (field, value) => {
        if (!canEditForm) return;
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const toggleWorker = (name) => {
        setFormData((prev) => {
            const entrantNames = safeArr(prev.entrantNames);
            const exists = entrantNames.includes(name);
            return { ...prev, entrantNames: exists ? entrantNames.filter((entry) => entry !== name) : [...entrantNames, name] };
        });
    };

    const togglePPE = (item) => {
        if (!canEditForm) return;
        const current = [...safeArr(formData.ppe)];
        setFormData({ ...formData, ppe: current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item] });
    };

    const toggleChecklistItem = (index) => {
        if (!canEditForm) return;
        const checklist = [...safeArr(formData.checklist)];
        if (checklist[index]) {
            checklist[index] = { ...checklist[index], checked: !checklist[index].checked };
            setFormData({ ...formData, checklist });
        }
    };

    const addWmsRow = () => {
        if (canEditForm) setFormData((prev) => ({ ...prev, wms: [...safeArr(prev.wms), { step: '', hazard: '', precaution: '' }] }));
    };

    const updateWmsRow = (index, field, value) => {
        if (!canEditForm) return;
        const wms = [...safeArr(formData.wms)];
        if (wms[index]) {
            wms[index] = { ...wms[index], [field]: value };
            setFormData({ ...formData, wms });
        }
    };

    const removeWmsRow = (index) => {
        if (!canEditForm) return;
        setFormData((prev) => ({ ...prev, wms: safeArr(prev.wms).filter((_, currentIndex) => currentIndex !== index) }));
    };

    const toggleWahEquip = (item) => {
        if (!canEditForm) return;
        const equipment = [...safeArr(formData.wahEquipment)];
        setFormData({ ...formData, wahEquipment: equipment.includes(item) ? equipment.filter((entry) => entry !== item) : [...equipment, item] });
    };

    const handleSave = async (isDraft = true) => {
        if (!canEditForm) {
            alert('Security Error: You do not have permission to edit records for this site.');
            return;
        }
        if (!formData.siteId || !formData.description || !formData.location) {
            alert('Site, Location, and Description are mandatory fields.');
            return;
        }
        if (formData.workerType === 'Contractor' && !formData.contractorId) {
            alert('Please select the Contractor Company.');
            return;
        }
        if (safeArr(formData.entrantNames).length === 0) {
            alert('Please select at least one worker for the execution team.');
            return;
        }
        if (!isGlobalUser && !allowedSiteCodes.has(formData.siteId)) {
            alert('Security Authorization Failed: You do not have permission to create permits for this specific facility.');
            return;
        }

        setSaving(true);
        try {
            const { firebaseKey, ...payload } = formData;
            payload.lastUpdated = new Date().toISOString();
            if (payload.workerType === 'Contractor') {
                const vendor = contractors.find((contractor) => contractor.firebaseKey === payload.contractorId);
                if (vendor) payload.contractorName = vendor.companyName;
            }

            if (!isDraft) {
                if (!payload.engApproverEmail || !payload.prodApproverEmail) {
                    setSaving(false);
                    alert('Cannot submit. Please select both Engineering and Production approvers in Section 5.');
                    return;
                }
                payload.status = 'Pending Approval';
                payload.engStatus = 'Pending';
                payload.prodStatus = 'Pending';
            }

            if (firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${firebaseKey}`), payload);
                setPermits((prev) => prev.map((permit) => (permit.id === formData.id ? normalizePermit({ ...payload, firebaseKey }) : permit)));
            } else {
                const newRef = await push(ref(rtdb, `organizations/${session.orgId}/ptwRecords`), payload);
                setPermits((prev) => [normalizePermit({ ...payload, firebaseKey: newRef.key }), ...prev]);
            }

            alert(`Success! Permit ${isDraft ? 'Draft Saved' : 'Sent for Dual Authorization'}.`);
            setCurrentView('inventory');
        } catch (error) {
            alert(`Error saving permit: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleApproveInitiation = async (permit, role) => {
        if (!permit.firebaseKey) {
            alert('Database error: Permit missing key.');
            return;
        }
        try {
            const updates = {};
            if (role === 'eng') updates.engStatus = 'Approved';
            if (role === 'prod') updates.prodStatus = 'Approved';
            const isEngApproved = role === 'eng' ? true : permit.engStatus === 'Approved';
            const isProdApproved = role === 'prod' ? true : permit.prodStatus === 'Approved';

            if (isEngApproved && isProdApproved) {
                updates.status = 'Work in Progress';
                updates.statusUpdatedOn = new Date().toISOString();
                alert('Both authorizations received. Permit is now ACTIVE (Work In Progress).');
            } else {
                alert(`${role === 'eng' ? 'Engineering' : 'Production'} authorization recorded. Awaiting counterpart.`);
            }

            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits((prev) => prev.map((entry) => (entry.id === permit.id ? normalizePermit({ ...entry, ...updates }) : entry)));
        } catch (error) {
            alert(`Error approving: ${error.message}`);
        }
    };

    const addNonCompliance = async () => {
        if (!newNC.trim()) return;
        const newRecord = { id: Date.now(), desc: newNC, date: new Date().toISOString().split('T')[0] };
        const updatedNonCompliances = [...safeArr(formData.nonCompliances), newRecord];
        setFormData((prev) => ({ ...prev, nonCompliances: updatedNonCompliances }));
        setNewNC('');

        if (formData.firebaseKey) {
            try {
                await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${formData.firebaseKey}`), { nonCompliances: updatedNonCompliances });
                setPermits((prev) => prev.map((permit) => permit.id === formData.id ? normalizePermit({ ...permit, nonCompliances: updatedNonCompliances }) : permit));
            } catch (error) {
                console.error('Failed to sync NC to DB', error);
            }
        }
    };

    const removeNonCompliance = async (id) => {
        const updatedNonCompliances = safeArr(formData.nonCompliances).filter((entry) => entry.id !== id);
        setFormData((prev) => ({ ...prev, nonCompliances: updatedNonCompliances }));

        if (formData.firebaseKey) {
            try {
                await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${formData.firebaseKey}`), { nonCompliances: updatedNonCompliances });
                setPermits((prev) => prev.map((permit) => permit.id === formData.id ? normalizePermit({ ...permit, nonCompliances: updatedNonCompliances }) : permit));
            } catch (error) {
                console.error('Failed to sync NC removal to DB', error);
            }
        }
    };

    const handleInspectionSubmit = async (isNegative) => {
        if (!inspectionModal?.firebaseKey) {
            alert('Database error: Permit missing key.');
            return;
        }
        if (!inspectionObservation.trim()) {
            alert('Please enter an observation before submitting.');
            return;
        }
        try {
            const updates = {
                lastInspection: inspectionObservation,
                lastInspectionDate: new Date().toISOString(),
                lastInspector: session.email || session.name
            };
            if (isNegative) {
                updates.status = 'Cancelled';
                updates.cancellationReason = `Failed Workplace Inspection: ${inspectionObservation}`;
                if (inspectionModal.workerType === 'Contractor') {
                    updates.nonCompliances = [
                        ...safeArr(inspectionModal.nonCompliances),
                        { id: Date.now(), desc: `CRITICAL SAFETY FAILURE: ${inspectionObservation}`, date: new Date().toISOString().split('T')[0] }
                    ];
                }
                alert('CRITICAL: Negative observation logged. Permit has been CANCELLED immediately.');
            } else {
                alert('Safe observation logged successfully. Work may continue.');
            }

            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${inspectionModal.firebaseKey}`), updates);
            setPermits((prev) => prev.map((permit) => permit.id === inspectionModal.id ? normalizePermit({ ...permit, ...updates }) : permit));
            setInspectionObservation('');
            setInspectionModal(null);
        } catch (error) {
            alert(`Error logging inspection: ${error.message}`);
        }
    };

    const handleRequestClosure = async (permit) => {
        if (!permit.firebaseKey) {
            alert('Database error: Permit missing key.');
            return;
        }
        if (!window.confirm('Submit this permit for final closure? Ensure all physical work is completed and area is clear.')) {
            return;
        }
        try {
            const updates = { status: 'Pending Closure', engStatus: 'Closure Pending', prodStatus: 'Closure Pending' };
            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits((prev) => prev.map((entry) => (entry.id === permit.id ? normalizePermit({ ...entry, ...updates }) : entry)));
            alert('Closure request sent to Authorizers.');
        } catch (error) {
            alert(`Error submitting closure request: ${error.message}`);
        }
    };

    const handleApproveClosure = async (permit, role) => {
        if (!permit.firebaseKey) {
            alert('Database error: Permit missing key.');
            return;
        }
        try {
            const updates = {};
            if (role === 'eng') updates.engStatus = 'Closure Approved';
            if (role === 'prod') updates.prodStatus = 'Closure Approved';
            const isEngClosed = role === 'eng' ? true : permit.engStatus === 'Closure Approved';
            const isProdClosed = role === 'prod' ? true : permit.prodStatus === 'Closure Approved';

            if (isEngClosed && isProdClosed) {
                updates.status = 'Closed';
                updates.statusUpdatedOn = new Date().toISOString();
                alert('Final authorizations received. Permit is now permanently CLOSED.');
            } else {
                alert(`${role === 'eng' ? 'Engineering' : 'Production'} closure verified. Awaiting counterpart.`);
            }

            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${permit.firebaseKey}`), updates);
            setPermits((prev) => prev.map((entry) => (entry.id === permit.id ? normalizePermit({ ...entry, ...updates }) : entry)));
        } catch (error) {
            alert(`Error approving closure: ${error.message}`);
        }
    };

    const handleReassign = async () => {
        if (!reassignModal?.permit?.firebaseKey) {
            alert('Database error: Permit missing key.');
            return;
        }
        if (!newApproverEmail) {
            alert('Please select a new approver.');
            return;
        }
        try {
            const updates = {};
            if (reassignModal.role === 'eng') updates.engApproverEmail = newApproverEmail;
            if (reassignModal.role === 'prod') updates.prodApproverEmail = newApproverEmail;
            await update(ref(rtdb, `organizations/${session.orgId}/ptwRecords/${reassignModal.permit.firebaseKey}`), updates);
            setPermits((prev) => prev.map((permit) => permit.id === reassignModal.permit.id ? normalizePermit({ ...permit, ...updates }) : permit));
            setReassignModal(null);
            setNewApproverEmail('');
            alert('Approver successfully reassigned.');
        } catch (error) {
            alert(`Error reassigning approver: ${error.message}`);
        }
    };

    const triggerPrint = (permit) => {
        const qrUrl = `${window.location.origin}${window.location.pathname}?ptw=${permit.id}`;
        try {
            const qr = new QRious({ value: qrUrl, size: 200 });
            setQrImage(qr.toDataURL());
        } catch (error) {
            console.warn('QRious failed to load, skipping QR code.', error);
        }
        setPrintData(normalizePermit(permit));
        setTimeout(() => {
            window.print();
        }, 500);
    };

    if (loading || !session) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 font-['Space_Grotesk'] text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-800 border-t-amber-500"></div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading PTW System...</h2>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="relative flex h-screen flex-col overflow-hidden bg-slate-950 font-['Space_Grotesk'] text-white print:hidden">
                <style
                    dangerouslySetInnerHTML={{
                        __html: `
                            .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1); }
                            input, select, textarea { background: rgba(15, 23, 42, 0.8); border: 1px solid #475569; color: #f1f5f9; padding: 10px 14px; border-radius: 8px; outline: none; width: 100%; transition: all 0.2s ease; font-size: 14px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.2); }
                            input:focus, select:focus, textarea:focus { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2); background: #0f172a; }
                            input:disabled, select:disabled, textarea:disabled { opacity: 0.6; cursor: not-allowed; background: #1e293b; border-color: #334155; }
                            input[type="checkbox"] { width: auto; accent-color: #f59e0b; transform: scale(1.2); cursor: pointer; }
                            .custom-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
                            .custom-scroll::-webkit-scrollbar-track { background: #020617; border-radius: 4px; }
                            .custom-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; border: 2px solid #020617; }
                        `
                    }}
                />

                <div className="pointer-events-none absolute right-0 top-0 z-0 h-[600px] w-[600px] rounded-full bg-amber-600/5 blur-[120px]"></div>

                <header className="z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate(getPortalAwareHomePath({ fallbackPath: '/dashboard', site: siteFilter }))} className="flex items-center gap-2 text-slate-400 transition hover:text-white">
                            <i className="fas fa-arrow-left"></i> Hub
                        </button>
                        <div className="mx-2 h-6 w-px bg-slate-700"></div>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 font-bold text-white shadow-lg shadow-amber-900/50">
                            <i className="fas fa-file-signature"></i>
                        </div>
                        <h1 className="hidden text-base font-bold uppercase tracking-wide text-white md:block">Permit to Work (PTW)</h1>
                        <div className="ml-4 flex gap-2">
                            <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">{session?.role}</span>
                            {permissions.viewOnly && (
                                <span className="rounded border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                                    <i className="fas fa-eye mr-1"></i> Read Only
                                </span>
                            )}
                        </div>
                    </div>
                </header>

                <div className="z-10 flex flex-wrap gap-3 border-b border-slate-800 bg-slate-950 px-8 pb-4 pt-6">
                    <button type="button" onClick={() => { setSelectedPermitId(null); syncPtwQuery(''); setCurrentView('dashboard'); }} className={`flex items-center rounded-lg border px-5 py-2.5 text-sm font-bold shadow-sm transition-all ${currentView === 'dashboard' ? 'border-amber-500 bg-amber-600 text-white shadow-amber-900/50' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'}`}>
                        <i className="fas fa-chart-pie mr-2"></i> PTW Dashboard
                    </button>
                    <button type="button" onClick={() => { setSelectedPermitId(null); syncPtwQuery(''); setCurrentView('inventory'); }} className={`flex items-center rounded-lg border px-5 py-2.5 text-sm font-bold shadow-sm transition-all ${currentView === 'inventory' ? 'border-amber-500 bg-amber-600 text-white shadow-amber-900/50' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'}`}>
                        <i className="fas fa-folder-open mr-2"></i> Permit Registry
                    </button>
                    {permissions.canEditCreate && (
                        <button type="button" onClick={() => openForm()} className={`flex items-center rounded-lg border px-5 py-2.5 text-sm font-bold shadow-sm transition-all ${currentView === 'builder' ? 'border-emerald-500 bg-emerald-600 text-white shadow-emerald-900/50' : 'border-slate-700 bg-slate-800 text-emerald-400 hover:bg-slate-700 hover:text-emerald-300'}`}>
                            <i className="fas fa-plus mr-2"></i> Issue Permit
                        </button>
                    )}
                </div>

                <main className="relative flex-1 overflow-y-auto pb-20 font-['Inter'] custom-scroll">
                    {currentView === 'dashboard' && (
                        <PtwDashboardComponent allowedSites={allowedSites} handleSiteFilterChange={handleSiteFilterChange} isGlobalUser={isGlobalUser} myPendingApprovals={myPendingApprovals} onViewPermit={openPermitViewer} setCurrentView={setCurrentView} siteFilter={siteFilter} visiblePermits={visiblePermits} />
                    )}
                    {currentView === 'inventory' && (
                        <PtwRegistryComponent
                            allowedSites={allowedSites}
                            handleApproveClosure={handleApproveClosure}
                            handleApproveInitiation={handleApproveInitiation}
                            handleRequestClosure={handleRequestClosure}
                            handleSiteFilterChange={handleSiteFilterChange}
                            isCreator={isCreator}
                            isEngApprover={isEngApprover}
                            isGlobalUser={isGlobalUser}
                            isProdApprover={isProdApprover}
                            openForm={openForm}
                            onViewPermit={openPermitViewer}
                            permissions={permissions}
                            setInspectionModal={setInspectionModal}
                            setInspectionObservation={setInspectionObservation}
                            setNewApproverEmail={setNewApproverEmail}
                            setReassignModal={setReassignModal}
                            siteFilter={siteFilter}
                            triggerPrint={triggerPrint}
                            visiblePermits={visiblePermits}
                        />
                    )}
                    {currentView === 'viewer' && selectedPermit && (
                        <PermitViewerComponent
                            canInspect={canInspectPermit(selectedPermit)}
                            onBack={closePermitViewer}
                            onInspect={(permit) => {
                                setInspectionObservation('');
                                setInspectionModal(permit);
                            }}
                            permit={selectedPermit}
                        />
                    )}
                    {currentView === 'builder' && formData && (
                        <PermitBuilderView
                            addNonCompliance={addNonCompliance}
                            addWmsRow={addWmsRow}
                            allowedSites={allowedSites}
                            availableContractors={availableContractors}
                            availableWorkers={availableWorkers}
                            canEditForm={canEditForm}
                            formData={formData}
                            handleSave={handleSave}
                            handleTypeChange={handleTypeChange}
                            isGlobalUser={isGlobalUser}
                            lotoProcedures={lotoProcedures}
                            myEmail={myEmail}
                            myName={myName}
                            newNC={newNC}
                            removeNonCompliance={removeNonCompliance}
                            removeWmsRow={removeWmsRow}
                            saving={saving}
                            setCurrentView={setCurrentView}
                            setFormData={setFormData}
                            setInspectionModal={setInspectionModal}
                            setInspectionObservation={setInspectionObservation}
                            setNewNC={setNewNC}
                            toggleChecklistItem={toggleChecklistItem}
                            togglePPE={togglePPE}
                            toggleWahEquip={toggleWahEquip}
                            toggleWorker={toggleWorker}
                            triggerPrint={triggerPrint}
                            updateField={updateField}
                            updateWmsRow={updateWmsRow}
                            users={users}
                        />
                    )}
                </main>
            </div>

            <InspectionModalComponent
                inspectionModal={inspectionModal}
                inspectionObservation={inspectionObservation}
                onChange={setInspectionObservation}
                onClose={() => {
                    setInspectionObservation('');
                    setInspectionModal(null);
                }}
                onSubmit={handleInspectionSubmit}
            />
            <ReassignModalComponent newApproverEmail={newApproverEmail} onCancel={() => setReassignModal(null)} onConfirm={handleReassign} onSelect={setNewApproverEmail} reassignModal={reassignModal} users={users} />
            <PrintViewComponent printData={printData} qrImage={qrImage} />
        </>
    );
}
