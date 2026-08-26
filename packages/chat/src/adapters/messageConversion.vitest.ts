import { describe, expect, it } from 'vitest';

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
