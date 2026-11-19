import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSidebarStore } from '../../../stores/sidebarStore';
import { renderWithProviders } from '../../../test-utils';

import Sidebar from './Sidebar';

describe('Sidebar railHidden (collapsed rail off-screen)', () => {
  beforeEach(() => {
    useSidebarStore.setState({ isOpen: false, forceExpanded: false });
  });

  it('makes the hidden rail inert so its controls leave the tab order', () => {
    renderWithProviders(<Sidebar railHidden />);
    const aside = document.querySelector('aside[aria-label="Hauptnavigation"]');
    expect(aside).toHaveAttribute('inert');
  });

  it('keeps the rail interactive when it is not hidden', () => {
    renderWithProviders(<Sidebar />);
    const aside = document.querySelector('aside[aria-label="Hauptnavigation"]');
    expect(aside).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Menü öffnen' })).toBeInTheDocument();
  });

  it('is interactive again once the hidden rail is opened', () => {
    useSidebarStore.setState({ isOpen: true, forceExpanded: true });
    renderWithProviders(<Sidebar railHidden />);
    const aside = document.querySelector('aside[aria-label="Hauptnavigation"]');
    expect(aside).not.toHaveAttribute('inert');
  });
});
