import { describe, it, expect } from 'vitest';

import { decideTurnPlan, type TurnPlanInput } from './turnPlan.js';

import type { ChatIntentId } from '@gruenerator/shared/chat-intents';

// Fixtures nach dem Vorbild der echten Mengen, bewusst NICHT aus ihnen
// abgeleitet — eine Ableitung prüfte die Implementierung gegen sich selbst.
// Woraus `AGENTIC_INTENTS` wirklich besteht, hält `dispositionSets.vitest.ts`
// fest; dasselbe Muster steht in `routing.vitest.ts` begründet.
const AGENTIC = new Set([
  'search',
  'web',
  'examples',
  'compare',
  'research',
  'bundestag',
  'abgeordnetenwatch',
  'mcp',
  'summary',
  'hilfe',
  'image',
  'agentic',
]);
// `umfragen` steht hier und NICHT in AGENTIC oben — genau die Lage nach seiner
// Stilllegung: als Verdikt erzeugt es niemand mehr, aber ein aus einem alten
// Thread zurückgereichter `intent: 'umfragen'` muss weiterhin in die Schleife.
const SYSTEM_TOOLS = new Set(['umfragen', 'hilfe']);

const base: TurnPlanInput = {
  loopEnabled: true,
  agenticIntents: AGENTIC,
  systemToolIntents: SYSTEM_TOOLS,
  intent: 'search',
  lastUserText: 'Was steht im Programm zum Klimaschutz?',
  forcedTool: false,
  isCompound: false,
  hasSelectedNotebook: false,
  hasManagedSources: false,
  hasImageAttachments: false,
  secondaryIntent: null,
  isPdfFillRequest: false,
  classifierContradictedResearch: false,
  hasOwnMaterial: false,
  enabledTools: null,
  agentIdentifier: null,
  hasOpenDocumentId: false,
  hasOpenBoardId: false,
  hasOpenBoardSurface: false,
  hasNamedBoard: false,
  isSharepicRefinement: false,
  pipelineForceIntent: null,
  mentionPinnedTool: null,
  mentionPinnedArtifactKind: null,
};

const plan = (o: Partial<TurnPlanInput>) => decideTurnPlan({ ...base, ...o });

/** Eine Tabellen-Fläche für den einzigen Werkzeugpfad, der heute live ist. */
const sheetSurface: Partial<TurnPlanInput> = {
  agentIdentifier: 'gruenerator-sheets-editor',
  enabledTools: { edit_current_doc: true },
  hasOpenDocumentId: true,
};

describe('decideTurnPlan — die Lanes', () => {
  it('loop: eine Recherchefrage geht in die Schleife', () => {
    const p = plan({ intent: 'search' });
    expect(p.lane).toBe('loop');
    expect(p.runAgentic).toBe(true);
    expect(p.intent).toBe('search');
  });

  it('greeting: ein Gruss zahlt keinen Loop-Overhead', () => {
    const p = plan({ intent: 'greeting', lastUserText: 'Hallo!' });
    expect(p.lane).toBe('greeting');
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('greeting');
  });

  it('produktion: der Pipeline-Agent vetot die Schleife und erzwingt seinen Intent', () => {
    // Die Lane sagt, WAS der Turn ist (Schreibarbeit am Material), nicht WER
    // ihn ausführt. Dass eine eigene Kette es tut, steht in `pipelineAgent`.
    const p = plan({ intent: 'search', pipelineForceIntent: 'produktion' });
    expect(p.lane).toBe('produktion');
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('produktion');
  });

  it('loop (editToolLoop): eine Tabellen-Seitenleiste mit offenem Ziel bearbeitet in der Schleife', () => {
    const p = plan({
      ...sheetSurface,
      intent: 'direct',
      lastUserText: 'trag es in die Tabelle ein',
    });
    expect(p.lane).toBe('loop');
    expect(p.runAgentic).toBe(true);
    expect(p.editToolLoop).toBe(true);
    expect(p.editToolSurface).toBe('sheet');
    expect(p.editTarget).toBe('doc');
  });

  it('loop (compoundEdit): recherchieren UND ins offene Dokument einbauen', () => {
    const p = plan({
      // Eine Fläche OHNE Werkzeugpfad (docs) — sonst gewinnt `edit-loop`.
      agentIdentifier: 'gruenerator-docs-editor',
      enabledTools: { edit_current_doc: true },
      hasOpenDocumentId: true,
      intent: 'edit_current_doc',
      lastUserText: 'Recherchiere die aktuellen Zahlen und füge sie ins Dokument ein',
    });
    expect(p.lane).toBe('loop');
    expect(p.runAgentic).toBe(true);
    expect(p.compoundEdit).toBe(true);
    expect(p.editToolLoop).toBe(false);
    expect(p.editTarget).toBe('doc');
  });
});

