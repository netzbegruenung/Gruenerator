// Detect Tauri desktop app and use absolute backend URL
// In Tauri, window.location.origin is 'tauri://localhost' which doesn't work for API calls
window.API_BASE_URL = window.__TAURI__
  ? 'https://gruenerator.eu/api'
  : `${window.location.origin}/api`;
