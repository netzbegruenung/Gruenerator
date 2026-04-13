import { z } from 'zod';

// ── Token response (openid-connect/token) ─────────────────────────────────────

export const keycloakTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_expires_in: z.number(),
  token_type: z.string(),
});

export type KeycloakTokenResponse = z.infer<typeof keycloakTokenResponseSchema>;

// ── Federated identity ────────────────────────────────────────────────────────

export const federatedIdentitySchema = z.object({
  identityProvider: z.string(),
  userId: z.string(),
  userName: z.string(),
});

export type FederatedIdentity = z.infer<typeof federatedIdentitySchema>;

// ── Keycloak user representation (/admin/realms/:realm/users) ─────────────────

export const keycloakUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  enabled: z.boolean(),
  emailVerified: z.boolean(),
  federatedIdentities: z.array(federatedIdentitySchema).optional(),
  attributes: z.record(z.array(z.string())).optional(),
  createdTimestamp: z.number().optional(),
});

export type KeycloakUser = z.infer<typeof keycloakUserSchema>;
