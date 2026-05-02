import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',
  adapter: netlify(),
  integrations: [tailwind({ applyBaseStyles: false })],
  site: 'https://agro-nesvizh.netlify.app'
});