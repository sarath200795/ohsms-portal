/**
 * record-onboarding-tutorial.mjs
 *
 * Records a full org-onboarding walkthrough video:
 *   Landing page → /setup → Firebase tab → fill config → test connection → create org → dashboard
 *
 * Audio pipeline:
 *   1. Narration synthesised per-segment via edge-tts (synthesizeNeuralSpeechToMp3)
 *   2. Ambient background music generated via ffmpeg lavfi (A-minor chord, gentle fade)
 *   3. Narration + music mixed together (music at ~25% relative volume)
 *   4. Mixed audio overlaid on Playwright screen-recording → final MP4
 *
 * Usage:
 *   VIDEO_BASE_URL=http://127.0.0.1:4173 node scripts/video-guides/record-onboarding-tutorial.mjs
 *
 * No VIDEO_EMAIL / VIDEO_PASSWORD needed — the onboarding flow is public.
 */

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
  videoRoot,
} from './helpers.mjs';

// ─── config ──────────────────────────────────────────────────────────────────

const baseUrl  = process.env.VIDEO_BASE_URL  || 'http://127.0.0.1:4173';
const voice    = process.env.VIDEO_NEURAL_VOICE || 'en-US-JennyNeural';
const voiceRate = process.env.VIDEO_NEURAL_RATE || '-3%';
const forcedTotalMs = Number(process.env.VIDEO_FINAL_DURATION_MS || 0);

if (!ffmpegPath) throw new Error('ffmpeg-static is not available.');

// ─── paths ────────────────────────────────────────────────────────────────────

const scenarioId        = 'ohsms-onboarding-tutorial';
const outputRoot        = ensureDir(path.join(videoRoot, 'tutorials'));
const rawDir            = path.join(rawRoot, scenarioId);
const audioDir          = ensureDir(path.join(outputRoot, 'audio'));
const segmentAudioDir   = path.join(audioDir, `${scenarioId}-segments`);
const mp4Output         = path.join(outputRoot, `${scenarioId}.mp4`);
const combinedAudioOutput = path.join(audioDir, `${scenarioId}-mixed.wav`);
const narrationOutput   = path.join(audioDir, `${scenarioId}-narration.wav`);
const musicOutput       = path.join(audioDir, `${scenarioId}-music.wav`);
const viewport          = { width: 1280, height: 720 };

// ─── helpers ─────────────────────────────────────────────────────────────────

const resetDirectory = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
  ensureDir(targetPath);
  return targetPath;
};

resetDirectory(rawDir);
resetDirectory(segmentAudioDir);
fs.rmSync(mp4Output, { force: true });
fs.rmSync(combinedAudioOutput, { force: true });
fs.rmSync(narrationOutput, { force: true });
fs.rmSync(musicOutput, { force: true });

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) { resolve(stderr); return; }
      reject(new Error(`ffmpeg failed (code ${code})\n${stderr}`));
    });
  });

const getMediaDurationSeconds = async (inputPath) => {
  const output = await new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, ['-i', inputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', () => resolve(stderr));
  });
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) throw new Error(`Unable to determine duration for ${inputPath}`);
  const [, h, m, s] = match;
  return (Number(h) * 3600) + (Number(m) * 60) + Number(s);
};

const transcodeAudioToWav = async (inputPath, outputPath) => {
  await runFfmpeg([
    '-y', '-i', inputPath,
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    outputPath,
  ]);
  return outputPath;
};

const renderDelayedAudio = async (inputPath, outputPath, delayMs, totalMs) => {
  await runFfmpeg([
    '-y', '-i', inputPath,
    '-filter_complex',
    `[0:a]adelay=${delayMs}:all=1,apad=pad_dur=${Math.max(totalMs / 1000, 1)}[a]`,
    '-map', '[a]',
    '-t', String(totalMs / 1000),
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    outputPath,
  ]);
  return outputPath;
};

const mixAudioFiles = async (inputPaths, outputPath, totalMs) => {
  const args = ['-y'];
  inputPaths.forEach((p) => args.push('-i', p));
  const filter =
    inputPaths.map((_, i) => `[${i}:a]`).join('') +
    `amix=inputs=${inputPaths.length}:normalize=0:duration=longest[a]`;
  args.push(
    '-filter_complex', filter,
    '-map', '[a]',
    '-t', String(totalMs / 1000),
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    outputPath,
  );
  await runFfmpeg(args);
  return outputPath;
};

