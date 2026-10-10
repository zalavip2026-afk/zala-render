// node tools/voice-test.mjs [model]
// Renders the same documentary paragraph with several Gemini TTS voices so they can be compared by ear.
// Reads GEMINI_API_KEY from the environment or ../.env.local (never printed).
import fs from 'node:fs';
import path from 'node:path';
import { ff } from '../lib/ff.mjs';
import { OUT } from '../lib/paths.mjs';

const envFile = path.resolve(import.meta.dirname, '..', '..', '.env.local');
if (!process.env.GEMINI_API_KEY && fs.existsSync(envFile)) {
  const m = fs.readFileSync(envFile, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
  if (m) process.env.GEMINI_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
}
if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set (.env.local)'); process.exit(1); }

const model = process.argv[2] || process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICES = ['Charon', 'Sadaltager', 'Gacrux', 'Algenib', 'Rasalgethi', 'Orus'];
const STYLE = 'Narrate as a warm, cinematic American documentary voice. Calm, confident, a little intimate, natural pauses between sentences, slow on the big reveals:';
const TEXT = `In 2013, archaeologists opened a tunnel on the Red Sea coast. Inside was a logbook, written by a man who worked on the pyramid himself. His name was Merer. His title: inspector. And what he wrote down overturns the version most of us grew up with.`;

const dir = path.join(OUT, 'voice-test');
fs.mkdirSync(dir, { recursive: true });
for (const v of VOICES) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLE} ${TEXT}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } } },
    }),
  });
  const data = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) { console.log(v, 'FAILED', JSON.stringify(data).slice(0, 200)); continue; }
  const pcm = path.join(dir, `${v}.pcm`);
  fs.writeFileSync(pcm, Buffer.from(b64, 'base64'));
  ff(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, '-b:a', '160k', path.join(dir, `${v}.mp3`)]);
  fs.rmSync(pcm, { force: true });
  console.log(v, 'ok');
}
