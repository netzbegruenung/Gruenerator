/**
 * Push Notification Service
 * Handles Expo push token registration and foreground notification display.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getGlobalApiClient } from './api';
import { secureStorage } from './storage';

// Configure how notifications appear when the app is in the foreground
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
 * Request notification permissions, get an Expo push token,
 * and register it with the backend.
 * Returns the token string or null if registration failed.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Android needs a notification channel
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

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[Push] No EAS projectId configured — cannot register for push notifications');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;

    console.log('[Push] Expo push token:', expoPushToken);

    // Send to backend along with the refresh token to identify the device row
    const refreshToken = await secureStorage.getRefreshToken();
    if (!refreshToken) {
      console.warn('[Push] No refresh token available — skipping push registration');
      return expoPushToken;
    }

    const apiClient = getGlobalApiClient();
    await apiClient.post('/auth/mobile/register-push-token', {
      expoPushToken,
      refresh_token: refreshToken,
    });

    console.log('[Push] Token registered with backend');
    return expoPushToken;
  } catch (error) {
    console.error('[Push] Registration failed:', error);
    return null;
  }
}
