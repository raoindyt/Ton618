import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Launch updater.exe if auto-update is enabled
 * @param {boolean} autoUpdateEnabled - Whether auto-update is enabled
 * @returns {Promise<void>}
 */
export async function launchUpdater(autoUpdateEnabled) {
  if (!autoUpdateEnabled) {
    console.log('Auto-update disabled, skipping updater check');
    return;
  }

  try {
    const updaterPath = getUpdaterPath();
    
    if (!updaterPath || !fs.existsSync(updaterPath)) {
      console.log('Updater not found at:', updaterPath);
      return;
    }

    console.log('Launching updater:', updaterPath);

    // Launch updater as detached process
    const updater = spawn(updaterPath, [], {
      detached: true,
      stdio: 'ignore'
    });

    updater.unref();

  } catch (error) {
    console.error('Failed to launch updater:', error);
  }
}

/**
 * Get path to updater.exe
 * @returns {string|null}
 */
function getUpdaterPath() {
  // In development
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    const devPath = path.resolve(__dirname, '../../../updater/dist/TON 618 Updater.exe');
    if (fs.existsSync(devPath)) return devPath;
  }

  // In production - try multiple locations
  const appDir = path.dirname(process.execPath);
  
  // 1. Same directory as app
  let updaterPath = path.join(appDir, 'TON 618 Updater.exe');
  if (fs.existsSync(updaterPath)) {
    console.log('Updater found in app directory');
    return updaterPath;
  }
  
  // 2. Parent directory (if app is in subfolder)
  updaterPath = path.join(appDir, '..', 'TON 618 Updater.exe');
  if (fs.existsSync(updaterPath)) {
    console.log('Updater found in parent directory');
    return updaterPath;
  }
  
  // 3. Common installation paths
  const commonPaths = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'TON 618', 'TON 618 Updater.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'TON 618', 'TON 618 Updater.exe'),
    path.join('C:\\TON618', 'TON 618 Updater.exe')
  ];
  
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      console.log('Updater found at:', p);
      return p;
    }
  }
  
  console.log('Updater not found in any location');
  return null;
}

/**
 * Check if updater exists
 * @returns {boolean}
 */
export function isUpdaterAvailable() {
  const updaterPath = getUpdaterPath();
  return updaterPath && fs.existsSync(updaterPath);
}
