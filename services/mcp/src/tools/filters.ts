import { z } from 'zod';

import { buildCollectionDefaultFilter } from '../catalog.ts';
import { config } from '../config.ts';
import { getFieldValueCounts } from '../qdrant/client.ts';
import { classifyError, connectionErrorResponse } from '../utils/errors.ts';

/**
 * Tool to discover available filter values for a collection
 * Returns faceted values with document counts for better filtering UX
 */
export const filtersTool = {
  name: 'gruenerator_get_filters',
  description: `Gibt verfügbare Filterwerte für eine Sammlung zurück (mit Dokumentanzahl pro Wert).

WICHTIG: Rufe dieses Tool IMMER auf BEVOR du gruenerator_search mit Filtern verwendest!

## Wann aufrufen?

- Nutzer fragt nach bestimmtem Dokumenttyp (z.B. "nur Praxishilfen", "nur Grundsatzprogramm")
- Nutzer will nach Kategorie filtern (z.B. "nur zum Thema Umwelt")
- Nutzer will nach Region filtern (z.B. "nur Europa" bei Böll-Stiftung)
- Nutzer will nach Land filtern (z.B. "nur Deutschland" oder "nur Österreich")
- Du willst die Suche eingrenzen

## Verfügbare Filter pro Sammlung

- **kommunalwiki**: content_type, primary_category, subcategories, published_at (Datum)
- **boell-stiftung**: content_type, primary_category, subcategories, region, published_at (Datum)
- **bundestagsfraktion**, **gruene-de**, **gruene-at**: primary_category, country, published_at (Datum)
- **gruenblog**: primary_category, published_at (Datum)
- **examples**: platform (instagram/facebook), country (DE/AT)
- **Landesverbände** (hamburg, schleswig-holstein, thueringen, bayern, mecklenburg-vorpommern, brandenburg): content_type, primary_category, subcategories, published_at (Datum)
- **berlin**: source_id (Quelle mit Anzeigenamen), published_at (Datum)
- **satzungen**: landesverband, gremium

## Beispiel-Workflow

1. Nutzer: "Suche Praxishilfen zum Thema Haushalt im Kommunalwiki"
2. Du rufst auf: gruenerator_get_filters({ collection: "kommunalwiki" })
3. Du erhältst: { content_type: { values: [{ value: "praxishilfe", count: 45 }, ...] }, ... }
4. Du rufst auf: gruenerator_search({ query: "Haushalt", collection: "kommunalwiki", filters: { content_type: "praxishilfe" } })`,

  inputSchema: {
    collection: z
      .string()
      .describe('Sammlung für die Filterwerte - muss vor gefilterter Suche aufgerufen werden'),
  },

  async handler({ collection }: { collection: string }) {
    const col = config.collections[collection];
    if (!col) {
      return {
        error: true,
        message: `Unbekannte Sammlung: ${collection}. Verfügbar: ${Object.keys(config.collections).join(', ')}`,
        hint: 'Alle Sammlungen findest du über `resources/list` (gruenerator://collections).',
      };
    }

    if (!col.filterableFields || Object.keys(col.filterableFields).length === 0) {
      return {
        collection: col.displayName,
        collectionId: collection,
        message: 'Keine Filter für diese Sammlung verfügbar',
        filters: {},
      };
    }

    try {
      const filters: Record<
        string,
        {
          label: string;
          type: string;
          values?: unknown[];
          totalUniqueValues?: number;
          valueLabels?: Record<string, string>;
          usage?: { date_from: string; date_to: string };
        }
      > = {};
      const baseFilter = buildCollectionDefaultFilter(collection) as Record<string, unknown> | null;

      for (const [field, fieldConfig] of Object.entries(col.filterableFields)) {
        if (fieldConfig.type === 'date_range') {
          filters[field] = {
            label: fieldConfig.label,
            type: 'date_range',
            usage: {
              date_from: 'ISO-Datum als Startdatum (z.B. "2024-01-01")',
              date_to: 'ISO-Datum als Enddatum (z.B. "2025-12-31")',
            },
          };
          continue;
        }

        console.error(`[Filters] Fetching value counts for ${collection}.${field}`);
        const valuesWithCounts = await getFieldValueCounts(col.name, field, 50, baseFilter);

        const filterEntry: (typeof filters)[string] = {
          label: fieldConfig.label,
          type: fieldConfig.type,
          values: valuesWithCounts,
          totalUniqueValues: valuesWithCounts.length,
        };

        if (fieldConfig.valueLabels) {
          filterEntry.valueLabels = fieldConfig.valueLabels;
        }

        filters[field] = filterEntry;
      }

      const firstField = Object.keys(filters).find((f) => filters[f]?.values);
      const firstValue = firstField
        ? (filters[firstField]?.values?.[0] as { value: string } | undefined)?.value
        : null;
      const usageExample = firstField
        ? {
            step1: `gruenerator_get_filters({ collection: "${collection}" })`,
            step2: `gruenerator_search({ query: "Dein Suchbegriff", country: "DE", collection: "${collection}", filters: { ${firstField}: "${firstValue || 'WERT'}" } })`,
          }
        : null;

      return {
        collection: col.displayName,
        collectionId: collection,
        description: col.description,
        filters,
        usageExample,
        hinweis:
          'Nutze die Werte aus "values" direkt als Filter bei gruenerator_search. Die Werte sind exakt und dürfen nicht verändert werden.',
      };
    } catch (err) {
      const { detail, isConnection } = classifyError(err);
      console.error(`[Filters] Error: ${detail}`);
      if (isConnection) {
        return connectionErrorResponse(detail, {
          collection: col.displayName,
          collectionId: collection,
        });
      }
      return {
        error: true,
        message: `Fehler beim Abrufen der Filter: ${detail}`,
        collection: col.displayName,
        collectionId: collection,
      };
    }
  },
};
