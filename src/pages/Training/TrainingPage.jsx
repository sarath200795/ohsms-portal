import React from 'react';
import { useNavigate } from 'react-router-dom';
import TrainingCalendarView from './components/TrainingCalendarView';
import TrainingDashboardView from './components/TrainingDashboardView';
import TrainingFormView from './components/TrainingFormView';
import TrainingMatrixView from './components/TrainingMatrixView';
import TrainingPrintView from './components/TrainingPrintView';
import TrainingRepositoryView from './components/TrainingRepositoryView';
import { useTrainingModule } from './hooks/useTrainingModule';

export default function TrainingPage() {
    const navigate = useNavigate();
    const module = useTrainingModule();

    if (module.loading) {
        return (
            <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col gap-4 font-['Space_Grotesk']">
                <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500"></i>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Loading Registry & Cross-Module Dependencies...</p>
            </div>
        );
    }

    return (
        <>
            <style>
                {`
                    @media print {
                        body, html, #root { height: auto !important; overflow: visible !important; background-color: white !important; color: black !important; }
                        .print-content { position: relative !important; width: 100% !important; height: auto !important; overflow: visible !important; display: block !important; }
                    }
                `}
            </style>

            <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden print:h-auto print:overflow-visible print:bg-white print:text-black">
                <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/80 backdrop-blur-md print:hidden z-20 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                        <div className="h-6 w-px bg-slate-800 mx-2"></div>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-graduation-cap"></i></div>
                        <h1 className="font-bold text-lg tracking-wide hidden md:block">Training & Competence</h1>
                    </div>
                    <div className="app-tabbar overflow-x-auto custom-scroll">
                        <button type="button" onClick={() => module.setView('dashboard')} className={`app-tab ${module.view === 'dashboard' ? 'app-tab-active' : ''}`}><i className="fas fa-chart-line"></i> Dashboard</button>
                        <button type="button" onClick={() => module.setView('matrix')} className={`app-tab ${module.view === 'matrix' ? 'app-tab-active' : ''}`}><i className="fas fa-table"></i> Matrix</button>
                        <button type="button" onClick={() => module.setView('calendar')} className={`app-tab ${module.view === 'calendar' ? 'app-tab-active' : ''}`}><i className="fas fa-calendar-alt"></i> Calendar</button>
                        <button type="button" onClick={() => module.setView('repo')} className={`app-tab ${module.view === 'repo' ? 'app-tab-active' : ''}`}><i className="fas fa-history"></i> Logs</button>
                        {module.permissions.canEditCreate && <button type="button" onClick={module.openNewForm} className={`app-tab app-tab-success ${module.view === 'form' ? 'app-tab-active' : ''}`}><i className="fas fa-plus"></i> New</button>}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 print:hidden custom-scroll relative z-10">
                    {module.view === 'dashboard' && (
                        <TrainingDashboardView
                            filterSite={module.filterSite}
                            regionFilter={module.regionFilter}
                            regionOptions={module.regionOptions}
                            filteredVisibleSites={module.filteredVisibleSites}
                            onRegionChange={module.handleRegionFilterChange}
                            onSiteChange={module.handleDashboardSiteChange}
                            isGlobalUser={module.isGlobalUser}
                            visibleSites={module.visibleSites}
                            validCount={module.validCount}
                            expiringCount={module.expiringCount}
                            pendingCount={module.pendingCount}
                            expiredCount={module.expiredCount}
                            filteredAlerts={module.filteredAlerts}
                            pendingTrainingCapas={module.pendingTrainingCapas}
                            canEditCreate={module.permissions.canEditCreate}
                            onInitiateCapaTraining={module.initiateCapaTraining}
                        />
                    )}

                    {module.view === 'matrix' && (
                        <TrainingMatrixView
                            isGlobalUser={module.isGlobalUser}
                            visibleSites={module.visibleSites}
                            matrixSiteFilter={module.matrixSiteFilter}
                            onMatrixSiteChange={module.handleMatrixSiteChange}
                            matrixContractorFilter={module.matrixContractorFilter}
                            onMatrixContractorChange={module.onMatrixContractorChange}
                            contractors={module.contractors}
                            searchTerm={module.searchTerm}
                            onSearchChange={module.onSearchChange}
                            filterRef={module.filterRef}
                            isFilterOpen={module.isFilterOpen}
                            onToggleFilterOpen={() => module.setIsFilterOpen((prev) => !prev)}
                            selectAllTopics={module.selectAllTopics}
                            clearAllTopics={module.clearAllTopics}
                            uniqueTopics={module.uniqueTopics}
                            hiddenTopics={module.hiddenTopics}
                            toggleTopicFilter={module.toggleTopicFilter}
                            downloadMatrix={module.downloadMatrix}
                            displayedTopics={module.displayedTopics}
                            allMatrixRows={module.allMatrixRows}
                            getMatrixCell={module.getMatrixCell}
                        />
                    )}

                    {module.view === 'calendar' && (
                        <TrainingCalendarView
                            calendarSiteFilter={module.calendarSiteFilter}
                            onCalendarSiteChange={module.handleCalendarSiteChange}
                            isGlobalUser={module.isGlobalUser}
                            visibleSites={module.visibleSites}
                            currentMonth={module.currentMonth}
                            setCurrentMonth={module.setCurrentMonth}
                            currentYear={module.currentYear}
                            setCurrentYear={module.setCurrentYear}
                            trainings={module.trainings}
                            certifications={module.certifications}
                            trainingCapas={module.trainingCapas}
                            users={module.users}
                            contractors={module.contractors}
                            allowedSiteCodes={module.allowedSiteCodes}
                            onOpenRecord={module.openTrainingRecord}
                            onInitiateRetraining={module.initiateRetraining}
                            onInitiateCapaTraining={module.initiateCapaTraining}
                        />
                    )}

                    {module.view === 'repo' && (
                        <TrainingRepositoryView
                            isGlobalUser={module.isGlobalUser}
                            allowedSiteCodes={module.allowedSiteCodes}
                            filterSite={module.filterSite}
                            regionFilter={module.regionFilter}
                            regionOptions={module.regionOptions}
                            filteredVisibleSites={module.filteredVisibleSites}
                            onRegionChange={module.handleRegionFilterChange}
                            onSiteChange={module.handleDashboardSiteChange}
                            visibleSites={module.visibleSites}
                            trainings={module.trainings}
                            permissions={module.permissions}
                            onPrint={module.triggerPrint}
                            onOpenRecord={module.openTrainingRecord}
                            onDelete={module.handleDelete}
                        />
                    )}

                    {module.view === 'form' && (
                        <TrainingFormView
                            data={module.data}
                            setData={module.setData}
                            canEditForm={module.canEditForm}
                            visibleSites={module.visibleSites}
                            isGlobalUser={module.isGlobalUser}
                            contractors={module.contractors}
                            saving={module.saving}
                            onSave={module.saveData}
                            onCancel={() => module.setView('dashboard')}
                            selectedUserToAdd={module.selectedUserToAdd}
                            setSelectedUserToAdd={module.setSelectedUserToAdd}
                            externalName={module.externalName}
                            setExternalName={module.setExternalName}
                            availableWorkersForForm={module.availableWorkersForForm}
                            addAttendee={module.addAttendee}
                            removeAttendee={module.removeAttendee}
                            onPrint={module.triggerPrint}
                        />
                    )}
                </div>

                <TrainingPrintView printData={module.printData} />
            </div>
        </>
    );
}
