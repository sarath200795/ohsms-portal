import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import {
  ensureDir,
  sleep,
  synthesizeNeuralSpeechToMp3,
  transcodeToMp4WithAudio
} from './helpers.mjs';

export {
  ensureDir,
  sleep,
  synthesizeNeuralSpeechToMp3,
  transcodeToMp4WithAudio
};

export const resetDirectory = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
  ensureDir(targetPath);
  return targetPath;
};

export const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static is not available.'));
      return;
    }

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

export const getMediaDurationSeconds = async (inputPath) => {
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

export const findLongestPlayableVideo = async (directory) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));

  let bestMatch = null;

  for (const entry of entries) {
    try {
      const durationSeconds = await getMediaDurationSeconds(entry);
      if (!bestMatch || durationSeconds > bestMatch.durationSeconds) {
        bestMatch = { path: entry, durationSeconds };
      }
    } catch {
      // Ignore partial or invalid captures.
    }
  }

  return bestMatch?.path || null;
};

export const transcodeAudioToWav = async (inputPath, outputPath) => {
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

export const renderDelayedAudio = async (inputPath, outputPath, delayMs, totalMs) => {
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

export const mixAudioFiles = async (inputPaths, outputPath, totalMs) => {
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

export const withTimeout = async (promise, timeoutMs, label) => {
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

export const readSessionStorage = async (page) =>
  page.evaluate(() => {
    const state = {};
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      state[key] = sessionStorage.getItem(key);
    }
    return state;
  });

export const readSessionObject = async (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('isoSession') || 'null');
    } catch {
      return null;
    }
  });

export const loginMainApp = async (page, { baseUrl, email, password }) => {
  await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: /secure sign in/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
  await page.waitForTimeout(1200);
};

export const loginFieldPortal = async (page, { baseUrl, email, password, redirectPath = '' }) => {
  const targetUrl = new URL('/field-portal', baseUrl);
  if (redirectPath) {
    targetUrl.searchParams.set('redirect', redirectPath);
  }

  await page.goto(targetUrl.toString(), { waitUntil: 'networkidle' });

  if (await page.getByText(/Field Command/i).count()) {
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: /access field portal/i }).click();
  }

  await page.waitForTimeout(2200);
};

export const loginVendorPortal = async (page, { baseUrl, email, vendorCode }) => {
  const targetUrl = new URL('/vendor-portal', baseUrl);
  await page.goto(targetUrl.toString(), { waitUntil: 'networkidle' });

  if (await page.getByText(/Contractor Portal/i).count()) {
    await page.fill('input[type="email"]', email);
    await page.locator('input').nth(1).fill(vendorCode);
    await page.getByRole('button', { name: /access vendor portal/i }).click();
  }

  await page.waitForTimeout(2200);
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const openDashboardHome = async (page, { baseUrl, site = 'HQ-01' } = {}) => {
  if (!page.url().includes('/dashboard')) {
    await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'networkidle' });
    await page.waitForURL('**/dashboard**', { timeout: 30000 }).catch(() => {});
  }
  const siteSelect = page.locator('select').filter({ hasText: site }).first();
  if (await siteSelect.count()) {
    await siteSelect.selectOption(site).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(900);
};

export const navigateFromDashboard = async (page, {
  baseUrl,
  moduleLabel,
  site = 'HQ-01',
  waitForUrlPattern,
  settleMs = 1400
} = {}) => {
  await openDashboardHome(page, { baseUrl, site });
  const card = page.getByRole('button', { name: new RegExp(escapeRegex(moduleLabel), 'i') }).first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await card.click();
  if (waitForUrlPattern) {
    await page.waitForURL(waitForUrlPattern, { timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(settleMs);
};

export const navigateFromOhsTools = async (page, {
  baseUrl,
  toolLabel,
  site = 'HQ-01',
  waitForUrlPattern,
  settleMs = 1400
} = {}) => {
  await navigateFromDashboard(page, {
    baseUrl,
    moduleLabel: 'OHS Tools',
    site,
    waitForUrlPattern: '**/ohs-tools**',
    settleMs: 1200
  });
  const toolCard = page.getByRole('button', { name: new RegExp(escapeRegex(toolLabel), 'i') }).first();
  await toolCard.waitFor({ state: 'visible', timeout: 30000 });
  await toolCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await toolCard.click();
  if (waitForUrlPattern) {
    await page.waitForURL(waitForUrlPattern, { timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(settleMs);
};

export const showGuideOverlay = async (page, {
  moduleTitle: _moduleTitle,
  stepTitle: _stepTitle,
  bullets: _bullets,
  footer: _footer,
  kicker: _kicker = 'STEP WALKTHROUGH'
}) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-guide')?.remove();
  });
};

export const clearGuideOverlay = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-guide')?.remove();
  });
};

