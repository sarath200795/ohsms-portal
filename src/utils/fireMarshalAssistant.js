// ─────────────────────────────────────────────────────────────────────────────
// Fire Marshal "Sam" — OHSMS adaptation.
//
// Ported from sarath200795/fire-marshal/src/lib/assistant.js. The original
// assistant counts extinguishers; this one counts incidents, permits,
// inspections, audits, CAPA, training, and emergency-equipment records that
// the OHSMS modules track.
//
// All exports are pure functions over the live OHSMS context object the
// FireMarshalProvider builds. No LLM dependency at the rule level — askAI()
// is a stub that returns null so the calling Assistant just falls back to
// the matched rule's text (or a friendly default) when no rule matches.
// ─────────────────────────────────────────────────────────────────────────────

// ── route → page key map ────────────────────────────────────────────────────
const pageOf = (pathname = '') => {
    if (pathname.includes('/dashboard'))           return 'dashboard';
    if (pathname.includes('/incidents'))           return 'incidents';
    if (pathname.includes('/ptw'))                 return 'ptw';
    if (pathname.includes('/loto'))                return 'loto';
    if (pathname.includes('/emergency-equipment')) return 'emergency-equipment';
    if (pathname.includes('/inspections'))         return 'inspections';
    if (pathname.includes('/audit'))               return 'audit';
    if (pathname.includes('/capa'))                return 'capa';
    if (pathname.includes('/risk'))                return 'risk';
    if (pathname.includes('/training'))            return 'training';
    if (pathname.includes('/contractors'))         return 'contractors';
    if (pathname.includes('/improvement'))         return 'improvement';
    if (pathname.includes('/consultation'))        return 'consultation';
    if (pathname.includes('/mock-drill'))          return 'mock-drill';
    if (pathname.includes('/health'))              return 'health';
    if (pathname.includes('/users'))               return 'users';
    if (pathname.includes('/sites'))               return 'sites';
    if (pathname.includes('/standards'))           return 'standards';
    if (pathname.includes('/analytics'))           return 'analytics';
    if (pathname.includes('/workspaces'))          return 'workspaces';
    if (pathname.includes('/setup'))               return 'setup';
    if (pathname.includes('/login'))               return 'login';
    if (pathname.includes('/vendor-portal'))       return 'vendor-portal';
    if (pathname.includes('/field-portal'))        return 'field-portal';
    if (pathname.includes('/field-app'))           return 'field-app';
    if (pathname.includes('/ohs-tools'))           return 'ohs-tools';
    return 'home';
};

