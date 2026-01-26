/**
 * Mistral AI prompts for parameter extraction
 * Agent-specific prompt templates
 */

import type { ChatContext } from '../../types.js';

/**
 * Create extraction prompt for Mistral based on agent type
 */
export function createExtractionPrompt(
  message: string,
  agent: string,
  context: ChatContext
): string {
  const basePrompt = `Extrahiere Parameter aus dieser deutschen Nachricht für die Erstellung eines ${agent}-Sharepics.

Nachricht: "${message}"

`;

  let specificInstructions = '';

  switch (agent) {
    case 'zitat':
      specificInstructions = `Extrahiere:
- author: Name der Person (z.B. "von Hans Müller" → "Hans Müller")
- theme: Hauptthema des Zitats
- details: Zusätzliche Details oder Kontext

Beispiele:
- "Zitat von Angela Merkel über Klimaschutz" → author: "Angela Merkel", theme: "Klimaschutz"
- "das zitat ist von moritz wächter und soll zu klimaschutz sein" → author: "Moritz Wächter", theme: "Klimaschutz"`;
      break;

    case 'info':
    case 'headline':
      specificInstructions = `Extrahiere:
- theme: Hauptthema des Sharepics
- details: Zusätzliche Informationen oder gewünschter Inhalt`;
      break;

    case 'dreizeilen':
      specificInstructions = `Extrahiere:
- theme: Hauptthema
- details: Zusätzliche Details
- lines: Falls spezifische Zeilen angegeben (line1, line2, line3)`;
      break;
  }

  return (
    basePrompt +
    specificInstructions +
    `

Antworte nur mit gültigem JSON in diesem Format:
{
  "author": "Name oder null",
  "theme": "Hauptthema",
  "details": "Zusätzliche Details",
  "confidence": {
    "author": 0.0-1.0,
    "theme": 0.0-1.0
  }
}`
  );
}
