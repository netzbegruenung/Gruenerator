import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import SidebarSection from './SidebarSection';

import type { MenuItemType } from '../Header/menuData';

const items: MenuItemType[] = [
  { id: 'a', title: 'Eintrag A', description: '', path: '/a' },
  { id: 'b', title: 'Eintrag B', description: '', path: '/b' },
];

function renderSection(isOpen: boolean) {
  return renderWithProviders(
    <SidebarSection
      sectionKey="tools"
      title="Werkzeuge"
      items={items}
      isOpen={isOpen}
      onToggle={vi.fn()}
      onLinkClick={vi.fn()}
      sidebarExpanded
    />
  );
}

describe('SidebarSection (aria-controls regression)', () => {
  it('omits aria-controls while collapsed (the list is unmounted)', () => {
    // Bug fixed: a static aria-controls pointed at an id that only exists while
    // open, so the collapsed state carried a dangling idref.
    renderSection(false);
    const button = screen.getByRole('button', { name: /Werkzeuge/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('aria-controls');
  });

  it('points aria-controls at the mounted list while open', () => {
    renderSection(true);
    const button = screen.getByRole('button', { name: /Werkzeuge/ });
    const controls = button.getAttribute('aria-controls');
    expect(controls).toBe('sidebar-section-tools');
    expect(document.getElementById(controls!)).not.toBeNull();
  });

  it('has no axe violations in either state', async () => {
    const { container: collapsed } = renderSection(false);
    expect(await axe(collapsed)).toHaveNoViolations();
    const { container: open } = renderSection(true);
    expect(await axe(open)).toHaveNoViolations();
  });
});
