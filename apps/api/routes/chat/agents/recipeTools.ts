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
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { type RecipeRegistry } from '../services/agenticLoop/recipeRegistry.js';

import { resolveRecipe, type RecipeCatalogEntry } from './recipeCatalog.js';

const log = createLogger('recipeTools');

export function makeRecipeTool(params: {
  catalog: readonly RecipeCatalogEntry[];
  registry: RecipeRegistry;
  userId: string | null;
  /**
   * LV-Vorzug für generische Mentions (`preferredLvRecipeMention`, injizierbar
   * für Tests): wählt das Modell `presse`, obwohl die Person genau einen
   * Landesverband vertritt (oder der Agent einer ist), wird dessen Variante
   * geladen. Deterministisch hier statt als Katalog-Bitte ans Modell — die
   * kleinen Loop-Modelle greifen sonst zuverlässig zur generischen Zeile.
   */
  preferLv?: (mention: string) => string | null;
}): Tool {
  const { catalog, registry, userId, preferLv } = params;
  const mentions = catalog.map((e) => e.mention);

  return tool({
    description: `Lädt die Schreibvorgaben ("Rezept") für eine bestimmte Textsorte oder Plattform — z.B. Pressemitteilung, Instagram, Reel. Das Rezept legt Länge, Aufbau und Plattformkonventionen fest.

NUTZE WENN der*die Nutzer*in einen Text für eine konkrete Plattform oder Textsorte will und noch kein Rezept aktiv ist. Rufe es VOR dem Schreiben auf, nicht danach.
NICHT für Recherche, Rückfragen, Zusammenfassungen oder normalen Fließtext ohne Zielformat.`,
    inputSchema: z.object({
      // Closed set — the model may only name a recipe that exists for this
      // user this turn. Runtime list, hence the tuple cast (cf. searchTools).
      rezept: z
        .enum(mentions as [string, ...string[]])
        .describe('Kennung des Rezepts aus der Liste VERFÜGBARE REZEPTE'),
    }),
    execute: async ({ rezept }: { rezept: string }) => {
      // Der LV-Vorzug greift VOR dem Duplikat-Check: sonst registrierte der
      // zweite Aufruf von `presse` die Variante ein zweites Mal.
      const lvVariant = preferLv?.(rezept) ?? null;
      const effective = lvVariant ?? rezept;
      if (registry.has(effective)) {
        // Re-calling a tool it already called is a known model failure mode,
        // not an edge case. Report the state instead of stacking a second block.
        return { geladen: true, rezept: effective, hinweis: 'War in diesem Turn bereits geladen.' };
      }

      const resolved = await resolveRecipe({ mention: effective, userId });
      if (!resolved) {
        // Loud on purpose. `getInternalSkillPrompt` returns null when
        // SKILLS_INTERN_DIR was never rolled out — on the single-pass path
        // that silently degrades to the agent's base role, which is a
        // tolerable outage. As a tool result it must NOT read as success, or
        // the model announces "Rezept geladen" and then writes generically.
        log.warn(`[Rezept] nicht verfügbar: ${effective}`);
        return {
          geladen: false,
          rezept: effective,
          grund:
            'Für dieses Rezept liegen keine Schreibvorgaben vor. Schreibe den Text ohne Rezept und weise NICHT darauf hin, dass ein Rezept fehlt.',
        };
      }

      const outcome = registry.register({
        mention: effective,
        title: resolved.title,
        body: resolved.body,
        source: resolved.source,
      });

      if (outcome === 'full') {
        return {
          geladen: false,
          rezept: effective,
          grund: `Es sind bereits ${registry.size} Rezepte geladen (${registry.mentions.join(', ')}). Schreibe mit diesen.`,
        };
      }

      log.info(
        `[Rezept] gewählt=${effective} quelle=${resolved.source}` +
          (lvVariant ? ` (LV-Vorzug statt ${rezept})` : '')
      );
      return {
        geladen: true,
        rezept: effective,
        titel: resolved.title,
        hinweis: lvVariant
          ? `Statt der generischen Vorlage wurde die Landesverbands-Variante „${resolved.title}" geladen. Halte dich beim Schreiben daran.`
          : 'Die Schreibvorgaben stehen dir ab jetzt zur Verfügung. Halte dich beim Schreiben daran.',
      };
    },
  });
}
