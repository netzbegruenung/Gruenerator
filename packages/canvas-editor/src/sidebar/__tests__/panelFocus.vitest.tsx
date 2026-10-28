/**
 * Fokus beim Öffnen und Schließen des Bereichs: ein Tab, der den Bereich per
 * Tastatur öffnet, schickt den Fokus hinein; nach einem Klick bleibt er auf
 * dem Tab. Geschlossen kehrt er zum Tab zurück. Desktop-Panel und mobiles
 * Sheet folgen derselben Regel.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { PiImage, PiTextAa } from 'react-icons/pi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';
import { SidebarPanel } from '../SidebarPanel';
import { SidebarTabBar } from '../SidebarTabBar';

import type { SidebarTab, SidebarTabId } from '@ggraphic/editor/sidebar/types';

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const TABS: SidebarTab[] = [
  { id: 'uploads', icon: PiImage, label: 'Uploads', ariaLabel: 'Uploads' },
  { id: 'text', icon: PiTextAa, label: 'Text', ariaLabel: 'Text' },
];

function Editor({
  activeTab,
  onTabClick = () => {},
  onClose = () => {},
  content = <button type="button">Text hinzufügen</button>,
}: {
  activeTab: SidebarTabId | null;
  onTabClick?: (id: SidebarTabId) => void;
  onClose?: () => void;
  content?: React.ReactNode;
}) {
  const title = TABS.find((t) => t.id === activeTab)?.label;
  return (
    <div className="canvas-editor-layout">
      <SidebarTabBar tabs={TABS} activeTab={activeTab} onTabClick={onTabClick} />
      <SidebarPanel isOpen={activeTab !== null} title={title} onClose={onClose}>
        {activeTab !== null && content}
      </SidebarPanel>
    </div>
  );
}

/** jsdom has no TransitionEvent; the sheet only reads `propertyName`. */
function endTransition(el: Element) {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: 'transform' });
  fireEvent(el, event);
}

/** Was `focusModality.ts` der App an `<html>` schreibt. */
function setModality(modality: 'keyboard' | 'pointer') {
  document.documentElement.dataset.focusModality = modality;
}

beforeEach(() => setModality('keyboard'));
afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.focusModality;
});

describe('Desktop-Panel', () => {
  beforeEach(() => setViewport(false));

  it('schickt den Fokus vom öffnenden Tab auf das erste Bedienelement', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    screen.getByRole('button', { name: 'Text' }).focus();
    rerender(<Editor activeTab="text" />);
    expect(screen.getByRole('button', { name: 'Text hinzufügen' })).toHaveFocus();
  });

  it('fokussiert den Bereich selbst, wenn er noch kein Bedienelement hat', async () => {
    const { rerender, container } = render(<Editor activeTab={null} content={<p>Lädt …</p>} />);
    screen.getByRole('button', { name: 'Text' }).focus();
    rerender(<Editor activeTab="text" content={<p>Lädt …</p>} />);
    expect(screen.getByRole('region', { name: 'Text' })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lässt den Fokus nach einem Klick auf dem Tab', () => {
    setModality('pointer');
    const { rerender } = render(<Editor activeTab={null} />);
    const tab = screen.getByRole('button', { name: 'Text' });
    tab.focus();
    rerender(<Editor activeTab="text" />);
    expect(tab).toHaveFocus();
  });

  it('folgt einem Tab-Wechsel bei offenem Panel', () => {
    const { rerender } = render(<Editor activeTab="text" />);
    screen.getByRole('button', { name: 'Uploads' }).focus();
    rerender(<Editor activeTab="uploads" content={<button type="button">Hochladen</button>} />);
    expect(screen.getByRole('button', { name: 'Hochladen' })).toHaveFocus();
  });

  it('lässt den Fokus, wo er ist, wenn die Auswahl den Bereich öffnet', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    const elsewhere = document.body;
    rerender(<Editor activeTab="text" />);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('gibt den Fokus nach „Panel einklappen" an den Tab zurück', () => {
    const { rerender } = render(<Editor activeTab="text" />);
    const collapse = screen.getByRole('button', { name: 'Panel einklappen' });
    collapse.focus();
    rerender(<Editor activeTab={null} />);
    expect(screen.getByRole('button', { name: 'Text' })).toHaveFocus();
  });
});

describe('mobiles Sheet', () => {
  beforeEach(() => setViewport(true));

  it('schickt den Fokus vom öffnenden Tab auf die Überschrift', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    screen.getByRole('button', { name: 'Text' }).focus();
    rerender(<Editor activeTab="text" />);
    expect(screen.getByRole('heading', { name: 'Text' })).toHaveFocus();
  });

  it('lässt den Fokus nach einem Tipp auf dem Tab', () => {
    setModality('pointer');
    const { rerender } = render(<Editor activeTab={null} />);
    const tab = screen.getByRole('button', { name: 'Text' });
    tab.focus();
    rerender(<Editor activeTab="text" />);
    expect(tab).toHaveFocus();
  });

  it('gibt den Fokus nach dem Schließen an den Tab zurück', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    const tab = screen.getByRole('button', { name: 'Text' });
    tab.focus();
    rerender(<Editor activeTab="text" />);
    const sheet = screen.getByRole('region', { name: 'Text' });
    endTransition(sheet);
    screen.getByRole('button', { name: 'Text schließen' }).focus();
    rerender(<Editor activeTab={null} />);
    // `inert` blurs the close button in a browser; jsdom does not.
    (document.activeElement as HTMLElement).blur();
    endTransition(sheet);
    expect(tab).toHaveFocus();
  });
});
