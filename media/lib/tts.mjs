// media/lib/tts.mjs — narration audio + per-word timings (for captions).
// Providers:
//   gemini  Google AI Studio TTS (GEMINI_API_KEY) — production default (paid API, commercial use OK).
//   edge    Microsoft Edge read-aloud voices (free) — for local tests only; commercial use is not guaranteed.
// Every sentence is cached by hash, so re-renders never pay twice.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ff, durationOf } from './ff.mjs';
import { CACHE } from './paths.mjs';

const DIR = path.join(CACHE, 'tts');
fs.mkdirSync(DIR, { recursive: true });

export const DEFAULT_VOICE = {
  provider: process.env.TTS_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'edge'),
  edge: process.env.EDGE_VOICE || 'en-US-AndrewNeural',
  gemini: process.env.GEMINI_TTS_VOICE || 'Charon',
  rate: '+0%',
};

const GEMINI_STYLE = 'Narrate in a warm, cinematic American documentary voice, calm and confident, natural pauses:';

/** @returns {Promise<{ file: string, duration: number, words: { w: string, t0: number, t1: number }[] }>} */
export async function speak(text, voice = DEFAULT_VOICE) {
  const provider = voice.provider;
  const name = voice[provider];
  const key = crypto.createHash('sha1').update([provider, name, voice.rate, text].join('|')).digest('hex').slice(0, 16);
  const file = path.join(DIR, `${key}.mp3`);
  const wordsFile = path.join(DIR, `${key}.words.json`);

  if (!(fs.existsSync(file) && fs.statSync(file).size > 1000)) {
    if (provider === 'edge') await edge(text, name, voice.rate, file, wordsFile);
    else if (provider === 'gemini') await gemini(text, name, file);
    else throw new Error(`unknown TTS provider ${provider}`);
  }
  const duration = durationOf(file);
  let words = fs.existsSync(wordsFile) ? JSON.parse(fs.readFileSync(wordsFile, 'utf8')) : null;
  if (!words?.length) words = estimateWords(text, duration);
  return { file, duration, words };
}

async function edge(text, name, rate, file, wordsFile) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata(name, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const dir = fs.mkdtempSync(path.join(DIR, 'tmp-'));
  try {
    const r = await tts.toFile(dir, text, { rate });
    fs.copyFileSync(r.audioFilePath, file);
    try {
      const meta = JSON.parse(fs.readFileSync(r.metadataFilePath, 'utf8')).Metadata || [];
      const words = meta.filter((m) => m.Type === 'WordBoundary')
        .map((m) => ({ w: m.Data.text.Text, t0: m.Data.Offset / 1e7, t1: (m.Data.Offset + m.Data.Duration) / 1e7 }));
      fs.writeFileSync(wordsFile, JSON.stringify(words));
    } catch { /* fall back to estimated timings */ }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    tts.close?.();
  }
}

async function gemini(text, voiceName, file) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${GEMINI_STYLE} ${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
    }),
  });
  const data = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`Gemini TTS returned no audio: ${JSON.stringify(data).slice(0, 300)}`);
  const pcm = `${file}.pcm`;
  fs.writeFileSync(pcm, Buffer.from(b64, 'base64'));
  ff(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, '-b:a', '128k', file]);
  fs.rmSync(pcm, { force: true });
}

/** No word timings from the provider: spread words over the clip by character length. */
function estimateWords(text, duration) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const lead = 0.15, usable = Math.max(0.1, duration - lead - 0.2);
  let t = lead;
  return tokens.map((w, i) => {
    const d = (weights[i] / total) * usable;
    const item = { w, t0: t, t1: t + d };
    t += d;
    return item;
  });
}
