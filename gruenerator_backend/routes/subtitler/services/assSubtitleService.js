const path = require('path');
const fs = require('fs').promises;
const redisClient = require('../../../utils/redisClient');
const { sanitizeFilename } = require('../../../utils/securityUtils');
const { createLogger } = require('../../../utils/logger.js');

const log = createLogger('assSubtitle');

class AssSubtitleService {
  constructor() {
    // Font paths for GrueneTypeNeue, GJFontRegular, and Montserrat (Austria)
    this.grueneTypeFontPath = path.resolve(__dirname, '../../../public/fonts/GrueneTypeNeue-Regular.ttf');
    this.gjFontPath = path.resolve(__dirname, '../../../public/fonts/GJFontRegular.ttf');
    this.montserratFontPath = path.resolve(__dirname, '../../../public/fonts/Montserrat-Bold.ttf');
    
    // Style mapping for locale-based automatic replacement
    this.localeStyleMapping = {
      'de-AT': {
        'standard': 'at_standard',
        'clean': 'at_clean',
        'shadow': 'at_shadow',
        'tanne': 'at_gruen'
      }
    };
  }

  /**
   * Get the correct font path based on style preference
   */
  getFontPathForStyle(stylePreference) {
    if (stylePreference?.startsWith('gj_')) {
      return this.gjFontPath;
    }
    if (stylePreference?.startsWith('at_')) {
      return this.montserratFontPath;
    }
    return this.grueneTypeFontPath;
  }

  /**
   * Map style preference to locale-specific style if needed
   * For Austrian users (de-AT), automatically maps German styles to Austria equivalents
   */
  mapStyleForLocale(stylePreference, locale) {
    if (locale === 'de-AT' && this.localeStyleMapping['de-AT'][stylePreference]) {
      const mappedStyle = this.localeStyleMapping['de-AT'][stylePreference];
      log.debug(`Locale mapping: ${stylePreference} → ${mappedStyle} for locale ${locale}`);
      return mappedStyle;
    }
    return stylePreference;
  }

  // Default style configuration
  get defaultStyle() {
    return {
      fontName: 'GrueneType Neue', // Must match TTF font family name exactly
      fontSize: 20,
      primaryColor: '&Hffffff', // White text
      secondaryColor: '&Hffffff', // White secondary
      outlineColor: '&H000000', // Black outline
      backColor: '&H80000000', // Semi-transparent black background
      bold: 0,
      italic: 0,
      underline: 0,
      strikeOut: 0,
      scaleX: 100,
      scaleY: 100,
      spacing: 0,
      angle: 0,
      borderStyle: 3, // Background box
      outline: 2, // Outline thickness
      shadow: 0,
      alignment: 2, // Bottom center
      marginL: 20,
      marginR: 20,
      marginV: 30 // Bottom margin
    };
  }

  /**
   * Convert RGB hex color to ASS BGR format
   */
  convertRgbToAssBgr(hexColor, alpha = 0x00) {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // ASS format: &H[AA][BB][GG][RR] where AA=alpha (00=opaque, FF=transparent)
    return `&H${alpha.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${r.toString(16).padStart(2,'0')}`.toUpperCase();
  }

