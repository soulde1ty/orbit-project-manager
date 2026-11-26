import { spawnSync } from 'node:child_process';
for (const args of [
  ['--test', 'tests/*.test.js'],
  ['node_modules/vite/bin/vite.js', 'build'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
