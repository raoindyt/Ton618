import { Router } from 'express';
import path from 'path';
import { downloadTrack } from '../../modules/downloader/index.js';
import { addTrackToIndex, checkTrackExists } from '../../modules/library/index.js';
import { v4 as uuidv4 } from 'uuid';

let wssGlobal = null;
export function attachWsBridge(wss) {
  wssGlobal = wss;
}
function broadcast(msg) {
  if (!wssGlobal) return;
  const data = JSON.stringify(msg);
  wssGlobal.clients.forEach((c) => {
    try { c.send(data); } catch {}
  });
}

const router = Router();

router.post('/', async (req, res) => {
  const { url, format, title, quality } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const LIB_DIR = req.app.get('LIB_DIR');
  const COVER_DIR = req.app.get('COVER_DIR');

  // Check if track already exists
  const duplicateCheck = checkTrackExists(LIB_DIR, url, title);
  if (duplicateCheck.exists) {
    return res.status(409).json({ 
      error: 'Track already exists', 
      reason: duplicateCheck.reason,
      existingTrack: duplicateCheck.track 
    });
  }

  const jobId = uuidv4();
  res.json({ jobId, status: 'queued' });

  // Run async, no await
  (async () => {
    try {
      const result = await downloadTrack({ url, outDir: LIB_DIR, coverDir: COVER_DIR, format, quality }, (evt) => {
        // Ensure all WS events use the outer jobId (the one returned to the client)
        broadcast({ channel: 'download', ...evt, jobId });
      });
      broadcast({ channel: 'download', type: 'completed', jobId, ...result });
      addTrackToIndex(LIB_DIR, { 
        id: result.title, 
        file: path.basename(result.filePath), 
        title: result.title, 
        artist: result.artist, 
        cover: result.cover ? path.basename(result.cover) : null,
        coverUrl: result.coverUrl,
        href: result.href,
        ext: result.ext,
        sourceUrl: url
      });
    } catch (e) {
      broadcast({ channel: 'download', type: 'failed', jobId, error: String(e.message || e) });
    }
  })();
});

// Check if tracks exist by URLs
router.post('/check', async (req, res) => {
  const { tracks } = req.body || {};
  if (!tracks || !Array.isArray(tracks)) {
    return res.status(400).json({ error: 'Missing tracks array' });
  }

  const LIB_DIR = req.app.get('LIB_DIR');
  const results = {};

  for (const track of tracks) {
    const { url, title } = track;
    const duplicateCheck = checkTrackExists(LIB_DIR, url, title);
    results[url] = {
      exists: duplicateCheck.exists,
      reason: duplicateCheck.reason,
      track: duplicateCheck.exists ? duplicateCheck.track : null
    };
  }

  res.json({ results });
});

export default router;
