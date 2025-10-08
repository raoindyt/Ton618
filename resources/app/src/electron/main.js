import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { checkAndInstallDependencies } from '../modules/installer/index.js';
import { launchUpdater, isUpdaterAvailable } from './services/updater-launcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.argv.includes('--dev');
const PORT = 6180;
let serverUrl = `http://localhost:${PORT}`;

let mainWindow;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      // Save CPU when window loses focus or goes to background
      backgroundThrottling: true,
      // Reduce overhead
      spellcheck: false
    },
    show: false,
    icon: getAppIcon(),
    titleBarStyle: 'default',
    frame: true,
    title: 'TON 618 - Supermassive Music Player',
    backgroundColor: '#0b0a16'
  });

  // Menu for better UX
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ]);
  
  Menu.setApplicationMenu(menu);

  // Wait for server to be ready, then show window
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function getAppIcon() {
  if (process.platform === 'win32') {
    return path.join(__dirname, '../../assets/icon.ico');
  } else if (process.platform === 'darwin') {
    return path.join(__dirname, '../../assets/icon.icns');
  } else {
    return path.join(__dirname, '../../assets/icon.png');
  }
}

async function startServer() {
  // Import and start server directly in the same process
  // This is the correct way for Electron with ES modules
  try {
    console.log('Starting server in-process...');
    
    // Dynamically import the server module
    const serverPath = path.resolve(__dirname, '../server/index.js');
    console.log('Server module path:', serverPath);
    
    // Change working directory to app root for correct relative paths
    const appRoot = path.dirname(path.dirname(serverPath));
    process.chdir(appRoot);
    console.log('Changed working directory to:', process.cwd());
    
    // Convert Windows path to file:// URL for ES module import
    const { pathToFileURL } = await import('url');
    const serverUrl = pathToFileURL(serverPath).href;
    console.log('Server module URL:', serverUrl);
    
    // Import server module - it will start automatically
    await import(serverUrl);
    
    console.log('Server module loaded');
    
    // Wait for server to be ready (it logs when ready)
    // Give it some time to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Server should be ready now');
  } catch (error) {
    console.error('Failed to start server:', error);
    throw error;
  }
}



app.whenReady().then(async () => {
  try {
    console.log('Initializing TON 618...');
    
    // Launch updater if auto-update is enabled
    const settings = loadSettings();
    if (settings.autoUpdate && isUpdaterAvailable()) {
      console.log('Launching updater...');
      await launchUpdater(true);
    }
    
    // Start the Express server (it will check dependencies internally)
    console.log('Starting server...');
    await startServer();
    
    // Create the Electron window
    console.log('Creating window...');
    createWindow();
    
    // Load the app
    console.log('Loading application from:', serverUrl);
    await mainWindow.loadURL(serverUrl);
    
    console.log('TON 618 ready!');
  } catch (error) {
    console.error('Failed to start TON 618:', error);
    
    dialog.showErrorBox('Startup Error', 
      `Failed to start TON 618:\n\n${error.message}\n\nPlease check the console for more details.`
    );
    
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Load settings from file
function loadSettings() {
  try {
    const settingsPath = path.resolve(__dirname, '../../data/settings.json');
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return { autoUpdate: false };
}

// IPC handlers for future features
ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-error', async (event, title, content) => {
  dialog.showErrorBox(title, content);
});

ipcMain.handle('show-info', async (event, title, content) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title,
    message: content
  });
});

ipcMain.handle('launch-updater', async () => {
  try {
    await launchUpdater(true);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('is-updater-available', () => {
  return isUpdaterAvailable();
});

// Helper: sanitize filename
function sanitize(filename) {
  return filename.replace(/[\\/:*?"<>|]+/g, ' ').trim();
}

// Helper: ensure unique filename in a directory
function getUniqueFileName(dir, baseName, ext) {
  let name = `${baseName}.${ext}`;
  let i = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${baseName} (${i}).${ext}`;
    i++;
  }
  return name;
}

function getLibDir() {
  // Mirror server's data path
  return path.resolve(__dirname, '../../data/library');
}

// Open file dialog to select MP3 files
ipcMain.handle('add-music-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Music',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'MP3 audio', extensions: ['mp3'] }
    ]
  });
  if (result.canceled) return [];
  return result.filePaths || [];
});

// Import selected files into library
ipcMain.handle('import-music-files', async (event, filePaths) => {
  if (!Array.isArray(filePaths)) return { imported: 0, files: [] };
  const LIB_DIR = getLibDir();
  if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
  const imported = [];
  for (const src of filePaths) {
    try {
      if (!fs.existsSync(src)) continue;
      const ext = path.extname(src).toLowerCase().replace('.', '');
      if (ext !== 'mp3') continue; // keep library MP3-only
      const base = sanitize(path.basename(src, path.extname(src)));
      const destName = getUniqueFileName(LIB_DIR, base, 'mp3');
      const destPath = path.join(LIB_DIR, destName);
      fs.copyFileSync(src, destPath);
      imported.push(destName);
    } catch {}
  }
  return { imported: imported.length, files: imported };
});

// Handle app protocol (for future deep linking)
app.setAsDefaultProtocolClient('ton618');

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Critical Error', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
