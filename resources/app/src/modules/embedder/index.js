import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import NodeID3 from 'node-id3';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

function isImageFile(p) {
  return /(jpe?g|png|webp)$/i.test(path.extname(p).slice(1));
}

export async function convertToJpeg(srcPath, tmpDir) {
  // If already jpeg or png, return as is (png is okay for APIC, but jpeg is more compatible)
  const ext = path.extname(srcPath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return srcPath;

  const outPath = path.join(tmpDir, `${path.basename(srcPath, path.extname(srcPath))}.jpg`);
  await new Promise((resolve, reject) => {
    ffmpeg(srcPath)
      .outputOptions([
        '-y',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // ensure even dims
        '-q:v', '3'
      ])
      .toFormat('mjpeg')
      .on('error', reject)
      .on('end', resolve)
      .save(outPath);
  });
  return outPath;
}

export function hasEmbeddedCover(mp3Path) {
  try {
    const tags = NodeID3.read(mp3Path) || {};
    return !!(tags.image || tags.APIC || (tags.attachedPicture && tags.attachedPicture.imageBuffer));
  } catch {
    return false;
  }
}

export async function embedCoverIntoMp3(mp3Path, imagePath, tmpDir) {
  try {
    if (!fs.existsSync(mp3Path)) throw new Error('MP3 not found');
    if (!imagePath || !fs.existsSync(imagePath)) throw new Error('Image not found');

    let src = imagePath;
    if (!isImageFile(src)) throw new Error('Unsupported image type');

    const ext = path.extname(src).toLowerCase();
    let convertedTemp = null;
    if (ext === '.webp' || ext === '.png') {
      src = await convertToJpeg(src, tmpDir);
      convertedTemp = src;
    }

    // NodeID3 supports { image: path | buffer }
    const ok = NodeID3.update({ image: src }, mp3Path);
    if (!ok) throw new Error('ID3 update failed');
    // Cleanup temp converted file if any
    if (convertedTemp && fs.existsSync(convertedTemp)) {
      try { fs.unlinkSync(convertedTemp); } catch {}
    }
    return true;
  } catch (e) {
    console.error('embedCoverIntoMp3 failed:', e);
    return false;
  }
}

export function extractEmbeddedCover(mp3Path) {
  try {
    const tags = NodeID3.read(mp3Path) || {};
    // Different shapes depending on lib version
    const pic = tags.image || tags.APIC || tags.attachedPicture;
    if (!pic) return null;

    if (Buffer.isBuffer(pic)) {
      return { mime: 'image/jpeg', buffer: pic }; // best-guess
    }
    if (pic && pic.imageBuffer) {
      const mime = pic.mime || 'image/jpeg';
      return { mime, buffer: pic.imageBuffer };
    }
    if (typeof pic === 'string') {
      // path to image (rare in read), try load
      try {
        const buf = fs.readFileSync(pic);
        return { mime: 'image/jpeg', buffer: buf };
      } catch {}
    }
    return null;
  } catch (e) {
    console.error('extractEmbeddedCover failed:', e);
    return null;
  }
}
