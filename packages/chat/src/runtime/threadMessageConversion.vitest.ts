import { describe, it, expect } from 'vitest';

import { ATTACHMENT_META_PART_NAME } from '../lib/attachmentMeta';
import { PASTED_TEXT_ATTACHMENT_NAME, PASTED_TEXT_PREVIEW_PART_NAME } from '../lib/pastedText';

import {
  convertToThreadMessageLike,
  PASSTHROUGH_METADATA_FIELDS,
  type LoadedMessage,
} from './threadMessageConversion';

// Regression guard for the live⇄reload contract: rich content that renders live
// (via SSE, onto `custom.*`) must be reconstructable from persisted metadata so a
// reloaded thread renders the same as the live session. This test would have
// caught the charts / createdDocument / agentId reload regressions.

/** Extract the reconstructed `custom` render metadata from a single persisted message. */
function customOf(metadata: LoadedMessage['metadata']): Record<string, unknown> {
  const [msg] = convertToThreadMessageLike([
    { id: 'm1', role: 'assistant', content: 'hello', ...(metadata ? { metadata } : {}) },
  ]);
  return (msg?.metadata?.custom ?? {}) as Record<string, unknown>;
}

// A representative persisted value for every 1:1 passthrough field. Keyed by the
// field name so the `it.each` below cannot pass unless each key is handled.
const PASSTHROUGH_SAMPLES: Record<(typeof PASSTHROUGH_METADATA_FIELDS)[number], unknown> = {
  citations: [{ id: 'c1', title: 'Quelle' }],
  searchImages: [
    {
      title: 'Demo in Berlin',
      url: 'https://example.test/demo.jpg',
      domain: 'example.test',
      // Present on the wire but never in the database — the backend mints it
      // fresh on every load, so what reaches this converter already carries one.
      proxyUrl: '/api/search-image?url=x&exp=1&sig=y',
    },
  ],
  generatedImage: { url: 'https://example.test/i.png', filename: 'i.png' },
  createdDocument: {
    documentId: 'doc_1',
    title: 'Antrag',
    subtype: 'antrag',
    url: '/docs/doc_1',
  },
  computeData: {
    operation: 'Tabellen-Berechnung',
    entries: [{ label: 'Gesamtgewinn', value: '60.0' }],
    summary: 'Gesamtgewinn: 60.0',
    figures: ['aGVsbG8='],
  },
  agentId: 'gruenerator-pressemitteilung',
  roleName: 'Sprecher:in',
  interrupted: true,
};

