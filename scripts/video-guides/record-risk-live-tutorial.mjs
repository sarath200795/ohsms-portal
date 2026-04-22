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
  quickFill,
  readSessionObject,
  readSessionStorage,
  renderDelayedAudio,
  renderPdfPagesToImages,
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

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

const scenarioId = 'risk-module-live-tutorial';
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
const demoTitle = `Video Tutorial Risk Assessment ${stamp}`;
const revisionReason = `Updated controls following tutorial review and added a sharper residual risk justification ${stamp}.`;

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
resetDirectory(pdfImageDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });
fs.rmSync(pdfOutput, { force: true });

const findRiskByName = async (authToken, orgId, assessmentName) => {
  const data = await restGetJson({
    databaseUrl: 'https://ohsms-3894f-default-rtdb.firebaseio.com',
    resourcePath: `organizations/${orgId}/riskAssessments`,
    authToken
  });

  const match = Object.entries(data || {}).find(([, value]) => value?.assessmentName === assessmentName);
  if (!match) {
    throw new Error(`Unable to find risk assessment "${assessmentName}"`);
  }

  const [firebaseKey, value] = match;
  return { firebaseKey, ...value };
};

const riskRow = (page, title) => page.locator('tr', { hasText: title }).first();

const buildSegments = (state) => ([
  {
    key: 'repository',
    moduleTitle: 'Risk Module',
    stepTitle: 'Repository and KPI overview',
    bullets: [
      'Open the HIRA repository',
      'Review site filters, status filters, and KPI cards',
      'Start a brand new assessment from the repository'
    ],
    narration: 'We begin in the Risk module repository. This is the master HIRA register where teams review assessments by site and status, monitor hazard counts, and open a new assessment whenever a new task or process needs formal risk review.',
    tailMs: 700,
    setup: async (page) => {
      await navigateFromDashboard(page, {
        baseUrl,
        moduleLabel: 'Risk Assessment',
        site: 'HQ-01',
        waitForUrlPattern: '**/risk**'
      });
      await gentleScan(page, viewport, 0, 180);
    }
  },
  {
    key: 'core-context',
    moduleTitle: 'Risk Assessment Builder',
    stepTitle: 'Set the core context and assessment team',
    bullets: [
      'Capture the task area and site',
      'Set the document status',
      'Confirm the lead assessor and team role'
    ],
    narration: 'Now we create a new HIRA. The assessor records the task area, the site where the activity takes place, the document status, and the people responsible for carrying out and reviewing the assessment.',
    tailMs: 720,
    setup: async (page) => {
      await page.getByRole('button', { name: /new assessment/i }).click();
      await page.waitForTimeout(900);
      await quickFill(page.locator('input[placeholder*="Warehouse FLT Operations"]').first(), demoTitle);
      await page.locator('select').nth(0).selectOption({ value: 'HQ-01' });
      await page.locator('select').nth(1).selectOption('Active');
      await quickFill(page.locator('input[placeholder="Full Name"]').first(), 'Tutorial Assessor');
      await page.locator('select').nth(2).selectOption('HSE Rep');
      await gentleScan(page, viewport, 1, 140);
    }
  },
  {
    key: 'hazard-matrix',
    moduleTitle: 'Hazard Analysis Matrix',
    stepTitle: 'Build the live hazard and control set',
    bullets: [
      'Add an activity or work area',
      'Record the specific hazard and exposure',
      'Capture existing controls and additional actions'
    ],
    narration: 'Inside the hazard analysis matrix, the assessor adds the work area, defines the specific hazard, identifies who may be harmed, scores the initial risk, and then records both existing controls and any extra actions required to reduce the residual risk.',
    tailMs: 760,
    setup: async (page) => {
      await page.getByRole('button', { name: /add activity/i }).click();
      await page.waitForTimeout(450);
      await quickFill(page.locator('input[placeholder*="Hot Work on Main Boiler Pipes"]').first(), 'Forklift charging bay');
      await page.getByRole('button', { name: /add hazard/i }).click();
      await page.waitForTimeout(450);
      await quickFill(page.locator('input[placeholder*="Ceiling, Pump Room"]').first(), 'Charging station aisle');
      await page.locator('select').nth(3).selectOption('Chemical');
      await page.waitForTimeout(300);
      await page.locator('select').nth(4).selectOption({ index: 1 });
      await quickFill(page.locator('input[placeholder*="Operators"]').first(), 'Operators and maintenance technicians');
      await quickFill(page.locator('textarea').first(), 'Battery charging creates chemical splash exposure, spill risk, and slip potential around the charging bank.');
      await quickFill(page.locator('input[id^="ext-desc-"]').first(), 'Spill kit and acid neutralizer available at the charging point');
      await page.locator('button').filter({ hasText: '+' }).nth(0).click();
      await quickFill(page.locator('input[id^="add-desc-"]').first(), 'Conduct refresher training on acid handling and spill response');
      await page.locator('select[id^="add-own-"]').first().selectOption({ index: 1 });
      await page.locator('button').filter({ hasText: '+' }).nth(1).click();
      await gentleScan(page, viewport, 2, 160);
    }
  },
  {
    key: 'save-assessment',
    moduleTitle: 'Risk Module',
    stepTitle: 'Save the assessment to the register',
    bullets: [
      'Save the completed HIRA',
      'Return to the live repository',
      'Confirm the new assessment appears in the register'
    ],
    narration: 'Once the matrix is complete, the assessment is saved and returned to the repository. At that point, the new HIRA becomes part of the live risk register for that site.',
    tailMs: 760,
    setup: async (page) => {
      await page.getByRole('button', { name: /save assessment/i }).first().click();
      await page.waitForTimeout(2200);
      state.riskRecord = await findRiskByName(state.authToken, state.orgId, demoTitle);
      const row = riskRow(page, demoTitle);
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
    }
  },
  {
    key: 'pdf-preview',
    moduleTitle: 'Risk Module',
    stepTitle: 'Generate and review the HIRA PDF',
    bullets: [
      'Open the printable assessment output',
      'Export the document to PDF',
      'Preview the generated PDF pages on screen'
    ],
    narration: 'From the repository, the assessor can open the printable HIRA register and export it as a formal PDF. Here we show the generated assessment pages directly on screen for review.',
    tailMs: 900,
    setup: async (page) => {
      await page.evaluate(() => {
        window.print = () => {};
      });
      const row = riskRow(page, demoTitle);
      await row.locator('button[title="Print PDF"]').click();
      await page.waitForTimeout(900);
      await clearGuideOverlay(page);
      await page.pdf({
        path: pdfOutput,
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' }
      });
      const imagePaths = await renderPdfPagesToImages(pdfOutput, pdfImageDir, 2);
      await injectPdfPreviewOverlay(page, imagePaths, { title: 'Generated Risk Assessment PDF' });
      await page.waitForTimeout(350);
    }
  },
  {
    key: 'revision-log',
    moduleTitle: 'Risk Revision Control',
    stepTitle: 'Edit the assessment and capture the revision reason',
    bullets: [
      'Re-open the saved HIRA for update',
      'Change the hazard narrative',
      'Log the update source and revision reason'
    ],
    narration: 'When an approved HIRA is edited, the module forces a revision log. That protects document integrity by recording why the assessment changed and what triggered the update.',
    tailMs: 820,
    setup: async (page) => {
      await clearPdfPreviewOverlay(page);
      const row = riskRow(page, demoTitle);
      await row.locator('button[title="Edit"]').click();
      await page.waitForTimeout(900);
      await quickFill(page.locator('textarea').first(), 'Battery charging creates chemical splash exposure, spill risk, cable trip exposure, and slip potential around the charging bank.');
      await page.getByRole('button', { name: /save assessment/i }).first().click();
      await page.waitForTimeout(700);
      const revisionModal = page.locator('div').filter({ hasText: 'Document Revision Log' }).last();
      await revisionModal.locator('select').first().selectOption('Incident Investigation');
      await quickFill(revisionModal.locator('textarea[placeholder*="Added new engineering control"]').first(), revisionReason);
      await revisionModal.getByRole('button', { name: /confirm & save update/i }).click();
      await page.waitForTimeout(2200);
      await gentleScan(page, viewport, 3, 120);
    }
  },
  {
    key: 'revision-history',
    moduleTitle: 'Risk Module',
    stepTitle: 'Review the HIRA revision history',
    bullets: [
      'Open the revision history tab',
      'Review the logged change source and reason',
      'Use the log as the audit trail for document changes'
    ],
    narration: 'The revision history tab is the audit trail for the entire risk library. It shows exactly when a HIRA was changed, who changed it, what triggered the update, and the reason recorded for the revision.',
    tailMs: 950,
    setup: async (page) => {
      await page.getByRole('button', { name: /revision logs/i }).click();
      await page.waitForTimeout(1200);
      const row = page.locator('tr', { hasText: demoTitle }).first();
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await gentleScan(page, viewport, 4, 150);
    }
  },
  {
    key: 'summary',
    moduleTitle: 'Risk Workflow Summary',
    stepTitle: 'System summary',
    bullets: [
      'Assessment created and saved into the HIRA register',
      'Formal PDF output generated',
      'Revision logging and audit history demonstrated'
    ],
    narration: 'This is the full Risk module workflow. The team creates a HIRA, builds the hazard and control matrix, exports the formal record to PDF, and then uses controlled revision logging to keep the assessment audit ready over time.',
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
    apiKey: 'AIzaSyBHqeQN4s9PA5UUDfLtAajVkoRK2BrRjwk',
    email,
    password
  }),
  orgId: session.orgId,
  riskRecord: null
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
await page.getByRole('button', { name: /risk assessment/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  await segment.setup(page);
  await showGuideOverlay(page, {
    moduleTitle: segment.moduleTitle,
    stepTitle: segment.stepTitle,
    bullets: segment.bullets,
    footer: `Step ${index + 1}`,
    kicker: 'RISK WALKTHROUGH'
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

if (state.riskRecord?.firebaseKey) {
  await restDeletePath({
    databaseUrl: 'https://ohsms-3894f-default-rtdb.firebaseio.com',
    resourcePath: `organizations/${state.orgId}/riskAssessments/${state.riskRecord.firebaseKey}`,
    authToken: state.authToken
  });
}

await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created risk assessment PDF: ${pdfOutput}`);
process.exit(0);
