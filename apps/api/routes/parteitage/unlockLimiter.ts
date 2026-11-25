import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../../config/env.js';

import type { NextFunction, Request, Response } from 'express';

const isRateLimitDisabled = env.DISABLE_RATE_LIMITS;

// Same bucket key as the other limiters in routes.ts: user when known, else /64-normalised IP.
const perUserOrIpKey = (req: Request): string =>
  req.user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'anonymous');

// `/<slug>/entsperren` relative to the prefix: the bucket is user AND convention.
const perUserAndSlugKey = (req: Request): string =>
  `${perUserOrIpKey(req)}:${req.path.split('/')[1] ?? ''}`;

/**
 * Password guesses on `POST /api/parteitage/:slug/entsperren`: 10 failed attempts per
 * 15 min and user per Parteitag (successful unlocks do not count).
 * Mounted at the /api/parteitage prefix, so every other request is skipped.
 */
export const parteitageUnlockLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: perUserAndSlugKey,
      skipSuccessfulRequests: true,
      skip: (req) => req.method !== 'POST' || !req.path.endsWith('/entsperren'),
      message: {
        success: false,
        code: 'RATE_LIMITED',
        message: 'Zu viele Versuche. Bitte versuche es später erneut.',
      },
    });
