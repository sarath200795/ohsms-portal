process.env.VIDEO_DURATION_MS = process.env.VIDEO_DURATION_MS || '60000';
process.env.VIDEO_OUTPUT_SUBDIR = process.env.VIDEO_OUTPUT_SUBDIR || 'minute-tours';

await import('./render-all-modules.mjs');
