/**
 * Canvas-suggest prompt construction.
 *
 * Extracted from `aiSuggestRoute.ts` when a second, streaming caller shared
 * this prompt; that route has since been removed. `contextHints` seeds the
 * model with citations + prose from an upstream research pipeline so canvas
 * operations can be research-grounded.
 */
import { CONTENT_INTEGRITY_EDIT_RULES } from '../../../services/contentPolicy.js';
import { SHAREPIC_MARKUP_RULES } from '../../sharepic/sharepic_text/unifiedHandler.js';

import type { Citation } from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  CanvasAiOperationKind,
  CanvasAiSnapshot,
  SharepicTemplateDescriptor,
} from '@gruenerator/contracts';

export const TOOL_NAME = 'submit_canvas_operations';

const MAX_HINT_CITATIONS = 5;
const MAX_HINT_PROSE_CHARS = 500;

export interface CanvasSuggestCapabilitiesView {
  supportedOperations: string[];
  colorSchemes?: Array<{ id: string; label: string }> | null | undefined;
  illustrations?: Array<{ id: string; label: string }> | null | undefined;
  assets?: Array<{ id: string; label: string }> | null | undefined;
  /** Descriptor templates: the font-size range per field; a field without one takes no size. */
  fontSizes?: Array<{ field: string; min: number; max: number }> | null | undefined;
  /** Descriptor templates: the fixed palette, the only background colours allowed. */
  backgroundColors?: Array<{ color: string; label: string }> | null | undefined;
  /** Descriptor templates: what `update-element` may set per element, with the real bounds. */
  elementPatches?: CanvasSuggestElementPatch[] | null | undefined;
}

export interface CanvasSuggestElementPatch {
  id: string;
  label: string;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number } | null | undefined;
  scale?: { min: number; max: number } | null | undefined;
  opacity?: { min: number; max: number } | null | undefined;
}

/**
 * The chat's sharepic_edit turn: the batch is applied at once, so it carries a
 * version label (`summary`) and the chat reply, and may be empty when the reply
 * declines or asks back.
 */
export interface CanvasSuggestChatEdit {
  /** Summaries of the most recent prior edits, newest first (pronoun context). */
  recentEditSummaries: readonly string[];
}

/** The capability view of a server-side sharepic template, from its descriptor. */
export function sharepicCapabilitiesView(
  descriptor: SharepicTemplateDescriptor
): CanvasSuggestCapabilitiesView {
  return {
    supportedOperations: descriptor.supportedOperations,
    colorSchemes: descriptor.colorSchemes?.options ?? null,
    fontSizes: descriptor.textFields.flatMap((f) =>
      f.fontSize ? [{ field: f.field, min: f.fontSize.min, max: f.fontSize.max }] : []
    ),
    backgroundColors: descriptor.backgroundColors?.options ?? null,
    elementPatches: descriptor.elements.map((el) => ({
      id: el.id,
      label: el.label,
      bounds: el.positionStateKey ? (el.bounds ?? null) : null,
      scale: el.scale ?? null,
      opacity: el.opacity ?? null,
    })),
  };
}

export interface CanvasSuggestContextHints {
  citations?: Citation[];
  prose?: string;
}

