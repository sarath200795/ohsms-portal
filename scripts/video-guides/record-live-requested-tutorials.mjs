import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  ensureDir,
  rawRoot,
  sleep,
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

const baseUrl = process.env.VIDEO_BASE_URL || 'http://127.0.0.1:4173';
const requestedKey = process.argv[2] || process.env.VIDEO_TUTORIAL || 'all';
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-JennyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-4%';
const viewport = { width: 1280, height: 720 };

const publicPath = (...parts) => path.join(process.cwd(), 'public', ...parts);

const DEMO_API_BASE = 'https://video-demo.local/api';
const DEMO_ORG_ID = 'video-demo-org';
const DEMO_SESSION = {
  uid: 'video-demo-owner',
  email: 'tutorial.owner@example.com',
  orgId: DEMO_ORG_ID,
  name: 'Video Demo Owner',
  user: 'Video Demo Owner',
  role: 'Global Owner',
  status: 'Active',
  assignedSite: 'GLOBAL',
  accessibleSites: [],
  accessibleModules: [],
  mustChangePassword: false
};

const FIREBASE_DEMO_CONFIG = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'DEMO_API_KEY_SET_IN_ENV',
  authDomain: 'ohsms-demo.firebaseapp.com',
  databaseURL: 'https://ohsms-demo-default-rtdb.firebaseio.com',
  projectId: 'ohsms-demo',
  storageBucket: 'ohsms-demo.appspot.com',
  messagingSenderId: '871919638023',
  appId: '1:871919638023:web:tutorialdemo'
};

