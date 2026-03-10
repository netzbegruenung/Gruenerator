import * as Sentry from '@sentry/react';
import React from 'react';
import { createRoot } from 'react-dom/client';

import './assets/styles/index.css';
import App from './App';
import { registerServiceWorker } from './utils/registerServiceWorker';

// Initialize error monitoring (GlitchTip via Sentry SDK)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'NetworkError',
      'Failed to fetch',
      'Load failed', // Safari equivalent of "Failed to fetch"
      /Loading chunk [\d]+ failed/,
      'Importing a module script failed',
      'Failed to fetch dynamically imported module',
      'error loading dynamically imported module',
      "Can't find variable: EmptyRanges", // Safari ES2022 class field TDZ bug (fixed by safari15 build target)
      'Thread not found', // @assistant-ui race condition on thread delete/switch — handled gracefully
      /feature named `.+` was not found/, // DuckDuckGo browser internal privacy feature errors
      'invalid origin', // DuckDuckGo iOS WKWebView internal error
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
  <App />
  // </React.StrictMode>
);

// Register Service Worker for illustration caching (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerServiceWorker()
    .then((registration) => {
      if (registration) {
        console.log('[App] Illustration cache service worker registered');
      }
    })
    .catch((err) => {
      console.error('[App] Service Worker registration failed:', err);
    });
}
