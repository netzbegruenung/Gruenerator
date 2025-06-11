import { create } from 'zustand'
import { subscribeWithSelector, devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

/**
 * Base store creator with common middleware
 * @param {Function} storeConfig - Store configuration function
 * @param {Object} options - Options for middleware
 * @returns {Function} Zustand store hook
 */
export const createBaseStore = (storeConfig, options = {}) => {
  const { 
    name = 'store', 
    enablePersist = false, 
    enableDevtools = true,
    persistOptions = {}
  } = options
  
  let store = storeConfig
  
  // Immer für einfachere nested state updates
  store = immer(store)
  
  // DevTools für Debugging (nur in development)
  if (enableDevtools && process.env.NODE_ENV === 'development') {
    store = devtools(store, { 
      name: `Gruenerator-${name}`,
      enabled: true
    })
  }
  
  // Persistence wenn gewünscht
  if (enablePersist) {
    store = persist(store, {
      name: `gruenerator-${name}`,
      ...persistOptions
    })
  }
  
  // Selector subscriptions für bessere Performance
  store = subscribeWithSelector(store)
  
  return create(store)
}

/**
 * Simple store creator without middleware (für einfache Stores)
 */
export const createSimpleStore = (storeConfig) => {
  return create(storeConfig)
} 