describe('decideTurnPlan — die Lane kommt aus der Registry', () => {
  // Der Grund für diese vier: die Lane hatte bis Phase N keinen Konsumenten und
  // konnte deshalb beliebig danebenliegen, ohne dass etwas rot wurde. Jetzt
  // leitet `runAgentic` sich aus ihr ab — eine falsche Lane ist ab hier ein
  // falscher Ausführungspfad.

  it('pipeline: ein Artefakt-Verdikt im Einzeldurchlauf', () => {
    // Disposition `artifact` — kostet Kontingent, eigene deterministische Route.
    const p = plan({ intent: 'sharepic', lastUserText: 'Mach ein Sharepic dazu' });
    expect(p.runAgentic).toBe(false);
    expect(p.lane).toBe('pipeline');
  });

  it('pipeline: auch die Bearbeitungs-Familie (Disposition anchor)', () => {
    const p = plan({ intent: 'modify_doc', lastUserText: 'Ändere den zweiten Absatz' });
    expect(p.runAgentic).toBe(false);
    expect(p.lane).toBe('pipeline');
  });

  it('produktion: Schreibarbeit am mitgebrachten Material, ohne Pipeline-Agent', () => {
    const p = plan({
      intent: 'produktion',
      lastUserText: 'Schreib mir eine Pressemitteilung dazu',
      hasOwnMaterial: true,
    });
    expect(p.runAgentic).toBe(false);
    expect(p.lane).toBe('produktion');
  });

  it('single-pass: die Recherche-Familie, solange sie eigene Executoren hat', () => {
    // Das benannte Restproblem — diese Lane verschwindet mit der
    // Recherche-Konsolidierung, nicht vorher.
    const p = plan({ intent: 'search', hasSelectedNotebook: true });
    expect(p.runAgentic).toBe(false);
    expect(p.lane).toBe('single-pass');
  });
});

