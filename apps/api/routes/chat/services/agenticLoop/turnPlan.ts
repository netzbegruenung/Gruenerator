/**
 * Der eine Turn-Entscheider: „wie läuft dieser Turn, und unter welchem Intent?"
 *
 * Die Antwort lag bisher auf drei Schichten, die sich gegenseitig korrigierten —
 * der Klassifikator schlug einen Intent vor, das Router-Gate entschied getrennt
 * über die Schleife, und wenn beide nicht zusammenpassten, schrieb der Router
 * den Intent hinterher um (`agentic`→`search`, System-Tool→`web`). Die
 * Umschreibung war kein Sonderfall, sondern die Naht: `executeIntentPipeline`
 * hat keinen `agentic`-Zweig, ein demotierter Turn wäre dort gestrandet.
 *
 * Hier fällt beides in EINER Funktion, in der Reihenfolge, in der es fallen
 * muss, und `plan.intent` ist danach endgültig — niemand schreibt ihn mehr um.
 * Die Prädikate selbst sind unverändert aus `routing.ts` übernommen; diese Datei
 * ordnet sie, sie erfindet nichts.
 *
 * Rein und importarm wie `routing.ts`, aus demselben Grund: was der Aufrufer nur
 * mit einem schweren Import beantworten kann (verwaltete Konnektoren,
 * Pipeline-Agent, PDF-Formularlage), wird als Feld hereingereicht statt hier
 * geholt. `decisionJournal` ist der einzige Zusatz und selbst ein Blatt.
 */
import {
  type ArtifactCreateKind,
  type ChatIntentId,
  forcesLoopLane,
} from '@gruenerator/shared/chat-intents';

import { recordDecision } from '../../../../utils/decisionJournal.js';

import {
  compoundGenerationKind,
  decideEditToolLoop,
  decideRunAgentic,
  isEditorSurface,
  looksLikeCompoundEdit,
  resolveEditorSurfaceKind,
  type CompoundGenerationKind,
  type EditorSurfaceKind,
} from './routing.js';

/**
 * Wie der Turn ausgeführt wird. Die Reihenfolge ist die Auswertungsreihenfolge:
 * `pipeline` vetos alles, danach gewinnt der spezifischere Loop-Grund.
 */
export type TurnLane =
  /** Pipeline-Agent (Einfache/Leichte Sprache): eigene Kette, nie die Schleife. */
  | 'pipeline'
  /** Editor-Seitenleiste mit Werkzeugpfad — die Schleife bearbeitet das offene Artefakt. */
  | 'edit-loop'
  /** Recherche, dann Bearbeitung des offenen Dokuments/Boards. */
  | 'compound-edit'
  /** Gewöhnliche agentische Schleife. */
  | 'loop'
  /** Deterministischer Einzeldurchlauf (`executeIntentPipeline`). */
  | 'single-pass';

export interface TurnPlan {
  lane: TurnLane;
  /**
   * Der endgültige Intent. Enthält bereits die Auffang-Umschreibungen
   * (`fallbackIntentFor`) — nach `decideTurnPlan` schreibt ihn niemand mehr um.
   */
  intent: ChatIntentId;
  /** `lane` läuft in der agentischen Schleife. Abgeleitet, nicht zweitentschieden. */
  runAgentic: boolean;
  /**
   * Recherche + Bearbeitung des offenen Artefakts. Steht neben `lane`, weil ein
   * Turn zugleich `edit-loop` sein kann: `artifactEmitStage` fragt beide.
   */
  compoundEdit: boolean;
  editToolLoop: boolean;
  editTarget: 'doc' | 'board' | null;
  /** Die Fläche, deren `edit_document` montiert wird — nur bei `editToolLoop`. */
  editToolSurface: EditorSurfaceKind | null;
  compoundGenerationKind: CompoundGenerationKind | null;
  /**
   * Der System-Tool-Auffang hat auf `web` umgeschrieben. Diese Intents sind
   * NON_SEARCH, der Klassifikator hat `searchQuery` also genullt — ohne
   * Nachtrag würde der Web-Zweig nach '' suchen.
   */
  backfillSearchQuery: boolean;
}

