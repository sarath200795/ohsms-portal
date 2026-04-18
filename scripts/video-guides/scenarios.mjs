const mainSite = 'HQ-01';

export const guidedScenarios = [
  {
    id: 'dashboard-overview',
    mode: 'main',
    title: 'Dashboard Overview',
    route: '/dashboard',
    narration: 'This dashboard is the main control hub of the OHSMS platform. It gives users a fast view of site context, active actions, quick access buttons, and the full module launcher used to open operational and management workflows.',
    steps: [
      {
        title: 'Command hub overview',
        bullets: ['Review site context and pending actions', 'Use quick actions for common safety tasks', 'Launch each module from one central workspace'],
        waitMs: 2600
      },
      {
        title: 'Module launcher',
        bullets: ['Each tile opens a dedicated safety module', 'The dashboard changes by role and permissions', 'Users start most workflows from this home page'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2600
      }
    ]
  },
  {
    id: 'users-module',
    mode: 'main',
    title: 'Users Module',
    route: '/users',
    narration: 'The users module controls access to the application. Administrators can create users, assign roles, limit site access, and control which modules each person can use.',
    steps: [
      {
        title: 'Access control and roles',
        bullets: ['Create and maintain user accounts', 'Assign role, site, and module permissions', 'Control who can access each workflow'],
        waitMs: 2800
      },
      {
        title: 'User register view',
        bullets: ['Review active users across the organization', 'Update permissions and status from the registry', 'Use site-aware filtering where needed'],
        action: { type: 'scrollTo', y: 420 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'sites-module',
    mode: 'main',
    title: 'Sites Module',
    route: '/sites',
    narration: 'The sites module defines the locations used across the whole system. Site records support filtering, permissions, reporting, and operational routing throughout the application.',
    steps: [
      {
        title: 'Site master data',
        bullets: ['Maintain site names and codes', 'Support reporting and row level access', 'Provide context for all major modules'],
        waitMs: 2600
      }
    ]
  },
  {
    id: 'analytics-module',
    mode: 'main',
    title: 'Analytics Module',
    route: '/Analytics',
    narration: 'The analytics module turns operating records into management insight. It combines summary metrics and visual trends to help leaders monitor safety performance across the organization.',
    steps: [
      {
        title: 'Performance analytics',
        bullets: ['Review high level trend indicators', 'Compare data across sites and workflows', 'Support management review and decision making'],
        waitMs: 2600
      },
      {
        title: 'Charts and summaries',
        bullets: ['Use visual dashboards for quick understanding', 'Track activity volumes and patterns', 'Convert raw records into useful insight'],
        action: { type: 'scrollTo', y: 560 },
        waitMs: 2600
      }
    ]
  },
  {
    id: 'risk-module',
    mode: 'main',
    title: 'Risk Assessment Module',
    route: `/risk?site=${mainSite}`,
    narration: 'The risk assessment module manages HIRA records for site activities. Users can review the repository, inspect revision history, import assessments from Excel, and build new risk records with activities, hazards, and controls.',
    steps: [
      {
        title: 'Risk repository',
        bullets: ['Review saved assessments by site and status', 'Monitor high risk and ALARP records', 'Open assessments for print or edit'],
        waitMs: 2400
      },
      {
        title: 'Revision history',
        bullets: ['Track who changed an assessment', 'Review why updates were made', 'Maintain document control for HIRA changes'],
        action: { type: 'clickRole', role: 'button', name: 'Revision Logs' },
        waitMs: 2200
      },
      {
        title: 'Smart import',
        bullets: ['Import structured hazard content from Excel', 'Accelerate large scale HIRA setup', 'Reduce manual entry time'],
        action: { type: 'clickRole', role: 'button', name: 'Smart Import' },
        waitMs: 2200
      },
      {
        title: 'Assessment builder',
        bullets: ['Create activities, hazards, controls, and scores', 'Build new risk assessments in a guided form', 'Save the record for review and printing'],
        action: { type: 'clickRole', role: 'button', name: 'New Assessment' },
        waitMs: 2600
      }
    ]
  },
  {
    id: 'incidents-module',
    mode: 'main',
    title: 'Incidents Module',
    route: `/incidents?site=${mainSite}`,
    narration: 'The incidents module manages the full reporting and investigation process. Teams can log the event, assign the investigation team, perform root cause analysis, raise CAPA actions, and connect the incident outcome back to risk records.',
    steps: [
      {
        title: 'Incident repository',
        bullets: ['Review active and historical incident records', 'Filter by date, type, severity, and site', 'Open a record for view, edit, print, or delete'],
        waitMs: 2500
      },
      {
        title: 'Initial report',
        bullets: ['Capture the core event details', 'Record injured persons, actions, and evidence', 'Save a draft or continue to investigation'],
        action: { type: 'clickRole', role: 'button', name: 'New Report' },
        waitMs: 2300
      },
      {
        title: 'Root cause analysis',
        bullets: ['Use fishbone, fault tree, and five whys', 'Document the investigation logic', 'Build the final root cause statement'],
        action: { type: 'clickRole', role: 'button', name: 'Investigate' },
        waitMs: 2300
      },
      {
        title: 'CAPA and HIRA linkage',
        bullets: ['Assign corrective actions from the record', 'Track closeout and ownership', 'Confirm whether linked risk assessments were updated'],
        action: { type: 'clickRole', role: 'button', name: 'CAPA' },
        waitMs: 2300
      }
    ]
  },
  {
    id: 'consultation-module',
    mode: 'main',
    title: 'Consultation Module',
    route: `/consultation?site=${mainSite}`,
    narration: 'The consultation module records meetings, employee participation, and statutory communication activities. Users can log minutes, attendees, action plans, and view compliance through both repository and calendar views.',
    steps: [
      {
        title: 'Meeting repository',
        bullets: ['Store HSE committee and consultation records', 'Track attendees, minutes, and actions', 'Open records for detail or print'],
        waitMs: 2400
      },
      {
        title: 'Calendar compliance view',
        bullets: ['Check whether required meetings were held', 'See month and year based requirements', 'Identify missing consultation events'],
        action: { type: 'clickRole', role: 'button', name: 'Calendar' },
        waitMs: 2200
      },
      {
        title: 'New meeting form',
        bullets: ['Create a new meeting record', 'Assign action owners and due dates', 'Save minutes and consultation outcomes'],
        action: { type: 'clickRole', role: 'button', name: 'New Meeting' },
        waitMs: 2300
      }
    ]
  },
  {
    id: 'audit-module',
    mode: 'main',
    title: 'Internal Audit Module',
    route: `/audit?site=${mainSite}`,
    narration: 'The internal audit module supports planning, execution, response, and closure. Audit teams can move from schedule and assignment through findings, responses, and final reporting in one controlled workflow.',
    steps: [
      {
        title: 'Audit workspace',
        bullets: ['Plan and manage audit activities', 'Track findings and auditee responses', 'Support reporting and closeout'],
        waitMs: 2800
      },
      {
        title: 'Audit launch options',
        bullets: ['Move into scheduler, auditor, auditee, reports, or calendar views', 'Use the hub to separate workflows by responsibility', 'Keep audit evidence organized from start to close'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2600
      }
    ]
  },
  {
    id: 'capa-module',
    mode: 'main',
    title: 'CAPA Module',
    route: `/capa?site=${mainSite}`,
    narration: 'The CAPA module centralizes corrective and preventive actions raised across the system. It helps teams assign owners, track due dates, and close actions from a single management view.',
    steps: [
      {
        title: 'Action register',
        bullets: ['Review open, in progress, and closed CAPA items', 'Filter by site, owner, and status', 'Track overdue actions from one place'],
        waitMs: 2600
      },
      {
        title: 'Central action control',
        bullets: ['CAPA items can originate from incidents, audits, training, and meetings', 'Owners update progress directly in the register', 'Leaders get a single view of action health'],
        action: { type: 'scrollTo', y: 500 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'training-module',
    mode: 'main',
    title: 'Training Module',
    route: `/training?site=${mainSite}`,
    narration: 'The training module manages competence and compliance across the workforce. Users can review the dashboard, open the matrix, navigate the calendar, inspect logs, and create new training records.',
    steps: [
      {
        title: 'Training dashboard',
        bullets: ['Review valid, expiring, and overdue records', 'Identify pending competence actions', 'Open alerts and linked follow-up items'],
        waitMs: 2300
      },
      {
        title: 'Training matrix',
        bullets: ['Compare people against required topics', 'Use filters to focus by site or contractor', 'Export the matrix when needed'],
        action: { type: 'clickRole', role: 'button', name: 'Matrix' },
        waitMs: 2200
      },
      {
        title: 'Training calendar',
        bullets: ['See scheduled training events over time', 'Plan sessions and review upcoming needs', 'Support proactive compliance planning'],
        action: { type: 'clickRole', role: 'button', name: 'Calendar' },
        waitMs: 2200
      },
      {
        title: 'Logs and record form',
        bullets: ['Review historical records and printed outputs', 'Create a new training record from the form', 'Maintain the full competence trail'],
        action: { type: 'clickRole', role: 'button', name: 'Logs' },
        waitMs: 2000
      },
      {
        title: 'New training record',
        bullets: ['Add course details, attendees, and dates', 'Capture evidence and completion data', 'Save a reusable training history'],
        action: { type: 'clickRole', role: 'button', name: 'New' },
        waitMs: 2200
      }
    ]
  },
  {
    id: 'improvement-module',
    mode: 'main',
    title: 'Improvement Module',
    route: `/improvement?site=${mainSite}`,
    narration: 'The improvement module is used for structured proposals and follow-up improvements. Teams can review the register, submit new proposals, route approvals, and track the action plan linked to each idea.',
    steps: [
      {
        title: 'Improvement register',
        bullets: ['Review proposals by site and status', 'Track action progress for each improvement', 'Open records for edit, print, or review'],
        waitMs: 2400
      },
      {
        title: 'Proposal form',
        bullets: ['Capture the idea, impact, and required actions', 'Send proposals into approval flow', 'Track implementation after approval'],
        action: { type: 'clickRole', role: 'button', name: 'New Proposal' },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'contractors-module',
    mode: 'main',
    title: 'Contractors Module',
    route: `/contractors?site=${mainSite}`,
    narration: 'The contractors module manages company profiles, worker details, and deployment records. It gives the organization a structured view of contractor safety data and external workforce readiness.',
    steps: [
      {
        title: 'Contractor safety registry',
        bullets: ['Review contractor companies and worker records', 'Track deployment and safety passport style details', 'Open profiles for deeper contractor management'],
        waitMs: 2600
      },
      {
        title: 'Worker and company detail views',
        bullets: ['Move between company and worker information', 'Maintain external workforce records in one place', 'Support site based contractor oversight'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2500
      }
    ]
  },
  {
    id: 'ohs-tools-hub',
    mode: 'main',
    title: 'OHS Tools Hub',
    route: `/ohs-tools?site=${mainSite}`,
    narration: 'The OHS tools hub is the launch point for the specialist operational tools. From here, users enter permit to work, LOTO, standards, health, and emergency equipment workflows.',
    steps: [
      {
        title: 'Operational tool launcher',
        bullets: ['Open PTW, LOTO, standards, health, and emergency equipment', 'Keep specialist workflows grouped in one place', 'Support fast access for operational teams'],
        waitMs: 2600
      },
      {
        title: 'Tool cards',
        bullets: ['Each card opens a dedicated operational control module', 'The current site context is passed forward', 'This hub is useful for frequent site operations'],
        action: { type: 'scrollTo', y: 420 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'ptw-module',
    mode: 'main',
    title: 'Permit To Work Module',
    route: `/ptw?site=${mainSite}`,
    narration: 'The permit to work module manages controlled work authorization from start to finish. Teams can review live permits, manage approvals, and support field execution with the same live record.',
    steps: [
      {
        title: 'Permit control dashboard',
        bullets: ['Review permit volume and status', 'Open records from the registry for action or print', 'Track work authorization across the site'],
        waitMs: 2800
      },
      {
        title: 'Permit registry',
        bullets: ['See live and historical permits', 'Move from review into active record handling', 'Support field and office use in one workflow'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2500
      }
    ]
  },
  {
    id: 'loto-module',
    mode: 'main',
    title: 'LOTO Module',
    route: `/loto?site=${mainSite}`,
    narration: 'The LOTO module manages isolation procedures and live execution. It helps teams review approved procedures, apply control steps in sequence, and track lock status through the job.',
    steps: [
      {
        title: 'Isolation procedure library',
        bullets: ['Review approved LOTO procedures', 'Support step-by-step lockout execution', 'Track isolation status in a controlled view'],
        waitMs: 2800
      },
      {
        title: 'Execution workspace',
        bullets: ['Guide the user through safe energy isolation', 'Keep live progress visible on the record', 'Support QR based access in the field'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2500
      }
    ]
  },
  {
    id: 'health-module',
    mode: 'main',
    title: 'Occupational Health Module',
    route: `/health-dashboard?site=${mainSite}`,
    narration: 'The occupational health module supports surveillance, vaccination, illness, and injury related health records. It gives the safety team a dedicated space to manage worker health workflows inside the wider OHSMS platform.',
    steps: [
      {
        title: 'Health management workspace',
        bullets: ['Track health related cases and monitoring programs', 'Manage occupational health records and follow up', 'Link health data to wider safety processes'],
        waitMs: 2600
      },
      {
        title: 'Health forms and views',
        bullets: ['Open different health workflows from one module', 'Capture ongoing health surveillance data', 'Review records across time and site'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'standards-module',
    mode: 'main',
    title: 'Standards Module',
    route: `/Standards?site=${mainSite}`,
    narration: 'The standards module is the document control space for approved procedures and operating guidance. Teams use it to access current standards and maintain structured operational documentation.',
    steps: [
      {
        title: 'Document control workspace',
        bullets: ['Review controlled standards and SOP records', 'Keep approved documents available to the workforce', 'Support consistent site execution through document access'],
        waitMs: 2600
      },
      {
        title: 'Controlled record list',
        bullets: ['Open and review current documents', 'Track status and supporting details', 'Maintain one source of truth for standards'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'inspections-module',
    mode: 'main',
    title: 'Inspections Module',
    route: `/inspections?site=${mainSite}`,
    narration: 'The inspections module manages recurring inspection schedules and completions. Users can review the calendar, open history, manage forms, and complete assigned inspections against live schedules.',
    steps: [
      {
        title: 'Inspection schedule',
        bullets: ['See assigned inspections on the calendar', 'Identify due and overdue items', 'Launch a live inspection from the schedule'],
        waitMs: 2400
      },
      {
        title: 'Inspection history',
        bullets: ['Review completed inspections over time', 'Maintain evidence of finished checks', 'Use history for audit and follow up'],
        action: { type: 'clickRole', role: 'button', name: 'History' },
        waitMs: 2200
      },
      {
        title: 'Manage forms',
        bullets: ['Create and maintain reusable inspection templates', 'Set assignment windows and frequency rules', 'Control how forms appear on the live calendar'],
        action: { type: 'clickRole', role: 'button', name: 'Manage Forms' },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'emergency-module',
    mode: 'main',
    title: 'Emergency Module',
    route: `/mock-drill?site=${mainSite}`,
    narration: 'The emergency module captures drills and response readiness activities. It helps the organization document planning, execution, and learning from emergency exercises.',
    steps: [
      {
        title: 'Emergency readiness workspace',
        bullets: ['Review emergency drill activities', 'Open records that support preparedness', 'Capture response evidence and outcomes'],
        waitMs: 2600
      },
      {
        title: 'Emergency drill views',
        bullets: ['Navigate between available emergency functions', 'Store learnings and execution history', 'Support continuous readiness improvement'],
        action: { type: 'scrollTo', y: 480 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'emergency-equipment-module',
    mode: 'main',
    title: 'Emergency Equipment Module',
    route: `/emergency-equipment?site=${mainSite}`,
    narration: 'The emergency equipment module manages safety assets such as fire extinguishers, first aid kits, AEDs, eyewash stations, and spill kits. It supports inspection schedules, QR access, and equipment specific checklists.',
    steps: [
      {
        title: 'Equipment registry',
        bullets: ['Review all emergency equipment assets', 'Track due dates and inspection status', 'Filter by site and equipment type'],
        waitMs: 2500
      },
      {
        title: 'Inspection workflow',
        bullets: ['Open equipment inspection sheets', 'Use equipment specific checklists', 'Automatically calculate and store the next inspection date'],
        action: { type: 'scrollTo', y: 520 },
        waitMs: 2500
      }
    ]
  },
  {
    id: 'field-app-overview',
    mode: 'main',
    title: 'Internal Field App Workspace',
    route: `/field-app?site=${mainSite}`,
    narration: 'The internal field app workspace gives logged in employees a focused operational hub inside the main application. It brings inspections, permits, LOTO, incidents, emergency workflows, and equipment access into one field friendly launcher.',
    steps: [
      {
        title: 'Field app hub',
        bullets: ['Open operational modules from one focused workspace', 'Use the current site context for field work', 'Support fast access for site teams'],
        waitMs: 2600
      },
      {
        title: 'Field module cards',
        bullets: ['Launch inspections, PTW, LOTO, incidents, and emergency equipment', 'Keep the field workflow simpler than the full enterprise hub', 'Return safely to the correct home context'],
        action: { type: 'scrollTo', y: 420 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'field-portal-overview',
    mode: 'field',
    title: 'Field Portal Overview',
    route: '/field-portal',
    narration: 'The field portal gives mobile teams a separate operational entry point. Users can access inspections, permits, LOTO, incidents, and emergency equipment from a simplified workspace designed for site use and QR scanning.',
    steps: [
      {
        title: 'Field home workspace',
        bullets: ['Use a separate portal for field operations', 'Open site modules with a focused interface', 'Work faster without entering the full enterprise dashboard'],
        waitMs: 2600
      },
      {
        title: 'QR and module launch',
        bullets: ['Use the QR button for PTW, LOTO, and equipment access', 'Open field modules directly from the portal cards', 'Keep site operations isolated from the main hub'],
        action: { type: 'scrollTo', y: 420 },
        waitMs: 2400
      }
    ]
  },
  {
    id: 'vendor-portal-overview',
    mode: 'public',
    title: 'Vendor Portal Overview',
    route: '/vendor-portal',
    narration: 'The vendor portal is the separate entry point for contractor and vendor users. It keeps vendor access isolated from the enterprise dashboard while allowing external partners to work with assigned company and worker information.',
    steps: [
      {
        title: 'Vendor portal entry',
        bullets: ['Use a separate login area for vendor users', 'Keep external access isolated from employee modules', 'Support contractor focused workflows'],
        waitMs: 2800
      },
      {
        title: 'Vendor access flow',
        bullets: ['Vendor users sign in with provisioned portal credentials', 'The portal opens only the assigned vendor workspace after login', 'Enterprise users manage vendor access from the contractors module'],
        action: { type: 'scrollTo', y: 420 },
        waitMs: 2600
      }
    ]
  }
];

export const publicSampleScenarios = [
  {
    id: 'public-login-overview',
    title: 'Public Login Overview',
    route: '/',
    waitMs: 2500,
    actions: [
      { type: 'hover', selector: 'button:text-is("Sign In")', waitMs: 500 },
      { type: 'hover', selector: 'button:text-is("Register Org")', waitMs: 500 },
      { type: 'click', selector: 'button:text-is("Register Org")', waitMs: 900 },
      { type: 'click', selector: 'button:text-is("Sign In")', waitMs: 900 }
    ]
  },
  {
    id: 'public-field-portal-overview',
    title: 'Public Field Portal Overview',
    route: '/field-portal',
    waitMs: 2500,
    actions: [
      { type: 'hover', selector: 'button:has-text("Access Field Portal")', waitMs: 800 }
    ]
  }
];