const withTimeout = async (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

// ─── overlay helpers ──────────────────────────────────────────────────────────

/**
 * Show a full-screen branded hero card (title slate) over the page content.
 */
const showHeroCard = async (page, { kicker, title, description, footer }) => {
  await page.evaluate((payload) => {
    document.getElementById('otb-hero')?.remove();
    const root = document.createElement('div');
    root.id = 'otb-hero';
    Object.assign(root.style, {
      position: 'fixed', inset: '0', zIndex: '999998',
      display: 'grid', placeItems: 'center', padding: '48px',
      background: 'radial-gradient(circle at 22% 20%, rgba(249,115,22,0.25), transparent 30%), radial-gradient(circle at 78% 72%, rgba(6,182,212,0.18), transparent 30%), linear-gradient(135deg, rgba(4,7,11,0.97), rgba(10,14,22,0.95))',
      color: '#f5f8ff', fontFamily: '"Rajdhani", "Inter", sans-serif', pointerEvents: 'none',
    });
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: 'min(900px, 100%)',
      border: '1px solid rgba(249,115,22,0.22)',
      background: 'linear-gradient(180deg, rgba(14,20,31,0.97), rgba(8,12,19,0.99))',
      boxShadow: '0 42px 120px rgba(0,0,0,0.65)',
      borderRadius: '26px', padding: '52px 48px',
    });
    const kickerEl = document.createElement('div');
    kickerEl.textContent = payload.kicker;
    Object.assign(kickerEl.style, { color: '#f97316', fontSize: '12px', fontWeight: '800', letterSpacing: '0.32em', textTransform: 'uppercase', marginBottom: '18px' });
    const titleEl = document.createElement('div');
    titleEl.textContent = payload.title;
    Object.assign(titleEl.style, { fontSize: 'clamp(36px, 7vw, 72px)', lineHeight: '0.92', fontWeight: '900', letterSpacing: '-0.04em', textTransform: 'uppercase', marginBottom: '24px' });
    const line = document.createElement('div');
    Object.assign(line.style, { height: '3px', width: '100%', background: 'linear-gradient(90deg, #f97316, #06b6d4, transparent)', margin: '22px 0' });
    const descEl = document.createElement('p');
    descEl.textContent = payload.description;
    Object.assign(descEl.style, { maxWidth: '700px', margin: '0', color: '#cbd6e4', fontSize: '18px', lineHeight: '1.6' });
    const footerEl = document.createElement('div');
    footerEl.textContent = payload.footer;
    Object.assign(footerEl.style, { marginTop: '28px', color: '#06b6d4', fontSize: '12px', fontWeight: '800', letterSpacing: '0.2em', textTransform: 'uppercase' });
    panel.appendChild(kickerEl);
    panel.appendChild(titleEl);
    panel.appendChild(line);
    panel.appendChild(descEl);
    panel.appendChild(footerEl);
    root.appendChild(panel);
    document.body.appendChild(root);
  }, { kicker, title, description, footer });
};

const hideHeroCard = async (page) => {
  await page.evaluate(() => { document.getElementById('otb-hero')?.remove(); });
};

/**
 * Show a small guide overlay (top-left corner) with step info.
 */
const showStepOverlay = async (page, { step, title, bullets }) => {
  await page.evaluate((payload) => {
    document.getElementById('otb-step')?.remove();
    const root = document.createElement('div');
    root.id = 'otb-step';
    Object.assign(root.style, {
      position: 'fixed', top: '16px', left: '16px', width: '340px',
      zIndex: '999999', padding: '16px 18px', borderRadius: '16px',
      border: '1px solid rgba(249,115,22,0.28)',
      background: 'linear-gradient(180deg, rgba(7,10,14,0.96), rgba(12,16,24,0.97))',
      boxShadow: '0 20px 48px rgba(0,0,0,0.7)', color: '#edf4ff',
      fontFamily: '"Rajdhani", "Inter", sans-serif', pointerEvents: 'none',
    });
    const stepEl = document.createElement('div');
    stepEl.textContent = `STEP ${payload.step}`;
    Object.assign(stepEl.style, { color: '#f97316', fontSize: '11px', fontWeight: '800', letterSpacing: '0.3em', marginBottom: '6px' });
    const titleEl = document.createElement('div');
    titleEl.textContent = payload.title;
    Object.assign(titleEl.style, { fontSize: '20px', fontWeight: '800', lineHeight: '1.1', marginBottom: '10px' });
    const list = document.createElement('ul');
    Object.assign(list.style, { margin: '0', paddingLeft: '16px', fontSize: '13px', lineHeight: '1.5', color: '#dce6f3' });
    (payload.bullets || []).forEach((b) => {
      const li = document.createElement('li');
      li.textContent = b;
      li.style.marginBottom = '4px';
      list.appendChild(li);
    });
    root.appendChild(stepEl);
    root.appendChild(titleEl);
    root.appendChild(list);
    document.body.appendChild(root);
  }, { step, title, bullets });
};

