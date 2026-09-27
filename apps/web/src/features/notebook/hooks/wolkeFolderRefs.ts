/**
 * List helpers for the Wolke folders attached to a notebook.
 *
 * Until the folder picker existed, a notebook could only ever hold the share
 * root, so `shareLinkId` alone identified an entry. That is no longer true:
 * two subfolders of the same share are two different sources, and keying by
 * `shareLinkId` would let one of them remove, re-key or overwrite the other.
 * The identity is the pair (share, path) — that is exactly the key the full
 * sync has always used for its progress rows.
 */
import { type WolkeFolderRef } from '@gruenerator/contracts';

type FolderIdentity = Pick<WolkeFolderRef, 'shareLinkId' | 'folderPath'>;

export function wolkeFolderKey(folder: FolderIdentity): string {
  return `${folder.shareLinkId}::${folder.folderPath}`;
}

export function isWolkeFolderAttached(
  folders: WolkeFolderRef[],
  candidate: FolderIdentity
): boolean {
  const key = wolkeFolderKey(candidate);
  return folders.some((f) => wolkeFolderKey(f) === key);
}

/** Appends the folder unless the exact (share, path) pair is already attached. */
export function attachWolkeFolder(
  folders: WolkeFolderRef[],
  next: WolkeFolderRef
): WolkeFolderRef[] {
  return isWolkeFolderAttached(folders, next) ? folders : [...folders, next];
}

export function removeWolkeFolder(folders: WolkeFolderRef[], key: string): WolkeFolderRef[] {
  return folders.filter((f) => wolkeFolderKey(f) !== key);
}

export function updateWolkeFolder(
  folders: WolkeFolderRef[],
  key: string,
  patch: Partial<WolkeFolderRef>
): WolkeFolderRef[] {
  return folders.map((f) => (wolkeFolderKey(f) === key ? { ...f, ...patch } : f));
}

/**
 * What the folder card is called. The share label alone stops being useful the
 * moment two subfolders of the same share sit next to each other.
 */
export function wolkeFolderDisplayName(shareLabel: string, folderPath: string): string {
  if (!folderPath) return shareLabel;
  const leaf = folderPath.split('/').filter(Boolean).pop();
  return leaf ? `${shareLabel} / ${leaf}` : shareLabel;
}
