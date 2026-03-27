import { ErrorBoundary } from '@gruenerator/docs';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { scan } from 'react-scan';

import App from './App';

import './styles/index.css';

if (import.meta.env.DEV) {
  scan({ enabled: true, log: true, showToolbar: true });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
