import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SLIDE_REFIT_EVENT, useAutoFitScale } from './useAutoFitScale.js';

const CAPACITY = 540;

/**
 * jsdom has no layout engine (and no FontFaceSet or IntersectionObserver), so
 * the surrounding APIs are modelled here. Layout is driven from a model rather
 * than stubbed flat: `scrollHeight` reflects whatever `--gs-font-scale` the hook
 * last wrote, so the probe loop is exercised for real — measure, write a step,
 * measure again against the new value.
 *
 * What this cannot cover, by construction: that the hook measures the *right*
 * box, and how real font metrics shift the outcome. Those need a browser.
 */
function stubLayout(natural: number, capacity = CAPACITY): void {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => capacity,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const raw = this.style.getPropertyValue('--gs-font-scale');
      return Math.round(natural * Number(raw || 1));
    },
  });
}

interface FontsStub {
  ready: Promise<void>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  emit: (type: string) => void;
}

let fonts: FontsStub;
let observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[];

beforeEach(() => {
  // Run scheduled re-fits synchronously so assertions need no timers.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  const handlers = new Map<string, EventListener[]>();
  fonts = {
    ready: Promise.resolve(),
    addEventListener: vi.fn((type: string, fn: EventListener) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => {
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((f) => f !== fn)
      );
    }),
    emit: (type: string) => (handlers.get(type) ?? []).forEach((fn) => fn(new Event(type))),
  };
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });

  observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(document, 'fonts');
});

function Surface({ enabled, contentKey }: { enabled: boolean; contentKey: string }) {
  const { ref, scale } = useAutoFitScale(enabled, contentKey);
  return <div ref={ref} data-testid="surface" data-scale={String(scale)} />;
}

function surface(): HTMLElement {
  return screen.getByTestId('surface');
}

describe('useAutoFitScale', () => {
  it('shrinks to the largest fitting step and writes it to the element', () => {
    stubLayout(700); // needs <= 0.771 of full size → 0.7
    render(<Surface enabled contentKey="a" />);
    expect(surface().dataset.scale).toBe('0.7');
    expect(surface().style.getPropertyValue('--gs-font-scale')).toBe('0.7');
  });

  it('leaves content that fits at full size', () => {
    stubLayout(400);
    render(<Surface enabled contentKey="a" />);
    expect(surface().dataset.scale).toBe('1');
  });

  it('does not measure at all when disabled (an explicit preset is set)', () => {
    stubLayout(5000);
    render(<Surface enabled={false} contentKey="a" />);
    expect(surface().dataset.scale).toBe('1');
    expect(surface().style.getPropertyValue('--gs-font-scale')).toBe('');
  });

  it('skips a surface that has no layout — reveal hides non-current slides', () => {
    stubLayout(5000, 0); // display:none measures 0
    render(<Surface enabled contentKey="a" />);
    expect(surface().dataset.scale).toBe('1');
    expect(surface().style.getPropertyValue('--gs-font-scale')).toBe('');
  });

  it('re-fits when the slide content changes', () => {
    stubLayout(700);
    const { rerender } = render(<Surface enabled contentKey="a" />);
    expect(surface().dataset.scale).toBe('0.7');
    stubLayout(400);
    rerender(<Surface enabled contentKey="b" />);
    expect(surface().dataset.scale).toBe('1');
  });

  it('re-fits once the webfonts have loaded', async () => {
    stubLayout(400);
    render(<Surface enabled contentKey="a" />);
    expect(surface().dataset.scale).toBe('1');
    // The CI faces land after the first measurement and are taller.
    stubLayout(700);
    await act(async () => {
      await fonts.ready;
    });
    expect(surface().dataset.scale).toBe('0.7');
  });

  it('re-fits on loadingdone — KaTeX faces load after fonts.ready resolves', () => {
    stubLayout(400);
    render(<Surface enabled contentKey="a" />);
    stubLayout(900);
    act(() => fonts.emit('loadingdone'));
    expect(surface().dataset.scale).toBe('0.6');
  });

  it('removes the global font listener on unmount', () => {
    // document.fonts is global and every mounted slide subscribes to it, so a
    // leaked listener accumulates across a whole deck and every navigation.
    stubLayout(400);
    const { unmount } = render(<Surface enabled contentKey="a" />);
    const registered = fonts.addEventListener.mock.calls.find(([t]) => t === 'loadingdone');
    expect(registered).toBeDefined();
    unmount();
    expect(fonts.removeEventListener).toHaveBeenCalledWith('loadingdone', registered?.[1]);
  });

  it('re-fits when reveal reveals the slide, and disconnects on unmount', () => {
    stubLayout(400);
    const { unmount } = render(<Surface enabled contentKey="a" />);
    expect(observers).toHaveLength(1);
    stubLayout(700);
    act(() => {
      observers[0]?.callback(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the hook only reads isIntersecting
        } as any
      );
    });
    expect(surface().dataset.scale).toBe('0.7');
    unmount();
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });
});

/**
 * The PDF export path. Until reveal's PrintView has rebuilt the deck, every
 * slide but the current one is display:none and measures 0, and none of the
 * passive triggers above can recover it: the contentKey effect ran at mount,
 * fonts.ready is one-shot, and the IntersectionObserver is viewport-rooted so
 * it never fires for slides in a print stack nobody scrolls. Without the
 * broadcast, slides 2..N stay at scale 1 and `.gruene-slide { overflow: hidden }`
 * clips them — silently, in the PDF.
 */
describe('SLIDE_REFIT_EVENT', () => {
  it('re-fits a surface that measured 0 while it was hidden', () => {
    stubLayout(700, 0); // reveal keeps non-current slides display:none
    render(<Surface enabled contentKey="a" />);
    expect(surface().dataset.scale).toBe('1');

    stubLayout(700); // PrintView made every section visible
    act(() => {
      window.dispatchEvent(new Event(SLIDE_REFIT_EVENT));
    });
    expect(surface().dataset.scale).toBe('0.7');
  });

  it('fits synchronously during dispatch, without waiting for a frame', () => {
    // The listener binds `fit`, not `schedule`. PresentMode relies on this: it
    // dispatches and then calls window.print() with no rAF in between on the
    // fallback path, so a deferred fit would print the unfitted scale.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    stubLayout(700, 0);
    render(<Surface enabled contentKey="a" />);
    stubLayout(700);
    act(() => {
      window.dispatchEvent(new Event(SLIDE_REFIT_EVENT));
    });
    expect(surface().style.getPropertyValue('--gs-font-scale')).toBe('0.7');
  });

  it('ignores the broadcast when disabled — an explicit preset wins', () => {
    stubLayout(5000);
    render(<Surface enabled={false} contentKey="a" />);
    act(() => {
      window.dispatchEvent(new Event(SLIDE_REFIT_EVENT));
    });
    expect(surface().dataset.scale).toBe('1');
    expect(surface().style.getPropertyValue('--gs-font-scale')).toBe('');
  });

  it('unsubscribes on unmount — the listener is global, one per slide', () => {
    stubLayout(400);
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Surface enabled contentKey="a" />);
    unmount();
    expect(remove).toHaveBeenCalledWith(SLIDE_REFIT_EVENT, expect.any(Function));
    // A late broadcast must not resurrect the unmounted surface.
    expect(() => window.dispatchEvent(new Event(SLIDE_REFIT_EVENT))).not.toThrow();
  });
});
