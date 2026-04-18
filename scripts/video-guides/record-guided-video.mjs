import path from 'node:path';
import { chromium } from 'playwright';
import {
  ensureDir,
  findNewestFile,
  rawRoot,
  sanitizeFileName,
  sleep,
  synthesizeNeuralSpeechToMp3,
  synthesizeSpeechToWave,
  transcodeToMp4WithAudio,
  videoRoot
} from './helpers.mjs';
import { guidedScenarios } from './scenarios.mjs';

const baseUrl = process.env.VIDEO_BASE_URL || 'http://127.0.0.1:4173';
const email = process.env.VIDEO_EMAIL || '';
const password = process.env.VIDEO_PASSWORD || '';
const scenarioId = process.env.VIDEO_SCENARIO || guidedScenarios[0].id;
const scenario = guidedScenarios.find((item) => item.id === scenarioId);
const tutorialMode = process.env.VIDEO_STYLE === 'tutorial' || process.env.VIDEO_TUTORIAL_MODE === '1';
const defaultTutorialDurationMs = Math.max(135000, ((scenario?.steps?.length || 2) * 32000) + 70000);
const finalDurationMs = Number(process.env.VIDEO_FINAL_DURATION_MS || process.env.VIDEO_DURATION_MS || scenario?.durationMs || (tutorialMode ? defaultTutorialDurationMs : 60000));
const captureDurationMs = Number(process.env.VIDEO_CAPTURE_DURATION_MS || (tutorialMode ? Math.min(finalDurationMs, Number(scenario?.captureDurationMs || 90000)) : finalDurationMs));
const outputSubdir = process.env.VIDEO_OUTPUT_SUBDIR || '';

if (!scenario) {
  throw new Error(`Unknown VIDEO_SCENARIO: ${scenarioId}`);
}

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required for guided authenticated recordings.');
}

