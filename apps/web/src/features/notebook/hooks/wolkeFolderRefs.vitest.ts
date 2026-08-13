import { describe, expect, it } from 'vitest';

import {
  attachWolkeFolder,
  isWolkeFolderAttached,
  removeWolkeFolder,
  updateWolkeFolder,
  wolkeFolderDisplayName,
  wolkeFolderKey,
} from './wolkeFolderRefs';

import type { WolkeFolderRef } from '@gruenerator/contracts';

function folder(partial: Partial<WolkeFolderRef> & { shareLinkId: string }): WolkeFolderRef {
  return {
    shareLabel: 'Wolke',
    folderPath: '',
    folderName: 'Wolke',
    lastSyncedAt: null,
    ...partial,
  };
}

describe('wolkeFolderKey', () => {
  it('separates two folders of the same share', () => {
    expect(wolkeFolderKey({ shareLinkId: 's1', folderPath: '' })).not.toBe(
      wolkeFolderKey({ shareLinkId: 's1', folderPath: 'Stadtrat' })
    );
  });

  it('is the same key for the same pair', () => {
    expect(wolkeFolderKey({ shareLinkId: 's1', folderPath: 'a/b' })).toBe(
      wolkeFolderKey({ shareLinkId: 's1', folderPath: 'a/b' })
    );
  });
});

describe('attachWolkeFolder', () => {
  it('keeps two subfolders of the same share side by side', () => {
    const list = attachWolkeFolder(
      [folder({ shareLinkId: 's1', folderPath: 'Stadtrat' })],
      folder({ shareLinkId: 's1', folderPath: 'Anträge' })
    );
    expect(list).toHaveLength(2);
  });

  it('refuses the exact same folder twice', () => {
    const existing = [folder({ shareLinkId: 's1', folderPath: 'Stadtrat' })];
    const list = attachWolkeFolder(existing, folder({ shareLinkId: 's1', folderPath: 'Stadtrat' }));
    expect(list).toBe(existing);
  });

  it('treats the share root as a folder of its own', () => {
    const list = attachWolkeFolder(
      [folder({ shareLinkId: 's1', folderPath: 'Stadtrat' })],
      folder({ shareLinkId: 's1', folderPath: '' })
    );
    expect(list).toHaveLength(2);
  });
});

describe('removeWolkeFolder', () => {
  it('removes only the folder with that path, not the whole share', () => {
    const list = removeWolkeFolder(
      [
        folder({ shareLinkId: 's1', folderPath: '' }),
        folder({ shareLinkId: 's1', folderPath: 'Stadtrat' }),
      ],
      wolkeFolderKey({ shareLinkId: 's1', folderPath: 'Stadtrat' })
    );
    expect(list.map((f) => f.folderPath)).toEqual(['']);
  });
});

describe('updateWolkeFolder', () => {
  it('patches one folder and leaves its siblings alone', () => {
    const list = updateWolkeFolder(
      [
        folder({ shareLinkId: 's1', folderPath: '' }),
        folder({ shareLinkId: 's1', folderPath: 'Stadtrat' }),
      ],
      wolkeFolderKey({ shareLinkId: 's1', folderPath: 'Stadtrat' }),
      { includeSubfolders: true }
    );
    expect(list.map((f) => f.includeSubfolders)).toEqual([undefined, true]);
  });
});

describe('wolkeFolderDisplayName', () => {
  it('is the share label for the root', () => {
    expect(wolkeFolderDisplayName('Fraktion', '')).toBe('Fraktion');
  });

  it('appends the leaf folder for a subfolder', () => {
    expect(wolkeFolderDisplayName('Fraktion', 'Stadtrat/2026/Anträge')).toBe('Fraktion / Anträge');
  });

  it('ignores a trailing slash instead of showing an empty leaf', () => {
    expect(wolkeFolderDisplayName('Fraktion', 'Stadtrat/')).toBe('Fraktion / Stadtrat');
  });
});
