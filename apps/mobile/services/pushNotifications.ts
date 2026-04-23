/**
 * Push Notification Service
 * Handles Expo push token registration and foreground notification display.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getGlobalApiClient } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions, get an Expo push token, and
 * register it with the backend. The backend upserts into
 * `app_push_devices` keyed by (user_id, expo_push_token); the caller is
 * identified via the apiClient's Bearer interceptor.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Standard',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#005538',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted');
      return null;
    }

    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectId = extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[Push] No EAS projectId configured — cannot register for push notifications');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken: string = tokenResponse.data as string;

    console.log('[Push] Expo push token:', expoPushToken);

    const deviceType =
      Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'unknown';

    const apiClient = getGlobalApiClient();
    await apiClient.post('/auth/mobile/register-push-token', {
      expoPushToken,
      deviceType,
    });

    console.log('[Push] Token registered with backend');
    return expoPushToken;
  } catch (error) {
    console.error('[Push] Registration failed:', error);
    return null;
  }
}
