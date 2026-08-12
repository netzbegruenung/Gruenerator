import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INSTANCE_ID,
  INSTANCES,
  getInstance,
  getPinnedLocale,
  isChannelVisibleIn,
  isInstanceId,
  policyCoversNotebook,
  resolveInstance,
} from './index.js';

describe('instance registry', () => {
  it('has unique ids and no host claimed twice', () => {
    const ids = INSTANCES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);

    const hosts = INSTANCES.flatMap((i) => i.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it('serves stable content everywhere', () => {
    for (const instance of INSTANCES) {
      expect(instance.channels).toContain('stable');
    }
  });

  it('exposes internal content on local only', () => {
    const internal = INSTANCES.filter((i) => isChannelVisibleIn('internal', i.id)).map((i) => i.id);
    expect(internal).toEqual(['local']);
  });
});

describe('resolveInstance', () => {
  it('prefers an explicit id over the hostname', () => {
    expect(resolveInstance({ explicitId: 'bgst', hostname: 'beta.gruenerator.eu' })).toBe('bgst');
  });

  it('ignores an unknown explicit id and falls through to the host', () => {
    expect(resolveInstance({ explicitId: 'nope', hostname: 'beta.gruenerator.eu' })).toBe('beta');
  });

  it('matches hosts case-insensitively and ignores the port', () => {
    expect(resolveInstance({ hostname: 'BETA.Gruenerator.EU' })).toBe('beta');
    expect(resolveInstance({ hostname: 'localhost:3000' })).toBe('local');
    expect(resolveInstance({ hostname: 'gruenerator.eu.' })).toBe('production');
  });

  it('keeps IPv6 literals intact', () => {
    expect(resolveInstance({ hostname: '[::1]' })).toBe('local');
  });

  // The property that makes introducing this module a no-op: anything the
  // registry does not know behaves exactly like production did before.
  it('falls back to production for unknown or missing input', () => {
    expect(resolveInstance({})).toBe(DEFAULT_INSTANCE_ID);
    expect(resolveInstance({ hostname: null, explicitId: null })).toBe(DEFAULT_INSTANCE_ID);
    expect(resolveInstance({ hostname: 'gruenerator-test.example.net' })).toBe(DEFAULT_INSTANCE_ID);
    expect(DEFAULT_INSTANCE_ID).toBe('production');
  });

  it('does not match a subdomain against a parent instance host', () => {
    expect(resolveInstance({ hostname: 'evil.gruenerator.eu' })).toBe(DEFAULT_INSTANCE_ID);
  });
});

describe('isInstanceId', () => {
  it('accepts registry ids and rejects everything else', () => {
    expect(isInstanceId('beta')).toBe(true);
    expect(isInstanceId('nope')).toBe(false);
    expect(isInstanceId(null)).toBe(false);
    expect(isInstanceId(42)).toBe(false);
  });
});

describe('isChannelVisibleIn', () => {
  it('treats content without a channel as stable', () => {
    expect(isChannelVisibleIn(null, 'production')).toBe(true);
    expect(isChannelVisibleIn(undefined, 'bgst')).toBe(true);
  });

  it('serves preview on beta but not on production or bgst', () => {
    expect(isChannelVisibleIn('preview', 'beta')).toBe(true);
    expect(isChannelVisibleIn('preview', 'production')).toBe(false);
    expect(isChannelVisibleIn('preview', 'bgst')).toBe(false);
  });

  it('serves internal on local only', () => {
    expect(isChannelVisibleIn('internal', 'local')).toBe(true);
    expect(isChannelVisibleIn('internal', 'beta')).toBe(false);
    expect(isChannelVisibleIn('internal', 'production')).toBe(false);
  });
});

describe('policyCoversNotebook', () => {
  const berlin = { id: 'berlin-notebook', category: 'landesebene' } as const;
  const bund = { id: 'bundestagsfraktion-notebook', category: 'bundesebene' } as const;

  it('is false without a policy', () => {
    expect(policyCoversNotebook(null, berlin)).toBe(false);
    expect(policyCoversNotebook({}, berlin)).toBe(false);
  });

  it('matches by category', () => {
    const policy = { notebookCategories: ['landesebene'] } as const;
    expect(policyCoversNotebook(policy, berlin)).toBe(true);
    expect(policyCoversNotebook(policy, bund)).toBe(false);
  });

  it('matches by explicit id', () => {
    const policy = { notebookIds: ['berlin-notebook'] } as const;
    expect(policyCoversNotebook(policy, berlin)).toBe(true);
    expect(policyCoversNotebook(policy, bund)).toBe(false);
  });
});

describe('getPinnedLocale', () => {
  // No instance pins a locale yet; the mechanism exists for a future AT
  // instance and must stay inert until then.
  it('returns null while no instance locks a locale', () => {
    for (const instance of INSTANCES) {
      expect(getPinnedLocale(instance.id)).toBeNull();
    }
  });

  it('requires both defaultLocale and lockedLocale', () => {
    expect(getInstance('production').lockedLocale).toBeUndefined();
  });
});

describe('current instances', () => {
  it('covers production, beta, bgst and local', () => {
    expect(INSTANCES.map((i) => i.id)).toEqual(['production', 'beta', 'bgst', 'local']);
  });

  // The Bundesverband notebook sits in `hide`, not `block`: it used to be
  // offered on these instances, so shared links and persisted mention tokens
  // must keep resolving forever (F0 URL-Sonderrecht, CLAUDE.md) — it just
  // stops being offered in galleries, pickers and implicit chat search.
  it('production, beta and local hide the Bundesverband notebook — offered on bgst only', () => {
    for (const id of ['production', 'beta', 'local'] as const) {
      expect(getInstance(id).hide?.notebookIds).toEqual(['gruene-notebook']);
      expect(getInstance(id).hide?.notebookCategories).toBeUndefined();
    }
    expect(getInstance('bgst').hide?.notebookIds).toBeUndefined();
  });

  it('blocks nothing anywhere — every direct notebook link keeps resolving', () => {
    for (const instance of INSTANCES) {
      expect(getInstance(instance.id).block ?? {}).toEqual({});
    }
  });

  it('bgst hides the Reels and Vorlagen tools everywhere their id appears', () => {
    expect(getInstance('bgst').hide?.toolIds).toEqual([
      'canvas-vorlagen',
      'reels-untertitel',
      'vorlagen',
      'tool-vorlagen',
      'tool-reel',
    ]);
  });

  it('production, beta and local carry no tool hide policy', () => {
    for (const id of ['production', 'beta', 'local'] as const) {
      expect(getInstance(id).hide?.toolIds).toBeUndefined();
    }
  });
});