const demoData = {
  organizations: {
    [DEMO_ORG_ID]: {
      sites: {
        hq: { code: 'HQ-01', name: 'Headquarters', region: 'Central' },
        plant: { code: 'PLANT-02', name: 'Manufacturing Plant', region: 'North' }
      },
      users: {
        owner: { name: 'Video Demo Owner', email: 'tutorial.owner@example.com', role: 'Global Owner', status: 'Active', assignedSite: 'GLOBAL' },
        hse: { name: 'HSE Lead', email: 'hse.lead@example.com', role: 'Site Admin', status: 'Active', assignedSite: 'HQ-01' },
        prod: { name: 'Production Head', email: 'production@example.com', role: 'Manager', status: 'Active', assignedSite: 'HQ-01' },
        maint: { name: 'Maintenance Lead', email: 'maintenance@example.com', role: 'Manager', status: 'Active', assignedSite: 'HQ-01' },
        wh: { name: 'Warehouse Lead', email: 'warehouse@example.com', role: 'Supervisor', status: 'Active', assignedSite: 'PLANT-02' }
      },
      auditPlans: {
        plan1: {
          docId: 'VID-HQ-01-IAP-2026-001',
          siteId: 'HQ-01',
          standard: 'ISO 45001:2018',
          leadAuditor: 'HSE Lead',
          team: ['Video Demo Owner', 'Operations HSE'],
          startDate: '2026-06-01',
          endDate: '2026-06-03',
          status: 'Planned',
          scope: 'OH&S Management System',
          matrix: [
            {
              auditor: 'Video Demo Owner',
              auditee: 'Production Head',
              dept: 'Operations',
              area: 'Machine Guarding',
              aspect: 'Operational control and daily verification',
              date: '2026-06-01',
              time: '09:00'
            },
            {
              auditor: 'HSE Lead',
              auditee: 'Warehouse Lead',
              dept: 'Logistics',
              area: 'Emergency Readiness',
              aspect: 'Spill response and evacuation controls',
              date: '2026-06-02',
              time: '11:00'
            }
          ]
        }
      },
      auditFindings: {
        finding1: {
          docId: 'VID-HQ-01-IAF-2026-001',
          auditor: 'Video Demo Owner',
          siteId: 'HQ-01',
          status: 'Submitted for Verification',
          auditDate: '2026-06-02T08:30:00.000Z',
          taskDetails: {
            planId: 'VID-HQ-01-IAP-2026-001',
            auditor: 'Video Demo Owner',
            auditee: 'Production Head',
            dept: 'Operations',
            area: 'Machine Guarding',
            date: '2026-06-01',
            time: '09:00',
            siteId: 'HQ-01',
            standard: 'ISO 45001:2018',
            criteria: 'ISO 45001 clause 8.1',
            scope: 'OH&S operational controls'
          },
          findings: [
            {
              id: 'AF-10001',
              type: 'Minor NC',
              clause: '8.1.2',
              desc: 'Machine guard inspection checklist was not completed for Line 2 during the previous shift.',
              auditeeDueDate: '2026-06-15',
              response: {
                rootCause: 'Supervisor verification was not included in the shift handover checklist.',
                correction: 'Line 2 checklist was completed and the missing guard inspection was reverified.',
                capa: 'Update the daily shift handover checklist and retrain line leads on machine guarding verification.',
                owner: 'Maintenance Lead',
                targetDate: '2026-06-20',
                status: 'Completed',
                capaStatus: 'Open',
                evidenceFileName: 'line-2-guard-check.pdf'
              }
            },
            {
              id: 'AF-10002',
              type: 'OFI',
              clause: '9.1',
              desc: 'Monthly trend review can be improved by adding CAPA closure time as a leading indicator.',
              auditeeDueDate: '2026-06-22',
              response: {
                rootCause: 'CAPA ageing was tracked in meetings but not shown in the monthly dashboard.',
                correction: 'Dashboard metric added for overdue and ageing CAPA.',
                capa: 'Add CAPA ageing to monthly management review pack.',
                owner: 'HSE Lead',
                targetDate: '2026-06-25',
                status: 'Completed',
                capaStatus: 'In Progress'
              }
            }
          ]
        },
        finding2: {
          docId: 'VID-PLANT-IAF-2026-002',
          auditor: 'HSE Lead',
          siteId: 'PLANT-02',
          status: 'Closed',
          auditDate: '2026-05-12T08:30:00.000Z',
          closureDate: '2026-05-20T11:00:00.000Z',
          taskDetails: {
            planId: 'VID-PLANT-IAP-2026-002',
            auditor: 'HSE Lead',
            auditee: 'Warehouse Lead',
            dept: 'Logistics',
            area: 'Chemical Store',
            date: '2026-05-12',
            time: '10:00',
            siteId: 'PLANT-02',
            standard: 'ISO 45001:2018',
            criteria: 'ISO 45001 clause 8.2',
            scope: 'Emergency preparedness'
          },
          findings: [
            {
              id: 'AF-20001',
              type: 'Observation',
              clause: '8.2',
              desc: 'Spill kit inspection labels were available and current.',
              response: {
                rootCause: 'N/A',
                correction: 'N/A',
                capa: 'Maintain monthly spot-check of spill kit labels.',
                owner: 'Warehouse Lead',
                targetDate: '2026-05-18',
                status: 'Completed',
                capaStatus: 'Closed',
                closureComment: 'Verified during follow-up walkdown.'
              }
            }
          ]
        }
      },
      incidents: {
        inc1: {
          id: 'INC-2026-004',
          docId: 'INC-2026-004',
          siteId: 'HQ-01',
          title: 'Forklift near miss',
          capa: [
            {
              act: 'Refresh pedestrian separation briefing for warehouse operators.',
              own: 'Warehouse Lead',
              due: '2026-05-22',
              status: 'In Progress'
            }
          ]
        }
      },
      mockDrills: {
        drill1: {
          docId: 'DRILL-2026-002',
          siteId: 'HQ-01',
          capa: [
            {
              action: 'Replace faded emergency assembly point signage.',
              owner: 'HSE Lead',
              due: '2026-06-08',
              status: 'Open'
            }
          ]
        }
      },
      consultations: {
        meeting1: {
          id: 'MEET-2026-006',
          siteId: 'HQ-01',
          actions: [
            {
              item: 'Close employee suggestion on machine guarding poster refresh.',
              owner: 'Production Head',
              deadline: '2026-06-12',
              status: 'Open'
            }
          ]
        }
      },
      improvements: {
        imp1: {
          id: 'IMP-2026-003',
          title: 'Digital permit board rollout',
          createdBy: 'HSE Lead',
          siteId: 'HQ-01',
          date: '2026-06-18',
          status: 'Approved',
          actions: [
            {
              action: 'Pilot digital permit board in maintenance workshop.',
              owner: 'Maintenance Lead',
              due: '2026-06-18',
              status: 'Open'
            }
          ]
        }
      },
      inspectionRecords: {
        insp1: {
          id: 'INS-2026-011',
          templateName: 'Forklift pre-use inspection',
          siteId: 'HQ-01',
          findings: [
            {
              question: 'Horn functional',
              response: 'No',
              capa: {
                desc: 'Repair horn on FLT-03 before next shift.',
                own: 'Maintenance Lead',
                due: '2026-05-21',
                status: 'Open'
              }
            }
          ]
        }
      }
    }
  }
};

