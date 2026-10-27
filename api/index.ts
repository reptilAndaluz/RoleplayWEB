import { getRequestListener } from '@hono/node-server';
import { app } from '../apps/api/src/app.js';

export default getRequestListener(app.fetch);
