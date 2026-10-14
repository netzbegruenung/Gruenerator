import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { HELLGRUEN_GLOW } from '../../brand/theme';
import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { CanvasStoreProvider } from '../../stores/CanvasStoreProvider';
import { GenericCanvasElement } from '../GenericCanvasElement';

import type { BackgroundElementConfig } from '../../configs/types';

const noop = () => {};

function backgroundNode(backgroundColor: string) {
  Konva.autoDrawEnabled = false;
  const stageRef = createRef<CanvasStageRef>();
  const config: BackgroundElementConfig = {
    id: 'background',
    type: 'background',
    x: 0,
    y: 0,
    width: 1080,
    height: 1350,
    colorKey: 'backgroundColor',
  };
  render(
    <CanvasStoreProvider>
      <CanvasStage ref={stageRef} width={1080} height={1350}>
        <GenericCanvasElement
          config={config}
          state={{ backgroundColor }}
          layout={{}}
          onSelect={noop}
          onTextChange={noop}
          onFontSizeChange={noop}
          onPositionChange={noop}
          onImageDragEnd={noop}
          onImageTransformEnd={noop}
          onSnapChange={noop}
          onSnapLinesChange={noop}
          stageWidth={1080}
          stageHeight={1350}
          snapTargets={[]}
        />
      </CanvasStage>
    </CanvasStoreProvider>
  );
  return stageRef.current!.getStage()!.findOne<Konva.Rect>('.canvas-background')!;
}

describe('template background plane', () => {
  it('draws stored Hellgrün as the dark glow, not flat', () => {
    const node = backgroundNode('#56af31');
    const stops = node.fillRadialGradientColorStops();
    expect(stops.filter((s) => typeof s === 'string')).toEqual([...HELLGRUEN_GLOW]);
  });

  it('draws Dunkelgrün flat', () => {
    const node = backgroundNode('#257639');
    expect(node.fill()).toBe('#257639');
    expect(node.fillRadialGradientColorStops()).toBeUndefined();
  });
});
