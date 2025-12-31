/**
 * LocalStorage Middleware for Zustand
 * Automatically persists specified state slices to localStorage
 */

export const localStorageMiddleware = (config) => (set, get, api) =>
  config(
    (partial, replace) => {
      // Call original set function
      set(partial, replace);
      
      // Get current state after update
      const state = get();
      
      // Persist to localStorage if persistence config exists
      if (config.persist) {
        try {
          const { key, include } = config.persist;
          
          // If include array is specified, only persist those keys
          if (include && Array.isArray(include)) {
            const persistData = {};
            include.forEach(key => {
              if (state[key] !== undefined) {
                persistData[key] = state[key];
              }
            });
            window.localStorage.setItem(key, JSON.stringify(persistData));
          } else {
            // Persist entire state
            window.localStorage.setItem(key, JSON.stringify(state));
          }
        } catch (error) {
          console.warn(`LocalStorage middleware error for key "${config.persist.key}":`, error);
        }
      }
    },
    get,
    api
  );

/**
 * Load initial state from localStorage
 */
export const loadFromLocalStorage = (key, defaultValue = {}) => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Error loading from localStorage key "${key}":`, error);
    return defaultValue;
  }
}; 