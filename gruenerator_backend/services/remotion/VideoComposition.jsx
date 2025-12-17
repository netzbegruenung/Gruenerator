import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, Video, OffthreadVideo, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';

// Font face CSS for custom fonts - using staticFile to reference bundled fonts
const fontFaceCSS = `
@font-face {
  font-family: 'GrueneTypeNeue';
  src: url('${staticFile('fonts/GrueneTypeNeue-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'GrueneType Neue';
  src: url('${staticFile('fonts/GrueneTypeNeue-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'PTSans';
  src: url('${staticFile('fonts/PTSans-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'PT Sans';
  src: url('${staticFile('fonts/PTSans-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'PTSans';
  src: url('${staticFile('fonts/PTSans-Bold.ttf')}') format('truetype');
  font-weight: bold;
  font-style: normal;
}
@font-face {
  font-family: 'GJFontRegular';
  src: url('${staticFile('fonts/GJFontRegular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'Montserrat';
  src: url('${staticFile('fonts/Montserrat-Bold.ttf')}') format('truetype');
  font-weight: bold;
  font-style: normal;
}
`;

const parseSubtitleTime = (timeStr) => {
  const match = timeStr.match(/(\d+):(\d{2})\.(\d)/);
  if (!match) return 0;
  const [, mins, secs, tenths] = match;
  return parseInt(mins) * 60 + parseInt(secs) + parseInt(tenths) / 10;
};

const parseSubtitles = (subtitleString) => {
  if (!subtitleString) return [];

  return subtitleString.split('\n\n')
    .map((block) => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return null;

      const timeLine = lines[0];
      const text = lines.slice(1).join(' ');
      const timeMatch = timeLine.match(/(\d+:\d{2}\.\d)\s*-\s*(\d+:\d{2}\.\d)/);

      if (!timeMatch) return null;

      return {
        startTime: parseSubtitleTime(timeMatch[1]),
        endTime: parseSubtitleTime(timeMatch[2]),
        text
      };
    })
    .filter(Boolean);
};

const TEXT_OVERLAY_STYLES = {
  header: {
    fontFamily: "'GrueneTypeNeue', 'GrueneType Neue', Arial, sans-serif",
    fontSize: 48,
    fontWeight: 700,
    color: '#ffffff',
    textShadow: '2px 2px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)',
    whiteSpace: 'pre-wrap',
    letterSpacing: 'normal',
    lineHeight: 1.2
  },
  subheader: {
    fontFamily: "'PTSans', 'PT Sans', Arial, sans-serif",
    fontSize: 32,
    fontWeight: 400,
    color: '#ffffff',
    textShadow: '1px 1px 3px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.4)',
    whiteSpace: 'pre-wrap',
    letterSpacing: 'normal',
    lineHeight: 1.2
  }
};

