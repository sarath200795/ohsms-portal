import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import {
  ensureDir,
  findNewestFile,
  rawRoot,
  sleep,
  synthesizeNeuralSpeechToMp3,
  transcodeToMp4WithAudio,
  videoRoot
} from './helpers.mjs';

const baseUrl = process.env.VIDEO_BASE_URL || 'http://127.0.0.1:4173';
const email = process.env.VIDEO_EMAIL || '';
const password = process.env.VIDEO_PASSWORD || '';
const apiKey = 'AIzaSyBHqeQN4s9PA5UUDfLtAajVkoRK2BrRjwk';
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-GuyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-8%';
const forcedTotalMs = Number(process.env.VIDEO_FINAL_DURATION_MS || 0);

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

if (!ffmpegPath) {
  throw new Error('ffmpeg-static is not available.');
}

const scenarioId = 'emergency-module-live-tutorial';
const outputRoot = ensureDir(path.join(videoRoot, 'module-deep-dives'));
const rawDir = path.join(rawRoot, scenarioId);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir = path.join(audioDir, `${scenarioId}-segments`);
const pdfDir = ensureDir(path.join(outputRoot, 'pdf'));
const pdfImageDir = path.join(pdfDir, 'emergency-module-live-tutorial-pages');
const mp4Output = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}.wav`);
const pdfOutput = path.join(pdfDir, `${scenarioId}.pdf`);
const viewport = { width: 1280, height: 720 };

const stamp = Date.now();
const databaseUrl = 'https://ohsms-3894f-default-rtdb.firebaseio.com';
const _todayString = new Date().toISOString().split('T')[0];
const demoDocIdPrefix = `VID-DRILL-${stamp}`;
const scenarioTitle = 'Fire Emergency';
const trainingAction = `Emergency evacuation training refresher required for fire team response and headcount discipline ${stamp}`;
const debriefTag = `Emergency drill tutorial reference ${demoDocIdPrefix}`;

const resetDirectory = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
  ensureDir(targetPath);
  return targetPath;
};

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
resetDirectory(pdfImageDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });
fs.rmSync(pdfOutput, { force: true });

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(stderr);
        return;
      }
      reject(new Error(`ffmpeg failed with code ${code}\n${stderr}`));
    });
  });

const getMediaDurationSeconds = async (inputPath) => {
  const output = await new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, ['-i', inputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', () => resolve(stderr));
  });

  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) {
    throw new Error(`Unable to determine media duration for ${inputPath}`);
  }
  const [, hours, minutes, seconds] = match;
  return (Number(hours) * 3600) + (Number(minutes) * 60) + Number(seconds);
};

const transcodeAudioToWav = async (inputPath, outputPath) => {
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-c:a', 'pcm_s16le',
    '-ar', '48000',
    '-ac', '2',
    outputPath
  ]);
  return outputPath;
};

const renderDelayedAudio = async (inputPath, outputPath, delayMs, totalMs) => {
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-filter_complex', `[0:a]adelay=${delayMs}:all=1,apad=pad_dur=${Math.max(totalMs / 1000, 1)}[a]`,
    '-map', '[a]',
    '-t', String(totalMs / 1000),
    '-c:a', 'pcm_s16le',
    '-ar', '48000',
    '-ac', '2',
    outputPath
  ]);
  return outputPath;
};

const mixAudioFiles = async (inputPaths, outputPath, totalMs) => {
  const args = ['-y'];
  inputPaths.forEach((inputPath) => {
    args.push('-i', inputPath);
  });
  const filter = inputPaths.map((_, index) => `[${index}:a]`).join('') + `amix=inputs=${inputPaths.length}:normalize=0:duration=longest[a]`;
  args.push(
    '-filter_complex', filter,
    '-map', '[a]',
    '-t', String(totalMs / 1000),
    '-c:a', 'pcm_s16le',
    '-ar', '48000',
    '-ac', '2',
    outputPath
  );
  await runFfmpeg(args);
  return outputPath;
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

const readSessionStorage = async (page) =>
  page.evaluate(() => {
    const state = {};
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      state[key] = sessionStorage.getItem(key);
    }
    return state;
  });

const readSessionObject = async (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('isoSession') || 'null');
    } catch {
      return null;
    }
  });

const _readAccessToken = async (page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) => entry.startsWith('firebase:authUser:'));
    if (!key) return '';
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed?.stsTokenManager?.accessToken || '';
    } catch {
      return '';
    }
  });

const restGetJson = async (resourcePath, authToken) => {
  const url = `${databaseUrl}/${resourcePath}.json?auth=${encodeURIComponent(authToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${resourcePath} failed with ${response.status}`);
  }
  return response.json();
};

const restDeletePath = async (resourcePath, authToken) => {
  const url = `${databaseUrl}/${resourcePath}.json?auth=${encodeURIComponent(authToken)}`;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`DELETE ${resourcePath} failed with ${response.status}`);
  }
};

const signInForDatabaseToken = async () => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Token sign-in failed: ${JSON.stringify(json)}`);
  }
  return json.idToken;
};

