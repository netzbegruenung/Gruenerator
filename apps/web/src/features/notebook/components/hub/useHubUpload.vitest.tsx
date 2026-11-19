import { NOTEBOOK_MAX_DOCUMENTS } from '@gruenerator/contracts';
import { ConfirmDialogProvider } from '@gruenerator/ui';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentsStore } from '../../../../stores/documentsStore';

import { useHubUpload } from './UploadPanel';

import type { NotebookHubApi } from './useNotebookHub';
import type { NotebookDocumentRecord } from '@gruenerator/contracts';

const existing = [
  { id: 'alt', title: 'Haushaltsantrag.docx', created_at: '2026-11-19T10:00:00Z' },
] as NotebookDocumentRecord[];

const uploadFileOnly = vi.fn(async (file: File) => ({ id: `neu-${file.name}` }));
const addDocuments = vi.fn(async () => {});
const removeDocuments = vi.fn(async () => {});
const hub = {
  collection: { id: 'nb-1' },
  addDocuments,
  removeDocuments,
} as unknown as NotebookHubApi;

const wrapper = ({ children }: { children: ReactNode }) => (
  <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
);

function setup(total = existing.length) {
  useDocumentsStore.setState({ uploadFileOnly } as never);
  return renderHook(() => useHubUpload(hub, total, existing), { wrapper });
}

/** Wählt die Datei über das versteckte Feld aus, so wie der Knopf es tut. */
async function pick(result: ReturnType<typeof setup>['result'], ...files: File[]) {
  const { container } = render(<>{result.current.input}</>);
  const input = container.querySelector('input[type=file]') as HTMLInputElement;
  await act(async () => {
    await userEvent.upload(input, files);
  });
}

const neueFassung = () => new File(['neuer Inhalt'], 'Haushaltsantrag.docx');

describe('useHubUpload — gleicher Name, anderer Inhalt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ersetzt: lädt hoch, hängt an und nimmt erst danach die alte Fassung heraus', async () => {
    const { result } = setup();
    await pick(result, neueFassung());

    await userEvent.click(await screen.findByRole('button', { name: 'Ersetzen' }));

    await waitFor(() => expect(removeDocuments).toHaveBeenCalledWith(['alt']));
    expect(addDocuments).toHaveBeenCalledWith(['neu-Haushaltsantrag.docx']);
    expect(addDocuments.mock.invocationCallOrder[0]).toBeLessThan(
      removeDocuments.mock.invocationCallOrder[0]!
    );
  });

  it('„Beide behalten" lädt hoch und lässt die alte Fassung stehen', async () => {
    const { result } = setup();
    await pick(result, neueFassung());

    await userEvent.click(await screen.findByRole('button', { name: 'Beide behalten' }));

    await waitFor(() => expect(addDocuments).toHaveBeenCalledWith(['neu-Haushaltsantrag.docx']));
    expect(removeDocuments).not.toHaveBeenCalled();
  });

  it('Abbrechen lädt nichts hoch', async () => {
    const { result } = setup();
    await pick(result, neueFassung());

    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(uploadFileOnly).not.toHaveBeenCalled();
    expect(addDocuments).not.toHaveBeenCalled();
  });

  it('fragt bei einem neuen Namen gar nicht erst', async () => {
    const { result } = setup();
    await pick(result, new File(['x'], 'Protokoll.pdf'));

    await waitFor(() => expect(addDocuments).toHaveBeenCalledWith(['neu-Protokoll.pdf']));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('rechnet die ersetzte Fassung nicht als frei: angehängt wird, solange sie noch dranhängt', async () => {
    const { result } = setup(NOTEBOOK_MAX_DOCUMENTS - 1);
    await pick(result, neueFassung(), new File(['x'], 'Protokoll.pdf'));

    await userEvent.click(await screen.findByRole('button', { name: 'Ersetzen' }));

    await waitFor(() => expect(addDocuments).toHaveBeenCalledWith(['neu-Haushaltsantrag.docx']));
    expect(uploadFileOnly).toHaveBeenCalledTimes(1);
  });
});
