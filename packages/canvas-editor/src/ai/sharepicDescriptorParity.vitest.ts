import { describe, it, expect } from 'vitest';

import {
  AT_CANVAS_TYPE_OVERRIDES,
  buildSharepicSnapshot,
  CANVAS_TEMPLATE_FIELDS,
  CANVAS_TEMPLATE_TYPES,
  CANVAS_TYPE_TO_GEN,
  getSharepicTemplateDescriptor,
  getSharepicVariantLabel,
  SHAREPIC_EDITABLE_TEMPLATES,
  SHAREPIC_GEN_TO_CANVAS_TYPE,
  sharepicOpsToStatePatch,
  validateSharepicOp,
  type CanvasAiOperation,
  type SharepicTemplateDescriptor,
} from '@gruenerator/contracts';

import { dreizeilenFullConfig } from '../configs/dreizeilen_full.config';
import { dreizeilenOverlayAtFullConfig } from '../configs/dreizeilen_overlay_at_full.config';
import { infoAtFullConfig } from '../configs/info_at_full.config';
import { infoFullConfig } from '../configs/info_full.config';
import { simpleFullConfig } from '../configs/simple_full.config';
import { veranstaltungFullConfig } from '../configs/veranstaltung_full.config';
import { zitatAtFullConfig } from '../configs/zitat_at_full.config';
import { zitatFullConfig } from '../configs/zitat_full.config';
import { zitatPureAtFullConfig } from '../configs/zitat_pure_at_full.config';
import { zitatPureFullConfig } from '../configs/zitat_pure_full.config';
import { COLOR_SCHEMES } from '../utils/dreizeilenLayout';

// The server-safe descriptors in @gruenerator/contracts duplicate the
// editable surface of the canvas-editor configs (which the API cannot import
// — they are .tsx with react-konva). These tests keep the duplication honest.
describe('sharepic template descriptor parity', () => {
  it('dreizeilen color schemes match the canvas-editor COLOR_SCHEMES', () => {
    const descriptor = getSharepicTemplateDescriptor('dreizeilen')!;
    expect(descriptor.colorSchemes?.options).toEqual(
      COLOR_SCHEMES.map((s) => ({ id: s.id, label: s.label }))
    );
  });

  it('all chat-editable templates have descriptors', () => {
    for (const type of ['dreizeilen', 'zitat-pure', 'info']) {
      expect(getSharepicTemplateDescriptor(type), type).not.toBeNull();
    }
    expect(getSharepicTemplateDescriptor('freeform')).toBeNull();
  });
});