// ── per-page guides ─────────────────────────────────────────────────────────
const GUIDES = {
    home: {
        title: 'Welcome',
        tips: [
            "Sign in or pick a workspace from the picker — I'll be ready to help.",
            'Every module has its own quick tips — just tap me on any page.',
        ],
    },
    login: {
        title: 'Sign In',
        tips: [
            "Pick the workspace you want to sign in to from the grid.",
            "Don't see your org? Use the workspace share link your admin sent — or run /setup once.",
        ],
    },
    dashboard: {
        title: 'Dashboard',
        tips: [
            'Your live workspace overview — every chart and KPI reflects the current site filter.',
            'Click any KPI card or chart slice to drill into the underlying module.',
            'Use the site switcher at the top to scope everything to one facility.',
        ],
    },
    incidents: {
        title: 'Incidents',
        tips: [
            'Record incidents, near-misses, and unsafe acts.',
            'The Smart Investigation flow uses AI to draft 5-Whys, fishbone, and CAPA from photos and video.',
            'Filter by site, type, severity, or status. Closed incidents stay searchable.',
        ],
    },
    ptw: {
        title: 'Permits to Work',
        tips: [
            'Issue, approve, and close work permits — Hot Work, Confined Space, Working at Height, Electrical, etc.',
            'Each permit gets a QR code; scanning it on the field shows the live permit status.',
            'Use the calendar view to see what permits are active right now.',
        ],
    },
    loto: {
        title: 'LOTO Procedures',
        tips: [
            'Build lockout/tagout procedures once, then execute them step-by-step in the field.',
            'Every approved procedure is QR-scannable — workers can pull it up on the equipment itself.',
            'Logs capture every isolation, verification, and re-energization with the operator name and timestamp.',
        ],
    },
    'emergency-equipment': {
        title: 'Emergency Equipment',
        tips: [
            'Fire extinguishers, AEDs, first-aid kits, eye-wash stations, spill kits — every life-safety asset lives here.',
            'IS 2190 compliance engine auto-calculates the next refill and HPT dates per extinguisher type.',
            "Refill / HPT badges turn yellow when a vendor's taken a unit off-site. Use the 'In Process of Refilling' filter.",
            'Scan an asset QR with the public app to see its current status without signing in.',
        ],
    },
    inspections: {
        title: 'Inspections',
        tips: [
            'Run scheduled inspections — daily, weekly, monthly, quarterly.',
            'Tick Pass / Fail / N/A per checkpoint; Fail items unlock a defect-notes field and an optional CAPA.',
            'Photo evidence is mandatory for some questions and uploaded straight to Firebase.',
        ],
    },
    audit: {
        title: 'Internal Audit',
        tips: [
            'Plan, execute, and close ISO 45001-style internal audits.',
            'Non-conformities raised here can be linked directly to CAPA actions.',
            'Each audit gets a closure report PDF on completion.',
        ],
    },
    capa: {
        title: 'CAPA Manager',
        tips: [
            'Corrective + preventive actions raised from any module land here.',
            'Each action has an owner, due date, status, and verification step.',
            'Overdue CAPA items pulse red — clear them before your next audit.',
        ],
    },
    risk: {
        title: 'Risk Assessment',
        tips: [
            'Run a HIRA per activity — hazards × likelihood × severity = risk score.',
            'Apply controls and re-score for the residual risk.',
            'Approval workflow ensures every register is signed off before going live.',
        ],
    },
    training: {
        title: 'Training Matrix',
        tips: [
            'Track competence per worker per training topic.',
            "Expiring certifications surface in the dashboard's 'Action required' panel.",
            'Bulk-upload training records via the spreadsheet template if you have a large workforce.',
        ],
    },
    contractors: {
        title: 'Contractors',
        tips: [
            'Manage vendor companies, their workers, and compliance documents.',
            'Each contractor has an Indian-legal mandatory document checklist seeded by service type.',
            'Approve vendor self-registration requests from the Users page (Pending tab).',
        ],
    },
    improvement: {
        title: 'Improvement',
        tips: [
            'Capture continuous-improvement ideas, kaizens, and near-miss-based suggestions.',
            'Promote an idea to a CAPA action with a single click.',
        ],
    },
    consultation: {
        title: 'Consultation',
        tips: [
            'Record consultation sessions with workers per ISO 45001 §5.4.',
            "Attach minutes, attendance, and any actions raised — they're searchable by site and date.",
        ],
    },
    'mock-drill': {
        title: 'Mock Drills',
        tips: [
            'Log fire drills and emergency exercises with a scored checklist.',
            'Capture teams, action log, and evidence photos.',
            "Each drill ends with a downloadable PDF score sheet.",
        ],
    },
    health: {
        title: 'Health Dashboard',
        tips: [
            'Occupational-health monitoring — medical exams, fitness checks, exposure registers.',
            'Expiring fitness cards surface in the dashboard automatically.',
        ],
    },
    users: {
        title: 'Users & Permissions',
        tips: [
            "Global Owner is the master role; Site Owners manage one site; Users get module-by-module access.",
            'Vendor accounts get a separate isolated portal — manage their access here too.',
            'Approve pending self-registrations from the Pending tab.',
        ],
    },
    sites: {
        title: 'Sites',
        tips: [
            'Add the facilities your org operates. Each site can have multiple Centers (areas / cost centres).',
            'Bulk-upload sites + centers via the spreadsheet template.',
        ],
    },
    standards: {
        title: 'Standards',
        tips: ['Reference library for the standards driving each module — ISO 45001, IS 2190, IS 15683, BOCW, etc.'],
    },
    analytics: {
        title: 'Analytics',
        tips: [
            "Cross-module analytics: incident frequency rates, severity, leading vs lagging indicators.",
            "Filter by site, date range, or category to compare facilities.",
        ],
    },
    workspaces: {
        title: 'Workspace Management',
        tips: [
            'Admin-only — manage every connected workspace across every device.',
            "Publish a workspace and any device opening /login sees it in the picker.",
            "Use the Delete button to remove a workspace from every device's picker (writes a tombstone).",
        ],
    },
    setup: {
        title: 'Database Setup',
        tips: [
            "Connect to a Firebase project (recommended) or a REST adapter for your own backend.",
            'Step 1 is "Security Rules" — copy the canonical rules from the panel and paste into your Firebase Console.',
        ],
    },
    'vendor-portal': {
        title: 'Vendor Portal',
        tips: [
            "Welcome — this is your dedicated portal as a registered contractor.",
            'Upload compliance documents in the Documentation tab.',
            'Fire-equipment vendors: use the Emergency Equipment tab to mark extinguishers as taken for refill or HPT.',
        ],
    },
    'field-portal': {
        title: 'Field Portal',
        tips: [
            "The mobile-friendly portal for field workers.",
            'Scan a QR code on any asset to open the relevant inspection / status page.',
        ],
    },
    'field-app': {
        title: 'Field App',
        tips: ["Quick-action workspace for field tasks — pick a module to drill in."],
    },
    'ohs-tools': {
        title: 'OHS Tools',
        tips: ['Utility tools the whole team can use without leaving the app.'],
    },
};

