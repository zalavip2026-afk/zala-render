// node tools/voice-text.mjs ../content/youtube/pilot-001.json
// Builds the text sent to the TTS (paragraph per chapter) from the script, applying content/youtube/pronunciation.json.
// Writes media/tmp/<id>-voice.txt and lists every lexicon word used plus capitalised words that are NOT in the lexicon
// (candidates to add after listening).
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT, TMP } from '../lib/paths.mjs';

const file = path.resolve(process.argv[2] || '');
const script = JSON.parse(fs.readFileSync(file, 'utf8'));
const lex = JSON.parse(fs.readFileSync(path.join(CONTENT, 'youtube', 'pronunciation.json'), 'utf8')).entries;
const keys = Object.keys(lex).sort((a, b) => b.length - a.length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = new RegExp(`(?<![\\w-])(${keys.map(esc).join('|')})(?![\\w-])`, 'g');

const used = new Map();
const unknown = new Set();
const known = new Set(keys.flatMap((k) => k.split(/\s+/)).map((w) => w.toLowerCase()));
const paragraphs = script.chapters.map((c) => c.lines.map((l) => {
  const text = l.say || l.en;
  for (const w of text.match(/(?<=[a-z,;:] )[A-Z][a-zA-Z'-]{3,}/g) || []) if (!known.has(w.toLowerCase())) unknown.add(w);
  return text.replace(re, (m) => { used.set(m, (used.get(m) || 0) + 1); return lex[m]; });
}).join(' '));

fs.mkdirSync(TMP, { recursive: true });
const out = path.join(TMP, `${script.id}-voice-pron.txt`);
fs.writeFileSync(out, paragraphs.join('\n\n'));
console.log(`wrote ${out} (${paragraphs.join('').length} characters)`);
console.log('respelled:', [...used].map(([k, n]) => `${k}×${n}`).join(', ') || '—');
if (unknown.size) console.log('capitalised words not in the lexicon (check pronunciation):', [...unknown].join(', '));
