import { afterEach, describe, expect, it, vi } from 'vitest';

type FakeFonts = EventTarget & { status: 'loading' | 'loaded'; ready: Promise<void> };

let settle: () => void = () => {};

function installFonts(status: FakeFonts['status']): FakeFonts {
  const fonts = new EventTarget() as FakeFonts;
  fonts.status = status;
  fonts.ready = new Promise<void>((resolve) => {
    settle = resolve;
  });
  Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
  return fonts;
}

async function loadHook() {
  vi.resetModules();
  const { renderHook } = await import('@testing-library/react');
  const { useFontGeneration } = await import('../useFontGeneration');
  return renderHook(() => useFontGeneration());
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  settle();
});

describe('useFontGeneration', () => {
  it('counts a load that WebKit only reports through `ready` (#4400)', async () => {
    const fonts = installFonts('loaded');
    const { result } = await loadHook();

    fonts.dispatchEvent(new Event('loading'));
    settle();
    await flush();

    expect(result.current).toBe(1);
  });

  it('counts a load once when both `loadingdone` and `ready` report it', async () => {
    const fonts = installFonts('loaded');
    const { result } = await loadHook();

    fonts.dispatchEvent(new Event('loading'));
    fonts.dispatchEvent(new Event('loadingdone'));
    settle();
    await flush();

    expect(result.current).toBe(1);
  });

  it('counts a load that started before the module was imported', async () => {
    installFonts('loading');
    const { result } = await loadHook();

    settle();
    await flush();

    expect(result.current).toBe(1);
  });
});
