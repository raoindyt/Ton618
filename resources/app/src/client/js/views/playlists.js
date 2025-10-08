import { qs } from '../core/dom.js';
import { showNotification } from '../core/notifications.js';
import { player } from '../player.js';
import { getPlaylists, createPlaylist, deletePlaylist, renamePlaylist, addTrackToPlaylist, removeTrackFromPlaylist } from '../api.js';
import { getLibrary } from '../api.js';

let state = {
  playlists: [],
  activeId: null,
  libraryCache: null,
};

function h(tag, attrs = {}, html = ''){
  const el = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  if (html) el.innerHTML = html;
  return el;
}

async function refresh(){
  const data = await getPlaylists();
  state.playlists = data.playlists || [];
  if (!state.activeId && state.playlists[0]) state.activeId = state.playlists[0].id;
  render();
}

function render(){
  const root = qs('#playlists-root');
  if (!root) return;
  const left = h('div', { class: 'pl-left card glass' });
  const right = h('div', { class: 'pl-right card glass' });

  // Left: header + list
  const hdr = h('div', { class: 'pl-header' });
  const inName = h('input', { id: 'pl-new-name', placeholder: 'New playlist name...' });
  const btnCreate = h('button', { class: 'btn-primary' }, 'Create');
  btnCreate.addEventListener('click', async ()=>{
    const name = inName.value.trim(); if(!name) return;
    await createPlaylist(name); inName.value=''; await refresh();
  });
  hdr.append(inName, btnCreate);

  const list = h('div', { class: 'pl-list' });
  state.playlists.forEach(pl => {
    const row = h('div', { class: 'pl-row' });
    // Cover collage (2x2) from first 4 track covers
    const cov = h('div', { class: 'pl-cover', title: pl.name });
    const covers = (pl.tracks||[]).map(t=>t.coverUrl).filter(Boolean).slice(0,4);
    for(let i=0;i<4;i++){
      const src = covers[i] || '';
      const slot = h('div', { class: 'pl-c-slot' });
      const img = h('img', { src, loading:'lazy', decoding:'async' });
      img.onerror = () => { img.style.display='none'; };
      slot.appendChild(img);
      cov.appendChild(slot);
    }
    const name = h('div', { class: 'pl-name' }, pl.name);
    const actions = h('div', { class: 'pl-actions' });
    // Kebab menu (three dots) → opens modal instead of dropdown
    const bMore = h('button', { class: 'icon-btn ghost pl-more', title: 'Ещё' }, '⋯');
    row.classList.toggle('active', pl.id === state.activeId);
    row.addEventListener('click', ()=>{ state.activeId = pl.id; render(); });
    bMore.addEventListener('click', (e)=>{ e.stopPropagation(); openActionsModal(pl); });
    actions.append(bMore);
    row.append(cov, name, actions);
    list.appendChild(row);
  });
  left.append(hdr, list);

  // Right: tracks of active
  const pl = state.playlists.find(p=>p.id===state.activeId);
  if (pl){
    const header = h('div', { class: 'pl-tracks-header' });
    header.append(h('h3', {}, pl.name));
    const btnPlayAll = h('button', { class:'btn-primary' }, 'Play All');
    const btnAdd = h('button', { class:'btn-secondary' }, 'Добавить из библиотеки');
    btnPlayAll.addEventListener('click', ()=> playPlaylist(pl));
    btnAdd.addEventListener('click', ()=> openAddFromLibrary(pl));
    header.append(btnPlayAll, btnAdd);

    const list = h('div', { class: 'pl-tracks' });
    (pl.tracks||[]).forEach((t, idx)=>{
      const row = h('div', { class: 'track' });
      row.innerHTML = `
        <img src="${t.coverUrl||''}" onerror="this.style.display='none'"/>
        <div class="meta"><div class="title">${t.title}</div><div class="artist">${t.artist||''}</div></div>
        <div class="pl-t-actions">
          <button data-act="play">Play</button>
          <button data-act="remove">Remove</button>
        </div>`;
      row.querySelector('[data-act="play"]').addEventListener('click', ()=>{
        const queue = (pl.tracks||[]).map(x=>({ title:x.title, artist:x.artist||'', coverUrl:x.coverUrl||'', src:x.href }));
        player.setQueue(queue, idx);
      });
      row.querySelector('[data-act="remove"]').addEventListener('click', async ()=>{
        await removeTrackFromPlaylist(pl.id, idx); await refresh();
      });
      list.appendChild(row);
    });
    right.append(header, list);
  } else {
    right.append(h('div', {}, 'No playlist selected'));
  }

  root.innerHTML = '';
  const wrap = h('div', { class: 'pl-wrap' });
  wrap.append(left, right);
  root.appendChild(wrap);
}

