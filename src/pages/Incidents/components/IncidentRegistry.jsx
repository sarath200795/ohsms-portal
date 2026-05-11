import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { resolveIncidentReportingState } from '../../../utils/incidents';
import IncidentDashboard from './IncidentDashboard';
import { safeArr } from '../utils';

export default function IncidentRegistry({
    incidents,
    isGlobalUser,
    onDelete,
    onEdit,
    onPrint,
    permissions,
    regionFilter,
    regionOptions,
    setRegionFilter,
    setSiteFilter,
    siteFilter,
    uniqueSites
}) {
    const [filterType, setFilterType] = useState('All');
    const [filterLevel, setFilterLevel] = useState('All');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

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

    const handleSiteFilterChange = (e) => {
        const newSite = e.target.value;
        setSiteFilter(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite === 'All' ? 'GLOBAL' : newSite);
    };

    const exportToExcel = () => {
        const dataToExport = filteredData.map(({ id, date, time, siteId, title, type, severity, affectedPersonName, affectedPersonType, reporting, smartType }) => {
            const reportState = resolveIncidentReportingState({ reporting, type, severity, smartType });
            return ({
            ID: id,
            Date: date,
            Time: time,
            Site: siteId,
            Title: title,
            Type: type,
            Severity: severity,
            Affected_Person: affectedPersonName,
            Person_Type: affectedPersonType,
            Investigation_Required: reportState.investigationRequired ? 'Yes' : 'No',
            Report_Status: reportState.investigationStatus
        });
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Incidents');
        XLSX.writeFile(workbook, 'Incident_Repository.xlsx');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <IncidentDashboard incidents={incidents} />

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
                        <label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Region</label>
                        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500">
                            <option value="All">All Regions</option>
                            {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Site Filter</label>
                        <select value={siteFilter} onChange={handleSiteFilterChange} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500">
                            {(isGlobalUser || uniqueSites.length > 1) && <option value="All">All Sites</option>}
                            {uniqueSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                        </select>
                    </div>

                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Type</label><select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500"><option value="All">All Types</option><option>Near Miss</option><option>Property Damage</option><option>First Aid injury</option><option>Lost Time injury</option><option>Reportable Injury</option></select></div>
                    <div><label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">Severity</label><select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 text-xs rounded-lg p-2 text-white outline-none focus:border-purple-500"><option value="All">All Levels</option><option value="Level A">Level A</option><option value="Level B">Level B</option><option value="Level C">Level C</option><option value="Level D">Level D</option></select></div>
                </div>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700 shadow-xl">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-xs uppercase font-bold text-slate-500 border-b border-slate-800">
                        <tr><th className="p-4">Incident ID</th><th className="p-4">Date</th><th className="p-4">Type</th><th className="p-4">Details & Person</th><th className="p-4 text-center">Report Stage</th><th className="p-4 text-center">HIRA Linked</th><th className="p-4 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {filteredData.map((incident) => {
                            const total = safeArr(incident.capa).length;
                            const closed = safeArr(incident.capa).filter((c) => c.status === 'Closed').length;
                            const progress = total > 0 ? (closed / total) * 100 : 0;
                            const canEditRow = permissions.canEditCreate && (isGlobalUser || uniqueSites.some((site) => site.code === incident.siteId));
                            const reportState = resolveIncidentReportingState(incident);
                            const reportBadgeClass = reportState.investigationStatus === 'Completed'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                : reportState.investigationStatus === 'Draft'
                                    ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
                                    : reportState.investigationStatus === 'Pending'
                                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                                        : 'border-slate-700 bg-slate-800/80 text-slate-300';
                            const reportLabel = reportState.investigationStatus === 'Completed'
                                ? 'Investigation Ready'
                                : reportState.investigationStatus === 'Draft'
                                    ? 'Investigation Draft'
                                    : reportState.investigationStatus === 'Pending'
                                        ? 'Investigation Required'
                                        : 'Initial Report Only';

                            return (
                                <tr key={incident.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4 font-mono font-bold text-white">{incident.id}</td>
                                    <td className="p-4">{incident.date}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-200">{incident.type}</div>
                                        <div className={`text-[10px] uppercase font-bold ${incident.severity === 'Level A' ? 'text-emerald-400' : incident.severity === 'Level B' ? 'text-blue-400' : incident.severity === 'Level C' ? 'text-orange-400' : 'text-red-500'}`}>{incident.severity}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-white mb-1 truncate max-w-[200px]">{incident.title || 'No Title'}</div>
                                        {incident.affectedPersonName ? (
                                            <div className="text-[10px] font-bold uppercase tracking-widest flex gap-2">
                                                <span>{incident.affectedPersonName}</span>
                                                {incident.affectedPersonType === 'Contractor' ? <span className="text-indigo-400">(EXT)</span> : <span className="text-emerald-400">(INT)</span>}
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
                                        <div className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${reportBadgeClass}`}>
                                            {reportLabel}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        {incident.linkedHazards && incident.linkedHazards.length > 0 ? <span className="text-emerald-400 font-bold bg-emerald-900/20 px-2 py-1 rounded border border-emerald-500/20"><i className="fas fa-link mr-1"></i> {incident.linkedHazards.length}</span> : <span className="text-slate-600">-</span>}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button type="button" onClick={() => onPrint(incident)} className="text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition" title={reportState.investigationCompletedAt ? 'Print Investigation Report' : 'Print Initial Report'}><i className="fas fa-print"></i></button>

                                        {canEditRow ? (
                                            <button type="button" onClick={() => onEdit(incident)} className="text-purple-400 hover:text-white bg-purple-500/10 hover:bg-purple-600 px-3 py-1.5 rounded-lg transition font-bold text-xs uppercase tracking-widest">{reportState.investigationStatus === 'Pending' ? 'Investigate' : 'Edit'}</button>
                                        ) : (
                                            <button type="button" onClick={() => onEdit(incident)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition font-bold text-xs uppercase tracking-widest">View</button>
                                        )}

                                        {permissions.canDelete && (
                                            <button type="button" onClick={() => onDelete(incident)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-600 px-3 py-1.5 rounded-lg transition"><i className="fas fa-trash-alt"></i></button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredData.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-500 italic">No incidents match your filters.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
