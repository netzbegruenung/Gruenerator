import { ErrorBoundary } from '@gruenerator/docs';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
