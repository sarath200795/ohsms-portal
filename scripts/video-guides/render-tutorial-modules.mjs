process.env.VIDEO_STYLE = process.env.VIDEO_STYLE || 'tutorial';
process.env.VIDEO_OUTPUT_SUBDIR = process.env.VIDEO_OUTPUT_SUBDIR || 'tutorial-walkthroughs';
process.env.VIDEO_CAPTURE_DURATION_MS = process.env.VIDEO_CAPTURE_DURATION_MS || '60000';
process.env.VIDEO_FINAL_DURATION_MS = process.env.VIDEO_FINAL_DURATION_MS || '300000';

await import('./render-all-modules.mjs');
