// Progress modal management and download state
import { qs } from '../core/dom.js';

let currentDownloadId = null;

export function getCurrentDownloadId(){ return currentDownloadId; }
export function setCurrentDownloadId(id){ currentDownloadId = id; }

export function showProgressModal(title, url) {
  if (document.hidden) return;
  const modal = qs('#progress-modal');
  const titleEl = qs('#progress-title');
  const statusEl = qs('#progress-status');
  const fillEl = qs('#progress-fill');
  const textEl = qs('#progress-text');
  const detailsEl = qs('#progress-details');

  if (!modal) { console.error('Progress modal not found!'); return; }
  if (titleEl) titleEl.textContent = title;
  if (statusEl) statusEl.textContent = 'Инициализация загрузки…';
  if (fillEl) { fillEl.style.width = '0%'; fillEl.className = 'progress-fill initializing'; }
  if (textEl) textEl.textContent = '0%';
  try { if (detailsEl && url) detailsEl.textContent = `Источник: ${new URL(url).hostname}`; } catch {}
  modal.classList.add('show');
}

export function hideProgressModal() {
  const modal = qs('#progress-modal');
  if (modal) modal.classList.remove('show');
  currentDownloadId = null;
}

export function updateProgressModal(evt) {
  if (document.hidden) return;
  const modal = qs('#progress-modal');
  if (!modal || !modal.classList.contains('show')) return;

  const statusEl = qs('#progress-status');
  const fillEl = qs('#progress-fill');
  const textEl = qs('#progress-text');
  const detailsEl = qs('#progress-details');

  switch(evt.type) {
    case 'start':
      currentDownloadId = evt.jobId;
      setProgressStage('initializing', 5, 'Инициализация загрузки…', `Запуск задачи: ${evt.jobId}`);
      setTimeout(() => setProgressStage('connecting', 15, 'Подключение к серверу…', 'Устанавливаем соединение'), 500);
      setTimeout(() => setProgressStage('downloading', 20, 'Загрузка медиа…', 'Начинаем загрузку'), 1000);
      break;
    case 'progress': {
      const rawVal = (typeof evt.percentage !== 'undefined') ? evt.percentage : evt.progress;
      const rawNum = (typeof rawVal === 'number') ? rawVal : parseFloat(String(rawVal || '0').replace('%',''));
      const progress = Math.max(0, Math.min(100, isNaN(rawNum) ? 0 : rawNum));
      let stage = 'downloading';
      let status = 'Загрузка медиа…';
      if (progress < 60) { stage = 'downloading'; status = 'Загрузка медиа…'; }
      else if (progress < 95) { stage = 'converting'; status = 'Обработка и конвертация…'; }
      else { stage = 'finalizing'; status = 'Завершение…'; }
      setProgressStage(stage, progress, status, evt.text || evt.details || `${progress.toFixed(progress < 10 ? 1 : 0)}% готово`);
      break;
    }
    case 'done':
    case 'completed':
      setProgressStage('converting', 90, 'Завершение конвертации…', 'Почти готово…');
      setTimeout(() => {
        setProgressStage('finalizing', 98, 'Сохранение файла…', 'Запись на диск');
        setTimeout(() => {
          setProgressStage('completed', 100, 'Загрузка завершена!', `Сохранено: ${evt.file ? evt.file.split('\\').pop() : 'Неизвестно'}`);
        }, 800);
      }, 600);
      break;
    case 'error':
      if (fillEl) fillEl.className = 'progress-fill error';
      if (statusEl) statusEl.textContent = 'Загрузка не удалась';
      if (detailsEl) detailsEl.textContent = `Ошибка: ${evt.error}`;
      break;
  }
}

export function setProgressStage(stage, percentage, status, details) {
  if (document.hidden) return;
  const statusEl = qs('#progress-status');
  const fillEl = qs('#progress-fill');
  const textEl = qs('#progress-text');
  const detailsEl = qs('#progress-details');
  if (!fillEl || !statusEl || !textEl || !detailsEl) { console.error('Progress modal elements not found!'); return; }
  const roundedPercentage = Math.round(percentage);
  fillEl.className = `progress-fill ${stage}`;
  fillEl.style.width = `${roundedPercentage}%`;
  textEl.textContent = `${roundedPercentage}%`;
  statusEl.textContent = status;
  detailsEl.textContent = details;
}
