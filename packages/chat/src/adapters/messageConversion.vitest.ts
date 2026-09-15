import { describe, expect, it } from 'vitest';

import { TOOL_APPROVAL_OPTIONS } from '../lib/toolApproval';

import { convertToThreadMessageLike, type LoadedMessage } from './messageConversion';

/**
 * The reload half of the live⇄reload contract, for the NATIVE converter.
 *
 * Web states the same contract as a list (`PASSTHROUGH_METADATA_FIELDS` in
 * runtime/threadMessageConversion.ts) with its own guard test; this file writes
 * it out by hand, and has drifted from it before. The symptom of a drop is not
 * an error: the card renders live, then vanishes on the next thread switch —
 * only on mobile, which is exactly the kind of gap nobody reports.
 */

function assistant(metadata: LoadedMessage['metadata']): LoadedMessage {
  return { id: 'm1', role: 'assistant', content: 'Antwort', metadata };
}

function custom(message: LoadedMessage): Record<string, unknown> {
  const [converted] = convertToThreadMessageLike([message]);
  return (converted?.metadata?.custom ?? {}) as Record<string, unknown>;
}

const IMAGES = [{ title: 'Bild', url: 'https://beispiel.de/1.jpg', domain: 'beispiel.de' }];

describe('convertToThreadMessageLike — rich metadata survives a reload', () => {
  it('carries web-search image hits back onto custom', () => {
    expect(custom(assistant({ searchImages: IMAGES }))).toMatchObject({ searchImages: IMAGES });
  });

  it('carries the freshly signed proxy handle with them', () => {
    const proxied = [{ ...IMAGES[0]!, proxyUrl: '/api/search-image?url=a&exp=1&sig=s' }];
    expect(custom(assistant({ searchImages: proxied }))).toMatchObject({ searchImages: proxied });
  });

  it('carries citations, the generated image and the interrupted marker', () => {
    const restored = custom(
      assistant({
        citations: [{ id: 1, title: 'Quelle', url: 'https://beispiel.de' }],
        generatedImage: { url: '/api/image/1' },
        interrupted: true,
      })
    );
    expect(restored.citations).toHaveLength(1);
    expect(restored.generatedImage).toEqual({ url: '/api/image/1' });
    expect(restored.interrupted).toBe(true);
  });

  it('leaves custom off entirely when a turn carried no rich metadata', () => {
    const [converted] = convertToThreadMessageLike([assistant({})]);
    expect(converted?.metadata).toBeUndefined();
  });

  // Tool-derived cards (#3288): these lived only on the web converter, so on
  // mobile the sharepic rendered live and vanished on the next thread switch.
  it('rebuilds the sharepic variant stack from the persisted tool call', () => {
    const restored = custom(
      assistant({
        toolCalls: [
          {
            toolCallId: 'tc1',
            toolName: 'sharepic',
            args: {},
            result: { variants: [{ id: 'v1', canvasType: 'dreizeilen', initialProps: {} }] },
          },
        ],
      })
    );
    expect(restored.sharepicData).toEqual({
      variants: [{ id: 'v1', canvasType: 'dreizeilen', initialProps: {} }],
    });
  });

  it('drops sharepic variants with a non-canonical canvasType', () => {
    const restored = custom(
      assistant({
        toolCalls: [
          {
            toolCallId: 'tc1',
            toolName: 'sharepic',
            args: {},
            result: { variants: [{ id: 'v1', canvasType: 'not-a-template', initialProps: {} }] },
          },
        ],
      })
    );
    expect(restored.sharepicData).toBeUndefined();
  });

  it('rebuilds the social post and the bahn board from persisted tool calls', () => {
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
    const restored = custom(
      assistant({
        toolCalls: [
          {
            toolCallId: 'tc1',
            toolName: 'social_post',
            args: {},
            result: {
              postId: 'p1',
              platform: 'instagram',
              text: 'Mein Post',
              hashtags: [],
              charCount: 9,
              version: 1,
            },
          },
          {
            toolCallId: 'tc2',
            toolName: 'bahn__get_planned_timetable',
            args: {},
            result: { content: JSON.stringify(board) },
          },
        ],
      })
    );
    expect(restored.socialPostData).toMatchObject({ postId: 'p1', text: 'Mein Post' });
    expect((restored.bahnData as { station?: string })?.station).toBe('Köln Hbf');
  });

  // An interrupted turn that never received a delta has nothing to show; a row
  // rendering only the marker would read as an answer that said nothing.
  it('drops an interrupted turn that produced no text at all', () => {
    expect(
      convertToThreadMessageLike([
        { id: 'm1', role: 'assistant', content: '', metadata: { interrupted: true } },
      ])
    ).toHaveLength(0);
  });
});

