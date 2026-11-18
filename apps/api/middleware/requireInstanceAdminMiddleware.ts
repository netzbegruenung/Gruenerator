import { type NextFunction, type Request, type Response } from 'express';

import { requireInstanceAdmin } from '../utils/adminAuthz.js';

/** Instance-admin gate for raw Express mounts (e.g. TUS). Run after `requireAuth`. */
export async function requireInstanceAdminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = (req as Request & { user?: { id?: string; email?: string | null } }).user;
  let allowed = false;
  try {
    allowed = user?.id ? await requireInstanceAdmin(user.id, user.email ?? null) : false;
  } catch (error) {
    next(error);
    return;
  }
  if (!allowed) {
    res
      .status(403)
      .json({ success: false, code: 'FORBIDDEN', message: 'Administratorrechte erforderlich' });
    return;
  }
  next();
}
