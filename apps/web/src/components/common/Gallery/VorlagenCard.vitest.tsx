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

  it('shows a page from its dot without opening the card, and not on hover', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(
      <VorlagenCard item={{ ...item, thumbnail_url: '/p1.webp' }} pages={pages} onOpen={onOpen} />
    );
    const img = screen.getByRole('img', { name: 'Dreizeiler' });
    await user.hover(screen.getByRole('button', { name: 'Dreizeiler' }));
    expect(img).toHaveAttribute('src', '/p1.webp');

    await user.click(screen.getByRole('button', { name: 'Seite 3 von 3 zeigen' }));
    expect(img).toHaveAttribute('src', '/p3.webp');
    expect(screen.getByRole('button', { name: 'Seite 3 von 3 zeigen' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no dots without further pages', () => {
    render(<VorlagenCard item={{ ...item, thumbnail_url: '/p1.webp' }} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Seite 1 von/ })).not.toBeInTheDocument();
  });
});
