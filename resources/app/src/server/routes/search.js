import { Router } from 'express';
import { searchAll, searchYouTube, searchSoundCloud, searchYouTubeLatest } from '../../modules/search/index.js';
import { testYtDlp } from '../../modules/installer/index.js';

const router = Router();

router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const type = (req.query.type || 'all').toString();
  const limit = parseInt(req.query.limit || '12', 10);
  const sort = (req.query.sort || '').toString();
  
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  
  try {
    // Check if yt-dlp is available (skip test to avoid EBUSY)
    // yt-dlp availability is checked during server startup

    console.log(`Searching for: "${q}" (type: ${type})`);
    let results = [];
    
    if (type === 'yt' || type === 'youtube' || type === 'youtubemusic') {
      if (sort === 'latest') results = await searchYouTubeLatest(q, limit);
      else results = await searchYouTube(q, limit);
    } else if (type === 'sc' || type === 'soundcloud') {
      results = await searchSoundCloud(q, limit);
    } else {
      if (sort === 'latest') {
        // Combine YouTube latest with regular SoundCloud search
        const [yt, sc] = await Promise.all([
          searchYouTubeLatest(q, limit),
          searchSoundCloud(q, limit)
        ]);
        results = [...yt, ...sc];
      } else {
        results = await searchAll(q, limit);
      }
    }
    
    console.log(`Search completed. Found ${results.length} results.`);
    res.json({ items: results });
  } catch (e) {
    console.error('Search error for query:', q, 'Error:', e);
    res.status(500).json({ 
      error: 'Search failed', 
      details: String(e.message || e),
      query: q,
      type: type
    });
  }
});

export default router;
