/**
 * Person Search Tool for gruenerator-mcp
 * Searches for German Green Party MPs with enriched data from DIP API
 */

import { z } from 'zod';
import { getEnrichedPersonSearch } from '../services/enriched-person-search.js';

export const personSearchTool = {
  name: 'gruenerator_person_search',
  description: `Sucht nach Grünen-Abgeordneten mit angereicherten Daten aus der DIP-API.

## Wann verwenden?

- Nutzer fragt nach einer PERSON (z.B. "Robert Habeck", "Annalena Baerbock")
- Nutzer fragt nach Aktivitäten eines MdB (z.B. "Was hat Habeck beantragt?")
- Nutzer will Anträge, Reden oder Abstimmungen eines Abgeordneten
- Nutzer erwähnt Namen wie Ricarda Lang, Omid Nouripour, Katharina Dröge, etc.

## Rückgabe

- person: Profil (Name, Fraktion, Wahlkreis, Biografie)
- drucksachen: Anträge, Anfragen, Gesetzentwürfe aus dem Bundestag
- aktivitaeten: Reden, Abstimmungen, Mitarbeit
- contentMentions: Erwähnungen auf gruene-bundestag.de

## Hinweis

Für allgemeine thematische Suche in bundestagsfraktion → gruenerator_search verwenden.
Für Personensuche mit Anreicherung → DIESES Tool.

## Beispiele

- "Robert Habeck" → gruenerator_person_search({ query: "Robert Habeck" })
- "Anträge von Baerbock" → gruenerator_person_search({ query: "Anträge von Baerbock" })
- "Was hat Dröge im Bundestag gemacht?" → gruenerator_person_search({ query: "Katharina Dröge" })`,

  inputSchema: {
    query: z.string().describe('Name oder Frage über einen Abgeordneten (z.B. "Robert Habeck", "Anträge von Baerbock")'),
    contentLimit: z.number().default(15).describe('Max. Erwähnungen auf gruene-bundestag.de'),
    drucksachenLimit: z.number().default(20).describe('Max. Drucksachen (Anträge, Anfragen)'),
    aktivitaetenLimit: z.number().default(30).describe('Max. Aktivitäten (Reden, Abstimmungen)')
  },

  async handler({ query, contentLimit = 15, drucksachenLimit = 20, aktivitaetenLimit = 30 }) {
    try {
      const service = getEnrichedPersonSearch();
      const result = await service.search(query, {
        contentLimit,
        drucksachenLimit,
        aktivitaetenLimit
      });

      return result;
    } catch (error) {
      console.error('[PersonSearchTool] Error:', error.message);
      return {
        error: true,
        message: error.message,
        isPersonQuery: false
      };
    }
  }
};
