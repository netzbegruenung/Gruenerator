/**
 * LLM call for the chat's sharepic_edit intent: one tool-forced request that
 * turns a natural-language instruction ("Zeile 2 kürzer, Balken nach oben")
 * into a validated batch of CanvasAiOperations plus a version summary and a
 * chat reply. Modeled on runCanvasSuggest (retry, Zod validation, capability
 * filtering) but returns a single applied edit instead of suggestions.
 */
import {
  sharepicEditResponseSchema,
  type CanvasAiOperationKind,
  type CanvasAiSnapshot,
  type SharepicEditResponse,
  type SharepicTemplateDescriptor,
} from '@gruenerator/contracts';

import { CONTENT_INTEGRITY_EDIT_RULES } from '../../../services/contentPolicy.js';

import { runToolForcedEdit } from './toolForcedEdit.js';

export const SHAREPIC_EDIT_TOOL_NAME = 'apply_sharepic_edit';

export interface RunSharepicEditArgs {
  instruction: string;
  descriptor: SharepicTemplateDescriptor;
  snapshot: CanvasAiSnapshot;
  /** Summaries of the most recent prior edits, newest first (pronoun context). */
  recentEditSummaries: string[];
}

export type RunSharepicEditResult =
  { ok: true; edit: SharepicEditResponse } | { ok: false; error: string };

/** Compact German description of the current sharepic content for prompts. */
export function buildSnapshotLines(snapshot: CanvasAiSnapshot): string[] {
  const lines: string[] = [];
  for (const f of snapshot.textFields) {
    lines.push(`- ${f.label} [field=${f.field}]: ${f.value ? `"${f.value}"` : '(leer)'}`);
  }
  if (snapshot.currentColorScheme) {
    lines.push(`- Farbschema: ${snapshot.currentColorScheme}`);
  }
  if (snapshot.currentBackgroundColor) {
    lines.push(`- Hintergrundfarbe: ${snapshot.currentBackgroundColor}`);
  }
  for (const el of snapshot.elementsSummary) {
    lines.push(`- Element [id=${el.id}]: ${el.label}`);
  }
  return lines;
}

/**
 * Per-template catalog of allowed operations with exact schemas and bounds.
 * Shared between the single-call edit prompt and the agentic tool loop so the
 * two paths can't drift apart.
 */
export function buildOperationCatalog(descriptor: SharepicTemplateDescriptor): string[] {
  const lines: string[] = [];
  const supported = new Set(descriptor.supportedOperations);
  lines.push('ERLAUBTE OPERATIONEN (genaue Schemas, Schlüssel ist "kind"):');
  if (supported.has('set-text')) {
    lines.push(
      '  - { "kind": "set-text", "field": "<field>", "label": "<Label>", "value": "<neuer Text>" }'
    );
  }
  if (supported.has('set-font-size')) {
    const bounds = descriptor.textFields
      .filter((f) => f.fontSize)
      .map((f) => `${f.field}: ${f.fontSize!.min}–${f.fontSize!.max}px`)
      .join(', ');
    lines.push(
      `  - { "kind": "set-font-size", "field": "<field>", "label": "<Label>", "size": <Zahl> } (${bounds})`
    );
  }
  if (supported.has('set-color-scheme') && descriptor.colorSchemes) {
    const ids = descriptor.colorSchemes.options.map((o) => `"${o.id}" (${o.label})`).join(', ');
    lines.push(`  - { "kind": "set-color-scheme", "schemeId": <id> } — nur: ${ids}`);
  }
  if (supported.has('set-background-color') && descriptor.backgroundColors) {
    const colors = descriptor.backgroundColors.options
      .map((o) => `"${o.color}" (${o.label})`)
      .join(', ');
    lines.push(`  - { "kind": "set-background-color", "color": <hex> } — nur: ${colors}`);
  }
  if (supported.has('toggle-sunflower')) {
    lines.push('  - { "kind": "toggle-sunflower", "visible": true | false }');
  }
  if (supported.has('update-element') && descriptor.elements.length > 0) {
    lines.push(
      '  - { "kind": "update-element", "elementId": "<id>", "patch": { "x"?: Zahl, "y"?: Zahl, "scale"?: Zahl, "opacity"?: 0..1 } }'
    );
    for (const el of descriptor.elements) {
      const caps: string[] = [];
      let directionHint = '';
      if (el.positionStateKey && el.bounds) {
        caps.push(`x ${el.bounds.minX}..${el.bounds.maxX}, y ${el.bounds.minY}..${el.bounds.maxY}`);
        // Offset elements (bounds spanning negative y) move relative to their
        // anchor; absolute elements use canvas coordinates where smaller y is
        // higher up. The wrong hint sends the model in the wrong direction.
        directionHint =
          el.bounds.minY < 0
            ? ' Negative y = nach oben.'
            : ' Absolute Position: kleinere y-Werte = weiter oben.';
      } else {
        caps.push('nicht verschiebbar');
      }
      if (el.scale) caps.push(`scale ${el.scale.min}–${el.scale.max}`);
      if (el.opacity) caps.push(`opacity ${el.opacity.min}–${el.opacity.max} (0 = unsichtbar)`);
      lines.push(`    elementId "${el.id}" (${el.label}): ${caps.join(', ')}.${directionHint}`);
    }
  }
  if (supported.has('set-background-image')) {
    lines.push(
      '  - { "kind": "set-background-image", "query": "<deutsche Bildsuche, z.B. Windräder Sonnenuntergang>" }'
    );
  }
  lines.push(...buildUnsupportedNote(descriptor));
  return lines;
}