export function pageGuide(pathname = '') {
    const key = pageOf(pathname);
    return GUIDES[key] || GUIDES.home;
}

// ── suggested questions per page ─────────────────────────────────────────────
const QUESTIONS = {
    home: ['How do I sign in?', 'What modules are available?'],
    login: ['What is a workspace?', 'How do I add a new organisation?'],
    dashboard: ['What needs attention?', 'How are incidents trending?', 'What is overdue?'],
    incidents: ['How many incidents are open?', 'Show me critical incidents', 'How do I run Smart Investigation?'],
    ptw: ['Which permits are active?', 'How do I close a permit?', "What's a confined-space permit?"],
    loto: ['Which procedures are approved?', 'How do I execute a LOTO step?'],
    'emergency-equipment': ['What needs refill?', "What's overdue HPT?", 'Show me units in process of refilling', 'How do I print a QR tag?'],
    inspections: ['What inspections are due this week?', 'How do I create a checklist?'],
    audit: ['Which audits are open?', "Show me last quarter's findings"],
    capa: ['What CAPA is overdue?', 'How do I close a CAPA?'],
    risk: ['What is the highest-rated risk?', 'How do I score a hazard?'],
    training: ['Whose certifications expire this month?', 'How do I bulk-upload training records?'],
    contractors: ['Which contractors are non-compliant?', 'How do I onboard a vendor?'],
    improvement: ['Promote an idea to CAPA'],
    consultation: ['How do I attach minutes?'],
    'mock-drill': ['How did our last drill score?'],
    health: ['Whose fitness card is expiring?'],
    users: ['How do I approve a join request?', 'What roles can I assign?'],
    sites: ['How do I add a new center?'],
    workspaces: ['How do I publish a workspace?', 'Delete vs unlink — what is the difference?'],
};

export function suggestedQuestions(pathname = '') {
    const key = pageOf(pathname);
    return QUESTIONS[key] || ['What can you help with?'];
}

// ── rule-based answer engine ─────────────────────────────────────────────────
const safeNum = (n) => (Number.isFinite(n) ? n : 0);
const fmt = (n) => safeNum(n).toLocaleString();

