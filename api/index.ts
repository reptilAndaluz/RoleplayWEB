import { handle } from 'hono/vercel';
import { app } from '../apps/api/src/app.js';

export default handle(app);
