import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback) {
  try {
    ensureFile(filePath, fallback);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null') || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

router.use((req, res, next) => {
  const dataDir = req.app.get('DATA_DIR');
  req.playlistsFile = path.join(dataDir, 'playlists.json');
  next();
});

// GET all playlists
router.get('/', (req, res) => {
  const db = readJson(req.playlistsFile, { playlists: [] });
  res.json(db);
});

// Create playlist { name }
router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || String(name).trim() === '') return res.status(400).json({ error: 'Name is required' });
  const db = readJson(req.playlistsFile, { playlists: [] });
  const pl = { id: genId(), name: String(name).trim(), tracks: [] };
  db.playlists.push(pl);
  writeJson(req.playlistsFile, db);
  res.json(pl);
});

// Rename/update playlist { name?, tracks? }
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, tracks } = req.body || {};
  const db = readJson(req.playlistsFile, { playlists: [] });
  const pl = db.playlists.find(p => p.id === id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  if (typeof name === 'string') pl.name = name.trim();
  if (Array.isArray(tracks)) pl.tracks = tracks;
  writeJson(req.playlistsFile, db);
  res.json(pl);
});

// Delete playlist
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = readJson(req.playlistsFile, { playlists: [] });
  const i = db.playlists.findIndex(p => p.id === id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  const [removed] = db.playlists.splice(i, 1);
  writeJson(req.playlistsFile, db);
  res.json({ ok: true, removed });
});

// Add track { track: { href, title, artist, coverUrl } }
router.post('/:id/tracks', (req, res) => {
  const { id } = req.params;
  const { track } = req.body || {};
  if (!track || !track.href) return res.status(400).json({ error: 'Track with href is required' });
  const db = readJson(req.playlistsFile, { playlists: [] });
  const pl = db.playlists.find(p => p.id === id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  pl.tracks.push({
    href: track.href,
    title: track.title || track.href,
    artist: track.artist || '',
    coverUrl: track.coverUrl || '',
  });
  writeJson(req.playlistsFile, db);
  res.json(pl);
});

// Remove track by index
router.delete('/:id/tracks/:index', (req, res) => {
  const { id, index } = req.params;
  const idx = Number(index);
  const db = readJson(req.playlistsFile, { playlists: [] });
  const pl = db.playlists.find(p => p.id === id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  if (Number.isNaN(idx) || idx < 0 || idx >= pl.tracks.length) return res.status(400).json({ error: 'Bad index' });
  const [removed] = pl.tracks.splice(idx, 1);
  writeJson(req.playlistsFile, db);
  res.json({ ok: true, removed, playlist: pl });
});

// Reorder tracks { from, to }
router.post('/:id/reorder', (req, res) => {
  const { id } = req.params;
  const { from, to } = req.body || {};
  const db = readJson(req.playlistsFile, { playlists: [] });
  const pl = db.playlists.find(p => p.id === id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  const f = Number(from), t = Number(to);
  if ([f, t].some(n => Number.isNaN(n)) || f < 0 || t < 0 || f >= pl.tracks.length || t >= pl.tracks.length) {
    return res.status(400).json({ error: 'Bad indices' });
  }
  const [item] = pl.tracks.splice(f, 1);
  pl.tracks.splice(t, 0, item);
  writeJson(req.playlistsFile, db);
  res.json(pl);
});

export default router;
