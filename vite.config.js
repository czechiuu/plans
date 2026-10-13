import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private/**', '**/test-results/private/**'] },
  },
  build: { sourcemap: false },
});