  /**
   * Get hardcoded style preset - designed to match frontend preview exactly
   */
  getStylePreset(stylePreference = 'standard') {
    const baseStyle = { ...this.defaultStyle };
    
    switch (stylePreference) {
      case 'standard':
        // Klassischer Stil - schwarzer Hintergrund für beste Lesbarkeit
        return {
          ...baseStyle,
          backColor: '&HCC000000', // rgba(0, 0, 0, 0.8) - Semi-transparent black
          borderStyle: 3, // Background box
          outline: 1, // Minimal outline
          outlineColor: '&H000000', // Black outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff', // White secondary
          spacing: 1 // Character spacing adds horizontal padding effect
        };
        
      case 'clean':
        // Minimalistisch - klarer Text ohne Hintergrund, ohne Outline
        return {
          ...baseStyle,
          backColor: '&H00000000', // Transparent background
          borderStyle: 0, // No background box
          outline: 0, // No outline for pure minimalistic style
          outlineColor: '&H00000000', // Transparent outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff' // White secondary
        };
        
      case 'shadow':
        // Schatten-Effekt - eleganter Schlagschatten für moderne Optik
        return {
          ...baseStyle,
          backColor: '&H00000000', // Transparent background
          borderStyle: 0, // No background box
          outline: 0, // No outline - shadow provides contrast
          shadow: 3, // Shadow effect
          outlineColor: '&H80000000', // Semi-transparent black shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff' // White secondary
        };
        
      case 'tanne':
        // Grüner Stil - Markenfarbe für besondere Betonung
        const tanneColor = this.convertRgbToAssBgr('#005538', 0x00); // Fully opaque tanne
        const tanneOutline = this.convertRgbToAssBgr('#003825', 0x00); // Darker tanne for outline
        return {
          ...baseStyle,
          backColor: tanneColor, // Converted tanne color
          borderStyle: 3, // Background box
          outline: 1, // Minimal outline
          outlineColor: tanneOutline, // Darker tanne outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text for contrast
          secondaryColor: '&Hffffff', // White secondary
          spacing: 1 // Character spacing adds horizontal padding effect
        };

      // Grüne Jugend styles with GJFontRegular
      case 'gj_clean':
        // GJ Minimalistisch - transparent style with GJ font
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display', // Must match TTF font family name exactly
          backColor: '&H00000000', // Transparent background
          borderStyle: 0, // No background box
          outline: 0, // No outline for minimalistic style
          outlineColor: '&H00000000', // Transparent outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff' // White secondary
        };

      case 'gj_shadow':
        // GJ Schatten - shadow effect with GJ font
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display', // Must match TTF font family name exactly
          backColor: '&H00000000', // Transparent background
          borderStyle: 0, // No background box
          outline: 0, // No outline - shadow provides contrast
          shadow: 3, // Shadow effect
          outlineColor: '&H80000000', // Semi-transparent black shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff' // White secondary
        };

