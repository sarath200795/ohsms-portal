import path from 'node:path';
import { chromium } from 'playwright';
import {
  ensureDir,
  findNewestFile,
  rawRoot,
  sanitizeFileName,
  sleep,
  transcodeToMp4,
  videoRoot
} from './helpers.mjs';
import { publicSampleScenarios } from './scenarios.mjs';

const baseUrl = process.env.VIDEO_BASE_URL || 'http://127.0.0.1:4173';
const scenarioId = process.env.VIDEO_SCENARIO || publicSampleScenarios[0].id;
const scenario = publicSampleScenarios.find((item) => item.id === scenarioId);

if (!scenario) {
  throw new Error(`Unknown VIDEO_SCENARIO: ${scenarioId}`);
}

const scenarioSlug = sanitizeFileName(scenario.id);
const rawDir = ensureDir(path.join(rawRoot, scenarioSlug));
const mp4Output = path.join(videoRoot, `${scenarioSlug}.mp4`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  screen: { width: 1600, height: 900 },
  recordVideo: {
    dir: rawDir,
    size: { width: 1600, height: 900 }
  }
});

const page = await context.newPage();
await page.goto(new URL(scenario.route, baseUrl).toString(), { waitUntil: 'networkidle' });
await sleep(scenario.waitMs || 2000);

for (const action of scenario.actions || []) {
  if (action.type === 'hover') {
    await page.locator(action.selector).hover();
  } else if (action.type === 'click') {
    await page.locator(action.selector).click();
  }
  await sleep(action.waitMs || 600);
}

await sleep(1200);
await context.close();
await browser.close();

const rawVideo = findNewestFile(rawDir);
if (!rawVideo) {
  throw new Error(`No raw video found in ${rawDir}`);
}

await transcodeToMp4(rawVideo, mp4Output);
console.log(`Created MP4: ${mp4Output}`);
