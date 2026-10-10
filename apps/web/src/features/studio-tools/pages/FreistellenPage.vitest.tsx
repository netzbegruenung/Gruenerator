import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { removeImageBackground } from '../../image-studio/services/imageEditingService';

import FreistellenPage from './FreistellenPage';

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
  removeImageBackground: vi.fn(),
}));
vi.mock('../../image-studio/bild-editor-v2/canvasHandoff', () => ({
  mintCanvasFromImage: vi.fn(),
}));
vi.mock('../../../components/common/PageContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockRemove = vi.mocked(removeImageBackground);

const Probe = () => {
  const loc = useLocation();
  return <div data-testid="probe">{JSON.stringify(loc.state)}</div>;
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/studio/freistellen']}>
        <Routes>
          <Route path="/studio/freistellen" element={<FreistellenPage />} />
          <Route path="/studio/profilbild" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('FreistellenPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:orig');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows spinner, then the result', async () => {
    let resolve!: (v: never) => void;
    mockRemove.mockReturnValue(new Promise((r) => (resolve = r as never)));
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    expect(await screen.findByText('Hintergrund wird entfernt …')).toBeTruthy();
    resolve({
      file: new File([], 'x'),
      objectUrl: 'blob:x',
      base64: 'data:image/png;base64,AA',
    } as never);
    expect(await screen.findByRole('button', { name: 'Herunterladen' })).toBeTruthy();
  });

  it('shows an alert on error and retries', async () => {
    mockRemove.mockRejectedValueOnce(new Error('500'));
    mockRemove.mockResolvedValueOnce({
      file: new File([], 'x'),
      objectUrl: 'blob:x',
      base64: 'data:image/png;base64,AA',
    });
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await screen.findByRole('button', { name: 'Herunterladen' });
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  it('hands the cutout to the profilbild page', async () => {
    mockRemove.mockResolvedValue({
      file: new File([], 'x'),
      objectUrl: 'blob:x',
      base64: 'data:image/png;base64,AA',
    });
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    fireEvent.click(await screen.findByRole('button', { name: 'Als Profilbild verwenden' }));
    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe(
        JSON.stringify({ cutoutDataUrl: 'data:image/png;base64,AA' })
      )
    );
  });
});