const clearStepOverlay = async (page) => {
  await page.evaluate(() => { document.getElementById('otb-step')?.remove(); });
};

/**
 * Highlight a DOM element on the page by injecting a coloured pulse ring.
 */
const highlightElement = async (page, selector) => {
  await page.evaluate((sel) => {
    document.getElementById('otb-highlight')?.remove();
    const el = document.querySelector(sel);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.id = 'otb-highlight';
    Object.assign(ring.style, {
      position: 'fixed',
      top:    `${rect.top    - 6}px`,
      left:   `${rect.left   - 6}px`,
      width:  `${rect.width  + 12}px`,
      height: `${rect.height + 12}px`,
      border: '2.5px solid #f97316',
      borderRadius: '10px',
      boxShadow: '0 0 0 4px rgba(249,115,22,0.22)',
      zIndex: '999997',
      pointerEvents: 'none',
      animation: 'none',
    });
    document.body.appendChild(ring);
  }, selector);
};

const clearHighlight = async (page) => {
  await page.evaluate(() => { document.getElementById('otb-highlight')?.remove(); });
};

const gentleScroll = async (page, delta = 250) => {
  await page.mouse.wheel(0, delta).catch(() => {});
  await sleep(300);
};

// ─── segments ─────────────────────────────────────────────────────────────────

