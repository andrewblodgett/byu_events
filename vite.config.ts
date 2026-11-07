import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // The site is served from https://andrewblodgett.github.io/byu_events/
  base: '/byu_events/',
  plugins: [svelte()],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
