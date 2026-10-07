import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader';
import { BackgroundSection } from '../sections/BackgroundSection';

import type { StockImageAttribution } from '../../common/imageSourceTypes';
import type { BackgroundSectionProps } from '../types';

/**
 * The slider's picker is BackgroundSection, and the slider only touches the
 * credit when an attribution is passed: removing the photo through the real
 * button must hand an explicit null, or the Unsplash credit outlives it.
 */

const PHOTO = 'https://example.org/api/share/abc/download';
const CREDIT = {
  photographer: 'P',
  profileUrl: 'https://u',
  photoUrl: 'https://p',
} as unknown as StockImageAttribution;

describe('slider: removing the photo', () => {
  it('clears the photo and its credit', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const config = await loadCanvasConfig('slider');
    let state = config.createInitialState({
      currentImageSrc: PHOTO,
      imageAttribution: CREDIT,
    }) as Record<string, unknown>;
    const start = state;
    const actions = config.createActions(
      () => start,
      (partial) => {
        state =
          typeof partial === 'function'
            ? (partial(state) as Record<string, unknown>)
            : { ...state, ...partial };
      },
      () => {},
      () => {},
      {}
    );
    const section = config.sections.background;
    const props = section.propsFactory(start, actions, undefined) as BackgroundSectionProps;

    render(<BackgroundSection {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bild entfernen' }));

    expect(state.currentImageSrc || null).toBeNull();
    expect(state.imageAttribution ?? null).toBeNull();
  }, 120_000);
});
