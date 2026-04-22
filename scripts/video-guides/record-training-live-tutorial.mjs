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
  injectPdfPreviewOverlay,
  loginMainApp,
  mixAudioFiles,
  navigateFromDashboard,
  readSessionObject,
  readSessionStorage,
  renderDelayedAudio,
  renderPdfPagesToImages,
  resetDirectory,
  showGuideOverlay,
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

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

const scenarioId = 'training-module-live-tutorial';
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
const _demoTopic = `Video Tutorial Training Session ${stamp}`;

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
resetDirectory(pdfImageDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });
fs.rmSync(pdfOutput, { force: true });

const _trainingRow = (page, topic) => page.locator('tr', { hasText: topic }).first();

const buildSegments = (_state) => ([
  {
    key: 'dashboard',
    moduleTitle: 'Training Module',
    stepTitle: 'Dashboard and pending CAPA training view',
    bullets: [
      'Open the training dashboard',
      'Review certification alerts and CAPA training due',
      'Use pending CAPA items to launch linked sessions'
    ],
    narration: 'We begin on the Training dashboard. This is where the site sees certification alerts, expiring competence records, and training sessions that are still due because they were raised by CAPA from other safety modules.',
    tailMs: 720,
    setup: async (page) => {
      await navigateFromDashboard(page, {
        baseUrl,
        moduleLabel: 'Training',
        site: 'HQ-01',
        waitForUrlPattern: '**/training**'
      });
      await gentleScan(page, viewport, 0, 180);
    }
  },
  {
    key: 'linked-capa-form',
    moduleTitle: 'Training Module',
    stepTitle: 'Launch a linked CAPA training session',
    bullets: [
      'Open a pending CAPA training row',
      'Review the prefilled session form',
      'Show how Training receives work from other modules'
    ],
    narration: 'When a CAPA item requires a refresher, the Training module can launch a linked session directly from the dashboard. The form opens with the requirement already prefilled so the coordinator can log the closure training against the original action.',
    tailMs: 760,
    setup: async (page) => {
      await page.getByRole('button', { name: /log session/i }).first().click();
      await page.waitForTimeout(1100);
      await gentleScan(page, viewport, 1, 150);
      await page.getByRole('button', { name: /dashboard/i }).click();
      await page.waitForTimeout(900);
    }
  },
  {
    key: 'matrix',
    moduleTitle: 'Training Competency Matrix',
    stepTitle: 'Review the live competency matrix',
    bullets: [
      'Open the matrix view',
      'See people versus training topics',
      'Use the matrix for competence visibility by site'
    ],
    narration: 'The competency matrix gives a live people versus topic view. It helps coordinators confirm who has completed which topics and which competences still need to be refreshed.',
    tailMs: 760,
    setup: async (page) => {
      await page.getByRole('button', { name: /matrix/i }).click();
      await page.waitForTimeout(1200);
      await gentleScan(page, viewport, 2, 150);
      await page.mouse.wheel(480, 0).catch(() => {});
      await page.waitForTimeout(250);
    }
  },
  {
    key: 'calendar',
    moduleTitle: 'Training Calendar',
    stepTitle: 'Review scheduled sessions and training deadlines',
    bullets: [
      'Open the monthly calendar',
      'See completed sessions and CAPA training due dates',
      'Use the calendar for upcoming coordination'
    ],
    narration: 'The calendar view shows training sessions and open CAPA related training deadlines on their actual dates. That gives teams a simple planning view for what is already completed and what is still coming due.',
    tailMs: 780,
    setup: async (page) => {
      await page.getByRole('button', { name: /calendar/i }).click();
      await page.waitForTimeout(1200);
      await gentleScan(page, viewport, 3, 130);
    }
  },
  {
    key: 'logs',
    moduleTitle: 'Training Master Log',
    stepTitle: 'Open the completed training register',
    bullets: [
      'Open the training master log',
      'Review completed sessions by site and date',
      'Open the printable register for a saved session'
    ],
    narration: 'Completed sessions are stored in the training master log. This is the formal register used to review historic sessions, open individual records, and print attendance documentation.',
    tailMs: 760,
    setup: async (page) => {
      await page.getByRole('button', { name: /logs/i }).click();
      await page.waitForTimeout(1200);
      const row = page.locator('tbody tr').first();
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      await gentleScan(page, viewport, 4, 110);
    }
  },
  {
    key: 'pdf-preview',
    moduleTitle: 'Training Module',
    stepTitle: 'Generate and review the training PDF',
    bullets: [
      'Open the print action for the saved session',
      'Export the attendance register to PDF',
      'Preview the generated PDF pages on screen'
    ],
    narration: 'From the log register, the trainer can open the attendance print view and export the record to PDF. Here we preview the generated training register pages directly on screen.',
    tailMs: 900,
    setup: async (page) => {
      await page.evaluate(() => {
        window.print = () => {};
      });
      const row = page.locator('tbody tr').first();
      await row.locator('button[title="Print Register"]').click();
      await page.waitForTimeout(900);
      await clearGuideOverlay(page);
      await page.pdf({
        path: pdfOutput,
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' }
      });
      const imagePaths = await renderPdfPagesToImages(pdfOutput, pdfImageDir, 2);
      await injectPdfPreviewOverlay(page, imagePaths, { title: 'Generated Training Register PDF' });
      await page.waitForTimeout(350);
    }
  },
  {
    key: 'summary',
    moduleTitle: 'Training Workflow Summary',
    stepTitle: 'System summary',
    bullets: [
      'Dashboard alerts and CAPA-linked training shown',
      'Matrix, calendar, and log views demonstrated',
      'Formal PDF record generated from the master log'
    ],
    narration: 'This is the Training module end to end. It receives follow up work from CAPA, shows competence in the matrix, organizes schedules in the calendar, stores completed sessions in the master log, and produces formal training records for audit and verification.',
    tailMs: 900,
    setup: async (page) => {
      await clearPdfPreviewOverlay(page);
      await page.getByRole('button', { name: /dashboard/i }).click();
      await page.waitForTimeout(1000);
      await gentleScan(page, viewport, 5, 140);
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
  orgId: session.orgId
};

const segments = buildSegments(state);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  segment.rawAudioPath = path.join(segmentAudioDir, `${String(index + 1).padStart(2, '0')}-${segment.key}.mp3`);
  segment.rawAudioWavPath = path.join(segmentAudioDir, `${String(index + 1).padStart(2, '0')}-${segment.key}.wav`);
  await withTimeout(
    synthesizeNeuralSpeechToMp3(segment.narration, segment.rawAudioPath, { voice, rate: voiceRate }),
    300000,
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
await page.getByRole('button', { name: /training/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  await segment.setup(page);
  await showGuideOverlay(page, {
    moduleTitle: segment.moduleTitle,
    stepTitle: segment.stepTitle,
    bullets: segment.bullets,
    footer: `Step ${index + 1}`,
    kicker: 'TRAINING WALKTHROUGH'
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

await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created training PDF: ${pdfOutput}`);
process.exit(0);
