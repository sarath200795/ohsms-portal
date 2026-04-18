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
  restPostJson,
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

const scenarioId = 'emergency-equipment-module-live-tutorial';
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
const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};
const currentDate = '2026-04-09';
const overdueInspectionDate = '2026-02-12';

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
resetDirectory(pdfImageDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });
fs.rmSync(pdfOutput, { force: true });

const createDemoEquipmentRecords = async (authToken, orgId) => {
  const basePayload = {
    siteId: 'HQ-01',
    status: 'Active',
    updatedBy: 'Tutorial Bot',
    lastUpdated: new Date().toISOString(),
    lastInspection: overdueInspectionDate,
    nextInspection: addDays(overdueInspectionDate, 30),
    notes: 'Tutorial equipment record for deep-dive video.'
  };

  const records = [
    {
      type: 'Fire Extinguisher',
      assetId: `VID-FE-${stamp}`,
      location: 'Pump House Exit A',
      extinguisherType: 'ABC Powder / DCP (Stored Pressure)',
      lastRefillDate: '2025-10-01',
      nextRefillDate: '2026-10-01',
      lastHptDate: '2024-01-01',
      nextHptDate: '2029-01-01'
    },
    {
      type: 'First Aid Kit',
      assetId: `VID-FA-${stamp}`,
      location: 'Admin Block Corridor'
    },
    {
      type: 'AED / Defibrillator',
      assetId: `VID-AED-${stamp}`,
      location: 'Main Reception'
    },
    {
      type: 'Eye Wash Station',
      assetId: `VID-EYE-${stamp}`,
      location: 'Chemical Store Entrance'
    },
    {
      type: 'Spill Kit',
      assetId: `VID-SPILL-${stamp}`,
      location: 'Fuel Transfer Area'
    },
    {
      type: 'Evacuation Chair',
      assetId: `VID-EVAC-${stamp}`,
      location: 'Staircase Landing Level 2'
    }
  ];

  const created = [];
  for (const record of records) {
    const response = await restPostJson({
      databaseUrl,
      resourcePath: `organizations/${orgId}/emergencyEquipment`,
      authToken,
      payload: {
        ...basePayload,
        ...record
      }
    });
    created.push({ firebaseKey: response.name, ...basePayload, ...record });
  }
  return created;
};

const inspectionTypes = [
  {
    key: 'fire-extinguisher',
    type: 'Fire Extinguisher',
    note: `Monthly extinguisher check completed for tutorial ${stamp}`
  },
  {
    key: 'first-aid',
    type: 'First Aid Kit',
    note: `First aid contents checked and replenishment confirmed ${stamp}`
  },
  {
    key: 'aed',
    type: 'AED / Defibrillator',
    note: `AED readiness verified with pads and battery in date ${stamp}`
  },
  {
    key: 'eye-wash',
    type: 'Eye Wash Station',
    note: `Eyewash flow and cleanliness verified ${stamp}`
  },
  {
    key: 'spill-kit',
    type: 'Spill Kit',
    note: `Spill response consumables checked and resealed ${stamp}`
  },
  {
    key: 'evac-chair',
    type: 'Evacuation Chair',
    note: `Evacuation chair frame and restraint checks completed ${stamp}`
  }
];

const buildSegments = (state) => {
  const segments = [
    {
      key: 'registry',
      moduleTitle: 'Emergency Equipment Module',
      stepTitle: 'Registry overview and compliance status',
      bullets: [
        'Open the emergency equipment registry',
        'Review the due and action-required counts',
        'Use the registry as the launch point for tags and inspections'
      ],
      narration: 'We begin in the emergency equipment registry. This is the live compliance dashboard for extinguishers, first aid kits, AEDs, eyewash stations, spill kits, and evacuation chairs across the site.',
      tailMs: 700,
      setup: async (page) => {
        await navigateFromOhsTools(page, {
          baseUrl,
          toolLabel: 'Emergency Equipment',
          site: 'HQ-01',
          waitForUrlPattern: '**/emergency-equipment**'
        });
        await gentleScan(page, viewport, 0, 180);
      }
    },
    {
      key: 'tag-pdf',
      moduleTitle: 'Equipment Tag Generation',
      stepTitle: 'Generate the emergency equipment tag PDF',
      bullets: [
        'Open the QR tag for the equipment',
        'Capture the tag as a printable PDF',
        'Show the generated QR tag pages on screen'
      ],
      narration: 'Next we generate the equipment tag. The printed tag carries the asset identity and the QR code that opens the exact inspection sheet for the equipment during field use.',
      tailMs: 900,
      setup: async (page) => {
        await page.evaluate(() => {
          window.print = () => {};
        });
        const record = state.records.find((item) => item.type === 'Fire Extinguisher');
        const row = page.locator('tr', { hasText: record.assetId }).first();
        await row.scrollIntoViewIfNeeded();
        await row.getByRole('button', { name: /tag/i }).click();
        await page.waitForTimeout(1100);
        await clearGuideOverlay(page);
        await page.pdf({
          path: pdfOutput,
          format: 'A4',
          printBackground: true,
          margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
        });
        const imagePaths = await renderPdfPagesToImages(pdfOutput, pdfImageDir, 1);
        await injectPdfPreviewOverlay(page, imagePaths, {
          title: 'Generated Emergency Equipment Tag PDF'
        });
        await page.waitForTimeout(350);
      }
    }
  ];

  inspectionTypes.forEach((entry, index) => {
    segments.push({
      key: `inspect-${entry.key}`,
      moduleTitle: `${entry.type} Inspection`,
      stepTitle: `Complete the ${entry.type} checklist`,
      bullets: [
        `Open the ${entry.type} inspection sheet`,
        'Review the equipment-specific checklist',
        'Submit the new inspection date and remarks'
      ],
      narration: `This step shows the ${entry.type} inspection flow. The sheet is specific to this equipment type, so the checklist, warning banner, and remarks all reflect the real compliance checks that matter for this asset.`,
      tailMs: 850,
      setup: async (page) => {
        await clearPdfPreviewOverlay(page);
        const record = state.records.find((item) => item.type === entry.type);
        const row = page.locator('tr', { hasText: record.assetId }).first();
        await row.scrollIntoViewIfNeeded();
        await row.getByRole('button', { name: /inspect/i }).click();
        await page.waitForTimeout(1100);
        await quickFill(page.locator('textarea[placeholder*="Any specific details"]').first(), entry.note);
        await page.locator('input[type="date"]').last().fill(currentDate).catch(() => {});
        await gentleScan(page, viewport, index + 1, 170);
        await page.getByRole('button', { name: /sign & submit/i }).click();
        await page.waitForTimeout(1500);
      }
    });
  });

  return segments;
};

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

const authToken = await signInForDatabaseToken({ apiKey, email, password });
const state = {
  authToken,
  orgId: session.orgId,
  records: await createDemoEquipmentRecords(authToken, session.orgId)
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
    kicker: 'EMERGENCY EQUIPMENT'
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

await Promise.all(
  state.records.map((record) => restDeletePath({
    databaseUrl,
    resourcePath: `organizations/${state.orgId}/emergencyEquipment/${record.firebaseKey}`,
    authToken
  }))
);

await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created emergency equipment tag PDF: ${pdfOutput}`);
