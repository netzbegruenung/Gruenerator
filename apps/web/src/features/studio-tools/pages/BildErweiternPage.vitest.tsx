import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
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
  static fail = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => (FakeImage.fail ? this.onerror?.() : this.onload?.()));
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
    FakeImage.fail = false;
    vi.stubGlobal('Image', FakeImage);
  });

  it('reports an undecodable image and offers another one', async () => {
    FakeImage.fail = true;
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    expect(await screen.findByText('Dieses Bild kann nicht gelesen werden.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Anderes Bild' }));
    expect(await screen.findByText('upload')).toBeTruthy();
  });

  it('shows the server message for a 400', async () => {
    mockOutpaint.mockRejectedValue({
      response: { status: 400, data: { error: 'Das Bild ist zu klein.' } },
    });
    renderPage();
    await uploadAndLoad();
    fireEvent.click(screen.getByRole('radio', { name: '9:16' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erweitern' }));
    expect(await screen.findByText('Das Bild ist zu klein.')).toBeTruthy();
  });

  it('has no axe violations in the preview', async () => {
    const { container } = renderPage();
    await uploadAndLoad();
    expect(await axe(container)).toHaveNoViolations();
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

  describe('format radiogroup keyboard', () => {
    const setup = async () => {
      renderPage();
      await uploadAndLoad();
      const radios = screen.getAllByRole('radio', { name: /^\d+:\d+$/ });
      return radios;
    };

    it('has a single tab stop on the checked chip', async () => {
      const radios = await setup();
      expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radios[0]]);
    });

    it('moves selection and focus with arrows, wrapping at both ends', async () => {
      const radios = await setup();
      const last = radios.length - 1;
      radios[0].focus();
      fireEvent.keyDown(radios[0], { key: 'ArrowRight' });
      expect(radios[1].getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(radios[1]);
      expect(radios[1].tabIndex).toBe(0);
      expect(radios[0].tabIndex).toBe(-1);
      fireEvent.keyDown(radios[1], { key: 'ArrowUp' });
      fireEvent.keyDown(radios[0], { key: 'ArrowLeft' });
      expect(radios[last].getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(radios[last]);
      fireEvent.keyDown(radios[last], { key: 'ArrowDown' });
      expect(radios[0].getAttribute('aria-checked')).toBe('true');
    });

    it('jumps with Home and End', async () => {
      const radios = await setup();
      fireEvent.keyDown(radios[0], { key: 'End' });
      expect(radios[radios.length - 1].getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(radios[radios.length - 1]);
      fireEvent.keyDown(radios[0], { key: 'Home' });
      expect(radios[0].getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(radios[0]);
    });
  });
});
