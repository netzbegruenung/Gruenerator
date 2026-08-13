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

vi.mock('../../hooks/useFileMentionData', () => ({
  useFileMentionData: () => ({
    collections: [],
    documents: [],
    texts: [],
    loadingCollections: false,
    loadingContent: false,
    searchInCollection: vi.fn(),
  }),
}));

vi.mock('../../hooks/useMentionablesQuery', () => ({
  useDocMentionables: () => [],
}));

const onSelect = vi.fn();
const onDismiss = vi.fn();
const onUploadFile = vi.fn();

beforeEach(() => {
  onSelect.mockReset();
  onDismiss.mockReset();
  onUploadFile.mockReset();
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
