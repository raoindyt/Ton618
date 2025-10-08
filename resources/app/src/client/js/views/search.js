import { qs, qsa, attachPills } from '../core/dom.js';
import { showNotification } from '../core/notifications.js';
import { search, requestDownload, checkTracks } from '../api.js';
import { getSettings } from '../core/settings.js';
import { showProgressModal, setProgressStage, setCurrentDownloadId } from '../ws/progress-modal.js';

function getActiveType(){
  const btn = qs('#search-pills .pill.active');
  return btn ? btn.dataset.type : 'all';
}

async function checkTrackStatuses(items) {
  try {
    const tracks = items.map(item => ({ url: item.url, title: item.title }));
    const response = await checkTracks(tracks);
    return response.results || {};
  } catch (error) {
    console.error('Failed to check track statuses:', error);
    return {};
  }
}

function makeSourceIcon(source){
  return source === 'youtube'
    ? '<svg class="source-icon youtube"><use href="#i-youtube"/></svg>'
    : source === 'soundcloud'
    ? '<svg class="source-icon soundcloud"><use href="#i-soundcloud"/></svg>'
    : '';
}

function wireDownload(button, it, isDownloaded){
  if (!button || isDownloaded) return;
  button.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const icon = btn.querySelector('.icon');
    btn.disabled = true;
    if (icon) icon.innerHTML = '<use href="#i-loading"/>';
    try {
      const settings = getSettings();
      if (settings.showDownloadProgress) {
        showProgressModal(it.title || 'Unknown track', it.url);
      }
      const resp = await requestDownload(it.url, 'mp3', settings.downloadQuality);
      if (resp && resp.jobId) {
        setCurrentDownloadId(resp.jobId);
        if (settings.showDownloadProgress) {
          setProgressStage('connecting', 10, 'В очереди… Скоро начнем', `Задача: ${resp.jobId}`);
        }
      }
      if (icon) icon.innerHTML = '<use href="#i-check"/>';
      btn.classList.add('downloaded');
      btn.title = 'Уже загружено';
      showNotification('Загрузка началась', 'success');
    } catch (error) {
      if (icon) icon.innerHTML = '<use href="#i-error"/>';
      showNotification(`Не удалось загрузить: ${error.message}`, 'error');
      setTimeout(()=>{
        btn.disabled = false;
        if (icon) icon.innerHTML = '<use href="#i-download"/>';
      }, 2000);
    }
  });
}

function appendResultItem(it, trackStatus = null) {
  const el = document.createElement('div');
  el.className = 'result';

  const sourceIcon = makeSourceIcon(it.source);

  const isDownloaded = trackStatus && trackStatus.exists;
  const buttonClass = isDownloaded ? 'btn-download downloaded' : 'btn-download';
  const buttonIcon = isDownloaded ? 'i-check' : 'i-download';
  const buttonTitle = isDownloaded ? 'Уже загружено' : 'Скачать';

  el.innerHTML = `
    <img src="${it.thumbnail || ''}" loading="lazy" decoding="async" onerror="this.style.display='none'"/>
    <div class="meta">
      <div class="title-row">
        <div class="title">${it.title || '—'}</div>
        ${sourceIcon}
      </div>
      <div class="uploader">${it.uploader || ''}</div>
    </div>
    <div>
      <button class="${buttonClass}" data-url="${it.url}" title="${buttonTitle}" ${isDownloaded ? 'disabled' : ''}>
        <svg class="icon"><use href="#${buttonIcon}"/></svg>
      </button>
    </div>
  `;

  const btn = el.querySelector('button');
  wireDownload(btn, it, isDownloaded);
  return el;
}

function createLeadItem(it, trackStatus){
  const isDownloaded = trackStatus && trackStatus.exists;
  const buttonClass = isDownloaded ? 'btn-download downloaded' : 'btn-download';
  const buttonIcon = isDownloaded ? 'i-check' : 'i-download';

  const el = document.createElement('div');
  el.className = 'lead-card';
  el.innerHTML = `
    <div class="lead-cover-wrap">
      <img class="lead-cover" src="${it.thumbnail || ''}" loading="lazy" decoding="async" onerror="this.style.display='none'"/>
      <button class="${buttonClass}" title="Скачать" ${isDownloaded ? 'disabled' : ''}>
        <svg class="icon"><use href="#${buttonIcon}"/></svg>
      </button>
    </div>
    <div class="lead-meta">
      <div class="title-row">
        <div class="title">${it.title || '—'}</div>
        ${makeSourceIcon(it.source)}
      </div>
      <div class="uploader">${it.uploader || ''}</div>
    </div>
  `;
  wireDownload(el.querySelector('button'), it, isDownloaded);
  return el;
}

