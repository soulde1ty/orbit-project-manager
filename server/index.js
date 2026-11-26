import { createStore } from './store.js';
import { createApp } from './app.js';
const store = await createStore();
const app = createApp(store);
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () =>
  console.log(`Orbit API ready at http://${host}:${port} (${store.mode})`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await store.close();
      process.exit(0);
    }),
  );