describe('decideTurnPlan — die Kippfälle', () => {
  it('agentic mit ausgeschalteter Schleife fällt auf search, nicht ins Leere', () => {
    // `executeIntentPipeline` hat keinen `agentic`-Zweig — ohne den Auffang
    // strandet der Turn.
    const p = plan({ intent: 'agentic', loopEnabled: false });
    expect(p.runAgentic).toBe(false);
    expect(p.lane).toBe('single-pass');
    expect(p.intent).toBe('search');
    expect(p.backfillSearchQuery).toBe(false);
  });

  it('agentic, das ein Notausschalter aussperrt, fällt ebenfalls auf search', () => {
    const p = plan({ intent: 'agentic', hasImageAttachments: true });
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('search');
  });

  it('ein System-Tool-Intent ohne Schleife fällt auf web und verlangt eine Suchanfrage', () => {
    // Die Werkzeuge von `umfragen`/`hilfe` existieren nur in der Schleife, und
    // ihr `searchQuery` wurde als NON_SEARCH genullt.
    const p = plan({ intent: 'umfragen', hasImageAttachments: true });
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('web');
    expect(p.backfillSearchQuery).toBe(true);
  });

  it('ein System-Tool-Intent MIT Schleife behält seinen Intent', () => {
    const p = plan({ intent: 'hilfe' });
    expect(p.runAgentic).toBe(true);
    expect(p.intent).toBe('hilfe');
    expect(p.backfillSearchQuery).toBe(false);
  });

  it('das Pipeline-Veto schlägt jeden Loop-Grund, auch die Editor-Varianten', () => {
    const p = plan({
      ...sheetSurface,
      intent: 'search',
      lastUserText: 'Recherchiere die Zahlen und füge sie ins Dokument ein',
      pipelineForceIntent: 'produktion',
    });
    expect(p.lane).toBe('produktion');
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('produktion');
  });

  it('mitgebrachtes Material hält einen Schreibauftrag im Einzeldurchlauf', () => {
    const order = 'Schreib mir eine Pressemitteilung dazu';
    expect(plan({ intent: 'produktion', lastUserText: order }).runAgentic).toBe(true);
    expect(
      plan({ intent: 'produktion', lastUserText: order, hasOwnMaterial: true }).runAgentic
    ).toBe(false);
  });

  it('ein gewähltes Notizbuch hält den Turn einzeln — nur searchNode liest Notizbücher', () => {
    expect(plan({ intent: 'search', hasSelectedNotebook: true }).runAgentic).toBe(false);
  });

  it('modify_board ohne benanntes und ohne offenes Board wird zu agentic demotiert', () => {
    const p = plan({ intent: 'modify_board', lastUserText: 'häng den Post an mein Kanban-Board' });
    expect(p.intent).toBe('agentic');
    expect(p.lane).toBe('loop');
  });

  it('modify_board mit @board-Ziel bleibt beim Einzeldurchlauf', () => {
    const p = plan({
      intent: 'modify_board',
      lastUserText: 'häng den Post an mein Kanban-Board',
      hasNamedBoard: true,
    });
    expect(p.intent).toBe('modify_board');
    expect(p.runAgentic).toBe(false);
  });

  it('die Verbund-Art kommt aus dem Text, wenn der Intent sie nicht mehr nennt', () => {
    const p = plan({
      intent: 'agentic',
      lastUserText: 'mach mir eine Tabelle draus',
    });
    expect(p.compoundGenerationKind).toBe('sheet');
  });

  it('eine Sharepic-Verfeinerung erzeugt keine Verbund-Art', () => {
    const withoutRefinement = plan({
      intent: 'sharepic',
      lastUserText: 'Recherchiere aktuelle Zahlen und mach ein Sharepic daraus',
    });
    expect(withoutRefinement.compoundGenerationKind).toBe('sharepic');
    expect(
      plan({
        intent: 'sharepic',
        lastUserText: 'Recherchiere aktuelle Zahlen und mach ein Sharepic daraus',
        isSharepicRefinement: true,
      }).compoundGenerationKind
    ).toBeNull();
  });

  it('das Bearbeitungsziel hängt am aktivierten Werkzeug, nicht am Kontext', () => {
    // Eine Board-Seitenleiste, die zusätzlich ein Dokument im Kontext trägt,
    // bearbeitet trotzdem das BOARD.
    const p = plan({
      enabledTools: { edit_current_board: true },
      hasOpenBoardId: true,
      hasOpenDocumentId: true,
      intent: 'edit_current_board',
    });
    expect(p.editTarget).toBe('board');
  });

  it('ohne offenes Ziel gibt es weder Bearbeitungsziel noch Editor-Lane', () => {
    const p = plan({ ...sheetSurface, hasOpenDocumentId: false, intent: 'direct' });
    expect(p.editTarget).toBeNull();
    expect(p.editToolLoop).toBe(false);
    expect(p.editToolSurface).toBeNull();
  });
});

describe('decideTurnPlan — Endgültigkeit des Intents', () => {
  // Der Kern der Phase: nach dieser Funktion schreibt niemand mehr um. Ein Plan,
  // der nicht in der Schleife läuft, darf deshalb keinen Intent tragen, den nur
  // die Schleife ausführen kann.
  const LOOP_ONLY: ChatIntentId[] = ['agentic', 'umfragen', 'hilfe'];

  it.each(LOOP_ONLY)('%s überlebt einen Einzeldurchlauf nicht', (intent) => {
    const p = plan({ intent, hasImageAttachments: true });
    expect(p.runAgentic).toBe(false);
    expect(LOOP_ONLY).not.toContain(p.intent);
  });

  // Der System-Tool-Auffang prüfte den VORGESCHLAGENEN Intent, der
  // Pipeline-Zwang schreibt aber vorher um. Trafen beide zusammen, gewann der
  // Auffang und machte aus dem erzwungenen `produktion` ein `web` — er nahm dem
  // Pipeline-Agenten also genau die Festlegung zurück, für die sein Veto
  // existiert („Übertragen ist reine Textarbeit am mitgelieferten Material").
  //
  // Erreichbar: Tier 2.9 vergibt `hilfe` allein nach Formulierung, unabhängig
  // vom Agenten — „wie erstelle ich ein Sharepic?" auf dem
  // Einfache-Sprache-Agenten genügt.
  it('der Pipeline-Zwang überlebt den System-Tool-Auffang', () => {
    const p = plan({ intent: 'hilfe', pipelineForceIntent: 'produktion' });
    expect(p.lane).toBe('produktion');
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('produktion');
    // Der Nachtrag hängt am Auffang: ohne Umschreibung auf `web` gibt es auch
    // keine leergeräumte Suchanfrage nachzutragen.
    expect(p.backfillSearchQuery).toBe(false);
  });

  // Die Gegenprobe — ohne Pipeline-Zwang greift der Auffang unverändert.
  it('ohne Pipeline-Zwang bleibt der System-Tool-Auffang unberührt', () => {
    const p = plan({ intent: 'hilfe', hasImageAttachments: true });
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('web');
    expect(p.backfillSearchQuery).toBe(true);
  });
});

