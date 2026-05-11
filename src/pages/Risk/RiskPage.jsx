import React from 'react';
import { useNavigate } from 'react-router-dom';
import RiskChangeLogModal from './components/RiskChangeLogModal';
import RiskFormView from './components/RiskFormView';
import RiskImportView from './components/RiskImportView';
import RiskLogsView from './components/RiskLogsView';
import RiskPrintView from './components/RiskPrintView';
import RiskRepositoryView from './components/RiskRepositoryView';
import { useRiskModule } from './hooks/useRiskModule';

export default function RiskPage() {
    const navigate = useNavigate();
    const module = useRiskModule();

    if (module.loading) {
        return (
            <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col font-['Space_Grotesk']">
                <i className="fas fa-shield-virus fa-spin text-4xl text-blue-500 mb-4"></i>
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Risk Matrix...</h2>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

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
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">{module.session?.role}</span>
                        {module.permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
                <div className="app-tabbar max-w-full overflow-x-auto custom-scroll">
                    <button type="button" onClick={() => module.setView('list')} className={`app-tab ${module.view === 'list' ? 'app-tab-active' : ''}`}><i className="fas fa-database"></i> Dashboard</button>
                    <button type="button" onClick={() => module.setView('logs')} className={`app-tab ${module.view === 'logs' ? 'app-tab-active' : ''}`}><i className="fas fa-history"></i> Revision Logs</button>
                    {module.permissions.canEditCreate && (
                        <>
                            <button type="button" onClick={() => module.setView('import')} className={`app-tab ${module.view === 'import' ? 'app-tab-active' : ''}`}><i className="fas fa-file-excel"></i> Smart Import</button>
                            <button type="button" onClick={module.openNewForm} className={`app-tab app-tab-success ${module.view === 'form' ? 'app-tab-active' : ''}`}><i className="fas fa-plus"></i> New Assessment</button>
                        </>
                    )}
                </div>
            </header>

            <div className="app-ui flex-1 overflow-y-auto p-8 custom-scroll relative z-10 print:hidden">
                <RiskChangeLogModal
                    show={module.showChangeModal}
                    changeDetails={module.changeDetails}
                    setChangeDetails={module.setChangeDetails}
                    changeSources={module.CHANGE_SOURCES}
                    onClose={() => module.setShowChangeModal(false)}
                    onConfirm={module.processSave}
                    saving={module.saving}
                />

                <div className="max-w-[1400px] mx-auto">
                    {module.view === 'list' && (
                        <RiskRepositoryView
                            filterSite={module.filterSite}
                            regionFilter={module.regionFilter}
                            regionOptions={module.regionOptions}
                            filteredVisibleSites={module.filteredVisibleSites}
                            onFilterRegionChange={module.handleRegionFilterChange}
                            onFilterSiteChange={module.handleSiteFilterChange}
                            filterStatus={module.filterStatus}
                            onFilterStatusChange={module.setFilterStatus}
                            isGlobalUser={module.isGlobalUser}
                            visibleSites={module.visibleSites}
                            onExport={module.exportExcel}
                            totalGlobalHazards={module.totalGlobalHazards}
                            highRiskCount={module.highRiskCount}
                            alarpCount={module.alarpCount}
                            filteredRepo={module.filteredRepo}
                            onPrint={module.triggerPrint}
                            onOpenRecord={module.openEditForm}
                            onDeleteRecord={module.deleteAssessment}
                            canEditRecord={module.canEditRecord}
                            canDeleteRecord={module.canDeleteRecord}
                        />
                    )}

                    {module.view === 'logs' && (
                        <RiskLogsView
                            allChangeLogs={module.allChangeLogs}
                            filterSite={module.filterSite}
                            regionFilter={module.regionFilter}
                            regionOptions={module.regionOptions}
                            filteredVisibleSites={module.filteredVisibleSites}
                            onFilterRegionChange={module.handleRegionFilterChange}
                            onFilterSiteChange={module.handleSiteFilterChange}
                            isGlobalUser={module.isGlobalUser}
                            visibleSites={module.visibleSites}
                            onOpenLogRecord={module.openLogRecord}
                        />
                    )}

                    {module.view === 'import' && module.permissions.canEditCreate && (
                        <RiskImportView importing={module.importing} onImport={module.handleExcelImport} onDownloadTemplate={module.downloadTemplate} />
                    )}

                    {module.view === 'form' && (
                        <RiskFormView
                            formData={module.formData}
                            setFormData={module.setFormData}
                            canEditForm={module.canEditForm}
                            saving={module.saving}
                            onSave={module.processSave}
                            onCancel={() => module.setView('list')}
                            isGlobalUser={module.isGlobalUser}
                            visibleSites={module.visibleSites}
                            addTeamMember={module.addTeamMember}
                            updateTeam={module.updateTeam}
                            removeTeam={module.removeTeam}
                            addActivity={module.addActivity}
                            updateActivityName={module.updateActivityName}
                            removeActivity={module.removeActivity}
                            addHazard={module.addHazard}
                            updateHazard={module.updateHazard}
                            removeHazard={module.removeHazard}
                            handleCategoryChange={module.handleCategoryChange}
                            handleSubCategoryChange={module.handleSubCategoryChange}
                            activeUsers={module.activeUsers}
                        />
                    )}
                </div>
            </div>

            <RiskPrintView printData={module.printData} getRiskStyle={module.getRiskStyle} />
        </div>
    );
}
