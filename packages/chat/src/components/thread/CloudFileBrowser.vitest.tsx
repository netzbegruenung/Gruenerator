/**
 * Was hier leise falsch werden könnte: `@connect` landet in der Wolke statt im
 * Laufwerk, „Ebene hoch" springt im Laufwerk zurück an die Wurzel, eine Datei,
 * die der Chat nicht lesen kann, lässt sich trotzdem wählen, oder eine Auswahl
 * aus zwei Ablagen kommt nur halb im Composer an.
 */
import { ApiError } from '@gruenerator/shared/api';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudFileBrowser } from './CloudFileBrowser';

type DriveFile = {
  id: string;
  name: string;
  isDirectory?: boolean;
  isSupported?: boolean;
  mimeType?: string;
};

const driveFolders: Record<string, DriveFile[]> = {};
let driveError: unknown = null;
const driveCalls: (string | null)[] = [];

vi.mock('../../hooks/useMentionablesQuery', () => ({
  useUserShareLinksQuery: () => ({ data: [{ id: 'share-1', label: 'KV' }], isLoading: false }),
  useConnectProvidersQuery: () => ({
    data: [{ provider: 'microsoft', label: 'Microsoft 365' }],
    isLoading: false,
  }),
  useWolkeBrowseQuery: (shareLinkId: string | null) => ({
    data: shareLinkId
      ? { shareLink: { id: shareLinkId }, files: [{ name: 'Satzung.pdf', isSupported: true }] }
      : undefined,
    isLoading: false,
    isError: false,
  }),
  useConnectBrowseQuery: (provider: string | null, folderId: string | null, enabled: boolean) => {
    if (enabled) driveCalls.push(folderId);
    return {
      data: enabled && !driveError ? driveFolders[folderId ?? 'root'] : undefined,
      isLoading: false,
      isError: enabled && driveError !== null,
      error: enabled ? driveError : null,
    };
  },
}));

const onSelect = vi.fn();
const onDismiss = vi.fn();

function renderBrowser(initialSource: 'wolke' | 'drive') {
  return render(
    <CloudFileBrowser
      visible
      initialSource={initialSource}
      onSelect={onSelect}
      onDismiss={onDismiss}
    />
  );
}

beforeEach(() => {
  onSelect.mockReset();
  driveError = null;
  driveCalls.length = 0;
  driveFolders.root = [
    { id: 'f1', name: 'Projekte', isDirectory: true },
    { id: 'x1', name: 'Haushalt.xlsx', isSupported: true, mimeType: 'application/x' },
    { id: 'e1', name: 'setup.exe', isSupported: false },
  ];
  driveFolders.f1 = [{ id: 'f2', name: 'Unterordner', isDirectory: true }];
  driveFolders.f2 = [];
});

describe('CloudFileBrowser', () => {
  it('opens @connect on the drive and walks back up one level at a time', async () => {
    const user = userEvent.setup();
    renderBrowser('drive');

    await user.click(await screen.findByText('Projekte'));
    await user.click(screen.getByText('Unterordner'));
    await user.click(screen.getByText('← Projekte/Unterordner'));

    expect(screen.getByText('Unterordner')).toBeInTheDocument();
    expect(driveCalls.at(-1)).toBe('f1');
  });

  it('greys out a format the chat cannot read', async () => {
    renderBrowser('drive');

    expect((await screen.findByText('setup.exe')).closest('button')).toBeDisabled();
    expect(screen.getByText('Haushalt.xlsx').closest('button')).toBeEnabled();
  });

  it('collects one selection across Wolke and drive', async () => {
    const user = userEvent.setup();
    renderBrowser('wolke');

    await user.click(await screen.findByText('Satzung.pdf'));
    await user.click(screen.getByRole('tab', { name: 'OneDrive' }));
    await user.click(await screen.findByText('Haushalt.xlsx'));
    await user.click(screen.getByText('Hinzufügen'));

    expect(onSelect).toHaveBeenCalledWith({
      wolke: [{ shareLinkId: 'share-1', path: '/Satzung.pdf', name: 'Satzung.pdf' }],
      connect: [
        {
          provider: 'microsoft',
          fileId: 'x1',
          name: 'Haushalt.xlsx',
          mimeType: 'application/x',
        },
      ],
    });
  });

  it('asks to reconnect when the drive grant expired', async () => {
    driveError = new ApiError(403, 'Zugang abgelaufen');
    renderBrowser('drive');

    expect(await screen.findByText(/Zugang zu OneDrive ist abgelaufen/)).toBeInTheDocument();
  });
});
