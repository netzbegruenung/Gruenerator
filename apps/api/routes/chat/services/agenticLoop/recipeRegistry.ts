/**
 * Per-turn store for recipes ("Rezepte") the model loaded itself.
 *
 * The `rezept_laden` tool is a SWITCH, not a carrier: it registers here and
 * returns a tiny acknowledgement. The prompt body travels through the system
 * message instead — `buildSynthSystem` in split mode, `buildPrepareStep` in
 * unified mode. Three reasons, all load-bearing:
 *
 *  1. In split mode the model that WRITES has no tools at all, so a body
 *     returned from `execute()` would reach the planner and never the writer.
 *  2. `truncateResultForModel` caps every string field of every tool result at
 *     PER_FIELD_FLOOR (400 chars). A half-arrived recipe is worse than none —
 *     the tone survives, the length limit does not.
 *  3. `recordStep`/`sendResult` persist and stream the FULL result; only the
 *     model-facing return value is truncated. A body-carrying tool would be
 *     the exact inversion of what we want: complete in thread persistence and
 *     the UI card, clipped for the model.
 *
 * Shaped after `sourceRegistry`, which solves the same gather→synthesise
 * hand-off for citations.
 */
import { type SkillRole } from '@gruenerator/contracts';

/**
 * How many TEXTSORTEN one turn may load. See `register`. Methoden-Rezepte
 * zählen nicht mit — sie haben ihre eigene Grenze, damit eine Bundestag-
 * Recherche nie den Platz der Textsorte wegnimmt, die die Antwort formt.
 */
export const MAX_RECIPES_PER_TURN = 2;
/** How many Methoden-Rezepte (Recherche, Belege) one turn may load. */
export const MAX_METHOD_RECIPES_PER_TURN = 2;

/** Siehe `Skill.rolle`: `textsorte` formt den Text, `methode` die Recherche. */
export type RecipeRole = SkillRole;

export interface LoadedRecipe {
  mention: string;
  title: string;
  /** The prompt body — internal skill prompt or a user's learned style block. */
  body: string;
  source: 'system' | 'user';
  /** Empfohlene, im Turn montierte Werkzeuge — als Zeile unter dem Rezept. */
  recommendedTools?: readonly string[];
  /**
   * Vom Agenten vorab geladen, nicht gewählt. Lädt das Modell im selben Turn
   * eine ANDERE Textsorte, weicht dieses — zwei Formatgeber auf einem Text haben
   * keinen Schlichter (eine Bürger-Mail und eine PM zugleich). Ein vorab
   * geladenes Methoden-Rezept (`@bundestag`) weicht dagegen nie: es gibt keine
   * Form vor, also gibt es nichts zu schlichten.
   */
  preloaded?: boolean;
  /** Fehlt = `textsorte` — die Rolle jedes Rezepts vor der Trennung. */
  rolle?: RecipeRole;
}

export type RegisterOutcome = 'registered' | 'duplicate' | 'full';

/** Attribution eines geladenen Rezepts — alles außer dem Prompttext. */
export interface RecipeSummary {
  mention: string;
  title: string;
  source: 'system' | 'user';
}

export interface RecipeRegistry {
  /**
   * Idempotent per mention. A second call for the same recipe is a no-op
   * (`duplicate`) rather than a second block — the model re-calling a tool it
   * already called is a known failure mode, not an edge case (see the
   * `generate_image` triple-call).
   */
  register(recipe: LoadedRecipe): RegisterOutcome;
  has(mention: string): boolean;
  readonly size: number;
  readonly mentions: readonly string[];
  /** The system-prompt block, or '' when nothing was loaded. */
  render(): string;
  /** Für die Turn-Attribution (`usedRecipes`): was geladen wurde, OHNE den
   *  parteiinternen Prompttext — das Ergebnis wird persistiert und gestreamt. */
  summaries(): readonly RecipeSummary[];
}

/**
 * Precedence against the user's profile instructions. Both end up in the same
 * system message and can genuinely disagree ("max. 600 Zeichen" vs. "schreibe
 * ausführlich"). Until now that only happened when the user picked a recipe
 * deliberately; self-loading makes it happen unasked, so the rule is stated
 * rather than left to the model.
 */
const PRECEDENCE_NOTE =
  'Das Rezept bestimmt die FORM (Länge, Aufbau, Plattformkonventionen). ' +
  'Die persönlichen Anweisungen bestimmen TON und KONTEXT. ' +
  'Widersprechen sie sich in der Form, gilt das Rezept.';

