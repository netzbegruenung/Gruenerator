import { describe, expect, it } from 'vitest';

import { fallbackCut, fallbackDesign } from '../fallbackPlan.js';
import { type StoredClipAnalysis } from '../projectTypes.js';
import { findTakeGroups } from '../takeGroups.js';
import { materialWarnings } from '../warnings.js';

import { radwegUnits } from './fixtures.js';

const units = radwegUnits();
const ordered = [...units.values()];

describe('fallbackCut', () => {
  it('keeps every statement in recorded order and drops only earlier takes', () => {
    const takes = findTakeGroups(ordered);
    const plan = fallbackCut(ordered, takes);
    const dropped = takes.flatMap((t) => t.unitIds.filter((id) => id !== t.preferred));

    expect(dropped.length).toBeGreaterThan(0);
    expect(plan.unitIds).toEqual(ordered.map((u) => u.id).filter((id) => !dropped.includes(id)));
    expect(Object.keys(plan.omitted).sort()).toEqual([...dropped].sort());
  });
});

describe('fallbackDesign', () => {
  it('adds captions, the lower third and the official logo, nothing invented', () => {
    const edl = fallbackDesign({
      unitIds: ['c1.s5', 'c1.s6'],
      units,
      framing: new Map(),
      style: 'talking-head-dynamisch',
      format: '9:16',
      person: { name: 'Annika Wolfsteiner' },
      burnedInCaptions: false,
    });
    expect(edl.captions).toEqual({ enabled: true, template: 'tanne' });
    expect(edl.overlays.map((o) => o.kind)).toEqual(['bauchbinde', 'logo']);
    expect(edl.music).toBeNull();
  });
});

describe('materialWarnings', () => {
  const base: StoredClipAnalysis = {
    clipId: 'c1',
    role: 'footage',
    proxyMediaId: 'p',
    proxyShareToken: 't',
    duration: 10,
    width: null,
    height: null,
    words: [],
    detectors: {
      silences: [],
      sceneCuts: [],
      quality: [{ start: 0, end: 6, flag: 'unscharf' }],
      loudness: { integratedLufs: null, lra: null },
    },
    cells: [],
  };

  it('names silent footage and mostly soft clips by their title', () => {
    expect(materialWarnings([base], new Map([['c1', 'Take 1']]))).toEqual([
      'In „Take 1“ wird kaum gesprochen.',
      '„Take 1“ ist über weite Strecken unscharf.',
    ]);
    expect(
      materialWarnings(
        [{ ...base, role: 'broll', detectors: { ...base.detectors, quality: [] } }],
        new Map()
      )
    ).toEqual([]);
  });
});
