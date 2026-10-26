import { HOST_CAPABILITIES_GLOBAL } from '@gruenerator/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShareDropdown } from '../ShareDropdown';

/**
 * Androids System-WebView kennt kein `navigator.share` — in der App verschwand
 * „Teilen" deshalb ganz (#4393). Kündigt der Host an, dass er teilen kann,
 * muss der Knopf wieder da sein und über die Brücke teilen.
 */

const DATA_URL = 'data:image/png;base64,aGVsbG8=';

function renderDropdown() {
  return render(
    <ShareDropdown
      onCaptureCanvas={() => Promise.resolve(DATA_URL)}
      onDownload={() => {}}
      onNavigateToGallery={() => {}}
      canvasText="Hallo Welt"
      canvasType="dreizeilen"
      canvasWidth={1080}
      canvasHeight={1080}
      shareToken={null}
    />
  );
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Teilen' }));
}

const menu = () => within(screen.getByRole('dialog'));
const shareEntry = () => menu().queryByRole('button', { name: /^(Teilen|Geteilt!)$/ });

type HostWindow = Window & Record<string, unknown>;

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  delete (window as unknown as HostWindow).ReactNativeWebView;
  delete (window as unknown as HostWindow)[HOST_CAPABILITIES_GLOBAL];
});

describe('ShareDropdown im eingebetteten Modus ohne navigator.share', () => {
  it('blendet „Teilen" aus, wenn der Host nichts angekündigt hat (ältere App)', async () => {
    (window as unknown as HostWindow).ReactNativeWebView = { postMessage: vi.fn() };
    renderDropdown();
    await openMenu();
    expect(menu().getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(shareEntry()).toBeNull();
  });

  it('zeigt „Teilen" und schickt SHARE_FILE, wenn der Host teilen kann', async () => {
    const postMessage = vi.fn();
    (window as unknown as HostWindow).ReactNativeWebView = { postMessage };
    (window as unknown as HostWindow)[HOST_CAPABILITIES_GLOBAL] = ['share'];
    renderDropdown();
    await openMenu();

    const entry = shareEntry();
    expect(entry).not.toBeNull();
    await userEvent.click(entry!);

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(postMessage.mock.calls[0]![0] as string)).toEqual({
      type: 'SHARE_FILE',
      filename: 'gruenerator.png',
      mime: 'image/png',
      data: 'aGVsbG8=',
      title: 'Grünerator Share',
      text: 'Hallo Welt',
    });
  });
});
