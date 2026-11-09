/**
 * `rezept_laden` — the model picks a writing recipe itself instead of waiting
 * for the user to type `@presse`.
 *
 * The tool is a SWITCH: it resolves the body, hands it to the per-turn
 * `recipeRegistry` and returns a tiny acknowledgement. The body travels
 * through the system message (see `recipeRegistry` for why all three
 * alternatives break). Shaped after `product_knowledge`, the existing tool
 * that returns instruction text rather than citable sources.
 */
import { type VisualBlockKind } from '@gruenerator/contracts';
import { SKILLS, skillRole, type Skill } from '@gruenerator/shared/agents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import {
  MAX_RECIPES_PER_TURN,
  type RecipeRegistry,
} from '../services/agenticLoop/recipeRegistry.js';
import { METHOD_RECIPE_TOOL } from '../services/agenticLoop/toolScope.js';

import { recommendedToolsFor, resolveRecipe, type RecipeCatalogEntry } from './recipeCatalog.js';

const log = createLogger('recipeTools');

/** Methoden-Rezepte des Katalogs: mitgelieferte Systemrezepte mit `rolle: methode`. */
export function methodEntries(catalog: readonly RecipeCatalogEntry[]): RecipeCatalogEntry[] {
  // Code-Rezepte (`modelOnly`, z. B. visuelle-bausteine) sind keine Recherche-Methode:
  // der erzwungene Recherche-Schritt darf sie nicht zur Wahl haben.
  return catalog.filter(
    (e) =>
      e.origin === 'system' &&
      skillRole(e.mention) === 'methode' &&
      !(SKILLS as readonly Skill[]).find((s) => s.mention === e.mention)?.modelOnly
  );
}

/**
 * Mit `only: 'methode'` wird daraus `methode_laden` (`METHOD_RECIPE_TOOL`):
 * dieselbe Tür, aber der Enum nennt nur Methoden-Rezepte. Der erzwungene erste
 * Schritt eines Recherche-Turns schneidet `activeTools` zu (#3880: `rezept_laden`
 * liess den Planer dort eine Textsorte laden statt zu suchen), und ein
 * AI-SDK-Schritt trägt kein eigenes Schema je Werkzeug — den engeren Enum gibt
 * nur ein eigenes Werkzeug her. Es steht nur in diesem einen Schritt zur Wahl
 * (`forcedFirstStepTools`, `toolScope`).
 */
