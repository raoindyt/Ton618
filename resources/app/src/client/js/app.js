import { player } from './player.js';
import { setActiveView, qs, qsa } from './core/dom.js';
import { showNotification } from './core/notifications.js';
import { initSearchControls } from './views/search.js';
import { initLibraryControls, loadLibrary } from './views/library.js';
import { initWS } from './ws/init.js';
import { hideProgressModal } from './ws/progress-modal.js';
import { initStars, setStarsEnabled } from './ui/stars.js';
import { initEqualizer } from './ui/equalizer.js';
import { initElasticVolume } from './ui/volume.js';
import { getSettings, onSettingsChange } from './core/settings.js';
import { initSettingsView } from './views/settings.js';
import { initPlaylistsView } from './views/playlists.js';
import { initRecommendationsView } from './views/reco.js';
import './core/recent.js';
import './reco/features.js';
import { initAutoRecommendations, scheduleAutoRecommendations } from './reco/auto.js';
import { initLayout } from './core/layout.js';

let libraryLoaded = false;

// setActiveView moved to core/dom.js

function getActiveType(){
  const btn = qs('#search-pills .pill.active');
  return btn ? btn.dataset.type : 'all';
}

// Search pills setup moved to views/search.js (initSearchControls)

// Search results rendering moved to views/search.js

// Track status check moved to views/search.js

// Result item rendering moved to views/search.js

// Search handler moved to views/search.js

// Library rendering and controls moved to views/library.js

// WebSocket setup moved to ws/init.js

function initNav(){
  qsa('.sidebar button').forEach(btn=>btn.addEventListener('click',()=>setActiveView(btn.dataset.view)));
  const closeBtn = qs('#close-progress');
  if (closeBtn) closeBtn.addEventListener('click', hideProgressModal);
  // Delegate to modules
  initSearchControls();
  initLibraryControls();
}

// Progress modal logic moved to ws/progress-modal.js

// Stars animation moved to ui/stars.js

// Equalizer moved to ui/equalizer.js

// Volume control moved to ui/volume.js

// Notifications moved to core/notifications.js

window.addEventListener('DOMContentLoaded', ()=>{
  initLayout();
  initNav();
  initWS({ onCompleted: () => { if (libraryLoaded) loadLibrary(); scheduleAutoRecommendations('download_completed'); } });
  // Stars according to settings
  initStars();
  const settings = getSettings();
  setStarsEnabled(!!settings.enableStars);
  initEqualizer();
  initElasticVolume();
  initSettingsView();
  initPlaylistsView();
  initRecommendationsView();
  initAutoRecommendations();
  onSettingsChange((s)=>{
    setStarsEnabled(!!s.enableStars);
  });
  loadLibrary().then(() => { libraryLoaded = true; });
  if (window.appUtils?.isElectron) {
    showNotification('Запущено в режиме Electron', 'success');
  }
  // Lazy reload Library when view becomes active and visible
  document.addEventListener('viewchange', (e)=>{
    if (e?.detail?.view === 'library' && libraryLoaded && !document.hidden) {
      loadLibrary();
    }
  });
});