const segments = [
  // ── 1. Title card ──────────────────────────────────────────────────────────
  {
    key: 'title-card',
    narration: 'Welcome to OHSMS Enterprise — the ISO 45001 safety management platform that gives your organisation 15 integrated EHS modules, connected to any database you choose. In this tutorial, you will go from zero to a fully configured workspace in under 5 minutes.',
    tailMs: 200,
    setup: async (page) => {
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await showHeroCard(page, {
        kicker:      'Getting Started · Onboarding Tutorial',
        title:       'Launch Your EHS Workspace in 4 Steps',
        description: 'Learn how to configure your database, create your organisation, and invite your team — all from the browser, no backend required.',
        footer:      'WE EHS Safety Tool',
      });
    },
    after: async (page) => { await hideHeroCard(page); },
  },

  // ── 2. Landing page overview ───────────────────────────────────────────────
  {
    key: 'landing-overview',
    narration: 'The platform homepage gives you a full picture of every module before you even sign in. Scroll through incidents, risk assessments, permits, LOTO, inspections, training, contractor management, and more — all in one connected system.',
    tailMs: 220,
    setup: async (page) => {
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(800);
      // gently scroll through the hero and modules strip
      await gentleScroll(page, 300);
      await sleep(600);
      await gentleScroll(page, 400);
      await sleep(700);
      await gentleScroll(page, 400);
    },
  },

  // ── 3. Navigate to setup wizard ────────────────────────────────────────────
  {
    key: 'navigate-setup',
    narration: 'Click "Create Organisation" from the hero or navigation bar to open the Database Setup Wizard. This is where you connect your chosen database before creating the workspace.',
    tailMs: 180,
    setup: async (page) => {
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(600);
      // highlight the CTA button
      await highlightElement(page, 'button, a[href="/setup"]');
      await sleep(800);
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(1000);
      await showStepOverlay(page, {
        step: 1,
        title: 'Database Setup Wizard',
        bullets: [
          'Choose your preferred database adapter',
          'Firebase is free and takes 2 minutes',
          'PostgreSQL, MongoDB, Supabase, and more also supported',
        ],
      });
    },
    after: async (page) => {
      await clearHighlight(page);
      await clearStepOverlay(page);
    },
  },

  // ── 4. Firebase tab — show the config form ─────────────────────────────────
  {
    key: 'firebase-tab',
    narration: 'Select the Firebase tab. Firebase offers a free Realtime Database with generous limits — perfect for getting started without any server setup. You will need a Firebase project from console.firebase.google.com, which takes about two minutes to create.',
    tailMs: 220,
    setup: async (page) => {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(800);
      // try to click the Firebase tab if it exists
      const firebaseTab = page.getByRole('button', { name: /firebase/i }).first();
      if (await firebaseTab.count()) {
        await firebaseTab.click().catch(() => {});
        await sleep(600);
      }
      await showStepOverlay(page, {
        step: 2,
        title: 'Firebase Configuration',
        bullets: [
          'Open console.firebase.google.com',
          'Create a new project (free tier)',
          'Go to Project Settings → Your Apps → Web',
          'Copy the firebaseConfig object',
        ],
      });
    },
    after: async (page) => { await clearStepOverlay(page); },
  },

  // ── 5. Entering credentials ────────────────────────────────────────────────
  {
    key: 'enter-config',
    narration: 'Paste your Firebase project credentials into the fields shown — the API key, project ID, and database URL are the most important. The platform stores these only in your browser session and your own Firebase project. Nothing is stored on any third-party server.',
    tailMs: 200,
    setup: async (page) => {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(800);
      const firebaseTab = page.getByRole('button', { name: /firebase/i }).first();
      if (await firebaseTab.count()) {
        await firebaseTab.click().catch(() => {});
        await sleep(400);
      }
      // try typing demo values into the first visible text input
      const inputs = page.locator('input[type="text"], input[type="url"], input:not([type])');
      const count = await inputs.count();
      if (count > 0) {
        await inputs.nth(0).click().catch(() => {});
        await inputs.nth(0).type('your-project-id', { delay: 55 }).catch(() => {});
      }
      if (count > 1) {
        await inputs.nth(1).click().catch(() => {});
        await inputs.nth(1).type('paste-your-api-key-here', { delay: 50 }).catch(() => {});
      }
      await showStepOverlay(page, {
        step: 3,
        title: 'Paste Your Credentials',
        bullets: [
          'API Key — from Firebase project settings',
          'Project ID — your-project-id',
          'Database URL — ends in .firebaseio.com',
          'Storage Bucket — optional, for file uploads',
        ],
      });
    },
    after: async (page) => { await clearStepOverlay(page); },
  },

  // ── 6. Security rules ──────────────────────────────────────────────────────
  {
    key: 'security-rules',
    narration: 'Before connecting, set the Firebase security rules. Switch to the Security Rules tab and copy the pre-built ruleset. Open your Firebase console, navigate to Realtime Database → Rules, paste the rules, and publish. This ensures only authenticated members of your organisation can read or write data.',
    tailMs: 240,
    setup: async (page) => {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(800);
      // try to navigate to the rules tab
      const rulesTab = page.getByRole('button', { name: /security rules/i }).first();
      if (await rulesTab.count()) {
        await rulesTab.click().catch(() => {});
        await sleep(600);
      }
      await showStepOverlay(page, {
        step: 3,
        title: 'Security Rules',
        bullets: [
          'Copy the pre-built rules snippet',
          'Paste into Firebase Console → RTDB → Rules',
          'Publish — users are isolated per organisation',
          'Data is never visible to other tenants',
        ],
      });
      await gentleScroll(page, 180);
    },
    after: async (page) => { await clearStepOverlay(page); },
  },

  // ── 7. Test connection ─────────────────────────────────────────────────────
  {
    key: 'test-connection',
    narration: 'Click "Test Connection" to verify the credentials. The platform performs a live read and write check against your database. A green success message means everything is working and you are ready to create your organisation.',
    tailMs: 200,
    setup: async (page) => {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(800);
      const firebaseTab = page.getByRole('button', { name: /firebase/i }).first();
      if (await firebaseTab.count()) {
        await firebaseTab.click().catch(() => {});
        await sleep(400);
      }
      // highlight the test connection button
      const testBtn = page.getByRole('button', { name: /test connection/i }).first();
      if (await testBtn.count()) {
        await highlightElement(page, 'button');
        await sleep(600);
        await testBtn.click().catch(() => {});
        await sleep(1200);
      }
      await showStepOverlay(page, {
        step: 4,
        title: 'Test Your Connection',
        bullets: [
          'Click "Test Connection"',
          'Green = connected, ready to proceed',
          'Red = check credentials or rules',
          'Connection is stored in your session',
        ],
      });
    },
    after: async (page) => {
      await clearHighlight(page);
      await clearStepOverlay(page);
    },
  },

  // ── 8. Create organisation ─────────────────────────────────────────────────
  {
    key: 'create-org',
    narration: 'With the database connected, navigate to the Create Organisation page. Enter your company name, select your industry, and optionally set the number of sites. You become the Global Owner with full access to all 15 modules. The setup takes under 30 seconds.',
    tailMs: 220,
    setup: async (page) => {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(800);
      // scroll down to the create-org section or navigate if it's on the config tab
      await gentleScroll(page, 300);
      await sleep(600);
      const orgInput = page.locator('input[placeholder*="company"], input[placeholder*="organisation"], input[placeholder*="organization"]').first();
      if (await orgInput.count()) {
        await orgInput.click().catch(() => {});
        await orgInput.type('Acme Safety Solutions Sdn Bhd', { delay: 60 }).catch(() => {});
        await sleep(400);
        await highlightElement(page, 'input');
      }
      await showStepOverlay(page, {
        step: 5,
        title: 'Create Organisation',
        bullets: [
          'Enter your company name',
          'Select your industry sector',
          'You become the Global Owner',
          'All 15 modules are immediately available',
        ],
      });
    },
    after: async (page) => {
      await clearHighlight(page);
      await clearStepOverlay(page);
    },
  },

  // ── 9. Invite team ─────────────────────────────────────────────────────────
  {
    key: 'invite-team',
    narration: 'After the workspace is created, go to User Management and share your unique organisation join code with your team. New users sign up and request access. You approve their accounts, assign roles — from Site Admin down to Worker — and set which sites and modules they can access.',
    tailMs: 200,
    setup: async (page) => {
      await page.goto(new URL('/setup', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(600);
      await showStepOverlay(page, {
        step: 6,
        title: 'Invite Your Team',
        bullets: [
          'Share the org join code with colleagues',
          'Approve accounts from User Management',
          'Assign Global Owner, Admin, or Worker roles',
          'Restrict access by site and module',
        ],
      });
      await gentleScroll(page, 200);
    },
    after: async (page) => { await clearStepOverlay(page); },
  },

  // ── 10. Go live ────────────────────────────────────────────────────────────
  {
    key: 'go-live',
    narration: 'Your EHS workspace is live. From the command dashboard you can immediately begin logging incidents, scheduling inspections, issuing permits, and running audits. Every module is connected — CAPA raised in an incident flows into the same tracker as findings from an audit or inspection.',
    tailMs: 280,
    setup: async (page) => {
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(700);
      await showHeroCard(page, {
        kicker:      'Your EHS Workspace Is Ready',
        title:       'Go Live. Stay Compliant.',
        description: 'All 15 modules are active in your workspace. Incidents, permits, audits, training, and more — everything connected, everything traceable, all in your own database.',
        footer:      'ISO 45001 · WE EHS Safety Tool',
      });
      await sleep(600);
    },
    after: async (page) => { await hideHeroCard(page); },
  },

  // ── 11. Closing / CTA ──────────────────────────────────────────────────────
  {
    key: 'outro',
    narration: 'That is the complete onboarding flow — from choosing a database to a fully operational EHS workspace. Visit the setup wizard now and have your organisation live in under 5 minutes. More tutorial videos covering every module are available in the Tutorials section of the homepage.',
    tailMs: 420,
    setup: async (page) => {
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      await sleep(600);
      await showHeroCard(page, {
        kicker:      'Tutorial Complete',
        title:       'You Are Ready to Start.',
        description: 'Open the Setup Wizard to connect your database and create your organisation — it takes under 5 minutes. More walkthroughs for every EHS module are on the way.',
        footer:      'WE EHS Safety Tool · Sarathchandra200795@gmail.com',
      });
    },
    after: async (page) => { await hideHeroCard(page); },
  },
];

// ─── step 1: synthesise narration per segment ─────────────────────────────────

console.log(`[onboarding] Synthesising narration for ${segments.length} segments...`);
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  seg.rawAudioPath    = path.join(segmentAudioDir, `${String(i + 1).padStart(2, '0')}-${seg.key}.mp3`);
  seg.rawAudioWavPath = path.join(segmentAudioDir, `${String(i + 1).padStart(2, '0')}-${seg.key}.wav`);
  console.log(`  [${i + 1}/${segments.length}] ${seg.key}`);
  await withTimeout(
    synthesizeNeuralSpeechToMp3(seg.narration, seg.rawAudioPath, { voice, rate: voiceRate }),
    180_000,
    `Narration: ${seg.key}`,
  );
  await transcodeAudioToWav(seg.rawAudioPath, seg.rawAudioWavPath);
  seg.audioDurationMs = Math.ceil((await getMediaDurationSeconds(seg.rawAudioWavPath)) * 1000);
  console.log(`     duration: ${(seg.audioDurationMs / 1000).toFixed(1)}s`);
}

// ─── step 2: record the screen ───────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

const recordingContext = await browser.newContext({
  viewport,
  screen: viewport,
  recordVideo: { dir: rawDir, size: viewport },
});

console.log('[onboarding] Recording screen...');
const page = await recordingContext.newPage();
page.on('dialog', async (dialog) => { await dialog.accept(); });

const recordingStart = Date.now();
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  await seg.setup(page, i);
  await clearStepOverlay(page).catch(() => {});
  await page.waitForTimeout(200);
  seg.audioStartMs = Date.now() - recordingStart;
  await sleep(seg.audioDurationMs + seg.tailMs);
  if (seg.after) await seg.after(page, i);
  await clearStepOverlay(page).catch(() => {});
}

