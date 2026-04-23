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
const apiKey = process.env.VIDEO_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '';
const voice = process.env.VIDEO_NEURAL_VOICE || 'en-US-GuyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-8%';
const forcedTotalMs = Number(process.env.VIDEO_FINAL_DURATION_MS || 0);

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

if (!apiKey) {
  throw new Error('VIDEO_FIREBASE_API_KEY, VITE_FIREBASE_API_KEY, or FIREBASE_API_KEY is required.');
}

if (!ffmpegPath) {
  throw new Error('ffmpeg-static is not available.');
}

const scenarioId = 'inspections-module-live-tutorial';
const outputRoot = ensureDir(path.join(videoRoot, 'module-deep-dives'));
const rawDir = path.join(rawRoot, scenarioId);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir = path.join(audioDir, `${scenarioId}-segments`);
const pdfDir = ensureDir(path.join(outputRoot, 'pdf'));
const pdfImageDir = path.join(pdfDir, 'inspections-module-live-tutorial-pages');
const mp4Output = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}.wav`);
const pdfOutput = path.join(pdfDir, `${scenarioId}.pdf`);
const viewport = { width: 1280, height: 720 };

const stamp = Date.now();
const databaseUrl = 'https://ohsms-3894f-default-rtdb.firebaseio.com';
const todayString = new Date().toISOString().split('T')[0];
const demoTitle = `Video Tutorial Demo Inspection ${stamp}`;
const questionOne = `Are forklift forks free from cracks and deformation? ${stamp}`;
const questionTwo = `Current hydraulic pressure reading ${stamp}`;
const questionThree = `Housekeeping notes for the inspection bay ${stamp}`;
const questionFour = `Is the horn and warning beacon fully operational? ${stamp}`;
const inspectionTrainingAction = `Operator training refresher required on daily defect reporting and beacon checks ${stamp}`;

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
    title.textContent = 'Generated Inspection Report PDF';
    title.style.color = '#f8fafc';
    title.style.fontSize = '32px';
    title.style.fontWeight = '800';
    title.style.marginBottom = '14px';

    const sub = document.createElement('div');
    sub.textContent = 'Preview of the exported inspection report pages';
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
    moduleTitle: 'Inspections Module',
    stepTitle: 'Schedule overview',
    bullets: [
      'Start from the inspection schedule',
      'Read the calendar, overdue list, and upcoming items',
      'Open Manage Forms to control live assignments'
    ],
    narration: 'Welcome to the Inspections module. We begin in the schedule view, where assigned inspections appear on their planned dates, overdue items are highlighted, and upcoming inspections are visible for early action.',
    tailMs: 450,
    setup: async (page) => {
      await openDashboardModule(page, 'Inspections');
      await gentleScan(page, 0, 180);
    }
  },
  {
    key: 'manage-forms',
    moduleTitle: 'Inspections Module',
    stepTitle: 'Manage live forms',
    bullets: [
      'Open the form template register',
      'Review assignment windows and status',
      'Create a new inspection form'
    ],
    narration: 'The Manage Forms area is where inspection templates are created and assigned. Assignment dates control when forms appear on the schedule, and the live status controls whether teams can act on them.',
    tailMs: 420,
    setup: async (page) => {
      await page.getByRole('button', { name: /manage forms/i }).click();
      await page.waitForTimeout(1200);
      await gentleScan(page, 1, 140);
    }
  },
  {
    key: 'builder',
    moduleTitle: 'Inspections Module',
    stepTitle: 'Build a live inspection form',
    bullets: [
      'Create a new inspection template',
      'Set title, site, frequency, status, and assignment start date',
      'Add pass fail, number, and text questions'
    ],
    narration: 'In the builder, we create a weekly forklift inspection form, assign it to Headquarters, activate it, set the first scheduled date, and define the checks the inspector must complete in the field.',
    tailMs: 460,
    setup: async (page) => {
      await page.getByRole('button', { name: /create new form/i }).click();
      await page.waitForTimeout(900);
      await quickFill(page.locator('input[placeholder*="Daily Forklift Pre-Use Check"]').first(), demoTitle);
      await quickFill(page.locator('textarea[placeholder*="Instructions for the inspector"]').first(), 'Complete the pre-use inspection before the equipment is released to operations. Any defect with safety impact must be recorded and escalated.');
      await page.locator('select').nth(0).selectOption({ value: 'HQ-01' });
      await page.locator('select').nth(1).selectOption('Weekly');
      await page.locator('select').nth(2).selectOption('Active');
      await page.locator('input[type="date"]').nth(0).fill(todayString);
      await page.getByRole('button', { name: /add manual/i }).click();
      await page.getByRole('button', { name: /add manual/i }).click();
      await page.getByRole('button', { name: /add manual/i }).click();
      await page.getByRole('button', { name: /add manual/i }).click();
      const fieldRows = page.locator('div.group');
      await fieldRows.nth(0).locator('input[placeholder*="Enter check requirement"]').fill(questionOne);
      await fieldRows.nth(1).locator('input[placeholder*="Enter check requirement"]').fill(questionTwo);
      await fieldRows.nth(1).locator('select').selectOption('Number');
      await fieldRows.nth(2).locator('input[placeholder*="Enter check requirement"]').fill(questionThree);
      await fieldRows.nth(2).locator('select').selectOption('Text Input');
      await fieldRows.nth(3).locator('input[placeholder*="Enter check requirement"]').fill(questionFour);
      await fieldRows.nth(3).locator('select').selectOption('Pass/Fail');
      await gentleScan(page, 2, 150);
    }
  },
  {
    key: 'save-template',
    moduleTitle: 'Inspections Module',
    stepTitle: 'Save and schedule the form',
    bullets: [
      'Save the template to the live register',
      'Return to the schedule',
      'Confirm the assignment now appears on the calendar'
    ],
    narration: 'After saving the template, the inspection becomes live because the form is active and assigned from today. The schedule then shows the new inspection on its planned date and builds future dates from the selected frequency.',
    tailMs: 480,
    setup: async (page) => {
      await page.getByRole('button', { name: /save template/i }).click();
      await page.waitForTimeout(2200);
      await page.getByRole('button', { name: /schedule/i }).click();
      await page.waitForTimeout(1400);
      await page.locator(`div[title*="${demoTitle}"]`).first().waitFor({ timeout: 30000 });
      await gentleScan(page, 3, 160);
    }
  },
  {
    key: 'start-inspection',
    moduleTitle: 'Inspections Module',
    stepTitle: 'Launch the assigned inspection',
    bullets: [
      'Open the scheduled inspection from the calendar',
      'Use the live form in execution mode',
      'Prepare the inspection answers and notes'
    ],
    narration: 'From the calendar, the inspector opens the scheduled task and moves into the active inspection screen. This is the field execution view used to answer each question and record any observed defects.',
    tailMs: 420,
    setup: async (page) => {
      await page.locator(`div[title*="${demoTitle}"]`).first().click();
      await page.waitForTimeout(1200);
      await gentleScan(page, 4, 120);
    }
  },
  {
    key: 'complete-form',
    moduleTitle: 'Inspections Module',
    stepTitle: 'Complete the inspection and raise CAPA',
    bullets: [
      'Record pass, number, and text responses',
      'Mark one critical check as failed',
      'Raise a corrective action with notes and due date'
    ],
    narration: 'We now complete the inspection. One check passes, the pressure reading is entered, housekeeping notes are added, and one safety critical item fails. That failed item is documented and converted into a corrective action with a training follow up.',
    tailMs: 520,
    setup: async (page) => {
      await page.locator('text=ACTIVE INSPECTION').first().waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: /sign & submit report/i }).waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: /pass/i }).first().click();
      await page.locator('input[type="number"]').first().fill('186');
      await page.locator('input[placeholder="Enter details..."]').first().fill('Bay floor clean. Wheel chocks and spill kit are in place.');
      await page.getByRole('button', { name: /fail/i }).nth(1).click();
      await page.waitForTimeout(300);
      await page.locator('textarea[placeholder="Describe the issue found..."]').first().fill(`Warning beacon is not flashing consistently during start up test. ${inspectionTrainingAction}.`);
      await page.locator('input[type="checkbox"]').first().check();
      await page.locator('input[type="date"]').last().fill('2026-04-16');
      await gentleScan(page, 5, 120);
    }
  },
  {
    key: 'submit-inspection',
    moduleTitle: 'Inspections Module',
    stepTitle: 'Submit the signed report',
    bullets: [
      'Sign and submit the completed inspection',
      'Return to the schedule after completion',
      'Let the next cycle remain scheduled automatically'
    ],
    narration: 'The completed inspection is then signed and submitted. Once the current occurrence is closed, the schedule moves on to the next planned cycle based on the frequency and assignment start date.',
    tailMs: 460,
    setup: async (page) => {
      await page.getByRole('button', { name: /sign & submit report/i }).click();
      await page.waitForTimeout(2600);
      await gentleScan(page, 6, 140);
    }
  },
  {
    key: 'history',
    moduleTitle: 'Inspections Module',
    stepTitle: 'History and completed logs',
    bullets: [
      'Open the inspection log history',
      'Review the completed record summary',
      'Open the formal inspection report'
    ],
    narration: 'The History tab stores completed inspection reports. From here, supervisors can review who completed the check, when it was signed, how many issues were found, and open the formal record.',
    tailMs: 450,
    setup: async (page) => {
      await page.getByRole('button', { name: /history/i }).click();
      await page.waitForTimeout(1300);
      const historyRow = page.locator('tr', { hasText: demoTitle }).first();
      await historyRow.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await historyRow.getByRole('button').click();
      await page.waitForTimeout(1200);
      await gentleScan(page, 7, 120);
    }
  },
  {
    key: 'pdf-preview',
    moduleTitle: 'Inspections Module',
    stepTitle: 'Generated inspection report PDF',
    bullets: [
      'Open the completed inspection report',
      'Export the report to PDF',
      'Show the generated PDF pages on screen'
    ],
    narration: 'From the completed record, we export the formal inspection report and then preview the generated PDF pages directly on screen so the final document can be checked before sharing.',
    tailMs: 700,
    setup: async (page) => {
      await page.evaluate(() => {
        window.print = () => {};
      });
      await page.locator('text=Inspection Findings').first().waitFor({ timeout: 8000 }).catch(() => {});
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
    stepTitle: 'Inspection CAPA in the central register',
    bullets: [
      'Open the CAPA register',
      'Find the action raised from the inspection finding',
      'Show how inspection actions are centrally tracked'
    ],
    narration: 'The relationship with CAPA is live. The corrective action created inside the inspection now appears in the central CAPA register, where leaders can track ownership, due date, and closure status.',
    tailMs: 460,
    setup: async (page) => {
      await clearPdfPreviewOverlay(page);
      await page.goto(new URL('/capa?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1300);
      const capaText = page.getByText(inspectionTrainingAction).first();
      if (await capaText.count()) {
        await capaText.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      await gentleScan(page, 8, 120);
    }
  },
  {
    key: 'training-link',
    moduleTitle: 'Training Module',
    stepTitle: 'Training follow-up from inspection CAPA',
    bullets: [
      'Open the Training module',
      'Find the training-related inspection CAPA',
      'Launch the linked training session form'
    ],
    narration: 'Because this corrective action includes a training refresher requirement, the same action also appears in the Training module. From there, the training coordinator can launch a linked session directly from the inspection CAPA.',
    tailMs: 520,
    setup: async (page) => {
      await page.goto(new URL('/training?site=HQ-01', baseUrl).toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
      const trainingRow = page.locator('tr', { hasText: inspectionTrainingAction }).first();
      if (await trainingRow.count()) {
        await trainingRow.scrollIntoViewIfNeeded();
        await page.waitForTimeout(350);
        const logSessionButton = trainingRow.getByRole('button', { name: /log session/i });
        if (await logSessionButton.count()) {
          await logSessionButton.click();
          await page.waitForTimeout(900);
        }
      }
      await gentleScan(page, 9, 140);
    }
  },
  {
    key: 'summary',
    moduleTitle: 'Inspection Workflow Summary',
    stepTitle: 'System summary',
    bullets: [
      'Form assigned to schedule and executed',
      'Completed report captured in history and exported to PDF',
      'CAPA and Training follow-up demonstrated from the inspection'
    ],
    narration: 'This is the full inspections workflow. A form is built, assigned into the live schedule, executed by the inspector, stored in history, converted into a formal PDF record, then carried forward into CAPA and Training for action follow up.',
    tailMs: 700,
    setup: async (page) => {
      await gentleScan(page, 10, 120);
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
await page.getByRole('button', { name: /inspections/i }).waitFor({ timeout: 30000 });
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
  const templates = await restGetJson(`organizations/${sessionInfo.orgId}/inspectionTemplates`, cleanupToken);
  const records = await restGetJson(`organizations/${sessionInfo.orgId}/inspectionRecords`, cleanupToken);

  const templateKeys = Object.entries(templates || {})
    .filter(([, value]) => value?.title === demoTitle)
    .map(([key]) => key);
  const recordKeys = Object.entries(records || {})
    .filter(([, value]) => value?.templateTitle === demoTitle)
    .map(([key]) => key);

  for (const key of recordKeys) {
    await restDeletePath(`organizations/${sessionInfo.orgId}/inspectionRecords/${key}`, cleanupToken);
  }
  for (const key of templateKeys) {
    await restDeletePath(`organizations/${sessionInfo.orgId}/inspectionTemplates/${key}`, cleanupToken);
  }
}
await cleanupContext.close();
await browser.close();

console.log(`Created synced tutorial video: ${mp4Output}`);
console.log(`Created inspection PDF: ${pdfOutput}`);
