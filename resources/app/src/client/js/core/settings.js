// Persistent settings management for TON 618
// Stores settings in localStorage and notifies subscribers on change

const STORAGE_KEY = 'ton618_settings_v1';

const defaultSettings = {
  showDownloadProgress: true,
  enableStars: true,
  downloadQuality: 'best', // 'best' | '320k' | '192k' | '128k'
  autoUpdate: false, // Auto-update on startup
};

let current = load();
const listeners = new Set();

function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

function persist(){
  try { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); 
    // Also sync to server for Electron to read
    syncToServer();
  } catch {}
}

async function syncToServer() {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    });
  } catch (err) {
    console.warn('Failed to sync settings to server:', err);
  }
}

export function getSettings(){
  return { ...current };
}

export function updateSettings(patch){
  current = { ...current, ...(patch || {}) };
  persist();
  listeners.forEach(fn => { try { fn(getSettings()); } catch {} });
}

export function onSettingsChange(fn){ if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); }

export function resetSettings(){ current = { ...defaultSettings }; persist(); listeners.forEach(fn => fn(getSettings())); }
