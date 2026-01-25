import * as Sentry from '@sentry/browser';
import React from 'react';
import { createRoot } from 'react-dom/client';

import './assets/styles/index.css';
import App from './App';
import { registerServiceWorker } from './utils/registerServiceWorker';

// Initialize GlitchTip error monitoring
Sentry.init({
  dsn: 'https://3bfeac13e8e14018a06d8f7f770f46ca@app.glitchtip.com/19466',
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  beforeSend(event) {
    // Don't send events in development
    if (import.meta.env.DEV) {
      console.error('[GlitchTip] Error captured (dev mode):', event);
      return null;
    }
    return event;
  },
  ignoreErrors: [
    // Browser extension errors
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    // Network errors that don't indicate code issues
    'NetworkError',
    'Failed to fetch',
    // Script loading errors (often from browser extensions)
    /Loading chunk [\d]+ failed/,
  ],
});

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
