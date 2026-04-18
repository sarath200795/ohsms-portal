import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export const projectRoot = process.cwd();
export const videoRoot = path.join(projectRoot, 'artifacts', 'videos');
export const rawRoot = path.join(videoRoot, 'raw');

export const ensureDir = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sanitizeFileName = (value) =>
  String(value || 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'video';

export const findNewestFile = (directory) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolutePath = path.join(directory, entry.name);
      return {
        name: entry.name,
        path: absolutePath,
        mtimeMs: fs.statSync(absolutePath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return entries[0]?.path || null;
};

export const transcodeToMp4 = (inputPath, outputPath) =>
  new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static is not available.'));
      return;
    }

    ensureDir(path.dirname(outputPath));

    const ffmpeg = spawn(
      ffmpegPath,
      [
        '-y',
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-an',
        outputPath
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', reject);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
        return;
      }

      reject(new Error(`ffmpeg failed with code ${code}\n${stderr}`));
    });
  });

export const transcodeToMp4WithAudio = (inputPath, audioPath, outputPath, options = {}) =>
  new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static is not available.'));
      return;
    }

    ensureDir(path.dirname(outputPath));

    const durationSeconds = Number(options.durationSeconds || 0);
    const stopPadSeconds = Number(options.stopPadSeconds || 0);
    const ffmpegArgs = [
      '-y',
      '-i', inputPath,
      '-i', audioPath,
    ];

    if (stopPadSeconds > 0) {
      ffmpegArgs.push('-vf', `tpad=stop_mode=clone:stop_duration=${stopPadSeconds}`);
    }

    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart'
    );

    if (durationSeconds > 0) {
      ffmpegArgs.push('-t', String(durationSeconds));
    }

    ffmpegArgs.push(outputPath);

    const ffmpeg = spawn(
      ffmpegPath,
      ffmpegArgs,
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', reject);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
        return;
      }

      reject(new Error(`ffmpeg with audio failed with code ${code}\n${stderr}`));
    });
  });

export const synthesizeSpeechToWave = (text, outputPath, options = {}) =>
  new Promise((resolve, reject) => {
    const encodedText = Buffer.from(String(text || ''), 'utf8').toString('base64');
    const encodedPath = Buffer.from(String(outputPath), 'utf8').toString('base64');
    const encodedVoices = Buffer.from(JSON.stringify(options.voiceNames || ['Microsoft Zira Desktop', 'Microsoft Hazel Desktop']), 'utf8').toString('base64');
    const rate = Number.isFinite(Number(options.rate)) ? Number(options.rate) : -1;

    const script = `
      Add-Type -AssemblyName System.Speech;
      $text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedText}'));
      $output = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'));
      $preferredVoices = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedVoices}')) | ConvertFrom-Json;
      $parent = Split-Path -Parent $output;
      if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $selectedVoice = $null;
      foreach ($voiceName in $preferredVoices) {
        $match = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq $voiceName } | Select-Object -First 1;
        if ($match) {
          $selectedVoice = $match.VoiceInfo.Name;
          break;
        }
      }
      if ($selectedVoice) {
        $synth.SelectVoice($selectedVoice);
      } else {
        try { $synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female); } catch {}
      }
      $synth.Rate = ${rate};
      $synth.Volume = 100;
      $synth.SetOutputToWaveFile($output);
      $synth.Speak($text);
      $synth.Dispose();
    `;

    const child = spawn(
      'powershell',
      ['-NoProfile', '-Command', script],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
        return;
      }

      reject(new Error(`Speech synthesis failed with code ${code}\n${stderr}`));
    });
  });

export const synthesizeNeuralSpeechToMp3 = (text, outputPath, options = {}) =>
  new Promise((resolve, reject) => {
    const voice = options.voice || 'en-US-JennyNeural';
    const rate = options.rate || '-4%';
    const volume = options.volume || '+0%';
    const pitch = options.pitch || '+0Hz';
    const tempTextPath = `${outputPath}.txt`;

    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(tempTextPath, String(text || ''), 'utf8');

    const child = spawn(
      'python',
      [
        '-m', 'edge_tts',
        '--file', tempTextPath,
        '--voice', voice,
        '--rate', rate,
        '--volume', volume,
        '--pitch', pitch,
        '--write-media', outputPath
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      fs.rmSync(tempTextPath, { force: true });
      reject(error);
    });

    child.on('close', (code) => {
      fs.rmSync(tempTextPath, { force: true });

      if (code === 0) {
        resolve(outputPath);
        return;
      }

      reject(new Error(`Neural speech synthesis failed with code ${code}\n${stderr}`));
    });
  });
