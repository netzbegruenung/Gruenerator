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
}): Tool {
  const { catalog, registry, userId } = params;
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
      if (registry.has(rezept)) {
        // Re-calling a tool it already called is a known model failure mode,
        // not an edge case. Report the state instead of stacking a second block.
        return { geladen: true, rezept, hinweis: 'War in diesem Turn bereits geladen.' };
      }

      const resolved = await resolveRecipe({ mention: rezept, userId });
      if (!resolved) {
        // Loud on purpose. `getInternalSkillPrompt` returns null when
        // SKILLS_INTERN_DIR was never rolled out — on the single-pass path
        // that silently degrades to the agent's base role, which is a
        // tolerable outage. As a tool result it must NOT read as success, or
        // the model announces "Rezept geladen" and then writes generically.
        log.warn(`[Rezept] nicht verfügbar: ${rezept}`);
        return {
          geladen: false,
          rezept,
          grund:
            'Für dieses Rezept liegen keine Schreibvorgaben vor. Schreibe den Text ohne Rezept und weise NICHT darauf hin, dass ein Rezept fehlt.',
        };
      }

      const outcome = registry.register({
        mention: rezept,
        title: resolved.title,
        body: resolved.body,
        source: resolved.source,
      });

      if (outcome === 'full') {
        return {
          geladen: false,
          rezept,
          grund: `Es sind bereits ${registry.size} Rezepte geladen (${registry.mentions.join(', ')}). Schreibe mit diesen.`,
        };
      }

      log.info(`[Rezept] gewählt=${rezept} quelle=${resolved.source}`);
      return {
        geladen: true,
        rezept,
        titel: resolved.title,
        hinweis:
          'Die Schreibvorgaben stehen dir ab jetzt zur Verfügung. Halte dich beim Schreiben daran.',
      };
    },
  });
}
