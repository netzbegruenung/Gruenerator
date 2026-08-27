/**
 * The file panel's upload row.
 *
 * The "+" menu now offers ONE file row, and it opens this panel — so the OS
 * file picker is only reachable from in here. That makes two things load-
 * bearing and worth a test of their own: the row exists at root level, and it
 * dismisses the panel BEFORE clicking the hidden upload button. The other
 * order leaves the panel open over a native file dialog.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileMentionPopover } from './FileMentionPopover';

const mentionData = {
  collections: [] as unknown[],
  documents: [] as unknown[],
  texts: [] as unknown[],
  loadingCollections: false,
  loadingContent: false,
  collectionsFailed: false,
  contentFailed: false,
};

vi.mock('../../hooks/useFileMentionData', () => ({
  useFileMentionData: () => ({ ...mentionData, searchInCollection: vi.fn() }),
}));

vi.mock('../../hooks/useMentionablesQuery', () => ({
  useDocMentionables: () => [],
}));

const onSelect = vi.fn();
const onDismiss = vi.fn();
const onUploadFile = vi.fn();

function renderPopover() {
  return render(<FileMentionPopover visible onSelect={onSelect} onDismiss={onDismiss} />);
}

beforeEach(() => {
  onSelect.mockReset();
  onDismiss.mockReset();
  onUploadFile.mockReset();
  mentionData.collectionsFailed = false;
  mentionData.contentFailed = false;
});

describe('FileMentionPopover upload row', () => {
  it('dismisses the panel, then opens the file picker', async () => {
    const order: string[] = [];
    onDismiss.mockImplementation(() => order.push('dismiss'));
    onUploadFile.mockImplementation(() => order.push('upload'));

    const user = userEvent.setup();
    render(
      <FileMentionPopover
        visible
        onSelect={onSelect}
        onDismiss={onDismiss}
        onUploadFile={onUploadFile}
      />
    );

    await user.click(await screen.findByText('Fotos & Dateien hochladen'));

    expect(order).toEqual(['dismiss', 'upload']);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('stays out of the panel when no upload handler is wired', async () => {
    render(<FileMentionPopover visible onSelect={onSelect} onDismiss={onDismiss} />);

    expect(await screen.findByPlaceholderText('Suchen...')).toBeInTheDocument();
    expect(screen.queryByText('Fotos & Dateien hochladen')).toBeNull();
  });
});

describe('FileMentionPopover error states', () => {
  it('names the failure instead of rendering an empty menu', async () => {
    mentionData.collectionsFailed = true;
    mentionData.contentFailed = true;
    renderPopover();

    expect(await screen.findByText('Notebooks konnten nicht geladen werden.')).toBeInTheDocument();
    expect(screen.getByText('Dokumente konnten nicht geladen werden.')).toBeInTheDocument();
  });

  it('reports the shared query once — texts and documents come from the same call', async () => {
    mentionData.contentFailed = true;
    renderPopover();

    expect(await screen.findAllByText('Dokumente konnten nicht geladen werden.')).toHaveLength(1);
    expect(screen.queryByText('Notebooks konnten nicht geladen werden.')).toBeNull();
  });

  it('says nothing about errors when both queries succeeded', async () => {
    renderPopover();

    expect(await screen.findByPlaceholderText('Suchen...')).toBeInTheDocument();
    expect(screen.queryByText('Dokumente konnten nicht geladen werden.')).toBeNull();
    expect(screen.queryByText('Notebooks konnten nicht geladen werden.')).toBeNull();
  });
});
