// Deezer-based similar artists (no API key required)
// Public REST with CORS. We only need names to expand seeds.

const API = 'https://api.deezer.com';

async function requestJson(url){
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchArtist(name){
  if (!name) return null;
  const data = await requestJson(`${API}/search/artist?q=${encodeURIComponent(name)}`);
  const first = data && Array.isArray(data.data) && data.data.length ? data.data[0] : null;
  return first ? { id: first.id, name: first.name } : null;
}

export async function getRelatedArtistNames(artistId, limit = 5){
  if (!artistId) return [];
  const data = await requestJson(`${API}/artist/${artistId}/related`);
  const arr = data && Array.isArray(data.data) ? data.data : [];
  return arr.slice(0, limit).map(a => a.name).filter(Boolean);
}

export async function getSimilarArtistsDeezer(artistName, limit = 5){
  const a = await searchArtist(artistName);
  if (!a) return [];
  return await getRelatedArtistNames(a.id, limit);
}

export async function getEnhancedSeedsDeezer(seedArtists, maxSimilar = 3){
  const enhanced = new Set(seedArtists);
  for (const name of seedArtists){
    try {
      const related = await getSimilarArtistsDeezer(name, maxSimilar);
      for (const r of related){ enhanced.add(r); }
    } catch {}
  }
  return Array.from(enhanced);
}
