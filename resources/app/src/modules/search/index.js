import youtubedl from '../ydlp/exec.js';
import { resolveYtDlpPath } from '../ydlp/resolver.js';

// Ensure yt-dlp path is resolved
resolveYtDlpPath();

function parseJsonLines(output) {
  const lines = output.trim().split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      items.push(obj);
    } catch {
      // ignore non-JSON lines
    }
  }
  return items;
}

function getBestThumbnail(thumbnails) {
  if (!thumbnails || !Array.isArray(thumbnails) || thumbnails.length === 0) {
    return null;
  }
  
  // For SoundCloud, prefer larger, non-blurred thumbnails
  // SoundCloud often has different sizes: t500x500, t300x300, large, etc.
  const preferredSizes = ['t500x500', 'large', 't300x300', 'crop'];
  
  // First try to find by preferred size identifiers in URL
  for (const size of preferredSizes) {
    const thumb = thumbnails.find(t => t.url && t.url.includes(size));
    if (thumb) {
      return thumb.url;
    }
  }
  
  // Sort by dimensions if available (prefer larger images)
  const withDimensions = thumbnails.filter(t => t.width && t.height);
  if (withDimensions.length > 0) {
    withDimensions.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return withDimensions[0].url;
  }
  
  // Fallback to first available thumbnail
  return thumbnails[0].url;
}

export async function searchYouTube(query, limit = 12) {
  // Use regular ytsearch with music filters since ytmsearch syntax is not supported
  let res = await youtubedl(`ytsearch${limit}:${query} music`, {
    dumpSingleJson: true,
    flatPlaylist: true,
    defaultSearch: 'ytsearch',
    matchFilter: 'duration > 30',
  });
  if (typeof res === 'string') {
    try { res = JSON.parse(res); } catch { res = { entries: [] }; }
  }
  const entries = res.entries || [];
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    url: `https://music.youtube.com/watch?v=${e.id}`,
    duration: e.duration,
    uploader: e.uploader || e.channel || e.artist,
    thumbnail: getBestThumbnail(e.thumbnails) || null,
    source: 'youtube',
  }));
}

export async function searchYouTubeLatest(query, limit = 12) {
  // Order by date (newest first) using yt-dlp's ytsearchdate
  let res = await youtubedl(`ytsearch${limit}:${query} music`, {
    dumpSingleJson: true,
    flatPlaylist: true,
    defaultSearch: 'ytsearchdate',
    matchFilter: 'duration > 30',
  });
  if (typeof res === 'string') {
    try { res = JSON.parse(res); } catch { res = { entries: [] }; }
  }
  const entries = res.entries || [];
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    url: `https://music.youtube.com/watch?v=${e.id}`,
    duration: e.duration,
    uploader: e.uploader || e.channel || e.artist,
    thumbnail: getBestThumbnail(e.thumbnails) || null,
    source: 'youtube',
  }));
}

export async function searchSoundCloud(query, limit = 12) {
  let res = await youtubedl(`scsearch${limit}:${query}`, {
    dumpSingleJson: true,
    flatPlaylist: true,
    defaultSearch: 'scsearch',
  });
  if (typeof res === 'string') {
    try { res = JSON.parse(res); } catch { res = { entries: [] }; }
  }
  const entries = res.entries || [];
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    url: e.url || e.webpage_url,
    duration: e.duration,
    uploader: e.uploader || e.uploader_id,
    thumbnail: getBestThumbnail(e.thumbnails) || null,
    source: 'soundcloud',
  }));
}

export async function searchAll(query, limit = 12) {
  const [yt, sc] = await Promise.all([
    searchYouTube(query, limit),
    searchSoundCloud(query, limit)
  ]);
  return [...yt, ...sc];
}

export default {
  searchAll,
  searchYouTube,
  searchYouTubeLatest,
  searchSoundCloud,
};
