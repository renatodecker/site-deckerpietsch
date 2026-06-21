#!/usr/bin/env node
/**
 * Download sticker images from Wikimedia Commons via Wikidata.
 *
 * Usage:
 *   node scripts/download-sticker-images.mjs              # generate mapping only
 *   node scripts/download-sticker-images.mjs --download    # also download images
 *   node scripts/download-sticker-images.mjs --resume      # skip cached entries
 *
 * Output:
 *   album/data/image-map.json   – { "num": "Commons_filename", ... }
 *   album/images/stickers/N.jpg – downloaded thumbnails (with --download)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const STICKERS_FILE = path.join(ROOT, 'album/data/stickers.json');
const MAP_FILE = path.join(ROOT, 'album/data/image-map.json');
const CACHE_FILE = path.join(ROOT, 'album/data/.image-cache.json');
const IMAGE_DIR = path.join(ROOT, 'album/images/stickers');
const THUMB_WIDTH = 400;
const DELAY_MS = 600;

const UA = 'StickerAlbumBot/1.0 (https://decker.app.br/album; renatodecker@yahoo.com.br)';

const doDownload = process.argv.includes('--download');
const resume = process.argv.includes('--resume');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Cache ────────────────────────────────────────────────────
let cache = {};
if (existsSync(CACHE_FILE)) {
  try { cache = JSON.parse(readFileSync(CACHE_FILE, 'utf-8')); } catch { cache = {}; }
}
function saveCache() {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Wikidata helpers ─────────────────────────────────────────
async function wikidataSearch(query, lang = 'en') {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('search', query);
  url.searchParams.set('language', lang);
  url.searchParams.set('type', 'item');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  return (await res.json()).search || [];
}

async function wikidataGetEntity(id) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', id);
  url.searchParams.set('props', 'claims');
  url.searchParams.set('format', 'json');

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Entity HTTP ${res.status}`);
  const data = await res.json();
  return data.entities?.[id] || null;
}

function claimValue(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!claims || claims.length === 0) return null;
  return claims[0].mainsnak?.datavalue?.value || null;
}

function claimValues(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!claims) return [];
  return claims.map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
}

// Q937857 = association football player
function isFootballer(entity) {
  const occupations = claimValues(entity, 'P106');
  return occupations.some(v => v.id === 'Q937857');
}

function getImage(entity) {
  const val = claimValue(entity, 'P18');
  return typeof val === 'string' ? val : null;
}

// ── Search strategies ────────────────────────────────────────
function nameVariants(name) {
  const variants = [name];

  // Remove abbreviation dots: "G. Ochoa" → "G Ochoa"
  if (name.includes('.')) {
    variants.push(name.replace(/\./g, ''));
  }
  // Surname only: "G. Ochoa" → "Ochoa"
  const parts = name.split(/\s+/);
  if (parts.length >= 2 && parts[0].length <= 2) {
    variants.push(parts.slice(1).join(' '));
  }
  return [...new Set(variants)];
}

async function findPlayer(name, teamName) {
  const variants = nameVariants(name);

  for (const variant of variants) {
    for (const lang of ['en', 'pt']) {
      await sleep(DELAY_MS);
      const results = await wikidataSearch(variant, lang);

      for (const r of results) {
        await sleep(DELAY_MS);
        const entity = await wikidataGetEntity(r.id);
        if (!entity) continue;

        if (!isFootballer(entity)) continue;

        const image = getImage(entity);
        if (image) return { id: r.id, image };
      }
    }
  }
  return null;
}

async function findStadium(name) {
  for (const lang of ['en', 'pt', 'es']) {
    await sleep(DELAY_MS);
    const results = await wikidataSearch(name, lang);

    for (const r of results) {
      await sleep(DELAY_MS);
      const entity = await wikidataGetEntity(r.id);
      if (!entity) continue;

      const image = getImage(entity);
      if (image) return { id: r.id, image };
    }
  }
  return null;
}

// ── Download ─────────────────────────────────────────────────
function commonsUrl(filename, width = THUMB_WIDTH) {
  const encoded = encodeURIComponent(filename.replace(/ /g, '_'));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`;
}

async function downloadImage(filename, destPath) {
  const url = commonsUrl(filename);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buffer);
  return buffer.length;
}

// ── Main ─────────────────────────────────────────────────────
const stickers = JSON.parse(readFileSync(STICKERS_FILE, 'utf-8'));
const imageMap = existsSync(MAP_FILE)
  ? JSON.parse(readFileSync(MAP_FILE, 'utf-8'))
  : {};

if (doDownload) mkdirSync(IMAGE_DIR, { recursive: true });

const processable = stickers.filter(s =>
  s.type === 'jogador' || s.type === 'stadium'
);

// Deduplicate stadiums (each appears twice in the album)
const seenStadiums = new Set();

let found = 0, notFound = 0, skipped = 0, errors = 0;

console.log(`\n🏟️  Sticker Image Mapper`);
console.log(`   ${processable.length} searchable stickers (${stickers.length - processable.length} skipped by type)`);
console.log(`   Mode: ${doDownload ? 'map + download' : 'map only'}\n`);

for (let i = 0; i < processable.length; i++) {
  const s = processable[i];
  const progress = `[${i + 1}/${processable.length}]`;

  // Skip if already in map and resuming
  if (resume && imageMap[s.num]) {
    skipped++;
    continue;
  }

  // Skip if cached as not found
  if (resume && cache[s.num] === 'not_found') {
    skipped++;
    continue;
  }

  // Deduplicate stadium pairs (same stadium name)
  if (s.type === 'stadium') {
    if (seenStadiums.has(s.name)) {
      const prev = Object.entries(imageMap).find(([k, v]) => {
        const ps = stickers.find(st => st.num === parseInt(k));
        return ps && ps.name === s.name;
      });
      if (prev) {
        imageMap[s.num] = prev[1];
        skipped++;
        continue;
      }
    }
    seenStadiums.add(s.name);
  }

  try {
    let result;
    if (s.type === 'jogador') {
      console.log(`${progress} 🔍 ${s.name} (${s.team})`);
      result = await findPlayer(s.name, s.team);
    } else if (s.type === 'stadium') {
      console.log(`${progress} 🏟️  ${s.name}`);
      result = await findStadium(s.name);
    }

    if (result?.image) {
      imageMap[s.num] = result.image;
      found++;
      console.log(`   ✅ ${result.image}`);

      if (doDownload) {
        const dest = path.join(IMAGE_DIR, `${s.num}.jpg`);
        if (!existsSync(dest)) {
          await sleep(DELAY_MS);
          const bytes = await downloadImage(result.image, dest);
          console.log(`   📥 ${(bytes / 1024).toFixed(0)} KB`);
        }
      }
    } else {
      cache[s.num] = 'not_found';
      notFound++;
      console.log(`   ❌ not found`);
    }
  } catch (err) {
    errors++;
    cache[s.num] = 'error';
    console.error(`   ⚠️  ${err.message}`);
  }

  // Save progress periodically
  if (i % 10 === 0) {
    writeFileSync(MAP_FILE, JSON.stringify(imageMap, null, 2));
    saveCache();
  }
}

// Final save
writeFileSync(MAP_FILE, JSON.stringify(imageMap, null, 2));
saveCache();

console.log(`\n── Results ──`);
console.log(`   ✅ Found:     ${found}`);
console.log(`   ❌ Not found: ${notFound}`);
console.log(`   ⏭️  Skipped:   ${skipped}`);
console.log(`   ⚠️  Errors:    ${errors}`);
console.log(`   📄 Map saved: ${MAP_FILE}\n`);
