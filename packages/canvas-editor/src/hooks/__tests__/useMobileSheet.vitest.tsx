import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarPanel } from '../../sidebar/SidebarPanel';
import { useMobileSheet } from '../useMobileSheet';

function setMobileViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderSheet(onClose: () => void) {
  render(
    <SidebarPanel isOpen title="Text" onClose={onClose}>
      <p>Inhalt</p>
    </SidebarPanel>
  );
  const sheet = screen.getByRole('region', { name: 'Text' });
  const handle = sheet.querySelector('.sidebar-panel__drag-handle') as HTMLElement;
  return { sheet, handle };
}

/** jsdom has no TransitionEvent; the hook only reads `propertyName`. */
function endTransition(el: Element, propertyName = 'transform') {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  fireEvent(el, event);
}

function contentOf(sheet: HTMLElement) {
  return sheet.querySelector('.sidebar-panel__content') as HTMLElement;
}

function Harness({ onClose, onDragClosed }: { onClose: () => void; onDragClosed: () => void }) {
  const { handleRef, sheetRef, contentRef } = useMobileSheet({
    isOpen: true,
    onClose,
    onDragClosed,
  });
  return (
    <section ref={sheetRef} data-testid="sheet">
      <div ref={handleRef} data-testid="handle" />
      <div ref={contentRef} />
    </section>
  );
}

