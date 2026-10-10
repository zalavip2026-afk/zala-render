// node tools/review-sheets.mjs ../content/youtube/pilot-003.json
// Image-relevance review gate: numbered contact sheets (24 per sheet) showing, under each thumbnail,
// the shot key, the query it was meant to match and the source, so every image can be checked against its query.
import fs from 'node:fs';
import path from 'node:path';
import { ff } from '../lib/ff.mjs';
import { TMP, FONTS } from '../lib/paths.mjs';

const file = path.resolve(process.argv[2]);
const script = JSON.parse(fs.readFileSync(file, 'utf8'));
const work = path.join(TMP, `${script.id}-assets`);
const assets = JSON.parse(fs.readFileSync(path.join(work, 'assets.json'), 'utf8'));
const font = path.join(FONTS, 'Lato-Bold.ttf').replace(/\\/g, '/').replace(':', '\\:');
const esc = (s) => String(s).replace(/[\\':%]/g, ' ').replace(/[^\x20-\x7E]/g, '?');

const onlyKeys = process.argv[3] ? new Set(process.argv[3].split(',')) : null; // only keys
const entries = Object.entries(assets).filter(([k]) => !onlyKeys || onlyKeys.has(k));
const W = 480, H = 270, LAB = 54, COLS = 4, PER = 24;
const sheets = [];
for (let s = 0; s * PER < entries.length; s++) {
  const part = entries.slice(s * PER, (s + 1) * PER);
  const tiles = [];
  part.forEach(([key, a], i) => {
    const out = path.join(work, `r${s}-${i}.jpg`);
    const [c, l] = key.split('.').map(Number);
    const q = esc(script.chapters[c].lines[l].shot.q).slice(0, 58);
    const src = a ? esc(`${a.kind === 'video' ? 'VIDEO ' : ''}${(a.attribution || '').slice(0, 56)}`) : 'NONE (previous image is reused)';
    const input = a ? a.file : null;
    const vf = (a
      ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`
      : `scale=${W}:${H},eq=brightness=-1`) +
      `,pad=${W}:${H + LAB}:0:0:color=0x111111,` +
      `drawtext=fontfile='${font}':text='${key}  ${q}':x=6:y=${H + 4}:fontsize=15:fontcolor=white,` +
      `drawtext=fontfile='${font}':text='${src}':x=6:y=${H + 30}:fontsize=13:fontcolor=0xcccccc`;
    if (a) ff(['-i', input, '-frames:v', '1', '-vf', vf, out]);
    else ff(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}`, '-frames:v', '1', '-vf', vf, out]);
    tiles.push(out);
  });
  const rows = Math.ceil(tiles.length / COLS);
  const layout = tiles.map((_, i) => `${(i % COLS) * W}_${Math.floor(i / COLS) * (H + LAB)}`).join('|');
  const sheet = path.join(work, `review-${s + 1}.jpg`);
  ff([...tiles.flatMap((t) => ['-i', t]), '-filter_complex', `${tiles.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${tiles.length}:layout=${layout}[v]`, '-map', '[v]', '-frames:v', '1', sheet]);
  sheets.push(sheet);
}
console.log(sheets.join('\n'));
