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
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-GuyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-8%';
const forcedTotalMs = Number(process.env.VIDEO_FINAL_DURATION_MS || 0);

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

if (!ffmpegPath) {
  throw new Error('ffmpeg-static is not available.');
}

const scenarioId = 'incident-module-live-tutorial';
const outputRoot = ensureDir(path.join(videoRoot, 'module-deep-dives'));
const rawDir = path.join(rawRoot, scenarioId);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir = path.join(audioDir, `${scenarioId}-segments`);
const pdfDir = ensureDir(path.join(outputRoot, 'pdf'));
const pdfImageDir = path.join(pdfDir, 'incident-module-live-tutorial-pages');
const mp4Output = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}.wav`);
const pdfOutput = path.join(pdfDir, `${scenarioId}.pdf`);
const viewport = { width: 1280, height: 720 };

const stamp = Date.now();
const demoTitle = `Video Tutorial Demo Incident ${stamp}`;
const trainingAction = `Conduct refresher training on spill response and forklift defect reporting ${stamp}`;

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

const showGuideOverlay = async (page, { moduleTitle, stepTitle, bullets, footer }) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-guide')?.remove();
  });
};

const showTitleCard = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-title-card')?.remove();
  });
};

const hideTitleCard = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-title-card')?.remove();
  });
};

const clearGuideOverlay = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-guide')?.remove();
  });
};

const quickFill = async (locator, value) => {
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
    title.textContent = 'Generated Incident Report PDF';
    title.style.color = '#f8fafc';
    title.style.fontSize = '32px';
    title.style.fontWeight = '800';
    title.style.marginBottom = '14px';

    const sub = document.createElement('div');
    sub.textContent = 'Preview of the exported incident report pages';
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

const buildSegments = () => [
  {
    key: 'intro',
    moduleTitle: 'Incidents Module',
    stepTitle: 'Repository overview',
    bullets: [
      'Start from the incident register',
      'Review records by site, type, severity, and date',
      'Open a new report from the repository'
    ],
    narration: 'Welcome to the Incident module. We begin in the incident repository, which is the central register for reported events. From here, teams can review past incidents, filter the data, and start a new report.',
    tailMs: 500,
    setup: async (page) => {
      await openDashboardModule(page, 'Incidents');
      await gentleScan(page, 0, 180);
    }
  },
  {
    key: 'initial-report',
    moduleTitle: 'Incidents Module',
    stepTitle: 'Initial reporting section',
    bullets: [
      'Capture the title, site, time, and equipment',
      'Record the event narrative and immediate actions',
      'Identify the affected worker'
    ],
    narration: 'This initial reporting section captures the title, site, date, time, equipment involved, the detailed event narrative, the affected person, and the immediate actions taken at the scene.',
    tailMs: 500,
    setup: async (page) => {
      await page.getByRole('button', { name: /new report/i }).click();
      await page.waitForTimeout(700);
      await quickFill(page.locator('input').nth(0), demoTitle);
      await page.locator('select').nth(0).selectOption({ index: 1 });
      await page.locator('input[type="time"]').fill('10:15');
      await quickFill(page.locator('input[placeholder*="Forklift"]'), 'Forklift FL-12');
      await quickFill(
        page.locator('textarea').nth(0),
        'An operator slipped on a hydraulic oil leak from a forklift hose while reversing stock into the loading area. The hose had been reported earlier, the floor became slippery, and the operator twisted his ankle while trying to avoid the spill.'
      );
      await page.locator('input[type="radio"][value="Internal"]').check();
      await page.locator('select').nth(4).selectOption({ index: 1 });
      await quickFill(
        page.locator('textarea').nth(1),
        'The area was isolated, absorbent pads were deployed, first aid assessed the ankle, and the forklift was tagged out for inspection.'
      );
      await gentleScan(page, 1, 180);
    }
  },
  {
    key: 'smart-investigation',
    moduleTitle: 'Incidents Module',
    stepTitle: 'Smart investigation generation',
    bullets: [
      'Trigger the smart RCA generator',
      'Generate starter fishbone, five whys, fault tree, and CAPA',
      'Use the output as the investigation baseline'
    ],
    narration: 'With the narrative in place, the smart investigation feature generates a starter root cause package. It prepares a fishbone structure, five whys logic, a fault tree, and draft CAPA items.',
    tailMs: 500,
    setup: async (page) => {
      await page.getByRole('button', { name: /auto-generate rca matrix/i }).click();
      await page.waitForTimeout(2400);
      await gentleScan(page, 2, 140);
    }
  },
  {
    key: 'team-details',
    moduleTitle: 'Incidents Module',
    stepTitle: 'Team and consultation details',
    bullets: [
      'Record the investigation team',
      'Capture witness and consultation notes',
      'Create the formal review trail'
    ],
    narration: 'In the team and details section, the organization records who took part in the review and what early findings, witness statements, and consultation notes were captured.',
    tailMs: 500,
    setup: async (page) => {
      await page.locator('button').filter({ hasText: '2. Team & Details' }).first().click();
      await page.waitForTimeout(700);
      await page.locator('select').nth(0).selectOption({ index: 1 }).catch(() => {});
      await page.locator('button.bg-teal-600').first().click().catch(() => {});
      await page.waitForTimeout(200);
      await page.locator('input[placeholder="Type Name..."]').fill('External Safety Advisor');
      await page.locator('button.bg-purple-600').first().click().catch(() => {});
      await quickFill(
        page.locator('textarea').first(),
        'The investigation team reviewed witness statements, maintenance complaints, and scene photographs. The focus was on leak reporting, floor control, and refresher competence for equipment checks.'
      );
      await gentleScan(page, 3, 140);
    }
  },
  {
    key: 'analysis',
    moduleTitle: 'Incidents Module',
    stepTitle: 'Root cause analysis workspace',
    bullets: [
      'Review fishbone, fault tree, and five whys',
      'Refine the root cause statement',
      'Turn observations into a defensible conclusion'
    ],
    narration: 'The investigation workspace is the analytical core of the module. Here the team reviews the fishbone factors, fault tree logic, and five whys, then writes the final root cause conclusion.',
    tailMs: 500,
    setup: async (page) => {
      await page.locator('button').filter({ hasText: '3. Investigate' }).first().click();
      await page.waitForTimeout(700);
      await quickFill(
        page.locator('textarea').last(),
        'The root cause was a known forklift hose defect combined with delayed maintenance escalation and insufficient refresher training on spill isolation and defect reporting.'
      );
      await gentleScan(page, 4, 180);
    }
  },
  {
    key: 'capa',
    moduleTitle: 'Incidents Module',
    stepTitle: 'CAPA planning from the incident',
    bullets: [
      'Review the generated actions',
      'Add a training-related corrective action',
      'Set dates and manage the action list'
    ],
    narration: 'After the analysis, the CAPA plan converts the incident into controlled follow-up work. In this walkthrough, we add a refresher training action on spill response and forklift defect reporting.',
    tailMs: 500,
    setup: async (page) => {
      await page.locator('button').filter({ hasText: '4. CAPA' }).first().click();
      await page.waitForTimeout(700);
      await quickFill(page.locator('input[placeholder="Describe action..."]'), trainingAction);
      await page.locator('input[type="date"]').last().fill('2026-04-30');
      await page.locator('button.bg-orange-600').first().click();
      await page.waitForTimeout(900);
      await gentleScan(page, 5, 140);
    }
  },
  {
    key: 'hira-link',
    moduleTitle: 'Incidents Module',
    stepTitle: 'HIRA and risk assessment linkage',
    bullets: [
      'Scan HIRA with incident keywords',
      'Review possible linked hazards',
      'Open the update editor to demonstrate the risk link'
    ],
    narration: 'The review and HIRA step links the incident back to the risk assessment process. The system scans the HIRA database for related hazards, and the investigator can open the update editor to review residual scores and controls.',
    tailMs: 600,
    setup: async (page) => {
      await page.locator('button').filter({ hasText: '5. Review & HIRA' }).first().click();
      await page.waitForTimeout(700);
      await page.getByRole('button', { name: /scan hira database/i }).click();
      await page.waitForTimeout(1600);
      const firstUpdateRisk = page.locator('button').filter({ hasText: 'Update Risk' }).first();
      if (await firstUpdateRisk.count()) {
        await firstUpdateRisk.click();
        await page.waitForTimeout(900);
        await gentleScan(page, 6, 120);
        await page.getByRole('button', { name: /^cancel$/i }).last().click().catch(() => {});
        await page.waitForTimeout(400);
      }
      const closeMatches = page.locator('button:has(i.fa-times)').first();
      if (await closeMatches.count()) {
        await closeMatches.click().catch(() => {});
        await page.waitForTimeout(400);
      }
      await page.locator('div').filter({ hasText: 'Formal Review Confirmation' }).first().click().catch(() => {});
      await gentleScan(page, 7, 140);
    }
  },
  {
    key: 'save-incident',
    moduleTitle: 'Incidents Module',
    stepTitle: 'Save the incident',
    bullets: [
      'Submit the incident',
      'Return to the repository',
      'Keep the new case visible in the live register'
    ],
    narration: 'Once the review is complete, the incident is submitted and returned to the live repository. At that point, the case becomes part of the organization working record.',
    tailMs: 500,
    setup: async (page) => {
      await page.getByRole('button', { name: /save & submit record/i }).click();
      await page.waitForTimeout(3000);
      await gentleScan(page, 8, 140);
    }
  },
  {
    key: 'pdf-preview',
    moduleTitle: 'Incidents Module',
    stepTitle: 'Generated incident report PDF',
    bullets: [
      'Open the submitted incident report',
      'Export the report to PDF',
      'Show the generated PDF pages on screen'
    ],
    narration: 'After submission, we open the incident report, export it to PDF, and then preview the generated PDF pages directly on screen.',
    tailMs: 700,
    setup: async (page) => {
      await page.evaluate(() => {
        window.print = () => {};
      });
      const reportRow = page.locator('tr', { hasText: demoTitle }).first();
      if (await reportRow.count()) {
        await reportRow.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await reportRow.getByRole('button').first().click();
        await page.waitForTimeout(1000);
      }
      await page.locator('text=INCIDENT INVESTIGATION REPORT').first().waitFor({ timeout: 8000 }).catch(() => {});
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
    stepTitle: 'Central action tracking',
    bullets: [
      'Open the CAPA register',
      'Verify the incident action is centrally visible',
      'Show cross-module action control'
    ],
    narration: 'Now we follow the same action into the central CAPA module. This is where leaders and owners can track actions from incidents and other workflows in one place.',
    tailMs: 500,
    setup: async (page) => {
      await clearPdfPreviewOverlay(page);
      await page.goto(new URL('/capa?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const capaText = page.getByText(trainingAction).first();
      if (await capaText.count()) {
        await capaText.scrollIntoViewIfNeeded();
      }
      await gentleScan(page, 9, 120);
    }
  },
  {
    key: 'training-link',
    moduleTitle: 'Training Module',
    stepTitle: 'Training follow-up from incident CAPA',
    bullets: [
      'Open Training dashboard',
      'Find the pending CAPA training action',
      'Launch the linked training session form'
    ],
    narration: 'The training connection is also live. In the Training module, the pending CAPA action appears as a training requirement. When the trainer opens it, the system prepares a linked training session form based on the incident action.',
    tailMs: 600,
    setup: async (page) => {
      await page.goto(new URL('/training?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1300);
      const trainingRow = page.locator('tr', { hasText: trainingAction }).first();
      if (await trainingRow.count()) {
        await trainingRow.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await trainingRow.getByRole('button', { name: /log session/i }).click();
        await page.waitForTimeout(1000);
      }
      await gentleScan(page, 10, 160);
    }
  },
  {
    key: 'summary',
    moduleTitle: 'Incident To Action Flow',
    stepTitle: 'System summary',
    bullets: [
      'Incident reported and investigated',
      'CAPA action created and tracked',
      'Risk review and training follow-up demonstrated'
    ],
    narration: 'This is the business value of the Incident module. It captures the event, structures the investigation, creates CAPA actions, supports risk review through HIRA, and pushes training follow-up into the competence workflow.',
    tailMs: 700,
    setup: async (page) => {
      await gentleScan(page, 11, 120);
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
await page.getByRole('button', { name: /incidents/i }).waitFor({ timeout: 30000 });
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
await cleanupPage.goto(new URL('/incidents?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
await cleanupPage.waitForTimeout(1400);
const cleanupRow = cleanupPage.locator('tr', { hasText: demoTitle }).first();
if (await cleanupRow.count()) {
  await cleanupRow.getByRole('button').last().click();
  await cleanupPage.waitForTimeout(1200);
}
await cleanupContext.close();
await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created incident PDF: ${pdfOutput}`);
