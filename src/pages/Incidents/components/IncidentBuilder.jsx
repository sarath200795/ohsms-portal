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
            <div className="app-tabbar mb-8 form-view-tabs">
                {steps.map((s, index) => (
                    <button key={s.id} type="button" onClick={() => props.setStep(s.id)} className={`app-tab flex-1 ${step === s.id ? 'app-tab-active' : ''}`}>
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
