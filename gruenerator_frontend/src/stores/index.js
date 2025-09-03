/**
 * Zustand Stores - Centralized Export
 * Clean imports for all stores and related hooks
 */

// Middlewares (for future store implementations)
export { localStorageMiddleware, loadFromLocalStorage } from './middlewares/localStorageMiddleware';
export { apiCheckMiddleware, createApiValidationConfig } from './middlewares/apiCheckMiddleware';
export { crossTabSyncMiddleware, createCrossTabSyncConfig } from './middlewares/crossTabSyncMiddleware';

// Test Components
// export { default as BetaFeaturesMigrationTest } from '../components/test/BetaFeaturesMigrationTest'; // Component not found

// Active stores:
export { default as useGeneratedTextStore } from './core/generatedTextStore';
export { default as useFormStateStore } from './core/formStateStore';
export { default as useSharepicStore } from './sharepicStore';
export { default as useTextEditActions } from './hooks/useTextEditActions';

// Future stores will be exported here:
// export { useCollabEditorStore } from './collabEditorStore';
// export { useSupabaseAuthStore } from './supabaseAuthStore'; 
