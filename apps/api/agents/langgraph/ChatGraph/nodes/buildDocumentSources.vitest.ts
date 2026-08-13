import { describe, it, expect } from 'vitest';

import { buildDocumentSources } from './buildDocumentSources.js';

import type { ChatGraphState } from '../types.js';

/**
 * Was in `label` steht, landet im Systemprompt: `getSynthesisGuidance` rendert
 * die Quellenliste als „1. **<label>** (Quelle 1)". Das Modell liest sie als
 * Bestandsverzeichnis — und gibt zurück, was dort nach einer Kennung aussieht.
 *
 * Am 13.08.2026 stand dort `Dokument a13dc241`. Das Modell reichte `a13dc241`
 * an `read_artifact` weiter, Postgres bekam es als `::uuid` und antwortete mit
 * 22P02. Zweimal im selben Turn.
 */

const EMPTY = {
  documentIds: [],
  documentChatIds: [],
  docMentionIds: [],
  notebookIds: [],
  wolkeFiles: [],
  connectFiles: [],
  threadAttachments: undefined,
  currentDocument: undefined,
} as unknown as Parameters<typeof buildDocumentSources>[0];

const attachment = (over: Partial<{ name: string; documentId: string | null }>) =>
  ({
    id: 'att-1',
    name: 'Datei.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    isImage: false,
    extractedText: 'x',
    documentId: null,
    summary: null,
    createdAt: new Date(0),
    ...over,
  }) as unknown as NonNullable<ChatGraphState['threadAttachments']>[number];

describe('buildDocumentSources — Beschriftungen', () => {
  it('nennt kein Stück einer id als Beschriftung', () => {
    const id = 'a13dc241-543f-4e2f-8ec8-2872d6109296';
    const [source] = buildDocumentSources({ ...EMPTY, documentChatIds: [id] });
    expect(source!.label).not.toContain('a13dc241');
    // Die id selbst bleibt am Feld, wo die Abrufe sie erwarten.
    expect(source!.id).toBe(id);
  });

  it('nimmt den echten Dateinamen, wenn der Anhang ihn trägt', () => {
    const id = '61f23708-516b-48c9-b977-404610b77bf2';
    const [source] = buildDocumentSources({
      ...EMPTY,
      documentChatIds: [id],
      threadAttachments: [attachment({ name: 'Grundlagenpapier.docx', documentId: id })],
    });
    expect(source!.label).toBe('Grundlagenpapier.docx');
  });

  it('zählt durch, wenn kein Name bekannt ist — über die Arten hinweg', () => {
    // Zwei Quellen dürfen nicht dieselbe Beschriftung tragen: die Liste im
    // Prompt ist das Einzige, worüber das Modell sie auseinanderhält.
    const sources = buildDocumentSources({
      ...EMPTY,
      documentChatIds: [
        'a13dc241-543f-4e2f-8ec8-2872d6109296',
        '62de205e-1111-4222-8333-444444444444',
      ],
    });
    const labels = sources.map((s) => s.label);
    expect(labels).toEqual(['Dokument 1', 'Dokument 2']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('mischt Benanntes und Unbenanntes ohne Kollision', () => {
    const named = '61f23708-516b-48c9-b977-404610b77bf2';
    const unnamed = 'a13dc241-543f-4e2f-8ec8-2872d6109296';
    const sources = buildDocumentSources({
      ...EMPTY,
      documentChatIds: [named, unnamed],
      threadAttachments: [attachment({ name: 'Grundlagenpapier.docx', documentId: named })],
    });
    // Der Anhang steht zusätzlich als eigene `attachment`-Quelle in der Liste —
    // hier geht es nur um die aus ids abgeleiteten Beschriftungen.
    expect(sources.filter((s) => s.kind === 'document_chat').map((s) => s.label)).toEqual([
      'Grundlagenpapier.docx',
      'Dokument 1',
    ]);
  });
});
