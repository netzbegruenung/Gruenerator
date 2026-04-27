/**
 * Canvas-suggest prompt construction.
 *
 * Extracted from `aiSuggestRoute.ts` so the same prompt is used by both
 * the synchronous canvas-AI-suggest route and the streaming chat-edit
 * route (`canvasChatEditController.ts`). Adding `contextHints` lets the
 * streaming flavor seed the model with citations + prose collected by
 * the upstream ChatGraph pipeline so canvas operations are research-grounded.
 */
import type { Citation } from '../../../agents/langgraph/ChatGraph/types.js';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

export const TOOL_NAME = 'submit_canvas_suggestions';

const MAX_HINT_CITATIONS = 5;
const MAX_HINT_PROSE_CHARS = 500;

export interface CanvasSuggestCapabilitiesView {
  supportedOperations: string[];
  colorSchemes?: Array<{ id: string; label: string }> | null | undefined;
  illustrations?: Array<{ id: string; label: string }> | null | undefined;
  assets?: Array<{ id: string; label: string }> | null | undefined;
}

export interface CanvasSuggestContextHints {
  citations?: Citation[];
  prose?: string;
}

export function buildCanvasSuggestSystemPrompt(
  snapshot: CanvasAiSnapshot,
  capabilities: CanvasSuggestCapabilitiesView,
  contextHints?: CanvasSuggestContextHints
): string {
  const supported = capabilities.supportedOperations.join(', ');

  const lines: string[] = [
    'Du bist ein KI-Assistent für eine Design-Plattform der deutschen Grünen.',
    'Du erzeugst konkrete, umsetzbare Vorschläge zur Verbesserung des aktuellen Sharepic-Entwurfs.',
    '',
    'Sprachregeln (zwingend):',
    '- Verwende immer die Du-Form (informell).',
    '- Verwende Genderstern bei Personenbezeichnungen (z.B. "Bürger*innen", "Wähler*innen").',
    '- Halte Texte prägnant und kampagnentauglich.',
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
    lines.push('Bereits platzierte Elemente:');
    for (const e of snapshot.elementsSummary) {
      lines.push(`- [${e.kind}] ${e.id}: ${e.label}`);
    }
  }

  appendResearchContext(lines, contextHints);

  lines.push('');
  lines.push(
    `Antworte ausschließlich über das Tool "${TOOL_NAME}" mit 3 bis 5 sinnvollen Vorschlägen.`
  );
  lines.push(
    'Jeder Vorschlag darf nur die oben aufgeführten Operations-Typen enthalten und nur Felder/IDs verwenden, die explizit gelistet sind.'
  );
  lines.push('');
  lines.push('PFLICHT-FORMAT eines Vorschlags (genaues Schema, andere Schlüssel sind ungültig):');
  lines.push('```json');
  lines.push('{');
  lines.push('  "title": "Kurze Bezeichnung des Vorschlags",');
  lines.push('  "description": "1-2 Sätze, warum das hilft (optional)",');
  lines.push('  "operations": [ /* eine oder mehrere Operationen, siehe Schemas unten */ ]');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('Strikte Top-Level-Regeln:');
  lines.push('- Top-Level: { "suggestions": [ { Vorschlag }, ... ] }');
  lines.push(
    '- Jeder Vorschlag MUSS "title" und "operations" enthalten. "description" ist optional.'
  );
  lines.push(
    '- Operationen werden NIEMALS direkt in "suggestions" platziert — sie liegen IMMER in "operations" innerhalb eines Vorschlags.'
  );
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
      '    "field" MUSS einer der oben unter "Aktueller Inhalt" gelisteten Feld-Identifier sein (z.B. "quote", "line1", "title"). "value" enthält den NEUEN Text. Niemals "text" als Schlüssel verwenden.'
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
  if (supportedSet.has('set-font-size')) {
    lines.push(
      '  - { "kind": "set-font-size", "field": "<field>", "label": "<Feld-Label>", "size": <integer 1..500> }'
    );
    lines.push(
      '    "size" ist eine ganze Zahl in Pixeln. Realistische Werte: Headlines 60–120, Body 28–48.'
    );
  }
  if (supportedSet.has('update-element')) {
    lines.push('  - { "kind": "update-element", "elementId": "<id>", "patch": { ... } }');
    lines.push('    "patch" muss MINDESTENS EIN Feld aus dieser Liste enthalten:');
    lines.push('      - "color": "#RRGGBB"');
    lines.push('      - "opacity": Zahl 0..1 (z.B. 0.5)');
    lines.push('      - "scale": positive Zahl, max 10 (z.B. 1.2)');
    lines.push('      - "rotation": Grad zwischen -360 und 360');
    lines.push('      - "x": Zahl (Pixel-Position)');
    lines.push('      - "y": Zahl (Pixel-Position)');
    lines.push(
      '    "elementId" MUSS aus "Bereits platzierte Elemente" stammen. Werte außerhalb des erlaubten Bereichs werden zurückgewiesen.'
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
  } else if (supportedSet.has('set-background-color')) {
    lines.push('');
    lines.push(
      'WICHTIG zu Farben: Beschränke Hex-Farben auf das Grüne CI. Bevorzugte Markenfarben: Tanne #005538, Sand #F5F1E9, Lila #6F2DA8, Pink #FF7F8E, Gelb #FFD320. Erfinde keine willkürlichen Farben (z.B. #2E7D32, #4A90E2) — die wirken off-brand.'
    );
    lines.push(
      'KONTRAST-PFLICHT: Stelle sicher, dass die Hintergrundfarbe genug Kontrast zu Texten und Elementen auf der Vorlage bietet. Wenn die aktuelle Hintergrundfarbe bereits dunkel ist (z.B. Tanne #005538), schlage KEINE weitere dunkle Farbe vor. Wenn der Text auf der Vorlage z.B. weiß ist, wähle dunkle Hintergründe. Vermeide Grün-auf-Grün, Hell-auf-Hell, Dunkel-auf-Dunkel.'
    );
  }

  return lines.join('\n');
}

export function buildCanvasSuggestUserMessage(prompt: string): string {
  return `Verwende JETZT das Tool ${TOOL_NAME} mit 3 bis 5 Vorschlägen für folgende Anweisung:\n\n${prompt}\n\nAntworte ausschließlich über den Tool-Aufruf — keinen Begleittext.`;
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
    'Nutze die folgenden Recherche-Ergebnisse, wenn der Vorschlag Texte mit Fakten, Zahlen oder Zitaten verlangt. Bevorzuge konkrete Aussagen aus diesen Quellen gegenüber Allgemeinplätzen. Erfinde keine Zahlen, die hier nicht belegt sind.'
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
