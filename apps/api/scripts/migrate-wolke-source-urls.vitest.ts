import { describe, expect, it } from 'vitest';

import {
  formatPlan,
  parseCliArgs,
  planWolkeMigration,
  tokenPrefix,
} from './migrate-wolke-source-urls.js';

const SHARES = { 'berlin-wps': 'https://wolke.netzbegruenung.de/s/TESTTOKEN' };
const berlin = (rel: string) => `https://wolke.netzbegruenung.de/s/TESTTOKEN#/${rel}`;
const saar = (rel: string) => `https://wolke.netzbegruenung.de/index.php/s/SAARTOKEN#/${rel}`;

describe('parseCliArgs', () => {
  it('is a dry run by default and collects repeated --map', () => {
    expect(parseCliArgs([])).toEqual({ args: { write: false, map: {} } });
    expect(
      parseCliArgs(['--map', 'SAARTOKEN=saar-alt', '--write', '--map', 'OTHERTOK=other'])
    ).toEqual({ args: { write: true, map: { SAARTOKEN: 'saar-alt', OTHERTOK: 'other' } } });
  });

  it('rejects a malformed --map without echoing the token', () => {
    const out = parseCliArgs(['--map', 'SAARTOKEN']);
    expect(out).toHaveProperty('error');
    expect(JSON.stringify(out)).not.toContain('SAARTOKEN');
    expect(parseCliArgs(['--map', '=key'])).toHaveProperty('error');
    expect(parseCliArgs(['--map', 'SAARTOKEN=a/b'])).toHaveProperty('error');
    expect(parseCliArgs(['--bogus'])).toHaveProperty('error');
  });
});

describe('tokenPrefix', () => {
  it('shows only the first three characters', () => {
    expect(tokenPrefix('SAARTOKEN')).toBe('SAA…');
  });
});

describe('planWolkeMigration', () => {
  it('maps a registered token by reverse lookup, keeping the raw path', () => {
    const plan = planWolkeMigration(
      [berlin('WPS 2026/Grüne Antwort.pdf'), 'https://gruene.berlin/a'],
      SHARES,
      {}
    );
    expect(plan.rewrites).toEqual([
      {
        from: berlin('WPS 2026/Grüne Antwort.pdf'),
        to: 'wolke://berlin-wps/WPS 2026/Grüne Antwort.pdf',
        key: 'berlin-wps',
        prefix: 'TES…',
      },
    ]);
    expect(plan.unmapped).toEqual({});
    expect(plan.perKey).toEqual({ 'berlin-wps': 1 });
  });

  it('uses --map for a token without a registry entry, index.php form included', () => {
    const plan = planWolkeMigration([saar('a.pdf'), saar('b.pdf')], SHARES, {
      SAARTOKEN: 'saar-alt',
    });
    expect(plan.rewrites.map((r) => r.to)).toEqual([
      'wolke://saar-alt/a.pdf',
      'wolke://saar-alt/b.pdf',
    ]);
    expect(plan.perKey).toEqual({ 'saar-alt': 2 });
    expect(plan.perPrefix).toEqual({ 'SAA…': 2 });
  });

  it('counts unmapped tokens per prefix and leaves them untouched', () => {
    const plan = planWolkeMigration([saar('a.pdf'), saar('b.pdf'), berlin('c.pdf')], SHARES, {});
    expect(plan.rewrites.map((r) => r.key)).toEqual(['berlin-wps']);
    expect(plan.unmapped).toEqual({ 'SAA…': 2 });
  });

  it('skips a rewrite whose target is already stored', () => {
    const plan = planWolkeMigration(
      [berlin('a.pdf'), 'wolke://berlin-wps/a.pdf', berlin('b.pdf')],
      SHARES,
      {}
    );
    expect(plan.rewrites.map((r) => r.to)).toEqual(['wolke://berlin-wps/b.pdf']);
    expect(plan.conflicts).toEqual({ 'berlin-wps': 1 });
  });

  it('is idempotent: the migrated urls plan nothing', () => {
    const first = planWolkeMigration([berlin('a.pdf'), saar('b.pdf')], SHARES, {
      SAARTOKEN: 'saar-alt',
    });
    const second = planWolkeMigration(
      first.rewrites.map((r) => r.to),
      SHARES,
      { SAARTOKEN: 'saar-alt' }
    );
    expect(second.rewrites).toEqual([]);
    expect(second.unmapped).toEqual({});
  });

  it('never puts a full token into the printed report', () => {
    const plan = planWolkeMigration(
      [berlin('a.pdf'), saar('b.pdf'), saar('c.pdf'), 'wolke://berlin-wps/a.pdf'],
      SHARES,
      {}
    );
    const text = formatPlan(plan);
    expect(text).not.toContain('TESTTOKEN');
    expect(text).not.toContain('SAARTOKEN');
    expect(text).toContain('SAA…');
    expect(text).toContain('berlin-wps');
  });
});
