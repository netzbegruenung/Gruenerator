/**
 * Die Landesverbands-Werkzeuge hängen an einer anderen Achse als alle übrigen:
 * nicht an einem OAuth-Scope, sondern an `api_keys.scopes.landesverbaende`.
 * Getestet wird deshalb vor allem, wer sie überhaupt zu sehen bekommt — und
 * dass die Freigabe eines Schlüssels nicht nur die Werkzeugliste färbt, sondern
 * auch den einzelnen Aufruf begrenzt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const searchLandesverbandChunks = vi.fn();
const loadLandesverbandFilters = vi.fn();

vi.mock('../v1/landesverbandNotebooks.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../v1/landesverbandNotebooks.js')>()),
  searchLandesverbandChunks: (...a: unknown[]) => searchLandesverbandChunks(...a),
  loadLandesverbandFilters: (...a: unknown[]) => loadLandesverbandFilters(...a),
}));

vi.mock('../v1/landesverbandMap.js', () => ({
  getSystemCollectionIdForLandesverband: (lv: string) =>
    ({ HH: 'hamburg-system', BY: 'bayern-system', BE: 'berlin-system' })[lv] ?? null,
  listSupportedLandesverbaende: () => [
    { code: 'HH', collectionId: 'hamburg-system', name: 'Hamburg' },
    { code: 'BY', collectionId: 'bayern-system', name: 'Bayern' },
    { code: 'BE', collectionId: 'berlin-system', name: 'Berlin' },
  ],
}));

const { registerLandesverbandTools, hasLandesverbandAccess } =
  await import('./landesverbandTools.js');

type Handler = (args: Record<string, unknown>) => Promise<{
  structuredContent?: Record<string, unknown>;
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function buildTools(landesverbaende: string[] | '*' | undefined) {
  const tools = new Map<string, { handler: Handler; config: { outputSchema?: z.ZodRawShape } }>();
  const server = {
    registerTool(name: string, config: { outputSchema?: z.ZodRawShape }, cb: unknown) {
      tools.set(name, { handler: cb as Handler, config });
    },
  };
  registerLandesverbandTools(server as never, {
    userId: 'user-1',
    landesverbaende,
  });
  return tools;
}

/** Was das SDK vor der Auslieferung tut: Erfolgsergebnis gegen das Schema parsen. */
async function callAndValidate(
  landesverbaende: string[] | '*' | undefined,
  name: string,
  args: Record<string, unknown>
) {
  const entry = buildTools(landesverbaende).get(name);
  if (!entry) throw new Error(`${name} nicht registriert`);
  const result = await entry.handler(args);
  if (result.isError) return result;
  const shape = entry.config.outputSchema;
  if (!shape) throw new Error(`${name} hat kein outputSchema`);
  expect(result.structuredContent, `${name} liefert kein structuredContent`).toBeDefined();
  const parsed = z.object(shape).safeParse(result.structuredContent);
  if (!parsed.success) {
    throw new Error(`structuredContent verletzt das outputSchema: ${parsed.error.message}`);
  }
  return result;
}

beforeEach(() => {
  searchLandesverbandChunks.mockReset();
  loadLandesverbandFilters.mockReset();
});

describe('hasLandesverbandAccess', () => {
  it('erkennt die drei Formen, in denen die Spalte vorkommt', () => {
    expect(hasLandesverbandAccess('*')).toBe(true);
    expect(hasLandesverbandAccess(['HH'])).toBe(true);
    expect(hasLandesverbandAccess([])).toBe(false);
    expect(hasLandesverbandAccess(undefined)).toBe(false);
  });
});

