// Simple cache for recommendations in localStorage

const KEY_ITEMS = 'reco_cached_items_v1';
const KEY_TIME = 'reco_cached_at_v1';

export function getCachedRecommendations(){
  try {
    const raw = localStorage.getItem(KEY_ITEMS);
    const t = localStorage.getItem(KEY_TIME);
    const items = raw ? JSON.parse(raw) : [];
    return { items: Array.isArray(items) ? items : [], at: t ? Number(t) : 0 };
  } catch {
    return { items: [], at: 0 };
  }
}

export function setCachedRecommendations(items){
  try {
    localStorage.setItem(KEY_ITEMS, JSON.stringify(items||[]));
    localStorage.setItem(KEY_TIME, String(Date.now()));
  } catch {}
}
