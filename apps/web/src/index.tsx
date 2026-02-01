import * as Sentry from '@sentry/react';
import React from 'react';
import { createRoot } from 'react-dom/client';

import './assets/styles/index.css';
import App from './App';
import { registerServiceWorker } from './utils/registerServiceWorker';

// Initialize Sentry error monitoring
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
      /Loading chunk [\d]+ failed/,
    ],
  });
} else {
  console.info('Sentry DSN not configured. Error tracking disabled.');
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
