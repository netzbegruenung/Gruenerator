import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { FavoriteButton } from './FavoriteButton';

describe('FavoriteButton', () => {
  it('reflects unfavorited state via aria-pressed and label', () => {
    render(<FavoriteButton favorited={false} onToggle={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Zu Favoriten hinzufügen' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('reflects favorited state via aria-pressed and label', () => {
    render(<FavoriteButton favorited onToggle={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Aus Favoriten entfernen' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onToggle on click and stops propagation', async () => {
    const onToggle = vi.fn();
    const onWrapperClick = vi.fn();
    render(
      // Der Wrapper IST der Prüfgegenstand: er belegt, dass der Knopf die
      // Weitergabe stoppt. Ein echtes Bedienelement daraus zu machen, würde
      // den Test gegenstandslos machen.
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onWrapperClick}>
        <FavoriteButton favorited={false} onToggle={onToggle} />
      </div>
    );
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onWrapperClick).not.toHaveBeenCalled();
  });

  it('is disabled and does not fire onToggle when disabled', async () => {
    const onToggle = vi.fn();
    render(<FavoriteButton favorited={false} onToggle={onToggle} disabled />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('uses disabledReason as the accessible name when disabled', () => {
    render(
      <FavoriteButton
        favorited={false}
        onToggle={vi.fn()}
        disabled
        disabledReason="Anmeldung erforderlich"
      />
    );
    expect(screen.getByRole('button', { name: 'Anmeldung erforderlich' })).toBeInTheDocument();
  });

  it('shows the text label when showLabel is set', () => {
    render(<FavoriteButton favorited showLabel onToggle={vi.fn()} />);
    expect(screen.getByText('Gemerkt')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<FavoriteButton favorited onToggle={vi.fn()} showLabel />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
