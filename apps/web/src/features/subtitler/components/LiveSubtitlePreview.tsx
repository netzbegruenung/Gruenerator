import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import SubtitleStylingService from '../utils/subtitleStylingService';
import { useAuthStore } from '../../../stores/authStore';

const LiveSubtitlePreview = ({
  editableSubtitles,
  currentTimeInSeconds,
  videoMetadata,
  stylePreference = 'standard',
  heightPreference = 'tief',
  subtitlePreference = 'manual'
}) => {
  // Get user locale for Austria-specific styling
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const activeSegment = useMemo(() => {
    return SubtitleStylingService.findActiveSegment(editableSubtitles, currentTimeInSeconds);
  }, [editableSubtitles, currentTimeInSeconds]);

  const calculatedStyles = useMemo(() => {
    return SubtitleStylingService.calculateStyles(videoMetadata, editableSubtitles, subtitlePreference, stylePreference);
  }, [videoMetadata, editableSubtitles, subtitlePreference, stylePreference]);

  const getStyleForPreference = useMemo(() => {
    // Base styles - use GrueneType as default, Montserrat for Austrian users
    const baseStyles = {
      fontFamily: isAustrian ? "'Montserrat', Arial, sans-serif" : "'GrueneType', Arial, sans-serif",
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
          textShadow: 'none',
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
          // Use Austrian Green (#6baa25) for Austrian users, German Green (#005538) for German users
          backgroundColor: isAustrian ? '#6baa25' : '#005538',
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
          textShadow: 'none',
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
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 -1px 0 #000, 0 1px 0 #000, -1px 0 0 #000, 1px 0 0 #000',
          padding: '0.2em 0.4em',
          borderRadius: '0.1em'
        };
    }
  }, [stylePreference, isAustrian]);

  if (!activeSegment || !videoMetadata) {
    return null;
  }

  const { fontSize, marginL, marginR } = calculatedStyles;

  // Detect mobile devices
  const isMobile = window.innerWidth <= 768;

  // Fixed positioning matching backend: standard = 33% from bottom, tief = 20% from bottom
  const relativeMarginV = heightPreference === 'tief' ? 20 : 33;

  // Mobile-optimized font size calculation
  let relativeFontSize;
  if (isMobile) {
    relativeFontSize = Math.min(3.5, Math.max(2, (fontSize / videoMetadata.height) * 8));
  } else {
    relativeFontSize = videoMetadata.height > 0 ? (fontSize / videoMetadata.height) * 20 : 1.5;
  }

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
  }

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
  stylePreference: PropTypes.oneOf([
    'standard', 'clean', 'shadow', 'tanne',
    'gj_clean', 'gj_shadow', 'gj_lavendel', 'gj_hellgruen',
    'at_standard', 'at_clean', 'at_shadow', 'at_gruen'
  ]),
  heightPreference: PropTypes.oneOf(['standard', 'tief']),
  subtitlePreference: PropTypes.oneOf(['manual', 'word'])
};

export default LiveSubtitlePreview; 