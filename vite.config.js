import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub project sites live under /repository-name/; local development stays /.
  base: process.env.VITE_BASE_PATH || '/',
});