const loginMainApp = async (page) => {
  await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: /secure sign in/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
  await page.waitForTimeout(1200);
};

const openDashboardModule = async (page, moduleLabel, site = 'HQ-01') => {
  if (!page.url().includes('/dashboard')) {
    await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'networkidle' });
  }
  const siteSelect = page.locator('select').filter({ hasText: site }).first();
  if (await siteSelect.count()) {
    await siteSelect.selectOption(site).catch(() => {});
    await page.waitForTimeout(450);
  }
  const moduleButton = page.getByRole('button', { name: new RegExp(moduleLabel, 'i') }).first();
  await moduleButton.waitFor({ state: 'visible', timeout: 30000 });
  await moduleButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await moduleButton.click();
  await page.waitForTimeout(1400);
};

const showGuideOverlay = async (page, { moduleTitle: _moduleTitle, stepTitle: _stepTitle, bullets: _bullets, footer: _footer }) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-guide')?.remove();
  });
};

const _showTitleCard = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-title-card')?.remove();
  });
};

const _hideTitleCard = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-title-card')?.remove();
  });
};

const clearGuideOverlay = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-guide')?.remove();
  });
};

const _quickFill = async (locator, value) => {
  await locator.click();
  await locator.fill(value);
};

const naturalPointerMove = async (page, index = 0) => {
  const points = [
    [0.74, 0.22],
    [0.52, 0.47],
    [0.34, 0.71],
    [0.79, 0.65],
    [0.6, 0.28]
  ];
  const [xRatio, yRatio] = points[index % points.length];
  await page.mouse.move(
    Math.round(viewport.width * xRatio),
    Math.round(viewport.height * yRatio),
    { steps: 10 }
  ).catch(() => {});
};

const gentleScan = async (page, index = 0, delta = 220) => {
  await naturalPointerMove(page, index);
  await page.mouse.wheel(0, index % 2 === 0 ? delta : -Math.round(delta * 0.5)).catch(() => {});
  await sleep(250);
};

const renderPdfPagesToImages = async (pdfPath, outputDirectory, maxPages = 2) =>
  new Promise((resolve, reject) => {
    const script = `
import fitz
import os
import sys

pdf_path = sys.argv[1]
output_dir = sys.argv[2]
max_pages = int(sys.argv[3])
os.makedirs(output_dir, exist_ok=True)
doc = fitz.open(pdf_path)
paths = []
for i in range(min(max_pages, len(doc))):
    page = doc.load_page(i)
    pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
    target = os.path.join(output_dir, f'page-{i+1}.png')
    pix.save(target)
    paths.append(target)
print('\\n'.join(paths))
`;

    const child = spawn('python', ['-c', script, pdfPath, outputDirectory, String(maxPages)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
        return;
      }
      reject(new Error(`PDF page render failed with code ${code}\n${stderr}`));
    });
  });