describe('sharepicOpsToStatePatch', () => {
  const dreizeilen = getSharepicTemplateDescriptor('dreizeilen')!;
  const zitatPure = getSharepicTemplateDescriptor('zitat-pure')!;

  it('maps set-text to the field state key', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'set-text', field: 'line2', label: 'Zweite Zeile', value: 'Neue Zeile' },
    ];
    const result = sharepicOpsToStatePatch(dreizeilen, ops, {});
    expect(result.patch).toEqual({ line2: 'Neue Zeile' });
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects unknown text fields', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'set-text', field: 'headline', label: 'Headline', value: 'x' },
    ];
    const result = sharepicOpsToStatePatch(dreizeilen, ops, {});
    expect(result.patch).toEqual({});
    expect(result.rejected).toHaveLength(1);
  });

  it('clamps font sizes to descriptor bounds', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'set-font-size', field: 'line1', label: 'Erste Zeile', size: 500 },
    ];
    const result = sharepicOpsToStatePatch(dreizeilen, ops, {});
    expect(result.patch.fontSize).toBe(120);
  });

  it('clamps element moves to bounds and keeps prior axis values', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'update-element', elementId: 'balken', patch: { y: -900 } },
    ];
    const result = sharepicOpsToStatePatch(dreizeilen, ops, {
      balkenOffset: { x: 40, y: 0 },
    });
    expect(result.patch.balkenOffset).toEqual({ x: 40, y: -300 });
  });

  it('moves the zitat-pure name via update-element (absolute coords, clamped)', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'update-element', elementId: 'name', patch: { y: 60 } },
    ];
    const result = sharepicOpsToStatePatch(zitatPure, ops, {});
    // y clamps to the 120px top boundary; missing x falls back to the 75px left margin.
    expect(result.patch.namePosition).toEqual({ x: 75, y: 120 });
  });

  it('resets a pinned namePosition when the quote text changes (layout reflow)', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'set-text', field: 'quote', label: 'Zitat', value: 'Ein viel längeres neues Zitat' },
    ];
    const result = sharepicOpsToStatePatch(zitatPure, ops, {
      namePosition: { x: 75, y: 300 },
    });
    expect(result.patch.namePosition).toBeNull();
  });

  it('keeps namePosition when the batch repositions the name itself', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'set-text', field: 'quote', label: 'Zitat', value: 'Neues Zitat' },
      { kind: 'update-element', elementId: 'name', patch: { y: 200 } },
    ];
    const result = sharepicOpsToStatePatch(zitatPure, ops, {
      namePosition: { x: 75, y: 300 },
    });
    expect(result.patch.namePosition).toEqual({ x: 75, y: 200 });
  });

  it('does not touch namePosition when only the name TEXT changes', () => {
    const ops: CanvasAiOperation[] = [
      { kind: 'set-text', field: 'name', label: 'Name', value: 'Ricarda Lang' },
    ];
    const result = sharepicOpsToStatePatch(zitatPure, ops, {
      namePosition: { x: 75, y: 300 },
    });
    expect('namePosition' in result.patch).toBe(false);
  });

  it('zitat-pure name element state key matches the template config', () => {
    const el = zitatPureFullConfig.elements.find((e) => e.id === 'name-text');
    expect(el && 'positionStateKey' in el ? el.positionStateKey : null).toBe(
      zitatPure.elements.find((e) => e.id === 'name')?.positionStateKey
    );
  });

  it('clamps element opacity to descriptor bounds (balken)', () => {
    const result = sharepicOpsToStatePatch(
      dreizeilen,
      [{ kind: 'update-element', elementId: 'balken', patch: { opacity: 0.05 } }],
      {}
    );
    expect(result.patch.balkenOpacity).toBe(0.2);
  });

  it('gates background-image pan/zoom on an existing image', () => {
    const noImage = sharepicOpsToStatePatch(
      dreizeilen,
      [{ kind: 'update-element', elementId: 'hintergrundbild', patch: { scale: 1.5 } }],
      {}
    );
    expect(noImage.rejected).toHaveLength(1);

    const withImage = sharepicOpsToStatePatch(
      dreizeilen,
      [{ kind: 'update-element', elementId: 'hintergrundbild', patch: { scale: 1.5, y: -200 } }],
      { currentImageSrc: '/api/image-picker/stock-image/x.jpg' }
    );
    expect(withImage.patch.imageScale).toBe(1.5);
    expect(withImage.patch.imageOffset).toEqual({ x: 0, y: -200 });
  });

  it('hides the info arrow via opacity but rejects moving it', () => {
    const info = getSharepicTemplateDescriptor('info')!;
    const hide = sharepicOpsToStatePatch(
      info,
      [{ kind: 'update-element', elementId: 'pfeil', patch: { opacity: 0 } }],
      {}
    );
    expect(hide.patch.arrowOpacity).toBe(0);

    const move = sharepicOpsToStatePatch(
      info,
      [{ kind: 'update-element', elementId: 'pfeil', patch: { y: 100 } }],
      {}
    );
    expect(move.rejected[0].reason).toContain('nicht verschiebbar');
  });

  it('rejects color/rotation-only patches instead of silently applying nothing', () => {
    const result = sharepicOpsToStatePatch(
      dreizeilen,
      [{ kind: 'update-element', elementId: 'balken', patch: { color: '#ff0000' } }],
      {}
    );
    expect(result.applied).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it('rejects set-color-scheme with unknown scheme ids', () => {
    const ops: CanvasAiOperation[] = [{ kind: 'set-color-scheme', schemeId: 'neon-pink' }];
    const result = sharepicOpsToStatePatch(dreizeilen, ops, {});
    expect(result.patch).toEqual({});
    expect(result.rejected[0].reason).toContain('neon-pink');
  });

  it('accepts only the fixed background palette for zitat-pure', () => {
    const ok = sharepicOpsToStatePatch(
      zitatPure,
      [{ kind: 'set-background-color', color: '#6ccd87' }],
      {}
    );
    expect(ok.patch.backgroundColor).toBe('#6CCD87');

    const bad = sharepicOpsToStatePatch(
      zitatPure,
      [{ kind: 'set-background-color', color: '#123456' }],
      {}
    );
    expect(bad.patch).toEqual({});
    expect(bad.rejected).toHaveLength(1);
  });

  it('defers set-background-image queries to the caller', () => {
    const result = sharepicOpsToStatePatch(
      dreizeilen,
      [{ kind: 'set-background-image', query: 'Windräder Sonnenuntergang' }],
      {}
    );
    expect(result.imageQueries).toEqual(['Windräder Sonnenuntergang']);
    expect(result.patch).toEqual({});
    expect(result.applied).toHaveLength(1);
  });

  it('rejects operations the template does not support', () => {
    const result = sharepicOpsToStatePatch(
      zitatPure,
      [{ kind: 'toggle-sunflower', visible: false }],
      {}
    );
    expect(result.rejected).toHaveLength(1);
  });
});

