import { visibleStageTexts } from '@ggraphic/editor/utils/captureStage';
import Konva from 'konva';
import { afterEach, describe, expect, it } from 'vitest';

let stage: Konva.Stage | null = null;

afterEach(() => {
  stage?.destroy();
  stage = null;
});

function makeStage() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  stage = new Konva.Stage({ container, width: 1080, height: 1350 });
  const layer = new Konva.Layer();
  stage.add(layer);
  return layer;
}

describe('visibleStageTexts', () => {
  it('lists text elements top to bottom, then left to right', () => {
    const layer = makeStage();
    layer.add(new Konva.Text({ id: 'source', text: 'Quelle: VCD', x: 70, y: 1200 }));
    layer.add(new Konva.Text({ id: 'right', text: 'Rechts', x: 600, y: 300 }));
    layer.add(new Konva.Text({ id: 'headline', text: 'Klimaschutz vor Ort', x: 70, y: 100 }));
    layer.add(new Konva.Text({ id: 'left', text: 'Links', x: 70, y: 300 }));

    expect(visibleStageTexts(stage)).toEqual([
      'Klimaschutz vor Ort',
      'Links',
      'Rechts',
      'Quelle: VCD',
    ]);
  });

  it('joins the runs of a rich text block back into one text', () => {
    const layer = makeStage();
    const block = new Konva.Group({ id: 'quote', x: 70, y: 400 });
    block.add(new Konva.Text({ text: '•', x: 0, y: 0 }));
    block.add(new Konva.Text({ text: 'beste Investition', x: 160, y: 0, fontStyle: 'bold' }));
    block.add(new Konva.Text({ text: 'Gute Schulen sind die ', x: 20, y: 0 }));
    block.add(new Konva.Text({ text: 'in unsere Zukunft.', x: 20, y: 60 }));
    layer.add(block);

    expect(visibleStageTexts(stage)).toEqual([
      'Gute Schulen sind die beste Investition in unsere Zukunft.',
    ]);
  });

  it('skips hidden, transparent, empty, arrow-only and selection-chrome text', () => {
    const layer = makeStage();
    layer.add(new Konva.Text({ id: 'shown', text: 'Sichtbar', y: 10 }));
    layer.add(new Konva.Text({ id: 'hidden', text: 'Versteckt', visible: false }));
    layer.add(new Konva.Text({ id: 'clear', text: 'Durchsichtig', opacity: 0 }));
    layer.add(new Konva.Text({ id: 'empty', text: '   ' }));
    layer.add(new Konva.Text({ id: 'arrow', text: '→' }));
    const chrome = new Konva.Group({ name: 'selection-chrome' });
    chrome.add(new Konva.Text({ text: '120 × 80' }));
    layer.add(chrome);

    expect(visibleStageTexts(stage)).toEqual(['Sichtbar']);
  });

  it('returns nothing without a stage', () => {
    expect(visibleStageTexts(null)).toEqual([]);
  });
});
