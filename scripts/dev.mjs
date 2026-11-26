import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const processes = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--watch', 'server/index.js'], {
    stdio: 'inherit',
  }),
  spawn(
    process.execPath,
    [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))],
    { stdio: 'inherit' },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  processes.forEach((p) => p.kill());
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
processes.forEach((p) => p.on('exit', (code) => stop(code || 0)));
