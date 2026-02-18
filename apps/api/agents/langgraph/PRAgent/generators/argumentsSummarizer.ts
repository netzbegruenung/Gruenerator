import mistralClient from '../../../../workers/mistralClient.js';

import type { ArgumentResult } from './argumentsGenerator.js';

/**
 * Generate a concise summary of research arguments using Mistral Small
 * Summarizes the key findings from Green Party knowledge bases
 */
export async function summarizeArguments(
  topic: string,
  argumentsList: ArgumentResult[]
): Promise<string> {
  if (!argumentsList || argumentsList.length === 0) {
    return 'Keine relevanten Argumente gefunden.';
  }

  const argumentsText = argumentsList
    .map(
      (arg, idx) =>
        `${idx + 1}. **${arg.source}** (Relevanz: ${Math.round(arg.relevance * 100)}%)\n   ${arg.text}`
    )
    .join('\n\n');

  const prompt = `Du bist ein grüner Kommunikationsberater.

**Aufgabe**: Fasse die folgenden recherchierten Argumente aus grünen Wissensdatenbanken zu einem prägnanten, übersichtlichen Summary zusammen.

**Thema**: ${topic}

**Recherchierte Argumente**:

${argumentsText}

**Deine Antwort**:
Erstelle eine strukturierte Zusammenfassung mit:
- **Kernaussagen**: Die 2-3 wichtigsten Argumente (als Stichpunkte)
- **Quellenbasis**: Welche Dokumente/Programme liefern die stärksten Belege?
- **Nutzungshinweis**: Wie können diese Argumente in der Kommunikation verwendet werden?

Halte die Zusammenfassung kurz (max. 200 Wörter), präzise und sofort nutzbar.`;

  try {
    const response = await mistralClient.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      maxTokens: 500,
      temperature: 0.3,
    });

    const content = response.choices?.[0]?.message?.content;
    const summary = typeof content === 'string' ? content : '';
    return summary || 'Zusammenfassung konnte nicht erstellt werden.';
  } catch (error) {
    console.error('[ArgumentsSummarizer] Failed to generate summary:', error);
    return `**Recherchierte Argumente (${argumentsList.length})**\n\nDie Recherche hat ${argumentsList.length} relevante Argumente aus grünen Wissensdatenbanken gefunden. Bitte siehe Details unten.`;
  }
}