      case 'gj_lavendel':
        // GJ Lavendel - Grüne Jugend lavendel color (#9f88ff)
        const lavendelColor = this.convertRgbToAssBgr('#9f88ff', 0x00); // Lavendel color
        const lavendelOutline = this.convertRgbToAssBgr('#7d66cc', 0x00); // Darker lavendel for outline
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display', // Must match TTF font family name exactly
          backColor: lavendelColor, // Lavendel background
          borderStyle: 3, // Background box
          outline: 1, // Minimal outline
          outlineColor: lavendelOutline, // Darker lavendel outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text for contrast
          secondaryColor: '&Hffffff', // White secondary
          spacing: 1 // Character spacing adds horizontal padding effect
        };

      case 'gj_hellgruen':
        // GJ Hellgrün - Grüne Jugend light green color (#c7ff7a)
        const hellgruenColor = this.convertRgbToAssBgr('#c7ff7a', 0x00); // Light green color
        const hellgruenOutline = this.convertRgbToAssBgr('#9fcc5f', 0x00); // Darker green for outline
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display', // Must match TTF font family name exactly
          backColor: hellgruenColor, // Light green background
          borderStyle: 3, // Background box
          outline: 1, // Minimal outline
          outlineColor: hellgruenOutline, // Darker green outline
          shadow: 0, // No shadow
          primaryColor: '&H000000', // Black text for contrast on light background
          secondaryColor: '&H000000', // Black secondary
          spacing: 1 // Character spacing adds horizontal padding effect
        };

      // Grüne Österreich styles with Montserrat Bold
      case 'at_standard':
        // AT Klassisch - schwarzer Hintergrund mit Montserrat Bold
        return {
          ...baseStyle,
          fontName: 'Montserrat', // Must match TTF font family name exactly
          backColor: '&HCC000000', // rgba(0, 0, 0, 0.8) - Semi-transparent black
          borderStyle: 3, // Background box
          outline: 1, // Minimal outline
          outlineColor: '&H000000', // Black outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff', // White secondary
          spacing: 1 // Character spacing adds horizontal padding effect
        };

      case 'at_clean':
        // AT Minimalistisch - transparent style with Montserrat Bold
        return {
          ...baseStyle,
          fontName: 'Montserrat', // Must match TTF font family name exactly
          backColor: '&H00000000', // Transparent background
          borderStyle: 0, // No background box
          outline: 0, // No outline for minimalistic style
          outlineColor: '&H00000000', // Transparent outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff' // White secondary
        };

      case 'at_shadow':
        // AT Schatten - shadow effect with Montserrat Bold
        return {
          ...baseStyle,
          fontName: 'Montserrat', // Must match TTF font family name exactly
          backColor: '&H00000000', // Transparent background
          borderStyle: 0, // No background box
          outline: 0, // No outline - shadow provides contrast
          shadow: 3, // Shadow effect
          outlineColor: '&H80000000', // Semi-transparent black shadow
          primaryColor: '&Hffffff', // White text
          secondaryColor: '&Hffffff' // White secondary
        };

      case 'at_gruen':
        // AT Grün - Grüne Österreich brand green (#6baa25)
        const atGruenColor = this.convertRgbToAssBgr('#6baa25', 0x00); // Austrian Green
        const atGruenOutline = this.convertRgbToAssBgr('#4d7f1b', 0x00); // Darker green for outline
        return {
          ...baseStyle,
          fontName: 'Montserrat', // Must match TTF font family name exactly
          backColor: atGruenColor, // Austrian Green background
          borderStyle: 3, // Background box
          outline: 1, // Minimal outline
          outlineColor: atGruenOutline, // Darker green outline
          shadow: 0, // No shadow
          primaryColor: '&Hffffff', // White text for contrast
          secondaryColor: '&Hffffff', // White secondary
          spacing: 1 // Character spacing adds horizontal padding effect
        };

      default:
        return this.getStylePreset('standard');
    }
  }

  /**
   * Generate ASS content from subtitle segments
   * @param {Array} segments - Subtitle segments
   * @param {Object} videoMetadata - Video dimensions and metadata
   * @param {Object} styleOptions - Additional style overrides
   * @param {string} subtitlePreference - Subtitle mode (manual, word, etc.)
   * @param {string} stylePreference - Style preset name
   * @param {string} locale - User locale (de-DE, de-AT) for automatic style mapping
   * @param {string} heightPreference - Vertical position ('standard' or 'tief')
   */
  generateAssContent(segments, videoMetadata, styleOptions = {}, subtitlePreference = 'manual', stylePreference = 'standard', locale = 'de-DE', heightPreference = 'standard') {
    // Map style to locale-specific variant if needed (e.g., Austrian users get Austria styles)
    const effectiveStyle = this.mapStyleForLocale(stylePreference, locale);

    // Get the appropriate style preset
    const presetStyle = this.getStylePreset(effectiveStyle);
    const style = { ...presetStyle, ...styleOptions };

    // Calculate dynamic font size based on video resolution, mode, and style preference
    const fontSize = this.calculateFontSize(videoMetadata, style.fontSize, subtitlePreference, effectiveStyle);
    style.fontSize = fontSize;

    log.debug(`Using style preset: ${effectiveStyle} (original: ${stylePreference}, locale: ${locale})`);


    const header = this.generateAssHeader(videoMetadata);
    const stylesSection = this.generateStylesSection(style);
    const eventsSection = this.generateEventsSection(segments, subtitlePreference, effectiveStyle, videoMetadata, heightPreference);

    return {
      content: `${header}\n${stylesSection}\n${eventsSection}`,
      effectiveStyle // Return the effective style so controller knows which font to use
    };
  }

  /**
   * Calculate optimal font size based on video metadata and style preference
   */
  calculateFontSize(metadata, baseFontSize, subtitlePreference = 'manual', stylePreference = 'standard') {
    const { width, height } = metadata;
    const referenceDimension = Math.min(width, height);
    
    let fontSize;
    if (referenceDimension >= 2160) {
      fontSize = Math.floor(baseFontSize * 3.6); // 4K (reduced 10%)
    } else if (referenceDimension >= 1440) {
      fontSize = Math.floor(baseFontSize * 2.9); // 2K (reduced 10%)
    } else if (referenceDimension >= 1080) {
      fontSize = Math.floor(baseFontSize * 2.5); // FullHD (reduced 10%)
    } else if (referenceDimension >= 720) {
      fontSize = Math.floor(baseFontSize * 1.8); // HD (reduced 10%)
    } else {
      fontSize = Math.floor(baseFontSize * 2.0); // SD (unchanged)
    }

    // For manual mode, increase font size by 20% since lines are shorter (fewer words per segment)
    if (subtitlePreference === 'manual') {
      fontSize = Math.floor(fontSize * 1.2);
    }

    // For GJ styles, reduce font size by 30% since GJFontRegular appears much larger than GrueneType
    const isGjStyle = stylePreference?.startsWith('gj_');
    if (isGjStyle) {
      fontSize = Math.floor(fontSize * 0.70);
    }

    // For AT (Austria) styles, adjust font size since Montserrat Bold has different metrics
    const isAtStyle = stylePreference?.startsWith('at_');
    if (isAtStyle) {
      fontSize = Math.floor(fontSize * 0.85);
    }
    
    // COMMENTED OUT - Word mode functionality (TikTok style):
    /*
    else if (subtitlePreference === 'word') {
      fontSize = Math.floor(fontSize * 1.35);
      console.log(`[ASS] Word mode: increased font size by 35% to ${fontSize}px for individual word highlighting`);
    }
    */
    
    // UNUSED: Other subtitle modes are commented out - only manual mode is used
    /*
    else if (subtitlePreference === 'short') {
      // Short mode logic would go here
    } else if (subtitlePreference === 'standard') {
      // Standard mode logic would go here  
    }
    */

    // Erweiterte Grenzen für ASS
    return Math.max(24, Math.min(300, fontSize));
  }

  /**
   * Generate ASS file header
   */
  generateAssHeader(videoMetadata) {
    return `[Script Info]
!: This file was created by Gruenerator
Title: Gruenerator Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: ${videoMetadata.width}
PlayResY: ${videoMetadata.height}
!: UTF-8 encoding for German umlauts
Collisions: Normal
ScriptType: v4.00+

[Aegisub Project]
Last Style Storage: Default
Audio File: 
Video File: 
Video AR Mode: 4
Video AR Value: ${(videoMetadata.width / videoMetadata.height).toFixed(6)}
Video Zoom Percent: 1.000000
Scroll Position: 0
Active Line: 0
Video Position: 0`;
  }

  /**
   * Generate styles section with proper style preset implementation
   */
  generateStylesSection(style) {
    const formatLine = [
      'Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour',
      'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut',
      'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline',
      'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV'
    ].join(',');

    // Use the style preset exactly as provided - no overrides
    const finalStyle = { ...style };

    const styleLine = [
      'Default', finalStyle.fontName, finalStyle.fontSize, finalStyle.primaryColor,
      finalStyle.secondaryColor, finalStyle.outlineColor, finalStyle.backColor, finalStyle.bold,
      finalStyle.italic, finalStyle.underline, finalStyle.strikeOut, finalStyle.scaleX, finalStyle.scaleY,
      finalStyle.spacing, finalStyle.angle, finalStyle.borderStyle, finalStyle.outline, finalStyle.shadow,
      finalStyle.alignment, finalStyle.marginL, finalStyle.marginR, finalStyle.marginV
    ].join(',');

    return `[V4+ Styles]
Format: ${formatLine}
Style: ${styleLine}`;
  }

  /**
   * COMMENTED OUT - Process text for word mode (individual word highlighting)
   * TikTok-style functionality disabled
   */
  /*
  processWordModeText(segment, index) {
    // For word mode, keep text simple and clean
    let text = segment.text;
    
    // Use the highlight metadata from the word highlight service
    const isHighlight = segment.isHighlight || false;
    
    // Add special ASS styling for highlighted words
    if (isHighlight) {
      // Use bold styling for highlighted words in TikTok style
      text = `{\\b1}${text}{\\b0}`;
      console.log(`[ASS] Applied highlight styling to word: "${text}"`);
    } else {
      // For static words, use slightly dimmed styling
      text = `{\\alpha&H40}${text}{\\alpha&H00}`;
    }
    
    return text;
  }
  */

  /**
   * Add horizontal padding to text for background box styles
   */
  addHorizontalPadding(text, stylePreference) {
    // Only add padding for styles with background boxes
    if (stylePreference === 'standard' || stylePreference === 'tanne' ||
        stylePreference === 'gj_lavendel' || stylePreference === 'gj_hellgruen' ||
        stylePreference === 'at_standard' || stylePreference === 'at_gruen') {
      // Add thin spaces for subtle padding
      return `\u2009${text}\u2009`; // Thin space (U+2009) for minimal padding
    }
    return text; // No padding for clean/shadow styles (including gj_clean, gj_shadow, at_clean, at_shadow)
  }

  /**
   * Generate events section with dialogue lines
   */
  generateEventsSection(segments, subtitlePreference = 'manual', stylePreference = 'standard', videoMetadata = {}, heightPreference = 'standard') {
    const { width: videoWidth = 1920, height: videoHeight = 1080 } = videoMetadata;

    // Calculate fixed position for subtitle center point based on heightPreference
    // standard = 33% from bottom = 67% down the screen
    // tief = 20% from bottom = 80% down the screen
    const centerX = Math.round(videoWidth / 2);
    const subtitleY = heightPreference === 'tief'
      ? Math.round(videoHeight * 0.80)
      : Math.round(videoHeight * 0.67);
    const formatLine = 'Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text';
    
    const dialogueLines = segments.map((segment, index) => {
      const startTime = this.formatAssTime(segment.startTime);
      const endTime = this.formatAssTime(segment.endTime);
      let text = segment.text;
      
      // For manual mode, add automatic line breaking for better readability
      if (subtitlePreference === 'manual') {
        text = this.addLineBreaksForManualMode(text);
      }
      
      // COMMENTED OUT - Word mode handling (TikTok style functionality):
      /*
      else if (subtitlePreference === 'word') {
        text = this.processWordModeText(segment, index);
      }
      */
      
      // UNUSED: Other subtitle modes are commented out - only manual mode is used
      /*
      else if (subtitlePreference === 'short') {
        // Short mode text processing would go here
      } else if (subtitlePreference === 'standard') {
        // Standard mode text processing would go here
      }
      */
      
      // Add horizontal padding for background box styles
      text = this.addHorizontalPadding(text, stylePreference);

      const escapedText = this.escapeAssText(text);

      // Use \an5 (center anchor) + \pos for precise positioning
      // \an5 anchors at visual center of text block - works for any line count
      // \pos places that center at fixed screen position (bottom 12%)
      const positionedText = `{\\an5\\pos(${centerX},${subtitleY})}${escapedText}`;

      return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${positionedText}`;
    }).join('\n');

    return `[Events]
Format: ${formatLine}
${dialogueLines}`;
  }

  /**
   * Format time for ASS (H:MM:SS.cc)
   */
  formatAssTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);

    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }

  /**
   * Add intelligent line breaks for manual mode subtitles using adaptive linguistic breaking
   */
  addLineBreaksForManualMode(text) {
    // Trigger: Break into 2 lines for 4+ words or long text to fit screen
    const shouldBreak = text.length > 30 || text.split(' ').length >= 4;
    
    if (!shouldBreak) {
      return text; // Keep as single line for short segments
    }
    
    const words = text.split(' ');
    if (words.length <= 2) {
      return text; // Too few words to break meaningfully
    }
    
    // Find optimal break point using linguistic analysis
    const breakResult = this.findOptimalLineBreak(words, text);
    
    if (breakResult.shouldBreak) {
      const firstLine = words.slice(0, breakResult.breakIndex).join(' ');
      const secondLine = words.slice(breakResult.breakIndex).join(' ');
      return `${firstLine}\n${secondLine}`;
    }
    
    return text; // Return original if no good break point found
  }

  /**
   * Finds optimal line break point aiming for balanced 50/50 split
   * Only adjusts for punctuation (commas, semicolons) - not for articles/prepositions
   */
  findOptimalLineBreak(words, text) {
    // Target: 50/50 split for balanced readability
    const totalLength = text.length;
    const targetSplitPoint = totalLength / 2;

    // Find the word boundary closest to the 50% character position
    let bestBreakIndex = -1;
    let bestDistance = Infinity;

    let charCount = 0;
    for (let i = 0; i < words.length - 1; i++) {
      charCount += words[i].length + 1; // +1 for space
      const distance = Math.abs(charCount - targetSplitPoint);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestBreakIndex = i + 1;
      }
    }

    // Only adjust for punctuation - break after commas/semicolons if nearby
    const searchRadius = 1;
    for (let offset = 0; offset <= searchRadius; offset++) {
      for (const delta of [0, -offset, offset]) {
        const checkIndex = bestBreakIndex + delta;
        if (checkIndex > 0 && checkIndex < words.length) {
          const prevWord = words[checkIndex - 1];
          if (prevWord && prevWord.match(/[,;:]$/)) {
            bestBreakIndex = checkIndex;
            break;
          }
        }
      }
    }

    // Final validation: both lines must have content
    if (bestBreakIndex <= 0 || bestBreakIndex >= words.length) {
      return { shouldBreak: false, reason: 'invalid break index' };
    }

    const finalFirstLine = words.slice(0, bestBreakIndex).join(' ');
    const finalSecondLine = words.slice(bestBreakIndex).join(' ');

    // Ensure both lines have reasonable content
    if (finalFirstLine.length < 3 || finalSecondLine.length < 3) {
      return { shouldBreak: false, reason: 'lines too short' };
    }

    return {
      shouldBreak: true,
      breakIndex: bestBreakIndex,
      reason: 'balanced split',
      ratio: `${finalFirstLine.length}:${finalSecondLine.length} chars`
    };
  }

  /**
   * Escape text for ASS format while preserving German umlauts
   */
  escapeAssText(text) {
    // Ensure text is properly encoded as UTF-8 string
    const utf8Text = Buffer.from(text, 'utf8').toString('utf8');
    
    return utf8Text
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\N')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      // Preserve German umlauts explicitly
      .replace(/ä/g, 'ä')
      .replace(/ö/g, 'ö')
      .replace(/ü/g, 'ü')
      .replace(/Ä/g, 'Ä')
      .replace(/Ö/g, 'Ö')
      .replace(/Ü/g, 'Ü')
      .replace(/ß/g, 'ß');
  }

  /**
   * Create temporary ASS file and return path with proper UTF-8 encoding
   */
  async createTempAssFile(assContent, uploadId) {
    const tempDir = path.join(__dirname, '../../../uploads/temp');
    await fs.mkdir(tempDir, { recursive: true });

    // Security: Sanitize uploadId to prevent path traversal and special character injection
    const safeUploadId = sanitizeFilename(uploadId, 'unknown');
    const assFilePath = path.join(tempDir, `subtitles_${safeUploadId}_${Date.now()}.ass`);
    
    // Ensure proper UTF-8 encoding with BOM for better FFmpeg compatibility
    const utf8BOM = '\uFEFF'; // UTF-8 BOM
    const contentWithBOM = utf8BOM + assContent;
    
    await fs.writeFile(assFilePath, contentWithBOM, { encoding: 'utf8' });

    log.debug(`Created ASS file: ${assFilePath}`);

    return assFilePath;
  }

  /**
   * Get cached ASS content from Redis
   */
  async getCachedAssContent(cacheKey) {
    // TEMPORARILY DISABLED FOR DEBUGGING
    return null;
    
    /* try {
      const content = await redisClient.get(`ass:${cacheKey}`);
      if (content) {
        console.log(`[AssSubtitleService] Retrieved cached ASS: ass:${cacheKey}`);
      }
      return content;
    } catch (error) {
      console.warn('[AssSubtitleService] Redis retrieval error:', error.message);
      return null;
    } */
  }

  /**
   * Cache ASS content in Redis
   */
  async cacheAssContent(cacheKey, assContent) {
    // TEMPORARILY DISABLED FOR DEBUGGING
    log.debug(`Cache disabled - skipping cache for: ass:${cacheKey}`);
    return;
    
    /* try {
      await redisClient.set(`ass:${cacheKey}`, assContent, { EX: 60 * 60 * 2 }); // 2 hours
      console.log(`[AssSubtitleService] Cached ASS content: ass:${cacheKey}`);
    } catch (error) {
      console.warn('[AssSubtitleService] Redis cache error:', error.message);
    } */
  }

  /**
   * Cleanup temporary ASS file
   */
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      log.debug(`Cleaned up temp file: ${filePath}`);
    } catch (error) {
      log.warn(`Cleanup warning: ${error.message}`);
    }
  }
}

module.exports = AssSubtitleService; 