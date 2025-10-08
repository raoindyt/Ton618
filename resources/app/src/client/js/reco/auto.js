// Automatic background recommendations while app window is active
// Triggers when: (a) player track changes, (b) downloads complete (hook via app.js),
// and only when document is visible and user is active. Results are cached for the UI.

import { getLibrary, getPlaylists } from '../api.js';
import { getRecentPlays } from '../core/recent.js';
import { discoverNewMusic, toExternalItems } from './discover.js';
import { setCachedRecommendations } from './cache.js';
import { markSeenTitles } from './store.js';
import { player } from '../player.js';

let lastRunAt = 0;
let running = false;
let lastUserActivity = Date.now();
let visibility = !document.hidden;

function canRun(){
  if (!visibility) return false;
  const userActive = (Date.now() - lastUserActivity) < 30000; // 30s
  const playing = player && player.audio && !player.audio.paused;
  return userActive || playing;
}

function onActivity(){ lastUserActivity = Date.now(); }

document.addEventListener('visibilitychange', ()=>{ visibility = !document.hidden; });
['mousemove','keydown','wheel','pointerdown','touchstart'].forEach(ev=>
  window.addEventListener(ev, onActivity, { passive: true })
);

async function runOnce(){
  if (running) return false;
  if (!canRun()) return false;
  const now = Date.now();
  if (now - lastRunAt < 3*60*1000) return false; // throttle 3 minutes
  running = true;
  try {
    const [lib, pls] = await Promise.all([
      getLibrary().catch(()=>({ tracks: [] })),
      getPlaylists().catch(()=>({ playlists: [] })),
    ]);
    const library = lib.tracks||[];
    const playlists = pls.playlists||[];
    const recent = getRecentPlays(50);
    const items = await discoverNewMusic({ library, playlists, recent }, 20);
    const mapped = toExternalItems(items);
    setCachedRecommendations(mapped);
    try { markSeenTitles(mapped.map(i=>i.title)); } catch {}
    lastRunAt = Date.now();
    return true;
  } catch {
    return false;
  } finally {
    running = false;
  }
}

let timer = null;
function schedule(intervalMs = 10000){
  if (timer) clearTimeout(timer);
  timer = setTimeout(async ()=>{
    if (await runOnce()) {
      // After success, schedule next check later
      schedule(60*1000);
    } else {
      // If couldn't run, try again a bit later while user active
      schedule(15000);
    }
  }, intervalMs);
}

export function initAutoRecommendations(){
  schedule(5000);
  window.addEventListener('trackchange', ()=> schedule(4000));
}

export function scheduleAutoRecommendations(reason='manual'){
  // For external triggers like download completed
  schedule(2000);
}

export async function runNowAndCache(){
  await runOnce();
}
