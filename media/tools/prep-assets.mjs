// media/tools/prep-assets.mjs — resolve every shot of a cinema script to an open-license file + contact sheet for review.
//   node tools/prep-assets.mjs content/youtube/pilot-001.json
import fs from 'node:fs';
import path from 'node:path';
import { findAsset } from '../lib/assets.mjs';
import { TMP } from '../lib/paths.mjs';
import { ff } from '../lib/ff.mjs';

// load API keys (Pixabay etc.) from the repo .env.local without printing them
try {
  const raw = fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const file = process.argv[2];
const script = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const pinsFile = path.join(path.dirname(path.resolve(file)), `${script.id}.pins.json`);
const pins = fs.existsSync(pinsFile) ? JSON.parse(fs.readFileSync(pinsFile, 'utf8')) : {};
const used = new Set();
const out = {};
const work = path.join(TMP, `${script.id}-assets`);
fs.mkdirSync(work, { recursive: true });
let n = 0;
for (const [ci, ch] of script.chapters.entries()) for (const [li, ln] of ch.lines.entries()) {
  if (!ln.shot) continue;
  const q = ln.shot.q; const key = `${ci}.${li}`;
  const isV = !!ln.shot.v;
  const item = pins[q] ? { query: q, ...pins[q] } : { query: q, source_hint: (isV || ln.shot.stockFirst) ? 'pixabay' : 'wikimedia', wikiOnly: !isV && !ln.shot.stock && !ln.shot.stockFirst };
  const a = await findAsset(item, { orientation: 'landscape', used, preferVideo: isV });
  out[key] = a ? { q, kind: a.kind, file: a.file, attribution: a.attribution, url: a.url, license: a.license } : null;
  console.log(`${String(++n).padStart(2)} ${a ? 'OK ' : 'NONE'} | ${q} | ${a ? a.attribution.slice(0, 85) : ''}`);
}
fs.writeFileSync(path.join(work, 'assets.json'), JSON.stringify(out, null, 2));
// contact sheet: numbered thumbnails
const items = Object.entries(out).filter(([, v]) => v);
const thumbs = [];
items.forEach(([q, v], i) => {
  const t = path.join(work, `t${String(i).padStart(2, '0')}.jpg`);
  try { ff(['-i', v.file, '-frames:v', '1', '-vf', `scale=384:216:force_original_aspect_ratio=increase,crop=384:216`, t]); thumbs.push(t); } catch (e) { console.log('thumb fail', q); }
});
const cols = 4, rows = Math.ceil(thumbs.length / cols);
const inputs = thumbs.flatMap((t) => ['-i', t]);
const layout = thumbs.map((_, i) => `${(i % cols) * 384}_${Math.floor(i / cols) * 216}`).join('|');
ff([...inputs, '-filter_complex', `${thumbs.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${thumbs.length}:layout=${layout}[v]`, '-map', '[v]', '-frames:v', '1', path.join(work, 'sheet.jpg')]);
console.log('sheet:', path.join(work, 'sheet.jpg'));
console.log(items.map(([q], i) => `${i}: ${q}`).join('\n'));
