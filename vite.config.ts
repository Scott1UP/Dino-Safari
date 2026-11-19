import { defineConfig } from 'vite';

// The address the app is served from, for the link-preview tags in index.html, which must be
// full addresses. Netlify sets URL during its builds; set SITE_URL to override it. Without
// either (as in local development) the tags fall back to paths from the root of the site.
const siteUrl = (process.env.SITE_URL ?? process.env.URL ?? '').replace(/\/$/, '');

export default defineConfig({
  base: './',
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
  ],
});