export function buildCanvasSuggestSystemPrompt(
  snapshot: CanvasAiSnapshot,
  capabilities: CanvasSuggestCapabilitiesView,
  contextHints?: CanvasSuggestContextHints,
  selectedElementIds?: readonly string[] | null,
  chatEdit?: CanvasSuggestChatEdit | null
): string {
  const supported = capabilities.supportedOperations.join(', ');
  // de-AT is a first-class audience, and these sujets carry their own brand.
  const isAustrian = snapshot.template.endsWith('-at');

  const lines: string[] = [
    isAustrian
      ? 'Du bist ein KI-Assistent für eine Design-Plattform der österreichischen Grünen.'
      : 'Du bist ein KI-Assistent für eine Design-Plattform der deutschen Grünen.',
    chatEdit
      ? 'Der*die Nutzer*in beschreibt EINE gewünschte Änderung am aktuellen Sharepic. Setze umsetzbare Änderungen als konkrete Operationen um. Fehlen notwendige Angaben, erkläre in "reply", was du brauchst.'
      : 'Du erzeugst genau einen konkreten, umsetzbaren Stapel von Änderungen zur Verbesserung des aktuellen Sharepic-Entwurfs.',
    '',
    'Sprachregeln (zwingend):',
    '- Verwende immer die Du-Form (informell).',
    '- Verwende Genderstern bei Personenbezeichnungen (z.B. "Bürger*innen", "Wähler*innen").',
    '- Halte Texte prägnant und kampagnentauglich.',
    // Same substitutions as the LÄNDERKONTEXT fork in respondNode's system prompt.
    ...(isAustrian
      ? [
          '- Österreichischer Kontext: "Parlament" = Nationalrat, "Landeshauptmann/-frau" statt "Ministerpräsident*in", "Jänner" statt "Januar".',
        ]
      : []),
    '',
    `Aktive Vorlage: ${snapshot.template}`,
    `Verfügbare Operations-Typen: ${supported}`,
    '',
    'Aktueller Inhalt:',
  ];

  for (const f of snapshot.textFields) {
    const preview = f.value.length > 0 ? `"${f.value}"` : '(leer)';
    lines.push(`- ${f.label} [field=${f.field}]: ${preview}`);
  }

  if (snapshot.currentColorScheme) {
    lines.push(`- Aktuelles Farbschema: ${snapshot.currentColorScheme}`);
  }
  if (snapshot.currentBackgroundColor) {
    lines.push(`- Hintergrundfarbe: ${snapshot.currentBackgroundColor}`);
  }
  if (snapshot.canvasSize) {
    lines.push(
      `- Leinwand: ${snapshot.canvasSize.width}×${snapshot.canvasSize.height} px (x nach rechts, y nach unten, Ursprung oben links)`
    );
  }
  if (snapshot.currentColorMode) {
    lines.push(`- Farbmodus: ${snapshot.currentColorMode}`);
  }

  if (capabilities.colorSchemes && capabilities.colorSchemes.length > 0) {
    lines.push('');
    lines.push('Verfügbare Farbschemata (id → Bezeichnung):');
    for (const s of capabilities.colorSchemes) {
      lines.push(`- ${s.id} → ${s.label}`);
    }
  }

  if (capabilities.illustrations && capabilities.illustrations.length > 0) {
    lines.push('');
    lines.push('Verfügbare Illustrationen (id → Bezeichnung):');
    for (const i of capabilities.illustrations.slice(0, 40)) {
      lines.push(`- ${i.id} → ${i.label}`);
    }
  }

  if (capabilities.assets && capabilities.assets.length > 0) {
    lines.push('');
    lines.push('Verfügbare Elemente (id → Bezeichnung):');
    for (const a of capabilities.assets) {
      lines.push(`- ${a.id} → ${a.label}`);
    }
  }

  if (snapshot.elementsSummary.length > 0) {
    lines.push('');
    lines.push('Bereits platzierte Elemente (Ebene 1 liegt ganz hinten):');
    for (const e of snapshot.elementsSummary) {
      lines.push(`- [${e.kind}] ${e.id}: ${e.label}`);
    }
  }

  if (selectedElementIds && selectedElementIds.length > 0) {
    lines.push('');
    lines.push(`Ausgewählte Elemente: ${selectedElementIds.join(', ')}`);
    lines.push(
      'Ist eine Auswahl gesetzt, bezieht sich der Auftrag auf diese Elemente, sofern er nichts anderes sagt.'
    );
  }

  if (chatEdit && chatEdit.recentEditSummaries.length > 0) {
    lines.push('');
    lines.push('Letzte Änderungen (neueste zuerst):');
    for (const summary of chatEdit.recentEditSummaries) lines.push(`- ${summary}`);
  }

  appendResearchContext(lines, contextHints);

  lines.push('');
  lines.push(
    `Antworte ausschließlich über das Tool "${TOOL_NAME}" mit genau einem Stapel von Operationen.`
  );
  lines.push(
    'Der Stapel darf nur die oben aufgeführten Operations-Typen enthalten und nur Felder/IDs verwenden, die explizit gelistet sind.'
  );
  if (chatEdit) appendChatEditFormat(lines);
  else appendSuggestFormat(lines);
  lines.push(
    '- Jede Operation verwendet den Schlüssel "kind" (NICHT "type"). Schlüssel sind je Operations-Typ unterschiedlich, siehe Schemas unten.'
  );
  lines.push('');
  lines.push('OPERATION-SCHEMAS (NUR diese Typen sind in dieser Vorlage erlaubt):');
  const supportedSet = new Set(capabilities.supportedOperations);
  if (supportedSet.has('set-text')) {
    lines.push(
      '  - { "kind": "set-text", "field": "<field>", "label": "<Feld-Label>", "value": "<neuer Text>" }'
    );
    lines.push(
      '    "field" MUSS einer der oben unter "Aktueller Inhalt" gelisteten Feld-Identifier sein (z.B. "quote", "line1", "title"). "value" enthält den NEUEN Text. Niemals "text" als Schlüssel verwenden.',
      '    "value" darf Zeilenumbrüche tragen; Aufzählungspunkte stehen je auf einer Zeile und beginnen mit "• ".',
      ...SHAREPIC_MARKUP_RULES.map((rule) => `    ${rule}`)
    );
  }
  if (supportedSet.has('set-color-scheme')) {
    lines.push('  - { "kind": "set-color-scheme", "schemeId": "<id aus Liste oben>" }');
    lines.push(
      '    "schemeId" MUSS exakt einer der gelisteten ids sein. Erfinde keine neuen Schemes.'
    );
  }
  if (supportedSet.has('set-background-color')) {
    lines.push('  - { "kind": "set-background-color", "color": "#RRGGBB" }');
    lines.push(
      '    Schlüssel ist "color" (NICHT "value"). Hex-Format mit # und 6 Ziffern (z.B. "#005538"). Lowercase oder Uppercase ok.'
    );
  }
  if (supportedSet.has('set-color-mode')) {
    lines.push('  - { "kind": "set-color-mode", "mode": "light" | "dark" }');
    lines.push('    "mode" ist EXAKT einer dieser zwei Strings. Keine anderen Werte.');
  }
  if (supportedSet.has('add-illustration')) {
    lines.push(
      '  - { "kind": "add-illustration", "illustrationId": "<id aus Liste oben>", "color"?: "#RRGGBB" }'
    );
    lines.push(
      '    "color" ist optional und tönt die Illustration. Lasse das Feld weg, wenn die Standardfarbe passt.'
    );
  }
  if (supportedSet.has('add-asset')) {
    lines.push('  - { "kind": "add-asset", "assetId": "<id aus Liste oben>" }');
    lines.push('    "assetId" MUSS exakt einer der gelisteten ids sein.');
  }
  if (supportedSet.has('remove-element')) {
    lines.push(
      '  - { "kind": "remove-element", "elementId": "<id aus den platzierten Elementen>" }'
    );
    lines.push(
      '    "elementId" MUSS aus dem Abschnitt "Bereits platzierte Elemente" stammen. Niemals raten.'
    );
  }
  if (supportedSet.has('toggle-sunflower')) {
    lines.push('  - { "kind": "toggle-sunflower", "visible": true | false }');
  }
  if (supportedSet.has('set-font-size') && capabilities.fontSizes) {
    const bounds = capabilities.fontSizes.map((f) => `${f.field}: ${f.min}–${f.max}px`).join(', ');
    lines.push(
      `  - { "kind": "set-font-size", "field": "<field>", "label": "<Feld-Label>", "size": <Zahl> } (${bounds})`
    );
  } else if (supportedSet.has('set-font-size')) {
    lines.push(
      '  - { "kind": "set-font-size", "field": "<field>", "label": "<Feld-Label>", "size": <integer 1..500> }'
    );
    lines.push(
      '    "size" ist eine ganze Zahl in Pixeln. Realistische Werte: Headlines 60–120, Body 28–48.'
    );
  }
  if (supportedSet.has('update-element') && capabilities.elementPatches) {
    appendElementPatches(lines, capabilities.elementPatches);
  } else if (supportedSet.has('update-element')) {
    lines.push('  - { "kind": "update-element", "elementId": "<id>", "patch": { ... } }');
    lines.push('    "patch" muss MINDESTENS EIN Feld aus dieser Liste enthalten:');
    lines.push('      - "color": "#RRGGBB"');
    lines.push('      - "opacity": Zahl 0..1 (z.B. 0.5)');
    lines.push(
      '      - "scale": positive Zahl, max 10. Bei [text], [shape], [frame] und [balken] ist "scale" ein Faktor auf die aktuelle Größe (1.2 = 20 % größer, 0.8 = 20 % kleiner, 1 = unverändert; bei [text] die Schriftgröße), bei allen anderen Elementen die Größe selbst (1 = Originalgröße).'
    );
    lines.push('      - "rotation": Grad zwischen -360 und 360');
    lines.push('      - "x": Zahl (Pixel-Position der linken Kante)');
    lines.push('      - "y": Zahl (Pixel-Position der oberen Kante)');
    lines.push(
      '    "elementId" MUSS aus "Bereits platzierte Elemente" stammen. Werte außerhalb des erlaubten Bereichs werden zurückgewiesen.'
    );
  }
  if (supportedSet.has('set-background-image')) {
    lines.push(
      '  - { "kind": "set-background-image", "query": "<deutsche Bildsuche, z.B. Windräder Sonnenuntergang>" }'
    );
  }

  if (
    supportedSet.has('set-color-scheme') &&
    capabilities.colorSchemes &&
    capabilities.colorSchemes.length > 0
  ) {
    lines.push('');
    lines.push(
      'WICHTIG zu Farben: Diese Vorlage hat ein festes Farbschema (siehe oben). Wenn du Farben ändern willst, nutze IMMER set-color-scheme mit einer schemeId aus der Liste. Erfinde NIEMALS eigene Hex-Farben (z.B. #2E7D32, #4A90E2). Set-background-color ist nur für Vorlagen ohne Farbschema gedacht.'
    );
  } else if (supportedSet.has('set-background-color') && capabilities.backgroundColors) {
    const colors = capabilities.backgroundColors.map((o) => `"${o.color}" (${o.label})`).join(', ');
    lines.push('');
    lines.push(
      `WICHTIG zu Farben: set-background-color nimmt NUR diese Werte: ${colors}. Jede andere Farbe wird verworfen.`
    );
  } else if (supportedSet.has('set-background-color')) {
    lines.push('');
    lines.push(
      'WICHTIG zu Farben: Beschränke Hex-Farben auf das Grüne CI. Bevorzugte Markenfarben: Tanne #005538, Sand #F5F1E9, Lila #6F2DA8, Pink #FF7F8E, Gelb #FFD320. Erfinde keine willkürlichen Farben (z.B. #2E7D32, #4A90E2) — die wirken off-brand.'
    );
    lines.push(
      'KONTRAST-PFLICHT: Stelle sicher, dass die Hintergrundfarbe genug Kontrast zu Texten und Elementen auf der Vorlage bietet. Wenn die aktuelle Hintergrundfarbe bereits dunkel ist (z.B. Tanne #005538), schlage KEINE weitere dunkle Farbe vor. Wenn der Text auf der Vorlage z.B. weiß ist, wähle dunkle Hintergründe. Vermeide Grün-auf-Grün, Hell-auf-Hell, Dunkel-auf-Dunkel.'
    );
  }

  if (chatEdit) {
    lines.push(...buildUnsupportedNote(capabilities.supportedOperations));
    lines.push('');
    lines.push('Ändere NUR, was verlangt wurde. Nutze nur die gelisteten Felder, IDs und Werte.');
    // Stated as a constraint on the operations: this call is tool-forced and
    // can only decline through `reply`.
    lines.push('');
    lines.push(CONTENT_INTEGRITY_EDIT_RULES);
  }

  return lines.join('\n');
}

