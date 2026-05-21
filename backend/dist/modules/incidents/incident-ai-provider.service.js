"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentAiProviderService = void 0;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const normalizeInvestigationText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const ensureSentence = (value) => {
    const text = normalizeInvestigationText(value);
    if (!text)
        return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
};
const stripSentenceEnd = (value) => normalizeInvestigationText(value).replace(/[.!?]+$/, '');
const lowerFirst = (value) => {
    const normalized = stripSentenceEnd(value);
    return normalized ? `${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}` : '';
};
const splitInvestigationSentences = (value) => normalizeInvestigationText(value)
    .split(/(?<=[.!?])\s+|\n+|;\s+/)
    .map((item) => normalizeInvestigationText(item))
    .filter(Boolean);
const appendUniqueStatement = (list, value) => {
    const statement = ensureSentence(value);
    if (statement && !list.includes(statement)) {
        list.push(statement);
    }
};
const extractClauseByPattern = (context, patterns) => {
    for (const pattern of patterns) {
        const match = normalizeInvestigationText(context).match(pattern);
        if (match?.[1])
            return normalizeInvestigationText(match[1]);
    }
    return '';
};
const detectObjectInvolved = (context, fallback) => {
    const configured = normalizeInvestigationText(fallback);
    if (configured)
        return configured;
    if (/(barbell|dumbbell|weight plate|kettlebell|rack|gym equipment|storage box|jump box)/i.test(context))
        return 'barbell rack or gym equipment';
    if (/(forklift|truck|vehicle|flt|crane|tugger|loader)/i.test(context))
        return 'workplace vehicle';
    if (/(machine|conveyor|press|pump|motor|guard|blade|tool)/i.test(context))
        return 'machinery';
    if (/(ladder|scaffold|roof|stairs|platform)/i.test(context))
        return 'working-at-height equipment';
    if (/(chemical|acid|solvent|oil|fluid|water|gas|vapou?r)/i.test(context))
        return 'chemical or fluid source';
    if (/(gasket|valve|hose|pipe|wire|panel|cable)/i.test(context))
        return 'component or part';
    return 'equipment or work activity';
};
const detectHazardType = (context, fallback) => {
    const configured = normalizeInvestigationText(fallback);
    if (configured && !/general workplace hazard/i.test(configured))
        return configured;
    if (/(barbell|dumbbell|weight|rack|box|topple|fell|fall|collapsed)/i.test(context))
        return 'falling or toppling heavy equipment';
    if (/(forklift|truck|vehicle|flt|traffic|reverse|reversing|struck|collision|impact)/i.test(context))
        return 'vehicle movement / traffic interface';
    if (/(slip|trip|fall|puddle|slippery|uneven|wet floor)/i.test(context))
        return 'loss of traction or stability';
    if (/(cut|laceration|amputation|crush|nip|entangle|caught|pinch|blade)/i.test(context))
        return 'contact with moving, sharp, or crushing parts';
    if (/(burn|fire|explosion|spark|smoke|ignite|flame)/i.test(context))
        return 'thermal or fire event';
    if (/(leak|spill|fume|inhale|chemical|gas|vapou?r|release)/i.test(context))
        return 'loss of containment';
    if (/(shock|electrical|wire|cable|panel|arc|live|energ)/i.test(context))
        return 'electrical exposure';
    return 'hazard described in the incident report';
};
const buildLocalIncidentInference = ({ context, evidence, mediaContext, summary, equipment, hazard, severity }) => {
    const sourceText = [
        context.title,
        context.description,
        context.immediateAction,
        evidence.notes
    ].map((item) => normalizeInvestigationText(item)).filter(Boolean).join('. ');
    const factorText = [
        context.description,
        context.immediateAction,
        evidence.notes
    ].map((item) => normalizeInvestigationText(item)).filter(Boolean).join('. ');
    const sentences = splitInvestigationSentences(sourceText || summary);
    const factorSentences = splitInvestigationSentences(factorText || sourceText || summary);
    const detectedHazard = detectHazardType(sourceText || summary, hazard);
    const eventSummary = ensureSentence(context.title || sentences[0] || summary);
    const hasVideoEvidence = Boolean(evidence.uploaded.video);
    const hasPhotoEvidence = Boolean(evidence.uploaded.photo);
    const mediaEvidenceType = hasVideoEvidence && hasPhotoEvidence
        ? 'uploaded video and photo evidence'
        : hasVideoEvidence
            ? 'uploaded video evidence'
            : hasPhotoEvidence
                ? 'uploaded photo evidence'
                : 'reported incident details';
    const evidenceAnchor = ensureSentence(hasVideoEvidence
        ? `${mediaContext.derivedFrames.length || 'The'} sampled video frame context should be used to confirm the movement sequence, worker position, control points, and visible barriers around ${equipment}`
        : hasPhotoEvidence
            ? `The uploaded photo should be used to confirm scene layout, equipment condition, and visible controls around ${equipment}`
            : `The report narrative should be checked against witness evidence, scene layout, and control records for ${equipment}`);
    const directCause = extractClauseByPattern(sourceText, [
        /(?:because|due to|caused by|after|following)\s+([^.!?]+)/i,
        /(?:when|while)\s+([^.!?]+)/i
    ]);
    const flags = {
        vehicle: /(forklift|truck|vehicle|flt|traffic|reverse|reversing|struck|collision|impact|pallet rack)/i.test(sourceText),
        noSpotter: /(without (?:a )?(spotter|banksman)|no spotter|without banksman|unsupervised)/i.test(sourceText),
        congestion: /(congested|blocked|restricted|narrow|clearance|traffic|pedestrian|walkway|aisle|blind spot)/i.test(sourceText),
        priorSignals: /(prior|previous|near miss|near-miss|reported|complained|known issue|repeated|already informed|earlier)/i.test(sourceText),
        trainingGap: /(untrained|new worker|first time|inexperienced|competency|not trained|induction|awareness|briefing)/i.test(sourceText),
        procedureGap: /(permit|loto|procedure|sop|risk assessment|method statement|checklist|instruction|supervision|ptw|safe system)/i.test(sourceText),
        maintenanceGap: /(inspection|maintenance|pre-use|pre use|service|repair|broken|failed|snapped|damaged|defective)/i.test(sourceText),
        barrierGap: /(guard|barrier|barricade|interlock|alarm|sensor|shield|cover|isolation|lockout|tagout|ppe|segregation|exclusion)/i.test(sourceText),
        environmentGap: /(wet|dark|poor lighting|lighting|housekeeping|congested|cramped|weather|rain|floor|surface|access|visibility|layout)/i.test(sourceText),
        humanAction: /(rushing|hurry|fatigue|tired|distracted|shortcut|ignored|forgot|bypassed|did not|without authorization|without ppe)/i.test(sourceText),
        gymWeightRack: /(barbell|dumbbell|weight plate|kettlebell|rack of barbell|barbell rack|barbell box|gym equipment)/i.test(sourceText),
        rackTopple: /(topple|toppled|fell|fall|collapsed|rack.*fell|box.*fell|fell on|fell onto)/i.test(sourceText),
        steppedOnBox: /(stepp?ed on|stood on|standing on).*(box|rack)|(?:box|rack).*(stepp?ed on|stood on|standing on)/i.test(sourceText),
        topRemoval: /(take out|remove|removing|pull|lift).*(barbell|dumbbell|weight).*(top|upper)|(?:top|upper).*(barbell|dumbbell|weight)/i.test(sourceText),
        olderPerson: /(over\s*55|55\s*years|older|old member|elderly|senior)/i.test(sourceText),
        heavyMetalWeight: /(heavy|metal|barbell|dumbbell|weight plate|loaded)/i.test(sourceText),
        peopleSeatedNearby: /(sitting|seated|sitting in that area|another member|nearby member|people sitting|member who was sitting)/i.test(sourceText),
        wrongEquipmentUse: /(storage box|wrong equipment|instead of|jump box|box jumps|not the box used)/i.test(sourceText)
    };
    const immediateCauses = [];
    if (flags.gymWeightRack && flags.rackTopple) {
        appendUniqueStatement(immediateCauses, 'The barbell rack or box toppled while a barbell was being removed and struck people in the area.');
    }
    if (flags.vehicle) {
        appendUniqueStatement(immediateCauses, `${equipment} entered an uncontrolled movement or impact path and created a ${detectedHazard} exposure.`);
    }
    if (flags.noSpotter) {
        appendUniqueStatement(immediateCauses, 'The activity proceeded without an effective spotter, banksman, or positive exclusion control for the movement path.');
    }
    if (directCause) {
        appendUniqueStatement(immediateCauses, directCause);
    }
    appendUniqueStatement(immediateCauses, immediateCauses[0] || `${equipment} was involved in the immediate exposure described in the incident report.`);
    const eventOccurrence = ensureSentence(flags.gymWeightRack && flags.rackTopple
        ? 'The barbell rack or box toppled onto the member and another nearby person'
        : flags.vehicle
        ? `${equipment} movement entered an uncontrolled route or impact interface`
        : flags.barrierGap
            ? `${equipment} or the task entered an exposure path without an effective barrier`
            : flags.environmentGap
                ? `The work environment allowed the exposure path to remain active`
                : `${equipment} and the surrounding task conditions aligned to create the event pathway`);
    const organizationalFailure = ensureSentence(flags.gymWeightRack
        ? 'The barbell storage and retrieval controls did not prevent unsafe removal from the top, stepping on the box, or people sitting in the fall zone'
        : flags.priorSignals
        ? 'Prior warning signs, near misses, or reported concerns were not converted into timely corrective action, supervision focus, and control verification'
        : flags.trainingGap
            ? 'Competency, induction, and task briefing controls did not verify that workers understood the hazard and the required safe method before exposure'
            : flags.procedureGap
                ? 'Planning and control-of-work arrangements did not verify that the correct procedure, permit, risk assessment, or supervision control was active before the task'
                : 'Management controls for planning, supervision, competence assurance, and corrective-action closure did not give enough assurance before the work continued');
    const humanFailure = ensureSentence(flags.gymWeightRack && flags.olderPerson
        ? 'The member was over 55 years old and may not have had the strength or stability required to safely remove a heavy barbell from the top'
        : flags.noSpotter
        ? 'The team relied on individual judgement during movement instead of using a defined spotter, exclusion zone, or stop-work trigger'
        : flags.humanAction
            ? 'The task was completed with a behavioural deviation, distraction, shortcut, or lapse that the work system did not prevent or detect'
            : 'People were exposed because the work system allowed the task to proceed without a clear and verified safe interface between the worker, equipment, and hazard');
    const systemicFailure = ensureSentence(flags.gymWeightRack
        ? 'The gym-floor layout and equipment storage method allowed heavy equipment handling while another person was within the fall or struck-by zone'
        : flags.vehicle
        ? 'The traffic-management system did not reliably control vehicle-pedestrian/equipment interaction, reversing activity, route congestion, and exclusion-zone integrity'
        : flags.barrierGap
            ? 'Critical-control verification did not confirm that barriers, isolation, guarding, or PPE were effective before exposure'
            : flags.environmentGap
                ? 'Workplace layout, access, visibility, or housekeeping controls were not maintained at a level that prevented the exposure pathway'
                : 'The safety management system did not convert hazard identification into verified, sustained, and auditable controls');
    const organizationalRootCause = ensureSentence(flags.priorSignals
        ? 'near-miss learning and corrective-action governance did not force closure of a known repeat exposure before the event recurred'
        : flags.trainingGap
            ? 'competency assurance did not prove that people could recognize and control this hazard before starting the task'
            : flags.procedureGap
                ? 'the control-of-work process did not translate the documented safe method into verified controls at the workface'
                : 'control assurance did not prove that the critical safeguards for the task were present and effective');
    const contributingFactors = [];
    appendUniqueStatement(contributingFactors, organizationalFailure);
    appendUniqueStatement(contributingFactors, humanFailure);
    appendUniqueStatement(contributingFactors, systemicFailure);
    if (flags.congestion) {
        appendUniqueStatement(contributingFactors, 'Congestion, restricted access, or poor traffic-route clearance increased the likelihood of contact or impact.');
    }
    if (flags.maintenanceGap) {
        appendUniqueStatement(contributingFactors, `Inspection, maintenance, or pre-use checks did not remove the unsafe condition affecting ${equipment}.`);
    }
    if (flags.environmentGap) {
        appendUniqueStatement(contributingFactors, 'The surrounding work environment increased exposure through layout, access, visibility, housekeeping, or surface condition weaknesses.');
    }
    const rootCause = ensureSentence(`Most likely root cause: ${stripSentenceEnd(organizationalFailure)}; ${stripSentenceEnd(systemicFailure)}. This enabled the human-performance failure: ${stripSentenceEnd(humanFailure)}. Immediate event: ${stripSentenceEnd(immediateCauses[0])}`);
    const materialFactors = [];
    if (!flags.gymWeightRack && /(pallet rack|storage rack|rack\b)/i.test(factorText)) {
        appendUniqueStatement(materialFactors, 'The pallet or storage rack was the impacted asset/material interface.');
    }
    if (flags.gymWeightRack && /(barbell|dumbbell|weight)/i.test(factorText)) {
        appendUniqueStatement(materialFactors, 'The barbell was metal and heavy, increasing the impact force and injury potential.');
    }
    if (!flags.gymWeightRack && /(pallet|load|package|container|box|drum|cylinder)/i.test(factorText)) {
        appendUniqueStatement(materialFactors, 'The pallet, load, package, or container was part of the exposure path.');
    }
    if (/(oil|fluid|chemical|acid|solvent|gas|dust|smoke|spill|leak|vapou?r|fume)/i.test(factorText)) {
        appendUniqueStatement(materialFactors, 'Released or exposed material was part of the incident exposure path.');
    }
    if (/(debris|waste|scrap|loose material)/i.test(factorText)) {
        appendUniqueStatement(materialFactors, 'Loose debris, waste, or scrap material contributed to the workplace hazard.');
    }
    if (materialFactors.length === 0 && /(pallet|rack|load|material|debris|oil|chemical|spill|leak|gas|fluid)/i.test(factorText)) {
        factorSentences
            .filter((sentence) => /(pallet|rack|load|material|debris|oil|chemical|spill|leak|gas|fluid)/i.test(sentence))
            .slice(0, 3)
            .forEach((sentence) => appendUniqueStatement(materialFactors, sentence));
    }
    const fishbone = {
        man: [
            ...(flags.gymWeightRack && flags.olderPerson ? ['The affected member was over 55 years old and may not have had the strength or stability needed to safely remove a heavy barbell from the top.'] : []),
            ...(flags.gymWeightRack && flags.steppedOnBox ? ['The member stepped on the barbell box while trying to remove the barbell.'] : []),
            ...(flags.noSpotter ? ['No effective spotter or banksman was described for the movement path.'] : []),
            ...(flags.humanAction ? ['The report indicates a worker action, shortcut, lapse, or task-execution deviation.'] : []),
            ...(flags.trainingGap ? ['Training, competency, briefing, or awareness is mentioned as a possible gap.'] : [])
        ],
        machine: [
            ...(flags.gymWeightRack ? ['The heavy barbell rack or box can topple when weight is pulled from the top or handled improperly.'] : []),
            ...(flags.wrongEquipmentUse ? ['A storage box or non-task box was used as exercise/support equipment instead of the intended equipment.'] : []),
            ...(flags.vehicle ? [`${equipment} movement was part of the incident sequence.`] : []),
            ...(flags.maintenanceGap ? [`Inspection, maintenance, or pre-use checks are linked to ${equipment}.`] : [])
        ],
        material: materialFactors,
        method: [
            ...(flags.gymWeightRack && flags.steppedOnBox ? ['The member stepped on the barbell box to access the weight.'] : []),
            ...(flags.gymWeightRack && flags.topRemoval ? ['The barbell was pulled from the top instead of being removed from a lower or safer retrieval position.'] : []),
            ...(flags.wrongEquipmentUse ? ['The storage box was used for the exercise instead of the intended jump box or approved equipment.'] : []),
            ...(flags.noSpotter ? ['The movement method did not include an effective spotter, banksman, or stop point.'] : []),
            ...(flags.procedureGap ? ['The procedure, permit, risk assessment, checklist, or supervision control was not verified at the point of work.'] : []),
            ...(flags.priorSignals ? ['Earlier reports or near misses were not converted into verified controls before the event.'] : [])
        ],
        environment: [
            ...(flags.gymWeightRack && flags.peopleSeatedNearby ? ['People were sitting or positioned inside the fall/impact zone of the barbell rack.'] : []),
            ...(flags.congestion ? ['Congestion, restricted clearance, pedestrian interface, or weak segregation was described in the area.'] : []),
            ...(flags.environmentGap ? ['The workplace condition contributed through layout, access, visibility, housekeeping, or floor/surface condition.'] : [])
        ]
    };
    const pushWhy = (whys, value, supported = true) => {
        if (!supported)
            return;
        const statement = ensureSentence(value);
        if (statement && !whys.includes(statement))
            whys.push(statement);
    };
    const answerOnly = (answer) => ensureSentence(answer);
    const fiveWhyPaths = [];
    const addPath = (name, whys) => {
        const supportedWhys = whys.filter(Boolean).slice(0, 5);
        if (supportedWhys.length > 0) {
            fiveWhyPaths.push({ name: name || `Analysis Path ${fiveWhyPaths.length + 1}`, whys: supportedWhys });
        }
    };
    const mainWhys = [];
    if (flags.gymWeightRack) {
        pushWhy(mainWhys, answerOnly(eventOccurrence || 'The barbell rack or box toppled during barbell removal and struck people in the area.'));
        pushWhy(mainWhys, answerOnly(flags.steppedOnBox
            ? 'The member stepped on the barbell box and tried to remove a barbell from the top.'
            : immediateCauses[0]));
        pushWhy(mainWhys, answerOnly(flags.topRemoval
            ? 'Pulling a heavy barbell from the top while standing on the box shifted the load and made the rack or box unstable.'
            : 'The retrieval method created an unstable load path for the barbell rack or box.'));
        pushWhy(mainWhys, answerOnly('The storage/retrieval method did not prevent members from stepping on the box or taking barbells from the top instead of a safer lower position.'));
        pushWhy(mainWhys, answerOnly(flags.peopleSeatedNearby
            ? 'The exercise/storage area allowed people to sit within the fall or struck-by zone of heavy barbell storage.'
            : 'The gym-floor controls did not sufficiently separate members from the heavy-equipment fall zone.'));
        addPath('', mainWhys);
        const fiveWhys = fiveWhyPaths.flatMap((path) => path.whys);
        const mediaSubject = mediaEvidenceType === 'reported incident details' ? 'reported incident details indicate' : `${mediaEvidenceType} indicates`;
        const mediaAnalysisReport = ensureSentence(`The ${mediaSubject} that ${[
            eventOccurrence,
            immediateCauses[0],
            fishbone.method[0],
            fishbone.machine[0],
            fishbone.environment[0]
        ].filter(Boolean).map(lowerFirst).slice(0, 5).join('; ')}`);
        const capa = [
            {
                act: 'Reconfigure barbell storage so heavy barbells cannot be removed from the top and the rack/box cannot topple during member use',
                priority: 'high'
            },
            {
                act: 'Create and communicate a safe barbell retrieval method, including signage and floor-trainer intervention for unsafe use',
                priority: 'high'
            },
            {
                act: 'Keep seating and waiting areas outside the barbell rack fall/impact zone',
                priority: 'medium'
            }
        ];
        return {
            eventSummary,
            mediaAnalysisReport,
            visibleHazards: contributingFactors.slice(0, 4),
            equipmentCondition: [
                `${equipment} identified as the equipment or activity under review.`,
                `Severity context recorded as ${severity}.`
            ],
            immediateCauses,
            contributingFactors,
            fiveWhyPaths,
            fiveWhys,
            fishbone,
            rootCause,
            capa,
            missingInformation: [
                mediaContext.derivedFrames.length > 0
                    ? 'Review sampled video frames against the generated RCA before final sign-off.'
                    : 'Confirm scene evidence, witness statement, and exact task sequence during investigator review.',
                'Verify whether equipment layout, member supervision, signage, and seating arrangements allow recurrence of the same failure mode.'
            ]
        };
    }
    pushWhy(mainWhys, answerOnly(eventOccurrence || immediateCauses[0]), Boolean(eventOccurrence || immediateCauses[0]));
    pushWhy(mainWhys, answerOnly(flags.noSpotter
        ? 'The activity proceeded without an effective spotter, banksman, or positive exclusion control for the movement path.'
        : immediateCauses[0]), Boolean(immediateCauses[0] || flags.noSpotter));
    pushWhy(mainWhys, answerOnly(flags.noSpotter
        ? 'The task method did not require or verify a spotter, banksman, stop point, or exclusion zone before movement started.'
        : fishbone.method[0]), Boolean(flags.noSpotter || fishbone.method[0]));
    pushWhy(mainWhys, answerOnly(flags.congestion
        ? 'The aisle, route, or work area was congested, restricted, or weakly segregated.'
        : fishbone.environment[0] || fishbone.method[1]), Boolean(flags.congestion || fishbone.environment[0] || fishbone.method[1]));
    pushWhy(mainWhys, answerOnly(flags.priorSignals
        ? 'Earlier concerns were not closed through verified corrective actions before the same exposure recurred.'
        : organizationalFailure), Boolean(flags.priorSignals || organizationalFailure));
    addPath('', mainWhys);
    const controlWhys = [];
    pushWhy(controlWhys, answerOnly(systemicFailure), Boolean(systemicFailure));
    pushWhy(controlWhys, answerOnly(`The task method did not maintain separation between ${equipment} and the impact or exposure path.`), flags.vehicle || flags.barrierGap || flags.congestion);
    pushWhy(controlWhys, answerOnly('The procedure, permit, risk assessment, checklist, or supervision control was not verified at the point of work.'), flags.procedureGap);
    pushWhy(controlWhys, answerOnly(`Inspection, maintenance, or pre-use checks did not identify and remove the unsafe condition before the task involving ${equipment}.`), flags.maintenanceGap);
    addPath('', controlWhys);
    const fiveWhys = fiveWhyPaths.flatMap((path) => path.whys);
    const capa = [
        {
            act: flags.vehicle
                ? 'Review and update the site traffic-management plan, including reversing controls, exclusion zones, pedestrian segregation, and spotter/banksman requirements'
                : `Review and strengthen the safe system of work and critical controls for ${equipment}`,
            priority: 'high'
        },
        {
            act: flags.priorSignals
                ? 'Close all related near-miss and defect reports with documented corrective action, owner, due date, and effectiveness verification'
                : 'Complete a supervisor-led verification of controls before the activity is restarted',
            priority: 'high'
        },
        {
            act: 'Brief the affected team on the verified controls, stop-work triggers, and escalation route before similar work resumes',
            priority: 'medium'
        }
    ];
    const mediaSubject = mediaEvidenceType === 'reported incident details' ? 'reported incident details indicate' : `${mediaEvidenceType} indicates`;
    const mediaAnalysisReport = ensureSentence(`The ${mediaSubject} that ${[
        eventOccurrence,
        immediateCauses[0],
        fishbone.method[0],
        fishbone.machine[0],
        fishbone.environment[0]
    ].filter(Boolean).map(lowerFirst).slice(0, 5).join('; ')}`);
    return {
        eventSummary,
        mediaAnalysisReport,
        visibleHazards: contributingFactors.slice(0, 4),
        equipmentCondition: [
            `${equipment} identified as the equipment or activity under review.`,
            `Severity context recorded as ${severity}.`
        ],
        immediateCauses,
        contributingFactors,
        fiveWhyPaths,
        fiveWhys,
        fishbone,
        rootCause,
        capa,
        missingInformation: [
            mediaContext.derivedFrames.length > 0
                ? 'Review sampled video frames against the generated RCA before final sign-off.'
                : 'Confirm scene evidence, witness statement, and exact task sequence during investigator review.',
            'Verify whether prior reports, inspections, risk assessments, permits, training records, or CAPA history show the same failure mode.'
        ]
    };
};
let IncidentAiProviderService = class IncidentAiProviderService {
    async analyze({ incidentId, evidence, mediaContext, request }) {
        const outputs = [];
        const localOutput = this.buildLocalProviderOutput({
            incidentId,
            evidence,
            mediaContext,
            request
        });
        outputs.push(localOutput);
        const openAiOutput = await this.tryOpenAiProvider({
            evidence,
            mediaContext,
            request
        });
        if (openAiOutput)
            outputs.push(openAiOutput);
        const webhookOutput = await this.tryWebhookProvider({
            incidentId,
            evidence,
            mediaContext,
            request
        });
        if (webhookOutput)
            outputs.push(webhookOutput);
        const providerOrder = this.getProviderOrder();
        const providerMap = new Map(outputs.map((output) => [output.provider, output]));
        const orderedOutputs = providerOrder
            .map((provider) => providerMap.get(provider))
            .filter(Boolean);
        const fallbackOutputs = outputs.filter((output) => !orderedOutputs.some((item) => item.provider === output.provider));
        const resolvedOutputs = [...orderedOutputs, ...fallbackOutputs];
        return {
            incidentId,
            status: 'completed',
            provider: resolvedOutputs.map((output) => output.provider).join('+'),
            providersUsed: resolvedOutputs.map((output) => output.provider),
            transcriptionModel: this.resolveTranscriptionModel(openAiOutput),
            visionModel: this.resolveVisionModel(openAiOutput),
            transcript: this.pickTranscript(resolvedOutputs, localOutput),
            draft: this.mergeDrafts(resolvedOutputs),
            review: {
                status: 'pending'
            },
            mediaContext: {
                derivedFrameCount: mediaContext.derivedFrames.length,
                audioExtracted: Boolean(mediaContext.derivedAudio),
                warnings: [
                    ...mediaContext.warnings,
                    ...resolvedOutputs.flatMap((output) => output.warnings)
                ]
            }
        };
    }
    buildLocalProviderOutput({ evidence, mediaContext, request }) {
        const context = request.incidentContext || {};
        const summary = context.description?.trim()
            || evidence.notes?.trim()
            || 'Incident evidence was uploaded and analyzed to create a draft investigation.';
        const equipment = context.equipmentInvolved?.trim() || 'Equipment under review';
        const hazard = context.smartCategory?.trim() || 'General workplace hazard';
        const severity = context.severity?.trim() || 'Unspecified severity';
        const photoDescriptor = evidence.uploaded.photo
            ? `${evidence.uploaded.photo.fileName} (${Math.round(evidence.uploaded.photo.sizeBytes / 1024)} KB)`
            : '';
        const videoDescriptor = evidence.uploaded.video
            ? `${evidence.uploaded.video.fileName} (${Math.round(evidence.uploaded.video.sizeBytes / 1024)} KB)`
            : '';
        const evidenceSummary = [photoDescriptor, videoDescriptor].filter(Boolean).join(' and ');
        const localInference = buildLocalIncidentInference({
            context,
            evidence,
            mediaContext,
            summary,
            equipment,
            hazard,
            severity
        });
        return {
            provider: 'local',
            warnings: [],
            transcript: {
                text: evidence.notes?.trim()
                    || `Stored incident evidence includes ${evidenceSummary || 'uploaded media evidence'}.`,
                segments: [
                    {
                        startMs: 0,
                        endMs: 2500,
                        speaker: 'speaker_1',
                        text: evidence.notes?.trim() || `Initial evidence review references ${equipment} and ${hazard}.`
                    }
                ]
            },
            draft: {
                eventSummary: localInference.eventSummary,
                mediaAnalysisReport: localInference.mediaAnalysisReport,
                visibleHazards: [
                    ...localInference.visibleHazards,
                    ...(evidence.uploaded.photo ? [`Stored photo evidence available at ${evidence.uploaded.photo.storagePath}`] : []),
                    ...(evidence.uploaded.video ? [`Stored video evidence available at ${evidence.uploaded.video.storagePath}`] : []),
                    ...(mediaContext.derivedFrames.length > 0 ? [`${mediaContext.derivedFrames.length} sampled video frames were extracted for review`] : [])
                ],
                equipmentCondition: [
                    ...localInference.equipmentCondition,
                    ...(evidence.uploaded.photo
                        ? [`Photo evidence checksum ${evidence.uploaded.photo.sha256.slice(0, 12)}... captured for traceability`]
                        : []),
                    ...(evidence.uploaded.video
                        ? [`Video evidence checksum ${evidence.uploaded.video.sha256.slice(0, 12)}... captured for traceability`]
                        : [])
                ],
                immediateCauses: localInference.immediateCauses,
                contributingFactors: localInference.contributingFactors,
                fiveWhyPaths: localInference.fiveWhyPaths,
                fiveWhys: localInference.fiveWhys,
                fishbone: localInference.fishbone,
                rootCause: localInference.rootCause,
                capa: localInference.capa,
                confidence: 'medium',
                missingInformation: localInference.missingInformation
            }
        };
    }
    async tryOpenAiProvider({ evidence, mediaContext, request }) {
        if (!process.env.OPENAI_API_KEY || String(process.env.INCIDENT_AI_ENABLE_OPENAI || 'true').toLowerCase() !== 'true') {
            return null;
        }
        try {
            const transcript = mediaContext.derivedAudio
                ? await this.requestOpenAiTranscript(mediaContext.derivedAudio.absolutePath)
                : null;
            const draft = await this.requestOpenAiDraft({
                request,
                evidence,
                mediaContext,
                transcriptText: transcript?.text || evidence.notes || ''
            });
            return {
                provider: 'openai',
                transcript: transcript || undefined,
                draft,
                warnings: []
            };
        }
        catch (error) {
            return {
                provider: 'openai',
                draft: this.emptyDraft(),
                warnings: [`OpenAI provider skipped: ${this.normalizeError(error)}`]
            };
        }
    }
    async tryWebhookProvider({ incidentId, evidence, mediaContext, request }) {
        const webhookUrl = String(process.env.INCIDENT_AI_WEBHOOK_URL || '').trim();
        if (!webhookUrl)
            return null;
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.INCIDENT_AI_WEBHOOK_API_KEY
                        ? { Authorization: `Bearer ${process.env.INCIDENT_AI_WEBHOOK_API_KEY}` }
                        : {})
                },
                body: JSON.stringify({
                    incidentId,
                    incidentContext: request.incidentContext || {},
                    notes: evidence.notes || '',
                    mediaContext: {
                        photoCount: mediaContext.photoDataUrls.length,
                        frameCount: mediaContext.frameDataUrls.length,
                        audioExtracted: Boolean(mediaContext.derivedAudio),
                        warnings: mediaContext.warnings
                    }
                })
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.message || `Webhook provider failed with status ${response.status}.`);
            }
            return {
                provider: 'webhook',
                transcript: payload?.transcript ? payload.transcript : undefined,
                draft: this.normalizeDraft(payload?.draft || payload),
                warnings: []
            };
        }
        catch (error) {
            return {
                provider: 'webhook',
                draft: this.emptyDraft(),
                warnings: [`Webhook provider skipped: ${this.normalizeError(error)}`]
            };
        }
    }
    async requestOpenAiTranscript(absoluteAudioPath) {
        const audioBuffer = await node_fs_1.promises.readFile(absoluteAudioPath);
        const form = new FormData();
        form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe');
        form.append('response_format', 'verbose_json');
        form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio-track.mp3');
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: form
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error?.message || `OpenAI transcription failed with status ${response.status}.`);
        }
        return {
            text: String(payload?.text || '').trim(),
            segments: Array.isArray(payload?.segments)
                ? payload.segments.map((segment) => ({
                    startMs: Math.round(Number(segment.start || 0) * 1000),
                    endMs: Math.round(Number(segment.end || 0) * 1000),
                    speaker: segment.speaker || 'speaker_1',
                    text: segment.text || ''
                }))
                : []
        };
    }
    async requestOpenAiDraft({ request, evidence, mediaContext, transcriptText }) {
        const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
        const content = [
            {
                type: 'input_text',
                text: [
                    'You are generating a draft incident investigation JSON.',
                    'Use the uploaded photo and sampled video frames as evidence. If video frames show sequence, position, missing controls, congestion, equipment state, or unsafe acts, reflect those observations in the RCA.',
                    'Do not copy the incident description sentence verbatim. Rephrase it into investigation conclusions and why-answers.',
                    'Avoid generic wording such as "review required", "control failure", or "human investigator review". Every point must reference the actual task, equipment, media evidence, or event sequence.',
                    'Generate fiveWhyPaths as an array of objects. Use neutral names only, such as "Analysis Path 1" and "Analysis Path 2". Do not use names such as Organizational, Human, Systemic, Man, Method, or Root Cause as path names.',
                    'For each path, fill whys as a true 5-Why chain, but each why value must contain only the answer. Do not include the question text. Example values: "The member was injured while performing box jumps.", then "The box broke during the jump.", then "The box was a storage box, not a jump box."',
                    'Do not force 5 whys. Stop early when the evidence runs out. Never fill unknown later whys with generic management-system language.',
                    'Do not include path names, cause labels, "Why 1", or "Why did..." question text inside the whys values. The UI already displays the why number.',
                    'For fishbone, perform 4M extraction from the incident description, evidence notes, transcript, and visible media frames: Man, Machine, Material, and Method. Use Environment only as additional context if explicitly described. Leave categories empty if no concrete factor is present.',
                    'Create mediaAnalysisReport as a plain-language description of what is happening in the uploaded video/photo or evidence notes. This replaces any generic evidence summary.',
                    'For fault-tree content inside contributingFactors/immediateCauses, use only incident-specific event sequence and control-barrier facts.',
                    'Return valid JSON only with keys:',
                    'eventSummary, mediaAnalysisReport, visibleHazards, equipmentCondition, immediateCauses, contributingFactors, fiveWhyPaths, fiveWhys, fishbone, rootCause, capa, confidence, missingInformation.',
                    `Incident title: ${request.incidentContext?.title || ''}`,
                    `Description: ${request.incidentContext?.description || ''}`,
                    `Equipment involved: ${request.incidentContext?.equipmentInvolved || ''}`,
                    `Immediate action: ${request.incidentContext?.immediateAction || ''}`,
                    `Category: ${request.incidentContext?.smartCategory || ''}`,
                    `Severity: ${request.incidentContext?.severity || ''}`,
                    `Incident type: ${request.incidentContext?.type || ''}`,
                    `Evidence notes: ${evidence.notes || ''}`,
                    `Transcript context: ${transcriptText || ''}`
                ].join('\n')
            }
        ];
        mediaContext.photoDataUrls.slice(0, 1).forEach((imageUrl) => {
            content.push({
                type: 'input_image',
                image_url: imageUrl
            });
        });
        mediaContext.frameDataUrls.slice(0, Number(process.env.INCIDENT_AI_OPENAI_MAX_FRAMES || 4)).forEach((imageUrl) => {
            content.push({
                type: 'input_image',
                image_url: imageUrl
            });
        });
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model,
                input: [
                    {
                        role: 'user',
                        content
                    }
                ]
            })
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error?.message || `OpenAI vision analysis failed with status ${response.status}.`);
        }
        return this.normalizeDraft(this.extractJsonPayload(payload?.output_text || ''));
    }
    getProviderOrder() {
        const configured = String(process.env.INCIDENT_AI_PROVIDER_ORDER || 'webhook,openai,local')
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean);
        return Array.from(new Set([...configured, 'local']));
    }
    resolveTranscriptionModel(openAiOutput) {
        return openAiOutput ? (process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe') : 'local-media-context';
    }
    resolveVisionModel(openAiOutput) {
        return openAiOutput ? (process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini') : 'local-evidence-pipeline';
    }
    pickTranscript(outputs, localOutput) {
        return outputs.find((output) => output.transcript?.text)?.transcript || localOutput.transcript;
    }
    mergeDrafts(outputs) {
        const drafts = outputs.map((output) => output.draft);
        return {
            eventSummary: this.pickString(drafts, 'eventSummary'),
            mediaAnalysisReport: this.pickString(drafts, 'mediaAnalysisReport'),
            visibleHazards: this.mergeStringArrays(drafts.map((draft) => draft.visibleHazards)),
            equipmentCondition: this.mergeStringArrays(drafts.map((draft) => draft.equipmentCondition)),
            immediateCauses: this.mergeStringArrays(drafts.map((draft) => draft.immediateCauses)),
            contributingFactors: this.mergeStringArrays(drafts.map((draft) => draft.contributingFactors)),
            fiveWhyPaths: this.pickFiveWhyPaths(drafts),
            fiveWhys: this.mergeStringArrays(drafts.map((draft) => draft.fiveWhys)),
            fishbone: {
                man: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.man || [])),
                machine: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.machine || [])),
                material: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.material || [])),
                method: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.method || [])),
                environment: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.environment || []))
            },
            rootCause: this.pickString(drafts, 'rootCause'),
            capa: this.mergeCapa(drafts.map((draft) => draft.capa || [])),
            confidence: this.pickString(drafts, 'confidence') || 'medium',
            missingInformation: this.mergeStringArrays(drafts.map((draft) => draft.missingInformation))
        };
    }
    pickString(drafts, key) {
        const found = drafts.find((draft) => typeof draft[key] === 'string' && String(draft[key]).trim());
        return found?.[key] || '';
    }
    pickFiveWhyPaths(drafts) {
        const found = drafts.find((draft) => Array.isArray(draft.fiveWhyPaths) && draft.fiveWhyPaths.length > 0);
        return found?.fiveWhyPaths || [];
    }
    mergeStringArrays(collections) {
        const merged = new Set();
        collections.flat().forEach((item) => {
            const normalized = String(item || '').trim();
            if (normalized)
                merged.add(normalized);
        });
        return [...merged];
    }
    mergeCapa(collections) {
        const seen = new Set();
        const merged = [];
        collections.flat().forEach((item) => {
            const action = String(item?.act || '').trim();
            if (!action)
                return;
            const key = action.toLowerCase();
            if (seen.has(key))
                return;
            seen.add(key);
            merged.push({
                act: action,
                priority: item.priority || 'medium'
            });
        });
        return merged;
    }
    normalizeDraft(raw) {
        const draft = (raw && typeof raw === 'object') ? raw : {};
        return {
            eventSummary: String(draft.eventSummary || ''),
            mediaAnalysisReport: String(draft.mediaAnalysisReport || ''),
            visibleHazards: this.ensureStringArray(draft.visibleHazards),
            equipmentCondition: this.ensureStringArray(draft.equipmentCondition),
            immediateCauses: this.ensureStringArray(draft.immediateCauses),
            contributingFactors: this.ensureStringArray(draft.contributingFactors),
            fiveWhyPaths: this.normalizeFiveWhyPaths(draft.fiveWhyPaths),
            fiveWhys: this.ensureStringArray(draft.fiveWhys),
            fishbone: {
                man: this.ensureStringArray(draft.fishbone?.man),
                machine: this.ensureStringArray(draft.fishbone?.machine),
                material: this.ensureStringArray(draft.fishbone?.material),
                method: this.ensureStringArray(draft.fishbone?.method),
                environment: this.ensureStringArray(draft.fishbone?.environment)
            },
            rootCause: String(draft.rootCause || ''),
            capa: Array.isArray(draft.capa)
                ? draft.capa.map((item) => ({
                    act: String(item?.act || ''),
                    priority: String(item?.priority || 'medium')
                })).filter((item) => item.act)
                : [],
            confidence: String(draft.confidence || ''),
            missingInformation: this.ensureStringArray(draft.missingInformation)
        };
    }
    ensureStringArray(value) {
        return Array.isArray(value)
            ? value.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
    }
    normalizeFiveWhyPaths(value) {
        if (!Array.isArray(value))
            return [];
        return value.map((path, index) => {
            const rawName = String(path?.name || '').trim();
            const name = /(organizational|human|systemic|man|method|machine|material|environment|root cause)/i.test(rawName)
                ? `Analysis Path ${index + 1}`
                : (rawName || `Analysis Path ${index + 1}`);
            return {
                name,
                whys: this.ensureStringArray(path?.whys).map((why) => ensureSentence(normalizeInvestigationText(why).replace(/^why\s+[^?]+\?\s*because\s*/i, '')))
            };
        }).filter((path) => path.name && path.whys.length > 0);
    }
    extractJsonPayload(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed)
            return {};
        try {
            return JSON.parse(trimmed);
        }
        catch {
            const firstBrace = trimmed.indexOf('{');
            const lastBrace = trimmed.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
            }
            throw new Error('OpenAI response did not contain valid JSON.');
        }
    }
    emptyDraft() {
        return {
            eventSummary: '',
            mediaAnalysisReport: '',
            visibleHazards: [],
            equipmentCondition: [],
            immediateCauses: [],
            contributingFactors: [],
            fiveWhyPaths: [],
            fiveWhys: [],
            fishbone: {
                man: [],
                machine: [],
                material: [],
                method: [],
                environment: []
            },
            rootCause: '',
            capa: [],
            confidence: '',
            missingInformation: []
        };
    }
    normalizeError(error) {
        if (error instanceof Error)
            return error.message;
        return String(error || 'Unknown error');
    }
};
exports.IncidentAiProviderService = IncidentAiProviderService;
exports.IncidentAiProviderService = IncidentAiProviderService = __decorate([
    (0, common_1.Injectable)()
], IncidentAiProviderService);
