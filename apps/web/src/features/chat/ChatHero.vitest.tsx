/**
 * Der Hero auf /chat zeigt die Rezept-Vorschläge unter dem Composer; ein Klick
 * setzt die Pille über denselben Weg wie das @-Menü (`requestMention`).
 */
import { RecipeStarters } from '@gruenerator/chat';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../workplace/components/ChatInner', () => ({
  default: () => <div data-testid="composer" />,
}));
vi.mock('../workplace/components/WorkplaceGreeting', () => ({ default: () => <h1>Hallo</h1> }));
vi.mock('../workplace/workplace-sunrise.css', () => ({}));

const requestMention = vi.fn();
vi.mock('@gruenerator/chat', () => ({
  RecipeStarters: vi.fn(({ limit }: { limit?: number }) => (
    <ul aria-label="Rezepte">
      <li>
        <button
          type="button"
          onClick={() => {
            requestMention({ mention: 'pm', limit });
          }}
        >
          Pressemitteilung
        </button>
      </li>
    </ul>
  )),
}));

const { default: ChatHero } = await import('./ChatHero');

describe('ChatHero', () => {
  it('renders recipe starters below the composer and a click requests the mention', async () => {
    render(<ChatHero />);

    const composer = screen.getByTestId('composer');
    const starters = screen.getByRole('list', { name: 'Rezepte' });
    expect(
      composer.compareDocumentPosition(starters) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(vi.mocked(RecipeStarters)).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Pressemitteilung' }));
    expect(requestMention).toHaveBeenCalledWith(expect.objectContaining({ mention: 'pm' }));
  });
});