function openActionsModal(pl){
  const modal = document.createElement('div');
  modal.className = 'progress-modal show';
  modal.innerHTML = `
    <div class="progress-modal-content" style="max-width:420px;min-width:320px">
      <div class="progress-header">
        <h3>Действия с плейлистом</h3>
        <button class="close-btn" id="pl-act-close">×</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
        <button class="btn-secondary" id="pl-act-rename">Переименовать</button>
        <button class="btn-danger" id="pl-act-delete">Удалить</button>
        <div style="height:2px"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  const onClose = ()=>{ modal.remove(); document.body.classList.remove('modal-open'); };
  modal.querySelector('#pl-act-close').addEventListener('click', onClose);
  modal.addEventListener('click', (e)=>{ if (e.target === modal) onClose(); });
  modal.addEventListener('keydown', (e)=>{ if (e.key==='Escape') onClose(); });
  // Actions
  modal.querySelector('#pl-act-rename').addEventListener('click', async ()=>{
    const nn = prompt('Rename playlist', pl.name);
    if (typeof nn === 'string' && nn.trim()) { await renamePlaylist(pl.id, nn.trim()); await refresh(); }
    onClose();
  });
  modal.querySelector('#pl-act-delete').addEventListener('click', async ()=>{
    if (confirm('Delete this playlist?')) { await deletePlaylist(pl.id); if (state.activeId===pl.id) state.activeId=null; await refresh(); }
    onClose();
  });
}

async function playPlaylist(pl){
  const queue = (pl.tracks||[]).map(x=>({ title:x.title, artist:x.artist||'', coverUrl:x.coverUrl||'', src:x.href }));
  if (queue.length) player.setQueue(queue, 0);
}

async function openAddFromLibrary(pl){
  if (!state.libraryCache) {
    try { const lib = await getLibrary(); state.libraryCache = lib.tracks || []; } catch { state.libraryCache = []; }
  }
  const modal = document.createElement('div');
  modal.className = 'progress-modal pl-modal show';
  modal.id = 'pl-modal';
  modal.innerHTML = `
    <div class="progress-modal-content">
      <div class="progress-header">
        <h3 style="margin-right:auto">Add from Library</h3>
        <input id="pl-filter" type="search" placeholder="Filter..." style="min-width:180px" />
        <span id="pl-sel-count" title="Number of selected tracks"></span>
        <button id="pl-select-all">Select All</button>
        <button id="pl-add-selected" class="btn-primary">Add Selected</button>
        <button class="close-btn" id="pl-close">×</button>
      </div>
      <div class="modal-body">
        <div class="modal-list"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  const onClose = ()=> { modal.remove(); document.body.classList.remove('modal-open'); };
  modal.querySelector('#pl-close').addEventListener('click', onClose);
  modal.addEventListener('keydown', (e)=>{ if (e.key==='Escape') onClose(); });

  const list = modal.querySelector('.modal-list');
  const frag = document.createDocumentFragment();
  const rows = [];
  state.libraryCache.forEach((t, i)=>{
    const el = document.createElement('div'); el.className='track modal-track';
    el.innerHTML = `
      <input type="checkbox" class="pl-chk" />
      <img src="${t.coverUrl||''}" width="44" height="44" style="object-fit:cover;border-radius:8px;display:block" onerror="this.style.display='none'"/>
      <div class="meta"><div class="title">${t.title}</div><div class="artist">${t.artist||''}</div></div>
      <button class="small">Add</button>`;
    const chk = el.querySelector('.pl-chk');
    const btnAdd = el.querySelector('button');
    const syncSelClass = ()=>{ el.classList.toggle('selected', chk.checked); };
    const toggle = ()=>{ chk.checked = !chk.checked; syncSelClass(); updateSelCount(); };
    el.addEventListener('click', (ev)=>{ if (ev.target===btnAdd || ev.target===chk) return; toggle(); });
    chk.addEventListener('change', ()=>{ syncSelClass(); updateSelCount(); });
    btnAdd.addEventListener('click', async ()=>{
      btnAdd.disabled = true;
      await addTrackToPlaylist(pl.id, { href:t.href, title:t.title, artist:t.artist, coverUrl:t.coverUrl });
      btnAdd.disabled = false;
      await refresh();
      try { showNotification(`Added: ${t.title}`, 'success'); } catch {}
    });
    rows.push({ el, data:t });
    frag.appendChild(el);
  });
  list.appendChild(frag);

  // Filtering
  const filter = modal.querySelector('#pl-filter');
  let ft;
  const applyFilter = ()=>{
    const q = (filter.value||'').toLowerCase();
    rows.forEach(({ el, data })=>{
      const text = `${data.title} ${data.artist}`.toLowerCase();
      el.style.display = text.includes(q) ? '' : 'none';
    });
    updateSelCount();
  };
  filter.addEventListener('input', ()=>{ clearTimeout(ft); ft=setTimeout(applyFilter, 120); });

  // Select all
  const selectAllBtn = modal.querySelector('#pl-select-all');
  selectAllBtn.addEventListener('click', ()=>{
    const visible = rows.filter(r=> r.el.style.display !== 'none');
    const allChecked = visible.every(r=> r.el.querySelector('.pl-chk').checked);
    visible.forEach(r=>{ r.el.querySelector('.pl-chk').checked = !allChecked; });
    visible.forEach(r=> r.el.classList.toggle('selected', r.el.querySelector('.pl-chk').checked));
    updateSelCount();
  });

  // Add selected
  const addSelectedBtn = modal.querySelector('#pl-add-selected');
  addSelectedBtn.addEventListener('click', async ()=>{
    addSelectedBtn.disabled = true;
    const selected = rows
      .map((r, idx)=> ({ r, idx }))
      .filter(x => x.r.el.querySelector('.pl-chk').checked);
    for (const { r } of selected){
      const t = r.data;
      await addTrackToPlaylist(pl.id, { href:t.href, title:t.title, artist:t.artist, coverUrl:t.coverUrl });
    }
    await refresh();
    addSelectedBtn.disabled = false;
    onClose();
    if (selected.length) { try { showNotification(`Added ${selected.length} track(s)`, 'success'); } catch {} }
  });

  // Selected counter
  const selCountEl = modal.querySelector('#pl-sel-count');
  function updateSelCount(){
    const count = rows.filter(r => r.el.querySelector('.pl-chk').checked && r.el.style.display !== 'none').length;
    selCountEl.textContent = count ? `${count} selected` : '';
  }
  updateSelCount();
}

export function initPlaylistsView(){
  // Initial fetch/render when app loads
  refresh();
  // Reload when view becomes active
  document.addEventListener('viewchange', (e)=>{
    if (e?.detail?.view === 'playlists' && !document.hidden) refresh();
  });
}
