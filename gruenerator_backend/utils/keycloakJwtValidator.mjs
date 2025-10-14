// MOBILE AUTH DISABLED - Keycloak JWT Validator
// import { jwtVerify, createRemoteJWKSet } from 'jose';

// // Create remote JWK Set for Keycloak
// const JWKS = createRemoteJWKSet(new URL(process.env.KEYCLOAK_REALM_PUBLIC_KEY_URL));

// /**
//  * Validates a Keycloak JWT token using jose library
//  * @param {string} token - The JWT token to validate
//  * @returns {Promise<object>} - The decoded token payload
//  * @throws {Error} - If token validation fails
//  */
// export async function validateKeycloakToken(token) {
//   try {
//     const { payload } = await jwtVerify(token, JWKS, {
//       issuer: process.env.KEYCLOAK_ISSUER,
//       audience: process.env.MOBILE_CLIENT_ID,
//     });
//
//     console.log('[JWT Validator] Token validated successfully for user:', payload.sub);
//     return payload;
//   } catch (error) {
//     console.error('[JWT Validator] Token validation failed:', error.message);
//     throw error;
//   }
// }

// Stub function when mobile auth is disabled
export async function validateKeycloakToken(token) {
  throw new Error('Mobile authentication is disabled');
}