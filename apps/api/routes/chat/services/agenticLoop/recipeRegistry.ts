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

/** How many recipes one turn may load. See `register`. */
export const MAX_RECIPES_PER_TURN = 2;

export interface LoadedRecipe {
  mention: string;
  title: string;
  /** The prompt body — internal skill prompt or a user's learned style block. */
  body: string;
  source: 'system' | 'user';
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

export function createRecipeRegistry(maxRecipes: number = MAX_RECIPES_PER_TURN): RecipeRegistry {
  const loaded = new Map<string, LoadedRecipe>();

  return {
    register(recipe) {
      if (loaded.has(recipe.mention)) return 'duplicate';
      if (loaded.size >= maxRecipes) return 'full';
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
      // Same heading `buildSystemMessage` uses for an explicitly picked recipe,
      // so the model sees one shape regardless of how the recipe got there.
      const blocks = [...loaded.values()].map((r) => `## AKTIVE PLATTFORM: ${r.title}\n${r.body}`);
      return `\n\n${blocks.join('\n\n')}\n\n${PRECEDENCE_NOTE}`;
    },
  };
}
