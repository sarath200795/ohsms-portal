import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  ensureDir,
  rawRoot,
  synthesizeNeuralSpeechToMp3,
  synthesizeSpeechToWave,
  transcodeToMp4WithAudio,
  videoRoot
} from './helpers.mjs';
import {
  findLongestPlayableVideo,
  getMediaDurationSeconds,
  mixAudioFiles,
  renderDelayedAudio,
  resetDirectory,
  runFfmpeg,
  transcodeAudioToWav,
  withTimeout
} from './deep-dive-utils.mjs';

const viewport = { width: 1280, height: 720 };
const requestedKey = process.argv[2] || process.env.VIDEO_TUTORIAL || 'all';
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-JennyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-4%';

const publicPath = (...parts) => path.join(process.cwd(), 'public', ...parts);

const scenarios = [
  {
    key: 'audit-capa',
    scenarioId: 'audit-capa-module-live-tutorial',
    outputSubdir: 'module-deep-dives',
    publicTargets: [
      publicPath('tutorial-videos', 'module-deep-dives', 'audit-capa-module-live-tutorial.mp4'),
      publicPath('tutorials', 'audit-capa.mp4')
    ],
    thumbnailTarget: publicPath('thumbnails', 'audit-capa.jpg'),
    accent: '#0ea5e9',
    title: 'Audit and CAPA Tutorial',
    category: 'Enterprise Module Tutorial',
    routeTag: '/audit and /capa',
    segments: [
      {
        key: 'title',
        guideTitle: 'Audit and CAPA assurance loop',
        heading: 'Plan, execute, respond, close',
        subheading: 'A connected walkthrough of Internal Audit and the central CAPA Manager.',
        bullets: [
          'Plan the audit from the scheduler',
          'Log findings and auditee responses',
          'Track corrective actions in one CAPA register'
        ],
        narration: 'This tutorial covers the assurance loop across Internal Audit and CAPA. You will see how an audit is planned, how findings are raised and answered, and how corrective and preventive actions are controlled from the central CAPA Manager.',
        panel: {
          mode: 'timeline',
          title: 'Assurance loop',
          subtitle: 'The audit module creates evidence. CAPA keeps the follow-up visible until closure.',
          steps: ['Schedule', 'Execute', 'Respond', 'Verify', 'Track CAPA'],
          stats: [
            ['Audit scope', 'ISO 45001'],
            ['Site context', 'HQ-01'],
            ['Closure evidence', 'Required']
          ]
        }
      },
      {
        key: 'audit-hub',
        guideTitle: 'Open the Internal Audit hub',
        heading: 'Internal Audit Hub',
        subheading: 'The hub separates each audit responsibility into a focused workspace.',
        bullets: [
          'Scheduler plans audits and assigns people',
          'Auditor Workplace records findings',
          'Auditee Workplace captures replies and evidence'
        ],
        narration: 'Start in the Internal Audit hub. The scheduler is used for planning. The auditor workplace is used for execution and findings. The auditee workplace is where the responsible person submits root cause, correction, CAPA, owner, due date, and evidence.',
        panel: {
          mode: 'cards',
          title: 'Internal Audit Hub',
          subtitle: 'Six entry points mirror the actual module: scheduler, auditor, auditee, reports, calendar, and dashboard.',
          cards: [
            ['Audit Scheduler', 'Plan annual audits and assign auditors', 'calendar-alt'],
            ['Auditor Workplace', 'Execute audits and record findings', 'clipboard-list'],
            ['Auditee Workplace', 'Submit corrections and evidence', 'user-edit'],
            ['Audit Reports', 'Verify closure and generate PDFs', 'file-contract'],
            ['Audit Calendar', 'Visual lifecycle timeline', 'calendar-days'],
            ['Dashboard', 'Analytics and trends', 'chart-pie']
          ]
        }
      },
      {
        key: 'scheduler',
        guideTitle: 'Create the audit plan',
        heading: 'Audit Scheduler',
        subheading: 'Define site, standard, lead auditor, team members, and execution rows.',
        bullets: [
          'Select the target site and standard',
          'Assign the lead auditor and audit team',
          'Build the execution matrix by area, date, and time'
        ],
        narration: 'In the scheduler, the planner selects the target site, confirms the standard, assigns the lead auditor and team, then builds the execution matrix. Each row sets the auditor, auditee, department, area, scope, date, and time for the audit activity.',
        panel: {
          mode: 'form',
          title: 'Section 1: General Information',
          subtitle: 'The execution matrix becomes the task list used by the audit team.',
          fields: [
            ['Target Site', 'Headquarters'],
            ['Standard', 'ISO 45001:2018'],
            ['Lead Auditor', 'HSE Lead'],
            ['Start Date', '2026-06-01'],
            ['End Date', '2026-06-03'],
            ['Team Members', 'Operations HSE, Maintenance Lead']
          ],
          rows: [
            ['Auditor', 'Auditee', 'Area', 'Aspect', 'Date'],
            ['HSE Lead', 'Production Head', 'Machine shop', 'Operational controls', '2026-06-01'],
            ['Ops HSE', 'Warehouse Lead', 'Warehouse', 'Emergency readiness', '2026-06-02']
          ]
        }
      },
      {
        key: 'findings',
        guideTitle: 'Record findings and auditee response',
        heading: 'Finding to response',
        subheading: 'The audit record captures finding type, clause, evidence, root cause, correction, and CAPA.',
        bullets: [
          'Auditor logs findings with evidence',
          'Auditee responds with cause and correction',
          'CAPA owner and target date are mandatory'
        ],
        narration: 'During execution, the auditor logs each finding and attaches evidence. The auditee then responds with root cause, immediate correction, corrective or preventive action, action owner, target date, and optional supporting evidence. This is the handoff that turns a finding into a managed action.',
        panel: {
          mode: 'split',
          title: 'Audit Finding Response',
          subtitle: 'Finding records become CAPA source data after the auditee response is saved.',
          leftTitle: 'Auditor finding',
          leftItems: ['Type: Minor NC', 'Clause: 8.1 Operational control', 'Evidence: Guard checklist missing on Line 2'],
          rightTitle: 'Auditee response',
          rightItems: ['Root cause recorded', 'Correction completed', 'CAPA owner assigned', 'Target date locked']
        }
      },
      {
        key: 'capa-manager',
        guideTitle: 'Track closure in CAPA Manager',
        heading: 'Global CAPA Manager',
        subheading: 'Actions from audits, incidents, inspections, drills, meetings, and improvements appear together.',
        bullets: [
          'Filter by site, source, and status',
          'Update owner and progress',
          'Close only with comments and evidence'
        ],
        narration: 'Once responses include CAPA, the action appears in the central CAPA Manager. Leaders can filter by site, source, and status, review overdue actions, change owners when permitted, and close actions only after closure comments and evidence are captured.',
        panel: {
          mode: 'table',
          title: 'CAPA Register',
          subtitle: 'One action tracker for audit, incident, inspection, emergency drill, consultation, and improvement sources.',
          stats: [
            ['Total Actions', '24'],
            ['Closed', '15'],
            ['Open', '7'],
            ['Overdue', '2']
          ],
          rows: [
            ['Source', 'Ref ID', 'Action Description', 'Owner', 'Due', 'Status'],
            ['Audit', 'AUD-45001-021', 'Update machine guard inspection control', 'Maintenance Lead', '2026-06-14', 'Open'],
            ['Incident', 'INC-2026-004', 'Retrain operators on isolation verification', 'HSE Lead', '2026-06-18', 'In Progress'],
            ['Inspection', 'Forklift checklist', 'Replace damaged horn on FLT-03', 'Warehouse Lead', '2026-06-09', 'Overdue']
          ]
        }
      },
      {
        key: 'summary',
        guideTitle: 'Close the loop',
        heading: 'Audit ready closure',
        subheading: 'The audit report and CAPA register preserve the evidence trail.',
        bullets: [
          'Audit planning creates accountability',
          'Findings create structured responses',
          'CAPA tracks ownership, due dates, evidence, and closure'
        ],
        narration: 'That completes the Audit and CAPA tutorial. The audit module controls planning, findings, responses, reporting, and verification. The CAPA Manager keeps every corrective action visible until it has an owner, due date, status update, closure comment, and supporting evidence.',
        panel: {
          mode: 'timeline',
          title: 'Audit ready evidence trail',
          subtitle: 'Use this flow whenever audit findings need formal follow-up and visible management control.',
          steps: ['Plan', 'Audit', 'Respond', 'CAPA', 'Verify closure'],
          stats: [
            ['Record type', 'Audit finding'],
            ['Action source', 'Audit'],
            ['Final state', 'Closed with evidence']
          ]
        }
      }
    ]
  },
  {
    key: 'organization-onboarding',
    scenarioId: 'organization-onboarding-tutorial',
    outputSubdir: 'getting-started',
    publicTargets: [
      publicPath('tutorial-videos', 'getting-started', 'organization-onboarding-tutorial.mp4'),
      publicPath('tutorials', 'onboarding.mp4')
    ],
    thumbnailTarget: publicPath('thumbnails', 'onboarding.jpg'),
    accent: '#fb923c',
    title: 'Onboarding an Organisation',
    category: 'Getting Started Tutorial',
    routeTag: '/setup',
    segments: [
      {
        key: 'title',
        guideTitle: 'Create your workspace',
        heading: 'Onboard an Organisation',
        subheading: 'Move from the public site to a live workspace with an owner account and join code.',
        bullets: [
          'Open the setup wizard',
          'Create the organisation profile',
          'Invite users after the workspace is ready'
        ],
        narration: 'This tutorial shows how to onboard an organisation in OHSMS Enterprise. The flow starts in the setup wizard, creates the company workspace, assigns the first Global Owner, and prepares the join code used to invite the rest of the team.',
        panel: {
          mode: 'timeline',
          title: 'Organisation setup path',
          subtitle: 'The onboarding flow is designed for a first-time owner setting up the system.',
          steps: ['Choose database', 'Upload logo', 'Create organisation', 'Owner login', 'Invite team'],
          stats: [
            ['Owner role', 'Global Owner'],
            ['Access', 'All modules'],
            ['Team access', 'Join code']
          ]
        }
      },
      {
        key: 'setup-entry',
        guideTitle: 'Start from setup',
        heading: 'Database Setup Wizard',
        subheading: 'The same setup route controls database choice, branding, and organisation creation.',
        bullets: [
          'Use Create Organisation from the home page',
          'Finish database configuration first',
          'Continue into branding and owner account setup'
        ],
        narration: 'From the public home page, choose Create Organisation to open the setup wizard. The wizard confirms the database first, then moves into optional branding and the organisation owner account. This keeps the workspace connected before any users are created.',
        panel: {
          mode: 'cards',
          title: 'Setup Wizard',
          subtitle: 'The public onboarding path does not require a prior login.',
          cards: [
            ['Choose Database', 'Firebase or your own REST API', 'database'],
            ['Configure Connection', 'Paste credentials and test reachability', 'plug'],
            ['Upload Logo', 'Optional brand image for the workspace', 'image'],
            ['Create Organisation', 'Create first admin user and launch', 'building-user']
          ]
        }
      },
      {
        key: 'logo',
        guideTitle: 'Add workspace branding',
        heading: 'Upload Your Logo',
        subheading: 'The logo is optional and can also be updated later by the owner.',
        bullets: [
          'PNG, JPG, SVG, and WEBP are accepted',
          'The image is compressed before storage',
          'Skipping this step still allows onboarding to continue'
        ],
        narration: 'After the database is saved, the owner can upload a logo. The application compresses the image for safe storage and uses it across the workspace. This step can be skipped during setup and completed later from owner administration.',
        panel: {
          mode: 'form',
          title: 'Logo setup',
          subtitle: 'A clean logo helps users confirm they are in the correct organisation.',
          fields: [
            ['Accepted files', 'PNG, JPG, SVG, WEBP'],
            ['Compression', '256 by 256 preview'],
            ['Maximum size', 'Optimised before save'],
            ['Can skip', 'Yes']
          ],
          rows: [
            ['Action', 'Result'],
            ['Choose image file', 'Preview appears in setup wizard'],
            ['Use this logo', 'Logo is included with organisation details'],
            ['Skip for now', 'Continue to owner creation']
          ]
        }
      },
      {
        key: 'owner',
        guideTitle: 'Create the first owner',
        heading: 'Create Your Organisation',
        subheading: 'The first user becomes the Global Owner with complete module access.',
        bullets: [
          'Enter organisation name',
          'Enter owner full name and email',
          'Use a secure password for the first account'
        ],
        narration: 'The final setup form creates the organisation and the first admin user. The first user becomes the Global Owner. That role receives full access to every site, every module, user administration, site setup, and future workspace configuration.',
        panel: {
          mode: 'form',
          title: 'Create Organisation and First Admin User',
          subtitle: 'These fields define the workspace and the first owner identity.',
          fields: [
            ['Organisation Name', 'Acme Safety Solutions'],
            ['Your Full Name', 'Safety Owner'],
            ['Email Address', 'owner@company.com'],
            ['Password', 'At least 6 characters'],
            ['Role created', 'Global Owner']
          ],
          rows: [
            ['Permission area', 'Owner capability'],
            ['Users', 'Approve and assign roles'],
            ['Sites', 'Create and manage locations'],
            ['Modules', 'Access all enterprise workflows']
          ]
        }
      },
      {
        key: 'invite',
        guideTitle: 'Invite the team',
        heading: 'Join code and user approval',
        subheading: 'After setup, users request access and the owner approves their roles.',
        bullets: [
          'Share the organisation join code',
          'Approve pending users from User Management',
          'Assign site and module permissions'
        ],
        narration: 'After the workspace is created, the owner shares the organisation join code. New users request access with that code. The owner or site admin approves each request, assigns a role, selects the primary site, and chooses which modules the person can use.',
        panel: {
          mode: 'table',
          title: 'User onboarding control',
          subtitle: 'New users do not receive full access automatically.',
          stats: [
            ['Join code', 'Generated'],
            ['Approval', 'Required'],
            ['Access model', 'Role + site + module']
          ],
          rows: [
            ['Step', 'Owner action', 'Result'],
            ['1', 'Share join code', 'User can request access'],
            ['2', 'Approve account', 'Status changes from Pending to Active'],
            ['3', 'Assign permissions', 'User sees only approved modules']
          ]
        }
      },
      {
        key: 'summary',
        guideTitle: 'Workspace ready',
        heading: 'Go live safely',
        subheading: 'Once onboarding is complete, all EHS modules use the same organisation context.',
        bullets: [
          'Database connected',
          'Organisation and owner created',
          'Team access controlled through roles'
        ],
        narration: 'That completes the organisation onboarding tutorial. The database is connected, the organisation exists, the Global Owner is active, and the team can now be invited with controlled site and module access.',
        panel: {
          mode: 'timeline',
          title: 'Ready for day one',
          subtitle: 'Use the dashboard to begin incidents, risk assessments, inspections, audits, training, permits, LOTO, and CAPA tracking.',
          steps: ['Workspace', 'Owner', 'Users', 'Sites', 'Modules'],
          stats: [
            ['Status', 'Ready'],
            ['Owner access', 'Full'],
            ['Next task', 'Invite team']
          ]
        }
      }
    ]
  },
  {
    key: 'database-connection',
    scenarioId: 'database-connection-tutorial',
    outputSubdir: 'getting-started',
    publicTargets: [
      publicPath('tutorial-videos', 'getting-started', 'database-connection-tutorial.mp4'),
      publicPath('tutorials', 'firebase-setup.mp4')
    ],
    thumbnailTarget: publicPath('thumbnails', 'firebase-setup.jpg'),
    accent: '#fbbf24',
    title: 'Connecting the Database',
    category: 'Getting Started Tutorial',
    routeTag: '/setup',
    segments: [
      {
        key: 'title',
        guideTitle: 'Connect your data store',
        heading: 'Connect the Database',
        subheading: 'Choose Firebase for a fast start or connect your own REST database backend.',
        bullets: [
          'The app stores data in your selected backend',
          'Firebase is the quickest built-in option',
          'REST allows PostgreSQL, MongoDB, MySQL, Supabase, or custom APIs'
        ],
        narration: 'This tutorial explains how to connect the database. OHSMS can use Firebase Realtime Database for a fast start, or a REST API adapter for PostgreSQL, MongoDB, MySQL, Supabase, PocketBase, and other backends you control.',
        panel: {
          mode: 'cards',
          title: 'Database choices',
          subtitle: 'The setup wizard stores the selected adapter locally and reloads the app against that backend.',
          cards: [
            ['Firebase', 'Free tier, real-time, no backend server needed', 'fire'],
            ['Your Own Database', 'REST adapter for SQL, NoSQL, or self-hosted APIs', 'server'],
            ['Security Rules', 'Control who can read and write organisation data', 'shield'],
            ['Test Connection', 'Verify reachability before creating the workspace', 'plug']
          ]
        }
      },
      {
        key: 'firebase-project',
        guideTitle: 'Prepare Firebase',
        heading: 'Create a Firebase project',
        subheading: 'Use Firebase Console to enable Authentication and Realtime Database.',
        bullets: [
          'Create a project at console.firebase.google.com',
          'Enable Realtime Database',
          'Enable Email/Password Authentication'
        ],
        narration: 'For Firebase, create a project in Firebase Console. Enable Realtime Database, choose a database location, and enable Email and Password Authentication. These are the minimum services required for user login and live data storage.',
        panel: {
          mode: 'timeline',
          title: 'Firebase preparation',
          subtitle: 'Complete these console steps before pasting credentials into OHSMS.',
          steps: ['Create project', 'Realtime Database', 'Email/Password Auth', 'Web app config', 'Rules'],
          stats: [
            ['Auth provider', 'Email/Password'],
            ['Database', 'Realtime Database'],
            ['Storage owner', 'Your Firebase project']
          ]
        }
      },
      {
        key: 'paste-config',
        guideTitle: 'Paste credentials',
        heading: 'Firebase Configuration',
        subheading: 'Copy the web app firebaseConfig values into the setup wizard.',
        bullets: [
          'API key and project ID are required',
          'Database URL connects the live data store',
          'JSON paste mode can fill fields faster'
        ],
        narration: 'In the setup wizard, paste the Firebase web app configuration. API key, auth domain, project ID, app ID, and database URL identify the Firebase project. These values are not a data secret. Access is protected by Authentication and Security Rules.',
        panel: {
          mode: 'form',
          title: 'Firebase Configuration',
          subtitle: 'Use form mode or paste the firebaseConfig object as JSON.',
          fields: [
            ['apiKey', 'AIzaSy...'],
            ['authDomain', 'your-project.firebaseapp.com'],
            ['databaseURL', 'https://your-project-default-rtdb.firebaseio.com'],
            ['projectId', 'your-project-id'],
            ['appId', '1:123456:web:abcdef']
          ],
          rows: [
            ['Button', 'Purpose'],
            ['Paste JSON', 'Fill config from Firebase web app snippet'],
            ['Test Connection', 'Checks that credentials initialise correctly'],
            ['Save and Continue', 'Stores selected adapter and reloads the app']
          ]
        }
      },
      {
        key: 'rules',
        guideTitle: 'Publish rules',
        heading: 'Security Rules',
        subheading: 'Rules isolate organisation data and require authenticated users.',
        bullets: [
          'Copy the provided rules template',
          'Paste it into Firebase Realtime Database rules',
          'Publish before going live'
        ],
        narration: 'Before users start entering live records, publish the security rules. The project includes a database rules file and the setup wizard includes rule guidance. Rules make sure users read and write only through the organisation and role structure intended by the application.',
        panel: {
          mode: 'split',
          title: 'Database security',
          subtitle: 'Keys identify the project. Rules protect the data.',
          leftTitle: 'Do this',
          leftItems: ['Copy rules from setup guidance', 'Paste into Realtime Database Rules', 'Publish and test'],
          rightTitle: 'Why it matters',
          rightItems: ['Tenant data isolation', 'Authenticated access only', 'Role-aware reads and writes']
        }
      },
      {
        key: 'rest',
        guideTitle: 'Use your own database',
        heading: 'REST API option',
        subheading: 'Use the REST adapter when your data lives behind your own backend.',
        bullets: [
          'Set the API base URL',
          'Provide CRUD endpoints for OHSMS paths',
          'Use JWT auth for production access'
        ],
        narration: 'If you prefer your own database, choose Your Own Database. The REST adapter can connect to an API that exposes health, auth, and CRUD endpoints. This is the path for PostgreSQL, MongoDB, MySQL, Supabase, PocketBase, or any custom backend.',
        panel: {
          mode: 'table',
          title: 'REST backend contract',
          subtitle: 'The adapter sends normal HTTP requests to your API base URL.',
          stats: [
            ['Auth', 'JWT'],
            ['Realtime', 'SSE or polling'],
            ['Backend', 'Your server']
          ],
          rows: [
            ['Method', 'Endpoint', 'Purpose'],
            ['GET', '/health', 'Connection test'],
            ['POST', '/auth/login', 'User login'],
            ['GET', '/{path}', 'Read data'],
            ['POST', '/{path}', 'Create child record'],
            ['PATCH', '/{path}', 'Update a record']
          ]
        }
      },
      {
        key: 'summary',
        guideTitle: 'Connection complete',
        heading: 'Save and continue',
        subheading: 'After the database is saved, the organisation setup can create the first workspace.',
        bullets: [
          'Test the selected adapter',
          'Save the configuration',
          'Continue to logo and organisation creation'
        ],
        narration: 'That completes the database connection tutorial. Test the selected adapter, save the configuration, and continue to onboarding. From that point onward, the application stores organisation records, users, modules, reports, and CAPA data in the database you selected.',
        panel: {
          mode: 'timeline',
          title: 'Connected data path',
          subtitle: 'The selected backend becomes the data source for every module.',
          steps: ['Choose', 'Configure', 'Test', 'Save', 'Onboard'],
          stats: [
            ['Adapter', 'Firebase or REST'],
            ['Status', 'Connected'],
            ['Next step', 'Create organisation']
          ]
        }
      }
    ]
  }
];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const iconClass = (name) => {
  const normalized = String(name || '').trim();
  return normalized ? `fa-${normalized}` : 'fa-circle-dot';
};