function createChipItem(it, trackStatus){
  const isDownloaded = trackStatus && trackStatus.exists;
  const btnIcon = isDownloaded ? 'i-check' : 'i-download';
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.title = it.title || '';
  chip.innerHTML = `
    <div class="thumb-wrap">
      <img src="${it.thumbnail || ''}" loading="lazy" decoding="async" onerror="this.style.display='none'"/>
      <button class="dl ${isDownloaded ? 'downloaded' : ''}" ${isDownloaded ? 'disabled' : ''}><svg class="icon"><use href="#${btnIcon}"/></svg></button>
    </div>
    <div class="label">${(it.title || '—')}</div>
  `;
  wireDownload(chip.querySelector('button'), it, isDownloaded);
  return chip;
}

function buildStrip(items, trackStatuses){
  const wr = document.createElement('div');
  wr.className = 'results-strip card glass';
  if (!items || items.length === 0) return wr;
  const lead = items[0];
  const leadEl = createLeadItem(lead, trackStatuses[lead.url]);
  wr.appendChild(leadEl);
  if (items.length > 1){
    const list = document.createElement('div');
    list.className = 'chip-list';
    for (let i = 1; i < items.length; i++){
      const it = items[i];
      list.appendChild(createChipItem(it, trackStatuses[it.url]));
    }
    wr.appendChild(list);
  }
  return wr;
}

export async function renderResults(items){
  if (document.hidden) return;
  const view = document.getElementById('view-home');
  if (!view || !view.classList.contains('active')) return;
  const root = qs('#results');
  root.innerHTML = '';
  const trackStatuses = items.length > 0 ? await checkTrackStatuses(items) : {};
  const activeType = getActiveType();
  if (activeType === 'all') {
    const youtube = items.filter(it => it.source === 'youtube');
    const soundcloud = items.filter(it => it.source === 'soundcloud');

    if (youtube.length > 0) {
      const ytSection = document.createElement('div');
      ytSection.className = 'source-section';
      const ytHeader = document.createElement('div');
      ytHeader.className = 'source-header youtube';
      ytHeader.innerHTML = `
        <svg class="source-icon youtube"><use href="#i-youtube"/></svg>
        <span>YouTube Music</span>
        <div class="source-line"></div>
      `;
      ytSection.appendChild(ytHeader);
      ytSection.appendChild(buildStrip(youtube, trackStatuses));
      root.appendChild(ytSection);
    }

    if (soundcloud.length > 0) {
      const scSection = document.createElement('div');
      scSection.className = 'source-section';
      const scHeader = document.createElement('div');
      scHeader.className = 'source-header soundcloud';
      scHeader.innerHTML = `
        <svg class="source-icon soundcloud"><use href="#i-soundcloud"/></svg>
        <span>SoundCloud</span>
        <div class="source-line"></div>
      `;
      scSection.appendChild(scHeader);
      scSection.appendChild(buildStrip(soundcloud, trackStatuses));
      root.appendChild(scSection);
    }
  } else {
    root.appendChild(buildStrip(items, trackStatuses));
  }
}

export async function doSearch(){
  if (document.hidden) return;
  const view = document.getElementById('view-home');
  if (!view || !view.classList.contains('active')) return;
  const q = qs('#search-input').value.trim();
  const type = getActiveType();
  if(!q) return;
  const btn = qs('#search-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<svg class="icon"><use href="#i-search"/></svg>';
  btn.disabled = true;
  try {
    showNotification('Поиск…', 'info');
    const items = await search(q, type);
    renderResults(items);
    if (items.length === 0) showNotification('Ничего не найдено', 'warning');
    else showNotification(`Найдено: ${items.length}`, 'success');
  } catch (error) {
    console.error('Ошибка поиска:', error);
    showNotification(`Поиск не удался: ${error.message}`, 'error');
    renderResults([]);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

export function initSearchControls(){
  attachPills();
  const btn = qs('#search-btn');
  const inp = qs('#search-input');
  if (btn) btn.addEventListener('click', doSearch);
  if (inp) inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
}
