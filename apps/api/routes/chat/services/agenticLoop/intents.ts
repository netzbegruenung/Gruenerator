/**
 * Welche Intents im agentischen Loop laufen — und welche davon einen Abruf
 * ausdrücklich benannt haben.
 *
 * Eigene Datei, damit die beiden Mengen nicht über den Orchestrator importiert
 * werden müssen: Router und Klassifikator brauchen NUR diese Aussage, nicht die
 * Loop-Maschinerie dahinter.
 */
import { type ChatIntentId, intentsWithDisposition } from '@gruenerator/shared/chat-intents';

/**
 * Was ÜBER die `loop`-Disposition hinaus in den Loop darf — und nur das steht
 * hier noch von Hand.
 *
 * Die `loop`-Gruppe selbst wird abgeleitet (siehe `AGENTIC_INTENTS`), weil die
 * eine Richtung ohnehin gelten MUSS: ein Intent, dessen Werkzeugwahl der Planer
 * trifft, muss den Planer auch erreichen. Ein `loop`-Intent, der hier fehlte,
 * würde ohne jede Recherche beantwortet. `dispositionSets.vitest.ts` hat genau
 * das bisher als Test erzwungen — abgeleitet kann es gar nicht mehr eintreten.
 *
 * Diese vier sind die Gegenrichtung, die NICHT gilt, und deshalb bleiben sie
 * ausgeschrieben: sie laufen IM Loop, aber ihr Verdikt muss vorher feststehen,
 * weil es steuert, was dort montiert wird (`hilfe`/`summary`/`mcp` mounten ihr
 * eigenes Domain-Tool über `buildChatToolCatalog`) bzw. weil es Geld kostet
 * (`image`). Wer die Liste ändert, ändert eine Aussage.
 *
 * Zwei Eigenheiten, die nur hier stehen:
 *  - `mcp` betritt den Loop, wenn die Person Server verbunden hat — das
 *    Router-Gate muss es durchlassen TROTZ des `@<server>`-forcedTool-Flags,
 *    das sonst jeden Turn single-pass hält.
 *  - `image` (generate) betritt ihn nur für anhanglose Turns; `image_edit`
 *    braucht einen Anhang, und das Router-Gate schliesst die aus.
 *
 * Nicht im Loop und ausdrücklich so gewollt: `direct`/`greeting`/`produktion`
 * (Disposition `prose`) behalten den werkzeuglosen Schnellpfad, damit „hallo"
 * nie Loop-Overhead zahlt.
 *
 * Historie, die sonst verloren ginge:
 *  - `research` stand hier als AUSNAHME (ausgeschlossen), solange es eine zweite
 *    Engine war: es rief Linkups `sourcedAnswer`, das seine eigenen Zitate
 *    nummerierte und mit der `[N]`-Registry des Loops nicht zusammenging. Die
 *    Engine ist weg; der Ausschluss kostete gemessen 3 Quellen in 31s gegen 10
 *    in 15s für dieselbe Frage ohne das Wort „recherchiere". Heute trägt
 *    `research` die `loop`-Disposition und kommt über die Ableitung.
 *  - `bahn`/`reise`/`hotel`/`wetter`/`news` standen hier. Sie sind verwaltete
 *    Connectoren und keine Intents mehr; was den Loop für sie öffnet, ist
 *    `managedSourceKeys` (siehe `decideRunAgentic`), nicht diese Menge.
 */
const AGENTIC_EXTRA_IDS = [
  'mcp',
  'summary',
  'hilfe',
  'image',
] as const satisfies readonly ChatIntentId[];

/**
 * `loop`-Disposition + die vier Zusätze. Abgeleitet statt aufgezählt: ein neuer
 * `loop`-Intent ist damit automatisch drin, statt dass ein Test daran erinnern
 * muss.
 *
 * Typisiert als ChatIntentId, nicht string: ein Tippfehler oder ein umbenannter
 * Intent kompilierte hier bisher und traf zur Laufzeit einfach nie.
 */
export const AGENTIC_INTENTS: ReadonlySet<ChatIntentId> = new Set([
  ...intentsWithDisposition('loop'),
  ...AGENTIC_EXTRA_IDS,
]);

/**
 * Intents, bei denen der Klassifikator die Recherche AUSDRÜCKLICH benannt hat.
 *
 * Abgeleitet aus der Dispositions-Achse: `loop` heisst „der Planer wählt die
 * Werkzeuge" — aber `agentic` ist der AUFFANGWERT dieser Gruppe und darf
 * deshalb nicht zwingen, sonst würde jede unklare Frage einen Werkzeugaufruf
 * erzwingen. Für die aus einem Recherche-Verdikt demotierten `agentic`-Turns
 * gibt es `loopDemotedFromRetrieval`, das genau diese Herkunft festhält.
 */
export const NAMED_RETRIEVAL_INTENTS: ReadonlySet<string> = new Set(
  [...intentsWithDisposition('loop')].filter((id) => id !== 'agentic')
);
