import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { initializeApiClient } from '../services/api';
import { configureAuthStore, checkAuthStatus } from '../services/auth';
import { registerForPushNotifications } from '../services/pushNotifications';
import { usePreferencesStore } from '../stores/preferencesStore';

export function useAppInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences);

  useEffect(() => {
    async function initialize() {
      try {
        initializeApiClient();
        configureAuthStore();
        const [isAuthenticated] = await Promise.all([checkAuthStatus(), loadPreferences()]);

        // Register push token after successful auth (non-blocking)
        if (isAuthenticated) {
          registerForPushNotifications().catch((err) =>
            console.warn('[App] Push registration failed:', err)
          );
        }
      } catch (error) {
        console.error('[App] Initialization error:', error);
      } finally {
        setIsInitialized(true);
      }
    }

    initialize();
  }, [loadPreferences]);

  // Handle notification taps → deep link navigation
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.action_url && typeof data.action_url === 'string') {
        try {
          router.push(data.action_url as never);
        } catch {}
      }
    });
    return () => subscription.remove();
  }, []);

  return { isInitialized };
}
