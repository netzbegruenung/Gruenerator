import { describe, it, expect } from 'vitest';

import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  sharepicOpsToStatePatch,
  type CanvasAiOperation,
} from '@gruenerator/contracts';

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
