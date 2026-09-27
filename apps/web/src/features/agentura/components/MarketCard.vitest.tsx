import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarketCard } from './MarketCard';

import { axe } from '@/test-utils';

const base = {
  icon: <span aria-hidden="true">◆</span>,
  title: 'Guide-Demo: Pressestelle',
  meta: 'Grünerator · 5 Tools · Wissen',
  description: 'Erstellt sachliche Pressemitteilungen im Stil deiner Pressestelle.',
  onSelect: vi.fn(),
};

describe('MarketCard', () => {
  it('zeigt Titel, Meta-Zeile und Beschreibung', () => {
    render(<MarketCard {...base} />);
    expect(screen.getByRole('heading', { name: base.title })).toBeInTheDocument();
    expect(screen.getByText(base.meta)).toBeInTheDocument();
    expect(screen.getByText(base.description)).toBeInTheDocument();
  });

  it('aktiviert die Karte über die Klickfläche, nicht über das Menü', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MarketCard {...base} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: base.title }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  // Der Punkt, an dem die Karte kippen kann: `InteractiveCard` legt eine
  // unsichtbare Schaltfläche über die ganze Kachel. Ein Menü darin darf sie
  // weder auslösen noch unter ihr verschwinden.
  it('öffnet das Aktionsmenü, ohne die Karte zu aktivieren', async () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<MarketCard {...base} onSelect={onSelect} onEdit={onEdit} onToggleFavorite={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    expect(onSelect).not.toHaveBeenCalled();

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Bearbeiten')).toBeInTheDocument();
    expect(within(menu).getByText('Zu Favoriten')).toBeInTheDocument();
  });

  it('bietet nur an, was die Karte darf', async () => {
    const user = userEvent.setup();
    render(<MarketCard {...base} onToggleFavorite={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByText('Bearbeiten')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Duplizieren')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Löschen')).not.toBeInTheDocument();
  });

  it('beschriftet den Favoritenstern für Screenreader', () => {
    render(<MarketCard {...base} isFavorite onToggleFavorite={vi.fn()} />);
    expect(screen.getByLabelText('Favorit')).toBeInTheDocument();
  });

  it('hat keine a11y-Verstöße — insbesondere kein nested-interactive', async () => {
    const { container } = render(
      <MarketCard
        {...base}
        isFavorite
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
