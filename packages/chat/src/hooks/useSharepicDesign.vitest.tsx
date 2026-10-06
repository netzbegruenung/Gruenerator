import { type SharepicSpec } from '@gruenerator/contracts';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type SharepicDesign } from '../lib/sharepicDesign';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import { useSharepicDesign } from './useSharepicDesign';

import type { SharepicVariant } from './useChatGraphStream';

const updateSharepicVariant = vi.fn();
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ threads: { updateSharepicVariant } }),
}));

const slide = {
  background: { kind: 'farbe' as const, color: 'mint' as const },
  position: 'oben' as const,
  align: 'links' as const,
  items: [{ type: 'headline' as const, lines: ['Mehr Radwege'] }],
  logo: false,
};
const drafted: SharepicSpec = { locale: 'de-DE', slides: [slide, slide] };

/** Stand-in for the composer's rules: one axis, page numbers. */
const design: SharepicDesign = {
  tweaks: (base, choice) => [
    {
      id: 'navigation',
      label: 'Navigation',
      value: choice.navigation ?? 'pfeil',
      options: [
        { value: 'pfeil', label: 'Pfeil', disabled: false },
        { value: 'pfeil-bruch', label: 'Pfeil und 2/5', disabled: false },
      ],
    },
  ],
  apply: (base, choice) =>
    choice.navigation === 'pfeil-bruch' ? { ...base, seitenzahl: 'bruch' } : base,
};

const variant = (extra: Partial<SharepicVariant> = {}) =>
  ({
    id: `v-${Math.random()}`,
    canvasType: 'freeform',
    initialProps: { creatorSpec: drafted, attributions: [null, null] },
    ...extra,
  }) as unknown as SharepicVariant;

beforeEach(() => {
  updateSharepicVariant.mockReset();
  updateSharepicVariant.mockResolvedValue({ status: 200, body: { success: true } });
  useChatConfigStore.setState({ sharepicDesign: design });
  useAgentStore.setState({ currentThreadId: 'thread-7' });
});
afterEach(() => {
  useChatConfigStore.setState({ sharepicDesign: undefined });
  useAgentStore.setState({ currentThreadId: null });
});

describe('useSharepicDesign', () => {
  it('renders the chosen variation and stores it on the variant', () => {
    const v = variant();
    const { result } = renderHook(() => useSharepicDesign(v, null));
    expect(result.current.spec).toBeNull();

    act(() => result.current.choose('navigation', 'pfeil-bruch'));
    expect(result.current.spec?.seitenzahl).toBe('bruch');
    expect(result.current.tweaked).toBe(true);
    expect(updateSharepicVariant).toHaveBeenCalledWith({
      params: { threadId: 'thread-7', variantId: v.id },
      body: { creatorSpec: { ...drafted, seitenzahl: 'bruch' } },
    });

    act(() => result.current.reset());
    expect(result.current.spec).toBeNull();
    expect(updateSharepicVariant).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { creatorSpec: drafted } })
    );
  });

  it('offers nothing once the card is a canvas, or for a template sharepic', () => {
    expect(
      renderHook(() => useSharepicDesign(variant(), 'canvas-1')).result.current.tweaks
    ).toEqual([]);
    const template = variant({ canvasType: 'dreizeilen', initialProps: { line1: 'Hallo' } });
    expect(renderHook(() => useSharepicDesign(template, null)).result.current.tweaks).toEqual([]);
  });
});
