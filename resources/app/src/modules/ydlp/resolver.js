import fs from 'fs';
import path from 'path';

let resolvedPath = null;

export function resolveYtDlpPath() {
  if (resolvedPath) return resolvedPath;
  
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    resolvedPath = process.env.YTDLP_PATH;
    return resolvedPath;
  }
  
  const candidates = [
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    'yt-dlp',
    'yt-dlp.exe',
  ];
  
  for (const c of candidates) {
    try { 
      if (fs.existsSync(c)) {
        resolvedPath = c;
        process.env.YTDLP_PATH = c;
        return resolvedPath;
      }
    } catch {}
  }
  
  // Fallback to system PATH
  resolvedPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return resolvedPath;
}

export function setYtDlpPath(path) {
  resolvedPath = path;
  process.env.YTDLP_PATH = path;
}
