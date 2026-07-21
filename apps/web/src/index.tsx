import * as Sentry from '@sentry/react';
import React from 'react';
import { createRoot } from 'react-dom/client';

import './assets/styles/index.css';
import App from './App';
import { registerServiceWorker } from './utils/registerServiceWorker';

// Stale deploy: cached HTML/chunks reference hashed assets that no longer exist.
// Reload once per URL to pick up the new build; a second failure surfaces normally.
window.addEventListener('vite:preloadError', (event) => {
  const reloadedFor = sessionStorage.getItem('vite:preloadError:reloaded');
  if (reloadedFor === window.location.href) return;
  sessionStorage.setItem('vite:preloadError:reloaded', window.location.href);
  event.preventDefault();
  window.location.reload();
});

// Initialize error monitoring (GlitchTip via Sentry SDK)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE as string,
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'NetworkError',
      'Failed to fetch',
      'Load failed', // Safari equivalent of "Failed to fetch"
      'network error', // Chrome streaming-body drop (mid-SSE TCP close)
      'Error in input stream', // Firefox streaming-body drop (mid-SSE TCP close)
      /Loading chunk [\d]+ failed/,
      'Importing a module script failed',
      'Failed to fetch dynamically imported module',
      'error loading dynamically imported module',
      "Can't find variable: EmptyRanges", // Safari ES2022 class field TDZ bug (fixed by safari15 build target)
      'Thread not found', // @assistant-ui race condition on thread delete/switch — handled gracefully
      /feature named `.+` was not found/, // DuckDuckGo browser internal privacy feature errors
      'invalid origin', // DuckDuckGo iOS WKWebView internal error
      'Invalid call to runtime.sendMessage', // DuckDuckGo iOS content-script messaging — no extension tab in WKWebView
      'Unable to preload CSS', // stale deploy; recovered via vite:preloadError reload above
    ],
    denyUrls: [
      /^webkit-masked-url:\/\//, // Safari masks browser-extension frames behind this scheme
      /^(safari|safari-web|chrome|moz)-extension:\/\//,
    ],
  });
} else {
  console.info('Error tracking DSN not configured. Error tracking disabled.');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);
root.render(
  // <React.StrictMode>
  <Sentry.ErrorBoundary
    fallback={({ error }) => (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Etwas ist schiefgelaufen</h1>
        <p>Bitte lade die Seite neu. Wenn der Fehler bleibt, kontaktiere den Support.</p>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#888', marginTop: '1rem' }}>
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </div>
    )}
  >
    <App />
  </Sentry.ErrorBoundary>
  // </React.StrictMode>
);

// Register Service Worker for illustration caching (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerServiceWorker().catch((err) => {
    console.error('[App] Service Worker registration failed:', err);
  });
}
