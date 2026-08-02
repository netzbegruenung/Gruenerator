/**
 * Gegenstück zu `kanban/kanban.vitest.tsx` für die Listenansicht des Boards.
 * Dieselbe Ursache (dnd-kits `role="button"` auf dem Ziehcontainer), dieselbe
 * Auflösung (Zeiger-Ziehen bleibt auf der Zeile, Tastatur-Ziehen wandert auf
 * einen benannten Griff) — und deshalb dieselbe Absicherung.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { ListGroup, ListItem, ListItems, ListProvider } from './index';

function renderList() {
  return render(
    <ListProvider onDragEnd={vi.fn()}>
      <ListGroup id="offen">
        <ListItems>
          <ListItem id="zeile-1" name="Antrag schreiben" index={0} parent="offen">
            <div role="button" tabIndex={0} onKeyDown={vi.fn()} onClick={vi.fn()}>
              Antrag schreiben
            </div>
          </ListItem>
        </ListItems>
      </ListGroup>
    </ListProvider>
  );
}

describe('ListItem', () => {
  it('macht die Zeile nicht selbst zum Bedienelement', () => {
    renderList();

    const zeile = screen.getByRole('button', { name: 'Antrag schreiben' });
    for (let el = zeile.parentElement; el; el = el.parentElement) {
      expect(el).not.toHaveAttribute('role', 'button');
      expect(el).not.toHaveAttribute('tabindex', '0');
    }
  });

  it('bietet das Verschieben als eigenen, benannten Griff an', () => {
    renderList();
    expect(screen.getByRole('button', { name: '„Antrag schreiben" verschieben' })).toBeVisible();
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = renderList();
    expect(await axe(container)).toHaveNoViolations();
  });
});
