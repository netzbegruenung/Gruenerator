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
  it('is the old router enumeration plus exactly the two flipped sources', () => {
    expect([...intentsWithForcedLane('loop')].sort()).toEqual(
      [...IS_MCP_TURN_BEFORE, ...FORCED_LOOP_ADDED].sort()
    );
  });

  it('changed for nobody else', () => {
    const loop = new Set<string>([...IS_MCP_TURN_BEFORE, ...FORCED_LOOP_ADDED]);
    for (const id of searchIntentSchema.options) {
      expect(forcesLoopLane(id)).toBe(loop.has(id));
    }
  });

  // Der Flip gilt der ERWÄHNUNG, nicht dem Verdikt. Ein Prosa-Turn, den der
  // Klassifikator auf `bundestag` setzt, lief schon vorher im Loop (die
  // `loop`-Disposition öffnet das Gate) — er ist von dieser Achse unberührt.
  it('lässt die Disposition der geflippten Intents in Ruhe', () => {
    for (const id of FORCED_LOOP_ADDED) {
      expect(DISPOSITION_BY_INTENT[id]).toBe('loop');
    }
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

  it('leaves create_recurring_task out — it has no create route to reach (and is retired)', () => {
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
  it('every loop-lane intent declares a degradeTo, except mcp', () => {
    for (const id of intentsWithForcedLane('loop')) {
      if (id === 'mcp') continue;
      expect(CHAT_INTENTS[id].degradeTo, `${id} braucht ein degradeTo`).toBeDefined();
    }
  });

  it('mcp is the one deliberate exception', () => {
    expect(forcedLaneOf('mcp')).toBe('loop');
    expect(CHAT_INTENTS.mcp.degradeTo).toBeUndefined();
  });
});
