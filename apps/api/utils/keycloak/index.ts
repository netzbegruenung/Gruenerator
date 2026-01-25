/**
 * Keycloak Utilities Barrel Export
 * Provides all Keycloak-related utilities in one place
 */

// API Client exports
export { KeycloakApiClient } from './apiClient.js';
export type {
  KeycloakUser,
  FederatedIdentity,
  UserCredential,
  CreateUserData,
  UpdateUserData,
} from './apiClient.js';

// JWT Validator exports
export { validateKeycloakToken } from './jwtValidator.js';
export type { KeycloakTokenPayload } from './jwtValidator.js';

// Authenticated Router exports
export { createAuthenticatedRouter, createAuthorizedRouter } from './authenticatedRouter.js';
