import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('node_modules/vite/bin/vite.js')) {
  console.error('Install dependencies first: pnpm install --frozen-lockfile');
  process.exit(1);
}
console.log('Building Orbit...');
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status || 1);
console.log(
  '\nOpen http://127.0.0.1:3000 in your browser.\nKeep this window open while using Orbit. Press Ctrl+C to stop.\n',
);
const result = spawnSync(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], {
  stdio: 'inherit',
});
process.exitCode = result.status || 0;
