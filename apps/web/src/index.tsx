import React from 'react';
import { createRoot } from 'react-dom/client';
import './assets/styles/index.css';
import './i18n';
// Initialize shared API client before App mounts (side-effect import)
import './components/utils/apiClient';
import App from './App';

const root = createRoot(document.getElementById('root'));
root.render(
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);