/**
 * What this template canNOT do — named, not merely absent.
 *
 * The catalog above lists supported ops only, which reads as an offer and not
 * as a boundary: on 11.08.2026 `dreizeilen-overlay-at` got a
 * `set-background-color` it does not support, the validator dropped it, and the
 * chat still reported the new background. The model has no refusal channel here
 * (the call is tool-forced), so the boundary has to arrive as a fact about the
 * template plus the one escape that does exist — the studio.
 */
const OPERATION_LABEL: Readonly<Record<CanvasAiOperationKind, string>> = {
  'set-text': 'Texte ändern',
  'set-font-size': 'Schriftgrößen ändern',
  'set-color-scheme': 'das Farbschema wechseln',
  'set-background-color': 'die Hintergrundfarbe ändern',
  'set-color-mode': 'den Farbmodus wechseln',
  'add-illustration': 'Illustrationen hinzufügen',
  'add-asset': 'Bild-Elemente hinzufügen',
  'remove-element': 'Elemente entfernen',
  'toggle-sunflower': 'die Sonnenblume ein-/ausblenden',
  'update-element': 'Elemente verschieben, skalieren oder transparenter machen',
  'set-background-image': 'das Hintergrundbild austauschen',
};

export function buildUnsupportedNote(descriptor: SharepicTemplateDescriptor): string[] {
  // `supportedOperations` is a string[] on the wire descriptor, so the
  // membership test stays stringly-typed; the LABEL map is the typed side and
  // makes a new operation kind a compile error here.
  const supported = new Set<string>(descriptor.supportedOperations);
  const missing = (Object.keys(OPERATION_LABEL) as CanvasAiOperationKind[])
    .filter((kind) => !supported.has(kind))
    .map((kind) => OPERATION_LABEL[kind]);

  const lines = [
    '',
    'GRENZEN DIESER VORLAGE — Layout, Anordnung, Schriftarten und alles nicht Gelistete sind fest.',
  ];
  if (missing.length > 0) {
    lines.push(`Diese Vorlage kann im Chat NICHT: ${missing.join('; ')}.`);
  }
  lines.push(
    'Erfinde niemals eine Operation, die oben nicht steht, und benenne keinen Wert außerhalb der genannten Optionen — ' +
      'beides wird verworfen, und die Bestätigung wäre dann falsch.',
    // No "return zero operations" escape on purpose: the wire schema requires
    // 1–8 (canvasAi.ts), and the all-rejected path already answers with the
    // template's own reason plus the studio hint. The gap this closes is the
    // PARTIAL one, where the reply spoke for ops that never applied.
    'Lässt sich ein TEIL der Anweisung so nicht umsetzen: setze den Rest um und schreibe in "reply" klar, ' +
      'welcher Teil nicht ging und warum — und dass sich das im Studio direkt einstellen lässt. ' +
      'Bestätige NIE etwas, wofür du keine Operation aus der Liste gesetzt hast.'
  );
  return lines;
}

/**
 * Operation catalog for slider decks: the per-slide vocabulary above gets
 * wrapped in deck operations that target slides by 1-based number.
 */
export function buildSliderDeckOperationCatalog(descriptor: SharepicTemplateDescriptor): string[] {
  const fontBounds = descriptor.textFields
    .filter((f) => f.fontSize)
    .map((f) => `${f.field}: ${f.fontSize!.min}–${f.fontSize!.max}px`)
    .join(', ');
  const schemeIds =
    descriptor.colorSchemes?.options.map((o) => `"${o.id}" (${o.label})`).join(', ') ?? '';
  return [
    'ERLAUBTE OPERATIONEN (genaue Schemas, Schlüssel ist "kind"):',
    '  - { "kind": "edit-slide", "slide": <Nr>, "operations": [ ... ] } — ändert EINE Folie. Erlaubte innere Operationen:',
    '      { "kind": "set-text", "field": "label" | "headline" | "subtext" | "subtext2", "label": "<Label>", "value": "<neuer Text>" }',
    `      { "kind": "set-font-size", "field": "<field>", "label": "<Label>", "size": <Zahl> } (${fontBounds})`,
    `      { "kind": "set-color-scheme", "schemeId": <id> } — nur: ${schemeIds}. Gilt IMMER für das GANZE Karussell.`,
    '      Hinweis: "label" gibt es nur auf dem Cover (Slide 1), "subtext2" nur auf Inhalts-Folien.',
    '  - { "kind": "add-slide", "afterSlide"?: <Nr>, "headline": "<Text>", "subtext"?: "<Text>", "subtext2"?: "<Text>" } — neue Inhalts-Folie (ohne afterSlide: vor der Abschluss-Folie).',
    '  - { "kind": "remove-slide", "slide": <Nr> } — Cover (1) und Abschluss-Folie sind geschützt.',
  ];
}

