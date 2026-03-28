import { useAuthStore } from '@gruenerator/shared/stores';
import {
  useAutoDiscovery,
  useAuthRequest,
  makeRedirectUri,
  exchangeCodeAsync,
  type DiscoveryDocument,
} from 'expo-auth-session';

import { getErrorMessage } from '../utils/errors';

import { secureStorage } from './storage';

import type { User } from '@gruenerator/shared';

export type AuthSource =
  | 'gruenerator-login'
  | 'gruenes-netz-login'
  | 'netzbegruenung-login'
  | 'gruene-oesterreich-login';

const KC_ISSUER = 'https://user.netzbegruenung.de/realms/gruenerator';
const CLIENT_ID = 'Gruenerator-Mobile';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

const REDIRECT_URI = makeRedirectUri({
  scheme: 'gruenerator',
  path: 'auth/callback',
});

const IDP_HINT_MAP: Record<AuthSource, string> = {
  'gruenes-netz-login': 'gruenes-netz',
  'netzbegruenung-login': 'netzbegruenung',
  'gruene-oesterreich-login': 'gruene-at-login',
  'gruenerator-login': 'gruenerator-user',
};

export function useKeycloakAuth(source: AuthSource) {
  const discovery = useAutoDiscovery(KC_ISSUER);

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: REDIRECT_URI,
      extraParams: { kc_idp_hint: IDP_HINT_MAP[source] },
      usePKCE: true,
    },
    discovery
  );

  return { request, response, promptAsync, discovery };
}

interface TokenExchangeResult {
  token: string;
  user: User;
  expiresAt: string;
}

export async function exchangeAndCreateSession(
  code: string,
  codeVerifier: string,
  discovery: DiscoveryDocument,
  authSource: AuthSource
): Promise<{ success: boolean; error?: string }> {
  try {
    const tokenResponse = await exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code,
        redirectUri: REDIRECT_URI,
        extraParams: { code_verifier: codeVerifier },
      },
      discovery
    );

    if (!tokenResponse.idToken) {
      return { success: false, error: 'No id_token received from Keycloak' };
    }

    const response = await fetch(`${API_BASE_URL}/auth/v2/token-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: tokenResponse.idToken,
        authSource,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Token exchange failed: ${text}` };
    }

    const data = (await response.json()) as TokenExchangeResult;

    await secureStorage.setToken(data.token);
    await secureStorage.setUser(JSON.stringify(data.user));

    useAuthStore.getState().setAuthState({ user: data.user });

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
