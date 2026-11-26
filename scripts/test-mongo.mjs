import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { spawn } from 'node:child_process';
import path from 'node:path';

// Downloads an official MongoDB binary into ignored local test storage on first run.
const mongo = await MongoMemoryServer.create({
  binary: { version: '7.0.43', downloadDir: path.resolve('.qa/mongodb') },
  instance: { ip: '127.0.0.1' },
});
try {
  const child = spawn(process.execPath, ['--test', 'tests/mongo.test.js'], {
    stdio: 'inherit',
    env: { ...process.env, MONGODB_TEST_URI: mongo.getUri() },
  });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  process.exitCode = code || 0;
} finally {
  await mongo.stop();
}
