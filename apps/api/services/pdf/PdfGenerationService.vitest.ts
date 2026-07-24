import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPdfDocument, parsePdfStructure } from './PdfGenerationService.js';

describe('parsePdfStructure', () => {
  it('parses a direct JSON object and applies schema defaults', () => {
    const parsed = parsePdfStructure(
      JSON.stringify({ title: 'Radwege', blocks: [{ type: 'paragraph', text: 'Text' }] })
    );
    expect(parsed?.title).toBe('Radwege');
    expect(parsed?.kind).toBe('document');
    expect(parsed?.language).toBe('de-DE');
    expect(parsed?.blocks).toHaveLength(1);
  });

  it('parses fenced JSON with letter fields', () => {
    const raw = [
      'Hier ist das Dokument:',
      '```json',
      JSON.stringify({
        title: 'Brief an den Stadtrat',
        kind: 'letter',
        letter: { recipient: 'Stadtrat\nRathausplatz 1', subject: 'Radwege' },
        blocks: [{ type: 'paragraph', text: 'Brieftext' }],
      }),
      '```',
    ].join('\n');
    const parsed = parsePdfStructure(raw);
    expect(parsed?.kind).toBe('letter');
    expect(parsed?.letter?.recipient).toBe('Stadtrat\nRathausplatz 1');
  });

  it('parses a form with field blocks', () => {
    const parsed = parsePdfStructure(
      JSON.stringify({
        title: 'Mitgliedsantrag',
        kind: 'form',
        blocks: [
          { type: 'field', kind: 'text', label: 'Vorname', width: 'half' },
          { type: 'field', kind: 'select', label: 'Gliederung', options: ['KV A', 'KV B'] },
        ],
      })
    );
    expect(parsed?.kind).toBe('form');
    expect(parsed?.blocks[0]).toMatchObject({ type: 'field', kind: 'text', label: 'Vorname' });
  });

  it('rejects structurally invalid output', () => {
    expect(parsePdfStructure('{"title": "nur Titel"}')).toBeNull();
    expect(parsePdfStructure('{"blocks": []}')).toBeNull();
    expect(parsePdfStructure('kein JSON weit und breit')).toBeNull();
    expect(
      parsePdfStructure('{"title":"T","blocks":[{"type":"gibtsnicht","text":"x"}]}')
    ).toBeNull();
  });
});

describe('createPdfDocument', () => {
  let assetDir: string;

  beforeAll(async () => {
    assetDir = await mkdtemp(path.join(tmpdir(), 'pdf-assets-'));
    process.env.COMPUTE_ASSETS_BASE_DIR = assetDir;
  });

  afterAll(async () => {
    delete process.env.COMPUTE_ASSETS_BASE_DIR;
    await rm(assetDir, { recursive: true, force: true });
  });

  it('stores the rendered PDF and reports a clean self-check', async () => {
    const result = await createPdfDocument(
      {
        title: 'Speicher-Test',
        kind: 'document',
        language: 'de-DE',
        blocks: [{ type: 'paragraph', text: 'Ein Absatz.' }],
      },
      { userId: 'user-123', locale: 'de-DE' }
    );
    expect(result.document.subtype).toBe('pdf');
    expect(result.document.documentId).toMatch(/\.pdf$/);
    expect(result.document.url).toBe(
      `/api/chat-service/compute-assets/${result.document.documentId}`
    );
    expect(result.verification.problems).toEqual([]);
    expect(result.summary).toContain('getaggt');

    const stored = await readFile(path.join(assetDir, 'user-123', result.document.documentId));
    expect(stored.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('upgrades to letter mode when the model returned letter fields', async () => {
    const result = await createPdfDocument(
      {
        title: 'Brief-Test',
        kind: 'document',
        language: 'de-DE',
        letter: { recipient: 'Test\nTestweg 2', salutation: 'Hallo,' },
        blocks: [{ type: 'paragraph', text: 'Brieftext.' }],
      },
      { userId: 'user-123', locale: 'de-AT' }
    );
    expect(result.document.documentId).toMatch(/\.pdf$/);
    expect(result.verification.problems).toEqual([]);
  });
});
