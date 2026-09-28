/**
 * Ein Beschluss- oder Wahlprogramm-Agent pinnt seine Suche auf genau einen
 * Inhaltstyp. Gibt es den im Landesverband nicht, findet der Agent nie etwas —
 * und sagt jede Antwort lang „keine Beschlusslage". Die Registry darf die
 * Familie deshalb nur dort führen, wo der Scraper diesen Typ auch schreibt.
 */
import { LANDESVERBAND_ENTRIES, getSystemAgent } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import { COLLECTION_MAP } from './collectionMap.js';
import { LANDESVERBAENDE_CONFIG } from './landesverbaendeConfig.js';

function scrapedContentTypes(codes: string | readonly string[]): ReadonlySet<string> {
  const wanted = new Set(typeof codes === 'string' ? [codes] : codes);
  const types = new Set<string>();
  for (const source of LANDESVERBAENDE_CONFIG.sources) {
    if (!wanted.has(source.shortName) || source.dormant) continue;
    for (const path of source.contentPaths) types.add(path.type);
  }
  for (const list of LANDESVERBAENDE_CONFIG.curatedLists ?? []) {
    if (list.contentType && list.shortName && wanted.has(list.shortName)) {
      types.add(list.contentType);
    }
  }
  return types;
}

const entries = LANDESVERBAND_ENTRIES;

describe('LV-Familien nur mit passendem Inhalt', () => {
  it.each(entries.filter((lv) => lv.beschlussAgentId).map((lv) => [lv.id, lv] as const))(
    '%s führt Beschlüsse',
    (_id, lv) => {
      expect(scrapedContentTypes(lv.codes).has('beschluss')).toBe(true);
    }
  );

  it.each(entries.filter((lv) => lv.wahlprogrammAgentId).map((lv) => [lv.id, lv] as const))(
    '%s führt ein Wahlprogramm',
    (_id, lv) => {
      expect(scrapedContentTypes(lv.codes).has('wahlprogramm')).toBe(true);
    }
  );

  it.each(
    entries
      .flatMap((lv) => [lv.beschlussAgentId, lv.wahlprogrammAgentId])
      .filter((id): id is string => id !== undefined)
      .map((id) => [id] as const)
  )('%s sucht nur in der eigenen LV-Sammlung', (id) => {
    const allowed = getSystemAgent(id)?.toolRestrictions?.allowedCollections ?? [];
    expect(allowed).toHaveLength(1);
    expect(COLLECTION_MAP[allowed[0] as string]?.qdrantCollection).toBe(
      'landesverbaende_documents'
    );
  });
});
