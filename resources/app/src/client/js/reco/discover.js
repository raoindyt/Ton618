import { topArtistsFrom, normalizeTitle } from './engine.js';
import { search } from '../api.js';
import { getExcludes } from './store.js';
import { getSoundSeeds } from './sound-seeds.js';
import { getEnhancedSeeds } from './lastfm.js';
import { getEnhancedSeedsDeezer } from './deezer.js';
import { buildGenreProfile, scoreByGenre } from './genres.js';
import { selectDiverseItems } from './diversity.js';
import { getRecoSettings } from './settings.js';

// Discover new music from YouTube/SoundCloud using seed artists.
// Returns an array of unified items: { id?, url, title, uploader, thumbnail, source }
export async function discoverNewMusic({ library, playlists, recent }, limit = 16){
  let seeds = topArtistsFrom(recent, playlists, 5);
  // Fallback: derive top artists from library if no recent/playlist data
  if (!seeds.length) {
    const freq = new Map();
    for (const t of (library||[])){
      const a = (t.artist||'').trim();
      if (a) freq.set(a, (freq.get(a)||0)+1);
    }
    seeds = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
  }
  
  // Merge in sound-based seeds (from captured features)
  try {
    const sSeeds = await getSoundSeeds(library, recent, { maxRecent: 15, minTracksPerArtist: 2, maxArtists: 5 });
    if (sSeeds && sSeeds.length) {
      const set = new Set(seeds);
      for (const a of sSeeds) if (!set.has(a)) seeds.push(a);
    }
  } catch {}
  
  // Get user settings
  const settings = getRecoSettings();
  
  // Enhance seeds with Last.fm similar artists (if enabled and API key present),
  // otherwise fallback to Deezer public API (no key required)
  const before = new Set(seeds.map(s=>s.toLowerCase()));
  if (settings.useLastFm && (settings.lastFmApiKey || '').trim()) {
    try {
      seeds = await getEnhancedSeeds(seeds, settings.maxSimilarArtists || 2);
    } catch {}
  }
  // If no additions after Last.fm or Last.fm disabled/missing key, use Deezer
  const after = new Set(seeds.map(s=>s.toLowerCase()));
  if (after.size === before.size) {
    try {
      const dz = await getEnhancedSeedsDeezer(seeds, settings.maxSimilarArtists || 2);
      // Merge while preserving order: prefer original seeds first
      const set = new Set(seeds);
      for (const a of dz) if (!set.has(a)) seeds.push(a);
    } catch {}
  }
  
  // Build genre profile for scoring (if enabled)
  let genreProfile = [];
  if (settings.useGenreMatching) {
    genreProfile = await buildGenreProfile(library, recent);
  }

  const queries = [];
  if (seeds.length){
    for (const a of seeds){
      queries.push(`${a} official audio`);
      queries.push(`${a} new`);
    }
  } else {
    // Last resort generic queries
    queries.push('new music official audio');
    queries.push('new rap music');
    queries.push('new electronic music');
    queries.push('new pop music');
  }
  const qset = Array.from(new Set(queries)).slice(0, 6);

  const results = [];
  for (const q of qset){
    try {
      const arr = await search(q, 'all', { sort: 'latest', limit: 12 });
      for (const it of arr){ results.push(it); }
    } catch {}
  }

  const libByTitle = new Set((library||[]).map(t=>normalizeTitle(t.title)));
  const { titles: seenTitles, uploaders: blockedUploaders } = getExcludes();
  const seen = new Set();
  const scored = [];
  const seedsLower = seeds.map(s=>s.toLowerCase());
  const soundSeedSet = new Set();
  try {
    const sSeeds = await getSoundSeeds(library, recent, { maxRecent: 15, minTracksPerArtist: 2, maxArtists: 5 });
    for (const a of (sSeeds||[])) soundSeedSet.add(a.toLowerCase());
  } catch {}
  for (const r of results){
    const key = `${r.source}:${r.id || r.url}`;
    if (seen.has(key)) continue; seen.add(key);
    const title = r.title || '';
    const uploader = r.uploader || '';
    const nt = normalizeTitle(title);
    if (libByTitle.has(nt)) continue;
    if (seenTitles.has(nt)) continue;
    if (blockedUploaders.has((uploader||'').toLowerCase().trim())) continue;
    let s = 0;
    let matchedSeed = '';
    const tl = title.toLowerCase();
    const ul = uploader.toLowerCase();
    for (const al of seedsLower){
      if (tl.includes(al) || ul.includes(al)) {
        const base = (tl.includes(al) ? 2.5 : 0) + (ul.includes(al) ? 1.5 : 0);
        const bonus = soundSeedSet.has(al) ? 1.5 : 0; // extra boost if seed came from sound similarity
        s += base + bonus;
        if (!matchedSeed) matchedSeed = al;
      }
    }
    
    // Add genre-based scoring (if enabled)
    if (settings.useGenreMatching) {
      const genreScore = scoreByGenre(r, genreProfile) * (settings.genreWeight || 0.5);
      s += genreScore;
    }
    
    const t = title.toLowerCase();
    // Apply exclusion filters based on settings
    if (settings.excludeLive && /live|concert|tour/.test(t)) s -= 2.0;
    if (settings.excludeCovers && /cover|covers/.test(t)) s -= 1.5;
    if (settings.excludeInstrumental && /instrumental|karaoke/.test(t)) s -= 1.0;
    if (/mix|full album/.test(t)) s -= 1.0;
    scored.push({ r, s, matchedSeed, score: s }); // Add score property for diversity algorithm
  }
  scored.sort((a,b)=> b.s - a.s);

  const buckets = new Map();
  for (const s of seedsLower) buckets.set(s, []);
  const others = [];
  for (const it of scored){
    if (it.matchedSeed && buckets.has(it.matchedSeed)) buckets.get(it.matchedSeed).push(it);
    else others.push(it);
  }
  const picked = [];
  const perUploader = new Map();
  const seenTitle = new Set();
  const maxPerUploader = 2;
  const tryPick = (arr)=>{
    while (arr.length){
      const it = arr.shift();
      const up = (it.r.uploader||'').toLowerCase();
      const nt = normalizeTitle(it.r.title||'');
      if (seenTitle.has(nt)) continue;
      const cnt = perUploader.get(up)||0;
      if (cnt >= maxPerUploader) continue;
      perUploader.set(up, cnt+1);
      seenTitle.add(nt);
      picked.push(it.r);
      return true;
    }
    return false;
  };
  while (picked.length < limit){
    let progressed = false;
    for (const s of seedsLower){
      if (picked.length >= limit) break;
      const b = buckets.get(s) || [];
      if (tryPick(b)) { progressed = true; buckets.set(s, b); }
    }
    if (!progressed) break;
  }
  // Use diversity algorithm for remaining slots
  const remainingSlots = limit - picked.length;
  if (remainingSlots > 0 && others.length > 0) {
    const diverseOthers = selectDiverseItems(others, remainingSlots, settings.diversityLevel || 0.6);
    for (const item of diverseOthers) {
      const up = (item.r.uploader||'').toLowerCase();
      const nt = normalizeTitle(item.r.title||'');
      if (!seenTitle.has(nt)) {
        const cnt = perUploader.get(up)||0;
        if (cnt < maxPerUploader) {
          perUploader.set(up, cnt+1);
          seenTitle.add(nt);
          picked.push(item.r);
        }
      }
    }
  }
  
  return picked.slice(0, limit);
}

export function toExternalItems(items){
  return (items||[]).map(it => ({ _external: true, url: it.url, title: it.title, artist: it.uploader||'', coverUrl: it.thumbnail||'' }));
}
