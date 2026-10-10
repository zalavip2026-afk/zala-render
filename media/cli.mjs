#!/usr/bin/env node
// ZALA VIP video machine CLI
//   node cli.mjs render <scripts.json> [id …]   render items (all when no ids) → media/out/<id>.mp4 + .json (+ .jpg for long)
//   node cli.mjs selftest                       render the built-in sample Short (no API keys needed)
import fs from 'node:fs';
import path from 'node:path';
import { renderScript } from './lib/render.mjs';
import { CONTENT } from './lib/paths.mjs';

const [cmd, file, ...ids] = process.argv.slice(2);

const SAMPLE = {
  id: 'SELFTEST',
  title: 'Why the Great Pyramid still amazes engineers',
  hook: 'This tomb was the tallest building on Earth for nearly four thousand years.',
  narration: 'This tomb was the tallest building on Earth for nearly four thousand years. The Great Pyramid of Giza was built for the pharaoh Khufu, around 2560 BC. It rose about 146 meters and was made of roughly 2.3 million stone blocks. Its sides are aligned almost perfectly with true north, south, east and west. And here is the part most people never hear: the builders were not slaves. Archaeologists found their village nearby, with bakeries, breweries and tombs of honor. Today it is the last standing wonder of the ancient world. Standing in front of it is something you never forget.',
  broll: [
    { query: 'Great Pyramid of Giza', source_hint: 'wikimedia' },
    { query: 'Khufu', source_hint: 'wikimedia' },
    { query: 'Giza pyramid complex aerial', source_hint: 'wikimedia' },
    { query: 'ancient Egyptian stone block', source_hint: 'met' },
    { query: 'Giza workers village', source_hint: 'wikimedia' },
    { query: 'Pyramids of Giza sunset', source_hint: 'wikimedia' },
  ],
  description: 'The Great Pyramid in 50 seconds. #Egypt #Pyramids #Shorts',
  tags: ['Great Pyramid', 'Giza', 'Egypt travel'],
  sources: [{ claim: 'Built for Khufu c. 2560 BC, ~146 m', url: 'https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza' }],
  cta: 'Planning a trip to Egypt? ZALA VIP — link in bio.',
};

if (cmd === 'selftest') {
  const meta = await renderScript(SAMPLE, 'short');
  console.log(JSON.stringify(meta, null, 2));
} else if (cmd === 'render' && file) {
  const full = path.isAbsolute(file) ? file : fs.existsSync(file) ? path.resolve(file) : path.join(CONTENT, file);
  const items = JSON.parse(fs.readFileSync(full, 'utf8'));
  const kind = /long/i.test(path.basename(full)) ? 'long' : 'short';
  const picked = ids.length ? items.filter((s) => ids.includes(s.id)) : items;
  if (!picked.length) throw new Error(`no matching ids in ${full}`);
  for (const s of picked) await renderScript(s, kind);
} else {
  console.log('usage: node cli.mjs render <content/youtube/shorts-001.json> [S001 …] | node cli.mjs selftest');
  process.exit(1);
}
