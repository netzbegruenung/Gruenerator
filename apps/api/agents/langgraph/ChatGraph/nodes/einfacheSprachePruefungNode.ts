/**
 * Einfache Sprache — Schritt 3: die unabhängige Prüfung.
 *
 * Bekommt drei Texte: Original, Fassung in Einfacher Sprache, blinde
 * Rückübersetzung. Liefert Abdeckungsliste, Befundtabelle, Korrekturvorschläge
 * und ein Urteil (FREIGABE / ÜBERARBEITUNG / ABLEHNUNG).
 *
 * **Warum das nicht derselbe Turn sein darf, der den Text geschrieben hat.**
 * Gemessen am Lauf vom 13.08.2026: ein Modell schrieb Übertragung,
 * Zuordnungstabelle und Selbstkontrolle in EINER Generierung — und meldete
 * „keine schwierigen Stellen" sowie durchgehend „vollständig", während ein
 * Ortsname aus dem Original fehlte. Das ist kein Prompt-Fehler, den man
 * wegformulieren kann: eine Instanz, die ihren eigenen Text im eigenen Kontext
 * bewertet, sucht nicht nach ihren Auslassungen — sie erinnert sich an ihre
 * Absichten. Deshalb schreibt hier ein anderes Modell mit eigenem Kontext.
 *
 * Die Zuordnungstabelle wohnt ebenfalls hier und nicht mehr im Fließtext-Turn.
 * Das hat zwei Gründe, und beide sind belegt: sie IST eine Prüfaussage, und
 * eine 20-zeilige Tabelle am Ende einer langen Ausgabe war der Auslöser des
 * Degenerations-Abbruchs im selben Lauf (`| ----- |`-Wiederholung ab 10022
 * Zeichen, danach begann das Modell den ganzen Text neu).
 *
 * Fail-open: null heisst „kein Prüfteil".
 */

import { getInternalSkillPrompt } from '../../../../services/skills/internalPrompts.js';
import { createLogger } from '../../../../utils/logger.js';
import { intermediateLane } from '../llmConfig.js';

import type { ChatGraphState } from '../types.js';

/** @see services/ai/intermediateLanes.ts */
const LANE = intermediateLane('pruefung');

const log = createLogger('ChatGraph:EinfacheSprachePruefung');

/** Dateiname im intern-Repo unter `skills/`. */
const PROMPT_ID = 'sprachpruefung';

/**
 * Der Prüfbericht ist die längste Ausgabe der Kette: Abdeckungstabelle über
 * jeden Gliederungspunkt, Befundtabelle, plus eine Neufassung für JEDEN Befund
 * der Schweregrade KRITISCH und HOCH. Dazu die Denk-Tokens von Gemma 4, die
 * gegen dasselbe Budget zählen. Ein knapper Deckel schneidet nicht den Bericht,
 * sondern die Korrekturen ab — also den Teil, der Arbeit spart.
 */
const MAX_TOKENS = 8000;

/**
 * Obergrenze für das Original im Prüfkontext. Drei Texte plus Systemprompt
 * müssen in ein Fenster passen; das Original ist der einzige unbegrenzte Teil
 * (ES-Fassung und Rückübersetzung sind durch ihre eigenen Deckel bereits
 * beschränkt). Wird gekürzt, sagt der Bericht das — eine stille Kürzung würde
 * die Abdeckungsliste unvollständig machen, ohne dass es jemand merkt.
 */
const MAX_ORIGINAL_CHARS = 24000;

export interface PruefungInput {
  original: string;
  esText: string;
  rueckuebersetzung: string | null;
}

export async function einfacheSprachePruefungNode(
  state: ChatGraphState,
  input: PruefungInput
): Promise<string | null> {
  const original = input.original.trim();
  const esText = input.esText.trim();
  if (!original || !esText) {
    log.warn('[ES:Pruefung] Original oder ES-Fassung fehlt — Schritt übersprungen');
    return null;
  }

  const systemPrompt = getInternalSkillPrompt(PROMPT_ID);
  if (!systemPrompt) {
    log.warn(
      `[ES:Pruefung] Kein interner Prompt "${PROMPT_ID}" — Schritt übersprungen. ` +
        'INTERN_CONTENT_DIR prüfen oder Salt-Rollout.'
    );
    return null;
  }

  const gekuerzt = original.length > MAX_ORIGINAL_CHARS;
  const originalText = gekuerzt ? original.slice(0, MAX_ORIGINAL_CHARS) : original;
  if (gekuerzt) {
    log.warn(
      `[ES:Pruefung] Original auf ${MAX_ORIGINAL_CHARS} von ${original.length} Zeichen gekürzt`
    );
  }

  // Der Prompt kennt drei benannte Texte und behandelt einen fehlenden
  // ausdrücklich ("Fehlt einer davon, sage das in einer Zeile"). Deshalb wird
  // die ausgefallene Rückübersetzung benannt statt weggelassen — sonst prüft
  // das Modell zwei Texte und meldet es nicht.
  const rueck = input.rueckuebersetzung?.trim();
  const rueckBlock = rueck
    ? `<rueckuebersetzung>\n${rueck}\n</rueckuebersetzung>`
    : '<rueckuebersetzung>\n(Die Rückübersetzung ist nicht zustande gekommen. Prüfe ohne sie und sage das.)\n</rueckuebersetzung>';

  const userMessage = `<original>
${originalText}${gekuerzt ? '\n\n(Gekürzt — das Original ist länger als hier gezeigt. Beziehe die Abdeckungsliste nur auf den gezeigten Teil und sage das im Bericht.)' : ''}
</original>

<es-fassung>
${esText}
</es-fassung>

${rueckBlock}`;

  const start = Date.now();
  try {
    const response = await state.aiWorkerPool.processRequest(
      {
        type: 'chat_einfache_sprache_pruefung',
        provider: LANE.provider,
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        options: { model: LANE.model, max_tokens: MAX_TOKENS, temperature: 0.1 },
      },
      null
    );

    const text = (response.content || '').trim();
    if (!text) {
      log.warn('[ES:Pruefung] Leere Antwort — Schritt übersprungen');
      return null;
    }

    log.info(
      `[ES:Pruefung] ${text.length} Zeichen in ${Date.now() - start}ms ` +
        `(Original ${originalText.length}c, ES ${esText.length}c, Rück ${rueck?.length ?? 0}c)`
    );
    return text;
  } catch (error: unknown) {
    log.warn(
      `[ES:Pruefung] Fehler (fail-open): ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
