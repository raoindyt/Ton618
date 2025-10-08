import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import net from 'net';
import { WebSocketServer } from 'ws';
import fs from 'fs';

import searchRouter from './routes/search.js';
import downloadRouter, { attachWsBridge } from './routes/download.js';
import libraryRouter from './routes/library.js';
import playlistsRouter from './routes/playlists.js';
import settingsRouter from './routes/settings.js';
import { mountStatic } from './static_mounts.js';
import { checkAndInstallDependencies } from '../modules/installer/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PREFERRED_PORT = Number(process.env.PORT) || 6180;
const app = express();

// Ensure data directories exist
const DATA_DIR = path.resolve(__dirname, '../../data');
const LIB_DIR = path.join(DATA_DIR, 'library');
const COVER_DIR = path.join(DATA_DIR, 'covers');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
[DATA_DIR, LIB_DIR, COVER_DIR, TMP_DIR].forEach((p) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.set('DATA_DIR', DATA_DIR);
app.set('LIB_DIR', LIB_DIR);
app.set('COVER_DIR', COVER_DIR);
app.set('TMP_DIR', TMP_DIR);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// API routes
app.use('/api/search', searchRouter);
app.use('/api/download', downloadRouter);
app.use('/api/library', libraryRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api', settingsRouter);

// Static client
const clientDir = path.resolve(__dirname, '../client');
app.use('/', express.static(clientDir));
mountStatic(app);
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

const server = http.createServer(app);

// Probe a free port without engaging the HTTP server to avoid state issues
async function findFreePort(startPort, attempts = 10){
  // If invalid or 0, allow OS to choose
  if (!Number.isFinite(startPort) || startPort <= 0) {
    return new Promise((resolve, reject)=>{
      const s = net.createServer();
      s.once('error', reject);
      s.listen(0, ()=>{
        const addr = s.address();
        const p = (typeof addr === 'object' && addr) ? addr.port : 0;
        s.close(()=> resolve(p));
      });
    });
  }
  let lastErr;
  for (let i = 0; i < attempts; i++){
    const tryPort = startPort + i;
    const ok = await new Promise((resolve)=>{
      const s = net.createServer();
      s.once('error', ()=>{ try { s.close(()=>resolve(false)); } catch { resolve(false); } });
      s.listen(tryPort, ()=>{ const close = ()=> s.close(()=>resolve(true)); close(); });
    });
    if (ok) return tryPort;
  }
  throw lastErr || new Error('Unable to find a free port');
}

async function startServer() {
  try {
    console.log('Initializing TON 618 server...');
    console.log('Working directory:', process.cwd());
    console.log('__dirname:', __dirname);
    
    // Check dependencies first
    console.log('Checking dependencies...');
    const depsOk = await checkAndInstallDependencies();
    if (!depsOk) {
      console.warn('Some dependencies failed to install. Search functionality may be limited.');
    }
    console.log('Dependencies checked successfully');
    
    console.log('Finding free port...');
    const actualPort = await findFreePort(PREFERRED_PORT, 10);
    console.log('Using port:', actualPort);
    
    console.log('Starting HTTP server...');
    await new Promise((resolve, reject)=>{
      const onListening = ()=>{ 
        server.off('error', onError); 
        console.log(`TON 618 server listening on http://localhost:${actualPort}`);
        resolve(); 
      };
      const onError = (err)=>{ 
        server.off('listening', onListening); 
        console.error('Server listen error:', err);
        reject(err); 
      };
      server.once('listening', onListening);
      server.once('error', onError);
      server.listen(actualPort);
    });
    
    console.log('Attaching WebSocket server...');
    // Now that the HTTP server is bound, attach WebSocket server
    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('error', (err)=>{ try { console.warn('WebSocketServer error:', err?.message || err); } catch {} });
    attachWsBridge(wss);
    
    console.log('Server ready and listening - process will stay alive');
    console.log('Server is now running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('Failed to start server:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Start server and keep process alive
startServer().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
