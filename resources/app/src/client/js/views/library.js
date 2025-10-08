import { qs, qsa } from '../core/dom.js';
import { getLibrary, refreshLibrary, deleteLibraryItem } from '../api.js';
import { showNotification } from '../core/notifications.js';
import { player } from '../player.js';

export async function loadLibrary(){
  if (document.hidden) return;
  const data = await getLibrary();
  const root = qs('#library-list');
  if (!root) return;
  root.innerHTML = '';
  const tracks = data.tracks || [];
  const frag = document.createDocumentFragment();
  tracks.forEach((t, idx)=>{
    const el = document.createElement('div');
    el.className = 'track';
    el.innerHTML = `
      <div class="cover">
        <img src="${t.coverUrl || ''}" loading="lazy" decoding="async" onerror="this.style.display='none'"/>
        <button class="play-overlay" title="Play">
          <svg class="icon"><use href="#i-play"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title">${t.title}</div>
        <div class="artist">${t.artist||''}</div>
      </div>
      <button class="btn-danger btn-delete" title="Delete">Delete</button>
    `;
    // Play on overlay
    el.querySelector('.play-overlay').addEventListener('click', (e)=>{
      e.stopPropagation();
      const queue = tracks.map(x => ({ title: `${x.title}`, artist: x.artist || '', coverUrl: x.coverUrl || '', src: x.href }));
      player.setQueue(queue, idx);
    });
    // Delete button
    el.querySelector('.btn-delete').addEventListener('click', async (e)=>{
      e.stopPropagation();
      try {
        const ok = confirm('Удалить трек из библиотеки?');
        if (!ok) return;
        await deleteLibraryItem(t.file);
        await refreshLibrary();
        await loadLibrary();
        try { showNotification('Трек удалён', 'success'); } catch {}
      } catch (err) {
        try { showNotification(`Не удалось удалить: ${err?.message||err}`, 'error'); } catch {}
      }
    });
    frag.appendChild(el);
  });
  root.appendChild(frag);
}

export function initLibraryControls(){
  const filter = qs('#library-filter');
  if (filter) {
    let t;
    const apply = () => {
      const q = filter.value.toLowerCase();
      qsa('#library-list .track').forEach(el=>{
        const text = el.textContent.toLowerCase();
        el.style.display = text.includes(q) ? '' : 'none';
      });
    };
    filter.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 120); });
  }
  const refreshBtn = qs('#refresh-library');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => refreshLibrary().then(loadLibrary));
  }
  const addBtn = qs('#add-music');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      try {
        if (window.appUtils?.addMusic) {
          const res = await window.appUtils.addMusic();
          const n = res?.imported ?? 0;
          if (n > 0) {
            showNotification(`Added ${n} file(s) to library`, 'success');
          } else {
            showNotification('No files added', 'info');
          }
          await refreshLibrary();
          await loadLibrary();
        } else {
          showNotification('Add Music is available in the desktop app (Electron) only.', 'warning');
        }
      } catch (e) {
        showNotification(`Add Music failed: ${e?.message || e}`, 'error');
      } finally {
        addBtn.disabled = false;
      }
    });
  }
}
