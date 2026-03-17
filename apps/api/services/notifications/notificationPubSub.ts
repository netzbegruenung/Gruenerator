import { createClient } from 'redis';

import { createLogger } from '../../utils/logger.js';

import type { Notification } from './types.js';

const log = createLogger('NotificationPubSub');

const redisUrl = process.env.REDIS_URL;

type NotificationCallback = (notification: Notification) => void;

const subscriptions = new Map<string, NotificationCallback>();
let subscriberClient: ReturnType<typeof createClient> | null = null;
let subscriberReady = false;

function channelFor(userId: string): string {
  return `notifications:${userId}`;
}

async function getSubscriberClient(): Promise<ReturnType<typeof createClient>> {
  if (subscriberClient && subscriberReady) return subscriberClient;

  if (!subscriberClient) {
    subscriberClient = createClient({
      url: redisUrl,
      socket: {
        keepAlive: true,
        connectTimeout: 10000,
        reconnectStrategy: (retries: number) => Math.min(retries * 500, 30000),
      },
    });

    subscriberClient.on('error', (err) =>
      log.warn('Redis subscriber error', { error: err.message })
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

export async function subscribeToUserNotifications(
  userId: string,
  callback: NotificationCallback
): Promise<void> {
  const client = await getSubscriberClient();
  const channel = channelFor(userId);

  subscriptions.set(userId, callback);

  await client.subscribe(channel, (message) => {
    try {
      const notification = JSON.parse(message) as Notification;
      const cb = subscriptions.get(userId);
      cb?.(notification);
    } catch (err) {
      log.warn('Failed to parse notification message', { userId, error: String(err) });
    }
  });
}

export async function unsubscribeFromUserNotifications(userId: string): Promise<void> {
  subscriptions.delete(userId);

  if (subscriberClient && subscriberReady) {
    await subscriberClient.unsubscribe(channelFor(userId)).catch(() => {});
  }
}

export async function publishNotification(
  userId: string,
  notification: Notification
): Promise<void> {
  if (!redisUrl) return;

  const { redisClient } = await import('../../utils/redis/client.js');

  await redisClient.publish(channelFor(userId), JSON.stringify(notification));
}
