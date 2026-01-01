/**
 * Context extraction operations
 * Generates agent-specific questions for knowledge extraction
 */

import type { Intent, AgentType } from './types.js';

/**
 * Generate context-specific questions based on intent and user message
 */
export function generateQuestionsForIntent(intent: Intent, message: string): string {
  const agent: AgentType = intent.agent;
  const context = message.substring(0, 200); // First 200 chars for context

  switch (agent) {
    case 'social_media':
      return `Extrahiere die wichtigsten Punkte aus den Dokumenten für einen Social Media Post über: "${context}".
              Fokussiere auf: Emotionale Aussagen, prägnante Zahlen, interessante Fakten, eingängige Zitate.
              Antworte in 5-8 kurzen Stichpunkten.`;

    case 'pressemitteilung':
      return `Welche Informationen aus den Dokumenten sind relevant für eine Pressemitteilung über: "${context}"?
              Fokussiere auf: Offizielle Aussagen, verifizierbare Daten, Expertenaussagen, Hintergrundinformationen.
              Antworte in 6-10 präzisen Stichpunkten.`;

    case 'antrag':
      return `Welche Argumente und Fakten aus den Dokumenten unterstützen einen politischen Antrag zu: "${context}"?
              Fokussiere auf: Rechtliche Grundlagen, Präzedenzfälle, Sachargumente, Begründungen.
              Antworte in 6-10 strukturierten Stichpunkten.`;

    case 'zitat':
      return `Finde prägnante Zitate und Aussagen aus den Dokumenten, die sich auf das Thema beziehen: "${context}".
              Fokussiere auf: Markante Aussagen, emotionale Zitate, pointierte Meinungen.
              Antworte mit 3-5 direkten Zitaten mit Kontext.`;

    case 'leichte_sprache':
      return `Identifiziere die Hauptaussagen aus den Dokumenten zu: "${context}".
              Diese sollen in leichte Sprache übersetzt werden. Fokussiere auf: Kernbotschaften, wichtige Fakten.
              Antworte in 4-6 einfachen Stichpunkten.`;

    case 'gruene_jugend':
      return `Welche Aspekte aus den Dokumenten sind relevant für junge Menschen und Aktivismus zu: "${context}"?
              Fokussiere auf: Zukunftsbezug, Generationengerechtigkeit, Handlungsaufforderungen.
              Antworte in 5-7 aktivistischen Stichpunkten.`;

    case 'universal':
    default:
      return `Was sagen die Dokumente zu: "${context}"?
              Extrahiere die relevantesten Informationen und Fakten.
              Antworte in 6-8 strukturierten Stichpunkten.`;
  }
}
