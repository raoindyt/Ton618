const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appUtils', {
  isElectron: true,
  async addMusic() {
    // Ask main process to show open dialog
    const files = await ipcRenderer.invoke('add-music-dialog');
    if (!files || !Array.isArray(files) || files.length === 0) return { imported: 0, files: [] };
    // Import (copy) selected files into library
    const result = await ipcRenderer.invoke('import-music-files', files);
    return result;
  },
  async launchUpdater() {
    return await ipcRenderer.invoke('launch-updater');
  },
  async isUpdaterAvailable() {
    return await ipcRenderer.invoke('is-updater-available');
  }
});