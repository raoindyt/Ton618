// Genre-based recommendation enhancement
// Uses both Last.fm tags and local pattern matching

import { getArtistTags } from './lastfm.js';

// Common genre patterns in track titles/descriptions
const GENRE_PATTERNS = {
  'electronic': /electronic|edm|house|techno|trance|dubstep|ambient|synthwave/i,
  'hip-hop': /hip.?hop|rap|trap|drill|boom.?bap/i,
  'rock': /rock|metal|punk|grunge|alternative/i,
  'pop': /pop|mainstream|radio|chart/i,
  'jazz': /jazz|blues|swing|bebop/i,
  'classical': /classical|orchestra|symphony|piano|violin/i,
  'folk': /folk|acoustic|country|indie/i,
  'latin': /latin|reggaeton|salsa|bachata|merengue/i,
  'world': /world|ethnic|traditional|cultural/i
};

export function detectGenreFromText(text) {
  const lower = (text || '').toLowerCase();
  const detected = [];
  
  for (const [genre, pattern] of Object.entries(GENRE_PATTERNS)) {
    if (pattern.test(lower)) {
      detected.push(genre);
    }
  }
  
  return detected;
}

export async function buildGenreProfile(library, recent) {
  const genreCounts = new Map();
  
  // Analyze recent plays with higher weight
  for (const track of (recent || [])) {
    const genres = detectGenreFromText(`${track.title} ${track.artist}`);
    for (const genre of genres) {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 3);
    }
    
    // Try to get Last.fm tags for artist
    try {
      const tags = await getArtistTags(track.artist, 5);
      for (const tag of tags) {
        const normalizedTag = tag.name.toLowerCase();
        genreCounts.set(normalizedTag, (genreCounts.get(normalizedTag) || 0) + 1);
      }
    } catch {}
  }
  
  // Analyze library with lower weight
  const librarySubset = (library || []).slice(0, 100); // Limit for performance
  for (const track of librarySubset) {
    const genres = detectGenreFromText(`${track.title} ${track.artist}`);
    for (const genre of genres) {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    }
  }
  
  // Return top genres
  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre, count]) => ({ genre, count }));
}

export function scoreByGenre(track, genreProfile) {
  if (!genreProfile.length) return 0;
  
  const trackGenres = detectGenreFromText(`${track.title} ${track.artist} ${track.uploader || ''}`);
  let score = 0;
  
  for (const { genre, count } of genreProfile) {
    if (trackGenres.includes(genre)) {
      score += count * 0.5; // Genre match bonus
    }
  }
  
  return score;
}