const getDemoDataAtPath = (rawPath) => {
  const cleanPath = String(rawPath || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^api\//, '');
  if (!cleanPath) return null;
  if (cleanPath === 'health') return { ok: true, service: 'video-demo-api' };
  return cleanPath.split('/').reduce((node, part) => {
    if (node === undefined || node === null) return null;
    return node[decodeURIComponent(part)] ?? null;
  }, demoData);
};

const routeDemoApi = async (context) => {
  await context.route(`${DEMO_API_BASE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rawPath = url.pathname.replace(/^\/api\/?/, '');
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type,accept',
      'cache-control': 'no-store'
    };

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }

    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ id: `demo-${Date.now()}` })
      });
      return;
    }

    if (['PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(getDemoDataAtPath(rawPath))
    });
  });
};

const waitForBaseUrl = async () => {
  const deadline = Date.now() + 30000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }
  throw new Error(`The live app is not reachable at ${baseUrl}. Start it with "npm run preview -- --host 127.0.0.1 --port 4173". Last error: ${lastError?.message || 'unknown'}`);
};

const configureDemoSession = async (context) => {
  await context.addInitScript(({ session, apiBase }) => {
    localStorage.setItem('ohsms_db_adapter', 'rest');
    localStorage.setItem('ohsms_rest_base_url', apiBase);
    localStorage.setItem('ohsms_rest_sse', 'false');
    localStorage.setItem('ohsms_rest_poll_ms', '999999');
    localStorage.setItem('ohsms:tutorial-seen:audit-capa', '1');
    sessionStorage.setItem('isoSession', JSON.stringify(session));
    sessionStorage.setItem('fieldPortalSession', JSON.stringify(session));
    sessionStorage.setItem('isoCurrentSite', 'GLOBAL');
  }, { session: DEMO_SESSION, apiBase: DEMO_API_BASE });
};

const configureSetupState = async (page, { step = null, adapter = 'firebase' } = {}) => {
  await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ stepValue, adapterValue, firebaseConfig, apiBase }) => {
    if (adapterValue === 'firebase') {
      localStorage.setItem('ohsms_db_adapter', 'firebase');
      localStorage.setItem('ohsms_firebase_config', JSON.stringify(firebaseConfig));
      localStorage.setItem('ohsms_setup_complete', 'true');
    } else if (adapterValue === 'rest') {
      localStorage.setItem('ohsms_db_adapter', 'rest');
      localStorage.setItem('ohsms_rest_base_url', apiBase);
      localStorage.setItem('ohsms_rest_sse', 'false');
      localStorage.setItem('ohsms_rest_poll_ms', '5000');
      localStorage.setItem('ohsms_setup_complete', 'true');
    }
    if (stepValue !== null) {
      sessionStorage.setItem('ohsms_setup_step', String(stepValue));
    }
  }, { stepValue: step, adapterValue: adapter, firebaseConfig: FIREBASE_DEMO_CONFIG, apiBase: DEMO_API_BASE });

  if (step !== null) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(1000);
};

const clearVideoOverlay = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-live-guide')?.remove();
    document.getElementById('codex-live-highlight')?.remove();
  }).catch(() => {});
};

const showGuideOverlay = async (page, { eyebrow, title, bullets = [], accent = '#22d3ee' }) => {
  await page.evaluate(({ eyebrowText, titleText, items, accentColor }) => {
    document.getElementById('codex-live-guide')?.remove();
    const panel = document.createElement('aside');
    panel.id = 'codex-live-guide';
    panel.innerHTML = `
      <style>
        #codex-live-guide {
          position: fixed;
          right: 22px;
          bottom: 22px;
          width: 365px;
          z-index: 2147483647;
          color: #e5eefb;
          background: rgba(3, 7, 18, 0.88);
          border: 1px solid rgba(148, 163, 184, 0.32);
          border-left: 4px solid ${accentColor};
          border-radius: 12px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.45);
          padding: 18px 20px;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: none;
          backdrop-filter: blur(14px);
        }
        #codex-live-guide .eyebrow {
          color: ${accentColor};
          font-size: 10px;
          line-height: 1;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 900;
          margin-bottom: 9px;
        }
        #codex-live-guide h2 {
          margin: 0 0 10px;
          font-size: 22px;
          line-height: 1.12;
          letter-spacing: 0;
          color: #fff;
        }
        #codex-live-guide ul {
          margin: 0;
          padding-left: 18px;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.45;
        }
        #codex-live-guide li { margin-bottom: 5px; }
      </style>
      <div class="eyebrow"></div>
      <h2></h2>
      <ul></ul>
    `;
    panel.querySelector('.eyebrow').textContent = eyebrowText;
    panel.querySelector('h2').textContent = titleText;
    const list = panel.querySelector('ul');
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    document.body.appendChild(panel);
  }, { eyebrowText: eyebrow, titleText: title, items: bullets, accentColor: accent });
};

const highlightText = async (page, text) => {
  await page.evaluate((targetText) => {
    document.getElementById('codex-live-highlight')?.remove();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let target = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!(node instanceof HTMLElement)) continue;
      if (!node.offsetParent && getComputedStyle(node).position !== 'fixed') continue;
      const ownText = Array.from(node.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' ')
        .trim();
      if (ownText.includes(targetText)) {
        target = node;
        break;
      }
    }
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const box = document.createElement('div');
    box.id = 'codex-live-highlight';
    box.style.position = 'fixed';
    box.style.left = `${Math.max(rect.left - 8, 8)}px`;
    box.style.top = `${Math.max(rect.top - 8, 8)}px`;
    box.style.width = `${rect.width + 16}px`;
    box.style.height = `${rect.height + 16}px`;
    box.style.border = '3px solid rgba(34, 211, 238, 0.9)';
    box.style.borderRadius = '14px';
    box.style.boxShadow = '0 0 0 9999px rgba(2, 6, 23, 0.08), 0 0 28px rgba(34, 211, 238, 0.55)';
    box.style.zIndex = '2147483646';
    box.style.pointerEvents = 'none';
    document.body.appendChild(box);
  }, text).catch(() => {});
};

const gotoSetupHome = async (page) => {
  await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
};

const selectFirebase = async (page) => {
  await gotoSetupHome(page);
  await page.getByText('Select Firebase', { exact: false }).click();
  await page.waitForTimeout(900);
};

const selectOwnDatabase = async (page) => {
  await gotoSetupHome(page);
  await page.getByText('Select Own Database', { exact: false }).click();
  await page.waitForTimeout(900);
};

const fillFirebaseConfig = async (page) => {
  const values = [
    FIREBASE_DEMO_CONFIG.apiKey,
    FIREBASE_DEMO_CONFIG.authDomain,
    FIREBASE_DEMO_CONFIG.databaseURL,
    FIREBASE_DEMO_CONFIG.projectId,
    FIREBASE_DEMO_CONFIG.storageBucket,
    FIREBASE_DEMO_CONFIG.messagingSenderId,
    FIREBASE_DEMO_CONFIG.appId
  ];
  const inputs = page.locator('input[type="text"]');
  for (let index = 0; index < values.length; index += 1) {
    const input = inputs.nth(index);
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.fill(values[index]);
    await page.waitForTimeout(index < 2 ? 140 : 45);
  }
};

const gentleScan = async (page, amount = 260) => {
  await page.mouse.move(980, 520, { steps: 14 }).catch(() => {});
  await page.mouse.wheel(0, amount).catch(() => {});
  await page.waitForTimeout(450);
};

const dismissTutorialPrompt = async (page) => {
  const continueButton = page.getByRole('button', { name: 'Continue to Module' });
  if (await continueButton.count().catch(() => 0)) {
    await continueButton.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
};

const gotoLiveRoute = async (page, routePath) => {
  await page.goto(new URL(routePath, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await dismissTutorialPrompt(page);
};

const clickLiveText = async (page, text, waitMs = 1200) => {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 15000 });
  await page.waitForTimeout(waitMs);
};

const scenarios = [
  {
    key: 'organization-onboarding',
    scenarioId: 'organization-onboarding-tutorial',
    outputSubdir: 'getting-started',
    accent: '#fb923c',
    publicTargets: [
      publicPath('tutorial-videos', 'getting-started', 'organization-onboarding-tutorial.mp4'),
      publicPath('tutorials', 'onboarding.mp4')
    ],
    thumbnailTarget: publicPath('thumbnails', 'onboarding.jpg'),
    prepareContext: routeDemoApi,
    segments: [
      {
        key: 'setup-start',
        narration: 'This live walkthrough starts in the OHSMS setup wizard. A new organization begins by choosing where the workspace data will be stored before any users or module records are created.',
        tailMs: 700,
        setup: async (page) => {
          await gotoSetupHome(page);
          await showGuideOverlay(page, {
            eyebrow: 'Live app - /setup',
            title: 'Start the onboarding wizard',
            accent: '#fb923c',
            bullets: ['Choose the database first', 'Brand the workspace', 'Create the first Global Owner account']
          });
          await highlightText(page, 'Set Up Your Workspace');
        }
      },
      {
        key: 'choose-database',
        narration: 'Select a database option. Firebase is the quickest path for most teams because the app can use Firebase Authentication and Realtime Database without a separate backend server.',
        tailMs: 650,
        setup: async (page) => {
          await gotoSetupHome(page);
          await highlightText(page, 'Firebase');
          await page.waitForTimeout(500);
          await page.getByText('Select Firebase', { exact: false }).click();
          await page.waitForTimeout(800);
          await showGuideOverlay(page, {
            eyebrow: 'Step 1',
            title: 'Choose Firebase or own database',
            accent: '#fb923c',
            bullets: ['Firebase: fast managed setup', 'Own Database: REST API for full data control', 'The next screen captures the connection details']
          });
        }
      },
      {
        key: 'configure',
        narration: 'On the configuration step, enter the Firebase web app values from your Firebase project. These values identify the project. Security is enforced through Authentication and Realtime Database rules.',
        tailMs: 800,
        setup: async (page) => {
          await selectFirebase(page);
          await fillFirebaseConfig(page);
          await showGuideOverlay(page, {
            eyebrow: 'Step 2',
            title: 'Configure the database',
            accent: '#fb923c',
            bullets: ['Paste the Firebase web app config', 'Review the setup and rules tabs', 'Save only after the real connection test succeeds']
          });
          await gentleScan(page, 180);
        }
      },
      {
        key: 'logo',
        narration: 'After the database is saved, the wizard moves to branding. Uploading a logo is optional, but it helps users recognize the workspace across dashboards, reports, and exported records.',
        tailMs: 650,
        setup: async (page) => {
          await configureSetupState(page, { step: 2, adapter: 'firebase' });
          await showGuideOverlay(page, {
            eyebrow: 'Step 3',
            title: 'Add the organization logo',
            accent: '#fb923c',
            bullets: ['Upload a small image file', 'The app compresses it for storage', 'You can skip and update it later']
          });
          await highlightText(page, 'Upload Your Logo');
        }
      },
      {
        key: 'create-org',
        narration: 'The final onboarding step creates the organization profile and first administrator. The person entered here becomes the Global Owner and can invite users, approve accounts, assign roles, and grant module access.',
        tailMs: 1000,
        setup: async (page) => {
          await configureSetupState(page, { step: 3, adapter: 'firebase' });
          await page.getByPlaceholder('e.g. Acme Mining Ltd').fill('Acme Safety Solutions');
          await page.getByPlaceholder('e.g. Sarah Johnson').fill('Sarah Johnson');
          await page.getByPlaceholder('admin@company.com').fill('admin@acme-safety.example');
          await page.getByPlaceholder('At least 6 characters').fill('DemoPass123');
          await showGuideOverlay(page, {
            eyebrow: 'Step 4',
            title: 'Create the organization',
            accent: '#fb923c',
            bullets: ['Organization name becomes the workspace identity', 'First user becomes Global Owner', 'Invite and approve the team after launch']
          });
        }
      }
    ]
  },
  {
    key: 'database-connection',
    scenarioId: 'database-connection-tutorial',
    outputSubdir: 'getting-started',
    accent: '#22d3ee',
    publicTargets: [
      publicPath('tutorial-videos', 'getting-started', 'database-connection-tutorial.mp4'),
      publicPath('tutorials', 'firebase-setup.mp4')
    ],
    thumbnailTarget: publicPath('thumbnails', 'firebase-setup.jpg'),
    prepareContext: routeDemoApi,
    segments: [
      {
        key: 'database-choice',
        narration: 'This live database tutorial shows both connection paths available in the setup wizard. Use Firebase for a managed no-server setup, or connect your own backend through the REST adapter.',
        tailMs: 700,
        setup: async (page) => {
          await gotoSetupHome(page);
          await showGuideOverlay(page, {
            eyebrow: 'Live app - database setup',
            title: 'Pick the storage adapter',
            accent: '#22d3ee',
            bullets: ['Firebase for fast launch', 'REST API for owned infrastructure', 'Both paths are configured from the same setup screen']
          });
          await highlightText(page, 'Your Own Database');
        }
      },
      {
        key: 'firebase-guide',
        narration: 'For Firebase, the left side of the page gives the exact setup sequence: create a project, enable Realtime Database, enable Email and Password authentication, and copy the web app config.',
        tailMs: 650,
        setup: async (page) => {
          await selectFirebase(page);
          await showGuideOverlay(page, {
            eyebrow: 'Firebase',
            title: 'Follow the setup guide',
            accent: '#fb923c',
            bullets: ['Create Firebase project', 'Enable Realtime Database', 'Enable Email and Password sign-in']
          });
          await highlightText(page, 'Setup Guide');
        }
      },
      {
        key: 'firebase-rules',
        narration: 'The Security Rules tab shows the rules that protect organization data. Publish these rules before live use so users only read and write records inside their own organization context.',
        tailMs: 750,
        setup: async (page) => {
          await selectFirebase(page);
          await page.getByRole('button', { name: 'Security Rules' }).click();
          await page.waitForTimeout(500);
          await showGuideOverlay(page, {
            eyebrow: 'Firebase security',
            title: 'Publish database rules',
            accent: '#fb923c',
            bullets: ['Org data stays org-scoped', 'User directory links users to the org', 'Rules matter more than hiding API keys']
          });
          await gentleScan(page, 280);
        }
      },
      {
        key: 'firebase-config',
        narration: 'Enter the Firebase configuration on the right side. In production, environment variables can override the browser-stored values, which is useful for Vercel or Netlify deployments.',
        tailMs: 750,
        setup: async (page) => {
          await selectFirebase(page);
          await fillFirebaseConfig(page);
          await page.getByRole('button', { name: 'Env Variables' }).click();
          await page.waitForTimeout(500);
          await showGuideOverlay(page, {
            eyebrow: 'Firebase config',
            title: 'Use fields or environment variables',
            accent: '#fb923c',
            bullets: ['Required: API key, auth domain, project ID, app ID', 'Database URL connects Realtime Database', 'Env vars override saved form values']
          });
        }
      },
      {
        key: 'rest-contract',
        narration: 'For organizations that need their own database, select Your Own Database. The app documents the REST contract it expects for reading, writing, querying, authentication, and health checks.',
        tailMs: 700,
        setup: async (page) => {
          await selectOwnDatabase(page);
          await showGuideOverlay(page, {
            eyebrow: 'REST adapter',
            title: 'Review the API contract',
            accent: '#22d3ee',
            bullets: ['GET, POST, PUT, PATCH, DELETE for data paths', 'JWT authentication endpoints', 'CORS must allow the app domain']
          });
          await gentleScan(page, 260);
        }
      },
      {
        key: 'rest-test',
        narration: 'Enter the backend base URL and test the connection. A successful health check confirms that the app can reach the API before the configuration is saved and the organization setup continues.',
        tailMs: 1000,
        setup: async (page) => {
          await selectOwnDatabase(page);
          await page.getByPlaceholder('https://your-api.example.com').fill(DEMO_API_BASE);
          await page.getByRole('button', { name: /Test Connection/i }).click();
          await page.waitForTimeout(900);
          await showGuideOverlay(page, {
            eyebrow: 'Connection test',
            title: 'Verify the backend before saving',
            accent: '#22d3ee',
            bullets: ['Health endpoint responds', 'CORS allows the browser call', 'Save and continue only after the real backend passes']
          });
          await highlightText(page, 'Server responded');
        }
      }
    ]
  },
  {
    key: 'audit-capa',
    scenarioId: 'audit-capa-module-live-tutorial',
    outputSubdir: 'module-deep-dives',
    accent: '#38bdf8',
    publicTargets: [
      publicPath('tutorial-videos', 'module-deep-dives', 'audit-capa-module-live-tutorial.mp4'),
      publicPath('tutorials', 'audit-capa.mp4')
    ],
    thumbnailTarget: publicPath('thumbnails', 'audit-capa.jpg'),
    prepareContext: async (context) => {
      await routeDemoApi(context);
      await configureDemoSession(context);
    },
    segments: [
      {
        key: 'audit-hub',
        narration: 'This live recording opens the Internal Audit hub with demo organization data loaded through the app data adapter. The hub separates planning, audit execution, auditee response, reporting, calendar, and analytics workspaces.',
        tailMs: 650,
        setup: async (page) => {
          await gotoLiveRoute(page, '/audit?site=HQ-01');
          await showGuideOverlay(page, {
            eyebrow: 'Live app - /audit',
            title: 'Internal Audit hub',
            accent: '#38bdf8',
            bullets: ['Scheduler plans audit activity', 'Auditor and auditee workspaces handle findings', 'Reports and dashboard preserve evidence']
          });
          await highlightText(page, 'Internal Audit Hub');
        }
      },
      {
        key: 'scheduler',
        narration: 'Open the Audit Scheduler to build the formal audit plan. Select the target site, standard, lead auditor, team members, dates, and the execution matrix used by auditors in the workplace.',
        tailMs: 700,
        setup: async (page) => {
          await gotoLiveRoute(page, '/audit?site=HQ-01');
          await clickLiveText(page, 'Audit Scheduler');
          await page.locator('select').first().selectOption('HQ-01').catch(() => {});
          await page.locator('select').nth(1).selectOption('HSE Lead').catch(() => {});
          await page.locator('input[type="date"]').first().fill('2026-06-01').catch(() => {});
          await page.locator('input[type="date"]').nth(1).fill('2026-06-03').catch(() => {});
          await showGuideOverlay(page, {
            eyebrow: 'Audit planning',
            title: 'Schedule and assign the audit',
            accent: '#38bdf8',
            bullets: ['Target site and standard', 'Lead auditor and team', 'Execution rows by area, auditee, date, and time']
          });
          await gentleScan(page, 300);
        }
      },
      {
        key: 'auditor-workplace',
        narration: 'The Auditor Workplace converts the schedule into actionable audit tasks. Planned audits can be opened, findings recorded, clauses referenced, and evidence attached before the report is sent to the auditee.',
        tailMs: 800,
        setup: async (page) => {
          await gotoLiveRoute(page, '/audit?site=HQ-01');
          await clickLiveText(page, 'Auditor Workplace');
          await showGuideOverlay(page, {
            eyebrow: 'Audit execution',
            title: 'Review planned and reported audits',
            accent: '#34d399',
            bullets: ['Planned audits show as task cards', 'Reported audits wait for auditee correction', 'Verification items can be closed after evidence review']
          });
          await highlightText(page, 'Perform Audit');
        }
      },
      {
        key: 'finding-response',
        narration: 'Audit findings carry the auditee response beside the auditor evidence. Root cause, correction, CAPA description, owner, target date, and evidence are retained as part of the audit record.',
        tailMs: 750,
        setup: async (page) => {
          await gotoLiveRoute(page, '/audit?site=HQ-01');
          await clickLiveText(page, 'Dashboard');
          await page.waitForTimeout(700);
          await showGuideOverlay(page, {
            eyebrow: 'Audit evidence',
            title: 'Findings link to corrective action',
            accent: '#f59e0b',
            bullets: ['Finding type and clause stay with the record', 'Auditee response captures cause and correction', 'CAPA owner and target date are visible for follow-up']
          });
          await gentleScan(page, 300);
        }
      },
      {
        key: 'capa-manager',
        narration: 'The CAPA Manager then brings corrective actions from audits, incidents, inspections, drills, consultations, and improvements into one register for ownership, due dates, status updates, and closure evidence.',
        tailMs: 800,
        setup: async (page) => {
          await gotoLiveRoute(page, '/capa?site=HQ-01');
          await showGuideOverlay(page, {
            eyebrow: 'Live app - /capa',
            title: 'Global CAPA Manager',
            accent: '#22d3ee',
            bullets: ['One action register across source modules', 'Filter by site, source, and status', 'Close only with comments and evidence']
          });
          await highlightText(page, 'Global CAPA Manager');
        }
      },
      {
        key: 'capa-filter',
        narration: 'Use the filters to focus the register by source or status. Audit-generated actions remain traceable to the original finding, while overdue and open actions stay visible for management review.',
        tailMs: 950,
        setup: async (page) => {
          await gotoLiveRoute(page, '/capa?site=HQ-01');
          await page.locator('select').nth(1).selectOption('Audit').catch(() => {});
          await page.waitForTimeout(500);
          await showGuideOverlay(page, {
            eyebrow: 'CAPA closure control',
            title: 'Filter to audit actions',
            accent: '#22d3ee',
            bullets: ['Audit CAPA stays linked to the finding', 'Owners and due dates are shown in the register', 'Status changes are controlled by role permissions']
          });
          await gentleScan(page, 260);
        }
      }
    ]
  }
];

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
    console.log(`  ${prefix}: ${(segment.audioDurationMs / 1000).toFixed(1)}s`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    recordVideo: { dir: rawDir, size: viewport }
  });

  if (scenario.prepareContext) {
    await scenario.prepareContext(context);
  }

  const page = await context.newPage();
  page.on('dialog', async (dialog) => dialog.accept().catch(() => {}));

  const recordingStart = Date.now();
  console.log(`[${scenario.key}] Recording live app screen from ${baseUrl}...`);
  for (let index = 0; index < scenario.segments.length; index += 1) {
    const segment = scenario.segments[index];
    await clearVideoOverlay(page);
    await segment.setup(page, index);
    await page.waitForTimeout(220);
    segment.audioStartMs = Date.now() - recordingStart;
    await sleep(segment.audioDurationMs + Number(segment.tailMs || 700));
  }

  const finalDurationMs = Math.ceil(Math.max(
    ...scenario.segments.map((segment) => segment.audioStartMs + segment.audioDurationMs + Number(segment.tailMs || 700) + 240)
  ));

  await clearVideoOverlay(page);
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

await waitForBaseUrl();

const selectedScenarios = scenarios.filter((scenario) => requestedKey === 'all' || scenario.key === requestedKey);

if (selectedScenarios.length === 0) {
  throw new Error(`Unknown tutorial key "${requestedKey}". Use one of: all, ${scenarios.map((s) => s.key).join(', ')}`);
}

for (const scenario of selectedScenarios) {
  await recordScenario(scenario);
}

console.log('\nLive requested tutorial videos completed.');
