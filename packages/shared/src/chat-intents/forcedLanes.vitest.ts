import { searchIntentSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  ALL_CHAT_INTENTS,
  CHAT_INTENTS,
  DISPOSITION_BY_INTENT,
  FORCED_LANE_BY_INTENT,
  forcedLaneOf,
  forcesLoopLane,
  intentsWithForcedLane,
  pinnedToolForMention,
  type ChatIntentId,
} from './index.js';

/**
 * Die Aufzählung, die `decideTurnPlan` vor der Achse als Literal führte
 * (`turnPlan.ts`: `proposedIntent === 'mcp' || … 'umfragen' || … 'hilfe'`).
 * Solange dieses Fixture hält, hat die Einführung der Achse nichts geändert,
 * was ein Turn beobachten könnte. Ein späterer Flip ändert es SICHTBAR, in dem
 * Commit, der ihn vornimmt.
 */
const IS_MCP_TURN_BEFORE = ['mcp', 'hilfe'] as const;

/**
 * Die Erweiterung vom 16.08.2026. Die beiden oben MÜSSEN in die Schleife
 * (`executeIntentPipeline` hat keinen Zweig für sie); diese zwei HABEN einen
 * Einzeldurchlauf-Executor und tragen `loop`, weil eine Erwähnung dort besser
 * bedient ist. Der Unterschied ist der Grund, warum `mustLoop` und `forcedLoop`
 * im Entscheider getrennt sind.
 */
const FORCED_LOOP_ADDED = ['bundestag', 'abgeordnetenwatch'] as const;

/**
 * `umfragen` stand als dritter in `IS_MCP_TURN_BEFORE` und ist der erste
 * Abgang der Achse: sein Intent ist stillgelegt, seine Erwähnung zurrt das
 * WERKZEUG fest (`IntentMention.pinsTool`). Was ihn in die Schleife bringt,
 * steht deshalb nicht mehr hier, sondern im Pin — `turnPlan.vitest.ts` hält es.
 * Diese Karte darf nichts über ihn behaupten, weil niemand ihn mehr festzurrt.
 */
const FORCED_LOOP_REMOVED = ['umfragen'] as const;

/**
 * Der Zugang aus Phase R3 — die Suchfamilie. Wie `FORCED_LOOP_ADDED` HABEN
 * diese drei einen Einzeldurchlauf-Executor (`intentHandlers/searchBranch.ts`)
 * und tragen `loop` trotzdem, weil eine Erwähnung dort besser bedient ist.
 *
 * Der Unterschied zu den beiden davor ist die Richtung der Degradierung: diese
 * drei sind das ZIEL des Auffangs (`agentic` → `search`, System-Tool → `web`),
 * ein `degradeTo` an ihnen liesse einen ausgesperrten Turn ein zweites Mal
 * weiterfallen. Deshalb stehen sie unten in `LOOP_LANE_WITH_SINGLE_PASS`.
 */
const FORCED_LOOP_R3 = ['research', 'search', 'web'] as const;

/**
 * Wer auf der Loop-Achse steht und trotzdem einen Einzeldurchlauf HAT.
 *
 * Die Achse trägt seit R3 wieder zwei Aussagen (siehe den Kopfkommentar der
 * Karte), und nur die erste — „hat gar keinen Ausführenden ausserhalb der
 * Schleife" — begründet die `degradeTo`-Pflicht. Diese Menge ist die zweite.
 * Sie steht als Fixture und nicht als Ableitung, weil „hat einen
 * Einzeldurchlauf" eine Aussage über `apps/api` ist, die dieses Paket nicht
 * nachschlagen kann: wer sie ändert, soll sie hier hinschreiben.
 */
const LOOP_LANE_WITH_SINGLE_PASS = new Set<string>([...FORCED_LOOP_ADDED, ...FORCED_LOOP_R3]);

