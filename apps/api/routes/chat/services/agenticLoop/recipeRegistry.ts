/**
 * Per-turn store for recipes ("Rezepte") the model loaded itself.
 *
 * The `rezept_laden` tool is a SWITCH, not a carrier: it registers here and
 * returns a tiny acknowledgement. The prompt body travels through the system
 * message instead — `buildPrepareStep` for the loop model, `buildRepairSystem`
 * for the repair writer. Three reasons, all load-bearing:
 *
 *  1. The repair writer has no tools at all, so a body returned from
 *     `execute()` would never reach it.
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
 * Wie viele Rezepte ein Turn insgesamt trägt — das ausdrücklich gewählte
 * (`pinned`) mitgezählt, Textsorten und Methoden zusammen. Drei, weil ein
 * Auftrag wie „PM und Instagram-Post dazu, mit Bundestags-Belegen" genau diese
 * Dreiheit braucht; mehr Rümpfe im Systemprompt kosten Aufmerksamkeit.
 */
export const MAX_RECIPES_PER_TURN = 3;
/** Zeichenbudget aller Rezept-Rümpfe eines Turns (≈ 6k Tokens). */
export const MAX_RECIPE_BODY_CHARS = 24_000;

/** Siehe `Skill.rolle`: `textsorte` formt den Text, `methode` die Recherche. */
export type RecipeRole = SkillRole;

export interface LoadedRecipe {
  mention: string;
  title: string;
  /** The prompt body — internal skill prompt or a user's learned style block. */
  body: string;
  source: 'system' | 'user';
  /** Zeilen-id eines angelernten Stils, sonst `null`. Schlüssel vor der Mention. */
  id: string | null;
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
  /**
   * Von der Person ausdrücklich gewählt (@-Erwähnung, gepinnte Zeile). Wird nie
   * verdrängt und von Kappe und Zeichenbudget nicht abgewiesen — eine
   * Bestellung fällt nicht still unter den Tisch.
   */
  pinned?: boolean;
  /** Fehlt = `textsorte` — die Rolle jedes Rezepts vor der Trennung. */
  rolle?: RecipeRole;
}

export type RegisterOutcome = 'registered' | 'duplicate' | 'full' | 'over_budget';

/** Der Schlüssel eines Rezepts im Turn: die Zeilen-id, sonst die Mention. */
export function recipeKey(r: Pick<LoadedRecipe, 'id' | 'mention'>): string {
  return r.id ?? r.mention;
}

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
  /** Trifft nur den Schlüssel (`recipeKey`): zwei Rezepte können dieselbe Mention tragen. */
  has(key: string): boolean;
  readonly size: number;
  /** Wie viele Rezepte noch Platz haben (Kappe minus geladene). */
  readonly remaining: number;
  /** Titel des ausdrücklich gewählten Rezepts, sonst `null`. */
  readonly pinnedTitle: string | null;
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
/**
 * Im Loop entsteht der Systemprompt, BEVOR das Modell ein Rezept lädt — Regel 2
 * der ANTWORT-REGELN ist dort deshalb die Standardregel („2-4 Absätze … Hebe
 * Namen, Jahreszahlen und Kennzahlen mit **Fettung** hervor"), nicht die der
 * Textsorte (`buildAnswerFormatRule`, Zweig `textform:`). Gemessen 01.11.2026:
 * Instagram-Posts kamen mit `**14 Uhr**` zurück, das Instagram als Sternchen
 * anzeigt. Dieser Satz stellt die Regel nach, sobald eine Textsorte geladen ist.
 */
export const TEXT_FORM_REPLACES_FORMAT_RULE =
  'Regel 2 der ANTWORT-REGELN gilt für diese Antwort nicht: Form und Umfang gibt die Textsorte vor — keine Fettung, keine Aufzählung und keine Überschrift, die sie nicht selbst vorsieht.';

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
  maxBodyChars: number = MAX_RECIPE_BODY_CHARS
): RecipeRegistry {
  const loaded = new Map<string, LoadedRecipe>();

  return {
    register(recipe) {
      const key = recipeKey(recipe);
      if (loaded.has(key)) return 'duplicate';
      // Exklusiv sind nur Textsorten: eine gewählte verdrängt die vorab geladene
      // TEXTSORTE, nie eine Methode und nie eine gepinnte. Erst nach den
      // Prüfungen löschen — ein abgewiesenes Rezept darf nichts verdrängen.
      const evicted: string[] = [];
      if (roleOf(recipe) === 'textsorte' && !recipe.preloaded && !recipe.pinned) {
        for (const [k, r] of loaded) {
          if (r.preloaded && !r.pinned && roleOf(r) === 'textsorte') evicted.push(k);
        }
      }
      const kept = [...loaded.entries()].filter(([k]) => !evicted.includes(k));
      if (!recipe.pinned) {
        if (kept.length >= maxRecipes) return 'full';
        const used = kept.reduce((n, [, r]) => n + r.body.length, 0);
        if (used + recipe.body.length > maxBodyChars) return 'over_budget';
      }
      for (const k of evicted) loaded.delete(k);
      loaded.set(key, recipe);
      return 'registered';
    },
    has: (key) => loaded.has(key),
    get remaining() {
      return Math.max(0, maxRecipes - loaded.size);
    },
    get pinnedTitle() {
      return [...loaded.values()].find((r) => r.pinned)?.title ?? null;
    },
    get size() {
      return loaded.size;
    },
    get mentions() {
      return [...loaded.values()].map((r) => r.mention);
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
      const note = methods.length > 0 ? methodPrecedenceNote(forms.length > 0) : PRECEDENCE_NOTE;
      const formRule = forms.length > 0 ? `\n\n${TEXT_FORM_REPLACES_FORMAT_RULE}` : '';
      const perForm =
        forms.length >= 2
          ? '\n\nLiefere je Textsorte eine eigene Fassung, klar überschrieben.'
          : '';
      return `\n\n${[...methods, ...forms].join('\n\n')}\n\n${note}${formRule}${perForm}`;
    },
  };
}
