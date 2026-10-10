#!/usr/bin/env node
// Verifies the fact bank: every fact must carry an `evidence` sentence copied from its `source_url`,
// and that sentence must really appear on the page. Usage:
//   node media/tools/check-facts.mjs            → checks content/factbank/*.json, writes content/factbank/_report.json
//   node media/tools/check-facts.mjs sphinx     → one topic
// Exit code 1 when anything fails (so the pipeline never renders unverified facts).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONTENT, CACHE } from '../lib/paths.mjs';

const DIR = path.join(CONTENT, 'factbank');
const PAGES = path.join(CACHE, 'pages');
fs.mkdirSync(PAGES, { recursive: true });
const UA = 'ZALA-VIP-factcheck/1.0 (https://www.zalavip.com)';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...' };
const htmlToText = (html) => html
  .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<sup[\s\S]*?<\/sup>/gi, ' ')               // Wikipedia citation markers [1]
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? ' ');
const norm = (s) => String(s).toLowerCase()
  .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[‐-―−]/g, '-')
  .replace(/\[\d+\]/g, ' ').replace(/[^a-z0-9.,'"%\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function pageText(url) {
  const file = path.join(PAGES, crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + '.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  // Wikipedia: the REST HTML endpoint is lighter and stable.
  const m = url.match(/^https?:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/);
  const fetchUrl = m ? `https://en.wikipedia.org/api/rest_v1/page/html/${m[1]}` : url;
  const res = await fetch(fetchUrl, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = norm(htmlToText(await res.text()));
  fs.writeFileSync(file, text);
  return text;
}

/** Exact (normalized) match, or ≥90% of the evidence words found in order inside a short window. */
function found(evidence, text) {
  const ev = norm(evidence);
  if (ev.length < 25) return false;
  if (text.includes(ev)) return true;
  const words = ev.split(' ').filter((w) => w.length > 2);
  const first = text.indexOf(words[0]);
  for (let at = first; at !== -1; at = text.indexOf(words[0], at + 1)) {
    const win = text.slice(at, at + ev.length * 1.6);
    const hit = words.filter((w) => win.includes(w)).length;
    if (hit / words.length >= 0.9) return true;
  }
  return false;
}

const only = process.argv[2];
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_') && (!only || f.includes(only)));
const report = { checkedAt: new Date().toISOString(), topics: {} };
let failed = 0, passed = 0;

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const items = [...(data.facts || []).map((x) => ({ ...x, kind: 'fact', claim: x.fact })),
    ...(data.common_myths || []).map((x) => ({ ...x, kind: 'myth', claim: x.truth }))];
  const res = [];
  for (const it of items) {
    let status;
    if (!it.evidence) status = 'missing evidence';
    else if (!it.source_url) status = 'missing source';
    else {
      try { status = found(it.evidence, await pageText(it.source_url)) ? 'ok' : 'evidence not on page'; }
      catch (err) { status = `source unreachable (${err.message})`; }
    }
    if (status === 'ok') passed++; else failed++;
    res.push({ kind: it.kind, claim: String(it.claim).slice(0, 120), source: it.source_url, status });
  }
  report.topics[f] = { ok: res.filter((r) => r.status === 'ok').length, failed: res.filter((r) => r.status !== 'ok') };
  console.log(`${report.topics[f].failed.length ? '✗' : '✓'} ${f}  ok=${report.topics[f].ok} failed=${report.topics[f].failed.length}`);
}

report.summary = { passed, failed };
if (!only) fs.writeFileSync(path.join(DIR, '_report.json'), JSON.stringify(report, null, 2));
console.log(`\npassed ${passed} · failed ${failed}${only ? '' : ' → content/factbank/_report.json'}`);
process.exit(failed ? 1 : 0);