describe('forcedLane totality', () => {
  it('describes every intent in the wire enum, and no others', () => {
    expect(Object.keys(FORCED_LANE_BY_INTENT).sort()).toEqual(
      [...searchIntentSchema.options].sort()
    );
  });

  it('assigns every intent exactly one of the three lanes', () => {
    const lanes =
      intentsWithForcedLane('loop').size +
      intentsWithForcedLane('single-pass').size +
      intentsWithForcedLane('pipeline').size;
    expect(lanes).toBe(ALL_CHAT_INTENTS.length);
  });

  it('answers null for a non-intent instead of guessing a lane', () => {
    expect(forcedLaneOf('definitiv-kein-intent')).toBeNull();
    expect(forcesLoopLane('definitiv-kein-intent')).toBe(false);
  });
});

describe('the loop lane', () => {
  it('is the old router enumeration plus exactly the flipped sources', () => {
    expect([...intentsWithForcedLane('loop')].sort()).toEqual(
      [...IS_MCP_TURN_BEFORE, ...FORCED_LOOP_ADDED, ...FORCED_LOOP_R3].sort()
    );
  });

  it('changed for nobody else', () => {
    const loop = new Set<string>([...IS_MCP_TURN_BEFORE, ...FORCED_LOOP_ADDED, ...FORCED_LOOP_R3]);
    for (const id of searchIntentSchema.options) {
      expect(forcesLoopLane(id)).toBe(loop.has(id));
    }
  });

  // Der Flip gilt der ERWÄHNUNG, nicht dem Verdikt. Ein Prosa-Turn, den der
  // Klassifikator auf `bundestag` setzt, lief schon vorher im Loop (die
  // `loop`-Disposition öffnet das Gate) — er ist von dieser Achse unberührt.
  it('lässt die Disposition der geflippten Intents in Ruhe', () => {
    for (const id of [...FORCED_LOOP_ADDED, ...FORCED_LOOP_R3]) {
      expect(DISPOSITION_BY_INTENT[id]).toBe('loop');
    }
  });

  /**
   * Der Flip aus R3 gilt der ERWÄHNUNG. Damit er auch trifft, muss die
   * Erwähnung ihr Werkzeug benennen: in der Schleife ist der Erwähnungstext für
   * das Modell entfernt (`sanitizeMessageMentions`), ohne Pin griffe es zur
   * generischen Suche statt zu der Quelle, die die Person gewählt hat.
   *
   * `web` hat keine eigene Erwähnung (nur `uiTool`) — es ist Degradierungsziel
   * und Auffang, kein Token im Composer. Es steht deshalb ohne Pin auf der
   * Achse, und das ist kein Loch: dorthin kommt ein Turn nur über ein Verdikt.
   */
  it('gibt den geflippten Erwähnungen ein Zielwerkzeug mit', () => {
    expect(pinnedToolForMention('research')).toBe('web_search');
    expect(pinnedToolForMention('search')).toBe('gruenerator_search');
  });

  /**
   * Die Variante darf den Pin NICHT erben. `@deepresearch` ersetzt den ganzen
   * Turn und hat gar kein Loop-Werkzeug; ein geerbter `web_search`-Pin hiesse,
   * der Dossier-Weg wäre eine Websuche.
   */
  it('vererbt den Pin nicht an die Tiefenrecherche-Variante', () => {
    expect(pinnedToolForMention('deepresearch')).toBeNull();
  });

  // Der Abgang ist kein Verlust an Fähigkeit, sondern ein Ortswechsel: die
  // Erwähnung gibt es weiter, sie zurrt nur das Werkzeug statt des Verdikts.
  it('lässt den stillgelegten Intent los, ohne seine Erwähnung fallenzulassen', () => {
    for (const id of FORCED_LOOP_REMOVED) {
      expect(forcesLoopLane(id)).toBe(false);
      expect(DISPOSITION_BY_INTENT[id]).toBe('retired');
      expect(CHAT_INTENTS[id].availability).toBe('retired');
      const mention = 'mention' in CHAT_INTENTS[id] ? CHAT_INTENTS[id].mention : null;
      expect(mention?.pinsTool).toBe(id);
    }
  });
});

