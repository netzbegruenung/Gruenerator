/**
 * Was ein `mcp`-Turn tut, den ein Notausschalter aus der Schleife gehalten hat.
 *
 * Die MCP-Werkzeuge eines Servers existieren NUR in der agentischen Schleife —
 * `executeIntentPipeline` hat für `mcp` keinen Zweig, und `searchNode` bricht
 * für diesen Intent ohne Abruf ab. `decideRunAgentic` lässt den Turn deshalb
 * über `mustLoop` bedingungslos ins Gate, aber drei Einzeldurchlauf-Notausschalter
 * greifen auch danach noch: ein Verbund-Agent, ein zweiter Intent und ein
 * Bildanhang. Trifft einer davon, lief der Turn bis hierher stumm als
 * gewöhnliche Antwort aus dem Gedächtnis weiter — mit dem gewählten Server
 * ungefragt und ohne ein Wort darüber.
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

const COMPOUND: DeclineReason = {
  cause: 'dieser Grünerator-Agent arbeitet mit einer festen Wissenssammlung',
  remedy: 'die Frage im allgemeinen Chat statt bei diesem Agenten stellen',
};

const SECONDARY: DeclineReason = {
  cause: 'die Anfrage trägt neben dem Server noch eine zweite Absicht',
  remedy: 'die Frage auf den Server allein zuschneiden und Weiteres separat fragen',
};

/**
 * Der zweite Intent, den die Person NICHT gestellt hat: ein eingefügter Link
 * setzt `secondaryIntent: 'scrape_url'` von selbst (classifierNode, über der
 * Summary-Rückstufung), weil `mcp` die Disposition `gated` trägt und damit
 * nicht in `NO_RETRIEVAL_VERDICTS` steht. Für die Person ist das keine zweite
 * Absicht, sondern ein Link in ihrer Nachricht — und „Weiteres separat fragen"
 * wäre ein Rat, dem sie nicht folgen kann, weil sie nichts Zweites gefragt hat.
 */
const SCRAPE_URL: DeclineReason = {
  cause: 'die Anfrage enthält zusätzlich einen Link, der gelesen werden soll',
  remedy: 'den Link weglassen und ihn getrennt zusammenfassen lassen',
};

const IMAGE: DeclineReason = {
  cause: 'Anfragen an einen verbundenen Server können keine Bildanhänge verarbeiten',
  remedy: 'Bild entfernen oder die Frage ohne den Bildanhang erneut stellen',
};

/**
 * Auffang, falls die Kette hier ankommt, ohne dass einer der drei Schalter
 * greift. Heute unerreichbar (die vierte Sperre `hasSelectedNotebook` hebt
 * `mustLoop` für `mcp` auf, und `forcedLoop` deckt `forcedTool`), aber eine
 * neue Sperre in `decideRunAgentic` fiele sonst still auf den letzten Grund
 * der Liste zurück und nennte eine Abhilfe, die nichts ändert.
 */
const UNKNOWN: DeclineReason = {
  cause: 'dieser Turn lief als Einzeldurchlauf, in dem es keine Server-Werkzeuge gibt',
  remedy: 'die Frage in einem neuen Chat allein an den Server stellen',
};

/**
 * Jeder Grund mit SEINER Abhilfe, nicht zwei getrennte Aufzählungen.
 *
 * Zwei Listen nebeneinander gingen unter, sobald eine Abhilfe selbst ein „und"
 * oder „oder" trägt („Bild entfernen oder die Frage ohne den Bildanhang erneut
 * stellen"): mit „und" verkettet verschwimmt die Grenze zwischen den Abhilfen,
 * und die Person weiss nicht mehr, welche zu welchem Grund gehört. Bei EINEM
 * Grund bleibt der fliessende Satz — die Nummerierung wäre dort Beiwerk.
 */
function composeMessage(reasons: DeclineReason[]): string {
  const only = reasons[0];
  if (reasons.length === 1 && only) {
    return `Der gewählte Server wurde nicht befragt — ${only.cause}. Abhilfe: ${only.remedy}.`;
  }
  const items = reasons.map((r, i) => `(${i + 1}) ${r.cause} — Abhilfe: ${r.remedy}`).join('; ');
  return (
    `Der gewählte Server wurde nicht befragt. Es trafen mehrere Gründe zu, ` +
    `und sie müssen alle behoben sein: ${items}.`
  );
}

/**
 * ALLE zutreffenden Notausschalter, nicht nur der erste.
 *
 * Die Reihenfolge ist die Kurzschluss-Kette aus `decideRunAgentic`
 * (`!isCompound` → `secondaryAllowed` → `!hasImageAttachments`); welcher davon
 * dort zuerst greift, ist für die Person aber bedeutungslos — die Kette liefert
 * so oder so `false`. Nennte die Meldung nur einen von zweien, befolgte sie den
 * genannten Rat und würde erneut abgewiesen.
 */
function reasonsFor(state: ChatGraphState, hasImageAttachments: boolean): DeclineReason[] {
  const reasons: DeclineReason[] = [];
  if (state.isCompound) reasons.push(COMPOUND);
  if (state.secondaryIntent != null) {
    reasons.push(state.secondaryIntent === 'scrape_url' ? SCRAPE_URL : SECONDARY);
  }
  if (hasImageAttachments) reasons.push(IMAGE);
  return reasons.length > 0 ? reasons : [UNKNOWN];
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
  const reasons = reasonsFor(state, hasImageAttachments);
  const message = composeMessage(reasons);
  sendChatWarning(sse, 'mcp_not_consulted', message);
  state.degradationNotes = [
    ...(state.degradationNotes ?? []),
    {
      code: 'mcp_not_consulted',
      modelHint:
        `Der vom Nutzer per @-Erwähnung gewählte MCP-Server wurde für diesen Turn NICHT ` +
        `befragt. ${message} Sag das zu Beginn deiner Antwort ehrlich und nenne JEDEN ` +
        `genannten Grund samt seiner Abhilfe — eine allein löst den Turn nicht. Tu NICHT ` +
        `so, als hättest du Daten von diesem Server gesehen; wenn du trotzdem etwas ` +
        `beantworten kannst, kennzeichne es ausdrücklich als Antwort ohne diese Quelle.`,
    },
  ];
}
