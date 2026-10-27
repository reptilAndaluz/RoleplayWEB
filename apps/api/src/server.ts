import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';

export { app };

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      console.log(`API Hono escuchando en http://${env.HOST}:${info.port} [${env.NODE_ENV}]`);
    }
  );
}