describe('convertToThreadMessageLike — offene Loop-Rückfrage (#3220, Mobile-Pfad)', () => {
  const pendingClarification = {
    askTurnId: 'ask-1',
    toolCallId: 'call_ask',
    question: 'Welche Anna meinst du?',
    options: ['Anna Müller', 'Anna Meier'],
    resolved: false,
  };

  it('rehydriert die beantwortbare ask_human-Karte samt requires-action-Status', () => {
    const [msg] = convertToThreadMessageLike([
      {
        id: 'm1',
        role: 'assistant',
        content: 'Ich habe zwei Kandidatinnen gefunden.',
        metadata: { pendingClarification },
      },
    ]);
    const ask = msg!.content.find((p) => p.type === 'tool-call' && p.toolName === 'ask_human');
    expect(ask).toMatchObject({
      toolCallId: 'call_ask',
      args: { question: 'Welche Anna meinst du?', options: ['Anna Müller', 'Anna Meier'] },
    });
    expect(ask).not.toHaveProperty('result');
    expect(msg!.status).toEqual({ type: 'requires-action', reason: 'tool-calls' });
  });

  it('gibt einer beantworteten Rückfrage echte args und die Antwort als String', () => {
    const [msg] = convertToThreadMessageLike([
      {
        id: 'm1',
        role: 'assistant',
        content: 'Anna Müller stimmte dafür.',
        metadata: {
          pendingClarification: { ...pendingClarification, resolved: true, answer: 'Anna Müller' },
          toolCalls: [
            {
              toolCallId: 'call_ask',
              toolName: 'ask_human',
              args: { question: 'Welche Anna meinst du?' },
              result: { answer: 'Anna Müller' },
            },
          ],
        },
      },
    ]);
    const asks = msg!.content.filter((p) => p.type === 'tool-call' && p.toolName === 'ask_human');
    expect(asks).toHaveLength(1);
    expect((asks[0] as { result?: unknown }).result).toBe('Anna Müller');
    expect(msg!.status).toBeUndefined();
  });
});

describe('convertToThreadMessageLike — pending tool approval', () => {
  const pendingApproval = {
    approvalTurnId: 'turn-1',
    calls: [
      {
        toolCallId: 'call-1',
        toolName: 'mcp__drive__share_file',
        args: { path: '/Plan.pdf', recipients: ['anna@example.org'] },
        title: 'Datei teilen',
        serverName: 'Google Drive',
      },
    ],
    resolved: false as const,
  };

  it('rehydrates a decidable card with full arguments, labels, and status', () => {
    const [message] = convertToThreadMessageLike([
      assistant({ interrupted: true, pendingApproval }),
    ]);
    const card = message?.content.find((part) => part.type === 'tool-call');

    expect(card).toMatchObject({
      toolCallId: 'call-1',
      toolName: 'mcp__drive__share_file',
      args: { path: '/Plan.pdf', recipients: ['anna@example.org'] },
      title: 'Datei teilen',
      serverName: 'Google Drive',
      approval: { id: 'call-1', options: TOOL_APPROVAL_OPTIONS },
    });
    expect(message?.status).toEqual({ type: 'requires-action', reason: 'tool-calls' });
  });

  it('keeps an otherwise empty interrupted turn when it contains an approval', () => {
    const converted = convertToThreadMessageLike([
      {
        id: 'm1',
        role: 'assistant',
        content: '',
        metadata: { interrupted: true, pendingApproval },
      },
    ]);

    expect(converted).toHaveLength(1);
    expect(converted[0]?.content.some((part) => part.type === 'tool-call')).toBe(true);
  });

  it('does not restore a card after the approval was resolved', () => {
    const [message] = convertToThreadMessageLike([
      assistant({ pendingApproval: { ...pendingApproval, resolved: true } }),
    ]);

    expect(message?.content.some((part) => part.type === 'tool-call')).toBe(false);
    expect(message?.status).toBeUndefined();
  });

  it('restores an expired approval as a terminal card', () => {
    const [message] = convertToThreadMessageLike([
      assistant({ pendingApproval: { ...pendingApproval, resolved: 'expired' } }),
    ]);
    const card = message?.content.find((part) => part.type === 'tool-call');

    expect(card).toMatchObject({ approval: { id: 'call-1', resolution: 'expired' } });
    expect(message?.status).toBeUndefined();
  });
});
