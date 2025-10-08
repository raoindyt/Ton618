// Last.fm API integration for enhanced recommendations
// No API key required for basic artist.getSimilar calls

import { getCached, setCached } from './api-cache.js';
import { getRecoSettings } from './settings.js';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

async function lastfmRequest(method, params = {}) {
  const { lastFmApiKey, useLastFm } = getRecoSettings();
  // If Last.fm integration disabled or no API key, return null to skip
  if (!useLastFm || !lastFmApiKey) {
    return null;
  }
  const url = new URL(LASTFM_BASE);
  url.searchParams.set('method', method);
  url.searchParams.set('format', 'json');
  url.searchParams.set('api_key', lastFmApiKey);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('Last.fm API error:', error);
    return null;
  }
}

export async function getSimilarArtists(artistName, limit = 10) {
  const cacheKey = `similar_${artistName}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await lastfmRequest('artist.getsimilar', {
    artist: artistName,
    limit: limit.toString()
  });
  if (!data?.similarartists?.artist) return [];

  const artists = Array.isArray(data.similarartists.artist) 
    ? data.similarartists.artist 
    : [data.similarartists.artist];
    
  const result = artists.map(a => ({
    name: a.name,
    match: parseFloat(a.match || 0),
    url: a.url
  })).filter(a => a.match > 0.3); // Filter low matches
  
  setCached(cacheKey, result);
  return result;
}

export async function getArtistTags(artistName, limit = 10) {
  const data = await lastfmRequest('artist.gettoptags', {
    artist: artistName,
    limit: limit.toString()
  });
  if (!data?.toptags?.tag) return [];

  const tags = Array.isArray(data.toptags.tag) 
    ? data.toptags.tag 
    : [data.toptags.tag];
    
  return tags.map(t => ({
    name: t.name,
    count: parseInt(t.count || 0)
  })).filter(t => t.count > 10);
}

export async function getTopTracks(artistName, limit = 10) {
  const data = await lastfmRequest('artist.gettoptracks', {
    artist: artistName,
    limit: limit.toString()
  });
  if (!data?.toptracks?.track) return [];

  const tracks = Array.isArray(data.toptracks.track) 
    ? data.toptracks.track 
    : [data.toptracks.track];
    
  return tracks.map(t => ({
    name: t.name,
    playcount: parseInt(t.playcount || 0),
    listeners: parseInt(t.listeners || 0),
    url: t.url
  }));
}

// Enhanced seed generation using Last.fm similar artists
export async function getEnhancedSeeds(seedArtists, maxSimilar = 3) {
  const enhanced = new Set(seedArtists);
  
  for (const artist of seedArtists) {
    try {
      const similar = await getSimilarArtists(artist, maxSimilar);
      for (const sim of similar) {
        if (sim.match > 0.5) { // High similarity threshold
          enhanced.add(sim.name);
        }
      }
    } catch (error) {
      console.warn(`Failed to get similar artists for ${artist}:`, error);
    }
  }
  
  return Array.from(enhanced);
}