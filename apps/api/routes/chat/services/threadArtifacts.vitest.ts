import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Was ein Thread an Artefakten hält — aus den Nachrichten-Metadaten, nicht aus
 * dem einen Platz in `chat_threads.last_tool_context`.
 *
 * Der Platz wird von jedem inhaltlichen Turn überschrieben. Erst ein Dokument,
 * dann ein Sharepic: das Dokument ist weg, und „kürze die Begründung" hat keine
 * Tür mehr dorthin. Diese Liste ist die Tür.
 *
 * Die Reihenfolge im Extraktor (Bild vor Sharepic vor Dokument) spiegelt
 * absichtlich `deriveToolContext` in postResponseService — beide lesen dieselben
 * Metadaten, und eine abweichende Rangfolge hiesse, dass die Liste ein anderes
 * Artefakt „das letzte" nennt als der Platz.
 */

const mockQuery = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const { listThreadArtifacts } = await import('./threadPersistenceService.js');

const sharepicRow = (text: string) => ({
  tool_results: {
    toolCalls: [
      {
        toolName: 'sharepic',
        result: {
          variants: [{ initialProps: { line1: text, line2: 'jetzt', line3: 'ausbauen' } }],
        },
      },
    ],
  },
});

const docRow = (documentId: string, title: string, subtype = 'antrag') => ({
  tool_results: { createdDocument: { documentId, title, subtype }, toolCalls: [] },
});

beforeEach(() => mockQuery.mockReset());

describe('listThreadArtifacts', () => {
  it('liefert mehrere Artefakte, neuestes zuerst', async () => {
    mockQuery.mockResolvedValue([
      sharepicRow('Windkraft'),
      docRow('doc-42', 'Antrag Straßenbäume'),
    ]);
    const artifacts = await listThreadArtifacts('t1');
    expect(artifacts).toEqual([
      { kind: 'sharepic', ref: null, label: 'Windkraft jetzt ausbauen' },
      { kind: 'document', ref: 'doc-42', label: 'Antrag Straßenbäume' },
    ]);
  });

  it('unterscheidet Präsentation, Tabelle und PDF am Subtyp', async () => {
    // 'pdf' muss VOR der 'document'-Vorgabe greifen: ein PDF trägt einen
    // Dateinamen, keine Dokument-UUID, und darf nie an einem Doku-Edit landen.
    mockQuery.mockResolvedValue([
      docRow('p-1', 'Folien', 'presentation_pitch'),
      docRow('s-1', 'Zahlen', 'sheet_budget'),
      docRow('f-1.pdf', 'Merkblatt', 'pdf_form'),
    ]);
    expect((await listThreadArtifacts('t1')).map((a) => a.kind)).toEqual([
      'presentation',
      'sheet',
      'pdf',
    ]);
  });

  it('zählt zwei Turns am selben Dokument als ein Artefakt', async () => {
    mockQuery.mockResolvedValue([
      docRow('doc-42', 'Antrag, gekürzt'),
      docRow('doc-42', 'Antrag Straßenbäume'),
    ]);
    const artifacts = await listThreadArtifacts('t1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].label).toBe('Antrag, gekürzt');
  });

  it('überspringt Turns ohne Artefakt und kaputte Metadaten', async () => {
    mockQuery.mockResolvedValue([
      { tool_results: { toolCalls: [{ toolName: 'web_search', result: { results: [] } }] } },
      { tool_results: '{kein json' },
      { tool_results: null },
      docRow('doc-42', 'Antrag Straßenbäume'),
    ]);
    expect(await listThreadArtifacts('t1')).toEqual([
      { kind: 'document', ref: 'doc-42', label: 'Antrag Straßenbäume' },
    ]);
  });

  it('nimmt bei einem Bild-Turn das Bild, nicht den Sharepic-Toolcall', async () => {
    mockQuery.mockResolvedValue([
      {
        tool_results: {
          generatedImage: { url: 'https://x/img.png', prompt: 'Sonnenblumenfeld am Abend' },
          ...sharepicRow('Windkraft').tool_results,
        },
      },
    ]);
    expect(await listThreadArtifacts('t1')).toEqual([
      { kind: 'image', ref: 'https://x/img.png', label: 'Sonnenblumenfeld am Abend' },
    ]);
  });

  it('deckelt die Liste', async () => {
    mockQuery.mockResolvedValue([
      docRow('d1', 'A'),
      docRow('d2', 'B'),
      docRow('d3', 'C'),
      docRow('d4', 'D'),
      docRow('d5', 'E'),
    ]);
    expect(await listThreadArtifacts('t1')).toHaveLength(4);
    expect(await listThreadArtifacts('t1', 2)).toHaveLength(2);
  });
});
