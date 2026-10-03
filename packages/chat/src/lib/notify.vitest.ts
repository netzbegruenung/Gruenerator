import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

import { notifyError, notifyWarning } from './notify';

const sonnerToast = { error: vi.fn(), warning: vi.fn() };
vi.mock('sonner', () => ({ toast: sonnerToast }));

describe('notify', () => {
  afterEach(() => {
    useChatConfigStore.getState().configure();
    vi.clearAllMocks();
  });

  it('routes to the host notify hook instead of sonner when one is configured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notify = vi.fn();
    useChatConfigStore.getState().configure({ notify });

    notifyWarning('Websuche eingeschränkt');
    notifyError('Export fehlgeschlagen', 'Bitte erneut versuchen.');
    await new Promise((r) => setTimeout(r, 0));

    expect(notify.mock.calls).toEqual([
      ['warning', 'Websuche eingeschränkt', undefined],
      ['error', 'Export fehlgeschlagen', 'Bitte erneut versuchen.'],
    ]);
    expect(sonnerToast.warning).not.toHaveBeenCalled();
    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('falls back to sonner without a host hook', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    notifyWarning('Websuche eingeschränkt');
    await vi.waitFor(() =>
      expect(sonnerToast.warning).toHaveBeenCalledWith('Websuche eingeschränkt', undefined)
    );
  });
});
