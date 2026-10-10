import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadDataUrl } from '../../../utils/downloadFile';
import { mintProfilbildCanvas } from '../profilbildCanvas';
import { removeImageBackground } from '../../image-studio/services/imageEditingService';
import { composeProfilbild } from '../utils/composeProfilbild';

import ProfilbildPage from './ProfilbildPage';

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
vi.mock('../profilbildCanvas', () => ({
  mintProfilbildCanvas: vi.fn(),
}));
vi.mock('../../image-studio/canvasQuery', () => ({ seedCanvasQuery: vi.fn() }));
vi.mock('../../../utils/downloadFile', () => ({ downloadDataUrl: vi.fn() }));
vi.mock('../../../components/common/PageContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../utils/composeProfilbild', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  composeProfilbild: vi.fn(),
  loadImage: vi.fn((src: string) => Promise.resolve({ src, width: 600, height: 800 })),
}));

const mockRemove = vi.mocked(removeImageBackground);
const mockCompose = vi.mocked(composeProfilbild);
const CUTOUT = 'data:image/png;base64,CUT';

const renderPage = (state: unknown = null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: '/studio/profilbild', state }]}>
        <Routes>
          <Route path="/studio/profilbild" element={<ProfilbildPage />} />
          <Route path="/studio/canvas/:id" element={<div>canvas page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

const lastBackground = () => mockCompose.mock.calls.at(-1)?.[0].background;

describe('ProfilbildPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:orig');
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,OUT');
  });

  it('starts directly with a handed-over cut-out', async () => {
    renderPage({ cutoutDataUrl: CUTOUT });
    expect(await screen.findByRole('button', { name: 'Tanne' })).toBeTruthy();
    expect(screen.queryByText('upload')).toBeNull();
    expect(mockRemove).not.toHaveBeenCalled();
    await waitFor(() => expect(mockCompose).toHaveBeenCalled());
    expect(lastBackground()).toEqual({ kind: 'color', color: '#005538' });
  });

  it('uploads, removes the background and shows the swatches', async () => {
    mockRemove.mockResolvedValue({
      file: new File([], 'x'),
      objectUrl: 'blob:x',
      base64: CUTOUT,
    });
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    expect(await screen.findByRole('button', { name: 'Klee' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verlauf Tanne zu Klee' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eigenes Bild' })).toBeTruthy();
  });

  it('re-renders with the clicked swatch and marks it pressed', async () => {
    renderPage({ cutoutDataUrl: CUTOUT });
    const klee = await screen.findByRole('button', { name: 'Klee' });
    await waitFor(() => expect(mockCompose).toHaveBeenCalled());
    fireEvent.click(klee);
    expect(klee.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Tanne' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(lastBackground()).toEqual({ kind: 'color', color: '#46962b' });

    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    expect(lastBackground()).toMatchObject({ kind: 'gradient' });
  });

  it('applies the size slider', async () => {
    renderPage({ cutoutDataUrl: CUTOUT });
    fireEvent.change(await screen.findByLabelText(/Größe/), { target: { value: '100' } });
    await waitFor(() => expect(mockCompose.mock.calls.at(-1)?.[0].scale).toBe(1));
  });

  it('downloads the composed image as profilbild.png', async () => {
    renderPage({ cutoutDataUrl: CUTOUT });
    const button = await screen.findByRole('button', { name: 'Herunterladen' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/png;base64,OUT', 'profilbild.png');
  });

  it('hands the chosen colour to the canvas', async () => {
    vi.mocked(mintProfilbildCanvas).mockResolvedValue({ id: 'c1' } as never);
    renderPage({ cutoutDataUrl: CUTOUT });
    fireEvent.click(await screen.findByRole('button', { name: 'Himmel' }));
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    expect(await screen.findByText('canvas page')).toBeTruthy();
    expect(mintProfilbildCanvas).toHaveBeenCalledWith(CUTOUT, 'Profilbild', '#0088cc');
  });

  it('returns to the upload on "Anderes Foto"', async () => {
    renderPage({ cutoutDataUrl: CUTOUT });
    fireEvent.click(await screen.findByRole('button', { name: 'Anderes Foto' }));
    expect(await screen.findByText('upload')).toBeTruthy();
  });
});
