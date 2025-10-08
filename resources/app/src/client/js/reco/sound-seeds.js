// Build sound-based artist seeds from captured features
// Uses mean vector of recent plays and compares to artist centroids from library

import { cosine, getFeature } from './features.js';

function meanVec(vectors){
  if (!vectors.length) return null;
  const n = vectors[0].length;
  const acc = new Array(n).fill(0);
  for (const v of vectors){ for (let i=0;i<n;i++) acc[i]+=v[i]; }
  return acc.map(x=>x/vectors.length);
}

export async function getSoundSeeds(library, recent, { maxRecent=15, minTracksPerArtist=2, maxArtists=5 }={}){
  try {
    // 1) Collect recent vectors
    const recentHrefs = Array.from(new Set((recent||[]).map(r=>r.src))).slice(0, maxRecent);
    const recentVecs = [];
    for (const href of recentHrefs){
      const f = await getFeature(href);
      if (f && f.vec) recentVecs.push(f.vec);
    }
    const taste = meanVec(recentVecs);
    if (!taste) return [];

    // 2) Build artist centroids from library features
    const byArtist = new Map();
    // Cap number of library items scanned for performance
    const scan = (library||[]).slice(0, 400);
    for (const t of scan){
      const a = (t.artist||'').trim(); if (!a) continue;
      const f = await getFeature(t.href);
      if (f && f.vec){
        let arr = byArtist.get(a); if (!arr){ arr=[]; byArtist.set(a,arr); }
        arr.push(f.vec);
      }
    }
    const scored = [];
    for (const [artist, vecs] of byArtist.entries()){
      if (vecs.length < minTracksPerArtist) continue;
      const centroid = meanVec(vecs);
      const sim = cosine(taste, centroid);
      scored.push({ artist, sim });
    }
    scored.sort((a,b)=> b.sim - a.sim);
    return scored.slice(0, maxArtists).map(x=>x.artist);
  } catch {
    return [];
  }
}