describe('convertToThreadMessageLike — reload reconstruction', () => {
  it('rehydrates pasted text as a display-only attachment', () => {
    const [message] = convertToThreadMessageLike([
      {
        id: 'm-paste',
        role: 'user',
        content: 'Bitte fasse das zusammen.',
        attachments: [
          {
            id: 'a-paste',
            name: PASTED_TEXT_ATTACHMENT_NAME,
            contentType: 'text/plain',
            preview: 'Erster Absatz aus dem eingefügten Text.',
            truncated: false,
          },
        ],
      },
    ]);

    const attachments = (
      message as { attachments?: Array<{ content: Array<{ name?: string; data?: unknown }> }> }
    ).attachments;
    expect(attachments).toHaveLength(1);
    expect(attachments?.[0]?.content[0]).toEqual({
      type: 'data',
      name: PASTED_TEXT_PREVIEW_PART_NAME,
      data: { text: 'Erster Absatz aus dem eingefügten Text.', truncated: false },
    });
  });

  it('rehydrates uploaded files as metadata chips (size, page count, preview)', () => {
    const [message] = convertToThreadMessageLike([
      {
        id: 'm-file',
        role: 'user',
        content: 'Was steht in dem PDF?',
        attachments: [
          {
            id: 'a-pdf',
            name: 'migration-0.14.pdf',
            contentType: 'application/pdf',
            preview: 'Kapitel 1: Breaking Changes …',
            truncated: true,
            size: 1258291,
            pageCount: 14,
          },
          {
            id: 'a-img',
            name: 'composer-regression.png',
            contentType: 'image/png',
            preview: '',
            truncated: false,
            size: 421888,
          },
        ],
      },
    ]);

    const attachments = (
      message as {
        attachments?: Array<{ type: string; content: Array<{ name?: string; data?: unknown }> }>;
      }
    ).attachments;
    expect(attachments).toHaveLength(2);
    expect(attachments?.[0]?.type).toBe('document');
    expect(attachments?.[0]?.content[0]).toEqual({
      type: 'data',
      name: ATTACHMENT_META_PART_NAME,
      data: {
        size: 1258291,
        pageCount: 14,
        preview: 'Kapitel 1: Breaking Changes …',
        truncated: true,
      },
    });
    // Images come back as metadata-only chips too — bytes are not persisted,
    // and an empty preview must not produce a preview dialog.
    expect(attachments?.[1]?.type).toBe('image');
    expect(attachments?.[1]?.content[0]).toEqual({
      type: 'data',
      name: ATTACHMENT_META_PART_NAME,
      data: { size: 421888 },
    });
  });

  it('tolerates legacy attachment rows without size/pageCount', () => {
    const [message] = convertToThreadMessageLike([
      {
        id: 'm-legacy',
        role: 'user',
        content: 'Alt',
        attachments: [
          {
            id: 'a-old',
            name: 'alt.docx',
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            preview: '',
            truncated: false,
          },
        ],
      },
    ]);

    const attachments = (message as { attachments?: Array<{ content: Array<{ data?: unknown }> }> })
      .attachments;
    expect(attachments).toHaveLength(1);
    expect(attachments?.[0]?.content[0]?.data).toEqual({});
  });

  it.each(PASSTHROUGH_METADATA_FIELDS)(
    'rehydrates the "%s" passthrough field onto custom',
    (field) => {
      const custom = customOf({ [field]: PASSTHROUGH_SAMPLES[field] });
      expect(custom[field]).toEqual(PASSTHROUGH_SAMPLES[field]);
    }
  );

  it('has a sample for every passthrough field (guards against silent list drift)', () => {
    for (const field of PASSTHROUGH_METADATA_FIELDS) {
      expect(PASSTHROUGH_SAMPLES[field]).toBeDefined();
    }
  });

  it('drops an interrupted assistant row that has neither text nor tool cards', () => {
    const result = convertToThreadMessageLike([
      { id: 'm1', role: 'assistant', content: '', metadata: { interrupted: true } },
    ]);
    expect(result).toHaveLength(0);
  });

  it('keeps an interrupted row with partial text and rehydrates the marker', () => {
    const [msg] = convertToThreadMessageLike([
      { id: 'm1', role: 'assistant', content: 'Teilantw', metadata: { interrupted: true } },
    ]);
    expect(msg).toBeDefined();
    expect((msg?.metadata?.custom as Record<string, unknown>)?.interrupted).toBe(true);
  });

  it('rehydrates the sharepic variant stack from the persisted tool call', () => {
    const custom = customOf({
      toolCalls: [
        {
          toolCallId: 'tc1',
          toolName: 'sharepic',
          args: {},
          result: { variants: [{ id: 'v1', canvasType: 'dreizeilen', initialProps: {} }] },
        },
      ],
    });
    expect(custom.sharepicData).toEqual({
      variants: [{ id: 'v1', canvasType: 'dreizeilen', initialProps: {} }],
    });
  });

  it('drops sharepic variants with a non-canonical canvasType', () => {
    const custom = customOf({
      toolCalls: [
        {
          toolCallId: 'tc1',
          toolName: 'sharepic',
          args: {},
          result: { variants: [{ id: 'v1', canvasType: 'not-a-real-template', initialProps: {} }] },
        },
      ],
    });
    expect(custom.sharepicData).toBeUndefined();
  });

  it('rehydrates the social post text from the persisted social_post tool call', () => {
    const persisted = {
      postId: 'p1',
      platform: 'instagram',
      text: 'Mein Post #Klimaschutz',
      hashtags: ['#Klimaschutz'],
      charCount: 22,
      version: 2,
      versions: [
        {
          text: 'Alter Text',
          hashtags: [],
          charCount: 10,
          version: 1,
          summary: 'Erstellt',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const custom = customOf({
      toolCalls: [{ toolCallId: 'tc1', toolName: 'social_post', args: {}, result: persisted }],
    });
    // Head fields survive; the schema strips the `versions` history.
    expect(custom.socialPostData).toEqual({
      postId: 'p1',
      platform: 'instagram',
      text: 'Mein Post #Klimaschutz',
      hashtags: ['#Klimaschutz'],
      charCount: 22,
      version: 2,
    });
  });

  it('drops a malformed social_post tool result', () => {
    const custom = customOf({
      toolCalls: [
        { toolCallId: 'tc1', toolName: 'social_post', args: {}, result: { postId: 'p1' } },
      ],
    });
    expect(custom.socialPostData).toBeUndefined();
  });

  it('ignores a legacy persisted bundestag payload without crashing (card retired)', () => {
    const legacyPayload = {
      kind: 'document',
      document: {
        drucksache: {
          id: 'd1',
          titel: 'Entwurf eines Gesetzes',
          dokumentnummer: '21/50',
          drucksachetyp: 'Gesetzentwurf',
          wahlperiode: 21,
          datum: '2025-06-01',
          urheber: ['Bundesregierung'],
          pdfUrl: 'https://dserver.bundestag.de/btd/21/000/2100050.pdf',
        },
        siblings: [],
        vorgang: null,
      },
      notes: [],
      metadata: {
        query: 'Drucksache 21/50',
        extractedName: null,
        matchedDokumentnummer: '21/50',
        fetchTimeMs: 120,
      },
    };
    const custom = customOf({
      toolCalls: [{ toolCallId: 'tc1', toolName: 'bundestag', args: {}, result: legacyPayload }],
    });
    expect('bundestagData' in custom).toBe(false);
  });

  it('rehydrates the LAST persisted bahn__* step onto custom.bahnData', () => {
    const board = (station: string) => ({
      kind: 'timetable',
      station,
      date: '2026-07-17',
      hour: '09',
      entries: [
        {
          id: 'e1',
          category: 'ICE',
          number: '204',
          line: null,
          departureTime: '09:11',
          departurePlatform: '5',
          arrivalTime: '09:05',
          arrivalPlatform: '5',
          destination: 'Hamburg-Altona',
          via: ['Düsseldorf Hbf'],
        },
      ],
    });
    const custom = customOf({
      toolCalls: [
        {
          toolCallId: 'tc1',
          toolName: 'bahn__get_planned_timetable',
          args: {},
          result: { content: JSON.stringify(board('Köln Hbf')) },
        },
        {
          toolCallId: 'tc2',
          toolName: 'bahn__get_planned_timetable',
          args: {},
          result: { content: JSON.stringify(board('Bonn Hbf')) },
        },
      ],
    });
    expect((custom.bahnData as { station?: string })?.station).toBe('Bonn Hbf');
  });

  it('keeps the board when a raw bahn step follows the condensed one', () => {
    const board = {
      kind: 'timetable',
      station: 'Köln Hbf',
      date: '2026-07-17',
      hour: '09',
      entries: [
        {
          id: 'e1',
          category: 'ICE',
          number: '204',
          line: null,
          departureTime: '09:11',
          departurePlatform: '5',
          arrivalTime: null,
          arrivalPlatform: null,
          destination: 'Hamburg-Altona',
          via: [],
        },
      ],
    };
    const custom = customOf({
      toolCalls: [
        {
          toolCallId: 'tc1',
          toolName: 'bahn__get_planned_timetable',
          args: {},
          result: { content: JSON.stringify(board) },
        },
        // promptHint step 3: raw changes lookup AFTER the condensed board.
        {
          toolCallId: 'tc2',
          toolName: 'bahn__get_full_timetable_changes',
          args: {},
          result: { content: '{"@station":"Köln Hbf","s":[{"raw":true}]}' },
        },
      ],
    });
    expect((custom.bahnData as { station?: string })?.station).toBe('Köln Hbf');
  });

  it('ignores a raw (non-condensed) bahn tool result', () => {
    const custom = customOf({
      toolCalls: [
        {
          toolCallId: 'tc1',
          toolName: 'bahn__get_station_by_name',
          args: {},
          result: { content: '{"number":3320,"name":"Köln Hbf"}' },
        },
      ],
    });
    expect(custom.bahnData).toBeUndefined();
  });

  it('rehydrates reel_processing and reel_picker cards from persisted tool calls', () => {
    const custom = customOf({
      toolCalls: [
        {
          toolCallId: 'tc1',
          toolName: 'reel_processing',
          args: {},
          result: { uploadId: 'u1', filename: 'clip.mp4' },
        },
        {
          toolCallId: 'tc2',
          toolName: 'reel_picker',
          args: {},
          result: { projects: [{ projectId: 'p1', title: 'Reel' }] },
        },
      ],
    });
    expect(custom.reelProcessing).toEqual({ uploadId: 'u1', filename: 'clip.mp4' });
    expect(custom.reelPicker).toEqual({ projects: [{ projectId: 'p1', title: 'Reel' }] });
  });

  it('derives streamMetadata from intent so message actions rehydrate', () => {
    const custom = customOf({ intent: 'research', searchCount: 3 });
    expect(custom.streamMetadata).toEqual({ intent: 'research', searchCount: 3 });
  });

  it('emits no custom metadata for a bare message (nothing to rehydrate)', () => {
    const [msg] = convertToThreadMessageLike([{ id: 'm1', role: 'assistant', content: 'hi' }]);
    expect(msg?.metadata).toBeUndefined();
  });
});

// Stufe 2 (Interleaving on reload): when persisted tool calls carry a numeric
// textOffset, the answer text is sliced at each offset so cards render between
// prose in the live order. Without offsets the layout stays cards-first.

type ContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      parentId?: string;
      result?: unknown;
      narration?: string;
    };

function contentOf(metadata: LoadedMessage['metadata'], text = 'ABCDEFGHIJ'): ContentPart[] {
  const [msg] = convertToThreadMessageLike([
    { id: 'm1', role: 'assistant', content: text, ...(metadata ? { metadata } : {}) },
  ]);
  return (msg?.content ?? []) as ContentPart[];
}

describe('convertToThreadMessageLike — interleaved reload', () => {
  it('slices text at each offset, ordering cards between prose', () => {
    // text "ABCDEFGHIJ": card1 at 3 → "ABC" | card1 | "DEFG" | card2 | "HIJ".
    const content = contentOf({
      toolCalls: [
        { toolCallId: 't1', toolName: 'gruenerator_search', args: {}, result: {}, textOffset: 3 },
        { toolCallId: 't2', toolName: 'web_search', args: {}, result: {}, textOffset: 7 },
      ],
    });
    expect(content.map((p) => p.type)).toEqual(['text', 'tool-call', 'text', 'tool-call', 'text']);
    expect((content[0] as { text: string }).text).toBe('ABC');
    expect((content[2] as { text: string }).text).toBe('DEFG');
    expect((content[4] as { text: string }).text).toBe('HIJ');
    expect((content[1] as { toolCallId: string }).toolCallId).toBe('t1');
    expect((content[3] as { toolCallId: string }).toolCallId).toBe('t2');
  });

  it('sorts tool calls by offset (stable) before slicing', () => {
    const content = contentOf({
      toolCalls: [
        { toolCallId: 't2', toolName: 'web_search', args: {}, result: {}, textOffset: 7 },
        { toolCallId: 't1', toolName: 'gruenerator_search', args: {}, result: {}, textOffset: 3 },
      ],
    });
    const cards = content.filter(
      (p): p is ContentPart & { toolCallId: string } => p.type === 'tool-call'
    );
    expect(cards.map((c) => c.toolCallId)).toEqual(['t1', 't2']);
  });

  it('groups contiguous cards (same offset, no text between) into one run via parentId', () => {
    // Both cards at offset 0: no text before either → same run, share t1's id.
    const content = contentOf({
      toolCalls: [
        { toolCallId: 't1', toolName: 'gruenerator_search', args: {}, result: {}, textOffset: 0 },
        { toolCallId: 't2', toolName: 'web_search', args: {}, result: {}, textOffset: 0 },
      ],
    });
    const cards = content.filter(
      (p): p is ContentPart & { parentId?: string } => p.type === 'tool-call'
    );
    expect(cards[0].parentId).toBe('t1');
    expect(cards[1].parentId).toBe('t1');
  });

  it('starts a new run for a card that follows a non-empty text slice', () => {
    const content = contentOf({
      toolCalls: [
        { toolCallId: 't1', toolName: 'gruenerator_search', args: {}, result: {}, textOffset: 0 },
        { toolCallId: 't2', toolName: 'web_search', args: {}, result: {}, textOffset: 5 },
      ],
    });
    const cards = content.filter(
      (p): p is ContentPart & { parentId?: string } => p.type === 'tool-call'
    );
    // t1 at 0 (own run), t2 after "ABCDE" text → own run.
    expect(cards[0].parentId).toBe('t1');
    expect(cards[1].parentId).toBe('t2');
  });

  it('textOffset=0 puts the card before all text (empty leading slice dropped)', () => {
    const content = contentOf({
      toolCalls: [
        { toolCallId: 't1', toolName: 'gruenerator_search', args: {}, result: {}, textOffset: 0 },
      ],
    });
    expect(content.map((p) => p.type)).toEqual(['tool-call', 'text']);
    expect((content[1] as { text: string }).text).toBe('ABCDEFGHIJ');
  });

  it('always appends a trailing text part (even empty) matching live buildResult', () => {
    // Offset at end of text → no trailing prose, but the tail text part stays.
    const content = contentOf({
      toolCalls: [
        { toolCallId: 't1', toolName: 'gruenerator_search', args: {}, result: {}, textOffset: 10 },
      ],
    });
    expect(content.map((p) => p.type)).toEqual(['text', 'tool-call', 'text']);
    expect((content[2] as { text: string }).text).toBe('');
  });

  it('without offsets keeps the legacy cards-first layout unchanged', () => {
    const content = contentOf({
      toolCalls: [
        { toolCallId: 't1', toolName: 'gruenerator_search', args: {}, result: { results: [] } },
        { toolCallId: 't2', toolName: 'web_search', args: {}, result: { results: [] } },
      ],
    });
    expect(content.map((p) => p.type)).toEqual(['tool-call', 'tool-call', 'text']);
    expect((content[2] as { text: string }).text).toBe('ABCDEFGHIJ');
    // Legacy cards carry no parentId.
    expect((content[0] as { parentId?: string }).parentId).toBeUndefined();
  });

  // Narration survives reload on the durable channel (split-mode cards-first):
  // the field must round-trip onto the tool-call part so ToolNarration renders
  // it above the card, exactly as parentId does — pins it against an
  // assistant-ui upgrade silently stripping unknown part fields.
  it('carries persisted narration onto cards-first tool parts', () => {
    const content = contentOf({
      toolCalls: [
        {
          toolCallId: 't1',
          toolName: 'gruenerator_search',
          args: {},
          result: { results: [] },
          narration: 'Ich suche jetzt nach passenden Beschlüssen.',
        },
        { toolCallId: 't2', toolName: 'web_search', args: {}, result: { results: [] } },
      ],
    });
    const cards = content.filter(
      (p): p is ContentPart & { narration?: string } => p.type === 'tool-call'
    );
    expect(cards[0].narration).toBe('Ich suche jetzt nach passenden Beschlüssen.');
    expect(cards[1].narration).toBeUndefined();
  });

  it('carries persisted narration onto interleaved (offset) tool parts', () => {
    const content = contentOf({
      toolCalls: [
        {
          toolCallId: 't1',
          toolName: 'gruenerator_search',
          args: {},
          result: {},
          textOffset: 3,
          narration: 'Zuerst prüfe ich das Parteiprogramm.',
        },
      ],
    });
    const card = content.find(
      (p): p is ContentPart & { narration?: string } => p.type === 'tool-call'
    );
    expect(card?.narration).toBe('Zuerst prüfe ich das Parteiprogramm.');
  });
});
