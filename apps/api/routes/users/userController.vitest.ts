/**
 * GET /api/users/search: names match by substring, email only by exact address,
 * and the email is only returned for an exact-email match.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Profile = { id: string; email: string; display_name: string | null; avatar_url: null };

const PROFILES: Profile[] = [
  { id: 'u2', email: 'anna@example.org', display_name: 'Anna Beispiel', avatar_url: null },
  { id: 'u3', email: 'bob@example.org', display_name: 'Bob', avatar_url: null },
];

// Evaluates the controller's SQL contract ($1 = name pattern, $2 = exact email, $3 = self) in memory.
const query = vi.fn(async (sql: string, params: string[]) => {
  expect(sql).not.toMatch(/LOWER\(email\)\s+LIKE/i);
  const [pattern, exact, self] = params;
  const needle = pattern.toLowerCase().replace(/^%|%$/g, '');
  return PROFILES.filter(
    (p) =>
      p.id !== self &&
      ((p.display_name && p.display_name.toLowerCase().includes(needle)) ||
        p.email.toLowerCase() === exact.toLowerCase())
  ).map((p) => ({
    ...p,
    email: p.email.toLowerCase() === exact.toLowerCase() ? p.email : null,
  }));
});

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

async function search(q: string): Promise<unknown> {
  const { default: router } = await import('./userController.js');
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as { user?: { id: string } }).user = { id: 'u1' };
    next();
  });
  app.use('/api/users', router);
  const srv = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const { port } = srv.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/api/users/search?q=${encodeURIComponent(q)}`);
    return await res.json();
  } finally {
    srv.close();
  }
}

beforeEach(() => {
  query.mockClear();
});

describe('GET /api/users/search', () => {
  it('does not match a substring of an email address', async () => {
    expect(await search('example.org')).toEqual([]);
  });

  it('matches an exact email case-insensitively and returns it', async () => {
    expect(await search('ANNA@example.org')).toEqual([
      { id: 'u2', email: 'anna@example.org', display_name: 'Anna Beispiel', avatar_url: null },
    ]);
  });

  it('returns email as null for name matches', async () => {
    expect(await search('anna')).toEqual([
      { id: 'u2', email: null, display_name: 'Anna Beispiel', avatar_url: null },
    ]);
  });

  it('requires at least two characters', async () => {
    expect(await search('a')).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
