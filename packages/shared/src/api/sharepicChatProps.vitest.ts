import { describe, expect, it } from 'vitest';

import {
  parseSharepicChatProps,
  sharepicVariantSchema,
  type SharepicSpec,
} from '@gruenerator/contracts';

const spec: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
      logo: false,
    },
  ],
};

describe('parseSharepicChatProps', () => {
  it('accepts a creator payload', () => {
    const props = { creatorSpec: spec, attributions: [null] };
    expect(parseSharepicChatProps(props)).toEqual(props);
  });

  it('keeps slide, revisionOf and editorChangesDropped', () => {
    const props = {
      creatorSpec: spec,
      attributions: [null],
      slide: 0,
      revisionOf: 'v1',
      editorChangesDropped: true,
    };
    expect(parseSharepicChatProps(props)).toEqual(props);
  });

  it('returns null for legacy template props', () => {
    expect(parseSharepicChatProps({ line1: 'a', line2: 'b', line3: 'c' })).toBeNull();
  });

  it('returns null for a broken spec instead of throwing', () => {
    expect(
      parseSharepicChatProps({ creatorSpec: { locale: 'de-DE', slides: [] }, attributions: [] })
    ).toBeNull();
  });

  it('survives the chat variant schema unchanged (thread reload)', () => {
    const variant = {
      id: 'v1',
      canvasType: 'freeform',
      initialProps: { creatorSpec: spec, attributions: [null] },
      label: 'Sharepic',
    };
    const parsed = sharepicVariantSchema.parse(variant);
    expect(parseSharepicChatProps(parsed.initialProps)).not.toBeNull();
  });
});
