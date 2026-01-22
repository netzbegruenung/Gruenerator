import { z } from 'zod';

import { config } from '../config.ts';
import { getFieldValueCounts } from '../qdrant/client.ts';

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

- **kommunalwiki**: content_type, primary_category, subcategories
- **boell-stiftung**: content_type, primary_category, subcategories, region
- **bundestagsfraktion**, **gruene-de**, **gruene-at**: primary_category, country
- **examples**: platform (instagram/facebook), country (DE/AT)

## Beispiel-Workflow

1. Nutzer: "Suche Praxishilfen zum Thema Haushalt im Kommunalwiki"
2. Du rufst auf: gruenerator_get_filters({ collection: "kommunalwiki" })
3. Du erhältst: { content_type: { values: [{ value: "praxishilfe", count: 45 }, ...] }, ... }
4. Du rufst auf: gruenerator_search({ query: "Haushalt", collection: "kommunalwiki", filters: { content_type: "praxishilfe" } })`,

  inputSchema: {
    collection: z.enum([
      'oesterreich',
      'deutschland',
      'bundestagsfraktion',
      'gruene-de',
      'gruene-at',
      'kommunalwiki',
      'boell-stiftung',
      'examples'
    ]).describe('Sammlung für die Filterwerte - muss vor gefilterter Suche aufgerufen werden')
  },

  async handler({ collection }) {
    const col = config.collections[collection];
    if (!col) {
      return {
        error: true,
        message: `Unbekannte Sammlung: ${collection}. Verfügbar: ${Object.keys(config.collections).join(', ')}`
      };
    }

    if (!col.filterableFields || Object.keys(col.filterableFields).length === 0) {
      return {
        collection: col.displayName,
        collectionId: collection,
        message: 'Keine Filter für diese Sammlung verfügbar',
        filters: {}
      };
    }

    try {
      const filters = {};

      for (const [field, fieldConfig] of Object.entries(col.filterableFields)) {
        console.error(`[Filters] Fetching value counts for ${collection}.${field}`);
        const valuesWithCounts = await getFieldValueCounts(col.name, field, 50);

        filters[field] = {
          label: fieldConfig.label,
          type: fieldConfig.type,
          values: valuesWithCounts,
          totalUniqueValues: valuesWithCounts.length
        };
      }

      return {
        collection: col.displayName,
        collectionId: collection,
        description: col.description,
        filters
      };
    } catch (error) {
      console.error('[Filters] Error:', error.message);
      return {
        error: true,
        message: `Fehler beim Abrufen der Filter: ${error.message}`,
        collection: col.displayName,
        collectionId: collection
      };
    }
  }
};