export interface TurnPlanInput {
  /** CHAT_AGENT_LOOP — EINMAL pro Turn gelesen und hier hereingereicht. */
  loopEnabled: boolean;
  /** AGENTIC_INTENTS, injiziert wie bei {@link decideRunAgentic}. */
  agenticIntents: ReadonlySet<string>;
  /** SYSTEM_TOOL_INTENTS — ihre Werkzeuge existieren nur in der Schleife. */
  systemToolIntents: ReadonlySet<string>;
  /** Der VORSCHLAG des Klassifikators. Das Ergebnis steht in `plan.intent`. */
  intent: ChatIntentId;
  lastUserText: string;
  forcedTool: boolean;
  isCompound: boolean;
  hasSelectedNotebook: boolean;
  hasManagedSources: boolean;
  hasImageAttachments: boolean;
  secondaryIntent: string | null;
  isPdfFillRequest: boolean;
  classifierContradictedResearch: boolean;
  hasOwnMaterial: boolean;
  /** Die Werkzeug-Schalter der Fläche — `edit_current_doc`/`edit_current_board`. */
  enabledTools: Record<string, boolean> | null;
  /** Agenten-Kennung, für die Auflösung der Editor-Fläche. */
  agentIdentifier: string | null;
  /** Ein offenes Dokument MIT id — nur ein adressierbares Ziel ist bearbeitbar. */
  hasOpenDocumentId: boolean;
  hasOpenBoardId: boolean;
  /**
   * Überhaupt ein Board-Editor offen. Bewusst schwächer als
   * {@link hasOpenBoardId} und als eigenes Feld geführt: die
   * `modify_board`-Demotion fragt nur nach der Präsenz, das Bearbeitungsziel
   * nach der id. Zusammengelegt wäre der Unterschied unsichtbar.
   */
  hasOpenBoardSurface: boolean;
  /** Ein @board-Mention oder mitgeschickte boardIds benennen ein Ziel. */
  hasNamedBoard: boolean;
  /** Sharepic-Verfeinerung — hält die Verbund-Erzeugung aus dem Weg. */
  isSharepicRefinement: boolean;
  /** Der erzwungene Intent des Pipeline-Agenten, oder null. */
  pipelineForceIntent: ChatIntentId | null;
  /**
   * Das Werkzeug, das eine @-Erwähnung festgezurrt hat (`mentionPinnedTool`).
   * Der zweite Weg in die Schleife neben der `forcedLane`-Achse — siehe unten.
   */
  mentionPinnedTool: string | null;
  /**
   * Die von einer `@…-erstellen`-Erwähnung festgezurrte Artefaktart
   * (`mentionPinnedArtifactKind`). Schlägt die Substantiv-Ableitung, nicht die
   * Verbund-Gitter: OB der Turn ein Verbund ist, entscheidet weiterhin das
   * Recherchesignal bzw. der Erstell-Auftrag — die Erwähnung sagt nur, WAS
   * gebaut würde.
   */
  mentionPinnedArtifactKind: ArtifactCreateKind | null;
}

/**
 * Worauf ein Intent zurückfällt, dem die Schleife verwehrt bleibt.
 *
 * Beide Fälle sind dieselbe Aussage: der Intent bezeichnet eine Ausführung, die
 * es nur IN der Schleife gibt. `agentic` hat in `executeIntentPipeline` gar
 * keinen Zweig, die System-Tool-Intents (`umfragen`/`hilfe`) haben dort ihre
 * Werkzeuge nicht. Ein Turn, den ein Notausschalter (Verbund, erzwungenes
 * Werkzeug, Bild-Anhang) draußen hält, muss also woanders hin, statt zu
 * stranden.
 *
 * Die beiden Prüfungen sind nacheinander, nicht ausschließend — so standen sie
 * im Router. Überschneiden können sie sich nicht: `agentic` ist kein
 * System-Tool-Intent.
 */
function fallbackIntentFor(
  intent: ChatIntentId,
  isSystemToolIntent: boolean
): { intent: ChatIntentId; backfillSearchQuery: boolean } {
  let next = intent;
  let backfillSearchQuery = false;
  // Dies IST der Opt-out-Pfad, nicht bloss ein Wiederaufnahme-Rest. Tier 3.5
  // demotiert ein Prosa-Verdikt seit dem 16.08.2026 unabhängig von
  // CHAT_AGENT_LOOP, gerade damit ein abruf-förmiger Turn hier ankommt und
  // sucht, statt beim Klassifikator als `produktion` — also als Antwort aus dem
  // Gedächtnis — liegenzubleiben. Mit ausgeschalteter Schleife ist dieser Zweig
  // deshalb der Normalfall. Dazu weiterhin der WIEDERAUFNAHME-Pfad: ein
  // gespeicherter `agentic`-Intent, der nach einem Deploy mit umgelegtem
  // Schalter fortgesetzt wird.
  if (next === 'agentic') {
    recordDecision('router.intent_override', 'agentic_to_search', {
      inputs: { intentBefore: 'agentic', runAgentic: false },
    });
    next = 'search';
  }
  if (isSystemToolIntent) {
    recordDecision('router.intent_override', 'system_tool_to_web', {
      inputs: { intentBefore: next, runAgentic: false, isSystemToolIntent },
    });
    next = 'web';
    backfillSearchQuery = true;
  }
  return { intent: next, backfillSearchQuery };
}

