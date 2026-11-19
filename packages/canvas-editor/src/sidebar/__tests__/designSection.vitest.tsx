import { CanvasEditorProvider } from '@ggraphic/editor/shell';
import { SHAREPIC_SOURCE_KEY, type SharepicSpec } from '@gruenerator/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { designDeckOf } from '../../components/CanvasEditor/designTab';
import { deCarousel } from '../../composer/sharepicSpecFixtures';
import { axe } from '../../test-utils';
import { DesignSection } from '../sections/DesignSection';

import type { SharepicTweak } from '../../composer/sharepicTweaks';
import type { CanvasDesignService } from '../../grueneratorHostServices';
import type { HeterogeneousPage } from '@ggraphic/editor/config';

const DECK = '6f1c1f4e-2b7a-4c39-9d3e-1a2b3c4d5e6f';

const creatorPage = (id: string, slide: SharepicSpec['slides'][number]): HeterogeneousPage => ({
  id,
  configId: 'freeform',
  state: {
    [SHAREPIC_SOURCE_KEY]: {
      v: 1,
      deck: DECK,
      slide: { ...deCarousel, slides: [slide] },
      attribution: null,
      tweaks: { navigation: 'pfeil' },
      baseline: {
        elements: {},
        background: { color: null, imageSrc: null, offset: null, scale: null },
      },
    },
  },
});

const PAGES = deCarousel.slides.slice(0, 2).map((s, i) => creatorPage(`p${i + 1}`, s));
const BLANK: HeterogeneousPage = { id: 'b1', configId: 'freeform', state: {} };

const NAVIGATION: SharepicTweak = {
  id: 'navigation',
  label: 'Navigation',
  value: 'pfeil',
  options: [
    { value: 'keine', label: 'Keine', short: 'Keine', disabled: false },
    { value: 'pfeil', label: 'Pfeil', short: 'Pfeil', disabled: false },
    { value: 'pfeil-bruch', label: 'Pfeil und 2/5', short: '2/5', disabled: false },
  ],
};

function setup(pages = PAGES, over: Partial<CanvasDesignService> = {}) {
  const ops = { updates: [], inserts: [], removes: [] };
  const design: CanvasDesignService = {
    options: vi.fn(async () => [NAVIGATION]),
    apply: vi.fn(async () => ({ ops, dropped: 0 })),
    ...over,
  };
  const deck = {
    getPages: () => pages,
    getActivePageId: () => pages[0]?.id ?? null,
    replaceDeck: vi.fn((): string[] => []),
  };
  const { container } = render(
    <CanvasEditorProvider services={{ design }}>
      <DesignSection
        formatId="post-portrait"
        pages={pages}
        deck={deck}
        onShowPage={() => {}}
        canAddPage
      />
    </CanvasEditorProvider>
  );
  return { design, deck, ops, container, user: userEvent.setup() };
}

describe('designDeckOf', () => {
  it("finds the active page's deck, else the first creator deck, else none", () => {
    expect(designDeckOf([BLANK, ...PAGES], 'p2')).toBe(DECK);
    expect(designDeckOf([BLANK, ...PAGES], 'b1')).toBe(DECK);
    expect(designDeckOf([BLANK], 'b1')).toBeNull();
  });
});

describe('DesignSection', () => {
  it('shows the options with the current one pressed', async () => {
    const { container } = setup();
    const pfeil = await screen.findByRole('button', { name: 'Pfeil' });
    expect(pfeil).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Keine' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Navigation' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('applies a pick to the whole deck in one replaceDeck, the other choices kept', async () => {
    const { design, deck, ops, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Pfeil und 2/5' }));
    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledWith(ops));
    expect(design.apply).toHaveBeenCalledWith(deck.getPages, DECK, { navigation: 'pfeil-bruch' });
  });

  it('names hand edits the new look dropped', async () => {
    const { user } = setup(PAGES, {
      apply: vi.fn(async () => ({ ops: { updates: [], inserts: [], removes: [] }, dropped: 2 })),
    });
    await user.click(await screen.findByRole('button', { name: 'Keine' }));
    expect(await screen.findByRole('status')).toHaveTextContent('2 Handänderungen');
  });

  it('says so when the deck cannot be composed, and changes nothing', async () => {
    const { deck, user } = setup(PAGES, {
      apply: vi.fn(async () => {
        throw new Error('compose failed');
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Keine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ließ sich nicht ändern');
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('explains itself on a document without a creator deck', () => {
    setup([BLANK]);
    expect(screen.getByText(/aus dem Sharepic-Creator/)).toBeInTheDocument();
  });
});
