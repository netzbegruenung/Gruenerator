import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { outpaintImage } from '../../image-studio/services/imageEditingService';

import BildErweiternPage from './BildErweiternPage';

vi.mock('@gruenerator/ui', async () => {
  const actual = await vi.importActual('@gruenerator/ui');
  return {
    ...actual,
    UploadZone: ({ onFileSelected }: { onFileSelected: (f: File) => void }) => (
      <button
        type="button"
        onClick={() => onFileSelected(new File(['x'], 'a.png', { type: 'image/png' }))}
      >
        upload
      </button>
    ),
  };
});
vi.mock('../../image-studio/services/imageEditingService', () => ({
  outpaintImage: vi.fn(),
}));
vi.mock('../../image-studio/bild-editor-v2/canvasHandoff', () => ({
  mintCanvasFromImage: vi.fn(),
}));
vi.mock('../../../components/common/PageContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockOutpaint = vi.mocked(outpaintImage);

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BildErweiternPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

class FakeImage {
  naturalWidth = 2000;
  naturalHeight = 1000;
  onload: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const uploadAndLoad = async () => {
  fireEvent.click(screen.getByText('upload'));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Erweitern' }) as HTMLButtonElement).disabled).toBe(
      false
    )
  );
};

describe('BildErweiternPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:orig');
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('Image', FakeImage);
  });

  it('shows preview and format chips after upload', async () => {
    renderPage();
    await uploadAndLoad();
    expect(screen.getByTestId('outpaint-frame')).toBeTruthy();
    expect(screen.getAllByRole('radio', { name: /^\d+:\d+$/ }).length).toBeGreaterThan(1);
  });

  it('calls outpaintImage with the chosen format and label, then shows the result', async () => {
    mockOutpaint.mockResolvedValue('data:image/png;base64,AA');
    renderPage();
    await uploadAndLoad();
    fireEvent.click(screen.getByRole('radio', { name: '16:9' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Nur „KI-Generiert"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erweitern' }));
    expect(await screen.findByRole('button', { name: 'Herunterladen' })).toBeTruthy();
    expect(mockOutpaint).toHaveBeenCalledWith(expect.any(File), '16:9', 'short');
  });

  it('maps 429 to the budget message and retries', async () => {
    mockOutpaint.mockRejectedValueOnce({ response: { status: 429 } });
    mockOutpaint.mockResolvedValueOnce('data:image/png;base64,AA');
    renderPage();
    await uploadAndLoad();
    fireEvent.click(screen.getByRole('button', { name: 'Erweitern' }));
    expect(await screen.findByText('Dein Bild-Budget für heute ist aufgebraucht.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(mockOutpaint).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Herunterladen' })).toBeTruthy();
  });
});
