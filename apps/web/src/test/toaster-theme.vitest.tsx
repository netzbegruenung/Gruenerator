// Die vier Kontrastkorrekturen in packages/ui/src/components/sonner.tsx gelten
// nur für sonners HELLEN Satz. Inline gesetzte Custom Properties gewinnen aber
// in beiden Sätzen — im dunklen läge die korrigierte dunkle Schrift dann auf
// sonners fast schwarzem Grund (Erfolg `hsl(150, 100%, 6%)`). Dieser Test hält
// die Fallunterscheidung fest, inklusive `system`, wo das Betriebssystem
// entscheidet und nicht die Vorgabe.
import { Toaster, toast } from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const RICH_COLOR_TEXT = ['--success-text', '--info-text', '--warning-text', '--error-text'];

// sonner rendert die Liste erst, wenn ein Hinweis ansteht (`if
// (!filteredToasts.length) return null`) — ohne Toast gibt es nichts zu messen.
async function renderToasterWithToast(theme: 'light' | 'dark' | 'system', message: string) {
  render(<Toaster richColors theme={theme} />);
  toast.success(message);
  await screen.findByText(message);
  const list = document.querySelector('[data-sonner-toaster]');
  if (!(list instanceof HTMLElement)) throw new Error('sonner hat keine Toaster-Liste gerendert');
  return list;
}

const realMatchMedia = window.matchMedia;

function stubOsTheme(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-color-scheme: dark') ? dark : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
  toast.dismiss();
});

describe('Toaster: die hellen Kontrastkorrekturen bleiben im hellen Satz', () => {
  it('hell setzt die korrigierten Schriftfarben', async () => {
    const list = await renderToasterWithToast('light', 'Hell');

    expect(list.dataset.sonnerTheme).toBe('light');
    expect(list.style.getPropertyValue('--success-text')).toBe('hsl(140, 100%, 25.5%)');
    expect(list.style.getPropertyValue('--warning-text')).toBe('hsl(31, 92%, 35.5%)');
  });

  it('dunkel setzt keine davon — sonners eigener dunkler Satz greift', async () => {
    const list = await renderToasterWithToast('dark', 'Dunkel');

    expect(list.dataset.sonnerTheme).toBe('dark');
    for (const property of RICH_COLOR_TEXT) {
      expect(list.style.getPropertyValue(property)).toBe('');
    }
  });

  it('system auf einem dunklen Betriebssystem verhält sich wie dunkel', async () => {
    stubOsTheme(true);
    const list = await renderToasterWithToast('system', 'System dunkel');

    expect(list.dataset.sonnerTheme).toBe('dark');
    for (const property of RICH_COLOR_TEXT) {
      expect(list.style.getPropertyValue(property)).toBe('');
    }
  });

  it('system auf einem hellen Betriebssystem behält die Korrekturen', async () => {
    stubOsTheme(false);
    const list = await renderToasterWithToast('system', 'System hell');

    expect(list.dataset.sonnerTheme).toBe('light');
    expect(list.style.getPropertyValue('--success-text')).toBe('hsl(140, 100%, 25.5%)');
  });

  it('der Rand bleibt eine Farbe, keine Rand-Kurzschreibweise', async () => {
    const list = await renderToasterWithToast('light', 'Rand');

    expect(list.style.getPropertyValue('--normal-border')).toBe(
      'var(--border, var(--border-color))'
    );
  });
});
