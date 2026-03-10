import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!dsn) {
    console.info('Error tracking DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    enabled: !__DEV__,
    tracesSampleRate: 0,
    enableAutoSessionTracking: false,
    release: Constants.expoConfig?.version
      ? `de.gruenerator.app@${Constants.expoConfig.version}`
      : undefined,
  });
}

export { Sentry };