function appendSuggestFormat(lines: string[]): void {
  lines.push('');
  lines.push('PFLICHT-FORMAT des Stapels (genaues Schema, andere Schlüssel sind ungültig):');
  lines.push('```json');
  lines.push('{');
  lines.push('  "title": "Kurze deutsche Bezeichnung der Änderung",');
  lines.push('  "operations": [ /* eine oder mehrere Operationen, siehe Schemas unten */ ]');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('Strikte Top-Level-Regeln:');
  lines.push(
    '- Top-Level: genau ein Objekt { "title": ..., "operations": [ ... ] } — keine Liste von Alternativen.'
  );
  lines.push('- Das Objekt MUSS "title" und "operations" enthalten.');
  lines.push('- Alle Operationen liegen IMMER im Array "operations".');
}

function appendChatEditFormat(lines: string[]): void {
  lines.push('');
  lines.push('PFLICHT-FORMAT (genaues Schema, andere Schlüssel sind ungültig):');
  lines.push('```json');
  lines.push('{');
  lines.push('  "summary": "Kurzlabel der Änderung",');
  lines.push('  "operations": [ /* Operationen, siehe Schemas unten */ ],');
  lines.push('  "reply": "Antwort für den Chat"');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('Strikte Top-Level-Regeln:');
  lines.push('- Das Objekt MUSS "summary", "operations" und "reply" enthalten.');
  lines.push('- "operations": 1–8 Operationen, die die Anweisung vollständig umsetzen.');
  lines.push(
    '- Wenn keine Änderung möglich oder zulässig ist, gib "operations": [] zurück und erkläre in "reply" den Grund oder frage nach den fehlenden Angaben. Erfinde keine Ersatzänderung.',
    '- Bei Textbearbeitungen ist der aktuelle Feldinhalt dein Ausgangstext. Formuliere den vollständigen neuen Text selbst und setze ihn mit "set-text"; beachte dabei die Unterscheidung zwischen Kampagnenentwurf und belegtem Originalzitat in den Inhaltsregeln.',
    '- "summary": Kurzlabel der Änderung auf Deutsch, max. 120 Zeichen (z.B. "Zeile 2 gekürzt").',
    '- "reply": 1–2 freundliche Sätze Bestätigung für den Chat. Beschreibe die Änderung so, wie sie verlangt wurde ("die Schrift größer gemacht", "den Text gekürzt"). Nenne KEINE konkreten Zahlenwerte (Pixel, Prozent, Koordinaten, Hex-Farben), die nicht ausdrücklich verlangt wurden — auch wenn deine Operationen intern einen Wert setzen. Erfinde niemals eine präzise Angabe wie "auf 80px", um die Bestätigung konkreter klingen zu lassen.'
  );
}

