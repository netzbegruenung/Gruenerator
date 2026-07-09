/**
 * Server-safe sharepic template descriptors.
 *
 * The canvas-editor configs (`packages/canvas-editor/src/configs/*.tsx`) are
 * the runtime source of truth for template state, but they import react-konva
 * and cannot be loaded by the API. This module duplicates the EDITABLE SURFACE
 * of the chat-editable templates (dreizeilen / zitat-pure / info) as pure data,
 * plus pure functions to build the LLM snapshot and translate validated
 * `CanvasAiOperation`s into a flat state patch.
 *
 * Parity guards live in `packages/canvas-editor/src/ai/descriptorParity.vitest.ts`
 * (color schemes / background colors / state keys against the real configs).
 */
import { z } from 'zod';

import {
  type CanvasAiCapabilities,
  type CanvasAiOperation,
  type CanvasAiSnapshot,
} from './canvasAi.js';

/**
 * Canonical, closed set of canvas template ("sharepic") types — the single
 * source of truth shared across api / chat / web. These are the mintable
 * template types (the keys of the web `CANVAS_TYPE_FIELDS` map). Anything that
 * crosses a boundary as a "canvasType" / "template_type" should be validated
 * against this enum so an unknown/empty value is rejected where it enters,
 * rather than silently flowing through to the canvas mint.
 *
 * NOT included: KI types (`green-edit`, …) which are FLUX-image flows, and
 * `presentation`, which is not minted through the sharepic handoff.
 */
export const CANVAS_TEMPLATE_TYPES = [
  'dreizeilen',
  'zitat',
  'zitat-pure',
  'info',
  'veranstaltung',
  'simple',
  'slider',
  'profilbild',
  'freeform',
] as const;
export const canvasTemplateTypeSchema = z.enum(CANVAS_TEMPLATE_TYPES);
export type CanvasTemplateType = z.infer<typeof canvasTemplateTypeSchema>;

const CANVAS_TEMPLATE_TYPE_SET: ReadonlySet<string> = new Set(CANVAS_TEMPLATE_TYPES);
/**
 * Runtime guard. Uses a module-level Set lookup (not `schema.safeParse`, which
 * allocates a result object per call) since this runs per-variant in SSE/thread
 * hot paths — see `coerceSharepicVariants`.
 */
export const isCanvasTemplateType = (value: unknown): value is CanvasTemplateType =>
  typeof value === 'string' && CANVAS_TEMPLATE_TYPE_SET.has(value);

export const SHAREPIC_EDITABLE_TEMPLATES = ['dreizeilen', 'zitat-pure', 'info', 'slider'] as const;
export type SharepicEditableTemplate = (typeof SHAREPIC_EDITABLE_TEMPLATES)[number];

// Compile-time guard: every chat-editable template must be a canonical canvas
// template type. If this fails, reconcile the two lists above.
type _AssertEditableSubset = SharepicEditableTemplate extends CanvasTemplateType ? true : never;
const _assertEditableSubset: _AssertEditableSubset = true;
void _assertEditableSubset;

export interface SharepicTextFieldDescriptor {
  /** Field identifier the LLM targets (`set-text` / `set-font-size`). */
  field: string;
  /** German label shown to the LLM and in UI previews. */
  label: string;
  /** Flat state key the value lives under. */
  stateKey: string;
  /** State key + clamp bounds for `set-font-size` on this field. */
  fontSize?: { stateKey: string; min: number; max: number };
}

export interface SharepicElementDescriptor {
  /** Element id the LLM targets with `update-element`. */
  id: string;
  label: string;
  kind: 'balken' | 'asset';
  /** State key holding `{ x, y }`; omit for elements that cannot move (pfeil). */
  positionStateKey?: string;
  /** Allowed range for x/y values (canvas-relative). Required with positionStateKey. */
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
  /** State key + clamp bounds for `patch.scale`, when scalable. */
  scale?: { stateKey: string; min: number; max: number };
  /** State key + clamp bounds for `patch.opacity` (0–1), when supported. */
  opacity?: { stateKey: string; min: number; max: number };
  /**
   * State key whose truthiness gates position/scale edits (dreizeilen
   * background: panning/zooming a non-existent image is meaningless).
   * Also surfaces as "vorhanden/keins" in the snapshot label.
   */
  presenceStateKey?: string;
}

