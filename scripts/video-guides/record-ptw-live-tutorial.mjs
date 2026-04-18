import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { rawRoot, videoRoot } from './helpers.mjs';
import {
  clearGuideOverlay,
  clearPdfPreviewOverlay,
  ensureDir,
  findLongestPlayableVideo,
  gentleScan,
  getMediaDurationSeconds,
  hideTitleCard,
  injectPdfPreviewOverlay,
  loginFieldPortal,
  loginMainApp,
  mixAudioFiles,
  navigateFromOhsTools,
  quickFill,
  readSessionObject,
  readSessionStorage,
  renderDelayedAudio,
  renderPdfPagesToImages,
  resetDirectory,
  restDeletePath,
  restGetJson,
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
const email = process.env.VIDEO_EMAIL || '';
const password = process.env.VIDEO_PASSWORD || '';
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-GuyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-7%';
const apiKey = 'AIzaSyBHqeQN4s9PA5UUDfLtAajVkoRK2BrRjwk';
const databaseUrl = 'https://ohsms-3894f-default-rtdb.firebaseio.com';

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

const scenarioId = 'ptw-module-live-tutorial';
const outputRoot = ensureDir(path.join(videoRoot, 'module-deep-dives'));
const rawDir = path.join(rawRoot, scenarioId);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir = path.join(audioDir, `${scenarioId}-segments`);
const pdfDir = ensureDir(path.join(outputRoot, 'pdf'));
const pdfImageDir = path.join(pdfDir, `${scenarioId}-pages`);
const mp4Output = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}.wav`);
const pdfOutput = path.join(pdfDir, `${scenarioId}.pdf`);
const viewport = { width: 1280, height: 720 };

const stamp = Date.now();
const demoDescription = `PTW tutorial pump guard replacement ${stamp}`;
const inspectionNote = `Permit workplace inspection completed for tutorial record ${stamp}`;

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
resetDirectory(pdfImageDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });
fs.rmSync(pdfOutput, { force: true });

const findPermitByDescription = async (authToken, orgId, description) => {
  const data = await restGetJson({
    databaseUrl,
    resourcePath: `organizations/${orgId}/ptwRecords`,
    authToken
  });

  const match = Object.entries(data || {}).find(([, value]) => value?.description === description);
  if (!match) {
    throw new Error(`Unable to find PTW permit for "${description}"`);
  }

  const [firebaseKey, value] = match;
  return { firebaseKey, ...value };
};

const buildSegments = (state) => ([
  {
    key: 'dashboard',
    moduleTitle: 'PTW Module',
    stepTitle: 'Dashboard and live permit queue',
    bullets: [
      'Open the permit workspace',
      'Review active, pending, and closure counts',
      'Start the permit issue flow'
    ],
    narration: 'We begin on the Permit to Work dashboard. This home screen tells the team how many permits are active, how many are waiting for approval, and which records need closure or workplace intervention.',
    tailMs: 650,
    setup: async (page) => {
      await navigateFromOhsTools(page, {
        baseUrl,
        toolLabel: 'Permit to Work',
        site: 'HQ-01',
        waitForUrlPattern: '**/ptw**'
      });
      await gentleScan(page, viewport, 0, 180);
    }
  },
  {
    key: 'builder',
    moduleTitle: 'Permit Builder',
    stepTitle: 'Issue a new permit request',
    bullets: [
      'Capture the job context and work description',
      'Assign the execution team and approvers',
      'Submit the permit for dual authorization'
    ],
    narration: 'Now we issue a permit. The permit builder captures the job description, location, validity period, execution team, and the two independent authorizers required before work can begin.',
    tailMs: 900,
    setup: async (page) => {
      await page.getByRole('button', { name: /issue permit/i }).click();
      await page.waitForTimeout(900);
      await page.locator('select').nth(0).selectOption('HOT');
      await page.locator('select').nth(1).selectOption({ index: 1 });
      await page.getByText('Sarath Chandra', { exact: true }).first().click();
      await quickFill(page.locator('input[placeholder="e.g. Maintenance, Production"]'), 'Maintenance');
      await quickFill(page.locator('input[placeholder="Supervisor Name"]'), 'Alex Turner');
      await quickFill(page.locator('textarea[placeholder*="Describe the exact nature"]'), demoDescription);
      await quickFill(page.locator('input[placeholder="e.g. Roof of Boiler Room"]'), 'Boiler Room Platform');
      await quickFill(page.locator('input[placeholder="e.g. HVAC Unit B"]'), 'Pump P-101');
      await page.locator('input[type="date"]').nth(0).fill('2026-04-09');
      await page.locator('input[type="time"]').nth(0).fill('08:00');
      await page.locator('input[type="date"]').nth(1).fill('2026-04-09');
      await page.locator('input[type="time"]').nth(1).fill('18:00');
      await quickFill(page.locator('textarea[placeholder="What are you doing?"]'), 'Remove the damaged pump guard and install the replacement assembly.');
      await quickFill(page.locator('textarea[placeholder="What could go wrong?"]'), 'Spark exposure, contact with moving parts, and dropped tools.');
      await quickFill(page.locator('textarea[placeholder="How to prevent it?"]'), 'Isolate the area, maintain a fire watch, and use the required PPE.');
      await page.locator('select').nth(2).selectOption({ index: 1 });
      await page.locator('select').nth(3).selectOption({ index: 1 });
      await gentleScan(page, viewport, 1, 240);
      await page.getByRole('button', { name: /submit for authorization/i }).click();
      await page.waitForTimeout(1800);
      state.permit = await findPermitByDescription(state.authToken, state.orgId, demoDescription);
      const row = page.locator('tr', { hasText: demoDescription }).first();
      if (await row.count()) {
        await row.scrollIntoViewIfNeeded();
      }
    }
  },
  {
    key: 'approval',
    moduleTitle: 'Dual Approval Flow',
    stepTitle: 'Approve engineering and production',
    bullets: [
      'Open the pending permit row',
      'Approve engineering authorization',
      'Approve production authorization to activate the permit'
    ],
    narration: 'The permit is now waiting for dual authorization. Engineering reviews first, production reviews second, and once both approvals are recorded the permit becomes active for work in progress.',
    tailMs: 850,
    setup: async (page) => {
      let row = page.locator('tr', { hasText: demoDescription }).first();
      await row.scrollIntoViewIfNeeded();
      await row.getByRole('button', { name: /apprv eng/i }).click();
      await page.waitForTimeout(1200);
      row = page.locator('tr', { hasText: demoDescription }).first();
      await row.getByRole('button', { name: /apprv prod/i }).click();
      await page.waitForTimeout(1600);
      state.permit = await findPermitByDescription(state.authToken, state.orgId, demoDescription);
      row = page.locator('tr', { hasText: demoDescription }).first();
      await row.scrollIntoViewIfNeeded();
      await gentleScan(page, viewport, 2, 140);
    }
  },
  {
    key: 'permit-pdf',
    moduleTitle: 'Permit PDF and QR',
    stepTitle: 'Generate the live permit printout',
    bullets: [
      'Open the print view for the active permit',
      'Export the permit PDF',
      'Show the QR-bearing permit pages on screen'
    ],
    narration: 'With the permit active, the system can produce a formal permit printout. That PDF includes the permit details and the QR code that points directly to the live permit record for field review and inspection.',
    tailMs: 900,
    setup: async (page) => {
      await page.evaluate(() => {
        window.print = () => {};
      });
      const row = page.locator('tr', { hasText: demoDescription }).first();
      await row.scrollIntoViewIfNeeded();
      await row.locator('button:has(i.fa-print)').click();
      await page.waitForTimeout(1300);
      await clearGuideOverlay(page);
      await page.pdf({
        path: pdfOutput,
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' }
      });
      const imagePaths = await renderPdfPagesToImages(pdfOutput, pdfImageDir, 2);
      await injectPdfPreviewOverlay(page, imagePaths, {
        title: 'Generated PTW Permit PDF'
      });
      await page.waitForTimeout(350);
    }
  },
  {
    key: 'field-portal-home',
    moduleTitle: 'Field Portal',
    stepTitle: 'Move from office approval to field access',
    bullets: [
      'Sign into the field portal',
      'Show the mobile home screen',
      'Prepare to open the permit from the QR route'
    ],
    narration: 'The permit can now move from the office workflow into the field portal. This is where supervisors and mobile users open the live permit quickly without stepping through the full enterprise dashboard.',
    tailMs: 700,
    setup: async (page) => {
      await clearPdfPreviewOverlay(page);
      await loginFieldPortal(page, { baseUrl, email, password });
      await page.waitForTimeout(1600);
      await gentleScan(page, viewport, 3, 170);
    }
  },
  {
    key: 'qr-viewer',
    moduleTitle: 'QR Permit Access',
    stepTitle: 'Open the exact permit from the QR route',
    bullets: [
      'Load the permit viewer by its QR-linked reference',
      'Confirm the live permit details',
      'Open the inspection action'
    ],
    narration: 'Now the same QR route opens the exact permit in the field. The viewer shows the job, approvals, PPE, controls, and any special conditions before the field user records a workplace inspection.',
    tailMs: 800,
    setup: async (page) => {
      const permitPath = `/ptw?ptw=${encodeURIComponent(state.permit.id)}`;
      await page.goto(new URL(permitPath, baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1600);
      await page.getByRole('button', { name: /inspect \/ observe/i }).click();
      await page.waitForTimeout(900);
      await gentleScan(page, viewport, 4, 120);
    }
  },
  {
    key: 'inspection',
    moduleTitle: 'Permit Inspection',
    stepTitle: 'Record a safe field observation',
    bullets: [
      'Write the workplace observation',
      'Log the inspection as safe',
      'Keep the permit active for controlled work'
    ],
    narration: 'The field user now records the workplace observation. In this example the conditions are safe, so the inspection is logged and the permit remains active. If the finding was unsafe, the same screen could cancel the permit immediately.',
    tailMs: 900,
    setup: async (page) => {
      await quickFill(page.locator('textarea[placeholder*="Log site conditions"]'), inspectionNote);
      await page.getByRole('button', { name: /log as safe/i }).click();
      await page.waitForTimeout(1500);
      await gentleScan(page, viewport, 5, 120);
    }
  }
]);

const browser = await chromium.launch({ headless: true });

const recordingContext = await browser.newContext({
  viewport,
  screen: viewport,
  acceptDownloads: true,
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
  authToken: await signInForDatabaseToken({ apiKey, email, password }),
  orgId: session.orgId,
  permit: null
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
await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /ohs tools/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  await segment.setup(page);
  await showGuideOverlay(page, {
    moduleTitle: segment.moduleTitle,
    stepTitle: segment.stepTitle,
    bullets: segment.bullets,
    footer: `Step ${index + 1}`,
    kicker: 'PTW WALKTHROUGH'
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

if (state.permit?.firebaseKey) {
  await restDeletePath({
    databaseUrl,
    resourcePath: `organizations/${state.orgId}/ptwRecords/${state.permit.firebaseKey}`,
    authToken: state.authToken
  });
}

await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created PTW PDF: ${pdfOutput}`);
