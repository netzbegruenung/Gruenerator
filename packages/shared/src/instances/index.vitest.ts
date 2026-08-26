import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INSTANCE_ID,
  INSTANCES,
  getInstance,
  getPinnedLocale,
  isChannelVisibleIn,
  isInstanceId,
  policyCoversNotebook,
  policyCoversSkill,
  resolveInstance,
  type InstanceDefinition,
} from './index.js';
import { AT_EBENEN, AT_ROLLEN, DE_EBENEN, DE_ROLLEN } from '../roles/rolesConfig.js';

// `INSTANCES` is `as const`, so iterating it yields a union in which the
// optional fields are absent on the entries that don't declare them. Widen to
// the declared interface — the same move `recipeCatalog` makes for `SKILLS`.
const ALL = INSTANCES;

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
  // bgst serves the German Bundesgeschäftsstelle and hides the Austrian
  // content outright, so leaving the locale switchable there would offer a
  // setting with nothing behind it.
  it('pins de-DE on bgst', () => {
    expect(getPinnedLocale('bgst')).toBe('de-DE');
  });

  it('leaves the locale to the user everywhere else', () => {
    for (const id of ['production', 'beta', 'local'] as const) {
      expect(getPinnedLocale(id)).toBeNull();
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

  // By category, not by id: the Bundesgeschäftsstelle works federally, and a
  // thirteenth Landesverband must inherit the rule without anyone remembering
  // to add it here.
  it('bgst hides the Landesverband and Austrian notebook categories', () => {
    expect(getInstance('bgst').hide?.notebookCategories).toEqual(['landesebene', 'oesterreich']);
    for (const id of ['production', 'beta', 'local'] as const) {
      expect(getInstance(id).hide?.notebookCategories).toBeUndefined();
    }
  });

  it('bgst drops the Reel recipe, matching its hidden Reel tools', () => {
    expect(getInstance('bgst').hide?.skillMentions).toEqual(['reel']);
    for (const id of ['production', 'beta', 'local'] as const) {
      expect(getInstance(id).hide?.skillMentions).toBeUndefined();
      expect(getInstance(id).hide?.skillCategories).toBeUndefined();
    }
  });

  it('bgst pins de-DE and offers the Bundesgeschäftsstelle role only', () => {
    const bgst = getInstance('bgst');
    expect(getPinnedLocale('bgst')).toBe('de-DE');
    expect(bgst.offeredRoles).toEqual({
      ebenen: ['bund'],
      rollen: ['Mitarbeiter*in Bundesgeschäftsstelle'],
      allowCustom: false,
    });
  });

  it('leaves the role offer open everywhere else', () => {
    for (const id of ['production', 'beta', 'local'] as const) {
      expect(getInstance(id).offeredRoles).toBeUndefined();
    }
  });

  // The registry cannot import rolesConfig (it would close the cycle
  // instances→roles→notebooks→instances), so the consistency `defaultRole`
  // gets from the wizard at runtime is asserted here instead.
  it('every offered Ebene and role exists in the role registry', () => {
    const knownEbenen = new Set([...DE_EBENEN, ...AT_EBENEN].map((e) => e.id));
    const knownRollen = new Set([...Object.values(DE_ROLLEN), ...Object.values(AT_ROLLEN)].flat());
    for (const instance of ALL as readonly InstanceDefinition[]) {
      for (const ebeneId of instance.offeredRoles?.ebenen ?? []) {
        expect(knownEbenen, `Ebene "${ebeneId}" of ${instance.id}`).toContain(ebeneId);
      }
      for (const rolle of instance.offeredRoles?.rollen ?? []) {
        expect(knownRollen, `Rolle "${rolle}" of ${instance.id}`).toContain(rolle);
      }
      const defaultRole = instance.defaultRole;
      if (defaultRole) {
        expect(knownEbenen).toContain(defaultRole.ebeneId);
        expect(knownRollen).toContain(defaultRole.rolle);
      }
    }
  });

  // A role the instance suggests but does not offer would leave the wizard
  // pre-selecting a card that is not on screen.
  it('every defaultRole is itself offered', () => {
    for (const instance of ALL as readonly InstanceDefinition[]) {
      const { defaultRole, offeredRoles } = instance;
      if (!defaultRole || !offeredRoles) continue;
      if (offeredRoles.ebenen) expect(offeredRoles.ebenen).toContain(defaultRole.ebeneId);
      if (offeredRoles.rollen) expect(offeredRoles.rollen).toContain(defaultRole.rolle);
    }
  });
});

describe('policyCoversSkill', () => {
  it('covers nothing without a policy', () => {
    expect(policyCoversSkill(undefined, { mention: 'presse' })).toBe(false);
    expect(policyCoversSkill({}, { mention: 'presse', skillCategory: 'presse' })).toBe(false);
  });

  it('covers a named mention', () => {
    const policy = { skillMentions: ['reel'] };
    expect(policyCoversSkill(policy, { mention: 'reel' })).toBe(true);
    expect(policyCoversSkill(policy, { mention: 'presse' })).toBe(false);
  });

  it('covers a whole category, so a new recipe of it inherits the rule', () => {
    const policy = { skillCategories: ['social'] };
    expect(policyCoversSkill(policy, { mention: 'instagram', skillCategory: 'social' })).toBe(true);
    expect(policyCoversSkill(policy, { mention: 'brandneu', skillCategory: 'social' })).toBe(true);
    expect(policyCoversSkill(policy, { mention: 'presse', skillCategory: 'presse' })).toBe(false);
  });

  it('leaves a recipe without a category alone when only categories are named', () => {
    expect(policyCoversSkill({ skillCategories: ['social'] }, { mention: 'ohne' })).toBe(false);
  });
});
