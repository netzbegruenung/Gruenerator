import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

/**
 * Desktop implementation of the shared `DesktopSaver`: native save dialog, then
 * write through the fs plugin. The dialog plugin adds the chosen path to the fs
 * scope at runtime, so `capabilities/default.json` needs no `fs:scope` entry.
 * Cancelling the dialog is not an error.
 */
export async function saveBlobToDisk(blob: Blob, filename: string): Promise<void> {
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot + 1) : null;
  const path = await save({
    defaultPath: filename,
    filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [],
  });
  if (!path) return;
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}
