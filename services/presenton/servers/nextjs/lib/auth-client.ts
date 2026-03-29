import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://gruenerator.eu',
  basePath: '/api/auth/v2',
  fetchOptions: {
    credentials: 'include',
  },
});

export type Session = typeof authClient.$Infer.Session;
