import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { downloadDataUrl } from '../../../utils/downloadFile';
import { fileToDownscaledDataUrl } from '../../image-studio/bild-editor-v2/useBildEditorV2';
import { removeImageBackground } from '../../image-studio/services/imageEditingService';
import { mintProfilbildCanvas } from '../profilbildCanvas';
import { setProfilbildHandoff, PROFILBILD_HANDOFF_STATE } from '../profilbildHandoff';
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
vi.mock('../../image-studio/bild-editor-v2/useBildEditorV2', () => ({
  fileToDownscaledDataUrl: vi.fn(),
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
  trimCutout: vi.fn((image: unknown) => ({ image, dataUrl: 'data:image/png;base64,TRIM' })),
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

const renderHandoff = () => {
  setProfilbildHandoff(CUTOUT);
  return renderPage(PROFILBILD_HANDOFF_STATE);
};

const lastBackground = () => mockCompose.mock.calls.at(-1)?.[0].background;

describe('ProfilbildPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileToDownscaledDataUrl).mockResolvedValue('data:image/jpeg;base64,SMALL');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }))
    );
    URL.createObjectURL = vi.fn(() => 'blob:orig');
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,OUT');
  });

  it('starts directly with a handed-over cut-out', async () => {
    renderHandoff();
    expect(await screen.findByRole('button', { name: 'Tanne' })).toBeTruthy();
    expect(screen.queryByText('upload')).toBeNull();
    expect(mockRemove).not.toHaveBeenCalled();
    await waitFor(() => expect(mockCompose).toHaveBeenCalled());
    expect(lastBackground()).toEqual({ kind: 'color', color: '#005538' });
  });

  it('falls back to the upload when the handoff slot is empty (reload)', async () => {
    renderPage(PROFILBILD_HANDOFF_STATE);
    expect(await screen.findByText('upload')).toBeTruthy();
  });

  it('takes the handoff only once', async () => {
    setProfilbildHandoff(CUTOUT);
    const first = renderPage(PROFILBILD_HANDOFF_STATE);
    await screen.findByRole('button', { name: 'Tanne' });
    first.unmount();
    renderPage(PROFILBILD_HANDOFF_STATE);
    expect(await screen.findByText('upload')).toBeTruthy();
  });

  it('downscales the photo before removing the background', async () => {
    mockRemove.mockResolvedValue({ file: new File([], 'x'), objectUrl: 'blob:x', base64: CUTOUT });
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    await screen.findByRole('button', { name: 'Klee' });
    expect(fileToDownscaledDataUrl).toHaveBeenCalledTimes(1);
    expect(mockRemove.mock.calls[0]?.[0].name).toBe('a.png');
  });

  it('hints that gradients do not reach the canvas', async () => {
    renderHandoff();
    await screen.findByRole('button', { name: 'Tanne' });
    expect(screen.queryByText(/Verläufe und eigene Hintergründe/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    expect(
      screen.getByText(/Verläufe und eigene Hintergründe übernimmt der Canvas nicht/)
    ).toBeTruthy();
  });

  it('has no axe violations in the editor', async () => {
    const { container } = renderHandoff();
    await screen.findByRole('button', { name: 'Tanne' });
    expect(await axe(container)).toHaveNoViolations();
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
    renderHandoff();
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
    renderHandoff();
    fireEvent.change(await screen.findByLabelText(/Größe/), { target: { value: '100' } });
    await waitFor(() => expect(mockCompose.mock.calls.at(-1)?.[0].scale).toBe(1));
  });

  it('downloads the composed image as profilbild.png', async () => {
    renderHandoff();
    const button = await screen.findByRole('button', { name: 'Herunterladen' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/png;base64,OUT', 'profilbild.png');
  });

  it('hands the chosen colour to the canvas', async () => {
    vi.mocked(mintProfilbildCanvas).mockResolvedValue({ id: 'c1' } as never);
    renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Himmel' }));
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    expect(await screen.findByText('canvas page')).toBeTruthy();
    const [url, title, color, layout] = vi.mocked(mintProfilbildCanvas).mock.calls[0] ?? [];
    expect([url, title, color]).toEqual(['data:image/png;base64,TRIM', 'Profilbild', '#0088cc']);
    expect(layout?.imageSize.w).toBeGreaterThan(0);
    expect(layout?.imagePosition.y).toBeGreaterThanOrEqual(0);
  });

  it('previews round by default and toggles to square without changing the download', async () => {
    renderHandoff();
    const preview = await screen.findByRole('img', { name: 'Vorschau des Profilbilds' });
    expect(preview.className).toContain('rounded-full');
    expect(screen.getByText(/Vorschau rund wie in sozialen Netzwerken/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rund' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Quadrat' }));
    expect(preview.className).not.toContain('rounded-full');
    expect(screen.getByRole('button', { name: 'Quadrat' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'Rund' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/Der Download bleibt quadratisch/)).toBeTruthy();
    expect((preview as HTMLCanvasElement).width).toBe(1080);
    expect((preview as HTMLCanvasElement).height).toBe(1080);
  });

  it('returns to the upload on "Anderes Foto"', async () => {
    renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Anderes Foto' }));
    expect(await screen.findByText('upload')).toBeTruthy();
  });
});
