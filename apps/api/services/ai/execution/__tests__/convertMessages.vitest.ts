/**
 * One message converter for every provider, where there used to be three.
 *
 * The three had three different capability sets, and which one ran was decided
 * by the fallback chain rather than by the caller:
 *
 *   mistral  tool round-trips, base64 images, PDF→OCR — but NOT `image_url`
 *   regolo   base64 images and `image_url` — but no tool round-trips
 *   greenpt  a copy of regolo
 *   litellm  text only — every non-text block collapsed to '' and vanished
 *
 * Two jobs here. The first group is the safety net for the collapse: plain text
 * must come out exactly as before, or ~66 call sites change meaning at once.
 * The second is the actual repair — the shapes each old converter silently
 * dropped now survive, whichever provider answers.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../ocrService.js', () => ({
  ocrService: {
    extractTextFromBase64PDF: vi.fn(() => Promise.resolve({ text: 'Seite 1 Text' })),
  },
}));

const { convertMessages } = await import('../adapterUtils.js');

type Msg = NonNullable<Parameters<typeof convertMessages>[0]>;

describe('text goes through untouched (the collapse safety net)', () => {
  it('string content stays a string message', async () => {
    const { messages } = await convertMessages([
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Servus' },
    ] as Msg);

    expect(messages).toEqual([
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Servus' },
    ]);
  });

  it('collapses every system message into one system string', async () => {
    const { system, messages } = await convertMessages(
      [
        { role: 'system', content: 'Regel B' },
        { role: 'user', content: 'Frage' },
      ] as Msg,
      'Regel A'
    );

    expect(system).toBe('Regel A\n\nRegel B');
    expect(messages).toEqual([{ role: 'user', content: 'Frage' }]);
  });

  it('joins an array of text blocks with newlines', async () => {
    const { messages } = await convertMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'eins' },
          { type: 'text', text: 'zwei' },
        ],
      },
    ] as Msg);

    expect(messages).toEqual([{ role: 'user', content: 'eins\nzwei' }]);
  });

  it('has no system when none was given', async () => {
    const { system } = await convertMessages([{ role: 'user', content: 'x' }] as Msg);
    expect(system).toBeUndefined();
  });
});

describe('what the old converters dropped', () => {
  it('keeps a base64 image — litellm turned this into an empty line', async () => {
    const { messages } = await convertMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Was ist das?' },
          { type: 'image', source: { data: 'aGVsbG8=', media_type: 'image/jpeg' } },
        ],
      },
    ] as Msg);

    expect(messages[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'Was ist das?' },
        { type: 'image', mimeType: 'image/jpeg' },
      ],
    });
  });

  it('keeps a remote image_url — mistral only understood the `image` shape', async () => {
    const { messages } = await convertMessages([
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://example.org/a.png' } }],
      },
    ] as Msg);

    const part = (messages[0] as { content: Array<{ type: string; image: URL }> }).content[0];
    expect(part.type).toBe('image');
    expect(part.image.toString()).toBe('https://example.org/a.png');
  });

  it('keeps a data-URI image_url', async () => {
    const { messages } = await convertMessages([
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }],
      },
    ] as Msg);

    expect((messages[0] as { content: Array<{ mimeType?: string }> }).content[0]).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
    });
  });

  it('runs a PDF through OCR — three of four providers saw nothing at all', async () => {
    // promptAssemblyGraph builds these blocks and PromptProcessor hands them
    // straight on; most routeTypes land on litellm, which dropped them.
    const { messages } = await convertMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Fasse zusammen:' },
          {
            type: 'document',
            source: { data: 'JVBERi0=', media_type: 'application/pdf', name: 'antrag.pdf' },
          },
        ],
      },
    ] as Msg);

    expect(messages[0]?.content).toBe('Fasse zusammen:\n[PDF-Inhalt: antrag.pdf]\n\nSeite 1 Text');
  });

  it('says so when a document could not be read, instead of dropping it', async () => {
    const { messages } = await convertMessages([
      { role: 'user', content: [{ type: 'document', source: { name: 'notiz.odt' } }] },
    ] as Msg);

    expect(messages[0]?.content).toBe('[Dokument: notiz.odt]');
  });

  it('replays a tool round-trip — only mistral could', async () => {
    const { messages } = await convertMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Ich suche.' },
          { type: 'tool_use', id: 'call_1', name: 'web_search', input: { query: 'Radweg' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '3 Treffer' }],
      },
    ] as Msg);

    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Ich suche.' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'web_search',
          input: { query: 'Radweg' },
        },
      ],
    });
    expect(messages[1]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: '',
          output: { type: 'text', value: '3 Treffer' },
        },
      ],
    });
  });

  it('serialises a non-string tool result', async () => {
    const { messages } = await convertMessages([
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_call_id: 'c2', content: { hits: 3 } }],
      },
    ] as Msg);

    expect(
      (messages[0] as { content: Array<{ output: { value: string } }> }).content[0]?.output.value
    ).toBe('{"hits":3}');
  });
});
