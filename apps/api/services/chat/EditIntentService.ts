/**
 * Edit Intent Service
 * Handles text editing requests from chat using pure AI-based extraction and processing
 */

import { createLogger } from '../../utils/logger.js';
import type { EditContext, EditOperationType, AIWorkerPool } from '../../agents/chat/types.js';

const log = createLogger('EditIntentService');

/**
 * Response format for edit operations
 */
export interface EditResponse {
  success: boolean;
  agent: string;
  content: {
    text: string;
    type: string;
    summary?: string;
  };
  metadata?: {
    editType: EditOperationType;
    originalLength: number;
    editedLength: number;
    instruction?: string;
  };
}

/**
 * Extract edit parts using AI when editContext is not provided
 * This is a fallback for cases where the intent classifier couldn't extract the context
 */
async function extractEditPartsWithAI(
  message: string,
  aiWorkerPool: AIWorkerPool
): Promise<EditContext | null> {
  const extractionPrompt = `Analysiere diese Nachricht und trenne sie in Bearbeitungsanweisung und zu bearbeitenden Text:

"${message}"

AUFGABE:
1. Identifiziere die ANWEISUNG (was soll gemacht werden: kürzen, verbessern, umschreiben, etc.)
2. Identifiziere den QUELLTEXT (der zu bearbeitende Text - meist der längere Teil)
3. Bestimme den BEARBEITUNGSTYP

BEARBEITUNGSTYPEN:
- shorten: Text kürzen/zusammenfassen/straffen
- expand: Text erweitern/verlängern/ausführlicher machen
- rewrite: Text komplett umschreiben/neu formulieren
- improve: Text verbessern/optimieren/korrigieren
- simplify: Text vereinfachen/einfacher machen
- formalize: Text formeller/professioneller machen
- translate: Text übersetzen
- generic: Andere Bearbeitung

Antworte NUR mit JSON:
{
  "instruction": "Die Bearbeitungsanweisung",
  "sourceText": "Der zu bearbeitende Text",
  "editType": "shorten|expand|rewrite|improve|simplify|formalize|translate|generic",
  "confidence": 0.9
}`;

  try {
    const result = await aiWorkerPool.processRequest({
      type: 'edit_extraction',
      systemPrompt:
        'Du bist ein präziser Text-Analysator. Trenne Anweisungen von Quelltexten. Antworte NUR mit JSON.',
      messages: [{ role: 'user', content: extractionPrompt }],
      options: {
        max_tokens: 4000,
        temperature: 0.2,
      },
    });

    if (!result.success) {
      log.warn('[EditIntentService] AI extraction failed:', result.error);
      return null;
    }

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('[EditIntentService] No JSON found in AI response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.sourceText || parsed.sourceText.length < 20) {
      log.warn('[EditIntentService] Extracted source text too short');
      return null;
    }

    if (!parsed.instruction || parsed.instruction.length < 3) {
      log.warn('[EditIntentService] Extracted instruction too short');
      return null;
    }

    return {
      sourceText: parsed.sourceText,
      instruction: parsed.instruction,
      editType: parsed.editType || 'generic',
      confidence: parsed.confidence || 0.8,
    };
  } catch (error) {
    log.error('[EditIntentService] AI extraction error:', error);
    return null;
  }
}

/**
 * Build a descriptive instruction based on edit type
 */
function buildEditInstruction(editType: EditOperationType, userInstruction: string): string {
  const typeInstructions: Record<EditOperationType, string> = {
    shorten:
      'Kürze den Text erheblich. Behalte die Kernaussagen und den Stil bei, aber entferne Füllwörter, Wiederholungen und weniger wichtige Details. Der gekürzte Text sollte prägnant und auf den Punkt sein.',
    expand:
      'Erweitere den Text mit mehr Details, Beispielen und Ausführungen. Behalte den Stil und Ton bei. Füge relevante Informationen hinzu, die den Text bereichern.',
    rewrite:
      'Schreibe den Text komplett um mit anderen Formulierungen und Satzstrukturen. Behalte die Kernaussagen bei, aber verwende einen frischen Ansatz.',
    improve:
      'Verbessere den Text: Optimiere Stil, Grammatik, Lesbarkeit und Wirkung. Korrigiere Fehler und mache den Text professioneller.',
    simplify:
      'Vereinfache den Text: Verwende einfachere Wörter, kürzere Sätze und klarere Strukturen. Der Text soll leichter verständlich werden.',
    formalize:
      'Mache den Text formeller und professioneller. Entferne umgangssprachliche Ausdrücke und verwende einen sachlichen, seriösen Ton.',
    translate: 'Übersetze den Text wie angewiesen. Behalte den Stil und die Bedeutung bei.',
    generic: 'Bearbeite den Text gemäß der Anweisung.',
  };

  const baseInstruction = typeInstructions[editType] || typeInstructions.generic;
  return `${baseInstruction}\n\nSpezifische Anweisung des Nutzers: ${userInstruction}`;
}

