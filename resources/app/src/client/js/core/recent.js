// Lightweight recent-plays tracker using localStorage (offline)
// Exposes recordRecent() and getRecentPlays() and auto-wires to player track change events

const STORAGE_KEY = 'recent_plays_v1';
const MAX_ITEMS = 200;

function loadAll(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return arr.filter(Boolean);
  } catch {}
  return [];
}

function saveAll(items){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS))); } catch {}
}

export function recordRecent(track){
  if (!track || !track.src) return;
  const items = loadAll();
  const id = track.src; // use href/src as stable id
  let found = items.find(x => x.src === id);
  const now = Date.now();
  if (found){
    found.lastPlayed = now;
    found.count = (found.count|0) + 1;
    // update metadata in case it changed
    found.title = track.title || found.title || id;
    found.artist = track.artist || found.artist || '';
    found.coverUrl = track.coverUrl || found.coverUrl || '';
  } else {
    found = {
      src: id,
      title: track.title || id,
      artist: track.artist || '',
      coverUrl: track.coverUrl || '',
      lastPlayed: now,
      count: 1
    };
    items.unshift(found);
  }
  // Deduplicate: keep only one per src
  const seen = new Set();
  const deduped = [];
  for (const it of items.sort((a,b)=> (b.lastPlayed||0) - (a.lastPlayed||0))){
    if (seen.has(it.src)) continue;
    seen.add(it.src);
    deduped.push(it);
  }
  saveAll(deduped);
}

export function getRecentPlays(limit = 20){
  const items = loadAll().sort((a,b)=> (b.lastPlayed||0) - (a.lastPlayed||0));
  return items.slice(0, limit);
}

// Auto-wire: listen to global trackchange event dispatched by player
if (typeof window !== 'undefined'){
  window.addEventListener('trackchange', (e)=>{
    if (e && e.detail) recordRecent(e.detail);
  });
}
