import { describe, it, expect } from 'vitest';
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
  generatedImage: { url: 'https://example.test/i.png', filename: 'i.png' },
  createdDocument: {
    documentId: 'doc_1',
    title: 'Antrag',
    subtype: 'antrag',
    url: '/docs/doc_1',
  },
  agentId: 'gruenerator-pressemitteilung',
  roleName: 'Sprecher:in',
};

describe('convertToThreadMessageLike — reload reconstruction', () => {
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