// Each rule looks at the question, optionally scoped to the current page, and
// returns either { matched: false } or { matched: true, text, action? }.
const RULES = [
    // Universal: what needs attention
    {
        keywords: ['attention', 'urgent', 'overdue', "what's wrong", 'whats wrong', 'priorities'],
        run: (ctx) => {
            const items = [];
            if (ctx.openIncidents)        items.push(`${fmt(ctx.openIncidents)} open incident(s)`);
            if (ctx.overdueCapa)          items.push(`${fmt(ctx.overdueCapa)} overdue CAPA`);
            if (ctx.refillOverdue)        items.push(`${fmt(ctx.refillOverdue)} extinguisher refill(s) overdue`);
            if (ctx.hptOverdue)           items.push(`${fmt(ctx.hptOverdue)} HPT(s) overdue`);
            if (ctx.inspectionsOverdue)   items.push(`${fmt(ctx.inspectionsOverdue)} inspection(s) overdue`);
            if (ctx.trainingExpiring)     items.push(`${fmt(ctx.trainingExpiring)} training certification(s) expiring`);
            if (ctx.expiringDocuments)    items.push(`${fmt(ctx.expiringDocuments)} contractor document(s) expiring`);
            if (items.length === 0) return { matched: true, text: '🎉 Looking good — nothing flagged across the modules I can see right now.' };
            return { matched: true, text: `🚨 ${items.length} thing(s) need attention:\n• ${items.join('\n• ')}` };
        },
    },
    // Incidents
    {
        keywords: ['incident', 'how many incidents', 'open incident'],
        run: (ctx) => ctx.totalIncidents != null
            ? { matched: true, text: `Incidents — ${fmt(ctx.totalIncidents)} total recorded, ${fmt(ctx.openIncidents)} still open, ${fmt(ctx.closedIncidents)} closed.`, action: { type: 'navigate', to: '/incidents' } }
            : { matched: false },
    },
    {
        keywords: ['smart investigation', 'investigation', 'ai analyse', 'ai analyze'],
        run: () => ({ matched: true, text: "On any incident, scroll to the Evidence tab → upload the photo and (optional) video → click Run Smart Investigation. The AI drafts 5-Whys, a fishbone, and a CAPA you can edit before saving." }),
    },
    // PTW
    {
        keywords: ['permit', 'ptw', 'active permit'],
        run: (ctx) => ctx.activePtw != null
            ? { matched: true, text: `${fmt(ctx.activePtw)} active permit(s) right now. ${fmt(ctx.expiringPtw || 0)} expire within 24h.`, action: { type: 'navigate', to: '/ptw' } }
            : { matched: false },
    },
    // Emergency Equipment
    {
        keywords: ['refill', 'extinguisher refill'],
        run: (ctx) => ({
            matched: true,
            text: `${fmt(ctx.refillOverdue || 0)} extinguisher(s) overdue refill, ${fmt(ctx.refillDueSoon || 0)} due in the next 7 days, ${fmt(ctx.inRefillProcess || 0)} currently off-site with the vendor.`,
            action: { type: 'navigate', to: '/emergency-equipment' },
        }),
    },
    {
        keywords: ['hpt', 'hydrostatic'],
        run: (ctx) => ({
            matched: true,
            text: `${fmt(ctx.hptOverdue || 0)} extinguisher(s) overdue HPT, ${fmt(ctx.hptDueSoon || 0)} due in the next 7 days.`,
            action: { type: 'navigate', to: '/emergency-equipment' },
        }),
    },
    {
        keywords: ['qr', 'print tag', 'print qr'],
        run: () => ({ matched: true, text: "On Emergency Equipment → click the QR icon on any row to open the print preview. The QR encodes the asset's databaseURL so any device can scan it." }),
    },
    // CAPA
    {
        keywords: ['capa', 'corrective action'],
        run: (ctx) => ctx.totalCapa != null
            ? { matched: true, text: `${fmt(ctx.totalCapa)} CAPA action(s) — ${fmt(ctx.openCapa)} open, ${fmt(ctx.overdueCapa)} overdue.`, action: { type: 'navigate', to: '/capa' } }
            : { matched: false },
    },
    // Inspections
    {
        keywords: ['inspection', 'inspections'],
        run: (ctx) => ctx.inspectionsScheduled != null
            ? { matched: true, text: `${fmt(ctx.inspectionsScheduled)} inspection(s) scheduled, ${fmt(ctx.inspectionsOverdue)} overdue, ${fmt(ctx.inspectionsThisWeek)} due this week.`, action: { type: 'navigate', to: '/inspections' } }
            : { matched: false },
    },
    // Audits
    {
        keywords: ['audit'],
        run: (ctx) => ctx.openAudits != null
            ? { matched: true, text: `${fmt(ctx.openAudits)} audit(s) open, ${fmt(ctx.closedAudits)} closed this quarter.`, action: { type: 'navigate', to: '/audit' } }
            : { matched: false },
    },
    // Training
    {
        keywords: ['training', 'certification', 'expiring'],
        run: (ctx) => ctx.trainingExpiring != null
            ? { matched: true, text: `${fmt(ctx.trainingExpiring)} certification(s) expiring within 30 days, ${fmt(ctx.totalTraining || 0)} total records.`, action: { type: 'navigate', to: '/training' } }
            : { matched: false },
    },
    // Vendors / Contractors
    {
        keywords: ['vendor', 'contractor'],
        run: (ctx) => ctx.totalContractors != null
            ? { matched: true, text: `${fmt(ctx.totalContractors)} contractor(s) registered, ${fmt(ctx.nonCompliantContractors || 0)} non-compliant.`, action: { type: 'navigate', to: '/contractors' } }
            : { matched: false },
    },
    // LOTO
    {
        keywords: ['loto', 'lockout', 'isolation'],
        run: (ctx) => ctx.approvedLoto != null
            ? { matched: true, text: `${fmt(ctx.approvedLoto)} approved LOTO procedure(s), ${fmt(ctx.activeLockouts || 0)} active lockouts right now.`, action: { type: 'navigate', to: '/loto' } }
            : { matched: false },
    },
    // Navigation
    {
        keywords: ['go to', 'open', 'take me to'],
        run: (ctx, raw) => {
            const text = raw.toLowerCase();
            const map = [
                ['incident', '/incidents'], ['permit', '/ptw'], ['ptw', '/ptw'], ['loto', '/loto'],
                ['extinguisher', '/emergency-equipment'], ['emergency', '/emergency-equipment'],
                ['inspection', '/inspections'], ['audit', '/audit'], ['capa', '/capa'],
                ['risk', '/risk'], ['training', '/training'], ['contractor', '/contractors'],
                ['user', '/users'], ['site', '/sites'], ['workspace', '/workspaces'],
                ['dashboard', '/dashboard'], ['analytics', '/analytics'],
            ];
            const hit = map.find(([k]) => text.includes(k));
            return hit
                ? { matched: true, text: `Taking you to ${hit[0]}…`, action: { type: 'navigate', to: hit[1] } }
                : { matched: false };
        },
    },
    // Help / What can you do
    {
        keywords: ['help', 'what can you do', 'who are you', 'sam', 'about you'],
        run: () => ({ matched: true, text: "I'm Sam — your OHSMS safety guide. I show per-page tips, count records across every module, and can take you straight to any module. Try asking 'what needs attention?' or 'how many incidents are open?'." }),
    },
];

