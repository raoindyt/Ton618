import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawn } from 'child_process';
import { setYtDlpPath } from '../ydlp/resolver.js';

const BIN_DIR = path.join(process.cwd(), 'bin');
const YTDLP_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

export function ensureBinDir() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
}

export function isYtDlpInstalled() {
  return fs.existsSync(YTDLP_PATH);
}

export async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

export async function installYtDlp() {
  console.log('Installing yt-dlp...');
  ensureBinDir();
  
  const isWindows = process.platform === 'win32';
  const downloadUrl = isWindows 
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  
  try {
    await downloadFile(downloadUrl, YTDLP_PATH);
    
    if (!isWindows) {
      // Make executable on Unix systems
      fs.chmodSync(YTDLP_PATH, '755');
    }
    
    console.log('yt-dlp installed successfully');
    setYtDlpPath(YTDLP_PATH);
    return YTDLP_PATH;
  } catch (error) {
    console.error('Failed to install yt-dlp:', error);
    throw error;
  }
}

export async function checkAndInstallDependencies() {
  try {
    if (!isYtDlpInstalled()) {
      console.log('yt-dlp not found, installing...');
      await installYtDlp();
    } else {
      console.log('yt-dlp found at:', YTDLP_PATH);
      setYtDlpPath(YTDLP_PATH);
    }
    
    // Test yt-dlp
    await testYtDlp();
    return true;
  } catch (error) {
    console.error('Dependency check failed:', error);
    return false;
  }
}

export function testYtDlp() {
  return new Promise((resolve, reject) => {
    const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
    
    // Add delay to prevent EBUSY errors
    setTimeout(() => {
      try {
        const child = spawn(ytdlpPath, ['--version'], { 
          stdio: 'pipe',
          timeout: 15000,
          windowsHide: true
        });
        
        let output = '';
        let error = '';
        
        child.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          error += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0 && output.trim()) {
            console.log('yt-dlp version:', output.trim());
            resolve(output.trim());
          } else {
            reject(new Error(`yt-dlp test failed with code ${code}: ${error || 'No output'}`));
          }
        });
        
        child.on('error', (err) => {
          reject(new Error(`yt-dlp spawn error: ${err.message}`));
        });
      } catch (err) {
        reject(new Error(`yt-dlp test error: ${err.message}`));
      }
    }, 1000);
  });
}

export default {
  checkAndInstallDependencies,
  installYtDlp,
  isYtDlpInstalled,
  testYtDlp
};