/** `update-element` with the real per-element ranges of a descriptor template. */
function appendElementPatches(lines: string[], elements: CanvasSuggestElementPatch[]): void {
  lines.push(
    '  - { "kind": "update-element", "elementId": "<id>", "patch": { "x"?: Zahl, "y"?: Zahl, "scale"?: Zahl, "opacity"?: 0..1 } }'
  );
  for (const el of elements) {
    const caps: string[] = [];
    let directionHint = '';
    if (el.bounds) {
      caps.push(`x ${el.bounds.minX}..${el.bounds.maxX}, y ${el.bounds.minY}..${el.bounds.maxY}`);
      // Offset elements (bounds spanning negative y) move relative to their
      // anchor; absolute ones use canvas coordinates where smaller y is higher.
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

/**
 * What this template canNOT do — named, not merely absent.
 *
 * A list of supported ops reads as an offer, not as a boundary: on 11.08.2026
 * `dreizeilen-overlay-at` got a `set-background-color` it does not support,
 * the validator dropped it, and the chat still reported the new background.
 * The boundary must arrive as a fact about the template, with the studio as
 * the alternative.
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

function buildUnsupportedNote(supportedOperations: readonly string[]): string[] {
  // The supported list is stringly-typed on the wire; the LABEL map is the
  // typed side and makes a new operation kind a compile error here.
  const supported = new Set<string>(supportedOperations);
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
    'Lässt sich ein TEIL der Anweisung so nicht umsetzen: setze den Rest um und schreibe in "reply" klar, ' +
      'welcher Teil nicht ging und warum — und dass sich das im Studio direkt einstellen lässt. ' +
      'Bestätige NIE etwas, wofür du keine Operation aus der Liste gesetzt hast.'
  );
  return lines;
}

export function buildCanvasSuggestUserMessage(prompt: string): string {
  return `Verwende JETZT das Tool ${TOOL_NAME} mit genau einem Stapel von Operationen für folgende Anweisung:\n\n${prompt}\n\nAntworte ausschließlich über den Tool-Aufruf — keinen Begleittext.`;
}

function appendResearchContext(
  lines: string[],
  hints: CanvasSuggestContextHints | undefined
): void {
  if (!hints) return;
  const citations = (hints.citations ?? []).slice(0, MAX_HINT_CITATIONS);
  const prose = hints.prose?.trim();
  if (citations.length === 0 && !prose) return;

  lines.push('');
  lines.push('## RECHERCHE-KONTEXT (vom vorgeschalteten Chat-System ermittelt)');
  lines.push(
    'Nutze die folgenden Recherche-Ergebnisse, wenn die Änderung Texte mit Fakten, Zahlen oder Zitaten verlangt. Bevorzuge konkrete Aussagen aus diesen Quellen gegenüber Allgemeinplätzen. Erfinde keine Zahlen, die hier nicht belegt sind.'
  );

  if (prose) {
    const truncated =
      prose.length > MAX_HINT_PROSE_CHARS ? `${prose.slice(0, MAX_HINT_PROSE_CHARS)}…` : prose;
    lines.push('');
    lines.push('Bisherige Chat-Antwort (Auszug):');
    lines.push(truncated);
  }

  if (citations.length > 0) {
    lines.push('');
    lines.push('Quellen:');
    for (const c of citations) {
      const snippet = (c.citedText ?? c.snippet ?? '').replace(/\s+/g, ' ').slice(0, 240);
      const title = c.title || c.source || 'Quelle';
      lines.push(`[${c.id}] ${title} — ${snippet}`);
    }
  }
}
