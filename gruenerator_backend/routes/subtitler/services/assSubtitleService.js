const path = require('path');
const fs = require('fs').promises;
const redisClient = require('../../../utils/redisClient');

class AssSubtitleService {
  constructor() {
    // Font path for GrueneType
    this.fontPath = path.resolve(__dirname, '../../../public/fonts/GrueneType.ttf');
    
    this.defaultStyle = {
      fontName: 'GrueneType Black Condensed Italic', // Full font name from TTF file
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
        console.log(`[ASS] Tanne color conversion: #005538 → ${tanneColor}`);
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
        
      default:
        return this.getStylePreset('standard');
    }
  }

  /**
   * Generate ASS content from subtitle segments
   */
  generateAssContent(segments, videoMetadata, styleOptions = {}, subtitlePreference = 'manual', stylePreference = 'standard') {
    // Get the appropriate style preset
    const presetStyle = this.getStylePreset(stylePreference);
    const style = { ...presetStyle, ...styleOptions };
    
    // Calculate dynamic font size based on video resolution and mode
    const fontSize = this.calculateFontSize(videoMetadata, style.fontSize, subtitlePreference);
    style.fontSize = fontSize;

    console.log(`[AssSubtitleService] Using style preset: ${stylePreference}`, {
      backColor: style.backColor,
      borderStyle: style.borderStyle,
      outline: style.outline,
      shadow: style.shadow
    });

    const header = this.generateAssHeader(videoMetadata);
    const stylesSection = this.generateStylesSection(style);
    const eventsSection = this.generateEventsSection(segments, subtitlePreference, stylePreference);

    return `${header}\n${stylesSection}\n${eventsSection}`;
  }