describe('buildSharepicSnapshot', () => {
  it('reports current values and element positions', () => {
    const descriptor = getSharepicTemplateDescriptor('dreizeilen')!;
    const snapshot = buildSharepicSnapshot(descriptor, {
      line1: 'GRÜN',
      line2: 'WIRKT',
      line3: 'HIER',
      colorSchemeId: 'tanne-sand',
      balkenOffset: { x: 12, y: -48 },
    });
    expect(snapshot.template).toBe('dreizeilen');
    expect(snapshot.textFields.map((f) => f.value)).toEqual(['GRÜN', 'WIRKT', 'HIER']);
    expect(snapshot.currentColorScheme).toBe('tanne-sand');
    const balken = snapshot.elementsSummary.find((e) => e.id === 'balken');
    expect(balken?.label).toContain('x=12');
    expect(balken?.label).toContain('y=-48');
  });

  it('surfaces current font size, sunflower visibility and image presence', () => {
    const descriptor = getSharepicTemplateDescriptor('dreizeilen')!;
    const snapshot = buildSharepicSnapshot(descriptor, {
      line1: 'GRÜN',
      fontSize: 80,
      sunflowerVisible: false,
      balkenOpacity: 0.5,
    });
    expect(snapshot.textFields[0].label).toContain('80px');
    expect(snapshot.elementsSummary.find((e) => e.id === 'sunflower')?.label).toContain(
      'ausgeblendet'
    );
    expect(snapshot.elementsSummary.find((e) => e.id === 'balken')?.label).toContain('50%');
    expect(snapshot.elementsSummary.find((e) => e.id === 'hintergrundbild')?.label).toContain(
      'kein Bild'
    );

    const zitatSnapshot = buildSharepicSnapshot(getSharepicTemplateDescriptor('zitat-pure')!, {
      quote: 'Q',
      name: 'N',
    });
    expect(zitatSnapshot.textFields[0].label).toContain('automatisch');
  });
});

// CANVAS_TEMPLATE_FIELDS (contracts) is the one field/label/mapping table the
// studio mint, the API chat path and the chat UI all read. These guards keep it
// honest against the canonical type enum and against the descriptors.
describe('canvas template fields parity', () => {
  it('covers every canonical canvas template type with a label', () => {
    for (const type of CANVAS_TEMPLATE_TYPES) {
      expect(CANVAS_TEMPLATE_FIELDS[type], type).toBeDefined();
      expect(getSharepicVariantLabel(type), type).toBeTruthy();
    }
  });

  it('gives a template and its AT variant the same label', () => {
    for (const [base, atType] of Object.entries(AT_CANVAS_TYPE_OVERRIDES)) {
      if (!atType) continue;
      expect(getSharepicVariantLabel(atType), atType).toBe(getSharepicVariantLabel(base));
    }
  });

  it('agrees with the descriptor labels for editable templates', () => {
    for (const type of SHAREPIC_EDITABLE_TEMPLATES) {
      const descriptor = getSharepicTemplateDescriptor(type)!;
      expect(descriptor.label, type).toBe(CANVAS_TEMPLATE_FIELDS[type].label);
    }
  });

  it('maps every canvas type in CANVAS_TYPE_TO_GEN back through the forward maps', () => {
    for (const [canvasType, gen] of Object.entries(CANVAS_TYPE_TO_GEN)) {
      // Either the gen type maps straight back to this canvas type, or this is
      // the AT variant of the type it maps to.
      const forward = SHAREPIC_GEN_TO_CANVAS_TYPE[gen];
      const atOfForward = forward ? AT_CANVAS_TYPE_OVERRIDES[forward] : undefined;
      const isPhotoQuoteAlias = canvasType === 'zitat' || canvasType === 'zitat-at';
      expect(
        canvasType === forward || canvasType === atOfForward || isPhotoQuoteAlias,
        `${canvasType} -> ${gen}`
      ).toBe(true);
    }
  });

  it('every AT override target is itself a canonical type', () => {
    for (const atType of Object.values(AT_CANVAS_TYPE_OVERRIDES)) {
      if (atType) expect(CANVAS_TEMPLATE_TYPES).toContain(atType);
    }
  });

  it('descriptor text fields are backed by the mint field list', () => {
    // `slider` is the documented exception: its deck fields are per-slide and
    // the mint map deliberately omits subtext2 (see canvasTemplateFields.ts).
    for (const type of SHAREPIC_EDITABLE_TEMPLATES) {
      if (type === 'slider') continue;
      const descriptor = getSharepicTemplateDescriptor(type)!;
      const known = CANVAS_TEMPLATE_FIELDS[type].fields as readonly string[];
      for (const field of descriptor.textFields) {
        expect(known, `${type}.${field.field}`).toContain(field.field);
      }
    }
  });
});