describe('useMobileSheet', () => {
  beforeEach(setMobileViewport);

  it('zieht das Sheet ohne Render mit und federt unter der Schwelle zurück', () => {
    const onClose = vi.fn();
    const { sheet, handle } = renderSheet(onClose);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 150 }] });
    expect(sheet.style.transform).toBe('translateY(50px)');

    now.mockReturnValue(1000);
    fireEvent.touchEnd(handle, { touches: [] });
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
    expect(sheet.style.transition).toContain('transform 200ms');
    now.mockRestore();
  });

  it('schließt über der Schwelle', () => {
    const onClose = vi.fn();
    const { sheet, handle } = renderSheet(onClose);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] });
    now.mockReturnValue(1000);
    fireEvent.touchEnd(handle, { touches: [] });
    endTransition(sheet);
    expect(onClose).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('closes on a fast flick at the end of a slow drag', () => {
    const onClose = vi.fn();
    const { sheet, handle } = renderSheet(onClose);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    now.mockReturnValue(1000);
    fireEvent.touchMove(handle, { touches: [{ clientY: 160 }] });
    now.mockReturnValue(1020);
    fireEvent.touchMove(handle, { touches: [{ clientY: 190 }] });
    fireEvent.touchEnd(handle, { touches: [] });
    // 90 px is under the threshold and 90/1020 px/ms is slow on average; the
    // last 20 ms ran at 1.5 px/ms.
    expect(sheet.style.transform).toBe('translateY(100%)');
    endTransition(sheet);
    expect(onClose).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('drags from the title row', () => {
    const { sheet } = renderSheet(vi.fn());
    const title = screen.getByRole('heading', { name: 'Text' });

    fireEvent.touchStart(title, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(title, { touches: [{ clientY: 140 }] });
    expect(sheet.style.transform).toBe('translateY(40px)');
  });

  it('keeps a tap on the close button a tap', () => {
    const onClose = vi.fn();
    const { sheet } = renderSheet(onClose);
    const button = screen.getByRole('button', { name: 'Text schließen' });

    fireEvent.touchStart(button, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(button, { touches: [{ clientY: 103 }] });
    fireEvent.touchEnd(button, { touches: [] });
    expect(sheet.style.transform).toBe('');
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drags from content at the top', () => {
    const onClose = vi.fn();
    const { sheet } = renderSheet(onClose);
    const content = contentOf(sheet);
    Object.defineProperty(content, 'scrollTop', { value: 0, configurable: true });

    fireEvent.touchStart(content, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(content, { touches: [{ clientY: 220 }] });
    expect(sheet.style.transform).toBe('translateY(120px)');
    fireEvent.touchEnd(content, { touches: [] });
    endTransition(sheet);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('scrolls content instead of dragging while scrolled', () => {
    const onClose = vi.fn();
    const { sheet } = renderSheet(onClose);
    const content = contentOf(sheet);
    Object.defineProperty(content, 'scrollTop', { value: 40, configurable: true });

    fireEvent.touchStart(content, { touches: [{ clientY: 100 }] });
    const move = fireEvent.touchMove(content, { touches: [{ clientY: 220 }] });
    expect(move).toBe(true); // not default-prevented: the browser scrolls
    fireEvent.touchEnd(content, { touches: [] });
    expect(sheet.style.transform).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets content scroll on an upward move at the top', () => {
    const { sheet } = renderSheet(vi.fn());
    const content = contentOf(sheet);
    Object.defineProperty(content, 'scrollTop', { value: 0, configurable: true });

    fireEvent.touchStart(content, { touches: [{ clientY: 200 }] });
    const move = fireEvent.touchMove(content, { touches: [{ clientY: 150 }] });
    expect(move).toBe(true);
    fireEvent.touchMove(content, { touches: [{ clientY: 260 }] });
    expect(sheet.style.transform).toBe('');
  });
});

describe('useMobileSheet: robustness', () => {
  beforeEach(setMobileViewport);
  afterEach(() => vi.useRealTimers());

  it('keeps the drag with the first finger when a second one comes and goes', () => {
    const onClose = vi.fn();
    const { sheet, handle } = renderSheet(onClose);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);

    fireEvent.touchStart(handle, { touches: [{ identifier: 0, clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ identifier: 0, clientY: 180 }] });
    expect(sheet.style.transform).toBe('translateY(80px)');

    fireEvent.touchStart(handle, {
      touches: [
        { identifier: 0, clientY: 180 },
        { identifier: 1, clientY: 300 },
      ],
    });
    fireEvent.touchEnd(handle, {
      touches: [{ identifier: 0, clientY: 180 }],
      changedTouches: [{ identifier: 1, clientY: 300 }],
    });
    fireEvent.touchMove(handle, { touches: [{ identifier: 0, clientY: 190 }] });
    expect(sheet.style.transform).toBe('translateY(90px)');

    now.mockReturnValue(1000);
    fireEvent.touchEnd(handle, {
      touches: [],
      changedTouches: [{ identifier: 0, clientY: 190 }],
    });
    expect(sheet.style.transform).toBe('');
    expect(sheet.style.willChange).toBe('');
    expect(onClose).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('snaps back on touchcancel even past the threshold', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { sheet, handle } = renderSheet(onClose);

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 300 }] });
    fireEvent.touchCancel(handle, { touches: [] });
    expect(sheet.style.transform).toBe('');
    endTransition(sheet);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not take over from content that was scrolled at touchstart', () => {
    const { sheet } = renderSheet(vi.fn());
    const content = contentOf(sheet);
    Object.defineProperty(content, 'scrollTop', { value: 3, configurable: true });
    fireEvent.touchStart(content, { touches: [{ clientY: 100 }] });

    Object.defineProperty(content, 'scrollTop', { value: 0, configurable: true });
    const move = fireEvent.touchMove(content, { touches: [{ clientY: 220 }] });
    expect(move).toBe(true);
    expect(sheet.style.transform).toBe('');
  });
});

describe('useMobileSheet: drag close', () => {
  beforeEach(setMobileViewport);
  afterEach(() => vi.useRealTimers());

  it('slides out from where the finger left it', () => {
    const calls: string[] = [];
    const onClose = vi.fn(() => calls.push('close'));
    const onDragClosed = vi.fn(() => calls.push('dragClosed'));
    render(<Harness onClose={onClose} onDragClosed={onDragClosed} />);
    const sheet = screen.getByTestId('sheet');
    const handle = screen.getByTestId('handle');

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(handle, { touches: [] });

    expect(sheet.style.transform).toBe('translateY(100%)');
    expect(sheet.style.transition).toBe('transform 200ms var(--editor-ease-out)');
    expect(onDragClosed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    endTransition(sheet);
    expect(calls).toEqual(['dragClosed', 'close']);
    endTransition(sheet);
    expect(calls).toEqual(['dragClosed', 'close']);
  });

  it('finishes the drag close when transitionend never fires', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onDragClosed = vi.fn();
    render(<Harness onClose={onClose} onDragClosed={onDragClosed} />);
    const handle = screen.getByTestId('handle');

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(handle, { touches: [] });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(onDragClosed).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
