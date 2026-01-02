/**
 * Component Library for Text2Sharepic
 *
 * Manages reusable visual components for dynamic sharepic generation.
 * Components are self-contained rendering units with parameters and constraints.
 *
 * This file serves as the main entry point that imports all component modules
 * and triggers their registration.
 */

// Import all components (triggers registration)
import './components/index.js';

// Export all registry functions and types
export * from './ComponentRegistry.js';
export * from './types.js';

// Import log function to call after all components are registered
import { logRegistrationSummary } from './ComponentRegistry.js';

// Log summary after all components are registered
logRegistrationSummary();
