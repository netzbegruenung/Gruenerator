import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import SubtitleStylingService from '../utils/subtitleStylingService';

const LiveSubtitlePreview = ({ 
  editableSubtitles, 
  currentTimeInSeconds, 
  videoMetadata
}) => {
  const activeSegment = useMemo(() => {
    const segment = SubtitleStylingService.findActiveSegment(editableSubtitles, currentTimeInSeconds);
    console.log('[LivePreview] Active segment search:', {
      currentTime: currentTimeInSeconds.toFixed(2),
      totalSegments: editableSubtitles.length,
      foundSegment: segment ? `"${segment.text.substring(0, 30)}..." (${segment.startTime}-${segment.endTime}s)` : 'none'
    });
    return segment;
  }, [editableSubtitles, currentTimeInSeconds]);

  const calculatedStyles = useMemo(() => {
    const styles = SubtitleStylingService.calculateStyles(videoMetadata, editableSubtitles);
    console.log('[LivePreview] Calculated styles:', styles);
    return styles;
  }, [videoMetadata, editableSubtitles]);

  console.log('[LivePreview] Render conditions:', {
    hasActiveSegment: !!activeSegment,
    hasVideoMetadata: !!videoMetadata,
    videoMetadata
  });

  if (!activeSegment || !videoMetadata) {
    return null;
  }

  const {
    fontSize,
    marginV,
    marginL,
    marginR,
    outline
  } = calculatedStyles;

  // Detect mobile devices
  const isMobile = window.innerWidth <= 768;

  // Calculate relative positioning based on display size vs original video size
  const relativeMarginV = videoMetadata.height > 0 ? (marginV / videoMetadata.height) * 100 : 33;
  
  // Mobile-optimized font size calculation
  let relativeFontSize;
  if (isMobile) {
    // On mobile, use a much smaller base size and limit the scaling
    relativeFontSize = Math.min(3.5, Math.max(2, (fontSize / videoMetadata.height) * 8));
  } else {
    relativeFontSize = videoMetadata.height > 0 ? (fontSize / videoMetadata.height) * 20 : 1.5;
  }
  
  console.log('[LivePreview] Position calculation:', {
    isMobile,
    originalMarginV: marginV,
    relativeMarginV: relativeMarginV,
    originalFontSize: fontSize,
    relativeFontSize: relativeFontSize,
    videoHeight: videoMetadata.height
  });

  const containerStyles = {
    position: 'absolute',
    bottom: `${relativeMarginV}%`,
    left: `${marginL}px`,
    right: `${marginR}px`,
    zIndex: 10,
    pointerEvents: 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end'
  };

  const textStyles = {
    fontSize: `${relativeFontSize}vw`, // Use viewport width for responsive sizing
    fontFamily: "'GrueneType', Arial, sans-serif",
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: '1.2',
    textShadow: isMobile ? 'none' : `
      -2px -2px 0 #000000,
      2px -2px 0 #000000,
      -2px 2px 0 #000000,
      2px 2px 0 #000000,
      0 0 4px #000000
    `,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: `0.2em 0.4em`,
    borderRadius: `0.1em`,
    maxWidth: '100%',
    wordWrap: 'break-word',
    hyphens: 'auto'
  };

  console.log('[LivePreview] Rendering subtitle:', {
    text: activeSegment.text,
    containerStyles,
    textStyles
  });

  return (
    <div className="live-subtitle-preview" style={containerStyles}>
      <div className="live-subtitle-text" style={textStyles}>
        {activeSegment.text}
      </div>
    </div>
  );
};

LiveSubtitlePreview.propTypes = {
  editableSubtitles: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    startTime: PropTypes.number.isRequired,
    endTime: PropTypes.number.isRequired,
    text: PropTypes.string.isRequired
  })).isRequired,
  currentTimeInSeconds: PropTypes.number.isRequired,
  videoMetadata: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    duration: PropTypes.number
  }),
};

export default LiveSubtitlePreview; 