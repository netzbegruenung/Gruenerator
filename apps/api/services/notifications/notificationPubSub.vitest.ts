/**
 * Ein Nutzer, mehrere offene Ströme.
 *
 * Der Redis-Client ist hier eine Attrappe, die den Kanal-Zuhörer festhält, damit
 * eine „Veröffentlichung" ohne Redis auslösbar ist. Wichtig dabei: die Attrappe
 * zählt subscribe/unsubscribe mit — die halbe Aussage dieser Datei ist, dass
 * beides GENAU EINMAL passiert, egal wie viele Tabs offen sind.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners = new Map<string, (message: string) => void>();
const subscribeSpy = vi.fn();
const unsubscribeSpy = vi.fn();

vi.mock('redis', () => ({
  createClient: () => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: (channel: string, listener: (message: string) => void) => {
      subscribeSpy(channel);
      listeners.set(channel, listener);
      return Promise.resolve();
    },
    unsubscribe: (channel: string) => {
      unsubscribeSpy(channel);
      listeners.delete(channel);
      return Promise.resolve();
    },
  }),
}));

const { subscribeToUserNotifications, _resetNotificationSubscriptionsForTests } =
  await import('./notificationPubSub.js');

const USER = 'user-1';
const CHANNEL = `notifications:${USER}`;

function publish(payload: Record<string, unknown>): void {
  listeners.get(CHANNEL)?.(JSON.stringify(payload));
}

describe('notificationPubSub', () => {
  beforeEach(() => {
    _resetNotificationSubscriptionsForTests();
    listeners.clear();
    subscribeSpy.mockClear();
    unsubscribeSpy.mockClear();
  });

  it('stellt an alle offenen Ströme derselben Person zu', async () => {
    const tabA = vi.fn();
    const tabB = vi.fn();
    const tabC = vi.fn();

    await subscribeToUserNotifications(USER, tabA);
    await subscribeToUserNotifications(USER, tabB);
    await subscribeToUserNotifications(USER, tabC);

    publish({ id: 'n1' });

    // Vorher gewann der letzte Schreiber: nur tabC bekam etwas.
    expect(tabA).toHaveBeenCalledTimes(1);
    expect(tabB).toHaveBeenCalledTimes(1);
    expect(tabC).toHaveBeenCalledTimes(1);
  });

  it('abonniert den Redis-Kanal genau einmal', async () => {
    await subscribeToUserNotifications(USER, vi.fn());
    await subscribeToUserNotifications(USER, vi.fn());
    await subscribeToUserNotifications(USER, vi.fn());

    // Vorher hängte jede Verbindung einen weiteren Zuhörer an denselben Kanal —
    // jede Meldung lief dadurch mehrfach in denselben Rückruf.
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledWith(CHANNEL);
  });

  it('lässt die übrigen Ströme laufen, wenn ein Tab schließt', async () => {
    const tabA = vi.fn();
    const tabB = vi.fn();

    const closeA = await subscribeToUserNotifications(USER, tabA);
    await subscribeToUserNotifications(USER, tabB);

    await closeA();
    publish({ id: 'n1' });

    // Vorher kündigte der erste schließende Tab den Kanal für alle.
    expect(tabA).not.toHaveBeenCalled();
    expect(tabB).toHaveBeenCalledTimes(1);
    expect(unsubscribeSpy).not.toHaveBeenCalled();
  });

  it('kündigt den Kanal erst mit dem letzten Strom', async () => {
    const closeA = await subscribeToUserNotifications(USER, vi.fn());
    const closeB = await subscribeToUserNotifications(USER, vi.fn());

    await closeA();
    expect(unsubscribeSpy).not.toHaveBeenCalled();

    await closeB();
    expect(unsubscribeSpy).toHaveBeenCalledWith(CHANNEL);
  });

  it('abonniert nach dem letzten Abmelden wieder neu', async () => {
    const close = await subscribeToUserNotifications(USER, vi.fn());
    await close();

    const tab = vi.fn();
    await subscribeToUserNotifications(USER, tab);
    publish({ id: 'n2' });

    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(tab).toHaveBeenCalledTimes(1);
  });

  it('meldet doppelt ab, ohne fremde Ströme zu treffen', async () => {
    const tabA = vi.fn();
    const tabB = vi.fn();
    const closeA = await subscribeToUserNotifications(USER, tabA);
    await subscribeToUserNotifications(USER, tabB);

    await closeA();
    await closeA();

    publish({ id: 'n3' });
    expect(tabB).toHaveBeenCalledTimes(1);
    expect(unsubscribeSpy).not.toHaveBeenCalled();
  });
});
