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
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-3%';
const vendorPortalEmail = process.env.VIDEO_VENDOR_EMAIL || '';
const vendorPortalCode = process.env.VIDEO_VENDOR_CODE || '';
const forcedTotalMs = Number(process.env.VIDEO_FINAL_DURATION_MS || 0);

if (!email || !password) {
  throw new Error('VIDEO_EMAIL and VIDEO_PASSWORD are required.');
}

if (!ffmpegPath) {
  throw new Error('ffmpeg-static is not available.');
}

const scenarioId = 'ohsms-enterprise-intro-promo';
const outputRoot = ensureDir(path.join(videoRoot, 'intro'));
const rawDir = path.join(rawRoot, scenarioId);
const audioDir = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir = path.join(audioDir, `${scenarioId}-segments`);
const screenshotDir = path.join(outputRoot, 'stills', scenarioId);
const reportPreviewDir = path.join(outputRoot, 'report-previews', scenarioId);
const mp4Output = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}.wav`);
const viewport = { width: 1280, height: 720 };

const resetDirectory = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
  ensureDir(targetPath);
  return targetPath;
};

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
resetDirectory(screenshotDir);
resetDirectory(reportPreviewDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });

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
  await page.waitForTimeout(1400);
};

const showGuideOverlay = async (page, { moduleTitle, stepTitle, bullets, footer }) => {
  await page.evaluate((payload) => {
    document.getElementById('codex-video-guide')?.remove();

    const root = document.createElement('div');
    root.id = 'codex-video-guide';
    root.style.position = 'fixed';
    root.style.top = '18px';
    root.style.left = '18px';
    root.style.width = '420px';
    root.style.maxWidth = 'calc(100vw - 36px)';
    root.style.zIndex = '999999';
    root.style.padding = '18px 20px';
    root.style.borderRadius = '18px';
    root.style.border = '1px solid rgba(70, 215, 255, 0.28)';
    root.style.background = 'linear-gradient(180deg, rgba(7, 10, 14, 0.95) 0%, rgba(10, 15, 20, 0.97) 100%)';
    root.style.boxShadow = '0 24px 48px -28px rgba(0,0,0,0.9)';
    root.style.color = '#edf4ff';
    root.style.fontFamily = '"Rajdhani", sans-serif';
    root.style.pointerEvents = 'none';

    const kicker = document.createElement('div');
    kicker.textContent = 'WHY TEAMS MOVE TO ONE EHS SYSTEM';
    kicker.style.fontSize = '11px';
    kicker.style.fontWeight = '700';
    kicker.style.letterSpacing = '0.28em';
    kicker.style.color = '#46d7ff';
    kicker.style.marginBottom = '8px';

    const title = document.createElement('div');
    title.textContent = payload.moduleTitle;
    title.style.fontSize = '28px';
    title.style.fontWeight = '800';
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
  }, { moduleTitle, stepTitle, bullets, footer });
};

const clearGuideOverlay = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-guide')?.remove();
  });
};

const showHeroCard = async (page, { kicker, title, description, footer }) => {
  await page.evaluate((payload) => {
    document.getElementById('codex-video-hero')?.remove();

    const root = document.createElement('div');
    root.id = 'codex-video-hero';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '999998';
    root.style.display = 'grid';
    root.style.placeItems = 'center';
    root.style.padding = '48px';
    root.style.background = 'radial-gradient(circle at 25% 18%, rgba(255,75,75,0.22), transparent 28%), radial-gradient(circle at 76% 70%, rgba(70,215,255,0.18), transparent 30%), linear-gradient(135deg, rgba(4,7,11,0.97), rgba(10,14,22,0.95))';
    root.style.color = '#f5f8ff';
    root.style.fontFamily = '"Rajdhani", sans-serif';
    root.style.pointerEvents = 'none';

    const panel = document.createElement('div');
    panel.style.width = 'min(980px, 100%)';
    panel.style.border = '1px solid rgba(255,255,255,0.12)';
    panel.style.background = 'linear-gradient(180deg, rgba(14,20,31,0.96), rgba(8,12,19,0.98))';
    panel.style.boxShadow = '0 42px 120px rgba(0,0,0,0.56)';
    panel.style.borderRadius = '26px';
    panel.style.padding = '48px';

    const kicker = document.createElement('div');
    kicker.textContent = payload.kicker;
    kicker.style.color = '#ff4b4b';
    kicker.style.fontSize = '13px';
    kicker.style.fontWeight = '800';
    kicker.style.letterSpacing = '0.34em';
    kicker.style.marginBottom = '18px';

    const title = document.createElement('div');
    title.textContent = payload.title;
    title.style.fontSize = 'clamp(44px, 8vw, 82px)';
    title.style.lineHeight = '0.9';
    title.style.fontWeight = '900';
    title.style.letterSpacing = '-0.045em';
    title.style.textTransform = 'uppercase';

    const line = document.createElement('div');
    line.style.height = '3px';
    line.style.width = '100%';
    line.style.background = 'linear-gradient(90deg, #ff3030, #46d7ff, transparent)';
    line.style.margin = '26px 0';

    const desc = document.createElement('p');
    desc.textContent = payload.description;
    desc.style.maxWidth = '760px';
    desc.style.margin = '0';
    desc.style.color = '#cbd6e4';
    desc.style.fontSize = '20px';
    desc.style.lineHeight = '1.55';

    const footer = document.createElement('div');
    footer.textContent = payload.footer;
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
  }, { kicker, title, description, footer });
};

const hideHeroCard = async (page) => {
  await page.evaluate(() => {
    document.getElementById('codex-video-hero')?.remove();
  });
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

const injectImageGalleryOverlay = async (page, { overlayId, title, subtitle, cards, columns = 3 }) => {
  const encodedCards = cards.map((card) => ({
    title: card.title,
    src: `data:image/png;base64,${fs.readFileSync(card.path).toString('base64')}`
  }));

  await page.evaluate((payload) => {
    document.getElementById(payload.overlayId)?.remove();

    const root = document.createElement('div');
    root.id = payload.overlayId;
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '999997';
    root.style.background = 'linear-gradient(180deg, rgba(8,10,14,0.94), rgba(12,16,24,0.96))';
    root.style.padding = '22px 26px';
    root.style.fontFamily = '"Rajdhani", sans-serif';
    root.style.pointerEvents = 'none';

    const heading = document.createElement('div');
    heading.textContent = payload.title;
    heading.style.color = '#f8fafc';
    heading.style.fontSize = '32px';
    heading.style.fontWeight = '800';
    heading.style.marginBottom = '8px';

    const sub = document.createElement('div');
    sub.textContent = payload.subtitle;
    sub.style.color = '#94a3b8';
    sub.style.fontSize = '15px';
    sub.style.marginBottom = '18px';

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = `repeat(${payload.columns}, minmax(0, 1fr))`;
    wrap.style.gap = '16px';

    payload.cards.forEach((card) => {
      const tile = document.createElement('div');
      tile.style.background = '#0f172a';
      tile.style.border = '1px solid rgba(148,163,184,0.22)';
      tile.style.borderRadius = '18px';
      tile.style.padding = '10px';
      tile.style.boxShadow = '0 20px 44px rgba(0,0,0,0.35)';

      const label = document.createElement('div');
      label.textContent = card.title;
      label.style.color = '#46d7ff';
      label.style.fontSize = '13px';
      label.style.fontWeight = '800';
      label.style.letterSpacing = '0.14em';
      label.style.textTransform = 'uppercase';
      label.style.marginBottom = '10px';

      const img = document.createElement('img');
      img.src = card.src;
      img.style.width = '100%';
      img.style.height = '188px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '12px';
      img.style.display = 'block';
      img.style.background = '#020617';

      tile.appendChild(label);
      tile.appendChild(img);
      wrap.appendChild(tile);
    });

    root.appendChild(heading);
    root.appendChild(sub);
    root.appendChild(wrap);
    document.body.appendChild(root);
  }, { overlayId, title, subtitle, cards: encodedCards, columns });
};

const clearOverlayById = async (page, overlayId) => {
  await page.evaluate((id) => {
    document.getElementById(id)?.remove();
  }, overlayId);
};

const waitForRouteText = async (page, textOrRegex, extraMs = 1400) => {
  if (textOrRegex) {
    await page.getByText(textOrRegex).first().waitFor({ timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(extraMs);
};

const captureRouteScreenshot = async (page, route, waitText, outputPath) => {
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await waitForRouteText(page, waitText, 2200);
  await page.screenshot({ path: outputPath, fullPage: false });
  return outputPath;
};

const moduleShotPaths = {};
const reportImageCards = [];
const portalShotPaths = {};

const segments = [
  {
    key: 'hook',
    moduleTitle: 'OHSMS Enterprise',
    stepTitle: 'From paper safety to live digital control',
    bullets: [
      'Replace spreadsheets, email chains, and manual follow-up',
      'Give leaders one real-time safety operating system',
      'Start with the same employee login your teams already use'
    ],
    narration: 'If your company is still managing safety through paper files, scattered spreadsheets, and long email chains, this is what a modern EHS platform looks like. One system. One live record. One place to run safety across the business.',
    tailMs: 180,
    showGuide: false,
    setup: async (page) => {
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle' });
      await showHeroCard(page, {
        kicker: 'INTRO VIDEO',
        title: 'Stop Managing Safety In Fragments',
        description: 'See how one connected EHS platform replaces manual follow-up, spreadsheet tracking, and disconnected records.',
        footer: 'Built For Companies With No Existing EHS Software'
      });
      await gentleScan(page, 0, 120);
    },
    after: async (page) => {
      await hideHeroCard(page);
    }
  },
  {
    key: 'dashboard',
    moduleTitle: 'Executive Safety Dashboard',
    stepTitle: 'A single command view for the whole organization',
    bullets: [
      'See incidents, inspections, actions, and module access in one place',
      'Open live workspaces with site context already applied',
      'Give leaders immediate visibility instead of waiting for reports'
    ],
    narration: 'After login, leadership lands on a command dashboard instead of a folder structure. From here, teams can report incidents, start inspections, open tools, and move into live modules with the right site context already in place.',
    tailMs: 180,
    setup: async (page) => {
      await loginMainApp(page);
      await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /Command Deck/i, 1400);
      await gentleScan(page, 1, 180);
    }
  },
  {
    key: 'modules',
    moduleTitle: 'Integrated Module Stack',
    stepTitle: 'Core EHS functions in one connected platform',
    bullets: [
      'Incidents, risk, inspections, CAPA, training, and emergency readiness',
      'Permits, lockout, and specialty tools from the same ecosystem',
      'No duplicate entry across separate applications'
    ],
    narration: 'This platform is not a single register pretending to be software. It combines incident reporting, risk assessment, inspections, corrective actions, training, emergency readiness, permits, and lockout in one connected system.',
    tailMs: 260,
    setup: async (page) => {
      await page.goto(new URL('/ohs-tools', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /OHS Tools/i, 1300);
      await injectImageGalleryOverlay(page, {
        overlayId: 'codex-modules-gallery',
        title: 'Live Module Snapshot',
        subtitle: 'A few of the connected workspaces teams can open from one platform',
        columns: 3,
        cards: [
          { title: 'Incidents', path: moduleShotPaths.incidents },
          { title: 'Risk', path: moduleShotPaths.risk },
          { title: 'Inspections', path: moduleShotPaths.inspections },
          { title: 'CAPA', path: moduleShotPaths.capa },
          { title: 'Training', path: moduleShotPaths.training },
          { title: 'Emergency', path: moduleShotPaths.emergencyEquipment }
        ]
      });
    },
    after: async (page) => {
      await clearOverlayById(page, 'codex-modules-gallery');
    }
  },
  {
    key: 'incidents',
    moduleTitle: 'Incident Reporting',
    stepTitle: 'Raise events fast and drive action from the same record',
    bullets: [
      'Capture the event, people involved, and evidence in one form',
      'Use smart investigation tools and root-cause structures',
      'Turn findings into corrective actions and training follow-up'
    ],
    narration: 'When something goes wrong, teams do not need to open separate tools for the report, the investigation, and the follow-up. The incident workspace brings the event record, investigation logic, CAPA, and training linkage into one flow.',
    tailMs: 180,
    setup: async (page) => {
      await page.goto(new URL('/incidents?site=HQ-01', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /Incident Repository/i, 1300);
      await page.getByRole('button', { name: /new report/i }).click().catch(() => {});
      await page.waitForTimeout(450);
      const titleInput = page.locator('input[placeholder*="e.g."]').first();
      if (await titleInput.count()) {
        await titleInput.fill('Forklift near miss beside loading bay');
      }
      const descriptionBox = page.locator('textarea').first();
      if (await descriptionBox.count()) {
        await descriptionBox.fill('A forklift reversed into a marked walkway and the operator stopped before contact. The report captures the event quickly and can drive smart investigation and follow-up actions.');
      }
      await gentleScan(page, 2, 160);
    }
  },
  {
    key: 'followup',
    moduleTitle: 'Inspections, CAPA, and Training',
    stepTitle: 'Operational work closes the loop',
    bullets: [
      'Run schedules and inspections from live site calendars',
      'Track corrective actions centrally instead of chasing email',
      'Launch training directly from competency gaps and CAPA triggers'
    ],
    narration: 'The same platform also handles the work that prevents repeat failures. Inspections run on live schedules, actions move into a central CAPA register, and training can be launched directly when skills or awareness need to be reinforced.',
    tailMs: 200,
    setup: async (page) => {
      await page.goto(new URL('/training?site=HQ-01', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /Training & Competence/i, 1300);
      await gentleScan(page, 3, 180);
    }
  },
  {
    key: 'reports',
    moduleTitle: 'Report Generation',
    stepTitle: 'Formal records are ready when clients, auditors, or leaders ask',
    bullets: [
      'Generate structured reports instead of building them manually',
      'Show evidence trails from incidents, inspections, and emergency drills',
      'Keep professional records ready for audit and management review'
    ],
    narration: 'Companies without software often lose time rebuilding reports after the work is already done. Here, the system produces formal records directly from the live data, so incident reports, inspection reports, and emergency reports are always ready when someone asks for proof.',
    tailMs: 260,
    setup: async (page) => {
      await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /Command Deck/i, 1100);
      await injectImageGalleryOverlay(page, {
        overlayId: 'codex-report-gallery',
        title: 'Generated Report Examples',
        subtitle: 'Live records can be turned into formal, printable report packs',
        columns: 3,
        cards: reportImageCards
      });
    },
    after: async (page) => {
      await clearOverlayById(page, 'codex-report-gallery');
    }
  },
  {
    key: 'access',
    moduleTitle: 'Access Beyond The Office',
    stepTitle: 'Field teams and contractors can work from dedicated entry points',
    bullets: [
      'Separate field portal for execution teams and mobile users',
      'Vendor portal access for contractor-facing workflows',
      'Same system, controlled access, fewer handover delays'
    ],
    narration: 'The platform is not limited to office users. Field teams can work through a separate field portal, and contractors can be brought in through controlled access points, so the same safety system reaches the people who actually need to act.',
    tailMs: 240,
    setup: async (page) => {
      await page.goto(new URL('/field-portal', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /Field Portal/i, 1300);
      await injectImageGalleryOverlay(page, {
        overlayId: 'codex-access-gallery',
        title: 'Separate Access Channels',
        subtitle: 'Dedicated entry points keep field and contractor workflows simple',
        columns: 2,
        cards: [
          { title: 'Field Portal Login', path: portalShotPaths.fieldPortalPublic },
          { title: 'Field Portal Workspace', path: portalShotPaths.fieldPortalHome },
          { title: 'Vendor Portal Entry', path: portalShotPaths.vendorPortalPublic },
          { title: 'Vendor Portal Workspace', path: portalShotPaths.vendorPortalHome || portalShotPaths.vendorPortalFocus }
        ]
      });
    },
    after: async (page) => {
      await clearOverlayById(page, 'codex-access-gallery');
    }
  },
  {
    key: 'close',
    moduleTitle: 'Why Companies Switch',
    stepTitle: 'Move from manual safety administration to live digital control',
    bullets: [
      'One platform instead of disconnected registers',
      'Faster reporting, clearer accountability, stronger evidence',
      'An easier starting point for companies with no EHS software today'
    ],
    narration: 'If your company has no EHS software today, this is the upgrade path. One connected platform for reporting, action tracking, training, emergency readiness, and audit evidence. Less chasing. Less duplication. Better control.',
    tailMs: 260,
    showGuide: false,
    setup: async (page) => {
      await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /Command Deck/i, 1000);
      await showHeroCard(page, {
        kicker: 'READY TO DEPLOY',
        title: 'One Safety System. Multiple Operational Workflows.',
        description: 'Built to help organizations replace manual EHS administration with one connected digital environment.',
        footer: 'Incidents • Risk • Inspections • CAPA • Training • Emergency • Field Access'
      });
    },
    after: async (page) => {
      await hideHeroCard(page);
    }
  },
  {
    key: 'thank-you',
    moduleTitle: 'Thank You',
    stepTitle: 'Closing note',
    bullets: [
      'Thank you for watching',
      'This platform is ready for companies moving off manual systems',
      'A connected EHS workflow can start from day one'
    ],
    narration: 'Thank you for watching. If your organization is ready to move beyond manual safety administration, this platform gives you a practical starting point for live EHS control across the business.',
    tailMs: 420,
    showGuide: false,
    setup: async (page) => {
      await page.goto(new URL('/dashboard', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await waitForRouteText(page, /Command Deck/i, 800);
      await showHeroCard(page, {
        kicker: 'THANK YOU',
        title: 'Ready To Modernize EHS?',
        description: 'Thank you for watching this introduction to the platform. One connected system can replace manual registers, fragmented reporting, and delayed follow-up.',
        footer: 'WE EHS SAFETY TOOL'
      });
    },
    after: async (page) => {
      await hideHeroCard(page);
    }
  }
];

const browser = await chromium.launch({ headless: true });

console.log(`Preparing still captures for ${scenarioId}...`);
const captureContext = await browser.newContext({
  viewport,
  screen: viewport
});
const capturePage = await captureContext.newPage();
capturePage.on('dialog', async (dialog) => {
  await dialog.accept();
});
await loginMainApp(capturePage);

moduleShotPaths.incidents = await captureRouteScreenshot(capturePage, '/incidents?site=HQ-01', /Incident Repository/i, path.join(screenshotDir, 'incidents.png'));
moduleShotPaths.risk = await captureRouteScreenshot(capturePage, '/risk?site=HQ-01', /HIRA Repository/i, path.join(screenshotDir, 'risk.png'));
moduleShotPaths.inspections = await captureRouteScreenshot(capturePage, '/inspections?site=HQ-01', /Inspection Schedule/i, path.join(screenshotDir, 'inspections.png'));
moduleShotPaths.capa = await captureRouteScreenshot(capturePage, '/capa?site=HQ-01', /Global CAPA Manager/i, path.join(screenshotDir, 'capa.png'));
moduleShotPaths.training = await captureRouteScreenshot(capturePage, '/training?site=HQ-01', /Training & Competence/i, path.join(screenshotDir, 'training.png'));
moduleShotPaths.emergencyEquipment = await captureRouteScreenshot(capturePage, '/emergency-equipment?site=HQ-01', /Emergency Equipment/i, path.join(screenshotDir, 'emergency-equipment.png'));

await captureContext.close();

const publicCaptureContext = await browser.newContext({
  viewport,
  screen: viewport
});
const publicCapturePage = await publicCaptureContext.newPage();
portalShotPaths.fieldPortalPublic = await captureRouteScreenshot(publicCapturePage, '/field-portal', /Field Portal/i, path.join(screenshotDir, 'field-portal-public.png'));
portalShotPaths.vendorPortalPublic = await captureRouteScreenshot(publicCapturePage, '/vendor-portal', /Contractor Portal/i, path.join(screenshotDir, 'vendor-portal-public.png'));

await publicCapturePage.goto(new URL('/field-portal', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
await waitForRouteText(publicCapturePage, /Field Portal/i, 1800);
await publicCapturePage.locator('input[type="email"]').fill(email);
await publicCapturePage.locator('input[type="password"]').fill(password);
await publicCapturePage.getByRole('button', { name: /access field portal/i }).click();
await waitForRouteText(publicCapturePage, /Hosted Field Workspace/i, 3200);
portalShotPaths.fieldPortalHome = path.join(screenshotDir, 'field-portal-home.png');
await publicCapturePage.screenshot({ path: portalShotPaths.fieldPortalHome, fullPage: false });

await publicCapturePage.goto(new URL('/vendor-portal', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
await waitForRouteText(publicCapturePage, /Contractor Portal/i, 1800);
const vendorInputs = publicCapturePage.locator('input');
if (await vendorInputs.count()) {
  await vendorInputs.nth(0).fill('vendor@example.com').catch(() => {});
}
if ((await vendorInputs.count()) > 1) {
  await vendorInputs.nth(1).fill('VENDOR-1001').catch(() => {});
}
await publicCapturePage.getByRole('button', { name: /access vendor portal/i }).hover().catch(() => {});
portalShotPaths.vendorPortalFocus = path.join(screenshotDir, 'vendor-portal-focus.png');
await publicCapturePage.screenshot({ path: portalShotPaths.vendorPortalFocus, fullPage: false });

if (vendorPortalEmail && vendorPortalCode) {
  await publicCapturePage.goto(new URL('/vendor-portal', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await waitForRouteText(publicCapturePage, /Contractor Portal/i, 1400);
  await publicCapturePage.locator('input[type="email"]').fill(vendorPortalEmail).catch(() => {});
  await publicCapturePage.locator('input[type="text"]').fill(vendorPortalCode).catch(() => {});
  await publicCapturePage.getByRole('button', { name: /access vendor portal/i }).click().catch(() => {});
  await waitForRouteText(publicCapturePage, /Vendor ID:/i, 3200);
  portalShotPaths.vendorPortalHome = path.join(screenshotDir, 'vendor-portal-home.png');
  await publicCapturePage.screenshot({ path: portalShotPaths.vendorPortalHome, fullPage: false });
}
await publicCaptureContext.close();

const reportSources = [
  {
    title: 'Incident Report',
    pdfPath: path.join(videoRoot, 'module-deep-dives', 'pdf', 'incident-module-live-tutorial.pdf')
  },
  {
    title: 'Inspection Report',
    pdfPath: path.join(videoRoot, 'module-deep-dives', 'pdf', 'inspections-module-live-tutorial.pdf')
  },
  {
    title: 'Emergency Report',
    pdfPath: path.join(videoRoot, 'module-deep-dives', 'pdf', 'emergency-module-live-tutorial.pdf')
  }
];

for (const reportSource of reportSources) {
  if (fs.existsSync(reportSource.pdfPath)) {
    const targetDir = path.join(reportPreviewDir, reportSource.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    ensureDir(targetDir);
    const [firstPagePath] = await renderPdfPagesToImages(reportSource.pdfPath, targetDir, 1);
    if (firstPagePath) {
      reportImageCards.push({
        title: reportSource.title,
        path: firstPagePath
      });
    }
  }
}

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

const recordingContext = await browser.newContext({
  viewport,
  screen: viewport,
  recordVideo: {
    dir: rawDir,
    size: viewport
  }
});

console.log(`Recording ${scenarioId}...`);
const page = await recordingContext.newPage();
page.on('dialog', async (dialog) => {
  await dialog.accept();
});

const recordingStart = Date.now();
for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  await segment.setup(page, index);
  await clearGuideOverlay(page);
  await page.waitForTimeout(220);
  segment.audioStartMs = Date.now() - recordingStart;
  await sleep(segment.audioDurationMs + segment.tailMs);
  if (segment.after) {
    await segment.after(page, index);
  }
  await clearGuideOverlay(page);
}

const finalDurationMs = Math.ceil(Math.max(
  forcedTotalMs,
  ...segments.map((segment) => segment.audioStartMs + segment.audioDurationMs + segment.tailMs + 120)
));

await withTimeout(recordingContext.close(), 180000, 'Recording context close');

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

await browser.close();

console.log(`Created intro video: ${mp4Output}`);
