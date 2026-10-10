// media/lib/ff.mjs — thin ffmpeg / ffprobe wrappers.
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

export const FFMPEG = ffmpegPath;

export function ff(args) {
  try {
    return execFileSync(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
  } catch (err) {
    const msg = String(err.stderr || err.message).slice(-1500);
    throw new Error(`ffmpeg failed: ${msg}`);
  }
}

export const durationOf = (file) =>
  Number(execFileSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim()) || 0;

/** Escape a path for use inside an ffmpeg filter argument (Windows drive colons, quotes, backslashes). */
export const filterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

export const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
