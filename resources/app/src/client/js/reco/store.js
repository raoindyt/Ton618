// Persistent store for recommendation novelty and feedback
// Uses localStorage. Stores normalized titles and uploader names.

const KEYS = {
  seenTitles: 'reco_seen_titles_v1',
  blockTitles: 'reco_block_titles_v1',
  blockUploaders: 'reco_block_uploaders_v1',
};

function loadSet(key){
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return new Set(arr);
  } catch {}
  return new Set();
}

function saveSet(key, set){
  try { localStorage.setItem(key, JSON.stringify(Array.from(set || []))); } catch {}
}

export function normalize(s){ return (s||'').toLowerCase().trim(); }

export function getExcludes(){
  const seen = loadSet(KEYS.seenTitles);
  const bt = loadSet(KEYS.blockTitles);
  const bu = loadSet(KEYS.blockUploaders);
  // Merge seen and blocked titles for exclusion
  const titles = new Set([...seen, ...bt]);
  return { titles, uploaders: bu };
}

export function markSeenTitles(titles){
  if (!titles || !titles.length) return;
  const set = loadSet(KEYS.seenTitles);
  for (const t of titles){ set.add(normalize(t)); }
  saveSet(KEYS.seenTitles, set);
}

export function blockTitle(title){
  if (!title) return;
  const set = loadSet(KEYS.blockTitles);
  set.add(normalize(title));
  saveSet(KEYS.blockTitles, set);
}

export function blockUploader(name){
  if (!name) return;
  const set = loadSet(KEYS.blockUploaders);
  set.add(normalize(name));
  saveSet(KEYS.blockUploaders, set);
}

export function clearSeen(){ saveSet(KEYS.seenTitles, new Set()); }
export function clearBlocks(){ saveSet(KEYS.blockTitles, new Set()); saveSet(KEYS.blockUploaders, new Set()); }
