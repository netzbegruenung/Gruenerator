import { type ChatIntentId } from './index.js';

/**
 * Wo ein Turn läuft, dessen Intent FESTGEZURRT ist.
 *
 * Zweite Achse neben der Disposition, und bewusst eine andere Frage.
 * `DISPOSITION_BY_INTENT` beantwortet „was muss vor der Antwort feststehen?" —
 * eine Aussage über das Verdikt des Klassifikators. Diese Karte beantwortet
 * „wenn niemand mehr wählt, weil die Person den Intent per @-Erwähnung gesetzt
 * hat: welcher Ausführungspfad bekommt den Turn?". Die beiden fallen
 * auseinander: `bundestag` ist `loop` disponiert (der Planer darf das Werkzeug
 * wählen) und lief bis 08/2026 trotzdem als Einzeldurchlauf, sobald `@bundestag`
 * fiel — weil `forcedTool` im Entscheider ein Loop-Notausschalter ist.
 *
 * Warum die Achse überhaupt existiert: das @-Mention-System ist der universelle
 * Stilllegungs-Blocker der Intent-Achse (Messung Phase H, Kopfkommentar in
 * `dispositions.ts`). Eine Erwähnung erzwingt heute einen *Intent*, obwohl das
 * Wire-Token längst werkzeugförmig ist (`@[Label](tool:bundestag)`). Solange die
 * Antwort auf „wo läuft ein erzwungener Turn?" als if-Kette im Router steht,
 * kann kein Intent sterben, ohne dass jemand diese Kette liest. Hier steht sie
 * einmal, typgeprüft.
 *
 * Total über `ChatIntentId` aus demselben Grund wie die Dispositionskarte: ein
 * neuer Intent bricht den Build, bis jemand entscheidet, wohin eine Erwähnung
 * für ihn führen würde. Für die Intents, die gar nicht erwähnbar sind, ist der
 * Eintrag keine Dekoration, sondern die Antwort auf den hypothetischen Fall —
 * `forcedTool` hat einen zweiten Ursprung ausser Erwähnungen
 * (`earlyHandlerStage` setzt es für die Sharepic-Verfeinerung per Textheuristik).
 */
export type ForcedLane =
  /**
   * Die agentische Schleife. Für diese Intents ist ein Werkzeugzwang KEIN Grund,
   * den Turn einzeln zu halten — im Gegenteil: ihr Werkzeug lebt dort.
   */
  | 'loop'
  /** `executeIntentPipeline` — der deterministische Einzeldurchlauf. */
  | 'single-pass'
  /**
   * Eine eigene Erstellroute in `createIntentStage`, die den Turn ganz
   * übernimmt. Diese vier werden nicht über `classifiedState.intent` erreicht,
   * sondern direkt über ihren `forcedTool`-String — `@pdf-erstellen` setzt
   * deshalb bis heute weder Intent noch das `forcedTool`-Flag.
   */
  | 'pipeline';

/**
 * Seit Phase N trägt `loop` nur noch EINEN Grund: für diese Intents gibt es
 * keinen Einzeldurchlauf.
 *
 * `mcp`/`hilfe` war das immer schon — `executeIntentPipeline` hat für sie gar
 * keinen Zweig, ein Einzeldurchlauf liesse den Turn ohne Ausführenden. Diese
 * Tatsache heisst im Entscheider `mustLoop` und trägt dort mehr als diese Achse
 * (bedingungsloses Gate, Notebook-Ausnahme). `umfragen` stand hier als dritter
 * und ist stillgelegt — sein Turn kommt über den Werkzeug-Pin in die Schleife,
 * nicht über diese Karte.
 *
 * `bundestag`/`abgeordnetenwatch` HATTEN einen Einzeldurchlauf-Executor in
 * `searchNode` und tragen `loop` seit Phase K, weil eine ERWÄHNUNG dort besser
 * bedient ist: der Einzeldurchlauf ruft genau eine Suche und schreibt darüber,
 * während die Schleife nachfassen, mit anderen Quellen kombinieren und bei
 * leerem Ergebnis ausweichen kann. Nachdem der Loop-Pfad sich bewährt hatte,
 * ist die dünne Tür in Phase N gefallen; der gemeinsame Kern (`retrieveBundestag`
 * /`retrieveAbgeordnetenwatch`) hängt jetzt nur noch am Loop-Werkzeug.
 *
 * Damit beantwortet die Achse zwei Fragen, die vorher auseinanderfielen: wohin
 * ein ERZWUNGENER Turn geht, UND wer keinen Einzeldurchlauf hat. Der Entscheider
 * nutzt beides — `forcedLane: 'loop'` hebt weiterhin nur den
 * forcedTool-Notausschalter auf, und wenn ein anderer Notausschalter greift,
 * degradiert `fallbackIntentFor` über das `degradeTo` der Registry, statt den
 * Turn stranden zu lassen.
 *
 * **Wer hier einen Intent einträgt, trägt ihm ein `degradeTo` nach** — sonst
 * gibt es einen Zustand (Notausschalter greift), in dem niemand den Turn
 * ausführt. `mcp` ist die begründete Ausnahme: für ihn wäre eine Websuche keine
 * Degradierung, sondern eine andere Quelle als die gewählte.
 */
