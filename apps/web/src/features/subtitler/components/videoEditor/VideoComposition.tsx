import { AbsoluteFill, Sequence, Video, useCurrentFrame, useVideoConfig } from 'remotion';
import PropTypes from 'prop-types';
import { useMemo } from 'react';

/**
 * Parse subtitle time string "M:SS.F" to seconds
 */
const parseSubtitleTime = (timeStr) => {
  const match = timeStr.match(/(\d+):(\d{2})\.(\d)/);
  if (!match) return 0;
  const [, mins, secs, tenths] = match;
  return parseInt(mins) * 60 + parseInt(secs) + parseInt(tenths) / 10;
};

/**
 * Parse subtitle string into array of {startTime, endTime, text}
 */
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
    fontSize: '48px',
    fontWeight: '700',
    color: '#ffffff',
    textShadow: '2px 2px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)',
    whiteSpace: 'pre-wrap',
    letterSpacing: 'normal',
    lineHeight: 1.2
  },
  subheader: {
    fontFamily: "'PTSans', 'PT Sans', Arial, sans-serif",
    fontSize: '32px',
    fontWeight: '400',
    color: '#ffffff',
    textShadow: '1px 1px 3px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.4)',
    whiteSpace: 'pre-wrap',
    letterSpacing: 'normal',
    lineHeight: 1.2
  }
};

/**
 * Multi-Clip Video Composition
 * Renders video segments in sequence using Remotion primitives
 * Each segment references a clip from the clips registry
 */
const VideoComposition = ({ clips, segments, subtitles, stylePreference = 'shadow', videoUrl, textOverlays = [], selectedOverlayId = null, editingOverlayId = null }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const parsedSubtitles = useMemo(() => parseSubtitles(subtitles), [subtitles]);

  // For backward compatibility: if no clips provided but videoUrl exists, create a default clip lookup
  const getClipUrl = useMemo(() => {
    if (clips && Object.keys(clips).length > 0) {
      return (clipId) => clips[clipId]?.url || null;
    }
    // Fallback for legacy single-video mode
    return () => videoUrl;
  }, [clips, videoUrl]);

  const getSubtitleStyle = useMemo(() => {
    const baseStyle = {
      color: '#fff',
      fontSize: '1.5em',
      fontWeight: '700',
      lineHeight: 1.3,
      fontFamily: "'GrueneType', Arial, sans-serif"
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

  // Check for valid clips or fallback videoUrl
  const hasClips = clips && Object.keys(clips).length > 0;
  const hasValidSource = hasClips || videoUrl;

  if (!hasValidSource || !segments || segments.length === 0) {
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

  // Calculate current original video time from composed frame
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
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {segments.map((segment, index) => {
        const clipUrl = getClipUrl(segment.clipId);
        if (!clipUrl) return null;

        // Get clip-specific fps or use composition fps
        const clip = hasClips ? clips[segment.clipId] : null;
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
            <Video
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
        if (overlay.id === editingOverlayId) return null;

        const overlayStyle = TEXT_OVERLAY_STYLES[overlay.type] || TEXT_OVERLAY_STYLES.header;
        const isSelected = selectedOverlayId === overlay.id;

        return (
          <div
            key={overlay.id}
            data-overlay-id={overlay.id}
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
              ...(isSelected ? {
                outline: '2px solid var(--klee, #46962b)',
                outlineOffset: '4px',
                borderRadius: '4px'
              } : {})
            }}
          >
            {overlay.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

VideoComposition.propTypes = {
  clips: PropTypes.objectOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    url: PropTypes.string.isRequired,
    duration: PropTypes.number,
    fps: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
    name: PropTypes.string,
    color: PropTypes.string
  })),
  segments: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    clipId: PropTypes.string,
    start: PropTypes.number.isRequired,
    end: PropTypes.number.isRequired
  })),
  subtitles: PropTypes.string,
  stylePreference: PropTypes.string,
  videoUrl: PropTypes.string,
  textOverlays: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    type: PropTypes.oneOf(['header', 'subheader']).isRequired,
    text: PropTypes.string.isRequired,
    yPosition: PropTypes.number.isRequired,
    startTime: PropTypes.number.isRequired,
    endTime: PropTypes.number.isRequired
  })),
  selectedOverlayId: PropTypes.number,
  editingOverlayId: PropTypes.number
};

export default VideoComposition;
