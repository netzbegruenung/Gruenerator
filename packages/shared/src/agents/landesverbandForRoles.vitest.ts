import { describe, expect, it } from 'vitest';

import { DE_BUNDESLAENDER } from '../roles/rolesConfig.js';

import {
  isLvItemVisibleForRoles,
  isLvNotebookVisibleForRoles,
  landesverbandIdsForRoles,
  landesverbandTitle,
  lvSkillMentionsForRoles,
} from './landesverbandForRoles.js';
import { LANDESVERBAENDE } from './landesverbaende.js';
import { SKILLS } from './skills/index.js';

describe('landesverbandIdsForRoles', () => {
  it('returns nothing without roles', () => {
    expect(landesverbandIdsForRoles([], 'de-DE')).toEqual([]);
  });

  it('maps a Bundesland label to its Landesverband id', () => {
    expect(landesverbandIdsForRoles([{ bundesland: 'Berlin' }], 'de-DE')).toEqual(['berlin']);
  });

  it('deduplicates across several roles in the same Bundesland', () => {
    const roles = [{ bundesland: 'Berlin' }, { bundesland: 'Berlin' }, { bundesland: 'Bayern' }];
    expect(landesverbandIdsForRoles(roles, 'de-DE')).toEqual(['berlin', 'bayern']);
  });

  it('returns registry order, not input order', () => {
    const berlinFirst = landesverbandIdsForRoles(
      [{ bundesland: 'Berlin' }, { bundesland: 'Bayern' }],
      'de-DE'
    );
    const bayernFirst = landesverbandIdsForRoles(
      [{ bundesland: 'Bayern' }, { bundesland: 'Berlin' }],
      'de-DE'
    );
    expect(berlinFirst).toEqual(bayernFirst);
  });

  it('ignores roles without a Bundesland (free-text "Sonstige")', () => {
    expect(landesverbandIdsForRoles([{ rolle: 'Fraktionsgeschäftsführer*in' }], 'de-DE')).toEqual(
      []
    );
  });

  it('ignores Bundesländer that have no Landesverband entry', () => {
    expect(landesverbandIdsForRoles([{ bundesland: 'Bremen' }], 'de-DE')).toEqual([]);
  });

  it('drops Landesverbände whose notebook is switched off', () => {
    // Hamburg and Schleswig-Holstein are `enabled: false`, which already marks
    // both their agents `hiddenFromInventory`. The role rule must not undo that.
    expect(landesverbandIdsForRoles([{ bundesland: 'Hamburg' }], 'de-DE')).toEqual([]);
    expect(landesverbandIdsForRoles([{ bundesland: 'Schleswig-Holstein' }], 'de-DE')).toEqual([]);
  });

  it('resolves Austrian users to the single Österreich entry regardless of Bundesland', () => {
    expect(landesverbandIdsForRoles([{ bundesland: 'Tirol' }], 'de-AT')).toEqual(['oesterreich']);
    expect(landesverbandIdsForRoles([{ rolle: 'Gemeinderät*in' }], 'de-AT')).toEqual([
      'oesterreich',
    ]);
  });

  it('gives Austrian users nothing when they have no role at all', () => {
    expect(landesverbandIdsForRoles([], 'de-AT')).toEqual([]);
  });
});

describe('Bundesland labels stay joinable with the Landesverband registry', () => {
  // The join is by exact title. Renaming either side silently breaks every
  // downstream feature (Agentura gating, pre-starred recipes), so pin it.
  it.each(LANDESVERBAENDE.filter((lv) => lv.audience === 'de-DE').map((lv) => lv.title))(
    'DE_BUNDESLAENDER contains "%s"',
    (title) => {
      expect(DE_BUNDESLAENDER.some((bl) => bl.label === title)).toBe(true);
    }
  );
});

describe('isLvItemVisibleForRoles', () => {
  it('always passes non-Landesverband identifiers through', () => {
    expect(isLvItemVisibleForRoles('gruenerator-universal', [])).toBe(true);
    expect(isLvItemVisibleForRoles('gruenerator-antrag', ['berlin'])).toBe(true);
  });

  it('shows an LV agent only to members of that Landesverband', () => {
    expect(isLvItemVisibleForRoles('gruenerator-oeffentlichkeitsarbeit-berlin', ['berlin'])).toBe(
      true
    );
    expect(isLvItemVisibleForRoles('gruenerator-oeffentlichkeitsarbeit-berlin', ['bayern'])).toBe(
      false
    );
    expect(isLvItemVisibleForRoles('gruenerator-oeffentlichkeitsarbeit-berlin', [])).toBe(false);
  });

  it('covers the Bürger*innenanfragen agent too', () => {
    expect(isLvItemVisibleForRoles('gruenerator-buergeranfragen-bayern', ['bayern'])).toBe(true);
    expect(isLvItemVisibleForRoles('gruenerator-buergeranfragen-bayern', ['berlin'])).toBe(false);
  });
});

describe('lvSkillMentionsForRoles', () => {
  it('returns nothing without a matching Landesverband', () => {
    expect(lvSkillMentionsForRoles([], 'de-DE')).toEqual([]);
    expect(lvSkillMentionsForRoles([{ bundesland: 'Bremen' }], 'de-DE')).toEqual([]);
  });

  it('returns the Berlin recipes for a Berlin role', () => {
    const mentions = lvSkillMentionsForRoles([{ bundesland: 'Berlin' }], 'de-DE');
    expect(mentions).toContain('presse-berlin');
    expect(mentions).toContain('insta-berlin');
    expect(mentions).not.toContain('presse-bayern');
  });

  it('returns lowercase mentions that exist in the registry', () => {
    const known = new Set(SKILLS.map((s) => s.mention.toLowerCase()));
    for (const mention of lvSkillMentionsForRoles([{ bundesland: 'Berlin' }], 'de-DE')) {
      expect(mention).toBe(mention.toLowerCase());
      expect(known.has(mention)).toBe(true);
    }
  });

  it('skips recipes of a switched-off Landesverband', () => {
    expect(lvSkillMentionsForRoles([{ bundesland: 'Hamburg' }], 'de-DE')).toEqual([]);
  });
});

describe('landesverbandTitle', () => {
  it('resolves known ids and returns null otherwise', () => {
    expect(landesverbandTitle('mecklenburg-vorpommern')).toBe('Mecklenburg-Vorpommern');
    expect(landesverbandTitle('atlantis')).toBeNull();
  });
});

describe('isLvNotebookVisibleForRoles', () => {
  it('always passes notebooks that belong to no Landesverband', () => {
    expect(isLvNotebookVisibleForRoles('gruenerator-notebook', [])).toBe(true);
    expect(isLvNotebookVisibleForRoles('kommunalwiki-notebook', ['berlin'])).toBe(true);
  });

  it('shows an LV notebook only to members of that Landesverband', () => {
    expect(isLvNotebookVisibleForRoles('berlin-notebook', ['berlin'])).toBe(true);
    expect(isLvNotebookVisibleForRoles('berlin-notebook', ['bayern'])).toBe(false);
    expect(isLvNotebookVisibleForRoles('berlin-notebook', [])).toBe(false);
  });

  it('covers every Landesverband in the registry', () => {
    for (const lv of LANDESVERBAENDE) {
      expect(isLvNotebookVisibleForRoles(lv.notebookId, [lv.id])).toBe(true);
      expect(isLvNotebookVisibleForRoles(lv.notebookId, [])).toBe(false);
    }
  });
});
