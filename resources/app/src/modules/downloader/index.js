import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import youtubedl from '../ydlp/exec.js';
import { resolveYtDlpPath } from '../ydlp/resolver.js';
import { embedCoverIntoMp3 } from '../embedder/index.js';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Ensure yt-dlp path is resolved
resolveYtDlpPath();

function sanitize(filename) {
  return filename.replace(/[\\/:*?"<>|]+/g, ' ').trim();
}

function getUniqueFileName(outDir, baseName, ext) {
  let finalName = `${baseName}.${ext}`;
  let counter = 1;
  
  while (fs.existsSync(path.join(outDir, finalName))) {
    finalName = `${baseName} (${counter}).${ext}`;
    counter++;
  }
  
  return finalName;
}

function parseProgress(data) {
  // Parse yt-dlp progress output - multiple possible formats
  const lines = data.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Format 1: "[download]  45.2% of   4.12MiB at    1.05MiB/s ETA 00:03"
    let progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
    
    // Format 2: "  45.2% of   4.12MiB at    1.05MiB/s ETA 00:03"
    if (!progressMatch) {
      progressMatch = line.match(/^\s*(\d+\.?\d*)%\s+of\s+/);
    }
    
    // Format 3: Simple percentage "45.2%"
    if (!progressMatch) {
      progressMatch = line.match(/(\d+\.?\d*)%/);
    }
    
    if (progressMatch) {
      const percentage = parseFloat(progressMatch[1]);
      console.log(`Progress parsed: ${percentage}% from line: "${line.trim()}"`);
      return {
        type: 'progress',
        percentage,
        text: line.trim()
      };
    }
  }
  
  return null;
}

export async function downloadTrack({ url, outDir, coverDir, format = 'mp3', quality = 'best' }, onEvent) {
  const jobId = uuidv4();
  const tmpOut = path.join(outDir, `${jobId}.%(ext)s`);
  const audioFormat = format === 'm4a' ? 'm4a' : 'mp3';

  // Map quality preference to yt-dlp/ffmpeg options
  // 'best' -> VBR best quality (audioQuality 0)
  // specific kbps -> enforce via ffmpeg postprocessor args
  let audioQuality = '0';
  let postArgs = undefined;
  if (audioFormat === 'mp3' && quality && quality !== 'best') {
    // normalize e.g. '320k'
    const kbps = String(quality).toLowerCase().replace(/[^0-9]/g, '') || '320';
    postArgs = `ffmpeg:-b:a ${kbps}k`;
  }

  onEvent && onEvent({ type: 'start', jobId, url });

  try {
    const res = await youtubedl(url, {
      x: true,
      audioFormat,
      audioQuality,
      embedThumbnail: true,
      writeThumbnail: true,
      writeInfoJson: true,
      output: tmpOut,
      noAbortOnError: true,
      noWarnings: true,
      ffmpegLocation: ffmpegPath || undefined,
      postprocessorArgs: postArgs,
      onProgress: (progressData) => {
        // Check both stdout and stderr for progress info
        if (progressData.type === 'stderr' || progressData.type === 'stdout') {
          const progress = parseProgress(progressData.data);
          if (progress && onEvent) {
            console.log(`Sending progress event: ${progress.percentage}%`);
            onEvent({ 
              type: 'progress', 
              jobId, 
              percentage: progress.percentage,
              text: progress.text 
            });
          } else {
            // Debug: log any non-progress output
            const trimmed = progressData.data.trim();
            if (trimmed && !trimmed.match(/^WARNING/) && !trimmed.match(/^ERROR/)) {
              console.log(`[${progressData.type}] ${trimmed}`);
            }
          }
        }
      }
    });

    // Find produced files
    const files = fs.readdirSync(outDir).filter((f) => f.startsWith(jobId));
    const media = files.find((f) => f.endsWith(`.${audioFormat}`));
    const info = files.find((f) => f.endsWith('.info.json'));
    const thumb = files.find((f) => /(jpg|jpeg|png|webp)$/i.test(f) && f.includes(jobId));

    if (!media) throw new Error('Media not created');

    // Move/rename to nice name if we have metadata
    let title = jobId;
    let artist = '';
    let finalName = media;
    let coverPath = null;
    let coverUrl = null;
    
    if (info && fs.existsSync(path.join(outDir, info))) {
      const meta = JSON.parse(fs.readFileSync(path.join(outDir, info), 'utf-8'));
      title = sanitize(meta.title || title);
      artist = sanitize(meta.artist || meta.uploader || '');
      const base = sanitize(`${artist ? artist + ' - ' : ''}${title}`);
      
      // Get unique filename to avoid collisions
      finalName = getUniqueFileName(outDir, base, audioFormat);
      fs.renameSync(path.join(outDir, media), path.join(outDir, finalName));
      
      // Move cover to covers dir and standardize name
      if (thumb && fs.existsSync(path.join(outDir, thumb))) {
        const ext = thumb.split('.').pop();
        const coverBase = finalName.replace(/\.[^.]+$/, ''); // Remove audio extension
        const coverName = getUniqueFileName(coverDir, coverBase, ext);
        const src = path.join(outDir, thumb);
        const dst = path.join(coverDir, coverName);
        fs.renameSync(src, dst);
        coverPath = dst;
        coverUrl = `/data/covers/${encodeURIComponent(coverName)}`;
      }
      // Try to embed cover into MP3 if we have it
      try {
        if (coverPath) {
          const ok = await embedCoverIntoMp3(path.join(outDir, finalName), coverPath, outDir);
          if (ok) {
            // Prefer embedded cover URL from now on
            coverUrl = `/api/library/cover?file=${encodeURIComponent(finalName)}`;
            // Remove external cover file to keep only MP3
            try { fs.unlinkSync(coverPath); } catch {}
            coverPath = null;
          }
        }
      } catch (err) {
        console.warn('Embed cover failed:', err?.message || err);
      }
      // Cleanup .info.json
      try { fs.unlinkSync(path.join(outDir, info)); } catch {}
    }

    onEvent && onEvent({ type: 'done', jobId, file: path.join(outDir, finalName) });

    return {
      jobId,
      filePath: path.join(outDir, finalName),
      title,
      artist,
      cover: coverPath,
      coverUrl,
      href: `/data/library/${encodeURIComponent(finalName)}`,
      ext: audioFormat
    };
  } catch (e) {
    onEvent && onEvent({ type: 'error', jobId, error: String(e.message || e) });
    throw e;
  }
}

export default { downloadTrack };
