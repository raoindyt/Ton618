import { spawn } from 'child_process';
import { resolveYtDlpPath } from './resolver.js';

function optionsToArgs(opts = {}) {
  const args = [];
  const add = (flag, val) => {
    if (val === undefined || val === null || val === false) return;
    if (val === true) args.push(flag);
    else args.push(flag, String(val));
  };

  add('--dump-single-json', opts.dumpSingleJson);
  add('--flat-playlist', opts.flatPlaylist);
  add('--default-search', opts.defaultSearch);
  add('--match-filter', opts.matchFilter);
  if (opts.x) args.push('-x');
  add('--audio-format', opts.audioFormat);
  add('--audio-quality', opts.audioQuality);
  add('--embed-thumbnail', opts.embedThumbnail);
  add('--write-thumbnail', opts.writeThumbnail);
  add('--write-info-json', opts.writeInfoJson);
  if (opts.output) args.push('-o', opts.output);
  add('--no-abort-on-error', opts.noAbortOnError);
  add('--no-warnings', opts.noWarnings);
  add('--ffmpeg-location', opts.ffmpegLocation);
  // Allow passing extra postprocessor args (e.g., enforce bitrate)
  add('--postprocessor-args', opts.postprocessorArgs);

  return args;
}

export default function ytdlp(input, opts = {}) {
  return new Promise((resolve, reject) => {
    const bin = resolveYtDlpPath();
    const args = [...optionsToArgs(opts), input];
    const child = spawn(bin, args, { env: { ...process.env }, shell: false });
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (d) => { 
      stdout += d.toString(); 
      if (opts.onProgress) {
        opts.onProgress({ type: 'stdout', data: d.toString() });
      }
    });
    
    child.stderr.on('data', (d) => { 
      stderr += d.toString();
      if (opts.onProgress) {
        opts.onProgress({ type: 'stderr', data: d.toString() });
      }
    });
    
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && !opts.noAbortOnError) return reject(new Error(stderr || `yt-dlp exited ${code}`));
      if (opts.dumpSingleJson) {
        try { return resolve(JSON.parse(stdout)); } catch {}
      }
      resolve(stdout);
    });
  });
}
