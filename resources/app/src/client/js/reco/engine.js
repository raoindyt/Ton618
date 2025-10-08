// Recommendation engine: offline scoring and diversity

export const STOPWORDS = new Set(['the','and','feat','ft','official','lyrics','audio','remix','live','video','music','feat.','prod','by']);

export function tokenize(s){
  return (s||'')
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s]+/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

export function normalizeTitle(s){
  return (s||'').toLowerCase().replace(/\s+/g,' ').trim();
}

export function topArtistsFrom(recent, playlists, max = 5){
  const cnt = new Map();
  for (const r of (recent||[])){ if (r.artist) cnt.set(r.artist, (cnt.get(r.artist)||0)+3); }
  for (const pl of (playlists||[])){
    for (const t of (pl.tracks||[])) if (t.artist) cnt.set(t.artist, (cnt.get(t.artist)||0)+1);
  }
  return [...cnt.entries()].sort((a,b)=>b[1]-a[1]).slice(0,max).map(x=>x[0]);
}

export function buildIndexes(recent, playlists){
  const recentSrc = new Set((recent||[]).map(r => r.src));
  const artistCounts = new Map();
  const tokenCounts = new Map();
  const plTracks = [];
  for (const r of (recent||[])){
    const w = tokenize(`${r.title} ${r.artist}`);
    for (const t of w){ tokenCounts.set(t, (tokenCounts.get(t)||0) + 1); }
    if (r.artist) artistCounts.set(r.artist, (artistCounts.get(r.artist)||0) + 1);
  }
  for (const pl of (playlists||[])){
    for (const t of (pl.tracks||[])){
      plTracks.push(t);
      const w = tokenize(`${t.title} ${t.artist}`);
      for (const tk of w){ tokenCounts.set(tk, (tokenCounts.get(tk)||0) + 0.5); }
      if (t.artist) artistCounts.set(t.artist, (artistCounts.get(t.artist)||0) + 0.5);
    }
  }
  return { recentSrc, artistCounts, tokenCounts, plTracks };
}

export function scoreTrack(track, idx){
  const aScore = (track.artist && idx.artistCounts.get(track.artist)) || 0;
  const words = tokenize(`${track.title} ${track.artist}`);
  let tScore = 0;
  for (const w of words){ tScore += (idx.tokenCounts.get(w) || 0); }
  const inPlaylist = idx.plTracks.some(t => t.href === track.href) ? 1 : 0;
  return aScore * 2 + tScore * 0.6 + inPlaylist * 0.8;
}

// Jaccard similarity on tokenized title+artist (rough diversity measure)
export function trackSimilarity(a, b){
  const ta = new Set(tokenize(`${a.title} ${a.artist}`));
  const tb = new Set(tokenize(`${b.title} ${b.artist}`));
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  const uni = ta.size + tb.size - inter;
  return uni ? inter / uni : 0;
}

export function getOfflineTop(library, playlists, recent, limit=5){
  const idx = buildIndexes(recent, playlists);
  const recCount = new Map();
  for (const r of (recent||[])){ recCount.set(r.src, (recCount.get(r.src)||0) + (r.count||1)); }
  const scored = (library||[]).map(t => {
    const base = scoreTrack(t, idx);
    const rc = (recCount.get(t.href)||0) * 0.5;
    const inPl = idx.plTracks.some(x=>x.href===t.href) ? 0.8 : 0;
    return { t, s: base + rc + inPl };
  }).sort((a,b)=> b.s - a.s);
  const picked = [];
  const lambda = 0.6;
  while (picked.length < limit && scored.length){
    let bestIdx = 0; let bestVal = -Infinity;
    for (let i=0;i<scored.length;i++){
      const cand = scored[i];
      let divPenalty = 0;
      for (const p of picked){
        divPenalty = Math.max(divPenalty, trackSimilarity(cand.t, p));
      }
      const val = lambda*cand.s - (1-lambda)*divPenalty*2;
      if (val > bestVal){ bestVal = val; bestIdx = i; }
    }
    const chosen = scored.splice(bestIdx,1)[0];
    picked.push(chosen.t);
  }
  return picked;
}