export const showTitleCard = async (page, { title: _title, description: _description, kicker: _kicker = 'OHSMS ENTERPRISE TRAINING' }) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-title-card')?.remove();
  });
};

export const hideTitleCard = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-title-card')?.remove();
  });
};

export const quickFill = async (locator, value) => {
  await locator.click();
  await locator.fill(value);
};

export const naturalPointerMove = async (page, viewport, index = 0) => {
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

export const gentleScan = async (page, viewport, index = 0, delta = 220) => {
  await naturalPointerMove(page, viewport, index);
  await page.mouse.wheel(0, index % 2 === 0 ? delta : -Math.round(delta * 0.5)).catch(() => {});
  await sleep(250);
};

export const renderPdfPagesToImages = async (pdfPath, outputDirectory, maxPages = 2) =>
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

export const injectPdfPreviewOverlay = async (page, imagePaths, { title = 'Generated PDF Preview' } = {}) => {
  const imageData = imagePaths.map((imagePath) => {
    const buffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase() === '.jpg' ? 'jpeg' : 'png';
    return `data:image/${ext};base64,${buffer.toString('base64')}`;
  });

  await page.evaluate((payload) => {
    document.getElementById('codex-pdf-preview')?.remove();

    const root = document.createElement('div');
    root.id = 'codex-pdf-preview';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '999997';
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.gap = '24px';
    root.style.padding = '36px';
    root.style.background = 'rgba(4, 7, 11, 0.82)';
    root.style.backdropFilter = 'blur(10px)';

    const panel = document.createElement('div');
    panel.style.width = 'min(1160px, 100%)';
    panel.style.background = 'linear-gradient(180deg, rgba(14,20,31,0.98), rgba(8,12,19,0.98))';
    panel.style.border = '1px solid rgba(255,255,255,0.12)';
    panel.style.borderRadius = '24px';
    panel.style.padding = '24px';
    panel.style.boxShadow = '0 32px 80px rgba(0,0,0,0.55)';
    panel.style.fontFamily = '"Rajdhani", sans-serif';
    panel.style.color = '#f5f8ff';

    const title = document.createElement('div');
    title.textContent = payload.title;
    title.style.fontSize = '26px';
    title.style.fontWeight = '800';
    title.style.marginBottom = '18px';

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = payload.images.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr';
    grid.style.gap = '18px';

    payload.images.forEach((src, index) => {
      const frame = document.createElement('div');
      frame.style.background = '#ffffff';
      frame.style.borderRadius = '18px';
      frame.style.padding = '12px';
      frame.style.boxShadow = '0 18px 40px rgba(0,0,0,0.22)';

      const label = document.createElement('div');
      label.textContent = `Page ${index + 1}`;
      label.style.fontSize = '12px';
      label.style.fontWeight = '800';
      label.style.letterSpacing = '0.18em';
      label.style.textTransform = 'uppercase';
      label.style.color = '#0f172a';
      label.style.marginBottom = '10px';

      const image = document.createElement('img');
      image.src = src;
      image.style.width = '100%';
      image.style.display = 'block';
      image.style.borderRadius = '10px';

      frame.appendChild(label);
      frame.appendChild(image);
      grid.appendChild(frame);
    });

    panel.appendChild(title);
    panel.appendChild(grid);
    root.appendChild(panel);
    document.body.appendChild(root);
  }, { images: imageData, title });
};

export const clearPdfPreviewOverlay = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-pdf-preview')?.remove();
  });
};

export const signInForDatabaseToken = async ({ apiKey, email, password }) => {
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

export const restGetJson = async ({ databaseUrl, resourcePath, authToken }) => {
  const url = `${databaseUrl}/${resourcePath}.json?auth=${encodeURIComponent(authToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${resourcePath} failed with ${response.status}`);
  }
  return response.json();
};

export const restPostJson = async ({ databaseUrl, resourcePath, authToken, payload }) => {
  const url = `${databaseUrl}/${resourcePath}.json?auth=${encodeURIComponent(authToken)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`POST ${resourcePath} failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
};

export const restPatchJson = async ({ databaseUrl, resourcePath, authToken, payload }) => {
  const url = `${databaseUrl}/${resourcePath}.json?auth=${encodeURIComponent(authToken)}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`PATCH ${resourcePath} failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
};

export const restDeletePath = async ({ databaseUrl, resourcePath, authToken }) => {
  const url = `${databaseUrl}/${resourcePath}.json?auth=${encodeURIComponent(authToken)}`;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`DELETE ${resourcePath} failed with ${response.status}`);
  }
};
