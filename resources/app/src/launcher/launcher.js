import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.resolve(__dirname, '../server/index.js');

const srv = spawn(process.execPath, [serverPath], { stdio: 'inherit' });

srv.on('spawn', () => {
  setTimeout(() => open('http://localhost:6180'), 800);
});

srv.on('exit', (code) => {
  process.exit(code || 0);
});