/** Per-scheme colors the studio's `setColorScheme` action derives together. */
export interface SliderSchemeColors {
  background: string;
  pillBackground: string;
  pillText: string;
  arrow: string;
}

export interface SharepicDeckDescriptor {
  maxSlides: number;
  /** Cover + at least one content slide + closing slide. */
  minSlides: number;
  /** Base state for `add-slide` (before headline/subtext are merged in). */
  defaultNewSlideState: Record<string, unknown>;
  /**
   * `set-color-scheme` is deck-wide and, unlike the studio action, reaches the
   * state as a raw patch — so the interpreter must mirror the derived colors
   * (backgroundColor, pill badge, arrow icon) itself using this map.
   */
  schemeColors: Record<string, SliderSchemeColors>;
}

export interface SharepicTemplateDescriptor {
  id: SharepicEditableTemplate;
  label: string;
  canvas: { width: number; height: number };
  /** Present only for multi-page (deck) templates such as the slider. */
  deck?: SharepicDeckDescriptor;
  supportedOperations: string[];
  textFields: SharepicTextFieldDescriptor[];
  /** Color schemes for `set-color-scheme` (dreizeilen). */
  colorSchemes?: { stateKey: string; options: Array<{ id: string; label: string }> };
  /** Fixed solid background palette for `set-background-color` (zitat-pure / info). */
  backgroundColors?: {
    stateKey: string;
    options: Array<{ id: string; label: string; color: string }>;
  };
  /** Stock background photo target for `set-background-image` (dreizeilen). */
  backgroundImage?: { stateKey: string };
  /** State key for `toggle-sunflower`. */
  sunflowerVisibleStateKey?: string;
  elements: SharepicElementDescriptor[];
  /**
   * Manual position overrides to CLEAR (set to null = back to auto layout)
   * when a layout-driving field changes. Example: editing the zitat-pure
   * quote changes its height — a pinned absolute `namePosition` would leave
   * the name floating mid-text, so the edit resets it and the name re-flows
   * under the new quote. Skipped when the same op batch sets the key itself.
   */
  layoutResets?: Array<{ onFields: string[]; clearStateKey: string }>;
  /** Defaults merged under variant initialProps when minting a canvas doc. */
  defaultState: Record<string, unknown>;
}

const DREIZEILEN_DESCRIPTOR: SharepicTemplateDescriptor = {
  id: 'dreizeilen',
  label: 'Dreizeiler',
  canvas: { width: 1080, height: 1350 },
  supportedOperations: [
    'set-text',
    'set-font-size',
    'set-color-scheme',
    'toggle-sunflower',
    'update-element',
    'set-background-image',
  ],
  textFields: [
    {
      field: 'line1',
      label: 'Erste Zeile',
      stateKey: 'line1',
      fontSize: { stateKey: 'fontSize', min: 30, max: 120 },
    },
    {
      field: 'line2',
      label: 'Zweite Zeile',
      stateKey: 'line2',
      fontSize: { stateKey: 'fontSize', min: 30, max: 120 },
    },
    {
      field: 'line3',
      label: 'Dritte Zeile',
      stateKey: 'line3',
      fontSize: { stateKey: 'fontSize', min: 30, max: 120 },
    },
  ],
  colorSchemes: {
    stateKey: 'colorSchemeId',
    options: [
      { id: 'tanne-sand', label: 'Tanne & Sand' },
      { id: 'sand-tanne', label: 'Sand & Tanne' },
    ],
  },
  backgroundImage: { stateKey: 'currentImageSrc' },
  sunflowerVisibleStateKey: 'sunflowerVisible',
  elements: [
    {
      id: 'balken',
      label: 'Text-Balken (drei Zeilen)',
      kind: 'balken',
      positionStateKey: 'balkenOffset',
      bounds: { minX: -300, maxX: 300, minY: -300, maxY: 300 },
      scale: { stateKey: 'balkenScale', min: 0.5, max: 2 },
      opacity: { stateKey: 'balkenOpacity', min: 0.2, max: 1 },
    },
    {
      id: 'sunflower',
      label: 'Sonnenblume (Logo)',
      kind: 'asset',
      positionStateKey: 'sunflowerPos',
      bounds: { minX: 0, maxX: 1080, minY: 0, maxY: 1350 },
      opacity: { stateKey: 'sunflowerOpacity', min: 0.05, max: 1 },
    },
    {
      // Background photo pan/zoom/opacity. Offset semantics: {0,0} = centered
      // crop, negative y shifts the visible cutout up. Gated on an existing
      // image via presenceStateKey.
      id: 'hintergrundbild',
      label: 'Hintergrundbild (Ausschnitt)',
      kind: 'asset',
      positionStateKey: 'imageOffset',
      bounds: { minX: -540, maxX: 540, minY: -675, maxY: 675 },
      scale: { stateKey: 'imageScale', min: 0.5, max: 3 },
      opacity: { stateKey: 'backgroundImageOpacity', min: 0.2, max: 1 },
      presenceStateKey: 'currentImageSrc',
    },
  ],
  defaultState: { colorSchemeId: 'tanne-sand', fontSize: 60, sunflowerVisible: true },
};

