// SPDX-License-Identifier: MPL-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('editorToast seam', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('is a silent no-op until a host registers an implementation', async () => {
    vi.resetModules();
    const { toast } = await import('@ggraphic/editor/utils/editorToast');
    expect(() => toast('Bild gelöscht', { duration: 10 })).not.toThrow();
    expect(() => toast.error('Fehler')).not.toThrow();
  });

  it('forwards calls and options to the registered implementation', async () => {
    vi.resetModules();
    const { toast, registerToast } = await import('@ggraphic/editor/utils/editorToast');
    const impl = Object.assign(vi.fn(), { error: vi.fn() });
    registerToast(impl);
    const action = { label: 'Rückgängig', onClick: vi.fn() };
    toast('Bild gelöscht', { duration: 5, action });
    toast.error('Fehler');
    expect(impl).toHaveBeenCalledWith('Bild gelöscht', { duration: 5, action });
    expect(impl.error).toHaveBeenCalledWith('Fehler');
  });
});
