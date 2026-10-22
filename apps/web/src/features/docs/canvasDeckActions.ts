import { ApiError, getContractsClient } from '@gruenerator/shared/api';

/** Canvas-Folien (Bibliothek liefert `canvas` nur dafür) laufen nicht über /api/docs, sondern über /api/canvas. */
export const isCanvasDeck = (documentSubtype: string | null | undefined): boolean =>
  documentSubtype === 'canvas';

export async function renameCanvasDeck(id: string, title: string): Promise<void> {
  const res = await getContractsClient().canvas.update({ params: { id }, body: { title } });
  if (res.status !== 200) {
    throw new ApiError(res.status, `Umbenennen fehlgeschlagen (HTTP ${res.status}).`);
  }
}

/** Soft-Delete: der Canvas-Löschpfad schickt die Zeile in den Papierkorb. */
export async function deleteCanvasDeck(id: string): Promise<void> {
  const res = await getContractsClient().canvas.remove({ params: { id } });
  if (res.status !== 200) {
    throw new ApiError(res.status, `Löschen fehlgeschlagen (HTTP ${res.status}).`);
  }
}
