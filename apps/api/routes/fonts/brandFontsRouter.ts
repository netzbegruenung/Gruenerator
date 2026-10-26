import { existsSync } from 'node:fs';

import { brandFontFileSchema } from '@gruenerator/contracts';
import { type Application, type Request, type Response } from 'express';

import { brandFontPath } from '../../services/fonts/brandFonts.js';

/**
 * Brand fonts for web, desktop and app. Public: headings on the login page and
 * on shared links use them too.
 */
function sendBrandFont(req: Request, res: Response): void {
  const parsed = brandFontFileSchema.safeParse(req.params.file);
  const file = parsed.success ? brandFontPath(parsed.data) : null;
  if (!file || !existsSync(file)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(file);
}

export function mountBrandFontsRouter(app: Application): void {
  app.get('/api/fonts/:file', sendBrandFont);
}
