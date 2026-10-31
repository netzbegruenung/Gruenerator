import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PiImage, PiTextAa } from 'react-icons/pi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarPanel } from '@ggraphic/editor/sidebar/SidebarPanel';
import { SidebarTabBar } from '@ggraphic/editor/sidebar/SidebarTabBar';
import { SubsectionTabBar } from '@ggraphic/editor/sidebar/SubsectionTabBar';

import type { SidebarTab } from '@ggraphic/editor/sidebar/types';

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

/** jsdom has no TransitionEvent; the sheet only reads `propertyName`. */
function endTransition(el: Element, propertyName = 'transform') {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  fireEvent(el, event);
}

function sheetEl() {
  return document.querySelector('section.sidebar-panel');
}

const TABS: SidebarTab[] = [
  { id: 'uploads', icon: PiImage, label: 'Uploads', ariaLabel: 'Uploads' },
  { id: 'text', icon: PiTextAa, label: 'Text', ariaLabel: 'Text' },
];

describe('mobile Leiste', () => {
  beforeEach(() => setViewport(true));

  it('zeigt jeden Bereich und markiert den offenen', () => {
    render(<SidebarTabBar tabs={TABS} activeTab="text" onTabClick={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Editor-Bereiche' });
    expect(nav).toHaveAttribute('data-suppress-feedback-launcher');
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Uploads' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('meldet den Tipp auf einen Bereich', async () => {
    const onTabClick = vi.fn();
    render(<SidebarTabBar tabs={TABS} activeTab={null} onTabClick={onTabClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Uploads' }));
    expect(onTabClick).toHaveBeenCalledWith('uploads');
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

describe('mobiles Sheet: Ein- und Ausgleiten', () => {
  beforeEach(() => setViewport(true));
  afterEach(() => vi.useRealTimers());

  function panel(isOpen: boolean, title = 'Text') {
    return (
      <SidebarPanel isOpen={isOpen} title={title} onClose={() => {}}>
        <p>Inhalt</p>
      </SidebarPanel>
    );
  }

  it('slides in and mounts content after the enter transition', () => {
    render(panel(true));
    const sheet = screen.getByRole('region', { name: 'Text' });
    expect(sheet).toHaveAttribute('data-state', 'entering');
    expect(screen.queryByText('Inhalt')).toBeNull();

    endTransition(sheet);
    expect(sheet).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('ignores transitions bubbling up from the content', () => {
    render(panel(true));
    const sheet = screen.getByRole('region', { name: 'Text' });
    endTransition(sheet.querySelector('.sidebar-panel__content') as Element);
    expect(sheet).toHaveAttribute('data-state', 'entering');
  });

  it('gives focus back to the tab that opened it once the sheet is gone', () => {
    const withTab = (isOpen: boolean) => (
      <>
        <button type="button">Text-Tab</button>
        {panel(isOpen)}
      </>
    );
    const { rerender } = render(withTab(false));
    const tab = screen.getByRole('button', { name: 'Text-Tab' });
    tab.focus();
    rerender(withTab(true));
    endTransition(screen.getByRole('region', { name: 'Text' }));

    const close = screen.getByRole('button', { name: 'Text schließen' });
    close.focus();
    rerender(withTab(false));
    // `inert` blurs the close button in a browser; jsdom does not.
    close.blur();
    endTransition(sheetEl() as Element);

    expect(sheetEl()).toBeNull();
    expect(tab).toHaveFocus();
  });

  it('leaves focus alone when it already moved somewhere else', () => {
    const withTabs = (isOpen: boolean) => (
      <>
        <button type="button">Text-Tab</button>
        <input aria-label="Woanders" />
        {panel(isOpen)}
      </>
    );
    const { rerender } = render(withTabs(false));
    screen.getByRole('button', { name: 'Text-Tab' }).focus();
    rerender(withTabs(true));
    endTransition(screen.getByRole('region', { name: 'Text' }));
    rerender(withTabs(false));
    const elsewhere = screen.getByRole('textbox', { name: 'Woanders' });
    elsewhere.focus();
    endTransition(sheetEl() as Element);
    expect(elsewhere).toHaveFocus();
  });

  it('keeps the sheet mounted while it slides out', () => {
    const { rerender } = render(panel(true));
    endTransition(screen.getByRole('region', { name: 'Text' }));

    rerender(panel(false));
    const sheet = sheetEl();
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveAttribute('data-state', 'closing');
    expect(screen.getByText('Inhalt')).toBeInTheDocument();

    endTransition(sheet as Element);
    expect(sheetEl()).toBeNull();
  });

  it('falls back when transitionend never fires', () => {
    vi.useFakeTimers();
    const { rerender } = render(panel(true));
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(sheetEl()).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Inhalt')).toBeInTheDocument();

    rerender(panel(false));
    expect(sheetEl()).toHaveAttribute('data-state', 'closing');
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(sheetEl()).toBeNull();
  });

  it('does not replay the enter animation when the title changes', () => {
    const { rerender } = render(panel(true));
    endTransition(screen.getByRole('region', { name: 'Text' }));

    rerender(panel(true, 'Bilder'));
    const sheet = screen.getByRole('region', { name: 'Bilder' });
    expect(sheet).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('closes cleanly when closed mid-enter', () => {
    const { rerender } = render(panel(true));
    rerender(panel(false));
    const sheet = sheetEl();
    expect(sheet).toHaveAttribute('data-state', 'closing');
    expect(screen.queryByText('Inhalt')).toBeNull();

    endTransition(sheet as Element);
    expect(sheetEl()).toBeNull();
  });

  it('opens again after a full close', () => {
    const { rerender } = render(panel(true));
    endTransition(screen.getByRole('region', { name: 'Text' }));
    rerender(panel(false));
    endTransition(sheetEl() as Element);

    rerender(panel(true));
    const sheet = screen.getByRole('region', { name: 'Text' });
    expect(sheet).toHaveAttribute('data-state', 'entering');
    expect(screen.queryByText('Inhalt')).toBeNull();
  });

  it('slides out with the content it had while open', () => {
    const { rerender } = render(panel(true));
    endTransition(screen.getByRole('region', { name: 'Text' }));

    // The editor drops the active section in the same render that closes.
    rerender(
      <SidebarPanel isOpen={false} onClose={() => {}}>
        {null}
      </SidebarPanel>
    );
    const sheet = sheetEl();
    expect(sheet).toHaveAttribute('data-state', 'closing');
    expect(sheet).toHaveAttribute('aria-label', 'Text');
    expect(screen.getByText('Inhalt')).toBeInTheDocument();

    endTransition(sheet as Element);
    expect(sheetEl()).toBeNull();
    expect(screen.queryByText('Inhalt')).toBeNull();
  });

  it('reopens cleanly while it slides out', () => {
    vi.useFakeTimers();
    const { rerender } = render(panel(true));
    endTransition(screen.getByRole('region', { name: 'Text' }));

    rerender(panel(false));
    expect(sheetEl()).toHaveAttribute('data-state', 'closing');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(panel(true));
    expect(sheetEl()).toHaveAttribute('data-state', 'entering');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    const sheet = sheetEl();
    expect(sheet).toHaveAttribute('data-state', 'open');
    expect(sheet).not.toHaveAttribute('inert');
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('keeps the phase machine idle on desktop', () => {
    setViewport(false);
    const { rerender } = render(panel(true));
    rerender(panel(false));
    // Crossing the breakpoint after a desktop close must not slide a sheet out.
    setViewport(true);
    rerender(panel(false));
    expect(sheetEl()).toBeNull();
  });

  it('shows a panel opened on desktop as an open sheet after crossing to mobile', () => {
    setViewport(false);
    const { rerender } = render(panel(true));
    setViewport(true);
    rerender(panel(true));
    expect(sheetEl()).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('does not replay the exit after a drag close', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SidebarPanel isOpen title="Text" onClose={onClose}>
        <p>Inhalt</p>
      </SidebarPanel>
    );
    const sheet = screen.getByRole('region', { name: 'Text' });
    endTransition(sheet);
    const handle = sheet.querySelector('.sidebar-panel__drag-handle') as HTMLElement;

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(handle, { touches: [] });
    expect(sheet.style.transform).toBe('translateY(100%)');
    endTransition(sheet);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <SidebarPanel isOpen={false} title="Text" onClose={onClose}>
        <p>Inhalt</p>
      </SidebarPanel>
    );
    expect(sheetEl()).toBeNull();
  });

  it('keeps the close button inside a 44 px title row', () => {
    render(panel(true));
    const row = screen.getByRole('button', { name: 'Text schließen' }).parentElement;
    expect(row?.className).toContain('max-canvas-mobile:h-11');
  });

  /** Layout box 800 high; the sheet (420 high) rests 64 px above its bottom. Transforms do not count. */
  function stubSheetGeometry() {
    const isSheet = (el: HTMLElement) => el.matches('section.sidebar-panel');
    const isLayout = (el: HTMLElement) => el.classList.contains('canvas-editor-layout');
    const spies = [
      vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (
        this: HTMLElement
      ) {
        return isSheet(this) ? this.closest('.canvas-editor-layout') : null;
      }),
      vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
        this: HTMLElement
      ) {
        return isSheet(this) ? 316 : 0;
      }),
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
        this: HTMLElement
      ) {
        return isSheet(this) ? 420 : 0;
      }),
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
        this: HTMLElement
      ) {
        return isLayout(this) ? 800 : 0;
      }),
    ];
    return () => spies.forEach((spy) => spy.mockRestore());
  }

  it('takes the closing sheet out of the flow at its resting place', () => {
    const restore = stubSheetGeometry();
    const { rerender } = render(<div className="canvas-editor-layout">{panel(true)}</div>);
    const sheet = screen.getByRole('region', { name: 'Text' });
    endTransition(sheet);
    expect(sheet.className).not.toMatch(/\babsolute\b/);
    expect(sheet.style.getPropertyValue('--sheet-rest-bottom')).toBe('64px');

    rerender(<div className="canvas-editor-layout">{panel(false)}</div>);
    expect(sheet).toHaveAttribute('data-state', 'closing');
    expect(sheet.className).toMatch(/\babsolute\b/);
    expect(sheet.className).toContain('bottom-[var(--sheet-rest-bottom,0px)]');
    restore();
  });

  it('knows its resting place when closed before the slide-in ends', () => {
    const restore = stubSheetGeometry();
    const { rerender } = render(<div className="canvas-editor-layout">{panel(true)}</div>);
    const sheet = screen.getByRole('region', { name: 'Text' });
    expect(sheet).toHaveAttribute('data-state', 'entering');

    rerender(<div className="canvas-editor-layout">{panel(false)}</div>);
    expect(sheet).toHaveAttribute('data-state', 'closing');
    expect(sheet.style.getPropertyValue('--sheet-rest-bottom')).toBe('64px');
    restore();
  });

  it('does not close the next tab when the tab changes during a drag close', () => {
    const onClose = vi.fn();
    const view = (title: string) => (
      <SidebarPanel isOpen title={title} onClose={onClose}>
        <p>{title}-Inhalt</p>
      </SidebarPanel>
    );
    const { rerender } = render(view('Text'));
    const sheet = screen.getByRole('region', { name: 'Text' });
    endTransition(sheet);
    const handle = sheet.querySelector('.sidebar-panel__drag-handle') as HTMLElement;

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(handle, { touches: [] });
    expect(sheet.style.transform).toBe('translateY(100%)');

    rerender(view('Uploads'));
    endTransition(sheet);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
    expect(screen.getByRole('region', { name: 'Uploads' })).toHaveAttribute('data-state', 'open');
  });

  it('renders desktop panel immediately', () => {
    setViewport(false);
    render(panel(true));
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
    expect(document.querySelector('[data-state]')).toBeNull();
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