const injectPdfPreviewOverlay = async (page, imagePaths) => {
  const images = imagePaths.map((imagePath) => `data:image/png;base64,${fs.readFileSync(imagePath).toString('base64')}`);
  await page.evaluate((sources) => {
    document.getElementById('codex-pdf-preview')?.remove();

    const root = document.createElement('div');
    root.id = 'codex-pdf-preview';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '999997';
    root.style.background = 'linear-gradient(180deg, rgba(8,10,14,0.97), rgba(14,17,24,0.98))';
    root.style.padding = '28px';
    root.style.overflow = 'auto';
    root.style.fontFamily = '"Rajdhani", sans-serif';

    const title = document.createElement('div');
    title.textContent = 'Generated Emergency Report PDF';
    title.style.color = '#f8fafc';
    title.style.fontSize = '32px';
    title.style.fontWeight = '800';
    title.style.marginBottom = '14px';

    const sub = document.createElement('div');
    sub.textContent = 'Preview of the exported emergency report pages';
    sub.style.color = '#94a3b8';
    sub.style.fontSize = '15px';
    sub.style.marginBottom = '18px';

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    wrap.style.gap = '18px';

    sources.forEach((src, index) => {
      const card = document.createElement('div');
      card.style.background = '#0f172a';
      card.style.border = '1px solid rgba(148,163,184,0.22)';
      card.style.borderRadius = '18px';
      card.style.padding = '12px';
      card.style.boxShadow = '0 24px 48px rgba(0,0,0,0.35)';

      const label = document.createElement('div');
      label.textContent = `Page ${index + 1}`;
      label.style.color = '#46d7ff';
      label.style.fontSize = '13px';
      label.style.fontWeight = '800';
      label.style.letterSpacing = '0.16em';
      label.style.textTransform = 'uppercase';
      label.style.marginBottom = '10px';

      const img = document.createElement('img');
      img.src = src;
      img.style.width = '100%';
      img.style.borderRadius = '12px';
      img.style.display = 'block';
      img.style.background = 'white';

      card.appendChild(label);
      card.appendChild(img);
      wrap.appendChild(card);
    });

    root.appendChild(title);
    root.appendChild(sub);
    root.appendChild(wrap);
    document.body.appendChild(root);
  }, images);
};

const clearPdfPreviewOverlay = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-pdf-preview')?.remove();
  });
};

const getRecentEmergencyRow = (page) =>
  page.locator('table tbody tr').filter({ hasText: scenarioTitle }).first();

const selectOptionByLabelFragment = async (locator, fragment) => {
  const options = await locator.locator('option').allTextContents();
  const normalizedFragment = fragment.trim().toLowerCase();
  const match = options.find((option) => option.trim().toLowerCase().includes(normalizedFragment) && !option.toLowerCase().includes('select'));
  if (!match) {
    throw new Error(`Unable to find option containing "${fragment}"`);
  }
  await locator.selectOption({ label: match.trim() });
};

