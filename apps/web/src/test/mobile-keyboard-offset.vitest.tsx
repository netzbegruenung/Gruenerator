// `useMobileKeyboardOffset` misst die Tastatur nur noch am Visual Viewport.
// Früher setzte es auf Chromium `navigator.virtualKeyboard.overlaysContent =
// true` — seitenweit und ohne Rückbau. Dann schrumpft der Visual Viewport nicht
// mehr, und BlockNotes Mobile-Leiste (erkennt die Tastatur genau daran) blieb auf
// Android unsichtbar, sobald irgendein Composer auf der Seite gemountet war.
import { useMobileKeyboardOffset } from '@gruenerator/shared/hooks';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LAYOUT_HEIGHT = 800;
const KEYBOARD = 300;

class FakeVisualViewport extends EventTarget {
  height = LAYOUT_HEIGHT;
  offsetTop = 0;
}

let vp: FakeVisualViewport;
let virtualKeyboard: EventTarget & { overlaysContent: boolean };

function offset() {
  return document.documentElement.style.getPropertyValue('--mobile-keyboard-offset');
}

function openKeyboard() {
  vp.height = LAYOUT_HEIGHT - KEYBOARD;
  vp.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
  vp = new FakeVisualViewport();
  virtualKeyboard = Object.assign(new EventTarget(), { overlaysContent: false });
  Object.defineProperty(window, 'visualViewport', { value: vp, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: LAYOUT_HEIGHT, configurable: true });
  Object.defineProperty(navigator, 'virtualKeyboard', {
    value: virtualKeyboard,
    configurable: true,
  });
  const matchMedia = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    query === '(pointer: coarse)'
      ? ({ ...matchMedia(query), matches: true } as MediaQueryList)
      : matchMedia(query)
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'virtualKeyboard');
  document.documentElement.style.removeProperty('--mobile-keyboard-offset');
});

function renderOffsetHook() {
  const element = document.createElement('div');
  const result = renderHook(() => {
    const ref = useRef(element);
    useMobileKeyboardOffset(ref);
  });
  return { element, ...result };
}

describe('useMobileKeyboardOffset', () => {
  it('lässt overlaysContent auch dort unangetastet, wo die VirtualKeyboard-API existiert', () => {
    renderOffsetHook();
    openKeyboard();

    expect(virtualKeyboard.overlaysContent).toBe(false);
  });

  it('veröffentlicht die Tastaturhöhe aus dem Visual Viewport auf :root und am Element', () => {
    const { element } = renderOffsetHook();
    openKeyboard();

    expect(offset()).toBe(`${KEYBOARD}px`);
    expect(element.style.getPropertyValue('--mobile-keyboard-offset')).toBe(`${KEYBOARD}px`);
  });

  it('zieht den vom Browser verschobenen Viewport-Anteil ab', () => {
    renderOffsetHook();
    vp.offsetTop = 100;
    openKeyboard();

    expect(offset()).toBe(`${KEYBOARD - 100}px`);
  });

  it('räumt die Variable auf :root beim Unmount ab', () => {
    const { unmount } = renderOffsetHook();
    openKeyboard();
    unmount();

    expect(offset()).toBe('');
  });

  it('tut auf Geräten ohne Touch nichts', () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList
    );
    renderOffsetHook();
    openKeyboard();

    expect(offset()).toBe('');
  });
});
