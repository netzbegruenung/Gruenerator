import React from 'react';
import { createRoot } from 'react-dom/client';
import './assets/styles/common/variables.css';
import './assets/styles/common/global.css';
import App from './App';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
