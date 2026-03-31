import crypto from 'crypto';

import type { Request, Response, NextFunction } from 'express';

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken || !adminToken || typeof adminToken !== 'string') {
    res.status(403).json({ error: 'Admin authentication required' });
    return;
  }
  const tokenBuffer = Buffer.from(adminToken);
  const expectedBuffer = Buffer.from(expectedToken);
  if (
    tokenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
  ) {
    res.status(403).json({ error: 'Admin authentication required' });
    return;
  }
  next();
}