const finalDurationMs = Math.ceil(Math.max(
  forcedTotalMs,
  ...segments.map((seg) => seg.audioStartMs + seg.audioDurationMs + seg.tailMs + 120),
));

await withTimeout(recordingContext.close(), 180_000, 'Recording context close');
await browser.close();

console.log(`[onboarding] Raw recording duration: ${(finalDurationMs / 1000).toFixed(1)}s`);

// ─── step 3: build narration track ───────────────────────────────────────────

console.log('[onboarding] Building narration track...');
const delayedPaths = [];
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  const delayedPath = path.join(segmentAudioDir, `${String(i + 1).padStart(2, '0')}-${seg.key}-delayed.wav`);
  await renderDelayedAudio(seg.rawAudioWavPath, delayedPath, seg.audioStartMs, finalDurationMs);
  delayedPaths.push(delayedPath);
}
await mixAudioFiles(delayedPaths, narrationOutput, finalDurationMs);

// ─── step 4: generate ambient background music ────────────────────────────────

const totalSec = Math.ceil(finalDurationMs / 1000) + 2;
console.log(`[onboarding] Generating ${totalSec}s ambient background music...`);
await runFfmpeg([
  '-y',
  // Three sine waves forming an A-minor chord: A2(110Hz) + C3(131Hz) + E3(165Hz)
  // and an octave up: A3(220Hz) + E4(330Hz) — soft, motivating ambient chord
  '-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=48000',
  '-f', 'lavfi', '-i', 'sine=frequency=131:sample_rate=48000',
  '-f', 'lavfi', '-i', 'sine=frequency=165:sample_rate=48000',
  '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000',
  '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-filter_complex',
    '[0:a]volume=0.18[a0];' +
    '[1:a]volume=0.15[a1];' +
    '[2:a]volume=0.14[a2];' +
    '[3:a]volume=0.12[a3];' +
    '[4:a]volume=0.10[a4];' +
    '[5:a]volume=0.07[a5];' +
    '[a0][a1][a2][a3][a4][a5]amix=inputs=6:normalize=0[mixed];' +
    `[mixed]afade=t=in:st=0:d=5,afade=t=out:st=${Math.max(totalSec - 6, totalSec * 0.85)}:d=6,` +
    'lowpass=f=900,highpass=f=60,volume=0.28[out]',
  '-map', '[out]',
  '-t', String(totalSec),
  '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
  musicOutput,
]);

// ─── step 5: mix narration + music ───────────────────────────────────────────

console.log('[onboarding] Mixing narration + background music...');
await runFfmpeg([
  '-y',
  '-i', narrationOutput,
  '-i', musicOutput,
  '-filter_complex',
  '[0:a]volume=1.0[narr];[1:a]volume=0.55[music];[narr][music]amix=inputs=2:normalize=0:duration=longest[out]',
  '-map', '[out]',
  '-t', String(totalSec),
  '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
  combinedAudioOutput,
]);

// ─── step 6: combine audio + video → final MP4 ───────────────────────────────

const rawVideo = findNewestFile(rawDir);
if (!rawVideo) throw new Error(`No raw video found in ${rawDir}`);

console.log('[onboarding] Encoding final MP4...');
await withTimeout(
  transcodeToMp4WithAudio(rawVideo, combinedAudioOutput, mp4Output, {
    durationSeconds: Math.ceil(finalDurationMs / 1000),
    stopPadSeconds:  1,
  }),
  300_000,
  'Final MP4 encode',
);

console.log(`\n✅  Onboarding tutorial saved to:\n    ${mp4Output}\n`);
