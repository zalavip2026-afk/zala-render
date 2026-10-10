// media/lib/assets.mjs — open-license b-roll for each scene.
// Sources (commercial use allowed):
//   pexels     videos + photos (Pexels license; needs PEXELS_API_KEY — free)
//   pixabay    videos + photos (Pixabay Content License; needs PIXABAY_API_KEY — free)
//   wikimedia  photos of real monuments/artifacts — only PD / CC0 / CC BY / CC BY-SA (attribution kept)
//   met        The Met Open Access artworks (CC0)
// Everything is cached on disk; every asset carries its attribution line for the video description.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE } from './paths.mjs';

const DIR = path.join(CACHE, 'assets');
fs.mkdirSync(DIR, { recursive: true });
const UA = 'ZALA-VIP-media/1.0 (https://www.zalavip.com; contact via site)';
const OK_LICENSES = /^(public domain|pd|cc0|cc by(-sa)? ?\d(\.\d)?|cc-by(-sa)?-\d(\.\d)?)/i;

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function download(url, ext) {
  const file = path.join(DIR, `${hash(url)}${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 5000) return file;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// ── Pexels ────────────────────────────────────────────────────────────────────
async function pexels(query, orientation, wantVideo, used) {
  if (!process.env.PEXELS_API_KEY) return null;
  const headers = { Authorization: process.env.PEXELS_API_KEY };
  if (wantVideo) {
    const j = await getJson(`https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=10`, headers);
    for (const v of j.videos || []) {
      if (used.has(`pexels-v-${v.id}`) || v.duration < 4) continue;
      const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height)
        .sort((a, b) => b.width * b.height - a.width * a.height);
      const pick = files.find((f) => Math.min(f.width, f.height) >= 1080 && Math.max(f.width, f.height) <= 2160) || files[0];
      if (!pick) continue;
      used.add(`pexels-v-${v.id}`);
      return { kind: 'video', file: await download(pick.link, '.mp4'), duration: v.duration, source: 'Pexels', url: v.url,
        author: v.user?.name, license: 'Pexels License', attribution: `Video by ${v.user?.name} on Pexels` };
    }
  }
  const j = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=10`, headers);
  for (const p of j.photos || []) {
    if (used.has(`pexels-p-${p.id}`)) continue;
    used.add(`pexels-p-${p.id}`);
    return { kind: 'image', file: await download(p.src.original, '.jpg'), source: 'Pexels', url: p.url,
      author: p.photographer, license: 'Pexels License', attribution: `Photo by ${p.photographer} on Pexels` };
  }
  return null;
}

// ── Pixabay (free for commercial use, no attribution required; needs PIXABAY_API_KEY — free) ──
// Pixabay asks API users to download files (no hotlinking) and to credit Pixabay where results are shown.
async function pixabay(query, orientation, wantVideo, used) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const q = encodeURIComponent(query.slice(0, 100));
  if (wantVideo) {
    const j = await getJson(`https://pixabay.com/api/videos/?key=${key}&q=${q}&safesearch=true&per_page=20`);
    for (const v of j.hits || []) {
      if (used.has(`pixabay-v-${v.id}`) || v.duration < 4) continue;
      const pick = ['large', 'medium'].map((k) => v.videos?.[k]).find((f) => f?.url && Math.min(f.width, f.height) >= 720);
      if (!pick) continue;
      used.add(`pixabay-v-${v.id}`);
      return { kind: 'video', file: await download(pick.url, '.mp4'), duration: v.duration, source: 'Pixabay', url: v.pageURL,
        author: v.user, license: 'Pixabay Content License', attribution: `Video by ${v.user} on Pixabay` };
    }
  }
  const j = await getJson(`https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&safesearch=true&per_page=20` +
    `&orientation=${orientation === 'portrait' ? 'vertical' : 'horizontal'}&min_width=1600`);
  for (const p of j.hits || []) {
    if (used.has(`pixabay-p-${p.id}`)) continue;
    used.add(`pixabay-p-${p.id}`);
    return { kind: 'image', file: await download(p.largeImageURL, '.jpg'), source: 'Pixabay', url: p.pageURL,
      author: p.user, license: 'Pixabay Content License', attribution: `Image by ${p.user} on Pixabay` };
  }
  return null;
}