export const FORCED_LANE_BY_INTENT: Record<ChatIntentId, ForcedLane> = {
  // ── loop — es gibt keinen Einzeldurchlauf für sie ─────────────────────────
  // Die ersten beiden hatten nie einen; die beiden darunter haben ihn in
  // Phase N verloren, nachdem der Loop-Pfad sich bewährt hatte.
  mcp: 'loop',
  hilfe: 'loop',
  bundestag: 'loop',
  abgeordnetenwatch: 'loop',

  // ── pipeline — eigene Erstellroute, dispatcht auf den forcedTool-String ────
  save_as_doc: 'pipeline',
  create_sheet: 'pipeline',
  create_presentation: 'pipeline',
  create_pdf: 'pipeline',

  // ── single-pass ───────────────────────────────────────────────────────────
  // Erwähnbar und heute per Einzeldurchlauf bedient.
  research: 'single-pass',
  search: 'single-pass',
  examples: 'single-pass',
  chat_history: 'single-pass',
  image: 'single-pass',
  image_edit: 'single-pass',
  sharepic: 'single-pass',
  chart: 'single-pass',
  summary: 'single-pass',
  compute: 'single-pass',
  // Stillgelegt, aber der Token lebt: `@social` ist als Erwähnung weg, steht
  // aber in persistierten Threads und in ausgelieferten Composern (F0). Er
  // landet über `forcedIntentStage` auf `produktion` — die Zeile hier sagt nur,
  // dass ein solcher Zwang den Einzeldurchlauf nähme, nie die Schleife.
  social_post: 'single-pass',
  // Nicht erwähnbar. Der Eintrag sagt, wo ein Zwang LANDEN würde — und für
  // `sharepic` oben ist das keine Hypothese: die Verfeinerungs-Heuristik in
  // `earlyHandlerStage` setzt `forcedTool` ohne jede Erwähnung.
  compare: 'single-pass',
  web: 'single-pass',
  scrape_url: 'single-pass',
  artifact: 'single-pass',
  modify_doc: 'single-pass',
  edit_current_doc: 'single-pass',
  edit_current_board: 'single-pass',
  modify_board: 'single-pass',
  share_doc: 'single-pass',
  edit_sheet: 'single-pass',
  produktion: 'single-pass',
  direct: 'single-pass',
  greeting: 'single-pass',
  agentic: 'single-pass',
  // Stillgelegt (`availability: 'retired'`): nichts erzeugt diese Verdikte, und
  // keine Erwähnung emittiert sie. Der Eintrag existiert nur, weil die Karte
  // total ist — siehe die Begründung an `Disposition` `'retired'`.
  //
  // `umfragen` steht mit ihnen, aber sein Eintrag ist NICHT wirkungslos-per-
  // Definition: `@umfragen` gibt es weiter, es zurrt nur kein Verdikt mehr fest,
  // sondern das Werkzeug (`IntentMention.pinsTool`). Der Turn läuft als
  // `agentic`, und was ihn in die Schleife zwingt, ist der Pin — siehe
  // `turnPlan.ts`. Stünde hier `loop`, wäre das eine Aussage über einen Intent,
  // den niemand mehr festzurrt.
  umfragen: 'single-pass',
  // Dasselbe für `@pressemitteilungen`: der Pin zwingt den Turn in die
  // Schleife, nicht diese Zeile.
  pressemitteilung_examples: 'single-pass',
  // `create_recurring_task` hat gar keine Erwähnung; der Pin kommt aus Tier 3.4
  // des Klassifikators. Auch hier zwingt der Pin, nicht die Zeile.
  create_recurring_task: 'single-pass',
  bahn: 'single-pass',
  reise: 'single-pass',
  hotel: 'single-pass',
  wetter: 'single-pass',
  news: 'single-pass',
};

/**
 * Die Lane eines festgezurrten Turns, oder `null` für einen Nicht-Intent.
 *
 * Nimmt `string` und nicht `ChatIntentId`, aus demselben Grund wie
 * {@link isGroundableProse}: die Aufrufer führen den Intent teils als `string`
 * aus einem Graph-Zustand, und ein `as ChatIntentId` je Aufrufstelle wäre
 * dieselbe Zusicherung mehrfach.
 */
export function forcedLaneOf(intent: string): ForcedLane | null {
  return FORCED_LANE_BY_INTENT[intent as ChatIntentId] ?? null;
}

/**
 * Ob ein Zwang auf diesen Intent in die agentische Schleife führt.
 *
 * Der Test, den der Turn-Entscheider stellt. Als Funktion und nicht als Set,
 * damit die Karte die einzige Aufzählung bleibt.
 */
export function forcesLoopLane(intent: string): boolean {
  return forcedLaneOf(intent) === 'loop';
}

/** Alle Intents einer Lane, als Set. */
export function intentsWithForcedLane(lane: ForcedLane): ReadonlySet<ChatIntentId> {
  return new Set(
    (Object.keys(FORCED_LANE_BY_INTENT) as ChatIntentId[]).filter(
      (id) => FORCED_LANE_BY_INTENT[id] === lane
    )
  );
}