/**
 * Every state key a descriptor lets the chat write has to survive
 * `createInitialState`. That function is not just the mint seed — card renders
 * and remote-sync re-seeds run through it too, and both two-text factories
 * apply a whitelist: a key that is neither part of the base state nor listed in
 * `passthroughStateKeys` is dropped. Without this guard a descriptor can grant
 * an operation that applies live and then silently disappears on the next
 * render, which is exactly how the font-size keys behaved on the image-backed
 * templates.
 */
describe('descriptor state keys survive createInitialState', () => {
  const CONFIGS: Record<string, { createInitialState: (p: Record<string, unknown>) => unknown }> = {
    dreizeilen: dreizeilenFullConfig,
    zitat: zitatFullConfig,
    'zitat-pure': zitatPureFullConfig,
    info: infoFullConfig,
    veranstaltung: veranstaltungFullConfig,
    simple: simpleFullConfig,
    'zitat-at': zitatAtFullConfig,
    'zitat-pure-at': zitatPureAtFullConfig,
    'dreizeilen-overlay-at': dreizeilenOverlayAtFullConfig,
    'info-at': infoAtFullConfig,
  };

  /** Seed each writable key with a type-appropriate, truthy sentinel. */
  function seedFor(descriptor: SharepicTemplateDescriptor): {
    seed: Record<string, unknown>;
    keys: string[];
  } {
    const seed: Record<string, unknown> = {};
    for (const f of descriptor.textFields) {
      seed[f.stateKey] = 'Sentinel';
      if (f.fontSize) seed[f.fontSize.stateKey] = 42;
    }
    for (const el of descriptor.elements) {
      if (el.positionStateKey) seed[el.positionStateKey] = { x: 1, y: 2 };
      if (el.scale) seed[el.scale.stateKey] = 1.25;
      if (el.opacity) seed[el.opacity.stateKey] = 0.75;
    }
    if (descriptor.backgroundColors) {
      seed[descriptor.backgroundColors.stateKey] = descriptor.backgroundColors.options[0].color;
    }
    if (descriptor.colorSchemes) {
      seed[descriptor.colorSchemes.stateKey] = descriptor.colorSchemes.options[0].id;
    }
    if (descriptor.backgroundImage) seed[descriptor.backgroundImage.stateKey] = '/some/photo.jpg';
    if (descriptor.sunflowerVisibleStateKey) seed[descriptor.sunflowerVisibleStateKey] = true;
    return { seed, keys: Object.keys(seed) };
  }

  for (const type of SHAREPIC_EDITABLE_TEMPLATES) {
    // The slider is a deck: its fields live per-slide, not in the page state.
    if (type === 'slider') continue;

    it(`${type} keeps every descriptor-writable key`, () => {
      const descriptor = getSharepicTemplateDescriptor(type)!;
      const { seed, keys } = seedFor(descriptor);
      const state = CONFIGS[type].createInitialState(seed) as Record<string, unknown>;

      for (const key of keys) {
        // Value equality, not just presence: the factories hard-nulled the
        // font-size keys, and a `null` survives an "is it defined" check while
        // still throwing the edit away.
        expect(state[key], `${type}.${key} did not survive createInitialState`).toEqual(seed[key]);
      }
    });
  }
});

describe('validateSharepicOp', () => {
  const dreizeilenD = getSharepicTemplateDescriptor('dreizeilen')!;

  it('clamps a font size into the descriptor bounds', () => {
    const result = validateSharepicOp(
      dreizeilenD,
      { kind: 'set-font-size', field: 'line1', size: 999 } as CanvasAiOperation,
      {}
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.op.kind === 'set-font-size') expect(result.op.size).toBe(120);
  });

  it('rejects an unknown text field', () => {
    const result = validateSharepicOp(
      dreizeilenD,
      { kind: 'set-text', field: 'line9', value: 'x' } as CanvasAiOperation,
      {}
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Unbekanntes Textfeld');
  });

  it('rejects moving an element whose presence key is unset', () => {
    const result = validateSharepicOp(
      dreizeilenD,
      {
        kind: 'update-element',
        elementId: 'hintergrundbild',
        patch: { x: 10 },
      } as CanvasAiOperation,
      {}
    );
    expect(result.ok).toBe(false);
  });

  it('normalizes a background color to the palette casing', () => {
    const zitat = getSharepicTemplateDescriptor('zitat-pure')!;
    const canonical = zitat.backgroundColors!.options[0].color;
    const result = validateSharepicOp(
      zitat,
      { kind: 'set-background-color', color: canonical.toUpperCase() } as CanvasAiOperation,
      {}
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.op.kind === 'set-background-color') {
      expect(result.op.color).toBe(canonical);
    }
  });
});
