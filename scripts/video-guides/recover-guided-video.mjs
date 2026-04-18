import path from 'node:path';
import {
  ensureDir,
  findNewestFile,
  rawRoot,
  sanitizeFileName,
  synthesizeSpeechToWave,
  transcodeToMp4WithAudio,
  videoRoot
} from './helpers.mjs';
import { guidedScenarios } from './scenarios.mjs';

const scenarioId = process.env.VIDEO_SCENARIO || '';
const scenario = guidedScenarios.find((item) => item.id === scenarioId);
const targetDurationMs = Number(process.env.VIDEO_DURATION_MS || scenario?.durationMs || 60000);
const outputSubdir = process.env.VIDEO_OUTPUT_SUBDIR || 'minute-tours';

if (!scenario) {
  throw new Error(`Unknown VIDEO_SCENARIO: ${scenarioId}`);
}

const buildNarration = (activeScenario) => {
  const stepScript = activeScenario.steps
    .map((step, index) => {
      const keyPoint = (step.bullets || [])[0] || 'review the visible workspace';
      return `Step ${index + 1}: ${step.title}. ${keyPoint}.`;
    })
    .join(' ');

  return [
    `Welcome to this one minute guided walkthrough for the ${activeScenario.title}.`,
    activeScenario.narration,
    stepScript,
    'The screen continues moving through the workspace so you can see the available tabs, actions, filters, and record areas without changing live data.',
    'Use the same flow in daily work, then continue only with the action that matches your permission level.'
  ].join(' ');
};

const scenarioSlug = sanitizeFileName(scenario.id);
const outputRoot = ensureDir(outputSubdir ? path.join(videoRoot, outputSubdir) : videoRoot);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const mp4Output = path.join(outputRoot, `${scenarioSlug}.mp4`);
const audioOutput = path.join(audioDir, `${scenarioSlug}.wav`);
const rawDir = path.join(rawRoot, scenarioSlug);
const rawVideo = findNewestFile(rawDir);

if (!rawVideo) {
  throw new Error(`No raw video found in ${rawDir}`);
}

console.log(`Recovering MP4 from raw video: ${rawVideo}`);
await synthesizeSpeechToWave(buildNarration(scenario), audioOutput, { rate: 0 });
await transcodeToMp4WithAudio(rawVideo, audioOutput, mp4Output, { durationSeconds: Math.ceil(targetDurationMs / 1000) });
console.log(`Recovered MP4: ${mp4Output}`);
