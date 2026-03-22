import React from 'react';
import IncidentStepAnalysis from './IncidentStepAnalysis';
import IncidentStepCapa from './IncidentStepCapa';
import IncidentStepInitial from './IncidentStepInitial';
import IncidentStepReview from './IncidentStepReview';
import IncidentStepTeam from './IncidentStepTeam';

export default function IncidentBuilder(props) {
    const { step, steps } = props;

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex gap-2 mb-8 form-view-tabs bg-slate-900/40 p-2 rounded-2xl border border-slate-800 backdrop-blur-sm shadow-xl">
                {steps.map((s, index) => (
                    <button key={s.id} type="button" onClick={() => props.setStep(s.id)} className={`flex-1 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${step === s.id ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 scale-[1.02]' : 'bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
                        <span className="opacity-50 mr-1">{index + 1}.</span> {s.label}
                    </button>
                ))}
            </div>

            {step === 1 && <IncidentStepInitial {...props} />}
            {step === 2 && props.data.severity !== 'Level D' && <IncidentStepTeam {...props} />}
            {step === 3 && <IncidentStepAnalysis {...props} />}
            {step === 4 && <IncidentStepCapa {...props} />}
            {step === 5 && <IncidentStepReview {...props} />}
        </div>
    );
}
