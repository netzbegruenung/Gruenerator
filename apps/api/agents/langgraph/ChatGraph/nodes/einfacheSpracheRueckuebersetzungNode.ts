/**
 * Einfache Sprache — Schritt 2: die blinde Rückübersetzung.
 *
 * Nimmt NUR die Fassung in Einfacher Sprache und formuliert sie zurück in
 * Fachdeutsch. Was dabei nicht mehr ankommt, ist auf dem Weg verloren gegangen
 * — das ist der ganze Zweck: der Schritt misst nicht, wie gut der Text klingt,
 * sondern was er noch transportiert.
 *
 * **Der frische Kontext ist die Methode, nicht Kosmetik.** Als Rezept im selben
 * Thread war dieser Schritt wertlos: das Original stand im Gesprächsverlauf,
 * das Modell konnte es lesen, und eine „Rückübersetzung", die das Original
 * kennt, rekonstruiert es statt es zu prüfen. Der Prompt im intern-Repo bittet
 * darum, es zu ignorieren — eine Bitte, die man nicht nachprüfen kann. Hier
 * gibt es nichts zu ignorieren: die Nachrichtenliste besteht aus genau einem
 * Eintrag, dem ES-Text.
 *
 * Fail-open wie `computeVerifierNode`: null heisst „kein Prüfteil", nicht
 * „Turn kaputt". Der Nutzer hat seine Übertragung dann trotzdem.
 */

import { getInternalSkillPrompt } from '../../../../services/skills/internalPrompts.js';
import { createLogger } from '../../../../utils/logger.js';
import { intermediateLane } from '../llmConfig.js';

import type { ChatGraphState } from '../types.js';

/** @see services/ai/intermediateLanes.ts */
const LANE = intermediateLane('pruefung');

const log = createLogger('ChatGraph:EinfacheSpracheRueck');

/** Dateiname im intern-Repo unter `skills/`. */
const PROMPT_ID = 'rueckuebersetzung';

/**
 * Reichlich bemessen, und zwar aus zwei Richtungen: die Rückübersetzung ist
 * kürzer als ihre Vorlage (der Prompt verlangt das ausdrücklich), aber Gemma 4
 * ist ein Reasoning-Modell — seine Denk-Tokens zählen gegen dieses Budget, und
 * ein zu knapper Deckel liefert leeren `content` statt einer kurzen Antwort.
 * Siehe den Kopf von `intermediateLanes.ts`.
 */
const MAX_TOKENS = 3000;

export async function einfacheSpracheRueckuebersetzungNode(
  state: ChatGraphState,
  esText: string
): Promise<string | null> {
  const vorlage = esText.trim();
  if (!vorlage) {
    log.warn('[ES:Rueck] Keine ES-Fassung übergeben — Schritt übersprungen');
    return null;
  }

  const systemPrompt = getInternalSkillPrompt(PROMPT_ID);
  if (!systemPrompt) {
    log.warn(
      `[ES:Rueck] Kein interner Prompt "${PROMPT_ID}" — Schritt übersprungen. ` +
        'INTERN_CONTENT_DIR prüfen oder Salt-Rollout.'
    );
    return null;
  }

  const start = Date.now();
  try {
    const response = await state.aiWorkerPool.processRequest(
      {
        type: 'chat_einfache_sprache_rueck',
        provider: LANE.provider,
        systemPrompt,
        // GENAU eine Nachricht, und in ihr steht nur die ES-Fassung. Kein
        // `state.messages`, kein Verlauf, keine Anhänge — sonst ist die
        // Blindheit wieder dahin und der Schritt misst nichts mehr.
        messages: [{ role: 'user', content: vorlage }],
        options: { model: LANE.model, max_tokens: MAX_TOKENS, temperature: 0.2 },
      },
      null
    );

    const text = (response.content || '').trim();
    if (!text) {
      log.warn('[ES:Rueck] Leere Antwort — Schritt übersprungen');
      return null;
    }

    log.info(
      `[ES:Rueck] ${text.length} Zeichen aus ${vorlage.length} Zeichen Vorlage in ${Date.now() - start}ms`
    );
    return text;
  } catch (error: unknown) {
    log.warn(
      `[ES:Rueck] Fehler (fail-open): ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
