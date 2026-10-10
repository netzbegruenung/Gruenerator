import { UploadZone } from '@gruenerator/ui';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const accept = { 'image/*': [] as string[] };

function drop(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('UploadZone onError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports oversize files through onError, not alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onError = vi.fn();
    const onFileSelected = vi.fn();
    const { container } = render(
      <UploadZone accept={accept} maxSizeMB={1} onError={onError} onFileSelected={onFileSelected} />
    );
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    drop(container, big);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Die Datei ist zu groß (max. 1 MB).'));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('reports wrong file types through onError', async () => {
    const onError = vi.fn();
    const { container } = render(<UploadZone accept={accept} onError={onError} />);
    drop(container, new File(['x'], 'a.txt', { type: 'text/plain' }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Dieses Dateiformat wird nicht unterstützt.')
    );
  });

  it('asks for a single file when several are dropped', async () => {
    const onError = vi.fn();
    const { container } = render(<UploadZone accept={accept} onError={onError} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const png = (name: string) => new File(['x'], name, { type: 'image/png' });
    fireEvent.change(input, { target: { files: [png('a.png'), png('b.png')] } });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Bitte nur eine Datei auswählen.'));
  });

  it('rejects formats outside a narrowed accept list', async () => {
    const onError = vi.fn();
    const { container } = render(
      <UploadZone
        accept={{ 'image/jpeg': [], 'image/png': [], 'image/webp': [] }}
        onError={onError}
      />
    );
    drop(container, new File(['x'], 'a.heic', { type: 'image/heic' }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Dieses Dateiformat wird nicht unterstützt.')
    );
  });

  it('falls back to alert without onError', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { container } = render(<UploadZone accept={accept} maxSizeMB={1} />);
    drop(container, new File([new Uint8Array(2 * 1024 * 1024)], 'b.png', { type: 'image/png' }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  });
});