describe('the pipeline lane is exactly the create-route family', () => {
  /**
   * Abgeleitet statt aufgezählt: `createIntentStage` dispatcht auf den
   * `forcedTool`-String eines Artefakt-Intents. Wer einen davon hinzufügt und
   * die Lane vergisst, fällt hier auf — nicht erst, wenn eine Erwähnung still
   * im Einzeldurchlauf landet.
   */
  it('every artifact intent with a create-route key, and nothing else', () => {
    const withCreateRoute = ALL_CHAT_INTENTS.filter(
      (i) => i.category === 'artifact' && i.forcedTool != null
    ).map((i) => i.id);
    expect([...intentsWithForcedLane('pipeline')].sort()).toEqual([...withCreateRoute].sort());
  });

  it('leaves create_recurring_task out — it has no create route to reach', () => {
    const recurring = CHAT_INTENTS.create_recurring_task;
    expect(recurring.category === 'artifact' && recurring.forcedTool).toBeNull();
    expect(forcedLaneOf('create_recurring_task')).toBe('single-pass');
  });
});

describe('the axis covers what a mention can actually pin', () => {
  it('every mentionable intent has a lane', () => {
    for (const intent of ALL_CHAT_INTENTS) {
      if (!('mention' in intent) || !intent.mention) continue;
      expect(forcedLaneOf(intent.id satisfies ChatIntentId)).not.toBeNull();
    }
  });
});

describe('the loop lane is the set without a single-pass executor', () => {
  /**
   * Die Regel, die Phase N eingeführt hat, als Prüfmittel statt als Kommentar:
   * ein Intent auf dieser Achse hat keinen Einzeldurchlauf, also MUSS die
   * Registry sagen, wohin ein Turn ausweicht, den ein Notausschalter aus der
   * Schleife hält (`fallbackIntentFor` liest genau dieses Feld). Fehlt das
   * Ziel, gibt es einen Zustand, in dem niemand den Turn ausführt — und der
   * fällt sonst erst im Betrieb auf, still, über `default: log.warn`.
   *
   * `mcp` ist die begründete Ausnahme und steht hier namentlich, damit ein
   * zweiter Ausnahmefall nicht unbemerkt dazukommt: für ihn wäre eine Websuche
   * keine Degradierung, sondern eine andere Quelle als die gewählte.
   */
  it('every loop-lane intent WITHOUT a single-pass executor declares a degradeTo, except mcp', () => {
    for (const id of intentsWithForcedLane('loop')) {
      if (id === 'mcp') continue;
      if (LOOP_LANE_WITH_SINGLE_PASS.has(id)) continue;
      expect(CHAT_INTENTS[id].degradeTo, `${id} braucht ein degradeTo`).toBeDefined();
    }
  });

  /**
   * Die Gegenrichtung, und sie ist die schärfere: die drei aus R3 dürfen KEIN
   * `degradeTo` haben. Sie sind das Ziel des Auffangs — `fallbackIntentFor`
   * schreibt `agentic` auf `search` und einen System-Tool-Intent auf `web` um,
   * und liest danach das `degradeTo` des ERGEBNISSES. Stünde dort eines, fiele
   * jeder ausgesperrte Turn ein zweites Mal weiter.
   */
  it('gibt den R3-Intents kein degradeTo — sie sind das Ziel des Auffangs', () => {
    for (const id of FORCED_LOOP_R3) {
      expect(CHAT_INTENTS[id].degradeTo, `${id} darf kein degradeTo tragen`).toBeUndefined();
    }
  });

  it('mcp is the one deliberate exception', () => {
    expect(forcedLaneOf('mcp')).toBe('loop');
    expect(CHAT_INTENTS.mcp.degradeTo).toBeUndefined();
  });
});
