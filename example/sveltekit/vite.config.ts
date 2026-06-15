import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      // Shim next/server — the @ubay182/hpke-wrapper package re-exports
      // Next.js-specific utilities that are not used in SvelteKit
      'next/server': path.resolve('./src/lib/next-shim.ts'),
      'next/headers': path.resolve('./src/lib/next-shim.ts'),
    }
  }
});