const ZITAT_PURE_DESCRIPTOR: SharepicTemplateDescriptor = {
  id: 'zitat-pure',
  label: 'Zitat',
  canvas: { width: 1080, height: 1350 },
  supportedOperations: ['set-text', 'set-font-size', 'set-background-color', 'update-element'],
  textFields: [
    {
      field: 'quote',
      label: 'Zitat',
      stateKey: 'quote',
      fontSize: { stateKey: 'customPrimaryFontSize', min: 30, max: 120 },
    },
    {
      field: 'name',
      label: 'Name',
      stateKey: 'name',
      fontSize: { stateKey: 'customSecondaryFontSize', min: 20, max: 80 },
    },
  ],
  backgroundColors: {
    stateKey: 'backgroundColor',
    options: [
      { id: 'green', label: 'Grün', color: '#6CCD87' },
      { id: 'sand', label: 'Sand', color: '#F5F1E9' },
    ],
  },
  elements: [
    {
      // Name line position in ABSOLUTE canvas coordinates: writing
      // `namePosition` overrides the auto-centered layout (the template text
      // element carries `positionStateKey: 'namePosition'`); without it the
      // name sits ~60px under the quote. Default x is the 75px left margin.
      id: 'name',
      label: 'Name (Position)',
      kind: 'asset',
      positionStateKey: 'namePosition',
      bounds: { minX: 75, maxX: 500, minY: 120, maxY: 1250 },
    },
    {
      // Decorative quotation mark above the quote. Offset relative to its
      // auto-layout anchor; opacity 0 hides it.
      id: 'anfuehrungszeichen',
      label: 'Anführungszeichen',
      kind: 'asset',
      positionStateKey: 'quoteMarkOffset',
      bounds: { minX: -400, maxX: 400, minY: -400, maxY: 400 },
      opacity: { stateKey: 'quoteMarkOpacity', min: 0, max: 1 },
    },
  ],
  layoutResets: [{ onFields: ['quote'], clearStateKey: 'namePosition' }],
  defaultState: { backgroundColor: '#6CCD87' },
};

const INFO_DESCRIPTOR: SharepicTemplateDescriptor = {
  id: 'info',
  label: 'Info',
  canvas: { width: 1080, height: 1350 },
  supportedOperations: ['set-text', 'set-font-size', 'set-background-color', 'update-element'],
  textFields: [
    {
      field: 'header',
      label: 'Überschrift',
      stateKey: 'header',
      fontSize: { stateKey: 'customPrimaryFontSize', min: 30, max: 120 },
    },
    {
      field: 'body',
      label: 'Text',
      stateKey: 'body',
      fontSize: { stateKey: 'customSecondaryFontSize', min: 20, max: 80 },
    },
  ],
  backgroundColors: {
    stateKey: 'backgroundColor',
    options: [
      { id: 'tanne', label: 'Tanne', color: '#005538' },
      { id: 'sand', label: 'Sand', color: '#F5F1E9' },
    ],
  },
  elements: [
    {
      // The arrow between header and body. Not movable (auto layout) —
      // opacity 0 hides it.
      id: 'pfeil',
      label: 'Pfeil',
      kind: 'asset',
      opacity: { stateKey: 'arrowOpacity', min: 0, max: 1 },
    },
  ],
  defaultState: { backgroundColor: '#005538' },
};

