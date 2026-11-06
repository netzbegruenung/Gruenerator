/**
 * Die Bilder, die der Loop in diesem Zug lesen und weiterverarbeiten kann:
 * zuerst die angehängten, dann die Fotos aus der Wolke (`wolkeFiles`, auch die
 * aus früheren Zügen übernommenen — im Loop entscheidet das Modell, ob es sie
 * braucht). Die Nummer in dieser Liste ist die Nummer, die der Systemprompt
 * nennt und die `bild_ansehen` / `edit_image` (`bild`) adressieren.
 *
 * Bewusst ohne schwere Importe: Prompt-Bau und `imageVisibility` zählen nur,
 * sie laden nichts. Das Laden steht in `turnImages.ts`.
 */
import { type WolkeFileRef } from '@gruenerator/contracts';

import { type ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

import { isWolkePhoto } from './wolkePhoto.js';

export type TurnImageRef =
  | { kind: 'anhang'; name: string; index: number }
  | { kind: 'wolke'; name: string; ref: WolkeFileRef };

export function listTurnImageRefs(
  state: Pick<ChatGraphState, 'imageAttachments' | 'wolkeFiles'>
): TurnImageRef[] {
  const attached = (state.imageAttachments ?? []).map((img, index): TurnImageRef => ({
    kind: 'anhang',
    name: img.name,
    index,
  }));
  const wolke = (state.wolkeFiles ?? [])
    .filter(isWolkePhoto)
    .map((ref): TurnImageRef => ({ kind: 'wolke', name: ref.name, ref }));
  return [...attached, ...wolke];
}
