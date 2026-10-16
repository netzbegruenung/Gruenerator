import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import VorlagenCard from './VorlagenCard';

const item = { id: 'alt-dreizeilen', title: 'Dreizeiler', template_type: 'gruenerator' };

describe('VorlagenCard', () => {
  it('toggles like and bookmark without opening the card', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggleLike = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <VorlagenCard
        item={item}
        onOpen={onOpen}
        liked
        onToggleLike={onToggleLike}
        favorited={false}
        onToggleFavorite={onToggleFavorite}
      />
    );

    expect(screen.getByRole('button', { name: 'Gefällt mir nicht mehr' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const merken = screen.getByRole('button', { name: 'Merken' });
    expect(merken).toHaveAttribute('aria-pressed', 'false');

    await user.click(merken);
    await user.click(screen.getByRole('button', { name: 'Gefällt mir nicht mehr' }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onToggleLike).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Dreizeiler' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows the pressed bookmark and disables it while toggling', () => {
    render(
      <VorlagenCard
        item={item}
        onOpen={vi.fn()}
        favorited
        onToggleFavorite={vi.fn()}
        favoriteToggling
      />
    );
    const merken = screen.getByRole('button', { name: 'Merken' });
    expect(merken).toHaveAttribute('aria-pressed', 'true');
    expect(merken).toBeDisabled();
  });

  it('shows the like count', () => {
    render(<VorlagenCard item={{ ...item, likes_count: 3 }} onOpen={vi.fn()} />);
    expect(screen.getByTitle('3 mal geliked')).toHaveTextContent('3');
  });

  it('has no axe violations with every overlay action', async () => {
    const { container } = render(
      <VorlagenCard
        item={{ ...item, likes_count: 2 }}
        onOpen={vi.fn()}
        onToggleLike={vi.fn()}
        onToggleFavorite={vi.fn()}
        favorited
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the neutral placeholder when the thumbnail does not load', () => {
    const { container } = render(
      <VorlagenCard
        item={{ ...item, thumbnail_url: '/vorlagen/print/fehlt.webp' }}
        onOpen={vi.fn()}
      />
    );
    const img = screen.getByRole('img', { name: 'Dreizeiler' });
    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: 'Dreizeiler' })).not.toBeInTheDocument();
    expect(container.querySelector('svg.lucide-image')).not.toBeNull();
  });
});

describe('VorlagenCard pages', () => {
  const pages = ['/p1.webp', '/p2.webp', '/p3.webp'];

  function renderCard(cardPages?: string[]) {
    render(
      <VorlagenCard
        item={{ ...item, thumbnail_url: '/p1.webp' }}
        pages={cardPages}
        onOpen={vi.fn()}
      />
    );
    const img = screen.getByRole('img', { name: 'Dreizeiler' });
    vi.spyOn(img.parentElement!, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 300,
      height: 300,
    } as DOMRect);
    // The pointer lands on the card's click surface, which covers the stage.
    const surface = screen.getByRole('button', { name: 'Dreizeiler' });
    const move = (clientX: number, clientY = 150) =>
      fireEvent.pointerMove(surface, { clientX, clientY, pointerType: 'mouse' });
    return { img, surface, move };
  }

  it('shows the page under the mouse, and page 1 again on leave', () => {
    const { img, surface, move } = renderCard(pages);
    expect(img).toHaveAttribute('src', '/p1.webp');
    move(150);
    expect(img).toHaveAttribute('src', '/p2.webp');
    move(299);
    expect(img).toHaveAttribute('src', '/p3.webp');
    move(10, 400); // below the stage, over title and format
    expect(img).toHaveAttribute('src', '/p3.webp');
    fireEvent.pointerLeave(surface);
    expect(img).toHaveAttribute('src', '/p1.webp');
  });

  it('shows a page from its dot without opening the card', async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <VorlagenCard item={{ ...item, thumbnail_url: '/p1.webp' }} pages={pages} onOpen={onOpen} />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Seite 3 von 3 zeigen' }));
    expect(screen.getByRole('img', { name: 'Dreizeiler' })).toHaveAttribute('src', '/p3.webp');
    expect(screen.getByRole('button', { name: 'Seite 3 von 3 zeigen' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no dots and stays put without further pages', () => {
    const { img, move } = renderCard();
    move(299);
    expect(img).toHaveAttribute('src', '/p1.webp');
    expect(screen.queryByRole('button', { name: /Seite 1 von/ })).not.toBeInTheDocument();
  });
});