const SLIDER_DESCRIPTOR: SharepicTemplateDescriptor = {
  id: 'slider',
  label: 'Slider-Karussell',
  canvas: { width: 1080, height: 1350 },
  deck: {
    maxSlides: 10,
    minSlides: 3,
    defaultNewSlideState: {
      label: '',
      headline: '',
      subtext: '',
      subtext2: '',
      slideVariant: 'content',
    },
    schemeColors: {
      'sand-tanne': {
        background: '#F5F1E9',
        pillBackground: '#005538',
        pillText: '#FFFFFF',
        arrow: '#005538',
      },
      'tanne-sand': {
        background: '#005538',
        pillBackground: '#F5F1E9',
        pillText: '#005538',
        arrow: '#F5F1E9',
      },
    },
  },
  supportedOperations: ['set-text', 'set-font-size', 'set-color-scheme'],
  textFields: [
    {
      field: 'label',
      label: 'Label (Pill-Badge, nur Cover)',
      stateKey: 'label',
      fontSize: { stateKey: 'customLabelFontSize', min: 20, max: 80 },
    },
    {
      field: 'headline',
      label: 'Headline',
      stateKey: 'headline',
      fontSize: { stateKey: 'customHeadlineFontSize', min: 30, max: 150 },
    },
    {
      field: 'subtext',
      label: 'Untertext',
      stateKey: 'subtext',
      fontSize: { stateKey: 'customSubtextFontSize', min: 20, max: 90 },
    },
    {
      field: 'subtext2',
      label: 'Zusatztext (nur Content-Slides)',
      stateKey: 'subtext2',
      fontSize: { stateKey: 'customSubtext2FontSize', min: 20, max: 90 },
    },
  ],
  colorSchemes: {
    stateKey: 'colorScheme',
    options: [
      { id: 'sand-tanne', label: 'Sand & Tanne (heller Hintergrund)' },
      { id: 'tanne-sand', label: 'Tanne & Sand (dunkler Hintergrund)' },
    ],
  },
  elements: [],
  defaultState: { colorScheme: 'sand-tanne' },
};

const DESCRIPTORS: Record<SharepicEditableTemplate, SharepicTemplateDescriptor> = {
  dreizeilen: DREIZEILEN_DESCRIPTOR,
  'zitat-pure': ZITAT_PURE_DESCRIPTOR,
  info: INFO_DESCRIPTOR,
  slider: SLIDER_DESCRIPTOR,
};