// ── Wikimedia Commons ─────────────────────────────────────────────────────────
async function wikimedia(query, used) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12' +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=2400`;
  const j = await getJson(api);
  // Rank by how many query words appear in the file title (search relevance alone picks loose matches).
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  const score = (p) => tokens.filter((t) => p.title.toLowerCase().includes(t)).length;
  const pages = Object.values(j.query?.pages || {})
    .sort((a, b) => score(b) - score(a) || (a.index || 0) - (b.index || 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || used.has(`wm-${p.pageid}`)) continue;
    const meta = ii.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName?.value);
    if (!OK_LICENSES.test(license) || Math.min(ii.width, ii.height) < 900) continue;
    used.add(`wm-${p.pageid}`);
    const author = stripHtml(meta.Artist?.value).slice(0, 80) || 'Unknown';
    return { kind: 'image', file: await download(ii.thumburl || ii.url, '.jpg'), source: 'Wikimedia Commons', url: ii.descriptionurl,
      author, license, attribution: `"${stripHtml(meta.ObjectName?.value || p.title.replace(/^File:/, '')).slice(0, 80)}" by ${author}, ${license}, via Wikimedia Commons` };
  }
  return null;
}

// ── The Met Open Access (CC0) ─────────────────────────────────────────────────
async function met(query, used) {
  const s = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`);
  for (const id of (s.objectIDs || []).slice(0, 15)) {
    if (used.has(`met-${id}`)) continue;
    const o = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    if (!o.isPublicDomain || !o.primaryImage) continue;
    used.add(`met-${id}`);
    return { kind: 'image', file: await download(o.primaryImage, '.jpg'), source: 'The Metropolitan Museum of Art', url: o.objectURL,
      author: 'The Met', license: 'CC0', attribution: `${o.title} — The Metropolitan Museum of Art (Open Access, CC0)` };
  }
  return null;
}

/**
 * Finds one asset for a b-roll line. Tries the hinted source first, then the others.
 * @param {{ query: string, source_hint?: string }} item
 * @param {{ orientation: 'portrait'|'landscape', used: Set<string>, preferVideo?: boolean }} opts
 */
export async function findAsset(item, { orientation, used, preferVideo = true }) {
  // A script may pin an exact open-license file (from content/media/candidates.json).
  if (item.media_url && item.license && OK_LICENSES.test(item.license) && !used.has(item.media_url)) {
    used.add(item.media_url);
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(item.media_url);
    try {
      return { kind: isVideo ? 'video' : 'image', file: await download(item.media_url, isVideo ? '.mp4' : '.jpg'), duration: item.duration || 0,
        source: item.source || 'pinned', url: item.page_url || item.media_url, author: item.author || 'Unknown', license: item.license,
        attribution: item.attribution || `${item.author || 'Unknown'}, ${item.license}` };
    } catch (err) {
      console.warn(`[assets] pinned media failed: ${err.message}`);
    }
  }
  const order = {
    pexels: ['pexels', 'pixabay', 'wikimedia', 'met'], pixabay: ['pixabay', 'pexels', 'wikimedia', 'met'],
    wikimedia: ['wikimedia', 'pexels', 'pixabay', 'met'], met: ['met', 'wikimedia', 'pexels', 'pixabay'],
  };
  let sources = order[item.source_hint] || ['pexels', 'pixabay', 'wikimedia', 'met'];
  if (item.wikiOnly) sources = sources.filter((x) => x !== 'pexels' && x !== 'pixabay');
  for (const s of sources) {
    try {
      const a = s === 'pexels' ? await pexels(item.query, orientation, preferVideo, used)
        : s === 'pixabay' ? await pixabay(item.query, orientation, preferVideo, used)
        : s === 'wikimedia' ? await wikimedia(item.query, used)
        : await met(item.query, used);
      if (a) return a;
    } catch (err) {
      console.warn(`[assets] ${s} failed for "${item.query}": ${err.message}`);
    }
  }
  return null;
}
