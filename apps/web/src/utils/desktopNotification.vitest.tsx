import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isDesktopApp: vi.fn(),
  isFocused: vi.fn(),
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
  prefs: {} as Record<string, boolean>,
}));

vi.mock('./platform', () => ({ isDesktopApp: mocks.isDesktopApp }));
vi.mock('./tauriWindow', () => ({
  getSafeCurrentWindow: async () => ({ isFocused: mocks.isFocused }),
}));
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: mocks.isPermissionGranted,
  requestPermission: mocks.requestPermission,
  sendNotification: mocks.sendNotification,
}));
vi.mock('../hooks/useUserDefaults', () => ({
  default: () => ({ get: (key: string, fallback: boolean) => mocks.prefs[key] ?? fallback }),
}));

describe('desktop notifications', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.prefs = {};
    mocks.isDesktopApp.mockReturnValue(true);
    mocks.isFocused.mockResolvedValue(false);
    mocks.isPermissionGranted.mockResolvedValue(true);
  });

  it('does not notify on web', async () => {
    mocks.isDesktopApp.mockReturnValue(false);
    const { notifyDesktop } = await import('./desktopNotification');
    await notifyDesktop('reel');
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('does not notify while the window is focused', async () => {
    mocks.isFocused.mockResolvedValue(true);
    const { notifyDesktop } = await import('./desktopNotification');
    await notifyDesktop('reel');
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('notifies when the desktop window is unfocused', async () => {
    const { notifyDesktop } = await import('./desktopNotification');
    await notifyDesktop('transcription');
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Transkription fertig' })
    );
  });

  it('requests permission and skips when denied', async () => {
    mocks.isPermissionGranted.mockResolvedValue(false);
    mocks.requestPermission.mockResolvedValue('denied');
    const { notifyDesktop } = await import('./desktopNotification');
    await notifyDesktop('reel');
    expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it('hook notifies by default and respects an explicit opt-out', async () => {
    const { useDesktopNotify } = await import('./desktopNotification');
    const { result } = renderHook(() => useDesktopNotify());
    result.current('sharepic');
    await vi.waitFor(() => expect(mocks.sendNotification).toHaveBeenCalledTimes(1));

    mocks.prefs = { desktop_sharepic: false };
    const off = renderHook(() => useDesktopNotify());
    off.result.current('sharepic');
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });
});
