import React from 'react';
import { safeArr } from '../utils';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TrainingCalendarView({
    calendarSiteFilter,
    onCalendarSiteChange,
    isGlobalUser,
    visibleSites,
    currentMonth,
    setCurrentMonth,
    currentYear,
    setCurrentYear,
    trainings,
    certifications,
    trainingCapas,
    users,
    contractors,
    allowedSiteCodes,
    onOpenRecord,
    onInitiateRetraining,
    onInitiateCapaTraining
}) {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

    const days = [];
    for (let i = 0; i < firstDayIndex; i += 1) {
        days.push(<div key={`empty-${i}`} className="p-2 border-r border-b border-slate-700 bg-slate-900/20 min-h-[120px]"></div>);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const dayTrainings = trainings.filter((training) => training.date === dateStr && (calendarSiteFilter === 'All' || training.siteId === calendarSiteFilter) && (isGlobalUser || allowedSiteCodes.has(training.siteId)));
        const dayExpirations = Object.values(certifications).filter((cert) => cert.expiryDate === dateStr);
        const dayExpirationsFiltered = dayExpirations.filter((expiration) => {
            if (calendarSiteFilter === 'All') return true;

            const internalUser = users.find((user) => user.name === expiration.userName);
            if (internalUser) return internalUser.assignedSite === calendarSiteFilter || safeArr(internalUser.accessibleSites).includes(calendarSiteFilter);

            const contractor = contractors.find((item) => safeArr(item.workers).some((worker) => worker.name === expiration.userName));
            if (contractor) {
                const worker = safeArr(contractor.workers).find((item) => item.name === expiration.userName);
                return (worker && worker.deployedSite === calendarSiteFilter) || contractor.siteId === calendarSiteFilter || contractor.siteId === 'GLOBAL';
            }

            return false;
        });

        const dayCapas = trainingCapas.filter((capa) => capa.due === dateStr && capa.status !== 'Closed' && (calendarSiteFilter === 'All' || capa.siteId === calendarSiteFilter || capa.source === 'Incident') && (isGlobalUser || allowedSiteCodes.has(capa.siteId) || capa.siteId === 'Global'));

        days.push(
            <div key={day} className="p-2 border-r border-b border-slate-700 bg-slate-800 hover:bg-slate-700/80 transition min-h-[120px] flex flex-col">
                <span className="font-bold text-slate-400 block text-right mb-1">{day}</span>
                <div className="flex-1 space-y-1 overflow-y-auto custom-scroll max-h-[90px] pr-1">
                    {dayTrainings.map((training, idx) => (
                        <div key={`t-${idx}`} className="text-[9px] bg-blue-500/20 text-blue-300 p-1 rounded leading-tight border border-blue-500/30 truncate cursor-pointer shadow-sm hover:bg-blue-600/40" title={`${training.topic} (${safeArr(training.attendees).length} trained)`} onClick={() => onOpenRecord(training)}>
                            <i className="fas fa-check-circle mr-1"></i> {training.topic}
                        </div>
                    ))}
                    {dayExpirationsFiltered.map((expiration, idx) => (
                        <div key={`e-${idx}`} className="text-[9px] bg-red-500/20 text-red-300 p-1 rounded leading-tight border border-red-500/30 truncate shadow-sm hover:bg-red-600/40 cursor-pointer" title={`${expiration.userName}'s ${expiration.topic} expires!`} onClick={() => onInitiateRetraining(expiration.topic, [expiration])}>
                            <i className="fas fa-exclamation-triangle mr-1"></i> Exp: {expiration.userName.split(' ')[0]}
                        </div>
                    ))}
                    {dayCapas.map((capa, idx) => (
                        <div key={`c-${idx}`} className="text-[9px] bg-orange-500/20 text-orange-300 p-1 rounded leading-tight border border-orange-500/30 truncate shadow-sm hover:bg-orange-600/40 cursor-pointer" title={`CAPA Action: ${capa.desc}`} onClick={() => onInitiateCapaTraining(capa)}>
                            <i className="fas fa-tasks mr-1"></i> Due: {capa.source}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel p-6 rounded-xl animate-fade-in shadow-xl border border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white"><i className="fas fa-calendar-alt text-blue-400 mr-2"></i> Training Calendar</h2>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <i className="fas fa-map-marker-alt absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500"></i>
                        <select value={calendarSiteFilter} onChange={onCalendarSiteChange} className="w-40 text-xs bg-slate-900 border border-slate-700 rounded-lg shadow-inner pl-8 pr-2 py-2 appearance-none outline-none focus:border-blue-500 text-white">
                            {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Sites</option>}
                            {visibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-900 rounded-lg p-1 border border-slate-700 shadow-inner">
                        <button type="button" onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((year) => year - 1); } else { setCurrentMonth((month) => month - 1); } }} className="px-3 py-1 hover:bg-slate-700 rounded text-slate-300 transition-colors"><i className="fas fa-chevron-left"></i></button>
                        <span className="font-bold w-32 text-center text-white">{MONTH_NAMES[currentMonth]} {currentYear}</span>
                        <button type="button" onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((year) => year + 1); } else { setCurrentMonth((month) => month + 1); } }} className="px-3 py-1 hover:bg-slate-700 rounded text-slate-300 transition-colors"><i className="fas fa-chevron-right"></i></button>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 mb-4 text-xs">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-blue-500/50 border border-blue-500"></span> Completed</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-red-500/50 border border-red-500"></span> Expirations</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-orange-500/50 border border-orange-500"></span> CAPA Due</div>
            </div>

            <div className="grid grid-cols-7 border-t border-l border-slate-700 rounded-xl overflow-hidden bg-slate-900 shadow-xl">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="p-2 text-center text-xs font-bold text-slate-400 uppercase tracking-wider border-r border-b border-slate-700 bg-slate-950">
                        {day}
                    </div>
                ))}
                {days}
            </div>
        </div>
    );
}
