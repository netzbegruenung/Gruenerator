/**
 * The Balken as an element kind of the editor: what the editor does with a
 * `balkenInstances` entry (delete, copy, turn, move, toolbar, layer name, AI
 * line and update, PPTX) and the texts its parts read. Registered once at
 * start-up by `registerGrueneHostSeams`; drawn by `grueneKinds.tsx`. F0: the
 * kind tag `balken`, the state key, the action names, the page keys and the
 * AI label wording (the API's prompts read it).
 */
import { CANVAS_AI_GEOMETRY_FIELDS } from '@ggraphic/editor/ai/applyOperation';
import { aiLabelFormat } from '@ggraphic/editor/ai/describeCanvasElements';
import { messages } from '@ggraphic/editor/i18n/messages';

import type { BalkenInstance } from '../utils/balkenUtils';
import type { ElementKindRegistration } from '@ggraphic/editor/utils/elementKinds';

const { position, turned, quote } = aiLabelFormat;

export const BALKEN_KIND: ElementKindRegistration<'balken'> = {
  kind: 'balken',
  stateKey: 'balkenInstances',
  actions: { update: 'updateBalken', remove: 'removeBalken' },
  add: { action: 'addBalken', args: ({ mode }) => [mode] },
  name: () => messages().layers.bar,
  layerContent: (balken) => balken.texts.filter((t) => t.trim()).join(' / '),
  // No x/y: a Balken sits at an offset from its layout base, and that moves.
  duplicate: (balken, id, offset) => ({
    ...balken,
    id,
    offset: { x: (balken.offset?.x ?? 0) + offset.x, y: (balken.offset?.y ?? 0) + offset.y },
    texts: [...balken.texts],
    ...(balken.barOffsets
      ? { barOffsets: [...balken.barOffsets] as [number, number, number] }
      : {}),
  }),
  // Turns about its centre and stores an offset: x/y stay out of the patch,
  // a move (flipping a multi-selection) goes into the offset.
  orient: (patch, balken) => ({
    ...(patch.rotation != null && { rotation: patch.rotation }),
    ...(patch.translate && {
      offset: {
        x: balken.offset.x + patch.translate.x,
        y: balken.offset.y + patch.translate.y,
      },
    }),
  }),
  nudge: (balken, delta) => ({
    offset: { x: (balken.offset?.x ?? 0) + delta.x, y: (balken.offset?.y ?? 0) + delta.y },
  }),
  floating: (balken) => ({ opacity: balken.opacity ?? 1 }),
  editableText: true,
  describe: (balken) =>
    `Balken ${quote(balken.texts.join(' / '))} · Versatz ${position(balken.offset.x, balken.offset.y)}${turned(balken.rotation)}`,
  aiUpdate: {
    fields: CANVAS_AI_GEOMETRY_FIELDS,
    patch: ({ x, y, scale, ...rest }, balken: BalkenInstance) => ({
      ...rest,
      ...(scale != null && { scale: balken.scale * scale }),
      ...((x != null || y != null) && {
        offset: { x: x ?? balken.offset.x, y: y ?? balken.offset.y },
      }),
    }),
  },
  // Rastered over the page: its size is not in the state, the writer takes the node's.
  pptx: (balken, page) => ({
    kind: 'raster',
    elementId: balken.id,
    box: page,
    rotation: balken.rotation || 0,
    reason: 'balken',
    boxExact: false,
  }),
  // The three-line template's own Balken, derived from its text fields.
  pageStateKeys: [
    'balkenWidthScale',
    'barOffsets',
    'balkenOffset',
    'balkenOpacity',
    'balkenScale',
    'balkenRotation',
    'balkenFitPending',
  ],
  layoutStateKeys: ['balkenOffset', 'barOffsets', 'balkenWidthScale'],
};

/** The Balken's texts, nested into the editor's catalogue under their old keys. */
export const BALKEN_MESSAGES = {
  de: {
    layers: { bar: 'Balken' },
    sidebar: {
      bars: {
        duplicate: 'Balken duplizieren',
        remove: 'Balken entfernen',
        colorScheme: 'Farbschema',
        width: 'Balkenbreite',
        fineTune: 'Feinabstimmung',
        selected: 'Ausgewählter Balken',
        colorHint:
          'Wähle ein Farbschema, das die Lesbarkeit deiner Balken optimiert. Die Vorschau zeigt dir, wie die drei Balken eingefärbt werden. Achte auf guten Kontrast zwischen Balkenfarbe und Text.',
      },
      badges: {
        addBar: 'Einzelnen Balken hinzufügen',
        oneBar: '1 Balken',
        addTripleBar: 'Dreifach-Balken hinzufügen',
        threeBars: '3 Balken',
      },
    },
  },
  en: {
    layers: { bar: 'Banner' },
    sidebar: {
      bars: {
        duplicate: 'Duplicate bar',
        remove: 'Remove bar',
        colorScheme: 'Color scheme',
        width: 'Bar width',
        fineTune: 'Fine tuning',
        selected: 'Selected bar',
        colorHint:
          'Choose a color scheme that makes your bars easy to read. The preview shows how the three bars will be colored. Make sure there is good contrast between the bar color and the text.',
      },
      badges: {
        addBar: 'Add single bar',
        oneBar: '1 bar',
        addTripleBar: 'Add triple bar',
        threeBars: '3 bars',
      },
    },
  },
};

type BalkenMessages = (typeof BALKEN_MESSAGES)['de'];

declare module '@ggraphic/editor/i18n/messages' {
  interface HostMessages {
    layers: BalkenMessages['layers'];
    sidebar: BalkenMessages['sidebar'];
  }
}
