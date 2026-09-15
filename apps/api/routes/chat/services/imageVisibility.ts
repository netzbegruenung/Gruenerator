/**
 * Eine Frage, eine Antwort: **stehen die Bildbytes wirklich in der Nachricht,
 * die das Modell bekommt?**
 *
 * Sie wird an drei Stellen gebraucht, und solange jede sie für sich beantwortet
 * hat, gaben sie verschiedene Antworten (#3313):
 *
 *  - `injectImageAttachments` hängt die Bytes an — auf dem Einzeldurchlauf.
 *  - Der Wiederaufnahme-Pfad baut dieselbe Nachrichtenliste und hängt NICHTS an.
 *  - `formatImageContext` schreibt in den Systemprompt, die Bilder seien
 *    „in der Nachricht sichtbar".
 *
 * Ein Modell, dem man sagt, es sehe ein Bild, beschreibt es auch — ob eines da
 * ist oder nicht. Die Behauptung im Prompt und das Anhängen der Bytes müssen
 * deshalb aus derselben Quelle kommen, und das ist diese Datei.
 *
 * Bewusst ohne Laufzeit-Importe: `formatImageContext` liegt im Prompt-Bau und
 * darf sich nicht den OCR-Dienst einhandeln, der an `injectImageAttachments`
 * im selben Modul hängt.
 */
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * Warum das Modell die Bilder sieht — oder eben nicht. Der Grund, nicht bloss
 * ein Ja/Nein, weil der Prompt ihn dem Modell sagen muss: „nicht sichtbar" ohne
 * Grund liest sich wie ein Fehler, und das Modell rät dann doch.
 */
export type ImageVisibility =
  /** Die Bytes hängen an der letzten Nutzernachricht. */
  | 'visible'
  /** Kein Bild an diesem Zug — die Frage stellt sich nicht. */
  | 'none'
  /** „Bildanalyse" ist für diesen Grünerator ausgeschaltet (#3307). */
  | 'vision_off'
  /**
   * `image_edit`: Das Modell erzählt aus den BILDVERGLEICH-Beschreibungen, die
   * `imageEditNode` von einem Vision-Modell geholt hat. Die Rohbytes bleiben
   * bewusst draussen — sie stünden sonst vor einem Modell, das sie nicht
   * dekodieren kann, und wären neben den Beschreibungen eine zweite,
   * konkurrierende Erdungsquelle.
   */
  | 'image_edit_descriptions';

/**
 * Sieht das Modell die angehängten Bilder in diesem Zug?
 *
 * Reihenfolge der Gründe: der ausdrückliche Schalter zuerst. Wer „Bildanalyse"
 * abwählt, soll das im Prompt wiederfinden und nicht die Erklärung eines
 * anderen Zweigs lesen.
 */
export function imageVisibility(
  state: Pick<ChatGraphState, 'intent' | 'enabledTools' | 'imageAttachments'>
): ImageVisibility {
  if (!state.imageAttachments || state.imageAttachments.length === 0) return 'none';
  if (state.enabledTools?.['vision'] === false) return 'vision_off';
  if (state.intent === 'image_edit') return 'image_edit_descriptions';
  return 'visible';
}