describe('decideTurnPlan — ein per Erwähnung gepinntes Werkzeug', () => {
  /** So kommt `@umfragen` seit der Stilllegung seines Intents hier an. */
  const pinned = {
    intent: 'agentic' as ChatIntentId,
    forcedTool: true,
    mentionPinnedTool: 'umfragen',
  };

  it('kommt in die Schleife, obwohl `forcedTool` sie sonst killt', () => {
    expect(plan(pinned).runAgentic).toBe(true);
    // Beweis, dass der PIN es tut und nicht der Intent: derselbe Turn ohne ihn
    // fällt auf den Einzeldurchlauf — und dort über den Auffang auf `search`.
    const withoutPin = plan({ ...pinned, mentionPinnedTool: null });
    expect(withoutPin.runAgentic).toBe(false);
    expect(withoutPin.intent).toBe('search');
  });

  // Beide Hälften von `mustLoop`: `agentic` hat in `executeIntentPipeline`
  // keinen Zweig, ein ausgesperrter Turn landete also auf der Dokumentensuche.
  // Vor der Stilllegung trug `umfragen` das über SYSTEM_TOOL_INTENTS.
  it('auch mit ausgeschalteter Schleife', () => {
    const p = plan({ ...pinned, loopEnabled: false });
    expect(p.runAgentic).toBe(true);
    expect(p.intent).toBe('agentic');
  });

  it('auch mit gewählter Wissenssammlung', () => {
    expect(plan({ ...pinned, hasSelectedNotebook: true }).runAgentic).toBe(true);
  });

  // Die Notausschalter, die AUCH `mustLoop` nicht aufhebt, bleiben stehen —
  // sonst hätte der Pin mehr Macht als der Intent, den er ersetzt.
  it('ein Bildanhang sperrt ihn trotzdem aus', () => {
    const p = plan({ ...pinned, hasImageAttachments: true });
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('search');
  });

  it('ein Pipeline-Agent vetot ihn trotzdem', () => {
    const p = plan({ ...pinned, pipelineForceIntent: 'produktion' });
    expect(p.lane).toBe('produktion');
    expect(p.runAgentic).toBe(false);
  });

  // `@bundestag` pinnt ebenfalls ein Werkzeug, trägt aber einen Intent auf der
  // Loop-Achse. `forcedLane: 'loop'` hebt nur den forcedTool-Notausschalter
  // auf, nicht das Gate — mit ausgeschalteter Schleife bleibt er draussen. Wo
  // er DANN landet, ist seit Phase N eine andere Antwort: siehe unten.
  it('lässt `@bundestag` beim ausgeschalteten Loop draussen', () => {
    const p = plan({
      intent: 'bundestag',
      forcedTool: true,
      mentionPinnedTool: 'bundestag',
      loopEnabled: false,
    });
    expect(p.runAgentic).toBe(false);
  });
});

