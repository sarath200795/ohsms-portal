import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { rawRoot, videoRoot } from './helpers.mjs';
import {
  ensureDir,
  findLongestPlayableVideo,
  gentleScan,
  getMediaDurationSeconds,
  hideTitleCard,
  loginMainApp,
  loginVendorPortal,
  mixAudioFiles,
  quickFill,
  readSessionObject,
  renderDelayedAudio,
  resetDirectory,
  restGetJson,
  restPatchJson,
  showGuideOverlay,
  showTitleCard,
  signInForDatabaseToken,
  sleep,
  synthesizeNeuralSpeechToMp3,
  transcodeAudioToWav,
  transcodeToMp4WithAudio,
  withTimeout
} from './deep-dive-utils.mjs';

const baseUrl = process.env.VIDEO_BASE_URL || 'http://127.0.0.1:4173';
const email = process.env.VIDEO_VENDOR_EMAIL || 'vendor1@gmail.com';
const vendorCode = process.env.VIDEO_VENDOR_CODE || 'VEN-U2IR9A';
const adminEmail = process.env.VIDEO_EMAIL || '';
const adminPassword = process.env.VIDEO_PASSWORD || '';
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-GuyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-7%';

if (!adminEmail || !adminPassword) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required for cleanup access.');
}

const scenarioId = 'vendor-portal-live-tutorial';
const outputRoot = ensureDir(path.join(videoRoot, 'module-deep-dives'));
const rawDir = path.join(rawRoot, scenarioId);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir = path.join(audioDir, `${scenarioId}-segments`);
const mp4Output = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}.wav`);
const viewport = { width: 1280, height: 720 };

const stamp = Date.now();
const demoWorker = `Vendor Worker ${stamp}`;

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });

const databaseUrl = 'https://ohsms-3894f-default-rtdb.firebaseio.com';

const findContractorByVendorCode = async (authToken, orgId, targetVendorCode) => {
  const data = await restGetJson({
    databaseUrl,
    resourcePath: `organizations/${orgId}/contractors`,
    authToken
  });

  const match = Object.entries(data || {}).find(([, value]) => value?.vendorCode === targetVendorCode);
  if (!match) {
    throw new Error(`Unable to find contractor for vendor code "${targetVendorCode}"`);
  }

  const [firebaseKey, value] = match;
  return { firebaseKey, ...value };
};

const buildSegments = () => ([
  {
    key: 'login',
    moduleTitle: 'Vendor Portal',
    stepTitle: 'Portal login and home screen',
    bullets: [
      'Sign into the contractor portal with email and vendor code',
      'Land on the vendor home screen',
      'Review the compliance and workforce summary cards'
    ],
    narration: 'We begin in the Vendor Portal. Contractors sign in with their portal email and vendor code, then land on a focused home screen that shows compliance status, workforce count, and the sites where the company is authorized to work.',
    tailMs: 760,
    setup: async (page) => {
      await loginVendorPortal(page, { baseUrl, email, vendorCode });
      await page.waitForTimeout(1800);
      await gentleScan(page, viewport, 0, 160);
    }
  },
  {
    key: 'documentation',
    moduleTitle: 'Vendor Portal',
    stepTitle: 'Company documents and compliance workspace',
    bullets: [
      'Review required company documents',
      'Show upload actions for compliance items',
      'Use the documentation area for ongoing client requirements'
    ],
    narration: 'The documentation workspace shows every required company level document. Contractors can see what is still pending, what has already been uploaded, and what still needs to be kept current for site access and compliance.',
    tailMs: 800,
    setup: async (page) => {
      await gentleScan(page, viewport, 1, 200);
    }
  },
  {
    key: 'add-employee',
    moduleTitle: 'Vendor Portal',
    stepTitle: 'Add an employee to the contractor roster',
    bullets: [
      'Use the roster form inside the portal',
      'Enter worker identity, role, competence, and site',
      'Save the employee to the vendor workforce register'
    ],
    narration: 'Vendors can manage their own workforce directly from the portal. Here we add a worker, capture the employee identifier, role, competence, and deployed site, and save that person into the contractor roster.',
    tailMs: 860,
    setup: async (page) => {
      await quickFill(page.locator('input[placeholder="Worker name"]').first(), demoWorker);
      await quickFill(page.locator('input[placeholder*="Badge /"]').first(), `VW-${String(stamp).slice(-4)}`);
      await quickFill(page.locator('input[placeholder*="Electrician"]').first(), 'Housekeeping Technician');
      await quickFill(page.locator('input[placeholder="Mobile number"]').first(), '9000000000');
      await quickFill(page.locator('input[placeholder*="ITI /"]').first(), 'General Site Safety');
      await page.locator('select').first().selectOption('HQ-01');
      await page.getByRole('button', { name: /add employee/i }).last().click();
      await page.waitForTimeout(2400);
      await gentleScan(page, viewport, 2, 120);
    }
  },
  {
    key: 'roster',
    moduleTitle: 'Vendor Portal',
    stepTitle: 'Review the live employee roster',
    bullets: [
      'Show the newly added worker in the roster',
      'Review induction status and document upload slots',
      'Use the portal to maintain employee readiness'
    ],
    narration: 'Once saved, the worker appears in the roster with induction status, document upload actions, and basic employment details. This allows the contractor to maintain workforce readiness without needing the internal admin team for every update.',
    tailMs: 820,
    setup: async (page) => {
      const workerCard = page.getByText(demoWorker).first();
      await workerCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      await gentleScan(page, viewport, 3, 140);
    }
  },
  {
    key: 'activities',
    moduleTitle: 'Vendor Portal',
    stepTitle: 'Open activities and safety history',
    bullets: [
      'Move to the Activities and Safety tab',
      'Review permit visibility and incident history',
      'Use the portal to track operational exposure by contractor'
    ],
    narration: 'The Activities and Safety tab is where vendors see permits associated with their company and any incidents connected to their assigned workforce. It gives contractors direct visibility into their live and historic safety activity.',
    tailMs: 860,
    setup: async (page) => {
      await page.getByRole('button', { name: /activities & safety/i }).click();
      await page.waitForTimeout(1200);
      await gentleScan(page, viewport, 4, 180);
    }
  },
  {
    key: 'summary',
    moduleTitle: 'Vendor Portal Summary',
    stepTitle: 'System summary',
    bullets: [
      'Vendor login and compliance review shown',
      'Employee roster management demonstrated',
      'Activities and safety visibility demonstrated'
    ],
    narration: 'This is the Vendor Portal workflow. The contractor signs in, reviews company compliance, manages the employee roster, and then uses the portal to monitor permits and safety history related to their organization.',
    tailMs: 900,
    setup: async (page) => {
      await gentleScan(page, viewport, 5, 120);
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
await loginMainApp(authPage, { baseUrl, email: adminEmail, password: adminPassword });
const session = await readSessionObject(authPage);

if (!session?.orgId) {
  await recordingContext.close();
  await browser.close();
  throw new Error('Unable to determine orgId from the main app session.');
}

const state = {
  orgId: session.orgId,
  authToken: await signInForDatabaseToken({
    apiKey: 'AIzaSyBHqeQN4s9PA5UUDfLtAajVkoRK2BrRjwk',
    email: adminEmail,
    password: adminPassword
  })
};

const segments = buildSegments();

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

const recordingStart = Date.now();
await page.goto(new URL('/vendor-portal', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
await page.getByText(/Contractor Portal/i).waitFor({ timeout: 30000 });
await showTitleCard(page, {
  title: 'Vendor Portal Tutorial',
  description: 'Portal login, compliance document management, employee roster control, and contractor safety visibility.'
});
await page.waitForTimeout(1900);
await hideTitleCard(page);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  await segment.setup(page);
  await showGuideOverlay(page, {
    moduleTitle: segment.moduleTitle,
    stepTitle: segment.stepTitle,
    bullets: segment.bullets,
    footer: `Step ${index + 1}`,
    kicker: 'VENDOR PORTAL WALKTHROUGH'
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

const contractor = await findContractorByVendorCode(state.authToken, state.orgId, vendorCode);
const workers = Array.isArray(contractor.workers) ? contractor.workers : Object.values(contractor.workers || {});
const filteredWorkers = workers.filter((worker) => worker?.name !== demoWorker);
if (filteredWorkers.length !== workers.length) {
  await restPatchJson({
    databaseUrl,
    resourcePath: `organizations/${state.orgId}/contractors/${contractor.firebaseKey}`,
    authToken: state.authToken,
    payload: { workers: filteredWorkers }
  });
}

await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
process.exit(0);
