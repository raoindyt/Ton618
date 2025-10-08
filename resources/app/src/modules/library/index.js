import fs from 'fs';
import path from 'path';
import NodeID3 from 'node-id3';

const INDEX_FILE = 'index.json';

export function ensureIndex(dir) {
  const idx = path.join(dir, INDEX_FILE);
  if (!fs.existsSync(idx)) fs.writeFileSync(idx, JSON.stringify({ tracks: [] }, null, 2));
  return idx;
}

export function loadIndex(dir) {
  const idx = ensureIndex(dir);
  return JSON.parse(fs.readFileSync(idx, 'utf-8'));
}

export function saveIndex(dir, data) {
  const idx = ensureIndex(dir);
  fs.writeFileSync(idx, JSON.stringify(data, null, 2));
}

export function scanLibrary(libDir, coverDir) {
  const index = { tracks: [] };
  const files = fs.readdirSync(libDir).filter((f) => /\.(mp3|m4a|wav|flac)$/i.test(f));
  for (const f of files) {
    const fp = path.join(libDir, f);
    let tags = {};
    try { tags = NodeID3.read(fp) || {}; } catch {}
    const base = f.replace(/\.(mp3|m4a|wav|flac)$/i, '');
    const possibleCovers = ['jpg','jpeg','png','webp'].map(ext => path.join(coverDir, `${base}.${ext}`));
    const cover = possibleCovers.find((p) => fs.existsSync(p));
    const hasEmbedded = !!(tags.image || tags.APIC || (tags.attachedPicture && tags.attachedPicture.imageBuffer));
    index.tracks.push({
      id: base,
      file: f, // Store relative filename instead of absolute path
      title: tags.title || base,
      artist: tags.artist || '',
      album: tags.album || '',
      cover: cover ? path.basename(cover) : null, // Store relative cover filename (legacy external cover)
      coverUrl: hasEmbedded
        ? `/api/library/cover?file=${encodeURIComponent(f)}`
        : (cover ? `/data/covers/${path.basename(cover)}` : null),
      href: `/data/library/${encodeURIComponent(f)}`,
      ext: f.split('.').pop(),
    });
  }
  return index;
}

export function addTrackToIndex(libDir, track) {
  const data = loadIndex(libDir);
  const exists = data.tracks.find((t) => t.file === track.file);
  if (!exists) {
    data.tracks.push(track);
    saveIndex(libDir, data);
  }
  return data;
}

export function checkTrackExists(libDir, url, title) {
  const data = loadIndex(libDir);
  
  // Check by URL if provided
  if (url) {
    const urlExists = data.tracks.find((t) => t.sourceUrl === url);
    if (urlExists) return { exists: true, reason: 'url', track: urlExists };
  }
  
  // Check by title (case insensitive, trimmed)
  if (title) {
    const normalizedTitle = title.toLowerCase().trim();
    const titleExists = data.tracks.find((t) => 
      t.title.toLowerCase().trim() === normalizedTitle
    );
    if (titleExists) return { exists: true, reason: 'title', track: titleExists };
  }
  
  return { exists: false };
}
