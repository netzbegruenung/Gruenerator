/**
 * Die Bilder, die der Loop in diesem Zug lesen und weiterverarbeiten kann:
 * zuerst die angehängten, dann die Fotos aus der Wolke (`wolkeFiles`, auch die
 * aus früheren Zügen übernommenen — im Loop entscheidet das Modell, ob es sie
 * braucht), zuletzt die Fotos, die in früheren Nachrichten dieses Threads
 * hochgeladen wurden (`threadAttachments` mit gespeicherten Bytes, das jüngste
 * zuerst). Die Nummer in dieser Liste ist die Nummer, die der Systemprompt
 * nennt und die `bild_ansehen` / `edit_image` (`bild`) adressieren.
 *
 * Die früheren Fotos stehen hier seit dem 20.11.2026: auf „Soll ich das Foto
 * winterlich machen?" — „Ja" gab es vorher nichts zu bearbeiten, weil ein
 * hochgeladenes Foto seinen Zug nicht überlebte (#5879). Sie kommen aus dem
 * Thread, nicht aus dem Request — so gilt das auch nach dem Neuladen, auf
 * einem anderen Gerät und Tage später.
 *
 * Bewusst ohne schwere Importe: Prompt-Bau und `imageVisibility` zählen nur,
 * sie laden nichts. Das Laden steht in `turnImages.ts`.
 */
import { type WolkeFileRef } from '@gruenerator/contracts';

import { type ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

import { isWolkePhoto } from './wolkePhoto.js';

export type TurnImageRef =
  | { kind: 'anhang'; name: string; index: number }
  | { kind: 'wolke'; name: string; ref: WolkeFileRef }
  | { kind: 'verlauf'; name: string; attachmentId: string };

export function listTurnImageRefs(
  state: Pick<ChatGraphState, 'imageAttachments' | 'wolkeFiles'> &
    Partial<Pick<ChatGraphState, 'threadAttachments'>>
): TurnImageRef[] {
  const attached = (state.imageAttachments ?? []).map((img, index): TurnImageRef => ({
    kind: 'anhang',
    name: img.name,
    index,
  }));
  const wolke = (state.wolkeFiles ?? [])
    .filter(isWolkePhoto)
    .map((ref): TurnImageRef => ({ kind: 'wolke', name: ref.name, ref }));
  // Dasselbe Foto noch einmal angehängt steht schon oben als Anhang.
  const attachedNames = new Set(attached.map((img) => img.name));
  const earlier = (state.threadAttachments ?? [])
    .filter((a) => a.isImage && a.hasFileData && !attachedNames.has(a.name))
    .reverse()
    .map((a): TurnImageRef => ({ kind: 'verlauf', name: a.name, attachmentId: a.id }));
  return [...attached, ...wolke, ...earlier];
}
