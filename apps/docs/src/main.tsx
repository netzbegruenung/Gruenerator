import React from 'react';
import ReactDOM from 'react-dom/client';

import '@mantine/core/styles.css';
import App from './App';

import { ErrorBoundary } from '@gruenerator/docs';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
