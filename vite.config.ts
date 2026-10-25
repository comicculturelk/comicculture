import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { seoPlugin } from './server/viteSeo';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY ??= env.VITE_SUPABASE_ANON_KEY;
  return {
    plugins: [react(), seoPlugin()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      host: true,
      allowedHosts: true,
    },
  };
});
