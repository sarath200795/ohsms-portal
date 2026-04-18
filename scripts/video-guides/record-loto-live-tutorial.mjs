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
  navigateFromOhsTools,
  loginFieldPortal,
  loginMainApp,
  mixAudioFiles,
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

const scenarioId = 'loto-module-live-tutorial';
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
const demoDescription = `Tutorial LOTO Pump Isolation ${stamp}`;
const demoLocation = 'Boiler Room South';
const demoInstruction = 'Open the local disconnect, isolate the steam inlet valve, and hang the lockout board.';
const demoVerification = 'Attempt local start, verify no movement, and confirm zero energy at the point of work.';

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
resetDirectory(pdfImageDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });
fs.rmSync(pdfOutput, { force: true });

const findProcedureByDescription = async (authToken, orgId, description) => {
  const data = await restGetJson({
    databaseUrl,
    resourcePath: `organizations/${orgId}/lotoProcedures`,
    authToken
  });

  const match = Object.entries(data || {}).find(([, value]) => value?.description === description);
  if (!match) {
    throw new Error(`Unable to find LOTO procedure for "${description}"`);
  }

  const [firebaseKey, value] = match;
  return { firebaseKey, ...value };
};

const deleteProcedureLogs = async (authToken, orgId, procKey) => {
  const logs = await restGetJson({
    databaseUrl,
    resourcePath: `organizations/${orgId}/lotoLogs`,
    authToken
  });

  await Promise.all(
    Object.entries(logs || {})
      .filter(([, value]) => value?.procId === procKey)
      .map(([firebaseKey]) => restDeletePath({
        databaseUrl,
        resourcePath: `organizations/${orgId}/lotoLogs/${firebaseKey}`,
        authToken
      }))
  );
};

const procedureCard = (page) =>
  page.locator('div.glass-panel').filter({ hasText: demoDescription }).first();

