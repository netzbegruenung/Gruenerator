import { describe, expect, it } from 'vitest';

import { ArbeitenSearchFab } from './ArbeitenSearchFab';

import { axe, renderWithProviders, screen } from '@/test-utils';

// The field is a stand-in: what is under test is the open/close/focus shell.
function setup() {
  return renderWithProviders(
    <div>
      <button type="button">Anderswo</button>
      <ArbeitenSearchFab label="Inhalte und Werkzeuge durchsuchen">
        {({ toolbarSlot, rootClassName }) => (
          <div className={rootClassName}>
            <textarea aria-label="Inhalte und Werkzeuge durchsuchen" />
            {toolbarSlot}
          </div>
        )}
      </ArbeitenSearchFab>
    </div>
  );
}

describe('ArbeitenSearchFab', () => {
  it('starts folded: only the button is reachable', () => {
    setup();
    const fab = screen.getByRole('button', { name: 'Suchen' });
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    // jsdom does not honour `inert` in the a11y tree, so assert the attribute itself.
    expect(screen.getByRole('search', { hidden: true })).toHaveAttribute('inert');
  });

  it('opens on tap and focuses the field', async () => {
    const { user } = setup();
    const fab = screen.getByRole('button', { name: 'Suchen' });
    await user.click(fab);
    expect(fab).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('search')).not.toHaveAttribute('inert');
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const { user } = setup();
    const fab = screen.getByRole('button', { name: 'Suchen', hidden: true });
    await user.click(fab);
    await user.keyboard('{Escape}');
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    expect(fab).toHaveFocus();
  });

  it('closes with the close button and returns focus', async () => {
    const { user } = setup();
    const fab = screen.getByRole('button', { name: 'Suchen', hidden: true });
    await user.click(fab);
    await user.click(screen.getByRole('button', { name: 'Suche schließen' }));
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    expect(fab).toHaveFocus();
  });

  it('closes on a tap outside without stealing focus', async () => {
    const { user } = setup();
    const fab = screen.getByRole('button', { name: 'Suchen', hidden: true });
    await user.click(fab);
    await user.click(screen.getByRole('button', { name: 'Anderswo' }));
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    expect(fab).not.toHaveFocus();
  });

  it('has no axe violations, folded or open', async () => {
    const { user } = setup();
    expect(await axe(document.body)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Suchen' }));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
