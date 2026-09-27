import { createClient } from 'redis';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { parseJSON } from '../../utils/parseJSON.js';

import type { Notification } from './types.js';

const log = createLogger('NotificationPubSub');

const redisUrl = env.REDIS_URL;

type NotificationCallback = (notification: Notification) => void;

/**
 * Ein Nutzer, beliebig viele offene Ströme.
 *
 * Vorher stand hier `Map<string, NotificationCallback>` — ein Rückruf pro
 * Person, letzter Schreiber gewinnt. Mit drei offenen Tabs hatte das drei
 * Folgen, und keine davon ist im Log zu sehen:
 *
 * 1. Tab 3 überschrieb die Rückrufe von Tab 1 und 2. Deren Ströme blieben
 *    offen und still.
 * 2. `client.subscribe(channel, …)` wurde je Verbindung erneut aufgerufen und
 *    hängte einen weiteren Zuhörer an denselben Kanal. Jede Meldung lief
 *    dadurch mehrfach in denselben (neuesten) Rückruf — dieselbe
 *    Benachrichtigung mehrfach.
 * 3. Schloss IRGENDEIN Tab, kündigte `unsubscribe(channel)` den Kanal für
 *    alle. Danach schwiegen auch die verbliebenen Tabs.
 *
 * Bemerkt wurde davon nichts, weil der Strom bis vor Kurzem ohnehin im
 * Sekundentakt neu aufgebaut wurde (siehe useNotificationSSE) und dabei jedes
 * Mal den Rückruf zurückeroberte. Wer die Reconnect-Schleife schließt, legt
 * diesen Fehler frei.
 */
const subscriptions = new Map<string, Set<NotificationCallback>>();
let subscriberClient: ReturnType<typeof createClient> | null = null;
let subscriberReady = false;

function channelFor(userId: string): string {
  return `notifications:${userId}`;
}

async function getSubscriberClient(): Promise<ReturnType<typeof createClient>> {
  if (subscriberClient && subscriberReady) return subscriberClient;

  if (!subscriberClient) {
    subscriberClient = createClient({
      ...(redisUrl ? { url: redisUrl } : {}),
      socket: {
        keepAlive: true,
        connectTimeout: 10000,
        reconnectStrategy: (retries: number) => Math.min(retries * 500, 30000),
      },
    });

    subscriberClient.on('error', (err: unknown) =>
      log.warn('Redis subscriber error', {
        error: err instanceof Error ? err.message : String(err),
      })
    );
    subscriberClient.on('ready', () => {
      subscriberReady = true;
      log.debug('Redis subscriber ready');
    });
    subscriberClient.on('end', () => {
      subscriberReady = false;
    });

    await subscriberClient.connect();
  }

  return subscriberClient;
}

/**
 * Einen Strom anmelden. Der Rückgabewert meldet GENAU DIESEN Strom wieder ab —
 * die Person als Schlüssel reicht nicht, sobald sie zwei Tabs offen hat.
 *
 * Der Redis-Kanal wird nur beim ersten Strom einer Person abonniert und erst
 * mit dem letzten gekündigt.
 */
export async function subscribeToUserNotifications(
  userId: string,
  callback: NotificationCallback
): Promise<() => Promise<void>> {
  const existing = subscriptions.get(userId);

  if (existing) {
    existing.add(callback);
    return () => removeSubscriber(userId, callback);
  }

  const listeners = new Set<NotificationCallback>([callback]);
  subscriptions.set(userId, listeners);

  try {
    const client = await getSubscriberClient();
    await client.subscribe(channelFor(userId), (message) => {
      let notification: Notification;
      try {
        notification = parseJSON<Notification>(message);
      } catch (err) {
        log.warn('Failed to parse notification message', { userId, error: String(err) });
        return;
      }

      // Über eine Kopie laufen: ein Rückruf darf sich beim Zustellen abmelden
      // (Verbindung bricht mitten in der Schleife), ohne die Iteration zu
      // beschädigen.
      for (const cb of [...(subscriptions.get(userId) ?? [])]) {
        // Jeder Strom für sich. Lag der Fehler in EINEM Rückruf (etwa ein
        // `res.write` auf eine schon beendete Antwort), riss er vorher — ein
        // gemeinsamer try/catch um die ganze Schleife — alle danach iterierten
        // Tabs derselben Person mit, obwohl deren Verbindungen in Ordnung sind.
        // Genau die soll dieser Pfad erreichen.
        try {
          cb(notification);
        } catch (err) {
          log.warn('Notification delivery to one stream failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
  } catch (err) {
    // Ohne dieses Aufräumen bliebe ein Eintrag ohne Redis-Abo stehen, und der
    // nächste Strom derselben Person nähme den Zweig „schon abonniert" — er
    // würde nie etwas bekommen.
    listeners.delete(callback);
    if (listeners.size === 0) subscriptions.delete(userId);
    throw err;
  }

  return () => removeSubscriber(userId, callback);
}

async function removeSubscriber(userId: string, callback: NotificationCallback): Promise<void> {
  const listeners = subscriptions.get(userId);
  if (!listeners) return;

  listeners.delete(callback);
  if (listeners.size > 0) return;

  subscriptions.delete(userId);
  if (!subscriberClient) return;

  // Bewusst ohne `subscriberReady`-Gatter: das Anmelden fragt es auch nicht ab,
  // und die Flanke ist unsymmetrisch teuer. Steht das Flag beim Abmelden gerade
  // auf false (Reconnect, oder `ready` ist für diesen Client noch nie gefeuert),
  // bliebe der Kanal für immer abonniert — und der nächste Strom derselben
  // Person hängte einen ZWEITEN Zuhörer daran, womit die doppelte Zustellung
  // zurück wäre. Ein Fehlschlag hier ist folgenlos, weil der Zuhörer seine
  // Empfänger ohnehin live aus `subscriptions` liest.
  await subscriberClient.unsubscribe(channelFor(userId)).catch((err: unknown) => {
    log.debug('Unsubscribe failed, channel may stay open', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/** Nur für Tests: den Modulzustand zwischen Fällen leeren. */
export function _resetNotificationSubscriptionsForTests(): void {
  subscriptions.clear();
}

export async function publishNotification(
  userId: string,
  notification: Notification
): Promise<void> {
  if (!redisUrl) return;

  const { redisClient } = await import('../../utils/redis/client.js');

  await redisClient.publish(channelFor(userId), JSON.stringify(notification));
}
