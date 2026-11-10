import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/routes/api.ts';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  // Listen on PORT from environment (e.g. Render/Heroku) or fallback to 3000
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

  // Increase payload limits for screenshots and audio records
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Mount API endpoints
  app.use('/api', apiRouter);

  if (!isProd) {
    // Development mode: mount Vite dev server middlewares
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: serve built assets
    const distPath = path.resolve(__dirname, 'dist');

    // Ensure sw.js is always served with no-cache so updates propagate immediately
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.sendFile(path.resolve(distPath, 'sw.js'));
    });

    // Ensure manifest.json has correct PWA manifest content type
    app.get('/manifest.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.sendFile(path.resolve(distPath, 'manifest.json'));
    });

    // Ensure Android assetlinks has correct JSON content type
    app.get('/.well-known/assetlinks.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.sendFile(path.resolve(distPath, '.well-known/assetlinks.json'));
    });

    // Serve built assets (allowing dotfiles for .well-known verification)
    app.use(express.static(distPath, { dotfiles: 'allow' }));

    // SPA fallback: any non-API GET request serves dist/index.html
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Calculator server running on http://0.0.0.0:${PORT} [${isProd ? 'PRODUCTION' : 'DEV'}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
