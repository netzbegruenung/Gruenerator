/**
 * #4732: a preview that 404s used to leave an empty tile, indistinguishable
 * from one still loading. The kind icon now stands in.
 */
import { type MarketplaceItemOf } from '@gruenerator/contracts';
import { fireEvent, render } from '@testing-library/react';
import { PiSticker } from 'react-icons/pi';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { chatPathOf, KIND_VIEWS, VisualImage } from './kindViews';

const visual = (src: string | null) =>
  ({ type: 'image', src, cutout: true, icon: <PiSticker /> }) as const;

describe('VisualImage', () => {
  it('shows the image while it loads', () => {
    const { container } = render(<VisualImage visual={visual('/api/thumbs/a.webp')} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/thumbs/a.webp');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('swaps a preview that fails to load for the kind icon', () => {
    const { container } = render(<VisualImage visual={visual('/api/thumbs/a.webp')} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows the kind icon when there is no src at all', () => {
    const { container } = render(<VisualImage visual={visual(null)} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('gives a new src its own chance after an earlier one failed', () => {
    const { container, rerender } = render(<VisualImage visual={visual('/a.webp')} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    rerender(<VisualImage visual={visual('/b.webp')} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/b.webp');
  });
});

describe('chatPathOf', () => {
  const recipeItem = (rowId: string | null) =>
    ({ kind: 'recipe', recipe: { mention: 'presse', rowId } }) as unknown as Parameters<
      typeof chatPathOf
    >[0];

  it('always links a recipe as /chat?rezept=', () => {
    expect(chatPathOf(recipeItem(null))).toBe('/chat?rezept=presse');
    expect(chatPathOf(recipeItem('row-1'))).toBe('/chat?rezept=presse&rezeptId=row-1');
  });
});

// Seit /wissen weg ist, öffnet der Marktplatz die System-Notebooks.
describe('notebook kind', () => {
  const item = (ref: string, slug: string) =>
    ({ kind: 'notebook', ref, notebook: { slug } }) as MarketplaceItemOf<'notebook'>;

  it('opens a system notebook on its own page, a public one by slug', () => {
    const Actions = KIND_VIEWS.notebook.PrimaryActions;
    const system = render(
      <MemoryRouter>
        <Actions item={item('bayern-notebook', 'bayern-notebook')} />
      </MemoryRouter>
    );
    expect(system.getByRole('link')).toHaveAttribute('href', '/notebooks/bayern');
    system.unmount();

    const own = render(
      <MemoryRouter>
        <Actions item={item('11111111-2222-3333-4444-555555555555', 'klima-Ab3xK9')} />
      </MemoryRouter>
    );
    expect(own.getByRole('link')).toHaveAttribute('href', '/notebooks/klima-Ab3xK9');
  });

  it('shows a system notebook with its cover, a public one with the plain icon', () => {
    expect(KIND_VIEWS.notebook.visual(item('bayern-notebook', 'bayern-notebook')).type).toBe(
      'image'
    );
    expect(KIND_VIEWS.notebook.visual(item('11111111-2222-3333-4444-555555555555', 'x')).type).toBe(
      'icon'
    );
  });
});
