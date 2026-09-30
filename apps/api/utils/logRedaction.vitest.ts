import { describe, expect, it } from 'vitest';

import { redactPii, redactString } from './logRedaction.js';

const UUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln';

describe('redactString', () => {
  it('scrubs emails, JWTs and UUIDs', () => {
    expect(redactString(`send to max@example.org failed for ${UUID} with ${JWT}`)).toBe(
      'send to [email] failed for [id] with [token]'
    );
  });

  it('leaves ordinary text alone', () => {
    expect(redactString('Qdrant timeout after 5000ms')).toBe('Qdrant timeout after 5000ms');
  });
});

describe('redactPii', () => {
  it('drops values under personal-data keys, at any depth', () => {
    expect(
      redactPii({ to: 'a@b.de', subject: 'Hallo', nested: { userId: UUID, code: 42 } })
    ).toEqual({ to: '[redacted]', subject: 'Hallo', nested: { userId: '[redacted]', code: 42 } });
  });

  it('scrubs strings inside arrays and error stacks', () => {
    expect(redactPii(['x', `Error: no user max@example.org\n at f`])).toEqual([
      'x',
      'Error: no user [email]\n at f',
    ]);
  });

  it('does not mutate its input', () => {
    const input = { to: 'a@b.de', msg: 'a@b.de' };
    redactPii(input);
    expect(input).toEqual({ to: 'a@b.de', msg: 'a@b.de' });
  });

  it('survives circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(redactPii(a)).toEqual({ name: 'a', self: '[Circular]' });
  });
});
