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
import {
  type CanvasAiCapabilities,
  type CanvasAiOperation,
  type CanvasAiSnapshot,
} from './canvasAi.js';

export const SHAREPIC_EDITABLE_TEMPLATES = ['dreizeilen', 'zitat-pure', 'info'] as const;
export type SharepicEditableTemplate = (typeof SHAREPIC_EDITABLE_TEMPLATES)[number];

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
  /** State key holding `{ x, y }` for this element. */
  positionStateKey: string;
  /** Allowed range for x/y values (canvas-relative). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** State key + clamp bounds for `patch.scale`, when scalable. */
  scale?: { stateKey: string; min: number; max: number };
}

export interface SharepicTemplateDescriptor {
  id: SharepicEditableTemplate;
  label: string;
  canvas: { width: number; height: number };
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
    },
    {
      id: 'sunflower',
      label: 'Sonnenblume (Logo)',
      kind: 'asset',
      positionStateKey: 'sunflowerPos',
      bounds: { minX: 0, maxX: 1080, minY: 0, maxY: 1350 },
    },
  ],
  defaultState: { colorSchemeId: 'tanne-sand', fontSize: 60, sunflowerVisible: true },
};

const ZITAT_PURE_DESCRIPTOR: SharepicTemplateDescriptor = {
  id: 'zitat-pure',
  label: 'Zitat',
  canvas: { width: 1080, height: 1350 },
  supportedOperations: ['set-text', 'set-font-size', 'set-background-color'],
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
  elements: [],
  defaultState: { backgroundColor: '#6CCD87' },
};

const INFO_DESCRIPTOR: SharepicTemplateDescriptor = {
  id: 'info',
  label: 'Info',
  canvas: { width: 1080, height: 1350 },
  supportedOperations: ['set-text', 'set-font-size', 'set-background-color'],
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
  elements: [],
  defaultState: { backgroundColor: '#005538' },
};

const DESCRIPTORS: Record<SharepicEditableTemplate, SharepicTemplateDescriptor> = {
  dreizeilen: DREIZEILEN_DESCRIPTOR,
  'zitat-pure': ZITAT_PURE_DESCRIPTOR,
  info: INFO_DESCRIPTOR,
};

export function getSharepicTemplateDescriptor(
  canvasType: string
): SharepicTemplateDescriptor | null {
  return (DESCRIPTORS as Record<string, SharepicTemplateDescriptor>)[canvasType] ?? null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function elementPositionLabel(
  el: SharepicElementDescriptor,
  state: Record<string, unknown>
): string {
  const pos = state[el.positionStateKey] as { x?: number; y?: number } | null | undefined;
  const x = typeof pos?.x === 'number' ? Math.round(pos.x) : 0;
  const y = typeof pos?.y === 'number' ? Math.round(pos.y) : 0;
  return `${el.label} — Position x=${x}, y=${y} (erlaubt: x ${el.bounds.minX}..${el.bounds.maxX}, y ${el.bounds.minY}..${el.bounds.maxY})`;
}

/** Compact LLM-facing snapshot of the current sharepic state (~200 tokens). */
export function buildSharepicSnapshot(
  descriptor: SharepicTemplateDescriptor,
  state: Record<string, unknown>
): CanvasAiSnapshot {
  const snapshot: CanvasAiSnapshot = {
    template: descriptor.id,
    textFields: descriptor.textFields.map((f) => ({
      field: f.field,
      label: f.label,
      value: str(state[f.stateKey]),
    })),
    elementsSummary: descriptor.elements.map((el) => ({
      id: el.id,
      kind: el.kind,
      label: elementPositionLabel(el, state),
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
      const prev = (state[el.positionStateKey] as { x?: number; y?: number } | null) ?? null;
      if (op.patch.x != null || op.patch.y != null) {
        const x = clamp(op.patch.x ?? prev?.x ?? 0, el.bounds.minX, el.bounds.maxX);
        const y = clamp(op.patch.y ?? prev?.y ?? 0, el.bounds.minY, el.bounds.maxY);
        patch[el.positionStateKey] = { x, y };
      }
      if (op.patch.scale != null) {
        if (!el.scale) {
          rejected.push({ op, reason: `Element "${op.elementId}" ist nicht skalierbar` });
          continue;
        }
        patch[el.scale.stateKey] = clamp(op.patch.scale, el.scale.min, el.scale.max);
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

  return { patch, applied, rejected, imageQueries };
}
