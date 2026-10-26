import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { seoPlugin } from './server/viteSeo.ts';
import { SITE_URL } from './src/lib/seo.ts';

// https://vitejs.dev/config/
export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY ??= env.VITE_SUPABASE_ANON_KEY;
  // A push must never publish a storefront whose required security gateway
  // has not been configured yet. Local/test builds remain available.
  if (command === 'build' && process.env.VERCEL === '1') {
    if (!env.VITE_TURNSTILE_SITE_KEY?.trim()) throw new Error('Configure VITE_TURNSTILE_SITE_KEY before releasing the protected checkout.');
    const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/checkout`, {
      method: 'OPTIONS', headers: { Origin: SITE_URL }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Deploy and configure the checkout gateway before releasing the storefront.');
  }
  return {
    plugins: [react(), seoPlugin()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      host: '127.0.0.1',
    },
  };
});