/**
 * Dieselbe Regel, sobald ein Methoden-Rezept mitläuft. Geteilt mit dem
 * Single-Pass-Pfad (`buildSystemMessage`), damit beide Wege denselben Satz
 * sprechen.
 *
 * Mit Textsorte: drei Geber, drei Zuständigkeiten — die Methode regelt nur
 * Recherche, Belege und Lücken. Ohne Textsorte bestimmt die Methode auch die
 * Antwortform: der Bundestag-Rezepttext trägt bewusst Formregeln
 * (vollständige Antworten, Fundstellen zuerst bei „wo/wann"), und
 * `buildSystemMessage` führt sie dann als Formatgeber.
 */
export const METHOD_PRECEDENCE_NOTE =
  'Die Recherche-Methode bestimmt RECHERCHE, BELEGE und ZITIERWEISE. ' +
  'Die Textsorte (AKTIVE PLATTFORM) bestimmt die FORM (Länge, Aufbau, Plattformkonventionen). ' +
  'Die persönlichen Anweisungen bestimmen TON und KONTEXT. ' +
  'Widersprechen sie sich, gilt für Belege die Methode und für die Form die Textsorte.';

export const METHOD_ONLY_PRECEDENCE_NOTE =
  'Die Recherche-Methode bestimmt RECHERCHE, BELEGE und ZITIERWEISE. ' +
  'Ohne Textsorte bestimmt die Methode auch die Antwortform. ' +
  'Die persönlichen Anweisungen bestimmen TON und KONTEXT. ' +
  'Widersprechen sie sich in der Form, gilt die Methode — außer die Person gibt selbst eine Form vor.';

export function methodPrecedenceNote(hasTextForm: boolean): string {
  return hasTextForm ? METHOD_PRECEDENCE_NOTE : METHOD_ONLY_PRECEDENCE_NOTE;
}

/** Überschrift eines Methoden-Rezepts — eigene Zeile, damit es nicht als Plattform gelesen wird. */
export function renderMethodRecipeBlock(title: string, body: string): string {
  return `## RECHERCHE-METHODE: ${title}\n${body}`;
}

const roleOf = (r: LoadedRecipe): RecipeRole => r.rolle ?? 'textsorte';

export function createRecipeRegistry(
  maxRecipes: number = MAX_RECIPES_PER_TURN,
  maxMethods: number = MAX_METHOD_RECIPES_PER_TURN,
  /**
   * Steht schon eine Textsorte im Systemprompt (ausdrücklich gewählt, per id
   * gepinnt)? Dann gibt die Methode keine Form vor, auch wenn die Registry
   * selbst keine Textsorte trägt.
   */
  textFormElsewhere = false
): RecipeRegistry {
  const loaded = new Map<string, LoadedRecipe>();
  const countOf = (rolle: RecipeRole): number =>
    [...loaded.values()].filter((r) => roleOf(r) === rolle).length;

  return {
    register(recipe) {
      if (loaded.has(recipe.mention)) return 'duplicate';
      const rolle = roleOf(recipe);
      // Exklusiv sind nur Textsorten: eine gewählte verdrängt die vorab geladene
      // TEXTSORTE, nie eine Methode.
      if (rolle === 'textsorte' && !recipe.preloaded) {
        for (const [mention, r] of loaded) {
          if (r.preloaded && roleOf(r) === 'textsorte') loaded.delete(mention);
        }
      }
      if (countOf(rolle) >= (rolle === 'methode' ? maxMethods : maxRecipes)) return 'full';
      loaded.set(recipe.mention, recipe);
      return 'registered';
    },
    has: (mention) => loaded.has(mention),
    get size() {
      return loaded.size;
    },
    get mentions() {
      return [...loaded.keys()];
    },
    summaries() {
      return [...loaded.values()].map(({ mention, title, source }) => ({
        mention,
        title,
        source,
      }));
    },
    render() {
      if (loaded.size === 0) return '';
      const tools = (r: LoadedRecipe): string =>
        r.recommendedTools?.length
          ? `\n\nFür dieses Rezept geeignete Werkzeuge: ${r.recommendedTools.join(', ')}.`
          : '';
      const all = [...loaded.values()];
      // Methoden zuerst (erst recherchieren, dann schreiben), die Textsorte
      // zuletzt — am nächsten an der Stelle, an der geschrieben wird.
      const methods = all
        .filter((r) => roleOf(r) === 'methode')
        .map((r) => renderMethodRecipeBlock(r.title, r.body) + tools(r));
      // Same heading `buildSystemMessage` uses for an explicitly picked recipe,
      // so the model sees one shape regardless of how the recipe got there.
      const forms = all
        .filter((r) => roleOf(r) === 'textsorte')
        .map((r) => `## AKTIVE PLATTFORM: ${r.title}\n${r.body}` + tools(r));
      const note =
        methods.length > 0
          ? methodPrecedenceNote(forms.length > 0 || textFormElsewhere)
          : PRECEDENCE_NOTE;
      return `\n\n${[...methods, ...forms].join('\n\n')}\n\n${note}`;
    },
  };
}
