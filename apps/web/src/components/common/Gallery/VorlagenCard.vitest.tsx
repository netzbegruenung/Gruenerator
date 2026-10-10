import { render, screen } from '@testing-library/react';
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
});
