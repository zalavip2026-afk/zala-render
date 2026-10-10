// node cinema.mjs ../content/youtube/pilot-001.json [stage] [--only N]
import fs from 'node:fs';
import path from 'node:path';
import { renderCinema } from './lib/cinema.mjs';
import { CACHE, OUT, TMP } from './lib/paths.mjs';
const [, , file, stage = 'all', , only = '0'] = process.argv;
const script = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const res = await renderCinema(script, {
  voice: path.join(CACHE, 'voice', `${script.id}.mp3`),
  assetsJson: path.join(TMP, `${script.id}-assets`, 'assets.json'),
  outDir: OUT, stage, only: Number(only),
});
console.log(JSON.stringify(res.outputs || {}, null, 1));
