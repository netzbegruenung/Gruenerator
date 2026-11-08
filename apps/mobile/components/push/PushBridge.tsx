import { getContractsClient } from '@gruenerator/shared/api';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

import { pushTargetOf } from '../../services/push/pushPayload';
import { syncPushRegistration, watchPushToken } from '../../services/push/pushRegistration';
import { actionUrlToRoute } from '../../utils/actionUrl';

/**
 * Keeps this device's push registration current for the signed-in user and
 * opens what a tapped push points to — also on a cold start from the tap,
 * which is why it waits for the root navigator before routing.
 */
export function PushBridge({ userId }: { userId: string }) {
  const response = Notifications.useLastNotificationResponse();
  const navigationReady = useRootNavigationState()?.key != null;

  useEffect(() => {
    void syncPushRegistration(userId);
    watchPushToken(userId);
  }, [userId]);

  useEffect(() => {
    if (!navigationReady || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const target = pushTargetOf(response.notification.request.content.data);
    if (!target) return;
    // Handle a tap once: without this a remount would open it again.
    Notifications.clearLastNotificationResponse();
    router.push(actionUrlToRoute(target.url));
    if (target.id) {
      void getContractsClient()
        .notifications.markAsRead({ params: { id: target.id }, body: {} })
        .catch(() => {});
    }
  }, [navigationReady, response]);

  return null;
}
