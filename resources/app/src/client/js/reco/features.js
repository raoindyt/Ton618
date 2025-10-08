// Lightweight audio feature capture using existing Player AnalyserNode
// Caches per-track features in IndexedDB keyed by track href
// Keeps files <300 lines

import { player } from '../player.js';

const DB_NAME = 'reco-features-v1';
const STORE = 'features';

let dbPromise = null;
function openDB(){
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return dbPromise;
}

async function idbGet(id){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const rq = st.get(id);
    rq.onsuccess = ()=> resolve(rq.result || null);
    rq.onerror = ()=> reject(rq.error);
  });
}
async function idbPut(obj){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const rq = st.put(obj);
    rq.onsuccess = ()=> resolve(true);
    rq.onerror = ()=> reject(rq.error);
  });
}

// Public API
export async function getFeature(id){ return await idbGet(id); }
export async function setFeature(id, data){ return await idbPut({ id, ...data }); }

// Compute features by sampling analyser for ~10 seconds
// Returns { sr, fft, centroid, rolloff, flatness, zcr, rms, flux }
let _captureGen = 0; // increases to cancel running capture
function cancelActiveCapture(){ _captureGen++; }
async function captureForCurrentTrack(maxSeconds = 8, startDelayMs = 1500){
  const analyser = player.getAnalyser();
  const ctx = player.ctx;
  if (!analyser || !ctx) return null;
  const sr = ctx.sampleRate || 48000;
  const fft = analyser.fftSize || 1024;
  const nFreq = analyser.frequencyBinCount;
  const nTime = fft;
  const freq = new Float32Array(nFreq);
  const time = new Uint8Array(nTime);
  // Reusable magnitude buffers to minimize GC
  const mag = new Float32Array(nFreq);
  let lastMag = new Float32Array(nFreq);

  const frames = [];
  const start = performance.now();
  const myGen = ++_captureGen;
  return await new Promise((resolve)=>{
    const tick = ()=>{
      // Abort if hidden, paused, or canceled
      if (document.hidden || player.audio?.paused || myGen !== _captureGen) { resolve(null); return; }
      analyser.getFloatFrequencyData(freq);
      analyser.getByteTimeDomainData(time);
      for (let i=0;i<nFreq;i++){
        // Convert dB to magnitude (approx)
        const db = freq[i];
        mag[i] = isFinite(db) ? Math.pow(10, db/20) : 0;
      }
      const frame = computeFrameFeatures(mag, time, sr, fft, lastMag);
      frames.push(frame);
      // Swap buffers for next iteration without reallocating
      const tmp = lastMag; lastMag = mag; for (let i=0;i<nFreq;i++) mag[i] = tmp[i];
      if ((performance.now() - start) / 1000 >= maxSeconds) {
        const agg = aggregateFrames(frames);
        resolve({ sr, fft, ...agg });
        return;
      }
      // ~5 Hz sampling to further reduce CPU
      setTimeout(tick, 200);
    };
    // Delay start slightly so UI settles after playback begins
    setTimeout(tick, Math.max(0, startDelayMs|0));
  });
}

function computeFrameFeatures(mag, timeBytes, sr, fft, lastMag){
  // Spectral centroid
  let sumMag = 0, sumFreqMag = 0;
  const binHz = sr / (2*mag.length); // since mag length = fft/2
  for (let i=0;i<mag.length;i++){ const m = mag[i]; sumMag += m; sumFreqMag += i*binHz*m; }
  const centroid = sumMag>0 ? (sumFreqMag / sumMag) : 0;
  // Rolloff (85%)
  let cum = 0; const target = sumMag * 0.85; let roll = 0;
  for (let i=0;i<mag.length;i++){ cum += mag[i]; if (cum>=target){ roll = i*binHz; break; } }
  // Flatness (geometric/arith)
  let gsum = 0; for (let i=0;i<mag.length;i++){ const m = Math.max(mag[i], 1e-8); gsum += Math.log(m); }
  const geo = Math.exp(gsum / mag.length); const ari = sumMag / mag.length; const flatness = ari>0 ? (geo/ari) : 0;
  // Time-domain arrays are 0..255
  let zc = 0; let prev = (timeBytes[0]-128)/128;
  let eSum = 0;
  for (let i=1;i<timeBytes.length;i++){
    const v = (timeBytes[i]-128)/128;
    eSum += v*v;
    if ((v>=0 && prev<0) || (v<0 && prev>=0)) zc++;
    prev = v;
  }
  const zcr = zc / timeBytes.length;
  const rms = Math.sqrt(eSum / timeBytes.length);
  // Spectral flux
  let flux = 0;
  if (lastMag){
    for (let i=0;i<mag.length;i++){
      const d = mag[i] - lastMag[i]; if (d>0) flux += d;
    }
    flux /= mag.length;
  }
  return { centroid, roll, flatness, zcr, rms, flux };
}

function aggregateFrames(frames){
  if (!frames || !frames.length) return { centroid:0, rolloff:0, flatness:0, zcr:0, rms:0, flux:0 };
  const n = frames.length;
  let c=0,r=0,f=0,z=0,e=0,x=0;
  for (const fr of frames){ c+=fr.centroid; r+=fr.roll; f+=fr.flatness; z+=fr.zcr; e+=fr.rms; x+=fr.flux||0; }
  return { centroid:c/n, rolloff:r/n, flatness:f/n, zcr:z/n, rms:e/n, flux:x/n };
}

function genVec(feat){
  // Build a normalized vector for cosine similarity
  const v = [feat.centroid, feat.rolloff, feat.flatness*1000, feat.zcr*1000, feat.rms*1000, (feat.flux||0)*1000];
  // Normalize
  const mean = v.reduce((a,b)=>a+b,0)/v.length;
  const std = Math.sqrt(v.reduce((a,b)=>a+(b-mean)*(b-mean),0)/v.length) || 1;
  const vn = v.map(x=>(x-mean)/std);
  return vn;
}

export function cosine(a,b){
  if (!a||!b||a.length!==b.length) return 0;
  let dot=0,na=0,nb=0; for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return (na>0&&nb>0) ? dot/Math.sqrt(na*nb) : 0;
}

export async function getOrCaptureFeatureFor(id){
  const cur = await getFeature(id);
  if (cur && cur.vec) return cur;
  // Cancel any previous capture before starting a new one
  cancelActiveCapture();
  const captured = await captureForCurrentTrack(6, 2000);
  if (!captured) return null;
  const vec = genVec(captured);
  const data = { ...captured, vec };
  await setFeature(id, data);
  return data;
}

// Auto-capture on play
let activeHref = null;
window.addEventListener('trackchange', async (e)=>{
  try {
    const href = e?.detail?.src;
    if (!href || href === activeHref) return;
    activeHref = href;
    const existing = await getFeature(href);
    if (existing && existing.vec) return; // already captured
    // kick off capture but do not block UI
    cancelActiveCapture();
    captureForCurrentTrack(6, 2000).then(res=>{
      if (!res) return; const vec = genVec(res); setFeature(href, { ...res, vec, id: href });
    }).catch(()=>{});
  } catch {}
});

// Cancel capture when page becomes hidden or playback pauses to save CPU
document.addEventListener('visibilitychange', ()=>{ if (document.hidden) cancelActiveCapture(); });
try { player.audio?.addEventListener('pause', ()=> cancelActiveCapture()); } catch {}