const showGuideOverlay = async (page, { moduleTitle, stepTitle, bullets, footer }) => {
  await page.evaluate((payload) => {
    const existing = document.getElementById('codex-video-guide');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'codex-video-guide';
    root.style.position = 'fixed';
    root.style.top = '20px';
    root.style.left = '20px';
    root.style.width = payload.tutorialMode ? '430px' : '400px';
    root.style.maxWidth = 'calc(100vw - 40px)';
    root.style.zIndex = '999999';
    root.style.padding = '18px 20px';
    root.style.borderRadius = '18px';
    root.style.border = '1px solid rgba(70, 215, 255, 0.35)';
    root.style.background = 'linear-gradient(180deg, rgba(7, 10, 14, 0.94) 0%, rgba(10, 15, 20, 0.96) 100%)';
    root.style.boxShadow = '0 24px 48px -28px rgba(0,0,0,0.9)';
    root.style.color = '#edf4ff';
    root.style.fontFamily = '"Rajdhani", sans-serif';
    root.style.pointerEvents = 'none';
    root.style.transform = 'translateY(0)';
    root.style.animation = 'codexGuidePulse 520ms ease both';

    if (!document.getElementById('codex-video-guide-style')) {
      const style = document.createElement('style');
      style.id = 'codex-video-guide-style';
      style.textContent = `
        @keyframes codexGuidePulse {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    const kicker = document.createElement('div');
    kicker.textContent = payload.tutorialMode ? 'STEP-BY-STEP MODULE TUTORIAL' : 'OHSMS MODULE GUIDE';
    kicker.style.fontSize = '11px';
    kicker.style.fontWeight = '700';
    kicker.style.letterSpacing = '0.28em';
    kicker.style.color = '#46d7ff';
    kicker.style.marginBottom = '8px';

    const title = document.createElement('div');
    title.textContent = payload.moduleTitle;
    title.style.fontSize = '30px';
    title.style.fontWeight = '700';
    title.style.lineHeight = '1';
    title.style.marginBottom = '10px';

    const step = document.createElement('div');
    step.textContent = payload.stepTitle;
    step.style.fontSize = '18px';
    step.style.fontWeight = '700';
    step.style.color = '#ffb84d';
    step.style.marginBottom = '10px';

    const list = document.createElement('ul');
    list.style.margin = '0';
    list.style.paddingLeft = '18px';
    list.style.fontSize = '14px';
    list.style.lineHeight = '1.45';
    list.style.color = '#dce6f3';

    (payload.bullets || []).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      li.style.marginBottom = '6px';
      list.appendChild(li);
    });

    const footer = document.createElement('div');
    footer.textContent = payload.footer || '';
    footer.style.marginTop = '12px';
    footer.style.paddingTop = '10px';
    footer.style.borderTop = '1px solid rgba(255,255,255,0.08)';
    footer.style.fontSize = '11px';
    footer.style.fontWeight = '700';
    footer.style.letterSpacing = '0.18em';
    footer.style.textTransform = 'uppercase';
    footer.style.color = '#8b96a5';

    root.appendChild(kicker);
    root.appendChild(title);
    root.appendChild(step);
    root.appendChild(list);
    root.appendChild(footer);
    document.body.appendChild(root);
  }, { moduleTitle, stepTitle, bullets, footer, tutorialMode });
};

const showTutorialTitleCard = async (page, activeScenario) => {
  if (!tutorialMode) return;

  await page.evaluate((payload) => {
    const existing = document.getElementById('codex-video-title-card');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'codex-video-title-card';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '999998';
    root.style.display = 'grid';
    root.style.placeItems = 'center';
    root.style.padding = '48px';
    root.style.background = 'radial-gradient(circle at 30% 20%, rgba(255,66,66,0.22), transparent 30%), radial-gradient(circle at 76% 68%, rgba(70,215,255,0.16), transparent 28%), linear-gradient(135deg, rgba(4,7,11,0.97), rgba(10,14,22,0.95))';
    root.style.color = '#f5f8ff';
    root.style.fontFamily = '"Rajdhani", sans-serif';
    root.style.pointerEvents = 'none';
    root.style.animation = 'codexTitleIn 620ms ease both';

    if (!document.getElementById('codex-video-title-style')) {
      const style = document.createElement('style');
      style.id = 'codex-video-title-style';
      style.textContent = `
        @keyframes codexTitleIn {
          from { opacity: 0; transform: scale(1.03); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes codexTitleLine {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `;
      document.head.appendChild(style);
    }

    const panel = document.createElement('div');
    panel.style.width = 'min(980px, 100%)';
    panel.style.border = '1px solid rgba(255,255,255,0.12)';
    panel.style.background = 'linear-gradient(180deg, rgba(14,20,31,0.96), rgba(8,12,19,0.98))';
    panel.style.boxShadow = '0 42px 120px rgba(0,0,0,0.56)';
    panel.style.borderRadius = '26px';
    panel.style.padding = '48px';

    const kicker = document.createElement('div');
    kicker.textContent = 'OHSMS ENTERPRISE TRAINING';
    kicker.style.color = '#ff4b4b';
    kicker.style.fontSize = '13px';
    kicker.style.fontWeight = '800';
    kicker.style.letterSpacing = '0.34em';
    kicker.style.marginBottom = '18px';

    const title = document.createElement('div');
    title.textContent = payload.title;
    title.style.fontSize = 'clamp(44px, 8vw, 86px)';
    title.style.lineHeight = '0.88';
    title.style.fontWeight = '900';
    title.style.letterSpacing = '-0.045em';
    title.style.textTransform = 'uppercase';

    const line = document.createElement('div');
    line.style.height = '3px';
    line.style.width = '100%';
    line.style.background = 'linear-gradient(90deg, #ff3030, #46d7ff, transparent)';
    line.style.transformOrigin = 'left';
    line.style.animation = 'codexTitleLine 900ms ease 240ms both';
    line.style.margin = '26px 0';

    const desc = document.createElement('p');
    desc.textContent = payload.narration;
    desc.style.maxWidth = '760px';
    desc.style.margin = '0';
    desc.style.color = '#cbd6e4';
    desc.style.fontSize = '20px';
    desc.style.lineHeight = '1.55';

    const footer = document.createElement('div');
    footer.textContent = 'Watch the screen movements and follow the numbered guide cards.';
    footer.style.marginTop = '30px';
    footer.style.color = '#46d7ff';
    footer.style.fontSize = '14px';
    footer.style.fontWeight = '800';
    footer.style.letterSpacing = '0.18em';
    footer.style.textTransform = 'uppercase';

    panel.appendChild(kicker);
    panel.appendChild(title);
    panel.appendChild(line);
    panel.appendChild(desc);
    panel.appendChild(footer);
    root.appendChild(panel);
    document.body.appendChild(root);
  }, {
    title: activeScenario.title,
    narration: activeScenario.narration
  });

  await sleep(6500);

  await page.evaluate(() => {
    const existing = document.getElementById('codex-video-title-card');
    if (existing) existing.remove();
  });
};

const runAction = async (page, action) => {
  if (!action) return;

  try {
    if (action.type === 'clickRole') {
      try {
        await page.getByRole(action.role || 'button', { name: new RegExp(`^${action.name}$`, 'i') }).click({ timeout: action.timeoutMs || 8000 });
      } catch {
        await page.locator('button').filter({ hasText: action.name }).first().click({ timeout: action.timeoutMs || 8000 });
      }
    } else if (action.type === 'hoverRole') {
      try {
        await page.getByRole(action.role || 'button', { name: new RegExp(`^${action.name}$`, 'i') }).hover({ timeout: action.timeoutMs || 8000 });
      } catch {
        await page.locator('button').filter({ hasText: action.name }).first().hover({ timeout: action.timeoutMs || 8000 });
      }
    } else if (action.type === 'clickSelector') {
      await page.locator(action.selector).first().click({ timeout: action.timeoutMs || 8000 });
    } else if (action.type === 'hoverSelector') {
      await page.locator(action.selector).first().hover({ timeout: action.timeoutMs || 8000 });
    } else if (action.type === 'scrollTo') {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), action.y || 0);
    } else if (action.type === 'wait') {
      await sleep(action.waitMs || 500);
    }
  } catch (error) {
    console.warn(`Scenario action skipped for ${action.type}: ${error.message}`);
  }
};

const naturalPointerMove = async (page, index = 0) => {
  const viewport = page.viewportSize() || { width: 1600, height: 900 };
  const points = [
    [0.76, 0.24],
    [0.62, 0.58],
    [0.44, 0.36],
    [0.82, 0.72],
    [0.54, 0.78]
  ];
  const [xRatio, yRatio] = points[index % points.length];
  await page.mouse.move(
    Math.round(viewport.width * xRatio),
    Math.round(viewport.height * yRatio),
    { steps: 18 }
  ).catch(() => {});
};

const withTimeout = async (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const gentleScreenMotion = async (page, index = 0) => {
  await naturalPointerMove(page, index);
  const delta = index % 2 === 0 ? 320 : -220;
  await page.mouse.wheel(0, delta).catch(() => {});
  await sleep(520);
};

const buildNarration = (activeScenario) => {
  if (tutorialMode) {
    const stepScript = activeScenario.steps
      .map((step, index) => {
        const bullets = (step.bullets || []).join('. ');
        const opener = index === 0 ? 'First' : index === 1 ? 'Next' : `Step ${index + 1}`;
        return `${opener}, use the ${step.title} area. ${bullets}. Take a moment to check the visible status, filters, buttons, and any record list before moving to the next action. In simple terms, this part of the screen tells you what work is pending, what actions you can take, and what information matters before you click deeper into the module.`;
      })
      .join(' ');

    const plainLanguage = `If you are new to this system, think of the ${activeScenario.title} as one focused workspace for one type of safety job. You do not need technical language to use it well. The main idea is to read what happened, choose the right option, check the status, and then move to the next safe step.`;
    const workflowGuidance = 'A simple day to day method is to start from the dashboard or the right hub, confirm the site, open the module, review the list of records, pick the item you need, and then follow the buttons one step at a time. If something is only for review, stop at the viewing stage. If you have the right permission, continue to the action stage.';
    const interconnection = `This module also connects with other parts of the platform. Information here can influence related actions, records, follow up, or reporting in connected modules. That is why the platform is designed as one joined system instead of many separate tools.`;
    const closeout = 'By following the same simple sequence each time, even a new user can understand what to review, what to update, and when to hand work over to another person or another module.';

    return [
      `Welcome to this step by step tutorial for the ${activeScenario.title}.`,
      activeScenario.narration,
      plainLanguage,
      stepScript,
      workflowGuidance,
      'A good working habit is to confirm the active site, review the current status, open the correct record, and only then perform the action needed for your role.',
      'If you are not the owner of the task, use the screen for review and evidence gathering, then route the action to the correct responsible person.',
      interconnection,
      'This tutorial demonstrates the workflow safely, without deleting records or submitting final live actions.',
      closeout
    ].join(' ');
  }

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
    'The screen now continues moving through the workspace so you can see the available tabs, actions, filters, and record areas without changing live data.',
    'Use the same flow in daily work, then continue only with the action that matches your permission level.'
  ].join(' ');
};

const holdUntilTargetDuration = async (page, activeScenario, startedAt) => {
  let loop = 0;

  while (Date.now() - startedAt < captureDurationMs - 2400) {
    const step = activeScenario.steps[loop % activeScenario.steps.length] || {
      title: 'Feature review',
      bullets: ['Review the visible workspace', 'Check available actions', 'Use filters and tabs to navigate']
    };

    await showGuideOverlay(page, {
      moduleTitle: activeScenario.title,
      stepTitle: `Feature scan: ${step.title}`,
      bullets: step.bullets,
      footer: 'Live screen tour in progress'
    });

    await gentleScreenMotion(page, loop);
    await sleep(Math.min(tutorialMode ? 6200 : 3100, Math.max(900, captureDurationMs - (Date.now() - startedAt) - 2200)));
    loop += 1;
  }
};

const loginMainApp = async (page) => {
  await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: /secure sign in/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
};

const loginFieldPortal = async (page) => {
  await page.goto(new URL('/field-portal', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: /access field portal/i }).click();
  await page.waitForTimeout(2500);
};

const scenarioSlug = sanitizeFileName(scenario.id);
const outputRoot = ensureDir(outputSubdir ? path.join(videoRoot, outputSubdir) : videoRoot);
const rawDir = ensureDir(path.join(rawRoot, scenarioSlug));
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const mp4Output = path.join(outputRoot, `${scenarioSlug}.mp4`);
let audioOutput = path.join(audioDir, tutorialMode ? `${scenarioSlug}.mp3` : `${scenarioSlug}.wav`);
const viewport = tutorialMode ? { width: 1280, height: 720 } : { width: 1366, height: 768 };

const readSessionStorage = async (page) =>
  page.evaluate(() => {
    const state = {};
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      state[key] = sessionStorage.getItem(key);
    }
    return state;
  });

const browser = await chromium.launch({ headless: true });
let browserStorageState = undefined;
let sessionStorageState = {};

if (scenario.mode === 'field' || scenario.mode === 'main') {
  const authContext = await browser.newContext({
    viewport,
    screen: viewport
  });
  const authPage = await authContext.newPage();

  if (scenario.mode === 'field') {
    await loginFieldPortal(authPage);
  } else {
    await loginMainApp(authPage);
  }

  browserStorageState = await authContext.storageState();
  sessionStorageState = await readSessionStorage(authPage);
  if (sessionStorageState.isoSession && !sessionStorageState.fieldPortalSession) {
    sessionStorageState.fieldPortalSession = sessionStorageState.isoSession;
  }
  await authContext.close();
}

const context = await browser.newContext({
  viewport,
  screen: viewport,
  storageState: browserStorageState,
  recordVideo: {
    dir: rawDir,
    size: viewport
  }
});

if (Object.keys(sessionStorageState).length > 0) {
  await context.addInitScript((state) => {
    Object.entries(state || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        sessionStorage.setItem(key, value);
      }
    });
  }, sessionStorageState);
}

const page = await context.newPage();

console.log(`Recording scenario: ${scenario.id}`);

await page.goto(new URL(scenario.route, baseUrl).toString(), { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => !/loading/i.test(document.body.innerText),
  { timeout: 15000 }
).catch(() => {});
await sleep(1800);
await showTutorialTitleCard(page, scenario);

const recordingStartedAt = Date.now();

for (let index = 0; index < scenario.steps.length; index += 1) {
  const step = scenario.steps[index];
  await showGuideOverlay(page, {
    moduleTitle: scenario.title,
    stepTitle: step.title,
    bullets: step.bullets,
    footer: `Step ${index + 1} of ${scenario.steps.length}`
  });
  await naturalPointerMove(page, index);
  await runAction(page, step.action);
  if (!step.action || step.action.type !== 'scrollTo') {
    await gentleScreenMotion(page, index);
  }
  await sleep(tutorialMode ? Math.max(step.waitMs || 0, 6200) : (step.waitMs || 2600));
}

await holdUntilTargetDuration(page, scenario, recordingStartedAt);

await showGuideOverlay(page, {
  moduleTitle: scenario.title,
  stepTitle: 'Module summary',
  bullets: ['This video showed the main areas of the module', 'Use this workspace to review records, act on tasks, and manage safety workflows', 'Open the next module video to continue the guided tour'],
  footer: 'Training walkthrough complete'
});
await sleep(1800);

console.log(`Closing recording context: ${scenario.id}`);
await withTimeout(context.close(), 90000, 'Playwright context close');

console.log(`Closing browser: ${scenario.id}`);
const browserProcess = typeof browser.process === 'function' ? browser.process() : null;
await withTimeout(browser.close(), 10000, 'Playwright browser close').catch((error) => {
  console.warn(error.message);
  if (browserProcess && typeof browserProcess.kill === 'function') {
    browserProcess.kill();
  }
});

const rawVideo = findNewestFile(rawDir);
if (!rawVideo) {
  throw new Error(`No raw video found in ${rawDir}`);
}

console.log(`Synthesizing female narration: ${scenario.id}`);
if (tutorialMode) {
  await withTimeout(
    synthesizeNeuralSpeechToMp3(buildNarration(scenario), audioOutput, {
      voice: process.env.VIDEO_NEURAL_VOICE || 'en-US-JennyNeural',
      rate: process.env.VIDEO_NEURAL_RATE || '-4%'
    }),
    180000,
    'Neural speech synthesis'
  ).catch(async (error) => {
    console.warn(`${error.message}\nFalling back to local Windows female voice.`);
    const fallbackOutput = path.join(audioDir, `${scenarioSlug}.wav`);
    await withTimeout(synthesizeSpeechToWave(buildNarration(scenario), fallbackOutput, { rate: -1 }), 120000, 'Fallback speech synthesis');
    audioOutput = fallbackOutput;
  });
} else {
  await withTimeout(synthesizeSpeechToWave(buildNarration(scenario), audioOutput, { rate: 0 }), 120000, 'Speech synthesis');
}

console.log(`Muxing MP4: ${scenario.id}`);
await withTimeout(
  transcodeToMp4WithAudio(rawVideo, audioOutput, mp4Output, {
    durationSeconds: Math.ceil(finalDurationMs / 1000),
    stopPadSeconds: Math.max(0, Math.ceil((finalDurationMs - captureDurationMs) / 1000))
  }),
  120000,
  'MP4 conversion'
);

console.log(`Created MP4: ${mp4Output}`);
