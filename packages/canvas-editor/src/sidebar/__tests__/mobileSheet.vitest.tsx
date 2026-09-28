import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PiImage, PiTextAa } from 'react-icons/pi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarPanel } from '../SidebarPanel';
import { SidebarTabBar } from '../SidebarTabBar';
import { SubsectionTabBar } from '../SubsectionTabBar';

import type { SidebarTab } from '../types';

/**
 * Mobile Leiste und Sheet: eine feste Leiste, ein Sheet-Muster, Filter-Chips
 * im Sheet statt einer zweiten Tab-Reihe.
 */

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const TABS: SidebarTab[] = [
  { id: 'background', icon: PiImage, label: 'Hintergrund', ariaLabel: 'Hintergrund' },
  { id: 'text', icon: PiTextAa, label: 'Text', ariaLabel: 'Text' },
];

describe('mobile Leiste', () => {
  beforeEach(() => setViewport(true));

  it('zeigt jeden Bereich und markiert den offenen', () => {
    render(<SidebarTabBar tabs={TABS} activeTab="text" onTabClick={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Editor-Bereiche' });
    expect(nav).toHaveAttribute('data-suppress-feedback-launcher');
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hintergrund' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('meldet den Tipp auf einen Bereich', async () => {
    const onTabClick = vi.fn();
    render(<SidebarTabBar tabs={TABS} activeTab={null} onTabClick={onTabClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hintergrund' }));
    expect(onTabClick).toHaveBeenCalledWith('background');
  });
});

describe('mobiles Sheet', () => {
  beforeEach(() => setViewport(true));

  it('trägt den Titel des Bereichs und schließt über den Knopf', async () => {
    const onClose = vi.fn();
    render(
      <SidebarPanel isOpen title="Text" onClose={onClose}>
        <p>Inhalt</p>
      </SidebarPanel>
    );
    expect(screen.getByRole('heading', { name: 'Text' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Text schließen' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('rendert geschlossen nichts', () => {
    render(
      <SidebarPanel isOpen={false} title="Text">
        <p>Inhalt</p>
      </SidebarPanel>
    );
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
  });
});

describe('Filter-Chips', () => {
  const SUBS = [
    { id: 'bilder', icon: PiImage, label: 'Bilder', content: <p>Bilderliste</p> },
    { id: 'farbe', icon: PiImage, label: 'Farbe', content: <p>Farbfelder</p> },
  ];

  it('zeigt mobil genau eine Ansicht und wechselt per Chip', async () => {
    setViewport(true);
    render(<SubsectionTabBar subsections={SUBS} defaultSubsection="farbe" />);
    expect(screen.getByRole('tab', { name: 'Farbe' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Farbfelder')).toBeInTheDocument();
    expect(screen.queryByText('Bilderliste')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Bilder' }));
    expect(screen.getByText('Bilderliste')).toBeInTheDocument();
    expect(screen.queryByText('Farbfelder')).not.toBeInTheDocument();
  });

  it('stapelt auf dem Desktop alle Ansichten ohne Chips', () => {
    setViewport(false);
    render(<SubsectionTabBar subsections={SUBS} />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Bilderliste')).toBeInTheDocument();
    expect(screen.getByText('Farbfelder')).toBeInTheDocument();
  });
});