/**
 * Die eine Entscheidung pro Turn. Genau EINMAL aufrufen — die Journal-Einträge
 * (`router.run_agentic`, `router.intent_override`) hängen daran und ein zweiter
 * Aufruf hieße im Entscheidungsprotokoll, ein Gitter habe zweimal gefeuert.
 *
 * Sortierstufen, in dieser Reihenfolge:
 *  1. Editor-Fläche — welches Artefakt wird bearbeitet, mit welchem Pfad.
 *  2. Intent-Korrekturen VOR dem Gate (Board-Demotion, Pipeline-Zwang), weil das
 *     Gate den korrigierten Intent bewerten muss.
 *  3. Das Loop-Gate selbst.
 *  4. Der Auffang-Intent für alles, was das Gate ausgesperrt hat.
 */
export function decideTurnPlan(p: TurnPlanInput): TurnPlan {
  const proposedIntent = p.intent;
  // Für einen `mcp`-Turn heisst `forcedTool` „die Person hat DIESEN Konnektor
  // gewählt" (via @<server>), NICHT „ein deterministisches Einzelwerkzeug
  // anheften" — er darf also trotzdem in die Schleife, die dann die MCP-Tools
  // dieses Servers montiert. `umfragen` (PolitPro) und `hilfe` (hausinterner
  // Doku-Index) sind native Domain-Tools, immer verfügbar, und erzwingen das
  // Gate bedingungslos. `hilfe` MUSS dabei sein: @doku setzt `forcedTool`, und
  // ohne diese Ausnahme hielte `decideRunAgentic` den Turn einzeln — dort
  // existiert `gruenerator_docs_search` nicht, die Erwähnung täte still nichts.
  //
  // Die fünf System-MCP-Intents erzwangen das Gate früher ebenfalls hier, über
  // eine Verfügbarkeitsprüfung, die auch das Land trug. Beide Aufgaben stecken
  // heute in `hasManagedSources`: der Trigger benennt die Konnektoren, und
  // `loadManagedMcpCatalog` wendet Länderfilter und Opt-out an der Montage
  // selbst an — ein Ort statt zweier, die sich einig sein mussten.
  //
  // Aus dem VORGESCHLAGENEN Intent, vor jeder Korrektur unten: ein Turn, den die
  // Board-Demotion auf `agentic` zieht, war nie ein MCP-Turn, und ein
  // Pipeline-Zwang macht aus `hilfe` kein `produktion`, das noch Werkzeuge
  // erwartet — dieses Gate soll die Schleife für die ERWÄHNUNG erzwingen.
  //
  // Das Literal (`mcp | umfragen | hilfe`) beantwortete ZWEI Fragen auf einmal,
  // die nur deshalb dieselbe Antwort hatten, weil dieselben drei Intents beide
  // Male gemeint waren. Sie fallen ab dem ersten Flip auseinander:
  //
  //  - `mustLoop` — für diesen Intent gibt es GAR KEINEN Einzeldurchlauf.
  //    `mcp` steht ausdrücklich daneben statt in `systemToolIntents`: die
  //    Menge dort beschreibt die nativen Domain-Werkzeuge, und ein `mcp`-Turn
  //    ohne Schleife fiele über `fallbackIntentFor` auf `web` — eine Websuche
  //    statt des gewählten Konnektors.
  //  - `forcedLoop` — eine Erwähnung dieses Intents gehört in die Schleife.
  //    Das ist die `forcedLane`-Achse der Registry, und nur sie darf ein Intent
  //    tragen, der einen eigenen Executor HAT.
  //
  // Ein per Erwähnung gepinntes WERKZEUG beantwortet beide Fragen noch einmal,
  // ohne einen Intent zu bemühen — genau dafür gibt es den Pin:
  //
  //  - Es gehört in die Schleife, denn dort und nur dort existieren Werkzeuge.
  //    Der Pin IST die Wahl der Person, also darf er denselben Notausschalter
  //    aufheben wie die Achse.
  //  - Trägt kein Intent den Turn (`agentic` hat in `executeIntentPipeline`
  //    keinen Zweig), kann ihn NUR die Schleife ausführen. Ohne diese Hälfte
  //    fiele `@umfragen` mit ausgeschalteter Schleife oder gewählter
  //    Wissenssammlung über `fallbackIntentFor` auf `search` — eine
  //    Dokumentensuche statt PolitPro, und damit schlechter als vor der
  //    Stilllegung des Intents.
  const pinnedTool = p.mentionPinnedTool;
  const mustLoop =
    proposedIntent === 'mcp' ||
    p.systemToolIntents.has(proposedIntent) ||
    (pinnedTool != null && proposedIntent === 'agentic');
  const forcedLoop = forcesLoopLane(proposedIntent) || pinnedTool != null;

  // ── 1. Editor-Fläche ──────────────────────────────────────────────────────
  // Editor-Seitenleisten (docs/sheets/presentations/boards) BEARBEITEN das
  // offene Dokument — sie erzeugen nie ein neues.
  const editorSurface = isEditorSurface(p.enabledTools);
  // Das Ziel hängt am AKTIVIERTEN Bearbeitungswerkzeug, nicht daran, welches
  // Artefakt zufällig im Kontext liegt: eine Board-Seitenleiste, die auch ein
  // referenziertes Dokument trägt, muss trotzdem das BOARD bearbeiten.
  const editTarget: 'doc' | 'board' | null =
    p.enabledTools?.['edit_current_doc'] === true && p.hasOpenDocumentId
      ? 'doc'
      : p.enabledTools?.['edit_current_board'] === true && p.hasOpenBoardId
        ? 'board'
        : null;

  // Verbund aus Recherche + Erzeugung: eine Erzeugungsbitte (Sharepic,
  // Präsentation, Tabelle, Textdokument, Board) MIT ausdrücklichem
  // Recherchesignal geht mit dem passenden Fett-Werkzeug durch die Schleife;
  // reine Erzeugung behält die direkte Zuteilung. Die ART wird aus dem Intent
  // ODER — bei einem auf `agentic` demotierten Turn — aus dem Substantiv im Text
  // gewonnen, damit „mach mir eine Tabelle draus" das Tabellen-Werkzeug montiert.
  const compoundKind =
    !p.forcedTool && !p.isSharepicRefinement && !editorSurface
      ? compoundGenerationKind(proposedIntent, p.lastUserText, p.mentionPinnedArtifactKind)
      : null;

  // Verbund „recherchiere UND bau es ins offene Dokument ein". Dieselben
  // Notausschalter wie {@link decideRunAgentic}, damit das Erzwingen der
  // Schleife hier sie nicht umgehen kann.
  const compoundEdit =
    editorSurface &&
    editTarget != null &&
    !p.forcedTool &&
    p.loopEnabled &&
    !p.isCompound &&
    !p.hasSelectedNotebook &&
    !p.hasImageAttachments &&
    looksLikeCompoundEdit(p.lastUserText);

  // Werkzeugbasierte Editor-Bearbeitung: der Turn geht mit dem `edit_document`
  // der Fläche in die Schleife, damit das Modell suchen und das OFFENE Artefakt
  // an Ort und Stelle ändern kann (`editor_operations`-SSE) statt über den
  // Client-Umweg /api/{sheets,…}/:id/ai. Welche Flächen einen Werkzeugpfad
  // haben und warum die noch lebenden (doc/board/canvas) beim alten
  // trigger_doc_edit bleiben, steht bei {@link decideEditToolLoop}.
  const editToolSurfaceKind = resolveEditorSurfaceKind(p.agentIdentifier, p.enabledTools);
  const editToolLoop = decideEditToolLoop({
    loopEnabled: p.loopEnabled,
    surfaceKind: editToolSurfaceKind,
    editToolEnabled:
      p.enabledTools?.['edit_current_doc'] === true ||
      p.enabledTools?.['edit_current_board'] === true,
    hasEditTarget: editTarget != null,
    forcedTool: p.forcedTool,
    isCompound: p.isCompound,
    hasSelectedNotebook: p.hasSelectedNotebook,
    hasImageAttachments: p.hasImageAttachments,
    secondaryIntent: p.secondaryIntent,
  });

  // ── 2. Intent-Korrekturen VOR dem Gate ────────────────────────────────────
  let intent: ChatIntentId = proposedIntent;
  // Konversationelles Board-Anhängen („häng den fertigen Post an mein Board"):
  // der Klassifikator sagt modify_board, aber der Einzeldurchlauf-Pfad braucht
  // ein ausdrückliches @board-Ziel und rät sonst zum Copy-Paste. Ohne benanntes
  // UND ohne offenes Board auf `agentic` demotieren, damit das boards_tasks-
  // Werkzeug der Schleife das Board über den Namen auflöst.
  if (intent === 'modify_board' && !p.hasNamedBoard && !p.hasOpenBoardSurface && !p.forcedTool) {
    recordDecision('router.intent_override', 'modify_board_to_agentic', {
      inputs: {
        intentBefore: 'modify_board',
        hasRawBoardIds: p.hasNamedBoard,
        hasOpenBoard: p.hasOpenBoardSurface,
      },
    });
    intent = 'agentic';
  }

  // Ein Pipeline-Agent (routes/chat/agents/pipelines/) geht NIE über die
  // Schleife. Übertragen ist reine Textarbeit am mitgelieferten Material, und
  // die Prüfung dahinter ist eine eigene Kette statt eines Werkzeugs. Der erste
  // Einfache-Sprache-Lauf (13.08.2026) belegte beide Hälften: 19 Werkzeuge
  // montiert, KEINES benutzt (`steps=0`) — bezahlt wurden trotzdem 2661 Zeichen
  // Werkzeugregeln und 1141 Zeichen Rezept-Katalog im Systemprompt, aus dem das
  // Modell dann die Nachbarrolle „Rückübersetzung" in seine Ausgabe zog.
  //
  // `produktion` und nicht `direct`: der Turn IST eine Schreibaufgabe mit
  // eigenem Material, und `direct` ist seit #2269 F0 — es wird nur noch gelesen,
  // nicht mehr neu vergeben. Beides nötig, weil `produktion` zwar prosa-dispon-
  // iert ist, die Rettungsregel in decideRunAgentic es aber dennoch in die
  // Schleife heben könnte.
  if (p.pipelineForceIntent != null && intent !== p.pipelineForceIntent) {
    recordDecision('router.intent_override', 'einfache_sprache_to_produktion', {
      inputs: { intentBefore: intent },
    });
    intent = p.pipelineForceIntent;
  }

  // ── 3. Das Loop-Gate ──────────────────────────────────────────────────────
  // Kurzschluss-Reihenfolge unverändert: ein Pipeline-Agent vetot, danach
  // beantworten die beiden Editor-Varianten die Frage bereits, und erst zuletzt
  // wird das allgemeine Gate befragt (und protokolliert).
  const runAgentic =
    p.pipelineForceIntent == null &&
    (editToolLoop ||
      compoundEdit ||
      decideRunAgentic({
        loopEnabled: p.loopEnabled,
        agenticIntents: p.agenticIntents,
        intent,
        lastUserText: p.lastUserText,
        forcedTool: p.forcedTool,
        mustLoop,
        forcedLoop,
        hasManagedSources: p.hasManagedSources,
        isCompound: p.isCompound,
        hasSelectedNotebook: p.hasSelectedNotebook,
        secondaryIntent: p.secondaryIntent,
        compoundGeneration: compoundKind != null,
        hasImageAttachments: p.hasImageAttachments,
        isPdfFillRequest: p.isPdfFillRequest,
        classifierContradictedResearch: p.classifierContradictedResearch,
        hasOwnMaterial: p.hasOwnMaterial,
      }));

  // ── 4. Auffang-Intent ─────────────────────────────────────────────────────
  // Gegen den KORRIGIERTEN Intent, anders als das Gate oben. Der Auffang
  // beantwortet eine andere Frage — nicht „was hat die Person gemeint", sondern
  // „kann `executeIntentPipeline` ausführen, was hier steht". Gegen den
  // Vorschlag gemessen nahm er dem Pipeline-Agenten die Festlegung zurück, für
  // die dessen Veto überhaupt existiert: `hilfe` + Einfache Sprache ergab ein
  // erzwungenes `produktion`, das der Auffang zu `web` machte — eine Websuche
  // für einen Turn, der reine Textarbeit am mitgelieferten Material ist.
  const isSystemToolIntent = p.systemToolIntents.has(intent);
  const fallback = runAgentic
    ? { intent, backfillSearchQuery: false }
    : fallbackIntentFor(intent, isSystemToolIntent);

  const lane: TurnLane =
    p.pipelineForceIntent != null
      ? 'pipeline'
      : editToolLoop
        ? 'edit-loop'
        : compoundEdit
          ? 'compound-edit'
          : runAgentic
            ? 'loop'
            : 'single-pass';

  return {
    lane,
    intent: fallback.intent,
    runAgentic,
    compoundEdit,
    editToolLoop,
    editTarget,
    editToolSurface: editToolLoop ? editToolSurfaceKind : null,
    compoundGenerationKind: compoundKind,
    backfillSearchQuery: fallback.backfillSearchQuery,
  };
}
