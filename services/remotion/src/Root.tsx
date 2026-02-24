import { Composition } from 'remotion';

import { RenderComposition } from './composition/RenderComposition';

import type { RenderInputProps } from './types';

export const Root: React.FC = () => {
  return (
    <Composition<RenderInputProps>
      id="VideoExport"
      component={RenderComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        trackItemIds: [],
        trackItemsMap: {},
        transitionsMap: {},
        fps: 30,
        size: { width: 1080, height: 1920 },
      }}
      calculateMetadata={({ props }) => {
        const fps = props.fps || 30;
        const { width, height } = props.size || { width: 1080, height: 1920 };

        // Calculate duration from the latest track item end time
        let maxEndMs = 0;
        for (const id of props.trackItemIds || []) {
          const item = props.trackItemsMap[id];
          if (item?.display?.to > maxEndMs) {
            maxEndMs = item.display.to;
          }
        }

        const durationInFrames = Math.max(Math.ceil((maxEndMs / 1000) * fps), 1);

        return { durationInFrames, fps, width, height };
      }}
    />
  );
};
