/**
 * Dossier building utilities for deep research mode
 * Constructs system prompts and methodology sections
 */

import type { GrundsatzResult, SearchResult, CategorizedSources } from '../types.js';
import type { FilteredData } from './dataFilter.js';

/**
 * Build dossier system prompt for AI
 */
export function buildDossierSystemPrompt(): string {
  return `Du bist ein Experte für politische Recherche und erstellst faktische, tiefgreifende Dossiers basierend auf verfügbaren Daten.

WICHTIG:
- BEANTWORTE DIE NUTZERFRAGE DIREKT: Fokussiere dich primär darauf, die konkrete Frage des Nutzers zu beantworten
- Verwende FAKTEN aus den Quellen, keine Spekulationen
- Vermeide oberflächliche Stichpunkt-Listen
- Schreibe in zusammenhängenden, analytischen Absätzen
- Zitiere konkrete Daten, Zahlen und Aussagen aus den Quellen
- Keine Fantasie oder Vermutungen - nur das, was die Quellen hergeben

Struktur des Dossiers:
1. **Executive Summary** - DIREKTE Beantwortung der Nutzerfrage basierend auf verfügbaren Erkenntnissen
2. **Position von Bündnis 90/Die Grünen** - Konkrete Aussagen aus Grundsatzprogrammen zur Frage
3. **Faktenlage nach Themenbereichen** - Detaillierte Analyse der verfügbaren Informationen zur Beantwortung der Frage
4. **Quellenbasierte Erkenntnisse** - Tiefere Analyse konkreter Daten und Aussagen die zur Antwort beitragen

Erstelle eine faktische, tiefgreifende Analyse die die Nutzerfrage beantwortet. Verwende zusammenhängende Absätze statt Aufzählungen.`;
}

/**
 * Build dossier prompt with filtered data
 */
export function buildDossierPrompt(query: string, filteredData: FilteredData): string {
  return `Erstelle ein faktisches Recherche-Dossier zur FRAGE: "${query}"

WICHTIGE ANWEISUNG: Die Nutzerfrage lautet "${query}" - BEANTWORTE DIESE FRAGE DIREKT mit den verfügbaren Daten!

## Verfügbare Forschungsergebnisse:
${JSON.stringify(filteredData.webResults, null, 2)}

## Verfügbare Quellen mit Inhalten:
${JSON.stringify(filteredData.sources, null, 2)}

## Verfügbare Grundsatz-Position:
${JSON.stringify(filteredData.grundsatz, null, 2)}

ANWEISUNG:
- BEANTWORTE DIE KONKRETE FRAGE: "${query}" - das ist das Hauptziel!
- Analysiere diese Daten gründlich und faktisch um die Frage zu beantworten
- Schreibe in zusammenhängenden Absätzen, nicht in Listen
- Zitiere konkrete Aussagen und Daten aus den Quellen die zur Antwort beitragen
- Entwickle tiefere Erkenntnisse aus den verfügbaren Informationen zur Beantwortung der Frage
- Verzichte auf Spekulationen oder allgemeine Aussagen ohne Quellenbeleg
- Fokussiere auf das, was die Quellen zur Beantwortung der Frage tatsächlich aussagen`;
}

/**
 * Build methodology section for dossier
 */
export function buildMethodologySection(
  grundsatzResults: GrundsatzResult | null | undefined,
  researchQuestions: string[] | undefined,
  aggregatedResults: SearchResult[] | undefined,
  categorizedSources: CategorizedSources | undefined
): string {
  return `

---

## Methodology

Diese Deep Research wurde mit folgender Methodik durchgeführt:

1. **Grundsatz-Recherche**: Suche in offiziellen Grundsatzprogrammen von Bündnis 90/Die Grünen (${grundsatzResults?.results?.length || 0} Dokumente gefunden)
2. **Strategische Fragengenerierung**: ${researchQuestions?.length || 0} Forschungsfragen zu verschiedenen Aspekten des Themas
3. **Optimierte Webrecherche**: SearXNG mit intelligenter Quellenauswahl und regionaler Filterung (${aggregatedResults?.length || 0} Quellen analysiert)
4. **Query-Optimierung**: Automatische Anpassung für deutsche Suchbegriffe und <400 Zeichen Limit
5. **KI-Synthese**: Professionelle Analyse und Strukturierung durch Claude AI

**Datenquellen:**
- Offizielle Grundsatzprogramme: ${grundsatzResults?.results?.length || 0} Treffer
- Externe Webquellen: ${aggregatedResults?.length || 0} Quellen
- Kategorien: ${Object.keys(categorizedSources || {}).length}
- Forschungsfragen: ${researchQuestions?.length || 0}

**Qualitätssicherung:** SearXNG mit intelligenter Quellenauswahl und regionaler Filterung für maximale Relevanz.`;
}
