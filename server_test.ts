import { createApp } from './src/app.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  try {
    const app = await createApp();
    const PORT = 3001;

    // Vite middleware
    if (process.env.NODE_ENV !== 'production') {
      try {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      } catch (viteError) {
        console.error('Vite middleware failed to initialize:', viteError);
        app.get('*', (req, res) => {
          res.status(500).send('<h1>Vite Middleware Failed</h1><pre>' + viteError + '</pre>');
        });
      }
    } else {
      // In production, serve static files from dist
      app.use(express.static(path.join(__dirname, 'dist')));
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
      });
    }
    
    /*
    app.get('/', (req, res) => {
      res.send('<h1>Server is running!</h1><p>Vite middleware is disabled for debugging.</p>');
    });
    */

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    server.on('error', (err: any) => {
      console.error('Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use.`);
        process.exit(1);
      }
    });

    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    // Do not exit, serve error page instead
    const app = express();
    app.get('*', (req, res) => {
      res.status(500).send('<h1>Server Startup Failed</h1><pre>' + error + '</pre>');
    });
    app.listen(3000, '0.0.0.0', () => {
      console.log('Fallback error server running on port 3000');
    });
  }
}

startServer();