const matchScore = (text, keywords) => {
    const t = text.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (t.includes(kw)) score += kw.length;
    return score;
};

export function answer(question, ctx = {}) {
    if (!question?.trim()) return { matched: false, text: "Ask me anything about your workspace — incidents, permits, CAPA, training…" };
    let best = null;
    let bestScore = 0;
    for (const rule of RULES) {
        const s = matchScore(question, rule.keywords);
        if (s > bestScore) { bestScore = s; best = rule; }
    }
    if (!best) return { matched: false, text: "I don't have a rule for that yet — try asking about incidents, permits, CAPA, refills, or inspections." };
    return best.run(ctx, question);
}

// ── AI fallback stub (no LLM integration yet) ────────────────────────────────
export async function askAI(/* question, context */) {
    return null;
}

export function buildAIContext(ctx = {}) {
    return {
        module: ctx.module || ctx.pathname || 'unknown',
        site: ctx.site || '',
        counts: {
            incidents: ctx.totalIncidents || 0,
            openIncidents: ctx.openIncidents || 0,
            ptw: ctx.activePtw || 0,
            capaOverdue: ctx.overdueCapa || 0,
            refillOverdue: ctx.refillOverdue || 0,
            inspectionsOverdue: ctx.inspectionsOverdue || 0,
        },
    };
}
