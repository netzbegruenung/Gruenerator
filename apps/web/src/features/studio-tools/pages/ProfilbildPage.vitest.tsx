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
import { composeProfilbild, renderProfilbildBackground } from '../utils/composeProfilbild';

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
vi.mock('react-konva', () => {
  const Node = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Stage: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="konva-stage">{children}</div>
    ),
    Layer: Node,
    Image: () => null,
    Rect: () => null,
    Line: () => null,
    Circle: () => null,
  };
});
vi.mock('../utils/composeProfilbild', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  composeProfilbild: vi.fn(() => ({ toDataURL: () => 'data:image/png;base64,OUT' })),
  renderProfilbildBackground: vi.fn(() => ({})),
  trimCutout: vi.fn((image: unknown) => ({ image, dataUrl: 'data:image/png;base64,TRIM' })),
  loadImage: vi.fn((src: string) => Promise.resolve({ src, width: 600, height: 800 })),
}));

const mockRemove = vi.mocked(removeImageBackground);
const mockCompose = vi.mocked(composeProfilbild);
const mockBackground = vi.mocked(renderProfilbildBackground);
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

const lastBackground = () => mockBackground.mock.calls.at(-1)?.[0];

const downloadAndGetCompose = async () => {
  const button = await screen.findByRole('button', { name: 'Herunterladen' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  mockCompose.mockClear();
  fireEvent.click(button);
  return mockCompose.mock.calls.at(-1)?.[0];
};

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
    expect(await screen.findByTestId('konva-stage')).toBeTruthy();
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
    await screen.findByTestId('konva-stage');
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
    await waitFor(() => expect(mockBackground).toHaveBeenCalled());
    fireEvent.click(klee);
    expect(klee.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Tanne' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(lastBackground()).toEqual({ kind: 'color', color: '#46962b' });

    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    expect(lastBackground()).toMatchObject({ kind: 'gradient' });
  });

  it('scales the person around its bottom centre with the size slider', async () => {
    renderHandoff();
    const slider = await screen.findByLabelText(/Größe/);
    await waitFor(() => expect(slider.hasAttribute('disabled')).toBe(false));
    fireEvent.change(slider, { target: { value: '100' } });
    const opts = await downloadAndGetCompose();
    expect(opts?.scale).toBe(1);
    // 600×800 cut-out at 100 % → 810×1080; bottom stays at 1080, centre within half a pixel
    expect(opts?.position).toEqual({ x: 136, y: 0 });
  });

  it('downloads the composed 1080 image as profilbild.png', async () => {
    renderHandoff();
    const opts = await downloadAndGetCompose();
    expect(opts?.position).toEqual({ x: 196, y: 162 });
    expect(opts?.size).toBeUndefined();
    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/png;base64,OUT', 'profilbild.png');
  });

  it('nudges the person with the arrow keys and re-centres it', async () => {
    renderHandoff();
    const mover = await screen.findByRole('application', {
      name: 'Person verschieben – Pfeiltasten',
    });
    await screen.findByTestId('konva-stage');
    fireEvent.keyDown(mover, { key: 'ArrowLeft' });
    fireEvent.keyDown(mover, { key: 'ArrowUp', shiftKey: true });
    expect((await downloadAndGetCompose())?.position).toEqual({ x: 186, y: 112 });

    fireEvent.click(screen.getByRole('button', { name: 'Zentrieren' }));
    expect((await downloadAndGetCompose())?.position).toEqual({ x: 196, y: 162 });
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

  it('switches between round, square and Instagram previews', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect([pressed('Rund'), pressed('Quadrat'), pressed('Instagram')]).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(screen.getByText(/Vorschau rund wie in sozialen Netzwerken/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Quadrat' }));
    expect(pressed('Quadrat')).toBe('true');
    expect(pressed('Rund')).toBe('false');
    expect(screen.getByText(/Der Download bleibt quadratisch/)).toBeTruthy();
    expect(screen.getByTestId('konva-stage')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Vorschau als Instagram-Profilbild' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(pressed('Instagram')).toBe('true');
    const mock = screen.getByRole('img', { name: 'Vorschau als Instagram-Profilbild' });
    expect(mock.textContent).toContain('So sieht es auf Instagram aus');
    expect(mock.textContent).toContain('dein.name');
    expect(screen.queryByTestId('konva-stage')).toBeNull();
    expect(
      screen.queryByRole('application', { name: 'Person verschieben – Pfeiltasten' })
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Herunterladen' })).toBeTruthy();
  });

  it('has no axe violations in the Instagram preview', async () => {
    const { container } = renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Instagram' }));
    await screen.findByRole('img', { name: 'Vorschau als Instagram-Profilbild' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('returns to the upload on "Anderes Foto"', async () => {
    renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Anderes Foto' }));
    expect(await screen.findByText('upload')).toBeTruthy();
  });
});
