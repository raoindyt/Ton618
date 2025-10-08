// Initialize WebSocket and bridge download events to UI
import { showNotification } from '../core/notifications.js';
import { getSettings } from '../core/settings.js';
import { showProgressModal, updateProgressModal, hideProgressModal, getCurrentDownloadId, setCurrentDownloadId } from './progress-modal.js';

export function initWS({ onCompleted, onFailed } = {}){
  const wsUrl = `ws://${location.host}/ws`;
  let ws = null;

  function connectWs(){
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { /* console.log('WebSocket connected'); */ };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.channel === 'download') handleDownloadEvent(msg);
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };
    ws.onclose = () => { setTimeout(connectWs, 2000); };
  }

  function handleDownloadEvent(evt){
    // If we don't yet track a job, adopt this event's jobId
    if (!getCurrentDownloadId() && evt.jobId) {
      setCurrentDownloadId(evt.jobId);
      // Ensure modal is visible if enabled in settings
      const settings = getSettings();
      if (settings.showDownloadProgress) {
        const modal = document.querySelector('#progress-modal');
        if (modal && !modal.classList.contains('show')) {
          showProgressModal('Downloading...', location.href);
        }
      }
    }

    // Update the modal if event corresponds to the tracked job
    if (evt.jobId === getCurrentDownloadId()) {
      updateProgressModal(evt);
    }

    if (evt.type === 'completed') {
      showNotification('Download completed!', 'success');
      setTimeout(() => hideProgressModal(), 1500);
      if (onCompleted) onCompleted(evt);
    } else if (evt.type === 'failed' || evt.type === 'error') {
      showNotification(`Download failed: ${evt.error || 'Unknown error'}`, 'error');
      hideProgressModal();
      if (onFailed) onFailed(evt);
    }
  }

  connectWs();
}
