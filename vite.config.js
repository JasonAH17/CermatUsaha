import { defineConfig, loadEnv } from 'vite';
import { aiMiddleware } from './server/ai.js';

// Endpoint /api/ai dijalankan di server Vite supaya API key tetap rahasia
const cermatAi = (env) => ({
  name: 'cermat-ai',
  configureServer(server) {
    server.middlewares.use('/api/ai', aiMiddleware(env));
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/ai', aiMiddleware(env));
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // '' = baca juga variabel tanpa awalan VITE_
  return {
    server: { host: true }, // bisa dibuka dari HP via IP laptop
    plugins: [cermatAi(env)],
  };
});