/**
 * Apply edit to text using AI
 */
async function applyTextEdit(
  sourceText: string,
  instruction: string,
  editType: EditOperationType,
  aiWorkerPool: AIWorkerPool,
  req?: any
): Promise<{ success: boolean; editedText?: string; error?: string }> {
  const fullInstruction = buildEditInstruction(editType, instruction);

  const systemPrompt = `Du bist ein erfahrener Textredakteur. Bearbeite den Text gemäß der Anweisung.

WICHTIG:
- Gib NUR den bearbeiteten Text zurück
- Keine Erklärungen, Kommentare oder Einleitungen
- Behalte den grundlegenden Stil, Ton und Formatierung bei (Hashtags, Emojis, Aufzählungen)
- Bei Social-Media-Posts: Behalte relevante Hashtags und Emojis bei`;

  const userContent = `ANWEISUNG:
${fullInstruction}

ORIGINALTEXT:
${sourceText}

Gib den bearbeiteten Text zurück:`;

  try {
    const result = await aiWorkerPool.processRequest(
      {
        type: 'text_edit',
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        options: {
          max_tokens: Math.max(4096, sourceText.length * 2),
          temperature: 0.4,
        },
      },
      req
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    let editedText = result.content.trim();
    editedText = editedText.replace(/^["„"]|[""]$/g, '');
    editedText = editedText.replace(/^```[\s\S]*?\n|```$/g, '');

    return { success: true, editedText };
  } catch (error) {
    log.error('[EditIntentService] Edit application error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate summary message based on edit type and lengths
 */
function generateSummary(
  editType: EditOperationType,
  originalLength: number,
  editedLength: number
): string {
  const diff = originalLength - editedLength;
  const percentage = Math.round((Math.abs(diff) / originalLength) * 100);

  const summaryMap: Record<EditOperationType, string> = {
    shorten:
      diff > 0
        ? `Text um ${percentage}% gekürzt (${originalLength} → ${editedLength} Zeichen)`
        : `Text bearbeitet (${editedLength} Zeichen)`,
    expand:
      editedLength > originalLength
        ? `Text um ${percentage}% erweitert (${originalLength} → ${editedLength} Zeichen)`
        : `Text bearbeitet (${editedLength} Zeichen)`,
    rewrite: `Text umformuliert (${editedLength} Zeichen)`,
    improve: `Text verbessert (${editedLength} Zeichen)`,
    simplify: `Text vereinfacht (${editedLength} Zeichen)`,
    formalize: `Text formalisiert (${editedLength} Zeichen)`,
    translate: `Text übersetzt (${editedLength} Zeichen)`,
    generic: `Text bearbeitet (${editedLength} Zeichen)`,
  };

  return summaryMap[editType] || summaryMap.generic;
}

/**
 * Main processing function for edit intent
 */
export async function processEditIntent(
  message: string,
  userId: string,
  aiWorkerPool: AIWorkerPool,
  req?: any,
  editContext?: EditContext
): Promise<EditResponse> {
  log.debug('[EditIntentService] Processing edit intent for user:', userId);

  let context: EditContext | undefined = editContext;

  if (!context || !context.sourceText || !context.instruction) {
    log.debug('[EditIntentService] No editContext provided, extracting with AI');
    context = (await extractEditPartsWithAI(message, aiWorkerPool)) ?? undefined;
  }

  if (!context) {
    log.warn('[EditIntentService] Could not extract edit context');
    return {
      success: false,
      agent: 'text_edit',
      content: {
        text: 'Ich konnte den zu bearbeitenden Text nicht vom Bearbeitungswunsch trennen. Bitte formuliere deine Anfrage um, z.B.:\n\n"Kürze diesen Text: [dein Text hier]"\n\noder\n\n"Verbessere folgenden Beitrag: [dein Text hier]"',
        type: 'error',
      },
    };
  }

  const editResult = await applyTextEdit(
    context.sourceText,
    context.instruction,
    context.editType,
    aiWorkerPool,
    req
  );

  if (!editResult.success || !editResult.editedText) {
    return {
      success: false,
      agent: 'text_edit',
      content: {
        text: `Bei der Textbearbeitung ist ein Fehler aufgetreten: ${editResult.error || 'Unbekannter Fehler'}`,
        type: 'error',
      },
    };
  }

  const summary = generateSummary(
    context.editType,
    context.sourceText.length,
    editResult.editedText.length
  );

  return {
    success: true,
    agent: 'text_edit',
    content: {
      text: editResult.editedText,
      type: 'text',
      summary,
    },
    metadata: {
      editType: context.editType,
      originalLength: context.sourceText.length,
      editedLength: editResult.editedText.length,
      instruction: context.instruction,
    },
  };
}
