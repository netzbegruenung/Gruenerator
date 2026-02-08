import React from 'react';
import ReactDOM from 'react-dom/client';
import '@mantine/core/styles.css';
import '@gruenerator/docs/styles';
import App from './App';
import { ErrorBoundary } from '@gruenerator/docs';
import './styles/mobile.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
