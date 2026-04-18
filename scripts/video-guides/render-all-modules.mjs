import { spawn } from 'node:child_process';
import { guidedScenarios } from './scenarios.mjs';

const email = process.env.VIDEO_EMAIL || '';
const password = process.env.VIDEO_PASSWORD || '';
const baseUrl = process.env.VIDEO_BASE_URL || 'http://127.0.0.1:4173';

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required for module batch rendering.');
}

const runScenario = (scenarioId) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/video-guides/record-guided-video.mjs'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          VIDEO_EMAIL: email,
          VIDEO_PASSWORD: password,
          VIDEO_BASE_URL: baseUrl,
          VIDEO_SCENARIO: scenarioId
        },
        stdio: 'inherit'
      }
    );

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Scenario ${scenarioId} failed with exit code ${code}`));
    });
  });

const failures = [];

for (const scenario of guidedScenarios) {
  console.log(`\n=== Rendering ${scenario.id} ===`);
  try {
    await runScenario(scenario.id);
  } catch (error) {
    failures.push({ id: scenario.id, message: error.message });
    console.error(`Failed to render ${scenario.id}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error('\nThe following module videos failed:');
  failures.forEach((failure) => console.error(`- ${failure.id}: ${failure.message}`));
  process.exitCode = 1;
} else {
  console.log('\nAll module videos rendered.');
}