const buildSegments = (state) => ([
  {
    key: 'dashboard',
    moduleTitle: 'LOTO Module',
    stepTitle: 'Dashboard and procedure inventory',
    bullets: [
      'Open the LOTO workspace',
      'Review approved procedures and live lockout counts',
      'Start the procedure authoring flow'
    ],
    narration: 'We begin inside the LOTO module dashboard. This gives supervisors a live count of approved procedures, active lockouts, and the audit trail that proves each energy isolation step was followed correctly.',
    tailMs: 700,
    setup: async (page) => {
      await navigateFromOhsTools(page, {
        baseUrl,
        toolLabel: 'LOTO System',
        site: 'HQ-01',
        waitForUrlPattern: '**/loto**'
      });
      await gentleScan(page, viewport, 0, 160);
    }
  },
  {
    key: 'builder',
    moduleTitle: 'LOTO Procedure Builder',
    stepTitle: 'Create a new isolation procedure',
    bullets: [
      'Capture the site, location, and equipment',
      'Define the energy source and isolation instruction',
      'Publish the procedure into the inventory'
    ],
    narration: 'Now we build a new isolation procedure live. The author records the site, the exact area, the equipment under control, and the step by step isolation and verification actions that operators must follow every time.',
    tailMs: 800,
    setup: async (page) => {
      await page.getByRole('button', { name: /new procedure/i }).click();
      await page.waitForTimeout(900);
      await page.locator('select').nth(1).selectOption({ index: 1 });
      await quickFill(page.locator('input').nth(0), demoLocation);
      await quickFill(page.locator('input').nth(1), demoDescription);
      await page.locator('select').nth(2).selectOption('Electrical');
      await quickFill(page.locator('textarea').nth(0), demoInstruction);
      await quickFill(page.locator('textarea').nth(1), demoVerification);
      await page.getByText('Safety Padlock', { exact: true }).click().catch(() => {});
      await page.getByText('Arc Flash', { exact: false }).click().catch(() => {});
      await gentleScan(page, viewport, 1, 220);
      await page.getByRole('button', { name: /publish procedure/i }).click();
      await page.waitForTimeout(1800);
      state.procedure = await findProcedureByDescription(state.authToken, state.orgId, demoDescription);
      const row = procedureCard(page);
      if (await row.count()) {
        await row.scrollIntoViewIfNeeded();
      }
      await page.waitForTimeout(400);
    }
  },
  {
    key: 'approval',
    moduleTitle: 'LOTO Approval',
    stepTitle: 'Approve and release the procedure',
    bullets: [
      'Locate the draft procedure in inventory',
      'Approve it for operational use',
      'Unlock PDF, tags, and execution access'
    ],
    narration: 'The new procedure lands in inventory as a draft. After review, an authorized manager approves it. Once approved, the system unlocks the formal procedure PDF, the printable tag pack, and the execution workflow for live use on site.',
    tailMs: 700,
    setup: async (page) => {
      const row = procedureCard(page);
      await row.scrollIntoViewIfNeeded();
      await row.locator('button').filter({ hasText: /approve/i }).first().click();
      await page.waitForTimeout(1400);
      state.procedure = await findProcedureByDescription(state.authToken, state.orgId, demoDescription);
      await gentleScan(page, viewport, 2, 120);
    }
  },
  {
    key: 'tags-pdf',
    moduleTitle: 'LOTO Tags',
    stepTitle: 'Generate the QR tag pack',
    bullets: [
      'Export the tag PDF',
      'Preview the generated QR tags',
      'Use the tags for field access'
    ],
    narration: 'Next we generate the tag pack. Each isolation point receives a printable tag, and the QR code on the pack can take field users straight into the live lockout execution screen.',
    tailMs: 900,
    setup: async (page) => {
      const row = procedureCard(page);
      await row.scrollIntoViewIfNeeded();
      const downloadPromise = page.waitForEvent('download');
      await row.getByRole('button', { name: /tags/i }).click();
      const download = await downloadPromise;
      await download.saveAs(pdfOutput);
      const imagePaths = await renderPdfPagesToImages(pdfOutput, pdfImageDir, 2);
      await clearGuideOverlay(page);
      await injectPdfPreviewOverlay(page, imagePaths, {
        title: 'Generated LOTO Tag PDF'
      });
      await page.waitForTimeout(350);
    }
  },
  {
    key: 'execute-main',
    moduleTitle: 'LOTO Execution',
    stepTitle: 'Review the live execution sheet',
    bullets: [
      'Open the approved procedure for execution',
      'Review the lock point card and instruction',
      'Prepare the field handoff'
    ],
    narration: 'Back in the main module, the approved procedure can be executed. Operators see the exact lock point card, the isolation instruction, and the live button that records whether the lock has been applied or removed.',
    tailMs: 700,
    setup: async (page) => {
      await clearPdfPreviewOverlay(page);
      const row = procedureCard(page);
      await row.scrollIntoViewIfNeeded();
      await row.getByRole('button', { name: /execute/i }).click();
      await page.waitForTimeout(1200);
      await gentleScan(page, viewport, 3, 140);
    }
  },
  {
    key: 'field-portal-home',
    moduleTitle: 'Field Portal',
    stepTitle: 'Open the mobile execution workspace',
    bullets: [
      'Sign into the field portal',
      'Show the field home screen',
      'Prepare for QR-directed access'
    ],
    narration: 'The same procedure can also be operated from the field portal. This gives mobile teams a simpler workspace for action-based tasks without opening the full enterprise dashboard.',
    tailMs: 700,
    setup: async (page) => {
      await loginFieldPortal(page, { baseUrl, email, password });
      await page.waitForTimeout(1600);
      state.fieldPortalLoggedIn = true;
      await gentleScan(page, viewport, 4, 180);
    }
  },
  {
    key: 'field-portal-qr',
    moduleTitle: 'Field QR Access',
    stepTitle: 'Launch the procedure from the QR route',
    bullets: [
      'Open the QR-linked LOTO execute page',
      'Verify operator mode is active',
      'Apply the live lock action'
    ],
    narration: 'Here the QR route opens the exact procedure for the field team. Because the user is signed in through the field portal, the page is actionable instead of read only, and the operator can record the lock application live.',
    tailMs: 850,
    setup: async (page) => {
      const executeUrl = `/loto?execute=${encodeURIComponent(state.procedure.firebaseKey)}&org=${encodeURIComponent(state.orgId)}`;
      await page.goto(new URL(executeUrl, baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1300);
      const applyButton = page.getByRole('button', { name: /apply lock/i }).first();
      await applyButton.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await applyButton.click();
      await page.waitForTimeout(1300);
      await gentleScan(page, viewport, 5, 120);
    }
  },
  {
    key: 'live-register',
    moduleTitle: 'LOTO Live Register',
    stepTitle: 'Confirm the active lockout in the register',
    bullets: [
      'Return to the main LOTO workspace',
      'Open the live register',
      'Show the active lockout status for the procedure'
    ],
    narration: 'Once the field action is logged, the live register updates immediately. Supervisors can see that the procedure is in progress and how many isolation points are currently locked on the equipment.',
    tailMs: 900,
    setup: async (page) => {
      await page.goto(new URL('/loto?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1300);
      await page.getByRole('button', { name: /live register/i }).click();
      await page.waitForTimeout(1200);
      const liveCard = procedureCard(page);
      if (await liveCard.count()) {
        await liveCard.scrollIntoViewIfNeeded();
      }
      await gentleScan(page, viewport, 6, 180);
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
  procedure: null,
  fieldPortalLoggedIn: false
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
    kicker: 'LOTO WALKTHROUGH'
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

if (state.procedure?.firebaseKey) {
  await deleteProcedureLogs(state.authToken, state.orgId, state.procedure.firebaseKey);
  await restDeletePath({
    databaseUrl,
    resourcePath: `organizations/${state.orgId}/lotoProcedures/${state.procedure.firebaseKey}`,
    authToken: state.authToken
  });
}

await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created LOTO tag PDF: ${pdfOutput}`);
