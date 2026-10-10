import { useAui } from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadDataUrl as downloadDataUrlImpl } from '../../../utils/downloadFile';
import { detectImageElements, editAiImage } from '../services/imageEditingService';

import BildEditorV2Page from './BildEditorV2Page';
import { type BevVersion } from './types';

const generatePureCreate = vi.hoisted(() =>
  vi.fn<(args: { description: string }) => Promise<string>>()
);
vi.mock('@gruenerator/shared/image-studio', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useKiImageGeneration: () => ({ generatePureCreate }),
}));
vi.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({ createImageShare: () => Promise.resolve({}) }),
}));
vi.mock('../services/imageEditingService', () => ({
  editAiImage: vi.fn(),
  detectImageElements: vi.fn(),
}));
vi.mock('../../../utils/downloadFile', () => ({ downloadDataUrl: vi.fn() }));

// The real thread is a large UI; under test is what the page does with a sent message.
vi.mock('@gruenerator/chat', () => {
  function Thread({ composerSlots }: { composerSlots?: { aboveInput?: ReactNode } }) {
    const aui = useAui();
    const send = (text: string, file?: File) =>
      aui.thread().append({
        role: 'user',
        content: [{ type: 'text', text }],
        attachments: file
          ? [
              {
                id: 'a1',
                type: 'image',
                name: file.name,
                contentType: file.type,
                file,
                content: [],
                status: { type: 'complete' },
              },
            ]
          : [],
      });
    return (
      <>
        {composerSlots?.aboveInput}
        <button onClick={() => send('Mach den Himmel blau', REFERENCE)}>senden</button>
      </>
    );
  }
  return { GrueneratorThread: Thread };
});

const editImage = vi.mocked(editAiImage);
const detect = vi.mocked(detectImageElements);
const downloadDataUrl = vi.mocked(downloadDataUrlImpl);

const REFERENCE = new File(['r'], 'referenz.jpg', { type: 'image/jpeg' });
const V1 = 'data:image/jpeg;base64,VjE=';
const V2 = 'data:image/png;base64,VjI=';
const EDITED = 'data:image/jpeg;base64,RURJVA==';

const version = (
  id: string,
  num: number,
  image: string,
  parentId: string | null = null
): BevVersion => ({
  id,
  parentId,
  prompt: `Prompt ${num}`,
  image,
  time: num,
  num,
  kind: parentId ? 'edit' : 'create',
});

function persist(versions: BevVersion[]) {
  localStorage.setItem(
    'gruenerator-bildeditor-v2',
    JSON.stringify({ versions, activeId: versions.at(-1)?.id ?? null })
  );
}

function Probe() {
  return <p data-testid="probe">{useLocation().pathname}</p>;
}

function renderAt(state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: '/studio/bild', state }]}>
        <Routes>
          <Route path="/studio/bild" element={<BildEditorV2Page />} />
          <Route path="/studio" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // The hook reads its data-URLs back with fetch; MSW rejects every unhandled request.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      Object.assign(new Response(null), {
        blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
      })
    )
  );
  localStorage.clear();
  generatePureCreate.mockReset();
  editImage.mockReset();
  detect.mockReset();
  downloadDataUrl.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('BildEditorV2Page', () => {
  it('goes back to the Studio when there is nothing to edit', async () => {
    renderAt();
    expect(await screen.findByTestId('probe')).toHaveTextContent('/studio');
  });

  it('runs the request handed over from the Studio and shows the result', async () => {
    generatePureCreate.mockResolvedValue(V1);
    renderAt({ mode: 'erstellen', prompt: 'Ein Wald am Morgen' });

    await waitFor(() => expect(screen.getByAltText('Aktuelle Version')).toHaveAttribute('src', V1));
    expect(generatePureCreate).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Ein Wald am Morgen' })
    );
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
  });

  it('edits the shown version with the text and reference of a chat message', async () => {
    persist([version('v1', 1, V1)]);
    editImage.mockResolvedValue({ base64: EDITED } as Awaited<ReturnType<typeof editAiImage>>);
    renderAt();
    // The saved versions load asynchronously.
    await screen.findByAltText('Aktuelle Version');

    fireEvent.click(screen.getByText('senden'));
    await waitFor(() =>
      expect(screen.getByAltText('Aktuelle Version')).toHaveAttribute('src', EDITED)
    );
    const [files, text] = editImage.mock.calls[0]!;
    expect(text).toBe('Mach den Himmel blau');
    expect((files as File[]).map((f) => f.name)).toEqual(['v1.jpg', 'referenz.jpg']);
  });

  it('switches the shown version from the strip and downloads it', async () => {
    persist([version('v1', 1, V1), version('v2', 2, V2, 'v1')]);
    renderAt();

    expect(await screen.findByAltText('Aktuelle Version')).toHaveAttribute('src', V2);
    fireEvent.click(screen.getByRole('button', { name: 'V1 · KI-erstellt' }));
    expect(screen.getByAltText('Aktuelle Version')).toHaveAttribute('src', V1);
    expect(screen.getByText('Änderungen an V1 erstellen einen neuen Zweig')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect(downloadDataUrl).toHaveBeenCalledWith(V1, 'gruenerator-bild-1.jpg');
  });

  it('detects the elements only once the expert mode is opened, then edits by box', async () => {
    persist([version('v1', 1, V1)]);
    detect.mockResolvedValue([{ id: 'moth_1', bbox: [350, 150, 480, 300], desc: 'Motte links' }]);
    editImage.mockResolvedValue({ base64: EDITED } as Awaited<ReturnType<typeof editAiImage>>);
    renderAt();
    await screen.findByAltText('Aktuelle Version');
    expect(detect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Expertenmodus' }));
    expect(screen.getByRole('button', { name: 'Expertenmodus' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Motte links (Behalten)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    fireEvent.click(screen.getByRole('button', { name: '1 Änderung anwenden' }));

    await waitFor(() =>
      expect(screen.getByAltText('Aktuelle Version')).toHaveAttribute('src', EDITED)
    );
    const [, instruction, type, model, options] = editImage.mock.calls[0]!;
    expect(instruction).toContain('remove <moth_1>');
    expect([type, model]).toEqual(['universal', 'flux-pro']);
    expect(options?.boxes).toMatchObject({
      rows: [expect.objectContaining({ id: 'moth_1', tgt_bbox: null })],
    });
    // The new version is detected in the background as well.
    await waitFor(() => expect(detect).toHaveBeenCalledTimes(2));
  });
});
