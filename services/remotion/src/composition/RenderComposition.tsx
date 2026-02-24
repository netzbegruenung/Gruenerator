/**
 * SSR-safe Render Composition
 *
 * Server-side rendering version of the video editor's composition.
 * This is a simplified version that removes DOM-dependent code
 * (document.querySelector, text editing, moveable refs) while
 * preserving all visual rendering capabilities.
 *
 * TODO: Share more code with apps/video/src/features/editor/player/
 * once the render pipeline is stable. For now, this renders track items
 * sequentially using their display times and the Remotion Sequence API.
 */

import { AbsoluteFill, Sequence, Audio, Video, Img } from 'remotion';

import type { RenderInputProps, ITrackItem } from '../types';

function calculateFrames(
  display: { from: number; to: number },
  fps: number
): { from: number; durationInFrames: number } {
  const from = Math.round((display.from / 1000) * fps);
  const durationInFrames = Math.max(Math.round(((display.to - display.from) / 1000) * fps), 1);
  return { from, durationInFrames };
}

const TrackItemRenderer: React.FC<{
  item: ITrackItem;
  fps: number;
  size: { width: number; height: number };
}> = ({ item, fps, size }) => {
  const { from, durationInFrames } = calculateFrames(item.display, fps);
  const { details } = item;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: details.left ?? 0,
    top: details.top ?? 0,
    width: details.width ?? size.width,
    height: details.height ?? size.height,
    transform: details.transform,
    opacity: details.opacity ?? 1,
    borderRadius: details.borderRadius ?? 0,
    overflow: item.type === 'text' || item.type === 'caption' ? 'visible' : 'hidden',
  };

  let content: React.ReactNode = null;

  switch (item.type) {
    case 'video':
      content = (
        <Video
          src={details.src}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          startFrom={Math.round(((details.trim?.from ?? 0) / 1000) * fps)}
          volume={details.volume ?? 1}
        />
      );
      break;

    case 'audio':
      content = (
        <Audio
          src={details.src}
          startFrom={Math.round(((details.trim?.from ?? 0) / 1000) * fps)}
          volume={details.volume ?? 1}
        />
      );
      break;

    case 'image':
      content = (
        <Img src={details.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      );
      break;

    case 'text':
    case 'caption':
      content = (
        <div
          style={{
            fontFamily: details.fontFamily ?? 'sans-serif',
            fontSize: details.fontSize ?? 16,
            fontWeight: details.fontWeight ?? 'normal',
            color: details.color ?? '#ffffff',
            letterSpacing: details.letterSpacing,
            lineHeight: details.lineHeight,
            textAlign: details.textAlign ?? 'center',
            textShadow: details.textShadow,
            WebkitTextStroke: details.webkitTextStroke,
            backgroundColor: details.backgroundColor ?? 'transparent',
            padding: details.padding,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: details.text ?? '' }}
        />
      );
      break;

    case 'shape':
      content = (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: details.fill ?? details.color ?? '#ffffff',
            borderRadius: details.borderRadius ?? 0,
            border: details.borderWidth
              ? `${details.borderWidth}px solid ${details.borderColor ?? 'transparent'}`
              : undefined,
          }}
        />
      );
      break;

    case 'illustration':
      content = (
        <Img src={details.src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      );
      break;

    default:
      return null;
  }

  // Audio items don't need visual positioning
  if (item.type === 'audio') {
    return (
      <Sequence from={from} durationInFrames={durationInFrames}>
        {content}
      </Sequence>
    );
  }

  return (
    <Sequence from={from} durationInFrames={durationInFrames}>
      <AbsoluteFill style={containerStyle}>{content}</AbsoluteFill>
    </Sequence>
  );
};

export const RenderComposition: React.FC<RenderInputProps> = ({
  trackItemIds,
  trackItemsMap,
  fps,
  size,
  background,
}) => {
  const bgColor = background?.type === 'color' ? background.value : '#000000';

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {trackItemIds.map((id) => {
        const item = trackItemsMap[id];
        if (!item) return null;
        return <TrackItemRenderer key={id} item={item} fps={fps} size={size} />;
      })}
    </AbsoluteFill>
  );
};