const buildSegments = () => [
  {
    key: 'intro',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Scenario dashboard overview',
    bullets: [
      'Start from the emergency coordinator home screen',
      'Review scenario cards and recent response logs',
      'Launch a fire drill workflow'
    ],
    narration: 'Welcome to the Emergency module. We begin on the coordinator dashboard, where emergency scenarios are launched and all previous drill or real emergency reports can be reviewed from one place.',
    tailMs: 450,
    setup: async (page) => {
      await openDashboardModule(page, 'Record Emergency');
      await gentleScan(page, 0, 180);
    }
  },
  {
    key: 'scenario-launch',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Initiate the emergency protocol',
    bullets: [
      'Open the Fire Emergency scenario',
      'Show mock drill versus real emergency modes',
      'Enter site, commander, and response timings'
    ],
    narration: 'Here we launch the Fire Emergency protocol. The module supports both mock drills and real emergencies, then captures the site, commander, date, time, evacuation timing, and emergency response timing.',
    tailMs: 440,
    setup: async (page) => {
      await page.getByText(scenarioTitle).first().click();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /real emergency/i }).click();
      await page.waitForTimeout(350);
      await page.getByRole('button', { name: /mock drill/i }).click();
      await page.waitForTimeout(350);
      await page.locator('select').nth(1).selectOption({ value: 'HQ-01' });
      await selectOptionByLabelFragment(page.locator('select').nth(2), 'EX');
      await page.locator('input[type="number"]').nth(0).fill('3');
      await page.locator('input[type="number"]').nth(1).fill('5');
      await gentleScan(page, 1, 120);
    }
  },
  {
    key: 'teams-and-checklist',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Emergency teams and checklist execution',
    bullets: [
      'Mark the teams that were activated',
      'Complete the procedural checklist',
      'Show protocol integrity moving in real time'
    ],
    narration: 'The next section confirms which emergency teams were activated and which procedural steps were completed. This gives the coordinator a live integrity check of how well the drill followed the planned response.',
    tailMs: 460,
    setup: async (page) => {
      for (const team of ['Transportation Team', 'Spill Response Team', 'Fire Fighting Team', 'Evacuation Team', 'Medical Emergency Team', 'Security', 'Public Relation']) {
        await page.getByText(team, { exact: false }).click();
        await page.waitForTimeout(80);
      }
      for (const step of ['Activate manual call point / sound alarm.', 'Evacuate via nearest safe exit.', 'Check doors for heat before opening.', 'Stay low if smoke is present.', 'Proceed to Assembly Point.', 'Perform head count/roll call.']) {
        await page.getByText(step, { exact: false }).click();
        await page.waitForTimeout(70);
      }
      await gentleScan(page, 2, 150);
    }
  },
  {
    key: 'action-log',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Chronological action log',
    bullets: [
      'Capture the sequence of actions',
      'Record observations against each timestamp',
      'Create a usable response timeline'
    ],
    narration: 'The action log turns the event into a minute by minute timeline. That makes it much easier to reconstruct the response, identify delays, and support the post event debrief.',
    tailMs: 420,
    setup: async (page) => {
      const timeInputs = page.locator('input[type="time"]');
      await timeInputs.nth(1).fill('10:02');
      const logTextInputs = page.locator('input[placeholder="Describe the event..."]');
      await logTextInputs.first().fill('Alarm activated and evacuation call issued across the warehouse.');
      const noteInputs = page.locator('input[placeholder="Notes..."]');
      await noteInputs.first().fill('Personnel moved promptly toward the assembly point.');
      await page.getByRole('button', { name: /add entry/i }).click();
      await page.waitForTimeout(200);
      await timeInputs.nth(2).fill('10:05');
      await logTextInputs.nth(1).fill('Roll call completed and one delayed response identified.');
      await noteInputs.nth(1).fill('Delayed response traced to beacon confusion at bay three.');
      await gentleScan(page, 3, 120);
    }
  },
  {
    key: 'debrief-and-capa',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Debrief and CAPA planning',
    bullets: [
      'Record headcount and debrief notes',
      'Add a corrective action from the drill',
      'Use a training-related action so Training picks it up'
    ],
    narration: 'After the drill, the coordinator records the headcount and debrief notes, then raises a corrective action. In this walkthrough, that action includes a training refresher requirement so it can flow into the Training module as well.',
    tailMs: 520,
    setup: async (page) => {
      await page.locator('input[placeholder*="e.g. 45"]').fill('47');
      await page.locator('textarea[placeholder*="Record observations"]').fill(`Evacuation completed within target, but the beacon and voice instruction sequence needs better reinforcement for bay three operators. ${debriefTag}`);
      await page.getByRole('button', { name: /add action/i }).click();
      await page.waitForTimeout(250);
      await page.locator('input[placeholder="Action Description..."]').fill(trainingAction);
      await selectOptionByLabelFragment(page.locator('select').last(), 'EX');
      await page.locator('input[type="date"]').last().fill('2026-04-20');
      await gentleScan(page, 4, 130);
    }
  },
  {
    key: 'submit-report',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Submit the final emergency report',
    bullets: [
      'Submit the completed drill report',
      'Return to the response log register',
      'Keep the new report visible in recent logs'
    ],
    narration: 'Once the event record is complete, the final report is submitted and stored in the emergency log register. That creates the formal record for audit, review, and follow-up action tracking.',
    tailMs: 450,
    setup: async (page) => {
      await page.getByRole('button', { name: /submit final report/i }).click();
      await getRecentEmergencyRow(page).waitFor({ timeout: 15000 });
      await page.waitForTimeout(1100);
      await gentleScan(page, 5, 140);
    }
  },
  {
    key: 'history',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Recent emergency logs',
    bullets: [
      'Review the new emergency record in history',
      'Show score and CAPA count in the register',
      'Open the printable report from the log table'
    ],
    narration: 'The recent log table shows the completed emergency report with its scenario, date, commander, protocol score, and CAPA count. From here, the coordinator can open the formal printable record.',
    tailMs: 460,
    setup: async (page) => {
      const row = getRecentEmergencyRow(page);
      if (await row.count()) {
        await row.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      await gentleScan(page, 6, 110);
    }
  },
  {
    key: 'pdf-preview',
    moduleTitle: 'Emergency Module',
    stepTitle: 'Generated emergency report PDF',
    bullets: [
      'Open the completed emergency report',
      'Export the report to PDF',
      'Show the generated PDF pages on screen'
    ],
    narration: 'From the recent log, we open the formal emergency report, export it to PDF, and then display the generated PDF pages directly on screen for review.',
    tailMs: 700,
    setup: async (page) => {
      await page.evaluate(() => {
        window.print = () => {};
      });
      const row = getRecentEmergencyRow(page);
      if (await row.count()) {
        await row.getByRole('button').first().click();
        await page.waitForTimeout(1200);
      }
      await page.locator('text=Chronological Action Log').first().waitFor({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(450);
      await clearGuideOverlay(page);
      await page.pdf({
        path: pdfOutput,
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' }
      });
      const imagePaths = await renderPdfPagesToImages(pdfOutput, pdfImageDir, 2);
      await injectPdfPreviewOverlay(page, imagePaths);
      await page.waitForTimeout(350);
    }
  },
  {
    key: 'capa-central',
    moduleTitle: 'CAPA Module',
    stepTitle: 'Emergency CAPA in the central register',
    bullets: [
      'Open the CAPA register',
      'Find the action raised from the emergency drill',
      'Show centralized follow-up from the drill record'
    ],
    narration: 'The emergency module also connects directly to CAPA. The action raised in the drill now appears in the central CAPA register, where owners can manage progress and closeout.',
    tailMs: 460,
    setup: async (page) => {
      await clearPdfPreviewOverlay(page);
      await page.goto(new URL('/capa?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1300);
      const capaText = page.getByText(trainingAction).first();
      if (await capaText.count()) {
        await capaText.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      await gentleScan(page, 7, 120);
    }
  },
  {
    key: 'training-link',
    moduleTitle: 'Training Module',
    stepTitle: 'Training follow-up from emergency CAPA',
    bullets: [
      'Open the Training module',
      'Find the training-related emergency CAPA',
      'Launch the linked training session form'
    ],
    narration: 'Because the drill CAPA includes a training refresher, the same action is also available in the Training module. The coordinator can open it and launch a linked session directly from that CAPA item.',
    tailMs: 520,
    setup: async (page) => {
      await page.goto(new URL('/training?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
      const trainingRow = page.locator('tr', { hasText: trainingAction }).first();
      if (await trainingRow.count()) {
        await trainingRow.scrollIntoViewIfNeeded();
        await page.waitForTimeout(350);
        const logSessionButton = trainingRow.getByRole('button', { name: /log session/i });
        if (await logSessionButton.count()) {
          await logSessionButton.click();
          await page.waitForTimeout(900);
        }
      }
      await gentleScan(page, 8, 140);
    }
  },
  {
    key: 'summary',
    moduleTitle: 'Emergency Workflow Summary',
    stepTitle: 'System summary',
    bullets: [
      'Emergency drill initiated and documented',
      'Formal report exported to PDF',
      'CAPA and Training follow-up demonstrated from the drill'
    ],
    narration: 'This is the full Emergency module workflow. A drill is initiated, documented, debriefed, converted into a formal report, and then carried into CAPA and Training for operational follow-up.',
    tailMs: 700,
    setup: async (page) => {
      await gentleScan(page, 9, 120);
    }
  }
];

const segments = buildSegments();

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  segment.rawAudioPath = path.join(segmentAudioDir, `${String(index + 1).padStart(2, '0')}-${segment.key}.mp3`);
  segment.rawAudioWavPath = path.join(segmentAudioDir, `${String(index + 1).padStart(2, '0')}-${segment.key}.wav`);
  await withTimeout(
    synthesizeNeuralSpeechToMp3(segment.narration, segment.rawAudioPath, {
      voice,
      rate: voiceRate
    }),
    180000,
    `Narration synthesis for ${segment.key}`
  );
  await transcodeAudioToWav(segment.rawAudioPath, segment.rawAudioWavPath);
  segment.audioDurationMs = Math.ceil((await getMediaDurationSeconds(segment.rawAudioWavPath)) * 1000);
}

const browser = await chromium.launch({ headless: true });
const recordingContext = await browser.newContext({
  viewport,
  screen: viewport,
  recordVideo: {
    dir: rawDir,
    size: viewport
  }
});

console.log(`Recording ${scenarioId} with screen-anchored sync...`);

const authPage = await recordingContext.newPage();
authPage.on('dialog', async (dialog) => {
  await dialog.accept();
});
await loginMainApp(authPage);
const sessionStorageState = await readSessionStorage(authPage);
const sessionInfo = await readSessionObject(authPage);
await authPage.close();

const page = await recordingContext.newPage();
page.on('dialog', async (dialog) => {
  await dialog.accept();
});
await page.addInitScript((state) => {
  Object.entries(state || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      sessionStorage.setItem(key, value);
    }
  });
}, sessionStorageState);
const recordingStart = Date.now();
await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /record emergency/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  await segment.setup(page, index);
  await showGuideOverlay(page, {
    moduleTitle: segment.moduleTitle,
    stepTitle: segment.stepTitle,
    bullets: segment.bullets,
    footer: `Step ${index + 1}`
  });
  await page.waitForTimeout(220);
  segment.audioStartMs = Date.now() - recordingStart;
  await sleep(segment.audioDurationMs + segment.tailMs);
}

const finalDurationMs = Math.ceil(Math.max(
  forcedTotalMs,
  ...segments.map((segment) => segment.audioStartMs + segment.audioDurationMs + segment.tailMs + 120)
));

await withTimeout(recordingContext.close(), 90000, 'Recording context close');

const rawVideo = findNewestFile(rawDir);
if (!rawVideo) {
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

const cleanupContext = await browser.newContext({
  viewport,
  screen: viewport
});
const cleanupPage = await cleanupContext.newPage();
cleanupPage.on('dialog', async (dialog) => {
  await dialog.accept();
});
await loginMainApp(cleanupPage);
const cleanupToken = await signInForDatabaseToken();
if (cleanupToken && sessionInfo?.orgId) {
  const drillRecords = await restGetJson(`organizations/${sessionInfo.orgId}/mockDrills`, cleanupToken);

  const recordKeys = Object.entries(drillRecords || {})
    .filter(([, value]) => {
      const capaItems = Array.isArray(value?.capa) ? value.capa : Object.values(value?.capa || {});
      return (
        typeof value?.debrief === 'string' && value.debrief.includes(demoDocIdPrefix)
      ) || capaItems.some((item) => typeof item?.action === 'string' && item.action.includes(trainingAction));
    })
    .map(([key]) => key);

  for (const key of recordKeys) {
    await restDeletePath(`organizations/${sessionInfo.orgId}/mockDrills/${key}`, cleanupToken);
  }
}
await cleanupContext.close();
await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created emergency PDF: ${pdfOutput}`);
