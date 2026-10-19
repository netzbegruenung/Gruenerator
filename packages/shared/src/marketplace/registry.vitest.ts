import { MARKETPLACE_KINDS } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  MARKETPLACE_ORIGINS,
  MARKETPLACE_SORTS,
  MARKETPLACE_TABS,
  marketplaceEmptyText,
  marketplaceOriginLabel,
  tabForKind,
} from './registry';

describe('Marktplatz registry', () => {
  it('offers the tabs in order with unique slugs', () => {
    expect(MARKETPLACE_TABS.map((t) => [t.slug, t.label])).toEqual([
      ['alle', 'Alle'],
      ['agents', 'Agents'],
      ['rezepte', 'Rezepte'],
      ['vorlagen', 'Vorlagen'],
      ['sticker', 'Sticker'],
      ['hintergruende', 'Hintergründe'],
      ['notebooks', 'Notebooks'],
    ]);
  });

  it('gives every kind exactly one single-kind tab, and „Alle" all of them', () => {
    for (const kind of MARKETPLACE_KINDS) {
      expect(
        MARKETPLACE_TABS.filter((t) => t.kinds.length === 1 && t.kinds[0] === kind)
      ).toHaveLength(1);
      expect(tabForKind(kind).kinds).toEqual([kind]);
    }
    expect(MARKETPLACE_TABS[0].kinds).toEqual(MARKETPLACE_KINDS);
  });

  it('names origins and sorts in their contract order', () => {
    expect(MARKETPLACE_ORIGINS.map((o) => o.value)).toEqual([
      'offiziell',
      'landesverband',
      'oeffentlich',
    ]);
    expect(MARKETPLACE_SORTS.map((s) => s.label)).toEqual(['Empfohlen', 'Neu', 'Beliebt']);
  });

  it('names the person’s own Landesverband', () => {
    expect(marketplaceOriginLabel('landesverband', ['hessen'])).toBe('Grüne Hessen');
    expect(marketplaceOriginLabel('landesverband', null)).toBe('Dein Landesverband');
    expect(marketplaceOriginLabel('oeffentlich', ['hessen'])).toBe('Öffentlich');
  });

  it('says why a list is empty', () => {
    expect(marketplaceEmptyText('sticker', '')).toBe('Hier gibt es noch keine Sticker.');
    expect(marketplaceEmptyText('sticker', ' Wald ')).toBe('Keine Treffer für „Wald“.');
  });
});
