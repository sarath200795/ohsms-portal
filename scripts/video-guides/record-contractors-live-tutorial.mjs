import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { rawRoot, videoRoot } from './helpers.mjs';
import {
  ensureDir,
  findLongestPlayableVideo,
  gentleScan,
  getMediaDurationSeconds,
  loginMainApp,
  mixAudioFiles,
  navigateFromDashboard,
  quickFill,
  readSessionObject,
  readSessionStorage,
  renderDelayedAudio,
  requireFirebaseApiKey,
  resetDirectory,
  restDeletePath,
  restGetJson,
  showGuideOverlay,
  signInForDatabaseToken,
  sleep,
  synthesizeNeuralSpeechToMp3,
  transcodeAudioToWav,
  transcodeToMp4WithAudio,
  withTimeout
} from './deep-dive-utils.mjs';

const baseUrl = process.env.VIDEO_BASE_URL || 'http://127.0.0.1:4173';
const email = process.env.VIDEO_EMAIL || '';
const password = process.env.VIDEO_PASSWORD || '';
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-GuyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-7%';
const apiKey = requireFirebaseApiKey();

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

const scenarioId = 'contractors-module-live-tutorial';
const outputRoot = ensureDir(path.join(videoRoot, 'module-deep-dives'));
const rawDir = path.join(rawRoot, scenarioId);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir = path.join(audioDir, `${scenarioId}-segments`);
const mp4Output = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}.wav`);
const viewport = { width: 1280, height: 720 };

const stamp = Date.now();
const demoCompany = `Video Tutorial Vendor ${stamp}`;
const demoEmail = `tutorialvendor${stamp}@mail.com`;
const demoWorker = `Video Worker Demo ${stamp}`;

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });

const databaseUrl = 'https://ohsms-3894f-default-rtdb.firebaseio.com';

const findContractorByName = async (authToken, orgId, companyName) => {
  const data = await restGetJson({
    databaseUrl,
    resourcePath: `organizations/${orgId}/contractors`,
    authToken
  });

  const match = Object.entries(data || {}).find(([, value]) => value?.companyName === companyName);
  if (!match) {
    throw new Error(`Unable to find contractor "${companyName}"`);
  }

  const [firebaseKey, value] = match;
  return { firebaseKey, ...value };
};

const modalCloseButton = (page) => page.locator('xpath=(//i[contains(@class,"fa-times")]/ancestor::button)[1]');

const buildSegments = (state) => ([
  {
    key: 'register-home',
    moduleTitle: 'Contractors Module',
    stepTitle: 'Vendor registration workspace',
    bullets: [
      'Open the contractor safety module',
      'Start from the vendor registration builder',
      'Review legal requirement auto-mapping by service type'
    ],
    narration: 'We begin in the Contractors module on the vendor registration screen. This is where a new contractor company is onboarded, assigned to sites, and automatically mapped to the document requirements that match its service type.',
    tailMs: 720,
    setup: async (page) => {
      await navigateFromDashboard(page, {
        baseUrl,
        moduleLabel: 'Contractor Safety',
        site: 'HQ-01',
        waitForUrlPattern: '**/contractors**'
      });
      await gentleScan(page, viewport, 0, 180);
    }
  },
  {
    key: 'register-company',
    moduleTitle: 'Vendor Registration',
    stepTitle: 'Create the contractor company profile',
    bullets: [
      'Enter company name and authorized site',
      'Set contact details and portal email',
      'Register the company into the master data register'
    ],
    narration: 'Now we register a contractor company live. The administrator records the company name, authorized site allocation, contact details, and the vendor portal email that will later be used for contractor access.',
    tailMs: 820,
    setup: async (page) => {
      await quickFill(page.locator('input[placeholder*="Acme Construction"]').first(), demoCompany);
      await page.getByText('Headquarters').click();
      await page.locator('select').first().selectOption('General / Housekeeping');
      await quickFill(page.locator('input[placeholder="Manager / Supervisor Name"]').first(), 'Tutorial Contact');
      await quickFill(page.locator('input[placeholder="+91..."]').first(), '9999999999');
      await quickFill(page.locator('input[placeholder="vendor@company.com"]').first(), demoEmail);
      await gentleScan(page, viewport, 1, 120);
      await page.getByRole('button', { name: /register company/i }).click();
      await page.waitForTimeout(2400);
      state.contractor = await findContractorByName(state.authToken, state.orgId, demoCompany);
    }
  },
  {
    key: 'company-profile',
    moduleTitle: 'Company Profiles',
    stepTitle: 'Review the contractor company profile',
    bullets: [
      'Open the saved company profile',
      'Review vendor code, portal email, and compliance panels',
      'Show company documents, worker roster, permits, and incidents'
    ],
    narration: 'Once the company is registered, it becomes available in Company Profiles. The profile shows the vendor code, portal status, compliance score, company documents, worker roster, linked permits, and contractor incident history.',
    tailMs: 820,
    setup: async (page) => {
      const row = page.locator('tr', { hasText: demoCompany }).first();
      await row.scrollIntoViewIfNeeded();
      await row.getByRole('button', { name: /view profile/i }).click();
      await page.waitForTimeout(1100);
      await gentleScan(page, viewport, 2, 150);
    }
  },
  {
    key: 'worker-registration',
    moduleTitle: 'Worker Profiles',
    stepTitle: 'Register a contractor worker',
    bullets: [
      'Move to the worker profiles workspace',
      'Register a worker against the new company',
      'Assign the worker to the active site deployment'
    ],
    narration: 'The next step is worker registration. Each contractor employee can be added to the roster, given a role and competence profile, and assigned to the site where they will actually work.',
    tailMs: 860,
    setup: async (page) => {
      await modalCloseButton(page).click();
      await page.waitForTimeout(700);
      await page.getByRole('button', { name: /worker profiles/i }).click();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /register worker/i }).click();
      const workerModal = page.locator('xpath=(//div[contains(@class,"fixed") and contains(@class,"inset-0") and contains(@class,"z-[100]")])[last()]');
      await workerModal.waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(850);
      await workerModal.locator('select').first().selectOption({ label: demoCompany });
      await page.waitForTimeout(350);
      await quickFill(workerModal.locator('input[placeholder="Worker Name"]').first(), demoWorker);
      await quickFill(workerModal.locator('input[placeholder*="Electrician"]').first(), 'Forklift Operator');
      await quickFill(workerModal.locator('input[placeholder*="ITI Certified"]').first(), 'Certified Forklift Operator');
      await workerModal.locator('select').nth(1).waitFor({ state: 'visible', timeout: 30000 });
      await workerModal.locator('select').nth(1).selectOption({ value: 'HQ-01' });
      await workerModal.locator('button').filter({ hasText: /^\s*register\s*$/i }).click();
      await page.waitForTimeout(2200);
      await gentleScan(page, viewport, 3, 120);
    }
  },
  {
    key: 'worker-list',
    moduleTitle: 'Worker Profiles',
    stepTitle: 'Review the worker roster and profile access',
    bullets: [
      'Review document status, training count, and injury count',
      'Open the worker profile action path',
      'Use this workspace for contractor personnel records'
    ],
    narration: 'The worker profiles view becomes the personnel registry for contractor labor. Supervisors can monitor medical fit status, competence documents, training counts, and injury history from one table.',
    tailMs: 760,
    setup: async (page) => {
      const row = page.locator('tr', { hasText: demoWorker }).first();
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      await gentleScan(page, viewport, 4, 120);
    }
  },
  {
    key: 'deployments',
    moduleTitle: 'Deployments',
    stepTitle: 'Track where contractor workers are deployed',
    bullets: [
      'Open the deployments dashboard',
      'Show the worker assigned to Headquarters',
      'Use deployments to control workforce location visibility'
    ],
    narration: 'The deployments dashboard shows where contractor workers are currently assigned. This helps the organization confirm who is deployed at each site and which company each deployed worker belongs to.',
    tailMs: 860,
    setup: async (page) => {
      await page.getByRole('button', { name: /deployments/i }).click();
      await page.waitForTimeout(1200);
      const deployedText = page.getByText(demoWorker).first();
      if (await deployedText.count()) {
        await deployedText.scrollIntoViewIfNeeded();
      }
      await gentleScan(page, viewport, 5, 150);
    }
  },
  {
    key: 'summary',
    moduleTitle: 'Contractor Workflow Summary',
    stepTitle: 'System summary',
    bullets: [
      'Vendor company registered with legal requirements',
      'Worker roster and site deployment captured',
      'Company and worker compliance views demonstrated'
    ],
    narration: 'This is the Contractors module end to end. A vendor company is registered, the legal compliance structure is generated automatically, a worker is added to the roster, and the deployment dashboard shows where that contractor labor is now assigned.',
    tailMs: 900,
    setup: async (page) => {
      await gentleScan(page, viewport, 6, 120);
    }
  }
]);

const browser = await chromium.launch({ headless: true });

const recordingContext = await browser.newContext({
  viewport,
  screen: viewport,
  recordVideo: {
    dir: rawDir,
    size: viewport
  }
});

console.log(`Recording ${scenarioId}...`);

const authPage = await recordingContext.newPage();
authPage.on('dialog', async (dialog) => {
  await dialog.accept();
});
await loginMainApp(authPage, { baseUrl, email, password });
const session = await readSessionObject(authPage);
const sessionStorageState = await readSessionStorage(authPage);

if (!session?.orgId) {
  await recordingContext.close();
  await browser.close();
  throw new Error('Unable to determine orgId from the main app session.');
}

const state = {
  authToken: await signInForDatabaseToken({
    apiKey,
    email,
    password
  }),
  orgId: session.orgId,
  contractor: null
};

const segments = buildSegments(state);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  segment.rawAudioPath = path.join(segmentAudioDir, `${String(index + 1).padStart(2, '0')}-${segment.key}.mp3`);
  segment.rawAudioWavPath = path.join(segmentAudioDir, `${String(index + 1).padStart(2, '0')}-${segment.key}.wav`);
  await withTimeout(
    synthesizeNeuralSpeechToMp3(segment.narration, segment.rawAudioPath, { voice, rate: voiceRate }),
    180000,
    `Narration synthesis for ${segment.key}`
  );
  await transcodeAudioToWav(segment.rawAudioPath, segment.rawAudioWavPath);
  segment.audioDurationMs = Math.ceil((await getMediaDurationSeconds(segment.rawAudioWavPath)) * 1000);
}

await authPage.close();

const page = await recordingContext.newPage();
page.on('dialog', async (dialog) => {
  await dialog.accept();
});
await page.addInitScript((stateValue) => {
  Object.entries(stateValue || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      sessionStorage.setItem(key, value);
    }
  });
}, sessionStorageState);

const recordingStart = Date.now();
await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /contractor safety/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  await segment.setup(page);
  await showGuideOverlay(page, {
    moduleTitle: segment.moduleTitle,
    stepTitle: segment.stepTitle,
    bullets: segment.bullets,
    footer: `Step ${index + 1}`,
    kicker: 'CONTRACTOR WALKTHROUGH'
  });
  await page.waitForTimeout(220);
  segment.audioStartMs = Date.now() - recordingStart;
  await sleep(segment.audioDurationMs + segment.tailMs);
}

const finalDurationMs = Math.ceil(Math.max(
  ...segments.map((segment) => segment.audioStartMs + segment.audioDurationMs + segment.tailMs + 240)
));

await withTimeout(recordingContext.close(), 90000, 'Recording context close');

const rawVideo = await findLongestPlayableVideo(rawDir);
if (!rawVideo) {
  await browser.close();
  throw new Error(`No raw video found in ${rawDir}`);
}

const delayedSegmentPaths = [];
for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  const delayedPath = path.join(segmentAudioDir, `${String(index + 1).padStart(2, '0')}-${segment.key}-delayed.wav`);
  await renderDelayedAudio(segment.rawAudioWavPath, delayedPath, segment.audioStartMs, finalDurationMs);
  delayedSegmentPaths.push(delayedPath);
}

await mixAudioFiles(delayedSegmentPaths, combinedAudioOutput, finalDurationMs);

await withTimeout(
  transcodeToMp4WithAudio(rawVideo, combinedAudioOutput, mp4Output, {
    durationSeconds: Math.ceil(finalDurationMs / 1000),
    stopPadSeconds: 1
  }),
  300000,
  'Final mp4 render'
);

if (state.contractor?.firebaseKey) {
  await restDeletePath({
    databaseUrl,
    resourcePath: `organizations/${state.orgId}/contractors/${state.contractor.firebaseKey}`,
    authToken: state.authToken
  });
}

await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
process.exit(0);
