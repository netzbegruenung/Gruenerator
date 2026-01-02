/**
 * AI Layout Generator for Text2Sharepic
 *
 * Simplified prompt with exact zone names and complete examples.
 */

import type { Request } from 'express';
import type { LayoutPlan } from './types.js';
import { CORPORATE_DESIGN } from './ComponentRegistry.js';

const COLORS = {
  tanne: '#005538',
  klee: '#008939',
  grashalm: '#8ABD24',
  sand: '#F5F1E9',
  white: '#FFFFFF'
};

/**
 * Build a minimal, precise system prompt
 */
export function buildSystemPrompt(): string {
  return `Du bist Sharepic-Designer für Die Grünen. Generiere Text + JSON-Layout.

TEMPLATES:

1. "quote-pure" - Zitate und Statements mit Farbhintergrund (KEIN Bild)
   Zones: background, quote-content, branding

2. "three-line" - Dreizeiler mit Balken (NUR mit Hintergrundbild)
   Zones: background, balken-group, branding

FARBEN (NUR hex-Werte):
tanne=#005538, klee=#008939, grashalm=#8ABD24, sand=#F5F1E9, white=#FFFFFF

BEISPIEL "quote-pure" (für Farbhintergrund):
{
  "generatedText": {"quote": "Zitat hier", "attribution": "Name"},
  "layout": {
    "templateId": "quote-pure",
    "zones": [
      {"zoneName": "background", "component": "background-solid", "params": {"color": "#6ccd87"}},
      {"zoneName": "quote-content", "component": "text-quote-pure", "params": {"text": "Zitat hier", "attribution": "Name", "textColor": "#005538"}},
      {"zoneName": "branding", "component": "decoration-sunflower", "params": {}}
    ]
  }
}

BEISPIEL "three-line" (NUR mit Bild):
{
  "generatedText": {"lines": ["Zeile eins", "Zeile zwei", "Zeile drei"]},
  "layout": {
    "templateId": "three-line",
    "zones": [
      {"zoneName": "background", "component": "background-image", "params": {"imagePath": "@auto-select", "fit": "cover"}},
      {"zoneName": "balken-group", "component": "text-balken-group", "params": {"lines": ["Zeile eins", "Zeile zwei", "Zeile drei"], "fontSize": 70}},
      {"zoneName": "branding", "component": "decoration-sunflower", "params": {}}
    ]
  }
}

REGELN:
- "three-line" mit Balken: NUR mit background-image verwenden, NIEMALS mit background-solid
- Bei Farbhintergrund (kein Bild): IMMER "quote-pure" Template verwenden
- "quote-pure" Hintergrund: IMMER #6ccd87 verwenden
- Kopiere die Struktur exakt, ändere nur Texte/Farben
- Alle Farben als hex (#005538)
- Kurze, kraftvolle Texte (3 Zeilen à max 25 Zeichen)
- NUR JSON ausgeben`;
}

/**
 * Build the user message
 */
export function buildUserMessage(description: string, options: Record<string, any> = {}): string {
  let message = `Sharepic: ${description}`;

  if (options.useBackgroundImage === true) {
    message += '\n\nNutze background-image mit "@auto-select".';
  } else if (options.useBackgroundImage === false) {
    message += '\n\nNutze background-solid (kein Bild).';
  }

  return message;
}

/**
 * Parse AI response and extract JSON
 */
export function parseResponse(content: any): any {
  if (!content) {
    throw new Error('Empty response from AI');
  }

  const text = typeof content === 'string' ? content :
    (content[0]?.text || JSON.stringify(content));

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.layout || !parsed.layout.templateId || !parsed.layout.zones) {
      throw new Error('Invalid layout structure');
    }

    return parsed;
  } catch (error: any) {
    if (error.message.includes('Invalid layout')) {
      throw error;
    }
    throw new Error(`Failed to parse AI response: ${error.message}`);
  }
}

/**
 * Generate layout using AI Worker Pool
 */
async function generateLayout(
  description: string,
  aiWorkerPool: any,
  req: Request,
  options: Record<string, any> = {}
): Promise<any> {
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(description, options);

  const result = await aiWorkerPool.processRequest({
    type: 'text2sharepic',
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    options: {
      temperature: 0.7,
      max_tokens: 1500
    }
  }, req);

  if (!result.success) {
    throw new Error(result.error || 'AI generation failed');
  }

  return parseResponse(result.content);
}

/**
 * Generate layout with retry logic
 */
export async function generateLayoutWithRetry(
  description: string,
  aiWorkerPool: any,
  req: Request,
  options: Record<string, any> = {},
  maxRetries: number = 2
): Promise<any> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateLayout(description, aiWorkerPool, req, options);
    } catch (error: any) {
      lastError = error;
      console.warn(`[AILayoutGenerator] Attempt ${attempt + 1} failed:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Build edit prompt with current layout as context
 */
export function buildEditPrompt(currentLayout: LayoutPlan, editRequest: string): string {
  const currentJson = JSON.stringify(currentLayout, null, 2);

  return `Aktuelles Sharepic-Layout:
${currentJson}

Bearbeitungsanfrage: ${editRequest}

Erstelle ein NEUES, vollständiges Layout basierend auf der Bearbeitungsanfrage.
Du kannst Text, Farben, Template und alles andere ändern.
Gib NUR das neue JSON aus, keine Erklärungen.`;
}

/**
 * Edit existing layout using AI
 */
export async function editLayout(
  currentLayout: LayoutPlan,
  editRequest: string,
  aiWorkerPool: any,
  req: Request
): Promise<any> {
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildEditPrompt(currentLayout, editRequest);

  const result = await aiWorkerPool.processRequest({
    type: 'text2sharepic',
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    options: {
      temperature: 0.7,
      max_tokens: 1500
    }
  }, req);

  if (!result.success) {
    throw new Error(result.error || 'AI edit failed');
  }

  return parseResponse(result.content);
}
