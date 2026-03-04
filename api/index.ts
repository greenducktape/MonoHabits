import { createApp } from '../src/app';

let app: any;

export default async function handler(req: any, res: any) {
  try {
    if (!app) {
      console.log('Vercel Handler: Initializing app...');
      app = await createApp();
      console.log('Vercel Handler: App initialized.');
    }
    return app(req, res);
  } catch (error: any) {
    console.error('Vercel Handler Error:', error);
    res.status(500).json({
      error: 'Internal Server Error during initialization',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