  /**
   * Calculate optimal font size based on video metadata
   */
  calculateFontSize(metadata, baseFontSize, subtitlePreference = 'manual') {
    const { width, height } = metadata;
    const referenceDimension = Math.min(width, height);
    
    let fontSize;
    if (referenceDimension >= 2160) {
      fontSize = Math.floor(baseFontSize * 5.0); // 4K - Erhöht für bessere Sichtbarkeit
    } else if (referenceDimension >= 1440) {
      fontSize = Math.floor(baseFontSize * 4.0); // 2K
    } else if (referenceDimension >= 1080) {
      fontSize = Math.floor(baseFontSize * 3.5); // FullHD
    } else if (referenceDimension >= 720) {
      fontSize = Math.floor(baseFontSize * 2.5); // HD
    } else {
      fontSize = Math.floor(baseFontSize * 2.0); // SD
    }

    // For manual mode, increase font size by 20% since lines are shorter (fewer words per segment)
    if (subtitlePreference === 'manual') {
      fontSize = Math.floor(fontSize * 1.2);
      console.log(`[ASS] Manual mode: increased font size by 20% to ${fontSize}px for shorter segments`);
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

    console.log(`[ASS] Applied style configuration:`, {
      stylePreset: 'user-selected',
      backColor: finalStyle.backColor,
      borderStyle: finalStyle.borderStyle,
      outline: finalStyle.outline,
      shadow: finalStyle.shadow,
      outlineColor: finalStyle.outlineColor,
      primaryColor: finalStyle.primaryColor
    });

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
    if (stylePreference === 'standard' || stylePreference === 'tanne') {
      // Add thin spaces for subtle padding
      return `\u2009${text}\u2009`; // Thin space (U+2009) for minimal padding
    }
    return text; // No padding for clean/shadow styles
  }

  /**
   * Generate events section with dialogue lines
   */
  generateEventsSection(segments, subtitlePreference = 'manual', stylePreference = 'standard') {
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
      
      // DEBUG: Log ASS time formatting for last segments
      const isLastSegments = index >= segments.length - 5;
      if (isLastSegments) {
        console.log(`[DEBUG ASS] Segment ${index}: ${segment.startTime}s → ${startTime}, ${segment.endTime}s → ${endTime}, text="${escapedText.substring(0, 30)}..."`);
      }
      
      return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${escapedText}`;
    }).join('\n');

    // DEBUG: Log the actual last dialogue lines that will be in the ASS file
    const lastDialogues = dialogueLines.split('\n').slice(-3);
    console.log('[DEBUG ASS] Last 3 dialogue lines in ASS file:');
    lastDialogues.forEach((line, i) => console.log(`  ${i}: ${line}`));

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
    // Trigger: Only break if text is long enough to warrant it
    const shouldBreak = text.length > 35 || text.split(' ').length > 4;
    
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
      
      console.log(`[ASS] Adaptive line break: "${firstLine}" | "${secondLine}" (${breakResult.reason})`);
      return `${firstLine}\n${secondLine}`;
    }
    
    return text; // Return original if no good break point found
  }

  /**
   * Finds optimal line break point ensuring second line is longer
   * Uses German linguistic patterns for natural breaks
   */
  findOptimalLineBreak(words, text) {
    // German function words that make good break points
    const functionWords = [
      'der', 'die', 'das', 'den', 'dem', 'des',
      'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
      'von', 'zu', 'mit', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'für', 'ohne', 'gegen',
      'und', 'oder', 'aber', 'doch', 'jedoch', 'sowie'
    ];
    
    // Strategy 1: Find last function word in first 40% of text
    const targetPosition = Math.floor(words.length * 0.4); // First 40% for short first line
    let bestBreakIndex = -1;
    
    // Look for function words in first 40% of words, working backwards
    for (let i = Math.min(targetPosition, words.length - 2); i >= 1; i--) {
      const word = words[i].toLowerCase().replace(/[.,!?]$/, '');
      if (functionWords.includes(word)) {
        bestBreakIndex = i + 1; // Break after the function word
        break;
      }
    }
    
    // Strategy 2: If no function word found, look for punctuation breaks
    if (bestBreakIndex === -1) {
      for (let i = 1; i <= Math.min(targetPosition + 1, words.length - 2); i++) {
        if (words[i].match(/[,;:]$/)) {
          bestBreakIndex = i + 1; // Break after punctuation
          break;
        }
      }
    }
    
    // Strategy 3: Fallback to position closest to 40/60 split
    if (bestBreakIndex === -1) {
      bestBreakIndex = Math.max(1, Math.min(targetPosition, words.length - 1));
    }
    
    // Ensure second line is longer - adjust if needed
    const firstLineLength = words.slice(0, bestBreakIndex).join(' ').length;
    const secondLineLength = words.slice(bestBreakIndex).join(' ').length;
    
    // If first line is longer or equal, try to move one word to first line
    if (firstLineLength >= secondLineLength && bestBreakIndex > 1) {
      bestBreakIndex = Math.max(1, bestBreakIndex - 1);
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
    
    // Determine break reason for logging
    let reason = 'fallback position';
    const breakWord = words[bestBreakIndex - 1]?.toLowerCase().replace(/[.,!?]$/, '');
    if (functionWords.includes(breakWord)) {
      reason = `after function word "${breakWord}"`;
    } else if (words[bestBreakIndex - 1]?.match(/[,;:]$/)) {
      reason = 'after punctuation';
    }
    
    return {
      shouldBreak: true,
      breakIndex: bestBreakIndex,
      reason: reason,
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
    
    const assFilePath = path.join(tempDir, `subtitles_${uploadId}_${Date.now()}.ass`);
    
    // Ensure proper UTF-8 encoding with BOM for better FFmpeg compatibility
    const utf8BOM = '\uFEFF'; // UTF-8 BOM
    const contentWithBOM = utf8BOM + assContent;
    
    await fs.writeFile(assFilePath, contentWithBOM, { encoding: 'utf8' });
    
    console.log(`[AssSubtitleService] Created UTF-8 ASS file with BOM: ${assFilePath}`);
    
    // Log first few lines to verify encoding
    const firstLines = assContent.split('\n').slice(0, 5).join('\n');
    console.log(`[AssSubtitleService] ASS file preview:\n${firstLines}...`);
    
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
    console.log(`[AssSubtitleService] Cache disabled - skipping cache for: ass:${cacheKey}`);
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
      console.log(`[AssSubtitleService] Cleaned up temp file: ${filePath}`);
    } catch (error) {
      console.warn(`[AssSubtitleService] Cleanup warning: ${error.message}`);
    }
  }
}

module.exports = AssSubtitleService; 