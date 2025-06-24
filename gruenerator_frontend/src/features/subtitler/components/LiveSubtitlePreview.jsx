import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import SubtitleStylingService from '../utils/subtitleStylingService';

const LiveSubtitlePreview = ({ 
  editableSubtitles, 
  currentTimeInSeconds, 
  videoMetadata,
  stylePreference = 'standard',
  heightPreference = 'standard'
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

  const getStyleForPreference = useMemo(() => {
    const baseStyles = {
      fontFamily: "'GrueneType', Arial, sans-serif",
      fontWeight: 'bold',
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: '1.2',
      maxWidth: '100%',
      wordWrap: 'break-word',
      hyphens: 'auto'
    };

    switch (stylePreference) {
      case 'clean':
        return {
          ...baseStyles,
          backgroundColor: 'transparent',
          textShadow: `
            -2px -2px 0 #000000,
            2px -2px 0 #000000,
            -2px 2px 0 #000000,
            2px 2px 0 #000000
          `,
          padding: '0',
          borderRadius: '0'
        };
      
      case 'shadow':
        return {
          ...baseStyles,
          backgroundColor: 'transparent',
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6)',
          padding: '0',
          borderRadius: '0'
        };
      
      case 'tanne':
        return {
          ...baseStyles,
          backgroundColor: '#005538', // --secondary-600 value
          textShadow: 'none',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em'
        };

      // Grüne Jugend styles with GJFontRegular
      case 'gj_clean':
        return {
          ...baseStyles,
          fontFamily: "'GJFontRegular', Arial, sans-serif",
          fontWeight: 'normal',
          backgroundColor: 'transparent',
          textShadow: `
            -2px -2px 0 #000000,
            2px -2px 0 #000000,
            -2px 2px 0 #000000,
            2px 2px 0 #000000
          `,
          padding: '0',
          borderRadius: '0'
        };

      case 'gj_shadow':
        return {
          ...baseStyles,
          fontFamily: "'GJFontRegular', Arial, sans-serif",
          fontWeight: 'normal',
          backgroundColor: 'transparent',
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6)',
          padding: '0',
          borderRadius: '0'
        };

      case 'gj_lavendel':
        return {
          ...baseStyles,
          fontFamily: "'GJFontRegular', Arial, sans-serif",
          fontWeight: 'normal',
          backgroundColor: '#9f88ff', // Lavendel color
          color: '#ffffff',
          textShadow: 'none',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em'
        };

      case 'gj_hellgruen':
        return {
          ...baseStyles,
          fontFamily: "'GJFontRegular', Arial, sans-serif",
          fontWeight: 'normal',
          backgroundColor: '#c7ff7a', // Light green color
          color: '#000000', // Black text for contrast on light background
          textShadow: 'none',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em'
        };
      
      case 'standard':
      default:
        return {
          ...baseStyles,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          textShadow: `
            -2px -2px 0 #000000,
            2px -2px 0 #000000,
            -2px 2px 0 #000000,
            2px 2px 0 #000000
          `,
          padding: '0.2em 0.4em',
          borderRadius: '0.1em'
        };
    }
  }, [stylePreference]);

  console.log('[LivePreview] Render conditions:', {
    hasActiveSegment: !!activeSegment,
    hasVideoMetadata: !!videoMetadata,
    stylePreference,
    videoMetadata
  });

  if (!activeSegment || !videoMetadata) {
    return null;
  }

  const {
    fontSize,
    marginV,
    marginL,
    marginR
  } = calculatedStyles;

  // Detect mobile devices
  const isMobile = window.innerWidth <= 768;

  // Calculate relative positioning based on display size vs original video size and height preference
  let baseMarginVPercentage = videoMetadata.height > 0 ? (marginV / videoMetadata.height) * 100 : 33;
  
  // Adjust positioning based on height preference
  if (heightPreference === 'tief') {
    // Move subtitles deeper (closer to bottom) for 'tief' option
    baseMarginVPercentage = baseMarginVPercentage * 0.6; // Reduce bottom margin by 40%
  }
  
  const relativeMarginV = baseMarginVPercentage;
  
  // Mobile-optimized font size calculation
  let relativeFontSize;
  if (isMobile) {
    relativeFontSize = Math.min(3.5, Math.max(2, (fontSize / videoMetadata.height) * 8));
  } else {
    relativeFontSize = videoMetadata.height > 0 ? (fontSize / videoMetadata.height) * 20 : 1.5;
  }
  
  console.log('[LivePreview] Position calculation:', {
    isMobile,
    originalMarginV: marginV,
    baseMarginVPercentage: baseMarginVPercentage,
    relativeMarginV: relativeMarginV,
    originalFontSize: fontSize,
    relativeFontSize: relativeFontSize,
    videoHeight: videoMetadata.height,
    stylePreference,
    heightPreference
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
    ...getStyleForPreference,
    fontSize: `${relativeFontSize}vw`
  };

  // Mobile specific adjustments
  if (isMobile) {
    textStyles.fontSize = 'clamp(14px, 3vw, 18px)';
    textStyles.lineHeight = '1.1';
    
    // Remove some effects on mobile for better performance
    if (stylePreference === 'clean' || stylePreference === 'standard' || 
        stylePreference === 'gj_clean') {
      textStyles.textShadow = 'none';
    }
  }

  console.log('[LivePreview] Rendering subtitle:', {
    text: activeSegment.text,
    containerStyles,
    textStyles,
    stylePreference
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
  stylePreference: PropTypes.oneOf(['standard', 'clean', 'shadow', 'tanne', 'gj_clean', 'gj_shadow', 'gj_lavendel', 'gj_hellgruen']),
  heightPreference: PropTypes.oneOf(['standard', 'tief'])
};

export default LiveSubtitlePreview; 