describe('notebooks_list', () => {
  it('zeigt nur die freigeschalteten Landesverbände', async () => {
    const result = await callAndValidate(['HH'], 'notebooks_list', {});
    const codes = (
      result.structuredContent as { landesverbaende: Array<{ code: string }> }
    ).landesverbaende.map((lv) => lv.code);
    expect(codes).toEqual(['HH']);
  });

  it('zeigt bei * alle unterstützten', async () => {
    const result = await callAndValidate('*', 'notebooks_list', {});
    const codes = (
      result.structuredContent as { landesverbaende: Array<{ code: string }> }
    ).landesverbaende.map((lv) => lv.code);
    expect(codes).toEqual(['HH', 'BY', 'BE']);
  });
});

describe('notebooks_search', () => {
  const chunk = {
    documentId: 'doc-1',
    title: 'Beschluss Verkehrswende',
    url: 'https://gruene-hamburg.de/a',
    excerpt: 'Auszug.',
    similarity: 0.87,
    date: '2026-01-01',
  };

  it('erfüllt das Schema und gibt jedem Treffer ein ref', async () => {
    searchLandesverbandChunks.mockResolvedValue([chunk]);
    const result = await callAndValidate(['HH'], 'notebooks_search', {
      query: 'Verkehr',
      landesverband: 'HH',
      limit: 8,
    });
    const hit = (result.structuredContent as { results: Array<{ ref: string; relevance: string }> })
      .results[0];
    expect(hit?.ref).toBeTruthy();
    expect(hit?.relevance).toBe('87%');
  });

  it('erfüllt das Schema auch ohne Treffer', async () => {
    searchLandesverbandChunks.mockResolvedValue([]);
    const result = await callAndValidate(['HH'], 'notebooks_search', {
      query: 'Verkehr',
      landesverband: 'HH',
      limit: 8,
    });
    expect((result.structuredContent as { resultsCount: number }).resultsCount).toBe(0);
  });

  it('weist einen Landesverband ausserhalb der Freigabe ab, ohne zu suchen', async () => {
    const entry = buildTools(['HH']).get('notebooks_search');
    const result = await entry!.handler({ query: 'Verkehr', landesverband: 'BY', limit: 8 });
    expect(result.isError).toBe(true);
    expect(searchLandesverbandChunks).not.toHaveBeenCalled();
  });

  it('reicht limit und filters an den Abruf durch', async () => {
    searchLandesverbandChunks.mockResolvedValue([]);
    await callAndValidate(['HH'], 'notebooks_search', {
      query: 'Verkehr',
      landesverband: 'HH',
      limit: 3,
      filters: { primary_category: 'Mobilität' },
    });
    expect(searchLandesverbandChunks).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, filters: { primary_category: 'Mobilität' } })
    );
  });
});

describe('notebooks_get_filters', () => {
  it('erfüllt das Schema mit Werten und Zeitraum nebeneinander', async () => {
    loadLandesverbandFilters.mockResolvedValue({
      primary_category: {
        label: 'Thema',
        type: 'keyword',
        values: [{ value: 'Mobilität', count: 12 }],
      },
      published_at: { label: 'Datum', type: 'date_range', min: '2020-01-01', max: '2026-01-01' },
    });
    const result = await callAndValidate(['HH'], 'notebooks_get_filters', {
      landesverband: 'HH',
    });
    const fields = (result.structuredContent as { fields: Array<{ field: string }> }).fields;
    expect(fields.map((f) => f.field)).toEqual(['primary_category', 'published_at']);
  });

  it('erfüllt das Schema auch bei einer Sammlung ohne Filterfelder', async () => {
    loadLandesverbandFilters.mockResolvedValue({});
    const result = await callAndValidate(['HH'], 'notebooks_get_filters', {
      landesverband: 'HH',
    });
    expect((result.structuredContent as { fields: unknown[] }).fields).toEqual([]);
  });

  it('weist einen fremden Landesverband ab', async () => {
    const entry = buildTools(['HH']).get('notebooks_get_filters');
    const result = await entry!.handler({ landesverband: 'BE' });
    expect(result.isError).toBe(true);
    expect(loadLandesverbandFilters).not.toHaveBeenCalled();
  });
});
