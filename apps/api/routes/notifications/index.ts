import { Router } from 'express';

import {
  getNotificationsForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  dismissAllNotifications,
  subscribeToUserNotifications,
  unsubscribeFromUserNotifications,
} from '../../services/notifications/index.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthRequest } from '../auth/types.js';
import type { Response } from 'express';

const log = createLogger('NotificationsRoute');
const router = Router();

/**
 * GET /api/notifications/stream — SSE endpoint for real-time notifications
 */
router.get('/stream', (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const flushRes = () => (res as { flush?: () => void }).flush?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);
  flushRes();

  subscribeToUserNotifications(userId, (notification) => {
    res.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
    flushRes();
  }).catch((err: unknown) => {
    log.warn('Failed to subscribe to notifications SSE', { userId, error: err instanceof Error ? err.message : String(err) });
  });

  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
    flushRes();
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribeFromUserNotifications(userId).catch(() => {});
  });
});

/**
 * GET /api/notifications — paginated notification list
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = Math.min(parseInt(String(req.query.limit)) || 20, 50);
    const offset = parseInt(String(req.query.offset)) || 0;
    const unreadOnly = req.query.unread_only === 'true';

    const notifications = await getNotificationsForUser(userId, { limit, offset, unreadOnly });
    return res.json(notifications);
  } catch (error: unknown) {
    log.error('Failed to get notifications', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 */
router.get('/unread-count', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const count = await getUnreadCount(userId);
    return res.json({ count });
  } catch (error: unknown) {
    log.error('Failed to get unread count', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * PATCH /api/notifications/:id/read — mark a single notification as read
 */
router.patch('/:id/read', async (req: AuthRequest<{ id: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    await markAsRead(id, userId);
    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('Failed to mark notification as read', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * PATCH /api/notifications/read-all — mark all notifications as read
 */
router.patch('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await markAllAsRead(userId);
    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('Failed to mark all as read', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * DELETE /api/notifications/:id — dismiss a single notification
 */
router.delete('/:id', async (req: AuthRequest<{ id: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    await dismissNotification(id, userId);
    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('Failed to dismiss notification', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

/**
 * DELETE /api/notifications — dismiss all notifications
 */
router.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await dismissAllNotifications(userId);
    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('Failed to dismiss all notifications', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to dismiss all' });
  }
});

export default router;
