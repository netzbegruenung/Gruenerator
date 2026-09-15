/**
 * Ein Modell, das weiterreicht, statt zu scheitern.
 *
 * Die Fassade (`aiText`/`aiObject`/`aiTools`) hat seit jeher eine
 * Fallback-Kette; die Zwischenstufen aus `intermediateLanes.ts` hatten keine.
 * Wer sein Modell über `getIntermediateModel()` holt und direkt
 * `generateText`/`generateObject` ruft, hing an genau einem Anbieter — der
 * `try`/`catch` des Aufrufers war das ganze Netz. Am 29.08.2026 kostete das die
 * Auto-Verschlagwortung: Regolo antwortete mit HTTP 402
 * (`trial_expired`), und `ThreadTag` gab still auf, obwohl zwei andere
 * Vertragspartner dasselbe kleine Modell bedienen.
 *
 * Diese Hülle schliesst die Lücke, ohne die ~15 Aufrufstellen anzufassen:
 * `wrapLanguageModel` gibt der Kette dieselbe Gestalt wie ein einzelnes Modell.
 *
 * ── Zwei Ausfallarten, und warum beide zählen ──
 *
 * 1. **Der Aufruf wirft.** HTTP 402/429/503, Zeitüberschreitung, Netzfehler.
 * 2. **Der Aufruf gelingt und bringt nichts.** Leerer `content` ohne
 *    Werkzeugaufruf. Das ist im AI SDK KEIN Fehler, und es ist die Ausfallart,
 *    die dieses Repo schon zweimal gebissen hat: ein Reasoning-Modell auf einer
 *    Lane mit kleinem `maxOutputTokens` verbraucht das Budget im
 *    `reasoning`-Feld und liefert `content: []` bei `finishReason: 'length'`
 *    (siehe die gpt-oss-Messreihe im Kopf von `intermediateLanes.ts`). Ein
 *    Fallback, der nur auf Ausnahmen hört, sähe davon nichts.
 *
 * Die Prüfung ist dieselbe wie in `providerFallback.ts`: Text ODER Werkzeug-
 * aufruf gilt als Antwort. Reasoning allein gilt NICHT — genau das ist der
 * Fall, den 2. beschreibt.
 *
 * ── Was diese Hülle NICHT tut ──
 *
 * **Sie repariert keinen abgerissenen Stream.** Beim Streaming greift sie nur,
 * solange `doStream()` selbst ablehnt — also bevor das erste Zeichen beim
 * Nutzer ist. Bricht die Verbindung MITTEN im Strom, ist der Anfang der Antwort
 * bereits ausgeliefert; ein zweiter Anbieter würde ihn wiederholen statt
 * fortsetzen. Diesen Fall trägt weiterhin der Aufrufer.
 *
 * **Sie ist kein Hedge.** `IntermediateLaneConfig.hedge` schaltet einen zweiten
 * Anbieter PARALLEL dazu, wenn der Primär zu LANGSAM ist (siehe `runStep` in
 * routes/chat/services/agentPipeline.ts). Diese Kette läuft nacheinander und
 * erst, wenn der Primär FEHLSCHLÄGT. Beides existiert nebeneinander und ist
 * nicht dasselbe.
 */

import { wrapLanguageModel } from 'ai';

import type { LanguageModel, LanguageModelMiddleware } from 'ai';

/**
 * Die V4-Gestalt eines Modells, ABGELEITET statt importiert: `ai` exportiert
 * `LanguageModelV4` nicht (nur `@ai-sdk/provider` tut das, und das ist hier
 * keine deklarierte Abhängigkeit). Der Rückgabetyp von `wrapLanguageModel` IST
 * dieser Typ — damit bleibt die Kette an die SDK-Version gebunden, ohne sie zu
 * benennen.
 */
type WrappedModel = ReturnType<typeof wrapLanguageModel>;

/** Was als Antwort durchgeht: Text oder ein Werkzeugaufruf. */
function hasAnswer(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (typeof part !== 'object' || part === null) return false;
    const p = part as { type?: unknown; text?: unknown };
    if (p.type === 'tool-call') return true;
    return p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0;
  });
}

/** Ein Modell auf die V4-Gestalt bringen, damit die Kette `params` weiterreichen kann. */
function asV4(model: Exclude<LanguageModel, string>): WrappedModel {
  return wrapLanguageModel({ model, middleware: [] });
}

/**
 * `primary`, und bei Fehlschlag der Reihe nach `fallbacks`.
 *
 * Gibt `primary` unverändert zurück, wenn es nichts weiterzureichen gibt — eine
 * leere Kette soll keine Hülle kosten. Der Fehler, der am Ende geworfen wird,
 * ist der LETZTE echte Provider-Fehler und nicht eine zusammengefasste Prosa:
 * `NoAnswerError` läuft die `cause`-Kette entlang und braucht den Statuscode,
 * sonst kommt ein Ratenlimit beim Client als nacktes `internal` an (dieselbe
 * Begründung wie bei `aggregateFailure` in providerFallback.ts).
 */
export function withFallbackChain(
  primary: LanguageModel,
  fallbacks: readonly LanguageModel[],
  label: string
): LanguageModel {
  if (typeof primary === 'string') return primary;

  const chain = fallbacks.filter((m): m is Exclude<LanguageModel, string> => typeof m !== 'string');
  if (chain.length === 0) return primary;

  const nexts = chain.map(asV4);

  const middleware: LanguageModelMiddleware = {
    wrapGenerate: async ({ doGenerate, params }) => {
      let lastError: unknown;
      try {
        const result = await doGenerate();
        if (hasAnswer(result.content)) return result;
        lastError = new Error(`${label}: primary returned no content`);
        console.warn(`[LaneFallback] ${label}: primary returned no content, trying next`);
      } catch (err) {
        lastError = err;
        console.warn(`[LaneFallback] ${label}: primary failed (${message(err)}), trying next`);
      }

      for (const next of nexts) {
        try {
          const result = await next.doGenerate(params);
          if (hasAnswer(result.content)) {
            console.warn(`[LaneFallback] ${label}: answered by ${next.modelId}`);
            return result;
          }
          lastError = new Error(`${label}: ${next.modelId} returned no content`);
        } catch (err) {
          lastError = err;
          console.warn(`[LaneFallback] ${label}: ${next.modelId} failed (${message(err)})`);
        }
      }
      throw asError(lastError, label);
    },

    // Nur der Anlauf ist absicherbar — siehe Kopfkommentar.
    wrapStream: async ({ doStream, params }) => {
      let lastError: unknown;
      try {
        return await doStream();
      } catch (err) {
        lastError = err;
        console.warn(`[LaneFallback] ${label}: primary stream failed (${message(err)})`);
      }

      for (const next of nexts) {
        try {
          const result = await next.doStream(params);
          console.warn(`[LaneFallback] ${label}: streamed by ${next.modelId}`);
          return result;
        } catch (err) {
          lastError = err;
          console.warn(`[LaneFallback] ${label}: ${next.modelId} stream failed (${message(err)})`);
        }
      }
      throw asError(lastError, label);
    },
  };

  return wrapLanguageModel({ model: primary, middleware });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function asError(err: unknown, label: string): Error {
  if (err instanceof Error) return err;
  return new Error(`${label}: all targets failed`);
}