describe('decideTurnPlan — der Degradierungsfall der Loop-Achse', () => {
  // Die Parlaments-Abrufe haben seit Phase N keine Einzeldurchlauf-Tür mehr:
  // ihr Kern hängt nur noch am Loop-Werkzeug. Jeder Notausschalter, der so
  // einen Turn draussen hält, MUSS ihn deshalb umleiten — sonst nennt der Plan
  // einen Intent, für den `executeIntentPipeline` keinen Zweig hat, und der
  // Turn strandet still (`default: log.warn`).
  //
  // Das Ziel kommt aus der Registry (`degradeTo: 'web'`), nicht aus dieser
  // Datei. Ein Test je Notausschalter, weil sie an verschiedenen Stellen des
  // Gates sitzen und einzeln wegbrechen können.
  const killSwitches: [string, Partial<TurnPlanInput>][] = [
    ['ausgeschaltete Schleife', { loopEnabled: false }],
    ['gewählte Wissenssammlung', { hasSelectedNotebook: true }],
    ['Verbund-Turn', { isCompound: true }],
    ['Bildanhang', { hasImageAttachments: true }],
    ['zweiter Intent', { secondaryIntent: 'save_as_doc' }],
  ];

  for (const intent of ['bundestag', 'abgeordnetenwatch'] as const) {
    for (const [name, override] of killSwitches) {
      it(`${intent} + ${name} → web statt ins Leere`, () => {
        const p = plan({ intent, ...override });
        expect(p.runAgentic).toBe(false);
        expect(p.intent).toBe('web');
        // Der Zielintent sucht — ohne Nachtrag suchte er nach ''.
        expect(p.backfillSearchQuery).toBe(true);
      });
    }
  }

  it('die Erwähnung ändert daran nichts — auch ein gepinnter Turn degradiert', () => {
    const p = plan({
      intent: 'bundestag',
      forcedTool: true,
      mentionPinnedTool: 'bundestag',
      loopEnabled: false,
    });
    expect(p.intent).toBe('web');
  });

  it('mit offener Schleife bleibt der Intent, was er ist', () => {
    const p = plan({ intent: 'bundestag' });
    expect(p.runAgentic).toBe(true);
    expect(p.intent).toBe('bundestag');
    expect(p.backfillSearchQuery).toBe(false);
  });

  // Die Gegenprobe zur Registry-Bedingung: `mcp` steht auf derselben Achse,
  // hat aber kein `degradeTo`. Eine Websuche wäre dort keine Degradierung,
  // sondern eine andere Quelle als die gewählte — also bleibt er unberührt.
  //
  // Das ist eine Aussage über den PLAN, nicht das Ende der Geschichte: der
  // Einzeldurchlauf hat für `mcp` keinen Ausführenden. Dass der Turn deshalb
  // absagt statt still aus dem Gedächtnis zu antworten, steht in
  // `intentHandlers/mcpWithoutLoop.ts` und wird dort und in
  // `intentExecutionLoop.vitest.ts` zugesichert. Wer hier ein `degradeTo`
  // nachträgt, macht jene Absage tot — und den Turn zu einer Websuche, die
  // niemand gewählt hat.
  it('mcp degradiert NICHT, weil die Registry kein Ziel nennt', () => {
    const p = plan({ intent: 'mcp', hasImageAttachments: true });
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('mcp');
  });
});

/**
 * Der IST-Stand der Suchfamilie am Erwähnungs-Pfad, festgenagelt VOR dem
 * Lane-Flip aus Phase R3 — damit der Flip als Diff in Zusicherungen erscheint
 * und nicht nur als Zeilenänderung in einer Tabelle.
 *
 * Und mit ihm der Befund, der den Flip gefährlich macht: `@deepresearch` ist
 * eine VARIANTE von `research` (`forcedIntentStage` setzt genau denselben
 * Intent plus `forcedTool`), und der Entscheider bekommt heute kein einziges
 * Feld, an dem er die beiden unterscheiden könnte. Solange die Familie
 * `single-pass` trägt, ist das folgenlos — beide bleiben einzeln. Ab dem Flip
 * wäre es der stille Tod des Dossier-Wegs: seine beiden Engines lesen
 * `deepResearchRequested` ausschliesslich im Einzeldurchlauf
 * (`intentHandlers/searchBranch.ts`), ein in die Schleife gehobener Turn liefe
 * als gewöhnliche Recherche weiter und niemand sähe einen Fehler.
 */
describe('decideTurnPlan — die Suchfamilie am Erwähnungs-Pfad (IST vor dem R3-Flip)', () => {
  it.each(['research', 'search', 'web'] as const)(
    '%s: eine Erwähnung hält den Turn im Einzeldurchlauf',
    (intent) => {
      const p = plan({ intent, forcedTool: true });
      expect(p.lane).toBe('single-pass');
      expect(p.runAgentic).toBe(false);
      expect(p.intent).toBe(intent);
    }
  );

  it('@deepresearch ist am Entscheider nicht von @recherche zu unterscheiden', () => {
    // Was `forcedIntentStage` für `@deepresearch` setzt, in den Feldern, die
    // dieser Entscheider überhaupt sieht.
    const deep = plan({ intent: 'research', forcedTool: true, mentionPinnedTool: null });
    const recherche = plan({ intent: 'research', forcedTool: true, mentionPinnedTool: null });
    expect(deep).toEqual(recherche);
    expect(deep.lane).toBe('single-pass');
  });
});
