// Downloads the open-source (OFL) fonts used in captions/thumbnails into media/brand/fonts.
import fs from 'node:fs';
import path from 'node:path';
import { FONTS } from '../lib/paths.mjs';

const FILES = {
  'Anton-Regular.ttf': 'https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf',
  'Lato-Bold.ttf': 'https://github.com/google/fonts/raw/main/ofl/lato/Lato-Bold.ttf',
  'DMSerifDisplay-Regular.ttf': 'https://github.com/google/fonts/raw/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf',
};

fs.mkdirSync(FONTS, { recursive: true });
for (const [name, url] of Object.entries(FILES)) {
  const file = path.join(FONTS, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 10000) { console.log('ok  ', name); continue; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('got ', name, fs.statSync(file).size, 'bytes');
}
