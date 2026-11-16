import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import type { NextFunction, Request, Response } from 'express';

const isRateLimitDisabled = process.env.DISABLE_RATE_LIMITS === 'true';

// Same bucket key as the other limiters in routes.ts: user when known, else /64-normalised IP.
const perUserOrIpKey = (req: Request): string =>
  req.user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'anonymous');

/**
 * Password guesses on `POST /api/parteitage/:slug/entsperren`: 10 per 15 min and user.
 * Mounted at the /api/parteitage prefix, so every other request is skipped.
 */
export const parteitageUnlockLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: perUserOrIpKey,
      skip: (req) => req.method !== 'POST' || !req.path.endsWith('/entsperren'),
      message: {
        success: false,
        code: 'RATE_LIMITED',
        message: 'Zu viele Versuche. Bitte versuche es später erneut.',
      },
    });
