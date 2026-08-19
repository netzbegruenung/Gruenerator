/**
 * Was ein `mcp`-Turn tut, den ein Notausschalter aus der Schleife gehalten hat.
 *
 * Die MCP-Werkzeuge eines Servers existieren NUR in der agentischen Schleife —
 * `executeIntentPipeline` hat für `mcp` keinen Zweig, und `searchNode` bricht
 * für diesen Intent ohne Abruf ab. `decideRunAgentic` lässt den Turn deshalb
 * über `mustLoop` bedingungslos ins Gate, aber drei Einzeldurchlauf-Notausschalter
 * greifen auch danach noch: ein Bildanhang, ein Verbund-Agent und ein zweiter
 * Intent. Trifft einer davon, lief der Turn bis hierher stumm als gewöhnliche
 * Antwort aus dem Gedächtnis weiter — mit dem gewählten Server ungefragt und
 * ohne ein Wort darüber.
 *
 * Warum kein `degradeTo` auf `web` statt dieser Absage: eine Websuche ist eine
 * ANDERE Quelle als der gemeinte Server, nicht eine schwächere. Für die
 * Parlaments-Abrufe steht ein Ziel in der Registry, weil dort dieselbe Frage
 * schlechter, aber richtig beantwortet wird; hier wäre die Antwort schlicht aus
 * einer Quelle, die niemand gewählt hat (siehe `fallbackIntentFor` in
 * `turnPlan.ts`).
 *
 * Beide Kanäle aus einem Fakt, wie bei {@link reportUnavailableSources}: die
 * Warnung ist das Telemetriesignal, der `degradationNote` bringt die ANTWORT
 * dazu, den Grund selbst zu nennen und den Ausweg zu benennen.
 */

import { sendChatWarning } from '../sseHelpers.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';

/** Der Notausschalter, der den Turn draussen gehalten hat, in Nutzer-Sprache. */
interface DeclineReason {
  /** Was schiefging, aus Sicht der Person. */
  cause: string;
  /** Was sie dagegen tun kann. */
  remedy: string;
}

function reasonFor(state: ChatGraphState, hasImageAttachments: boolean): DeclineReason {
  // Reihenfolge wie in `decideRunAgentic`: der erste zutreffende Notausschalter
  // ist der, den die Person abstellen kann.
  if (hasImageAttachments) {
    return {
      cause: 'Anfragen an einen verbundenen Server können keine Bildanhänge verarbeiten',
      remedy: 'Bild entfernen oder die Frage ohne den Bildanhang erneut stellen',
    };
  }
  if (state.isCompound) {
    return {
      cause: 'dieser Grünerator-Agent arbeitet mit einer festen Wissenssammlung',
      remedy: 'die Frage im allgemeinen Chat statt bei diesem Agenten stellen',
    };
  }
  return {
    cause: 'die Anfrage trägt neben dem Server noch eine zweite Absicht',
    remedy: 'die Frage auf den Server allein zuschneiden und Weiteres separat fragen',
  };
}

/**
 * Sagt der Person, dass der gewählte Server nicht befragt wurde — und warum.
 *
 * Mutiert `state.degradationNotes` an Ort und Stelle, wie
 * {@link reportUnavailableSources}: der Aufrufer reicht denselben State weiter,
 * den der Respond-Knoten danach liest.
 */
export function reportMcpWithoutLoop(
  sse: SSEWriter,
  state: ChatGraphState,
  hasImageAttachments: boolean
): void {
  const { cause, remedy } = reasonFor(state, hasImageAttachments);
  sendChatWarning(
    sse,
    'mcp_not_consulted',
    `Der gewählte Server wurde nicht befragt — ${cause}. Abhilfe: ${remedy}.`
  );
  state.degradationNotes = [
    ...(state.degradationNotes ?? []),
    {
      code: 'mcp_not_consulted',
      modelHint:
        `Der vom Nutzer per @-Erwähnung gewählte MCP-Server wurde für diesen Turn NICHT ` +
        `befragt: ${cause}. Sag das zu Beginn deiner Antwort ehrlich und nenne den Ausweg ` +
        `(${remedy}). Tu NICHT so, als hättest du Daten von diesem Server gesehen; wenn du ` +
        `trotzdem etwas beantworten kannst, kennzeichne es ausdrücklich als Antwort ohne ` +
        `diese Quelle.`,
    },
  ];
}
