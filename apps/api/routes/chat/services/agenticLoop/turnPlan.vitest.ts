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
  'umfragen',
  'image',
  'agentic',
]);
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

  it('single-pass: ein Gruss zahlt keinen Loop-Overhead', () => {
    const p = plan({ intent: 'greeting', lastUserText: 'Hallo!' });
    expect(p.lane).toBe('single-pass');
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('greeting');
  });

  it('pipeline: der Pipeline-Agent vetot die Schleife und erzwingt seinen Intent', () => {
    const p = plan({ intent: 'search', pipelineForceIntent: 'produktion' });
    expect(p.lane).toBe('pipeline');
    expect(p.runAgentic).toBe(false);
    expect(p.intent).toBe('produktion');
  });

  it('edit-loop: eine Tabellen-Seitenleiste mit offenem Ziel bearbeitet in der Schleife', () => {
    const p = plan({
      ...sheetSurface,
      intent: 'direct',
      lastUserText: 'trag es in die Tabelle ein',
    });
    expect(p.lane).toBe('edit-loop');
    expect(p.runAgentic).toBe(true);
    expect(p.editToolLoop).toBe(true);
    expect(p.editToolSurface).toBe('sheet');
    expect(p.editTarget).toBe('doc');
  });

  it('compound-edit: recherchieren UND ins offene Dokument einbauen', () => {
    const p = plan({
      // Eine Fläche OHNE Werkzeugpfad (docs) — sonst gewinnt `edit-loop`.
      agentIdentifier: 'gruenerator-docs-editor',
      enabledTools: { edit_current_doc: true },
      hasOpenDocumentId: true,
      intent: 'edit_current_doc',
      lastUserText: 'Recherchiere die aktuellen Zahlen und füge sie ins Dokument ein',
    });
    expect(p.lane).toBe('compound-edit');
    expect(p.runAgentic).toBe(true);
    expect(p.compoundEdit).toBe(true);
    expect(p.editToolLoop).toBe(false);
    expect(p.editTarget).toBe('doc');
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
    expect(p.lane).toBe('pipeline');
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
    expect(p.lane).toBe('pipeline');
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
