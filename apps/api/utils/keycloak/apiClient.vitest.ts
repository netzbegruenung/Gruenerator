import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  KEYCLOAK_BASE_URL: '',
  KEYCLOAK_REALM: 'test-realm',
  KEYCLOAK_CLIENT_ID: 'admin-client',
  KEYCLOAK_CLIENT_SECRET: 'admin-secret',
  KEYCLOAK_ADMIN_USERNAME: null,
  KEYCLOAK_ADMIN_PASSWORD: null,
  KEYCLOAK_ADMIN_CLIENT_ID: null,
}));

vi.mock('../../config/env.js', () => ({ env: envMock }));

const { KeycloakApiClient } = await import('./apiClient.js');

/** What a local stand-in for Keycloak received, as raw request lines. */
const received: string[] = [];
let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.endsWith('/protocol/openid-connect/token')) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          access_token: 'admin-token',
          expires_in: 300,
          refresh_expires_in: 0,
          token_type: 'Bearer',
        })
      );
      return;
    }
    received.push(`${req.method} ${req.url}`);
    res.statusCode = req.method === 'GET' ? 404 : 204;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  envMock.KEYCLOAK_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('KeycloakApiClient path segments', () => {
  it('keeps a user id with a slash inside the users collection', async () => {
    const client = new KeycloakApiClient();
    await client.getUserById('../x');

    expect(received).toEqual(['GET /admin/realms/test-realm/users/..%2Fx']);
  });

  it('encodes the id on deleteUser instead of resolving it as a path', async () => {
    const client = new KeycloakApiClient();
    // GET answers 404, so deleteUser stops after the existence check.
    await client.deleteUser('../x');

    expect(received).toEqual(['GET /admin/realms/test-realm/users/..%2Fx']);
  });

  it.each(['..', '.'])('sends nothing for the dot segment %j', async (id) => {
    const client = new KeycloakApiClient();

    await expect(client.deleteUser(id)).rejects.toThrow('Invalid Keycloak path segment');
    expect(received).toEqual([]);
  });

  it('encodes both segments of a federated identity path', async () => {
    const client = new KeycloakApiClient();
    await client.deleteFederatedIdentity('user/1', 'idp?x');

    expect(received).toEqual([
      'DELETE /admin/realms/test-realm/users/user%2F1/federated-identity/idp%3Fx',
    ]);
  });
});