const VideoComposition = ({
  clips = {},
  segments = [],
  subtitles = '',
  stylePreference = 'shadow',
  textOverlays = [],
  videoWidth = 1920,
  videoHeight = 1080
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const parsedSubtitles = useMemo(() => parseSubtitles(subtitles), [subtitles]);

  const getClipUrl = useMemo(() => {
    if (clips && Object.keys(clips).length > 0) {
      return (clipId) => {
        const clip = clips[clipId];
        if (!clip) return null;

        // Prefer url (HTTP URL from internal-video endpoint)
        if (clip.url) return clip.url;

        return null;
      };
    }
    return () => null;
  }, [clips]);

  const getSubtitleStyle = useMemo(() => {
    const baseStyle = {
      color: '#fff',
      fontSize: '1.5em',
      fontWeight: 700,
      lineHeight: 1.3,
      fontFamily: "'GrueneTypeNeue', Arial, sans-serif"
    };

    const gjBaseStyle = {
      ...baseStyle,
      fontFamily: "'GJFontRegular', Arial, sans-serif",
      fontWeight: 'normal'
    };

    const atBaseStyle = {
      ...baseStyle,
      fontFamily: "'Montserrat', Arial, sans-serif"
    };

    switch (stylePreference) {
      case 'clean':
        return { ...baseStyle, textShadow: 'none' };

      case 'gj_clean':
        return { ...gjBaseStyle, textShadow: 'none' };

      case 'at_clean':
        return { ...atBaseStyle, textShadow: 'none' };

      case 'shadow':
        return {
          ...baseStyle,
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6)'
        };

      case 'gj_shadow':
        return {
          ...gjBaseStyle,
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6)'
        };

      case 'at_shadow':
        return {
          ...atBaseStyle,
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6)'
        };

      case 'tanne':
        return {
          ...baseStyle,
          backgroundColor: '#005538',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em',
          textShadow: 'none'
        };

      case 'at_gruen':
        return {
          ...atBaseStyle,
          backgroundColor: '#6baa25',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em',
          textShadow: 'none'
        };

      case 'gj_lavendel':
        return {
          ...gjBaseStyle,
          backgroundColor: '#9f88ff',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em',
          textShadow: 'none'
        };

      case 'gj_hellgruen':
        return {
          ...gjBaseStyle,
          color: '#000',
          backgroundColor: '#c7ff7a',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em',
          textShadow: 'none'
        };

      case 'at_standard':
        return {
          ...atBaseStyle,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em'
        };

      case 'standard':
      default:
        return {
          ...baseStyle,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em'
        };
    }
  }, [stylePreference]);

  if (!segments || segments.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#1a1a1a' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#666'
        }}>
          Kein Video geladen
        </div>
      </AbsoluteFill>
    );
  }

  const getCurrentOriginalTime = () => {
    let accumulatedFrames = 0;
    for (const segment of segments) {
      const segmentDurationSeconds = segment.end - segment.start;
      const segmentDurationFrames = Math.round(segmentDurationSeconds * fps);

      if (frame >= accumulatedFrames && frame < accumulatedFrames + segmentDurationFrames) {
        const frameInSegment = frame - accumulatedFrames;
        const timeInSegment = frameInSegment / fps;
        return segment.start + timeInSegment;
      }
      accumulatedFrames += segmentDurationFrames;
    }
    return 0;
  };

  const currentOriginalTime = getCurrentOriginalTime();
  const currentSubtitle = parsedSubtitles.find(
    sub => currentOriginalTime >= sub.startTime && currentOriginalTime < sub.endTime
  );

  let accumulatedFrames = 0;

  return (
    <AbsoluteFill style={{
      backgroundColor: '#000',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      textRendering: 'optimizeLegibility'
    }}>
      {/* Inject font-face CSS */}
      <style dangerouslySetInnerHTML={{ __html: fontFaceCSS }} />

      {segments.map((segment) => {
        const clipUrl = getClipUrl(segment.clipId);
        if (!clipUrl) return null;

        const clip = clips[segment.clipId];
        const clipFps = clip?.fps || fps;

        const segmentDurationSeconds = segment.end - segment.start;
        const segmentDurationFrames = Math.round(segmentDurationSeconds * fps);
        const startFrame = accumulatedFrames;

        accumulatedFrames += segmentDurationFrames;

        return (
          <Sequence
            key={segment.id}
            from={startFrame}
            durationInFrames={segmentDurationFrames}
          >
            <OffthreadVideo
              src={clipUrl}
              startFrom={Math.round(segment.start * clipFps)}
              endAt={Math.round(segment.end * clipFps)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          </Sequence>
        );
      })}

      {currentSubtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '90%',
            textAlign: 'center'
          }}
        >
          <span style={getSubtitleStyle}>
            {currentSubtitle.text}
          </span>
        </div>
      )}

      {textOverlays.map((overlay) => {
        const isVisible = currentOriginalTime >= overlay.startTime && currentOriginalTime < overlay.endTime;
        if (!isVisible) return null;

        const overlayStyle = TEXT_OVERLAY_STYLES[overlay.type] || TEXT_OVERLAY_STYLES.header;

        const scaledFontSize = overlay.type === 'header'
          ? Math.round(48 * (videoHeight / 1080))
          : Math.round(32 * (videoHeight / 1080));

        return (
          <div
            key={overlay.id}
            style={{
              position: 'absolute',
              top: `${overlay.yPosition}%`,
              left: `${overlay.xPosition || 50}%`,
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              width: `${overlay.width || 60}%`,
              maxWidth: '90%',
              pointerEvents: 'none',
              ...overlayStyle,
              fontSize: scaledFontSize
            }}
          >
            {overlay.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export default VideoComposition;