export function getSharepicTemplateDescriptor(
  canvasType: string
): SharepicTemplateDescriptor | null {
  return (DESCRIPTORS as Record<string, SharepicTemplateDescriptor>)[canvasType] ?? null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function elementSummaryLabel(
  el: SharepicElementDescriptor,
  descriptor: SharepicTemplateDescriptor,
  state: Record<string, unknown>
): string {
  const parts: string[] = [el.label];
  if (el.positionStateKey && el.bounds) {
    const pos = state[el.positionStateKey] as { x?: number; y?: number } | null | undefined;
    const x = typeof pos?.x === 'number' ? Math.round(pos.x) : 0;
    const y = typeof pos?.y === 'number' ? Math.round(pos.y) : 0;
    parts.push(
      `Position x=${x}, y=${y} (erlaubt: x ${el.bounds.minX}..${el.bounds.maxX}, y ${el.bounds.minY}..${el.bounds.maxY})`
    );
  }
  if (el.opacity) {
    const raw = state[el.opacity.stateKey];
    const current = typeof raw === 'number' ? raw : 1;
    parts.push(`Transparenz ${Math.round(current * 100)}%`);
  }
  if (el.presenceStateKey) {
    parts.push(state[el.presenceStateKey] ? 'Bild vorhanden' : 'kein Bild gesetzt');
  }
  if (el.id === 'sunflower' && descriptor.sunflowerVisibleStateKey) {
    parts.push(state[descriptor.sunflowerVisibleStateKey] === false ? 'ausgeblendet' : 'sichtbar');
  }
  return `${parts[0]} — ${parts.slice(1).join(', ')}`;
}

/** Compact LLM-facing snapshot of the current sharepic state (~200 tokens). */
export function buildSharepicSnapshot(
  descriptor: SharepicTemplateDescriptor,
  state: Record<string, unknown>
): CanvasAiSnapshot {
  const snapshot: CanvasAiSnapshot = {
    template: descriptor.id,
    // Current font size rides along in the label so the LLM can judge
    // "größer/kleiner" relative to the actual value instead of guessing.
    textFields: descriptor.textFields.map((f) => {
      const size = f.fontSize ? state[f.fontSize.stateKey] : undefined;
      const sizeInfo = f.fontSize
        ? typeof size === 'number'
          ? ` (Schrift: ${Math.round(size)}px)`
          : ' (Schrift: automatisch)'
        : '';
      return {
        field: f.field,
        label: `${f.label}${sizeInfo}`,
        value: str(state[f.stateKey]),
      };
    }),
    elementsSummary: descriptor.elements.map((el) => ({
      id: el.id,
      kind: el.kind,
      label: elementSummaryLabel(el, descriptor, state),
    })),
  };
  if (descriptor.colorSchemes) {
    const current = str(state[descriptor.colorSchemes.stateKey]);
    if (current) snapshot.currentColorScheme = current;
  }
  if (descriptor.backgroundColors) {
    const current = str(state[descriptor.backgroundColors.stateKey]);
    if (/^#[0-9a-fA-F]{6}$/.test(current)) snapshot.currentBackgroundColor = current;
  }
  return snapshot;
}

export function buildSharepicCapabilities(
  descriptor: SharepicTemplateDescriptor
): CanvasAiCapabilities {
  return {
    supportedOperations: descriptor.supportedOperations,
    ...(descriptor.colorSchemes && {
      colorSchemes: descriptor.colorSchemes.options.map((o) => ({ id: o.id, label: o.label })),
    }),
  };
}

export interface SharepicOpsResult {
  /** Flat state patch ready for the canvas state writer. */
  patch: Record<string, unknown>;
  applied: CanvasAiOperation[];
  rejected: Array<{ op: CanvasAiOperation; reason: string }>;
  /**
   * `set-background-image` queries the caller must resolve to image URLs
   * (server-side) and merge under `descriptor.backgroundImage.stateKey`.
   */
  imageQueries: string[];
}

/**
 * Translate validated operations into a flat state patch. Unknown fields and
 * unsupported kinds are rejected (never thrown); numeric values are clamped
 * to the descriptor bounds.
 */
export function sharepicOpsToStatePatch(
  descriptor: SharepicTemplateDescriptor,
  ops: CanvasAiOperation[],
  state: Record<string, unknown>
): SharepicOpsResult {
  const patch: Record<string, unknown> = {};
  const applied: CanvasAiOperation[] = [];
  const rejected: Array<{ op: CanvasAiOperation; reason: string }> = [];
  const imageQueries: string[] = [];

  for (const op of ops) {
    if (!descriptor.supportedOperations.includes(op.kind)) {
      rejected.push({
        op,
        reason: `Operation "${op.kind}" wird von ${descriptor.id} nicht unterstützt`,
      });
      continue;
    }

    if (op.kind === 'set-text') {
      const field = descriptor.textFields.find((f) => f.field === op.field);
      if (!field) {
        rejected.push({ op, reason: `Unbekanntes Textfeld "${op.field}"` });
        continue;
      }
      patch[field.stateKey] = op.value;
      applied.push(op);
    } else if (op.kind === 'set-font-size') {
      const field = descriptor.textFields.find((f) => f.field === op.field);
      if (!field?.fontSize) {
        rejected.push({ op, reason: `Keine Schriftgröße für Feld "${op.field}"` });
        continue;
      }
      patch[field.fontSize.stateKey] = clamp(op.size, field.fontSize.min, field.fontSize.max);
      applied.push(op);
    } else if (op.kind === 'set-color-scheme') {
      const schemes = descriptor.colorSchemes;
      if (!schemes || !schemes.options.some((o) => o.id === op.schemeId)) {
        rejected.push({ op, reason: `Unbekanntes Farbschema "${op.schemeId}"` });
        continue;
      }
      patch[schemes.stateKey] = op.schemeId;
      applied.push(op);
    } else if (op.kind === 'set-background-color') {
      const colors = descriptor.backgroundColors;
      const match = colors?.options.find((o) => o.color.toLowerCase() === op.color.toLowerCase());
      if (!colors || !match) {
        const allowed = colors?.options.map((o) => `${o.label} ${o.color}`).join(', ') ?? '';
        rejected.push({ op, reason: `Nur diese Hintergrundfarben sind erlaubt: ${allowed}` });
        continue;
      }
      patch[colors.stateKey] = match.color;
      applied.push(op);
    } else if (op.kind === 'toggle-sunflower') {
      if (!descriptor.sunflowerVisibleStateKey) {
        rejected.push({ op, reason: 'Keine Sonnenblume in dieser Vorlage' });
        continue;
      }
      patch[descriptor.sunflowerVisibleStateKey] = op.visible;
      applied.push(op);
    } else if (op.kind === 'update-element') {
      const el = descriptor.elements.find((e) => e.id === op.elementId);
      if (!el) {
        rejected.push({ op, reason: `Unbekanntes Element "${op.elementId}"` });
        continue;
      }
      if (el.presenceStateKey && !state[el.presenceStateKey]) {
        rejected.push({
          op,
          reason: `"${el.label}" ist nicht gesetzt — es gibt nichts zu verändern`,
        });
        continue;
      }
      let landed = false;
      if (op.patch.x != null || op.patch.y != null) {
        if (!el.positionStateKey || !el.bounds) {
          rejected.push({ op, reason: `Element "${op.elementId}" ist nicht verschiebbar` });
          continue;
        }
        const prev = (state[el.positionStateKey] as { x?: number; y?: number } | null) ?? null;
        const x = clamp(op.patch.x ?? prev?.x ?? 0, el.bounds.minX, el.bounds.maxX);
        const y = clamp(op.patch.y ?? prev?.y ?? 0, el.bounds.minY, el.bounds.maxY);
        patch[el.positionStateKey] = { x, y };
        landed = true;
      }
      if (op.patch.scale != null) {
        if (!el.scale) {
          rejected.push({ op, reason: `Element "${op.elementId}" ist nicht skalierbar` });
          continue;
        }
        patch[el.scale.stateKey] = clamp(op.patch.scale, el.scale.min, el.scale.max);
        landed = true;
      }
      if (op.patch.opacity != null) {
        if (!el.opacity) {
          rejected.push({
            op,
            reason: `Element "${op.elementId}" unterstützt keine Transparenz`,
          });
          continue;
        }
        patch[el.opacity.stateKey] = clamp(op.patch.opacity, el.opacity.min, el.opacity.max);
        landed = true;
      }
      if (!landed) {
        // color/rotation (or an empty patch) — nothing this surface supports.
        rejected.push({
          op,
          reason: 'Für Elemente werden nur x/y, scale und opacity unterstützt',
        });
        continue;
      }
      applied.push(op);
    } else if (op.kind === 'set-background-image') {
      if (!descriptor.backgroundImage) {
        rejected.push({ op, reason: 'Diese Vorlage hat kein Hintergrundbild' });
        continue;
      }
      imageQueries.push(op.query);
      applied.push(op);
    } else {
      rejected.push({ op, reason: `Operation "${op.kind}" wird im Chat nicht unterstützt` });
    }
  }

  // Layout reflow: when a layout-driving field changed, clear stale manual
  // position overrides (null = back to auto layout) — unless this very batch
  // positioned the element deliberately.
  for (const reset of descriptor.layoutResets ?? []) {
    if (reset.clearStateKey in patch) continue;
    const touchedLayoutField = applied.some(
      (op) =>
        (op.kind === 'set-text' || op.kind === 'set-font-size') && reset.onFields.includes(op.field)
    );
    if (touchedLayoutField && state[reset.clearStateKey] != null) {
      patch[reset.clearStateKey] = null;
    }
  }

  return { patch, applied, rejected, imageQueries };
}
