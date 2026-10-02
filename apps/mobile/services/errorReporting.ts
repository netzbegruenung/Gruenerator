import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Fehlerberichte an unsere eigene GlitchTip-Instanz (Sentry-kompatibel).
 *
 * Datensparsam per Konstruktion, nicht per Default: jede Option, die
 * Nutzer*innen-Daten mitschicken könnte, steht hier ausdrücklich auf aus —
 * ein SDK-Update, das einen Default umlegt, ändert daran nichts.
 *
 * Bewusst NICHT eingebunden: das Expo-Config-Plugin `@sentry/react-native/expo`.
 * Es hängt einen Source-Map-Upload in den Gradle- und Xcode-Build; der scheiterte
 * beim ersten Einbau gegen GlitchTip und musste per `SENTRY_DISABLE_AUTO_UPLOAD`
 * abgeschaltet werden. Ohne Plugin kann kein Upload einen Build abbrechen. Und
 * kein `Sentry.wrap`: das zeichnet Touch-Breadcrumbs mit Element-Labels auf.
 */
export function initErrorReporting(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    enabled: !__DEV__,
    environment: Updates.channel || 'local',
    release: `de.gruenerator.app@${Constants.expoConfig?.version ?? 'unknown'}`,
    initialScope: Updates.updateId ? { tags: { update_id: Updates.updateId } } : {},
    // GlitchTip kennt keine Sessions.
    enableAutoSessionTracking: false,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    ignoreErrors: [
      // Expo answers every `use dom` native action by injecting the result into
      // its WebView (`expo/src/dom/webview-wrapper.tsx`, `emit`) and never
      // catches that call. When the WebView unmounted in the meantime (screen
      // closed, warmup retired) the reply has no recipient and the rejection
      // carries no information. Matched on the native cause, which only occurs
      // once the view is gone. Unfixed upstream through expo 58.0.0.
      /Unable to find the class expo\.modules\.webview\.DomWebView view with tag/,
    ],
    // `DeviceContext` copies the native SDK's installation id into every JS
    // event as `user.id`, regardless of `sendDefaultPii`.
    beforeSend(event) {
      delete event.user;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Konsolenausgaben können Chat- und Dokumentinhalte enthalten.
      if (breadcrumb.category === 'console') return null;
      if (typeof breadcrumb.data?.url === 'string') {
        breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
      }
      return breadcrumb;
    },
  });
  // The native SDKs put their installation id into `user.id` of native crash
  // reports whenever no id is set (sentry-java `mergeUser`, sentry-cocoa
  // `setUserIdIfNoUserSet`). A constant shared by every install keeps that out.
  Sentry.setUser({ id: 'anonymous' });
}

export function reportError(error: Error, componentStack?: string | null): void {
  Sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : {});
}
