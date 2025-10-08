import { getSettings, updateSettings, onSettingsChange } from '../core/settings.js';
import { setStarsEnabled } from '../ui/stars.js';
import { hideProgressModal } from '../ws/progress-modal.js';
import { getRecoSettings, setRecoSettings } from '../reco/settings.js';

export function initSettingsView(){
  const root = document.getElementById('view-settings');
  if (!root) return;

  // Wire inputs
  const chkProgress = document.getElementById('set-progress');
  const chkStars = document.getElementById('set-stars');
  const selQuality = document.getElementById('set-quality');
  const chkAutoUpdate = document.getElementById('set-auto-update');
  const btnCheckUpdates = document.getElementById('btn-check-updates');
  
  // Recommendation settings
  const chkLastFm = document.getElementById('reco-lastfm');
  const inpLastFmKey = document.getElementById('reco-lastfm-key');
  const chkSound = document.getElementById('reco-sound');
  const chkGenres = document.getElementById('reco-genres');
  const sliderDiversity = document.getElementById('reco-diversity');
  const labelDiversity = document.getElementById('reco-diversity-label');
  const chkExcludeLive = document.getElementById('reco-exclude-live');

  const applyToUI = (s) => {
    if (chkProgress) chkProgress.checked = !!s.showDownloadProgress;
    if (chkStars) chkStars.checked = !!s.enableStars;
    if (selQuality) selQuality.value = s.downloadQuality || 'best';
    if (chkAutoUpdate) chkAutoUpdate.checked = !!s.autoUpdate;
  };
  
  const applyRecoToUI = (rs) => {
    if (chkLastFm) chkLastFm.checked = !!rs.useLastFm;
    if (inpLastFmKey) inpLastFmKey.value = rs.lastFmApiKey || '';
    if (chkSound) chkSound.checked = !!rs.useSoundAnalysis;
    if (chkGenres) chkGenres.checked = !!rs.useGenreMatching;
    if (sliderDiversity) {
      sliderDiversity.value = rs.diversityLevel || 0.6;
      if (labelDiversity) labelDiversity.textContent = Math.round((rs.diversityLevel || 0.6) * 100) + '%';
    }
    if (chkExcludeLive) chkExcludeLive.checked = !!rs.excludeLive;
  };

  applyToUI(getSettings());
  applyRecoToUI(getRecoSettings());

  if (chkProgress) chkProgress.addEventListener('change', (e) => {
    const enabled = !!e.target.checked;
    updateSettings({ showDownloadProgress: enabled });
    if (!enabled) hideProgressModal();
  });

  if (chkStars) chkStars.addEventListener('change', (e) => {
    const enabled = !!e.target.checked;
    updateSettings({ enableStars: enabled });
    setStarsEnabled(enabled);
  });

  if (selQuality) selQuality.addEventListener('change', (e) => {
    const v = e.target.value || 'best';
    updateSettings({ downloadQuality: v });
  });

  if (chkAutoUpdate) chkAutoUpdate.addEventListener('change', (e) => {
    const enabled = !!e.target.checked;
    updateSettings({ autoUpdate: enabled });
  });

  if (btnCheckUpdates) btnCheckUpdates.addEventListener('click', async () => {
    if (!window.appUtils || !window.appUtils.isElectron) {
      alert('Автообновление доступно только в десктопной версии');
      return;
    }

    const isAvailable = await window.appUtils.isUpdaterAvailable();
    if (!isAvailable) {
      alert('Updater не найден. Убедитесь, что TON 618 Updater.exe находится в папке приложения.');
      return;
    }

    btnCheckUpdates.disabled = true;
    btnCheckUpdates.textContent = 'Запуск...';

    try {
      const result = await window.appUtils.launchUpdater();
      if (result.success) {
        btnCheckUpdates.textContent = 'Updater запущен';
        setTimeout(() => {
          btnCheckUpdates.textContent = 'Проверить сейчас';
          btnCheckUpdates.disabled = false;
        }, 3000);
      } else {
        alert('Ошибка запуска updater: ' + result.error);
        btnCheckUpdates.textContent = 'Проверить сейчас';
        btnCheckUpdates.disabled = false;
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
      btnCheckUpdates.textContent = 'Проверить сейчас';
      btnCheckUpdates.disabled = false;
    }
  });

  // Recommendation settings event listeners
  if (chkLastFm) chkLastFm.addEventListener('change', (e) => {
    setRecoSettings({ useLastFm: !!e.target.checked });
  });

  if (inpLastFmKey) {
    const saveKey = () => {
      const v = (inpLastFmKey.value || '').trim();
      setRecoSettings({ lastFmApiKey: v });
    };
    inpLastFmKey.addEventListener('change', saveKey);
    inpLastFmKey.addEventListener('blur', saveKey);
    inpLastFmKey.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); saveKey(); inpLastFmKey.blur(); } });
  }

  if (chkSound) chkSound.addEventListener('change', (e) => {
    setRecoSettings({ useSoundAnalysis: !!e.target.checked });
  });

  if (chkGenres) chkGenres.addEventListener('change', (e) => {
    setRecoSettings({ useGenreMatching: !!e.target.checked });
  });

  if (sliderDiversity) sliderDiversity.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    setRecoSettings({ diversityLevel: value });
    if (labelDiversity) labelDiversity.textContent = Math.round(value * 100) + '%';
  });

  if (chkExcludeLive) chkExcludeLive.addEventListener('change', (e) => {
    setRecoSettings({ excludeLive: !!e.target.checked });
  });

  onSettingsChange(applyToUI);
}
