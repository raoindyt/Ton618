import { qs } from '../core/dom.js';
import { requestDownload } from '../api.js';
import { blockTitle, blockUploader } from '../reco/store.js';
import { getCachedRecommendations } from '../reco/cache.js';
import { runNowAndCache, scheduleAutoRecommendations } from '../reco/auto.js';
import { getRecoSettings } from '../reco/settings.js';

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

// uniqBy not needed in this UI

async function render(){
  const root = qs('#reco-root');
  if (!root) return;
  root.innerHTML = '';

  // SECTION 2: Online — from Last.fm (20 tracks)
  const wrapOnline = h('div', { class: 'card glass', style: 'margin-top:16px' });
  const headerOnline = h('div', { class: 'pl-tracks-header' });
  const rs = getRecoSettings();
  const titleOnline = rs.useLastFm ? 'Рекомендации — от Last.fm' : 'Рекомендации — онлайн';
  headerOnline.append(h('h3', {}, titleOnline));
  const info = h('div', { class: 'muted', style: 'font-size:12px;margin-left:auto;margin-right:8px;' }, '');
  const btnRefresh = h('button', { id: 'btn-reco-refresh', class: 'btn-primary' }, 'Обновить онлайн');
  headerOnline.append(info, btnRefresh);
  const listOnline = h('div', { class: 'pl-tracks', id: 'reco-online-list' });
  wrapOnline.append(headerOnline, listOnline);
  root.appendChild(wrapOnline);

  const renderOnline = (items)=>{
    listOnline.innerHTML = '';
    const top = (items||[]).slice(0,20);
    top.forEach((t)=>{
      if (t && t._external){
        const row = h('div', { class: 'track' });
        row.innerHTML = `
          <img src="${t.coverUrl||''}" loading="lazy" decoding="async" onerror="this.style.display='none'"/>
          <div class="meta"><div class="title">${t.title}</div><div class="artist">${t.artist||''}</div></div>
          <div class="pl-t-actions">
            <button data-act="dl">Скачать</button>
            <button data-act="ni">Не интересно</button>
            <button data-act="hide-up">Скрыть артиста</button>
          </div>
        `;
        row.querySelector('[data-act="dl"]').addEventListener('click', async ()=>{
          const btn = row.querySelector('[data-act="dl"]');
          btn.disabled = true;
          try { await requestDownload(t.url, 'mp3'); } finally { btn.disabled = false; }
        });
        row.querySelector('[data-act="ni"]').addEventListener('click', ()=>{
          try { blockTitle(t.title); } catch {}
          row.remove();
        });
        row.querySelector('[data-act="hide-up"]').addEventListener('click', ()=>{
          try { blockUploader(t.artist); } catch {}
          row.remove();
        });
        listOnline.appendChild(row);
      }
    });
  };

  const setInfo = (ts)=>{
    if (!ts) { info.textContent = ''; return; }
    const dt = Math.max(0, Date.now() - ts);
    const mins = Math.floor(dt/60000);
    info.textContent = mins > 0 ? `обновлено ${mins} мин назад` : 'обновлено только что';
  };

  // On render: show cached online items if any; if empty, schedule background build
  (function showCachedOnline(){
    const { items, at } = getCachedRecommendations();
    if (items && items.length) {
      renderOnline(items);
      setInfo(at);
    } else {
      listOnline.innerHTML = '<div class="muted" style="padding:12px">Готовим онлайн рекомендации… Продолжайте слушать музыку, мы обновим их в фоне.</div>';
      setInfo(0);
      scheduleAutoRecommendations('view_open');
    }
  })();

  btnRefresh.addEventListener('click', async ()=>{
    btnRefresh.disabled = true;
    try {
      await runNowAndCache();
      const { items, at } = getCachedRecommendations();
      renderOnline(items||[]);
      setInfo(at);
    } finally {
      btnRefresh.disabled = false;
    }
  });
}

export function initRecommendationsView(){
  render();
  document.addEventListener('viewchange', (e)=>{
    if (e?.detail?.view === 'reco' && !document.hidden) render();
  });
  // Also refresh when a new track starts (to update Popular recently)
  window.addEventListener('trackchange', ()=>{
    const view = document.querySelector('#view-reco');
    if (view && view.classList.contains('active')) render();
  });
}

// Online discovery imported from ../reco/discover.js

// (renderDiscoverSection removed – single panel UI handles external recommendations)
