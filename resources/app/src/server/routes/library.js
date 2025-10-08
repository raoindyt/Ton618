import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { loadIndex, saveIndex, scanLibrary } from '../../modules/library/index.js';
import { extractEmbeddedCover, embedCoverIntoMp3, hasEmbeddedCover } from '../../modules/embedder/index.js';

const router = Router();

router.get('/', (req, res) => {
  const LIB_DIR = req.app.get('LIB_DIR');
  try { res.json(loadIndex(LIB_DIR)); } catch (e) {
    res.status(500).json({ error: 'Failed to load library', details: String(e.message || e) });
  }
});

router.post('/refresh', (req, res) => {
  const LIB_DIR = req.app.get('LIB_DIR');
  const COVER_DIR = req.app.get('COVER_DIR');
  try {
    const idx = scanLibrary(LIB_DIR, COVER_DIR);
    saveIndex(LIB_DIR, idx);
    res.json(idx);
  } catch (e) {
    res.status(500).json({ error: 'Failed to scan library', details: String(e.message || e) });
  }
});

// DELETE a single library item by filename
router.delete('/item/:file', (req, res) => {
  const LIB_DIR = req.app.get('LIB_DIR');
  const COVER_DIR = req.app.get('COVER_DIR');
  const file = req.params.file;
  if (!file || /[\\/]/.test(file)) return res.status(400).json({ error: 'Invalid file' });
  const filePath = path.join(LIB_DIR, file);
  try {
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    // Remove audio file
    fs.unlinkSync(filePath);
    // Remove possible external covers for this base name
    const base = file.replace(/\.[^.]+$/, '');
    const exts = ['jpg','jpeg','png','webp'];
    for (const ext of exts) {
      const p = path.join(COVER_DIR, `${base}.${ext}`);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
    // Refresh index
    const idx = scanLibrary(LIB_DIR, COVER_DIR);
    saveIndex(LIB_DIR, idx);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete', details: String(e.message || e) });
  }
});

// Serve embedded cover from MP3: /api/library/cover?file=Artist%20-%20Title.mp3
router.get('/cover', (req, res) => {
  const LIB_DIR = req.app.get('LIB_DIR');
  const file = req.query.file;
  if (!file || /[\\/]/.test(file)) return res.status(400).json({ error: 'Invalid file' });
  const mp3Path = path.join(LIB_DIR, file);
  if (!fs.existsSync(mp3Path)) return res.status(404).json({ error: 'File not found' });
  try {
    const pic = extractEmbeddedCover(mp3Path);
    if (!pic) return res.status(404).json({ error: 'No embedded cover' });
    res.setHeader('Content-Type', pic.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(pic.buffer);
  } catch (e) {
    res.status(500).json({ error: 'Failed to extract cover', details: String(e.message || e) });
  }
});

// Batch embed covers from covers/ directory into MP3s
router.post('/embed-all', async (req, res) => {
  const LIB_DIR = req.app.get('LIB_DIR');
  const COVER_DIR = req.app.get('COVER_DIR');
  const TMP_DIR = req.app.get('TMP_DIR');
  try {
    const files = fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.mp3'));
    const exts = ['jpg','jpeg','png','webp'];
    const summary = { total: files.length, embedded: 0, skipped: 0, missingCover: 0, failed: 0, cleaned: 0 };
    for (const f of files) {
      const base = f.replace(/\.[^.]+$/, '');
      const mp3Path = path.join(LIB_DIR, f);
      try {
        if (hasEmbeddedCover(mp3Path)) { summary.skipped++; continue; }
        const coverPath = exts
          .map(ext => path.join(COVER_DIR, `${base}.${ext}`))
          .find(p => fs.existsSync(p));
        if (!coverPath) { summary.missingCover++; continue; }
        const ok = await embedCoverIntoMp3(mp3Path, coverPath, TMP_DIR);
        if (ok) {
          summary.embedded++;
          // Remove any cover files for this base (all extensions) to keep only MP3
          for (const ext of exts) {
            const p = path.join(COVER_DIR, `${base}.${ext}`);
            if (fs.existsSync(p)) {
              try { fs.unlinkSync(p); summary.cleaned++; } catch {}
            }
          }
        } else {
          summary.failed++;
        }
      } catch {
        summary.failed++;
      }
    }
    // Refresh index after embedding
    const idx = scanLibrary(LIB_DIR, COVER_DIR);
    saveIndex(LIB_DIR, idx);
    res.json({ ok: true, summary });
  } catch (e) {
    res.status(500).json({ error: 'Failed to embed covers', details: String(e.message || e) });
  }
});

// Cleanup covers that are already embedded in MP3s
router.post('/cleanup-covers', (req, res) => {
  const LIB_DIR = req.app.get('LIB_DIR');
  const COVER_DIR = req.app.get('COVER_DIR');
  try {
    const files = fs.readdirSync(LIB_DIR).filter(f => f.toLowerCase().endsWith('.mp3'));
    const exts = ['jpg','jpeg','png','webp'];
    let cleaned = 0;
    for (const f of files) {
      const mp3Path = path.join(LIB_DIR, f);
      if (!hasEmbeddedCover(mp3Path)) continue;
      const base = f.replace(/\.[^.]+$/, '');
      for (const ext of exts) {
        const p = path.join(COVER_DIR, `${base}.${ext}`);
        if (fs.existsSync(p)) {
          try { fs.unlinkSync(p); cleaned++; } catch {}
        }
      }
    }
    // Refresh index after cleanup
    const idx = scanLibrary(LIB_DIR, COVER_DIR);
    saveIndex(LIB_DIR, idx);
    res.json({ ok: true, cleaned });
  } catch (e) {
    res.status(500).json({ error: 'Failed to cleanup covers', details: String(e.message || e) });
  }
});

export default router;
