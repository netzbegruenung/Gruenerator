import { Router } from 'express';

import { tryResolveUser } from '../../middleware/authMiddleware.js';
import { subscribeToUserNotifications } from '../../services/notifications/index.js';
import { createLogger } from '../../utils/logger.js';

import type { Request, Response } from 'express';

const log = createLogger('NotificationStream');

const KEEPALIVE_MS = 30_000;

// A terminal answer also raises the BROWSER's own reconnect timer (default
// ~3s). A client that manages its reconnects itself closes the EventSource and
// never sees this; for one that doesn't, it is the only brake we have.
const TERMINAL_RETRY_MS = 300_000;

/**
 * GET /api/notifications/stream — SSE channel for real-time notifications.
 *
 * Mounted BEFORE the `/api/notifications` requireAuth prefix and resolving the
 * session itself, because an EventSource client cannot read status codes: the
 * browser surfaces a 401 as the same bare `error` event as a dropped
 * connection. A client that cannot tell those apart has to guess — and the
 * guess is what produced an endless 30s reconnect beat from tabs whose session
 * had died (production log 01.09.2026, three tabs of one browser), one WARN
 * access-log line per attempt, for as long as the tab stayed open.
 *
 * So the reason travels IN the stream and the response stays 200:
 *   - `unauthorized` — no session. The client asks the auth layer and stops.
 *   - `unavailable`  — auth backend down. Come back later; do NOT tear the
 *                      session down. Same distinction requireAuth draws with
 *                      503-instead-of-401 for XHR callers, and for the same
 *                      reason: a Redis hiccup must not log everyone out.
 *
 * Neither case subscribes to anything or writes a byte of data; the stream is
 * closed immediately. Authentication is unchanged — only how the refusal is
 * reported.
 *
 * This is also the only half of the fix that reaches a tab that is ALREADY
 * open: a tab runs the bundle it loaded, forever, so no client change can ever
 * quiet the ones logging today — but they get this answer on the next deploy.
 */
export async function notificationStreamHandler(req: Request, res: Response): Promise<void> {
  const resolved = await tryResolveUser(req);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const flushRes = () => (res as { flush?: () => void }).flush?.();

  // Dieselbe Absicherung wie in `sseHelpers.ts`: auf eine beendete oder
  // zerstörte Antwort zu schreiben ist ein Fehler, kein Sonderfall. Ohne das
  // Gatter trägt der Rückruf den Fehler bis in die Zustell-Schleife des
  // Pub/Sub — und mit ihm die Frage, wessen Strom daran schuld war.
  const writeSse = (payload: string): void => {
    if (res.writableEnded || res.destroyed) return;
    res.write(payload);
    flushRes();
  };

  if (resolved.kind !== 'user') {
    const reason = resolved.kind === 'unavailable' ? 'unavailable' : 'unauthorized';
    // `data:` is not decoration — an event whose data buffer stays empty is
    // never dispatched to the client.
    writeSse(`retry: ${TERMINAL_RETRY_MS}\nevent: ${reason}\ndata: {}\n\n`);
    res.end();
    return;
  }

  const userId = resolved.user.id;

  writeSse(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  // Diese Verbindung meldet sich mit IHREM eigenen Rückruf wieder ab, nicht
  // über die Nutzer-ID — sonst nimmt der erste schließende Tab allen anderen
  // Tabs derselben Person die Benachrichtigungen mit.
  let unsubscribe: (() => Promise<void>) | null = null;
  let closed = false;

  subscribeToUserNotifications(userId, (notification) => {
    writeSse(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
  })
    .then((dispose) => {
      unsubscribe = dispose;
      // Schließt der Browser, bevor das Abo stand, käme das `close`-Ereignis
      // an einem noch leeren `unsubscribe` vorbei und der Rückruf bliebe für
      // immer in der Menge stehen — samt offenem Redis-Kanal.
      if (closed) void dispose();
    })
    .catch((err: unknown) => {
      log.warn('Failed to subscribe to notifications SSE', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  const keepAlive = setInterval(() => {
    writeSse(':keepalive\n\n');
  }, KEEPALIVE_MS);

  req.on('close', () => {
    closed = true;
    clearInterval(keepAlive);
    void unsubscribe?.();
  });
}

const router = Router();
router.get('/', notificationStreamHandler);

export default router;
