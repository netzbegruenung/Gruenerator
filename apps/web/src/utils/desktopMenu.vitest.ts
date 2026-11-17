import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createDesktopMenuHandler,
  DESKTOP_MENU_EVENTS,
  nextZoom,
  type DesktopMenuActions,
} from './desktopMenu';

function fakeActions() {
  return {
    newChat: vi.fn(),
    openSettings: vi.fn(),
    reload: vi.fn(),
    setZoom: vi.fn((_scale: number) => Promise.resolve()),
    openUrl: vi.fn((_url: string) => Promise.resolve()),
    showAbout: vi.fn(() => Promise.resolve()),
    checkForUpdates: vi.fn(() => Promise.resolve()),
  } satisfies DesktopMenuActions;
}

describe('desktop menu', () => {
  it('listens to every event the Rust menu emits', () => {
    const rust = readFileSync(resolve(__dirname, '../../../desktop/src-tauri/src/lib.rs'), 'utf8');
    const emitted = new Set([...rust.matchAll(/emit\("(menu-[a-z-]+)"/g)].map((m) => m[1]));
    expect([...emitted].sort()).toEqual([...DESKTOP_MENU_EVENTS].sort());
  });

  it('opens the settings dialog on menu-settings', async () => {
    const actions = fakeActions();
    await createDesktopMenuHandler(actions)('menu-settings', null);
    expect(actions.openSettings).toHaveBeenCalledOnce();
  });

  it('steps the zoom and clamps it', async () => {
    const actions = fakeActions();
    const handle = createDesktopMenuHandler(actions);
    await handle('menu-zoom', 'in');
    await handle('menu-zoom', 'in');
    expect(actions.setZoom).toHaveBeenLastCalledWith(1.2);
    await handle('menu-zoom', 'reset');
    expect(actions.setZoom).toHaveBeenLastCalledWith(1);
    expect(nextZoom(2, 'in')).toBe(2);
    expect(nextZoom(0.5, 'out')).toBe(0.5);
    expect(nextZoom(1, 'sideways')).toBeNull();
  });

  it('keeps the zoom level when setting it fails', async () => {
    const actions = fakeActions();
    actions.setZoom.mockRejectedValueOnce(new Error('denied'));
    const handle = createDesktopMenuHandler(actions);
    await expect(handle('menu-zoom', 'in')).rejects.toThrow('denied');
    await handle('menu-zoom', 'in');
    expect(actions.setZoom).toHaveBeenLastCalledWith(1.1);
  });

  it('opens only https links', async () => {
    const actions = fakeActions();
    const handle = createDesktopMenuHandler(actions);
    await handle('menu-open-url', 'https://gruenerator.de/');
    await handle('menu-open-url', 'file:///etc/passwd');
    expect(actions.openUrl).toHaveBeenCalledExactlyOnceWith('https://gruenerator.de/');
  });
});