export function buildSystemPrompt(
  descriptor: SharepicTemplateDescriptor,
  snapshot: CanvasAiSnapshot,
  recentEditSummaries: string[]
): string {
  // de-AT is a first-class audience, and these sujets carry their own brand.
  // Telling the model it works for "die deutschen Grünen" while it edits an
  // Austrian template invites German framing and DE-specific vocabulary.
  const isAustrian = descriptor.id.endsWith('-at');

  const lines: string[] = [
    isAustrian
      ? 'Du bist der Bearbeitungs-Assistent für Sharepics der österreichischen Grünen.'
      : 'Du bist der Bearbeitungs-Assistent für Sharepics der deutschen Grünen.',
    'Der*die Nutzer*in beschreibt EINE gewünschte Änderung am aktuellen Sharepic.',
    'Du setzt sie als konkrete Operationen um — keine Vorschläge, keine Rückfragen.',
    '',
    'Sprachregeln: Du-Form, Genderstern (z.B. "Bürger*innen"), prägnante Kampagnen-Texte.',
    // Same substitutions as the LÄNDERKONTEXT fork in respondNode's system
    // prompt — an edit turn rewrites campaign copy and can introduce exactly
    // the German terms that block screens out.
    ...(isAustrian
      ? [
          'Österreichischer Kontext: "Parlament" = Nationalrat, "Landeshauptmann/-frau" statt "Ministerpräsident*in", "Jänner" statt "Januar".',
        ]
      : []),
    '',
    `Vorlage: ${descriptor.label} (${descriptor.id})`,
    '',
    'Aktueller Inhalt:',
    ...buildSnapshotLines(snapshot),
  ];

  if (recentEditSummaries.length > 0) {
    lines.push('');
    lines.push('Letzte Änderungen (neueste zuerst):');
    for (const s of recentEditSummaries) lines.push(`- ${s}`);
  }

  lines.push('');
  lines.push(...buildOperationCatalog(descriptor));

  lines.push('');
  lines.push(`Antworte AUSSCHLIESSLICH über das Tool "${SHAREPIC_EDIT_TOOL_NAME}" mit:`);
  lines.push('- "operations": 1–8 Operationen, die die Anweisung vollständig umsetzen.');
  lines.push(
    '- "summary": Kurzlabel der Änderung auf Deutsch, max. 120 Zeichen (z.B. "Zeile 2 gekürzt").'
  );
  lines.push(
    '- "reply": 1–2 freundliche Sätze Bestätigung für den Chat. Beschreibe die Änderung so, wie sie verlangt wurde ("die Schrift größer gemacht", "den Text gekürzt"). Nenne KEINE konkreten Zahlenwerte (Pixel, Prozent, Koordinaten, Hex-Farben), die nicht ausdrücklich verlangt wurden — auch wenn deine Operationen intern einen Wert setzen. Erfinde niemals eine präzise Angabe wie "auf 80px", um die Bestätigung konkreter klingen zu lassen.'
  );
  lines.push('');
  lines.push('Ändere NUR, was verlangt wurde. Nutze nur die gelisteten Felder, IDs und Werte.');
  // The editor had no content rule at all. SHAREPIC_SAFETY_RULES guards the
  // model that WRITES a sharepic's text, so a request for a fabricated quote is
  // declined at creation — but the very same card could then be EDITED into
  // exactly that attribution, because this prompt never mentioned it. Stated as
  // a constraint on the operations, not as a prose decline: this call is
  // tool-forced and has no channel to refuse in except `reply`.
  lines.push('');
  lines.push(CONTENT_INTEGRITY_EDIT_RULES);

  return lines.join('\n');
}

export async function runSharepicEdit(args: RunSharepicEditArgs): Promise<RunSharepicEditResult> {
  const { instruction, descriptor, snapshot, recentEditSummaries } = args;

  return runToolForcedEdit({
    toolName: SHAREPIC_EDIT_TOOL_NAME,
    description: 'Wendet eine Änderung auf das aktuelle Sharepic an.',
    schema: sharepicEditResponseSchema,
    systemPrompt: buildSystemPrompt(descriptor, snapshot, recentEditSummaries),
    instruction,
    logPrefix: '[sharepic_edit]',
  });
}
