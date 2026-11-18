/** Der Hero auf /chat zeigt die Rezept-Vorschläge unter dem Composer. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../workplace/components/ChatInner', () => ({
  default: () => <div data-testid="composer" />,
}));
vi.mock('../workplace/components/WorkplaceGreeting', () => ({ default: () => <h1>Hallo</h1> }));
vi.mock('../workplace/workplace-sunrise.css', () => ({}));

vi.mock('@gruenerator/chat', () => ({
  RecipeStarters: () => (
    <ul aria-label="Rezepte">
      <li>Pressemitteilung</li>
    </ul>
  ),
}));

const { default: ChatHero } = await import('./ChatHero');

describe('ChatHero', () => {
  it('renders recipe starters below the composer', () => {
    render(<ChatHero />);

    const composer = screen.getByTestId('composer');
    const starters = screen.getByRole('list', { name: 'Rezepte' });
    expect(
      composer.compareDocumentPosition(starters) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
