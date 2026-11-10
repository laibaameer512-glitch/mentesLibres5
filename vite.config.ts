import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));

function swVersionPlugin() {
  return {
    name: 'sw-version-plugin',
    closeBundle() {
      const swDist = path.resolve(__dirname, 'dist/sw.js');
      if (fs.existsSync(swDist)) {
        let content = fs.readFileSync(swDist, 'utf-8');
        const buildVersion = `calculator-shell-${Date.now()}`;
        content = content.replace(/__SW_CACHE_VERSION__|calculator-shell-v\d+/g, buildVersion);
        fs.writeFileSync(swDist, content, 'utf-8');
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), swVersionPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
