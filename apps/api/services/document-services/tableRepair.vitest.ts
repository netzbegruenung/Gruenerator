import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classifyForTableRepair,
  repairTables,
  storedTablePages,
  type TableRepairRow,
} from './tableRepair.js';

const TABLE = '| Ort | Stimmen |\n| --- | --- |\n| Bonn | 3 |';

const row = (over: Partial<TableRepairRow>): TableRepairRow => ({
  id: 'doc-1',
  user_id: 'u1',
  filename: 'bericht.pdf',
  status: 'completed',
  wolke_share_link_id: null,
  wolke_file_path: null,
  file_path: null,
  markdown_content: '',
  vector_count: 3,
  extraction_method: 'pdfjs-direct',
  ...over,
});

let originals: string;
beforeEach(() => {
  originals = fs.mkdtempSync(path.join(os.tmpdir(), 'originals-'));
  vi.stubEnv('DOCUMENT_ORIGINALS_DIR', originals);
  fs.mkdirSync(path.join(originals, 'u1'));
  fs.writeFileSync(path.join(originals, 'u1/doc-1.pdf'), '%PDF-1.4');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const detect = (pages: number[]) => ({ detectTablePages: vi.fn(async () => pages) });

describe('storedTablePages', () => {
  it('ordnet Tabellen ihren Seitenmarken zu', () => {
    const text = `## Seite 1\n\nText\n\n## Seite 2\n\n${TABLE}\n\n## Seite 3\n\nText`;
    expect(storedTablePages(text)).toEqual({ marked: true, pages: new Set([2]) });
  });
});

describe('classifyForTableRepair — PDF', () => {
  it('meldet Seiten, die die neue Erkennung als Tabelle sieht und der Text nicht', async () => {
    const finding = await classifyForTableRepair(
      row({
        file_path: 'u1/doc-1.pdf',
        markdown_content: `## Seite 1\n\nText\n\n## Seite 2\n\n${TABLE}\n\n## Seite 3\n\nPosten 2025 2026`,
      }),
      detect([2, 3])
    );
    expect(finding).toEqual({
      documentId: 'doc-1',
      extension: '.pdf',
      state: 'fixable',
      source: 'original',
      missedPages: [3],
    });
  });

  it('lässt eine Quelle in Ruhe, deren Tabellenseiten schon stehen', async () => {
    const finding = await classifyForTableRepair(
      row({ file_path: 'u1/doc-1.pdf', markdown_content: `## Seite 2\n\n${TABLE}` }),
      detect([2])
    );
    expect(finding.state).toBe('ok');
  });

  it('öffnet ein ganz per OCR gelesenes PDF gar nicht erst', async () => {
    const deps = detect([1]);
    const finding = await classifyForTableRepair(
      row({ file_path: 'u1/doc-1.pdf', extraction_method: 'mistral-ocr' }),
      deps
    );
    expect(finding.state).toBe('ok');
    expect(deps.detectTablePages).not.toHaveBeenCalled();
  });

  it('unterscheidet fehlendes Original, Wolke und unlesbare Datei', async () => {
    expect((await classifyForTableRepair(row({}), detect([1]))).state).toBe('no_original');
    expect(
      (
        await classifyForTableRepair(
          row({ wolke_share_link_id: 's1', wolke_file_path: '/a.pdf' }),
          detect([1])
        )
      ).state
    ).toBe('wolke_unchecked');
    const broken = {
      detectTablePages: vi.fn(async () => {
        throw new Error('Invalid PDF');
      }),
    };
    expect((await classifyForTableRepair(row({ file_path: 'u1/doc-1.pdf' }), broken)).state).toBe(
      'unreadable'
    );
  });
});

describe('classifyForTableRepair — Tabellendateien', () => {
  it('baut eine alte CSV aus dem gespeicherten Text', async () => {
    const finding = await classifyForTableRepair(
      row({ filename: 'wahl.csv', markdown_content: 'Ort;Stimmen\nBonn;3' }),
      detect([])
    );
    expect(finding).toMatchObject({ state: 'fixable', source: 'stored-text' });
  });

  it('lässt eine schon als Tabelle gespeicherte CSV in Ruhe', async () => {
    const finding = await classifyForTableRepair(
      row({ filename: 'wahl.csv', markdown_content: TABLE }),
      detect([])
    );
    expect(finding.state).toBe('ok');
  });

  it('kann eine XLSX ohne Original nicht reparieren', async () => {
    const finding = await classifyForTableRepair(
      row({ filename: 'haushalt.xlsx', markdown_content: 'Posten 2025' }),
      detect([])
    );
    expect(finding.state).toBe('no_original');
  });
});

describe('repairTables', () => {
  it('reiht im Namen der Eigentümer*in ein und meldet fehlende Quellen', async () => {
    const reindex = vi.fn(async () => ({ status: 'queued' as const }));
    const db = {
      query: async <T>(_sql: string, params: unknown[]): Promise<T[]> =>
        (params[0] === 'doc-1' ? [{ user_id: 'u1' }] : []) as T[],
    };

    const results = await repairTables(['doc-1', 'doc-1', 'weg'], { db, reindex });

    expect(reindex).toHaveBeenCalledOnce();
    expect(reindex).toHaveBeenCalledWith('doc-1', 'u1');
    expect(results).toEqual([
      { documentId: 'doc-1', status: 'queued' },
      { documentId: 'weg', status: 'not_found' },
    ]);
  });
});

describe('detectPdfTablePages', () => {
  it('liest die Tabellenseiten einer echten PDF so wie der Ingest', async () => {
    const { detectPdfTablePages } = await import('./tableRepair.js');
    const fixture = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '../../evals/extraction/__fixtures__/tabellen-pdf.pdf'
    );
    expect(await detectPdfTablePages(fixture)).toEqual([3, 4]);
  }, 30_000);
});
