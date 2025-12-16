import React from 'react';
import { Composition } from 'remotion';
import VideoComposition from './VideoComposition';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="VideoEditor"
        component={VideoComposition}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          clips: {},
          segments: [],
          subtitles: '',
          stylePreference: 'shadow',
          textOverlays: [],
          videoWidth: 1920,
          videoHeight: 1080
        }}
        calculateMetadata={async ({ props }) => {
          // Use dimensions from inputProps for server-side rendering
          const width = props.videoWidth || 1920;
          const height = props.videoHeight || 1080;
          const fps = props.fps || 30;
          const durationInFrames = props.durationInFrames || 300;

          return {
            width,
            height,
            fps,
            durationInFrames,
            props: {
              ...props,
              videoWidth: width,
              videoHeight: height
            }
          };
        }}
      />
    </>
  );
};

export default RemotionRoot;
