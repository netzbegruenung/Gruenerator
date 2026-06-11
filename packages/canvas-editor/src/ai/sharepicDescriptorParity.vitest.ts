import { describe, it, expect } from 'vitest';

import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  sharepicOpsToStatePatch,
  type CanvasAiOperation,
} from '@gruenerator/contracts';

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
});
