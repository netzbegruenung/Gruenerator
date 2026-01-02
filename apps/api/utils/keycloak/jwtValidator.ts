/**
 * Keycloak JWT Validator
 * MOBILE AUTH DISABLED - Currently a stub implementation
 */

// When mobile auth is enabled, uncomment this implementation:
// import { jwtVerify, createRemoteJWKSet } from 'jose';
//
// // Create remote JWK Set for Keycloak
// const JWKS = createRemoteJWKSet(new URL(process.env.KEYCLOAK_REALM_PUBLIC_KEY_URL || ''));
//
// /**
//  * JWT token payload from Keycloak
//  */
// export interface KeycloakTokenPayload {
//   sub: string;
//   email?: string;
//   preferred_username?: string;
//   name?: string;
//   iat: number;
//   exp: number;
//   iss: string;
//   aud: string;
//   [key: string]: any;
// }
//
// /**
//  * Validates a Keycloak JWT token using jose library
//  * @param token - The JWT token to validate
//  * @returns The decoded token payload
//  * @throws {Error} - If token validation fails
//  */
// export async function validateKeycloakToken(token: string): Promise<KeycloakTokenPayload> {
//   try {
//     const { payload } = await jwtVerify(token, JWKS, {
//       issuer: process.env.KEYCLOAK_ISSUER,
//       audience: process.env.MOBILE_CLIENT_ID,
//     });
//
//     console.log('[JWT Validator] Token validated successfully for user:', payload.sub);
//     return payload as KeycloakTokenPayload;
//   } catch (error) {
//     console.error('[JWT Validator] Token validation failed:', (error as Error).message);
//     throw error;
//   }
// }

/**
 * JWT token payload interface (stub)
 */
export interface KeycloakTokenPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  [key: string]: any;
}

/**
 * Stub function when mobile auth is disabled
 * @param token - The JWT token to validate
 * @throws {Error} - Always throws as mobile auth is disabled
 */
export async function validateKeycloakToken(token: string): Promise<KeycloakTokenPayload> {
  throw new Error('Mobile authentication is disabled');
}