export function makeRecipeTool(params: {
  catalog: readonly RecipeCatalogEntry[];
  registry: RecipeRegistry;
  userId: string | null;
  /** Die Bausteinarten des Turns — der Rumpf des Code-Rezepts „Visuelle Bausteine". */
  visualBlocks?: readonly VisualBlockKind[];
  /**
   * LV-Vorzug für generische Mentions (`preferredLvRecipeMention`, injizierbar
   * für Tests): wählt das Modell `presse`, obwohl die Person genau einen
   * Landesverband vertritt (oder der Agent einer ist), wird dessen Variante
   * geladen. Deterministisch hier statt als Katalog-Bitte ans Modell — die
   * kleinen Loop-Modelle greifen sonst zuverlässig zur generischen Zeile.
   */
  preferLv?: (mention: string) => string | null;
  /** Ist dieses Werkzeug im Turn montiert? Filtert die Empfehlungen des Rezepts. */
  isMounted?: (tool: string) => boolean;
  /** `methode`: das engere Werkzeug `methode_laden` — Enum nur über Methoden-Rezepte. */
  only?: 'methode';
}): Tool {
  const { registry, userId, isMounted, only, visualBlocks } = params;
  const catalog = only === 'methode' ? methodEntries(params.catalog) : params.catalog;
  // Der LV-Vorzug gilt Textsorten; eine Methode hat keine LV-Variante.
  const preferLv = only === 'methode' ? undefined : params.preferLv;
  const keys = catalog.map((e) => e.key);

  return tool({
    description:
      only === 'methode'
        ? 'Lädt ein Methoden-Rezept aus VERFÜGBARE REZEPTE – das erprobte Vorgehen für eine Recherche (Beschlusslage, Rechtsstand, Bundestagsrecherche). NUTZE WENN die Beschreibung eines Rezepts zur Recherche-Aufgabe passt. Danach recherchierst du mit den Suchwerkzeugen weiter; das Rezept ersetzt die Suche nicht.'
        : 'Lädt ein Rezept aus VERFÜGBARE REZEPTE – das erprobte Vorgehen für eine Aufgabe (Textsorte, Recherche-Methode, Ideenfindung, Ablauf). NUTZE WENN die Beschreibung eines Rezepts zur aktuellen Aufgabe passt, und zwar bevor du schreibst oder recherchierst. Mehrere Rezepte sind möglich, je Aufruf eins.',
    inputSchema: z.object({
      // Closed set — the model may only name a recipe that exists for this
      // user this turn. Runtime list, hence the tuple cast (cf. searchTools).
      rezept: z
        .enum(keys as [string, ...string[]])
        .describe('Kennung des Rezepts aus der Liste VERFÜGBARE REZEPTE'),
    }),
    execute: async ({ rezept }: { rezept: string }) => {
      // Der LV-Vorzug greift VOR dem Duplikat-Check: sonst registrierte der
      // zweite Aufruf von `presse` die Variante ein zweites Mal.
      const entry = catalog.find((e) => e.key === rezept) ?? null;
      // Ein gespeichertes fremdes Rezept wird über seine Zeile geladen, nie über
      // die Mention — die kann auch ein eigenes oder ein Systemrezept tragen.
      const library = entry?.origin === 'library' && entry.id !== null ? entry : null;
      const lvVariant = library ? null : (preferLv?.(rezept) ?? null);
      const effective = lvVariant ?? (library ? library.mention : rezept);
      // Was das Modell zurückgemeldet bekommt: der Katalog-Schlüssel, den es kennt.
      const shown = library ? rezept : effective;
      const registryKey = library ? library.id! : effective;
      if (registry.has(registryKey)) {
        // Re-calling a tool it already called is a known model failure mode,
        // not an edge case. Report the state instead of stacking a second block.
        return { geladen: true, rezept: shown, hinweis: 'War in diesem Turn bereits geladen.' };
      }

      const resolved = await resolveRecipe({
        mention: effective,
        recipeId: library ? library.id : null,
        userId,
        ...(visualBlocks ? { visualBlocks } : {}),
      });
      // `resolveRecipeBody` fällt bei einer nicht mehr sichtbaren id auf die
      // Mention zurück — für ein gespeichertes Rezept wäre das ein anderes
      // (eigenes oder System-)Rezept. Hier gilt: genau diese Zeile oder nichts.
      if (!resolved || (library && resolved.id !== library.id)) {
        // Loud on purpose. `getInternalSkillPrompt` returns null when
        // SKILLS_INTERN_DIR was never rolled out — on the single-pass path
        // that silently degrades to the agent's base role, which is a
        // tolerable outage. As a tool result it must NOT read as success, or
        // the model announces "Rezept geladen" and then writes generically.
        log.warn(`[Rezept] nicht verfügbar: ${effective}`);
        return {
          geladen: false,
          rezept: shown,
          grund:
            'Für dieses Rezept liegen keine Schreibvorgaben vor. Schreibe den Text ohne Rezept und weise NICHT darauf hin, dass ein Rezept fehlt.',
        };
      }

      const outcome = registry.register({
        id: resolved.id,
        mention: effective,
        title: resolved.title,
        body: resolved.body,
        source: resolved.source,
        rolle: skillRole(effective),
        ...(isMounted && { recommendedTools: recommendedToolsFor(effective, isMounted) }),
      });

      if (outcome === 'full') {
        return {
          geladen: false,
          rezept: shown,
          grund: `Es sind bereits ${registry.size} Rezepte geladen (${registry.mentions.join(', ')}). Mehr als ${MAX_RECIPES_PER_TURN} gehen nicht – schreibe mit diesen.`,
        };
      }

      if (outcome === 'over_budget') {
        return {
          geladen: false,
          rezept: shown,
          grund: 'Das Rezept passt nicht mehr ins Budget dieses Turns.',
        };
      }

      const isMethod = !library && skillRole(effective) === 'methode';
      log.info(
        `[Rezept] gewählt=${effective} quelle=${resolved.source}` +
          (lvVariant ? ` (LV-Vorzug statt ${rezept})` : '')
      );
      return {
        geladen: true,
        rezept: shown,
        titel: resolved.title,
        hinweis: isMethod
          ? 'Das Rezept beschreibt, WIE du recherchierst. Recherchiere jetzt mit den Werkzeugen, die es nennt.'
          : lvVariant
            ? `Statt der generischen Vorlage wurde die Landesverbands-Variante „${resolved.title}" geladen. Halte dich beim Schreiben daran.`
            : 'Die Schreibvorgaben stehen dir ab jetzt zur Verfügung. Halte dich beim Schreiben daran.',
      };
    },
  });
}