const renderPanel = (panel = {}, accent = '#46d7ff') => {
  const stats = panel.stats || [];
  const statHtml = stats.length
    ? `<div class="stats-row">${stats.map(([label, value]) => `
        <div class="stat-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>`).join('')}</div>`
    : '';

  if (panel.mode === 'cards') {
    return `
      ${statHtml}
      <div class="card-grid">
        ${(panel.cards || []).map(([title, desc, icon]) => `
          <div class="feature-card">
            <div class="feature-icon"><i class="fas ${iconClass(icon)}"></i></div>
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(desc)}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (panel.mode === 'form') {
    const fields = (panel.fields || []).map(([label, value]) => `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(value)}</b>
      </label>
    `).join('');
    const rows = panel.rows || [];
    return `
      ${statHtml}
      <div class="form-grid">${fields}</div>
      ${rows.length ? renderTable(rows) : ''}
    `;
  }

  if (panel.mode === 'table') {
    return `
      ${statHtml}
      ${renderTable(panel.rows || [])}
    `;
  }

  if (panel.mode === 'split') {
    return `
      ${statHtml}
      <div class="split-grid">
        <div class="split-panel">
          <h4>${escapeHtml(panel.leftTitle || 'Before')}</h4>
          ${(panel.leftItems || []).map((item) => `<p><i class="fas fa-check"></i>${escapeHtml(item)}</p>`).join('')}
        </div>
        <div class="split-panel split-panel--accent">
          <h4>${escapeHtml(panel.rightTitle || 'After')}</h4>
          ${(panel.rightItems || []).map((item) => `<p><i class="fas fa-arrow-right"></i>${escapeHtml(item)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  return `
    ${statHtml}
    <div class="timeline">
      ${(panel.steps || []).map((step, index) => `
        <div class="timeline-step">
          <div class="timeline-dot">${index + 1}</div>
          <span>${escapeHtml(step)}</span>
        </div>
      `).join('')}
    </div>
    <div class="summary-band" style="border-color:${accent}55">
      <i class="fas fa-shield-halved"></i>
      <span>${escapeHtml(panel.subtitle || 'Follow the workflow in sequence and keep the evidence trail complete.')}</span>
    </div>
  `;
};

const renderTable = (rows = []) => {
  if (!rows.length) return '';
  const [header, ...body] = rows;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>
        <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
};

const renderSceneHtml = (scenario, segment, index) => {
  const panel = segment.panel || {};
  const guideBullets = (segment.bullets || []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 1280px;
      height: 720px;
      overflow: hidden;
      background: #05070b;
      color: #eef5ff;
      font-family: "Inter", "Segoe UI", Arial, sans-serif;
    }
    .stage {
      position: relative;
      width: 1280px;
      height: 720px;
      padding: 22px;
      background:
        radial-gradient(circle at 82% 18%, ${scenario.accent}22, transparent 29%),
        radial-gradient(circle at 20% 85%, rgba(249,115,22,0.16), transparent 27%),
        linear-gradient(135deg, #05070b 0%, #111827 55%, #071015 100%);
    }
    .app-frame {
      position: absolute;
      inset: 22px;
      display: grid;
      grid-template-columns: 205px 1fr;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.11);
      border-radius: 24px;
      background: rgba(8, 13, 20, 0.88);
      box-shadow: 0 36px 100px rgba(0,0,0,0.48);
    }
    .rail {
      padding: 24px 18px;
      background: linear-gradient(180deg, rgba(10,15,24,0.98), rgba(7,10,16,0.98));
      border-right: 1px solid rgba(255,255,255,0.08);
    }
    .brand {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 30px;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      color: #061018;
      background: ${scenario.accent};
      box-shadow: 0 0 28px ${scenario.accent}66;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 8px 0;
      padding: 11px 12px;
      border-radius: 12px;
      color: #97a6ba;
      font-size: 13px;
      font-weight: 700;
    }
    .nav-item.active {
      color: #f8fbff;
      background: ${scenario.accent}22;
      border: 1px solid ${scenario.accent}55;
    }
    .main {
      display: grid;
      grid-template-rows: 74px 1fr;
      min-width: 0;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 26px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(7,11,18,0.62);
    }
    .topbar small {
      display: block;
      margin-bottom: 4px;
      color: ${scenario.accent};
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }
    .topbar h1 {
      margin: 0;
      font-size: 25px;
      line-height: 1;
      letter-spacing: 0;
    }
    .route-tag {
      padding: 10px 14px;
      border-radius: 12px;
      color: #dbeafe;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      font-size: 12px;
      font-weight: 800;
    }
    .content {
      padding: 26px;
      overflow: hidden;
    }
    .panel-title {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .panel-title h2 {
      margin: 0 0 8px;
      color: #ffffff;
      font-size: 30px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .panel-title p {
      margin: 0;
      max-width: 760px;
      color: #9aa9bc;
      font-size: 14px;
      line-height: 1.45;
    }
    .step-pill {
      flex: 0 0 auto;
      padding: 9px 12px;
      border-radius: 999px;
      color: ${scenario.accent};
      background: ${scenario.accent}18;
      border: 1px solid ${scenario.accent}40;
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat-card {
      min-height: 78px;
      padding: 14px;
      border-radius: 16px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .stat-card span {
      display: block;
      margin-bottom: 10px;
      color: #8fa0b4;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.13em;
    }
    .stat-card strong {
      display: block;
      color: #ffffff;
      font-size: 24px;
      line-height: 1;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 15px;
    }
    .feature-card {
      min-height: 150px;
      padding: 18px;
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035));
      border: 1px solid rgba(255,255,255,0.11);
      box-shadow: 0 16px 40px rgba(0,0,0,0.22);
    }
    .feature-icon {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      margin-bottom: 16px;
      border-radius: 14px;
      color: ${scenario.accent};
      background: ${scenario.accent}18;
      border: 1px solid ${scenario.accent}3d;
      font-size: 17px;
    }
    .feature-card h4 {
      margin: 0 0 8px;
      font-size: 17px;
      line-height: 1.1;
    }
    .feature-card p {
      margin: 0;
      color: #a8b5c6;
      font-size: 12px;
      line-height: 1.45;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .field {
      display: block;
      min-height: 76px;
      padding: 13px 14px;
      border-radius: 14px;
      background: rgba(1,6,12,0.55);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .field span {
      display: block;
      color: #7f8da1;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      margin-bottom: 10px;
    }
    .field b {
      color: #f8fbff;
      font-size: 15px;
    }
    .table-wrap {
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.11);
      background: rgba(1,6,12,0.58);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      padding: 13px 14px;
      color: #7f8da1;
      background: rgba(1,4,9,0.82);
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 10px;
    }
    td {
      padding: 13px 14px;
      color: #dfe8f6;
      border-top: 1px solid rgba(255,255,255,0.07);
      vertical-align: top;
    }
    tbody tr:nth-child(even) td {
      background: rgba(255,255,255,0.025);
    }
    .split-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-top: 12px;
    }
    .split-panel {
      min-height: 250px;
      padding: 22px;
      border-radius: 20px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .split-panel--accent {
      background: ${scenario.accent}14;
      border-color: ${scenario.accent}44;
    }
    .split-panel h4 {
      margin: 0 0 18px;
      font-size: 23px;
    }
    .split-panel p {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 12px;
      color: #dbeafe;
      font-weight: 700;
    }
    .split-panel i {
      color: ${scenario.accent};
    }
    .timeline {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin: 28px 0;
    }
    .timeline-step {
      min-height: 126px;
      padding: 16px;
      border-radius: 18px;
      text-align: center;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .timeline-dot {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      margin: 0 auto 16px;
      border-radius: 50%;
      color: #031016;
      background: ${scenario.accent};
      font-weight: 900;
      box-shadow: 0 0 30px ${scenario.accent}66;
    }
    .timeline-step span {
      color: #ffffff;
      font-size: 14px;
      font-weight: 800;
    }
    .summary-band {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 18px;
      padding: 18px 20px;
      border-radius: 18px;
      background: rgba(0,0,0,0.24);
      border: 1px solid rgba(255,255,255,0.1);
      color: #c8d5e7;
      font-size: 15px;
      line-height: 1.45;
    }
    .summary-band i {
      color: ${scenario.accent};
      font-size: 22px;
    }
    .guide {
      position: absolute;
      left: 44px;
      bottom: 42px;
      width: 420px;
      z-index: 20;
      padding: 18px 20px;
      border-radius: 18px;
      color: #f8fbff;
      background: linear-gradient(180deg, rgba(5,9,14,0.94), rgba(10,16,24,0.97));
      border: 1px solid ${scenario.accent}55;
      box-shadow: 0 20px 56px rgba(0,0,0,0.54);
    }
    .guide small {
      display: block;
      margin-bottom: 8px;
      color: ${scenario.accent};
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }
    .guide h3 {
      margin: 0 0 10px;
      font-size: 24px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .guide ul {
      margin: 0;
      padding-left: 18px;
      color: #cbd6e5;
      font-size: 13px;
      line-height: 1.45;
    }
    .guide li {
      margin-bottom: 5px;
    }
    .cursor {
      position: absolute;
      right: 170px;
      bottom: 112px;
      z-index: 21;
      color: #fff;
      filter: drop-shadow(0 5px 14px rgba(0,0,0,0.7));
      font-size: 26px;
      transform: rotate(-18deg);
      animation: cursorFloat 3.2s ease-in-out infinite;
    }
    @keyframes cursorFloat {
      0%, 100% { transform: translate(0,0) rotate(-18deg); }
      50% { transform: translate(-30px,-18px) rotate(-18deg); }
    }
  </style>
</head>
<body>
  <div class="stage">
    <div class="app-frame">
      <aside class="rail">
        <div class="brand"><span class="brand-mark"><i class="fas fa-shield-halved"></i></span><span>OHSMS<br>Enterprise</span></div>
        <div class="nav-item active"><i class="fas fa-play"></i> Tutorial</div>
        <div class="nav-item"><i class="fas fa-gauge-high"></i> Dashboard</div>
        <div class="nav-item"><i class="fas fa-triangle-exclamation"></i> Incidents</div>
        <div class="nav-item"><i class="fas fa-magnifying-glass-chart"></i> Audit and CAPA</div>
        <div class="nav-item"><i class="fas fa-database"></i> Setup</div>
        <div class="nav-item"><i class="fas fa-users"></i> Users</div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <small>${escapeHtml(scenario.category)}</small>
            <h1>${escapeHtml(scenario.title)}</h1>
          </div>
          <div class="route-tag"><i class="fas fa-route"></i> ${escapeHtml(scenario.routeTag)}</div>
        </header>
        <section class="content">
          <div class="panel-title">
            <div>
              <h2>${escapeHtml(panel.title || segment.heading)}</h2>
              <p>${escapeHtml(panel.subtitle || segment.subheading)}</p>
            </div>
            <span class="step-pill">Step ${index + 1} of ${scenario.segments.length}</span>
          </div>
          ${renderPanel(panel, scenario.accent)}
        </section>
      </main>
    </div>
    <div class="guide">
      <small>${escapeHtml(segment.guideTitle)}</small>
      <h3>${escapeHtml(segment.heading)}</h3>
      <ul>${guideBullets}</ul>
    </div>
    <div class="cursor"><i class="fas fa-arrow-pointer"></i></div>
  </div>
</body>
</html>`;
};

const synthesizeSegment = async (segment, mp3Path, wavPath) => {
  try {
    await withTimeout(
      synthesizeNeuralSpeechToMp3(segment.narration, mp3Path, { voice, rate: voiceRate }),
      180000,
      `Neural narration for ${segment.key}`
    );
    await transcodeAudioToWav(mp3Path, wavPath);
    return wavPath;
  } catch (error) {
    console.warn(`${error.message}\nFalling back to local Windows speech for ${segment.key}.`);
    await withTimeout(
      synthesizeSpeechToWave(segment.narration, wavPath, { rate: -1 }),
      120000,
      `Fallback narration for ${segment.key}`
    );
    return wavPath;
  }
};

const extractThumbnail = async (mp4Path, outputPath) => {
  ensureDir(path.dirname(outputPath));
  await runFfmpeg([
    '-y',
    '-ss', '00:00:05',
    '-i', mp4Path,
    '-frames:v', '1',
    '-q:v', '3',
    outputPath
  ]);
};

const copyOutputs = async (mp4Output, scenario) => {
  for (const target of scenario.publicTargets || []) {
    ensureDir(path.dirname(target));
    fs.copyFileSync(mp4Output, target);
    console.log(`Copied public video: ${target}`);
  }

  if (scenario.thumbnailTarget) {
    await extractThumbnail(mp4Output, scenario.thumbnailTarget);
    console.log(`Created thumbnail: ${scenario.thumbnailTarget}`);
  }
};

const recordScenario = async (scenario) => {
  const outputRoot = ensureDir(path.join(videoRoot, scenario.outputSubdir));
  const rawDir = path.join(rawRoot, scenario.scenarioId);
  const audioDir = ensureDir(path.join(outputRoot, 'audio'));
  const segmentAudioDir = path.join(audioDir, `${scenario.scenarioId}-segments`);
  const mp4Output = path.join(outputRoot, `${scenario.scenarioId}.mp4`);
  const combinedAudioOutput = path.join(audioDir, `${scenario.scenarioId}.wav`);

  resetDirectory(rawDir);
  resetDirectory(segmentAudioDir);
  fs.rmSync(mp4Output, { force: true });
  fs.rmSync(combinedAudioOutput, { force: true });

  console.log(`\n[${scenario.key}] Synthesizing ${scenario.segments.length} narration segments...`);
  for (let index = 0; index < scenario.segments.length; index += 1) {
    const segment = scenario.segments[index];
    const prefix = `${String(index + 1).padStart(2, '0')}-${segment.key}`;
    segment.rawAudioPath = path.join(segmentAudioDir, `${prefix}.mp3`);
    segment.rawAudioWavPath = path.join(segmentAudioDir, `${prefix}.wav`);
    await synthesizeSegment(segment, segment.rawAudioPath, segment.rawAudioWavPath);
    segment.audioDurationMs = Math.ceil((await getMediaDurationSeconds(segment.rawAudioWavPath)) * 1000);
    segment.tailMs = Number(segment.tailMs || 850);
    console.log(`  ${prefix}: ${(segment.audioDurationMs / 1000).toFixed(1)}s`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    recordVideo: { dir: rawDir, size: viewport }
  });

  const page = await context.newPage();
  const recordingStart = Date.now();
  console.log(`[${scenario.key}] Recording browser video...`);

  for (let index = 0; index < scenario.segments.length; index += 1) {
    const segment = scenario.segments[index];
    await page.setContent(renderSceneHtml(scenario, segment, index), { waitUntil: 'domcontentloaded' });
    await page.mouse.move(980 - (index * 35), 560 - (index * 18), { steps: 12 }).catch(() => {});
    await page.mouse.wheel(0, index % 2 === 0 ? 80 : -40).catch(() => {});
    await page.waitForTimeout(180);
    segment.audioStartMs = Date.now() - recordingStart;
    await page.waitForTimeout(segment.audioDurationMs + segment.tailMs);
  }

  const finalDurationMs = Math.ceil(Math.max(
    ...scenario.segments.map((segment) => segment.audioStartMs + segment.audioDurationMs + segment.tailMs + 240)
  ));

  await withTimeout(context.close(), 300000, `Close context for ${scenario.key}`);
  await browser.close();

  const rawVideo = await findLongestPlayableVideo(rawDir);
  if (!rawVideo) {
    throw new Error(`No raw video found in ${rawDir}`);
  }

  console.log(`[${scenario.key}] Building synchronized audio...`);
  const delayedPaths = [];
  for (let index = 0; index < scenario.segments.length; index += 1) {
    const segment = scenario.segments[index];
    const delayedPath = path.join(
      segmentAudioDir,
      `${String(index + 1).padStart(2, '0')}-${segment.key}-delayed.wav`
    );
    await renderDelayedAudio(segment.rawAudioWavPath, delayedPath, segment.audioStartMs, finalDurationMs);
    delayedPaths.push(delayedPath);
  }
  await mixAudioFiles(delayedPaths, combinedAudioOutput, finalDurationMs);

  console.log(`[${scenario.key}] Encoding MP4...`);
  await withTimeout(
    transcodeToMp4WithAudio(rawVideo, combinedAudioOutput, mp4Output, {
      durationSeconds: Math.ceil(finalDurationMs / 1000),
      stopPadSeconds: 1
    }),
    300000,
    `Final MP4 render for ${scenario.key}`
  );

  await copyOutputs(mp4Output, scenario);
  console.log(`[${scenario.key}] Created ${mp4Output}`);
};

const selectedScenarios = scenarios.filter((scenario) => requestedKey === 'all' || scenario.key === requestedKey);

if (selectedScenarios.length === 0) {
  throw new Error(`Unknown tutorial key "${requestedKey}". Use one of: all, ${scenarios.map((s) => s.key).join(', ')}`);
}

for (const scenario of selectedScenarios) {
  await recordScenario(scenario);
}

console.log('\nRequested tutorial videos completed.');
