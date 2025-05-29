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
   * Generate ASS content from subtitle segments
   */
  generateAssContent(segments, videoMetadata, styleOptions = {}) {
    const style = { ...this.defaultStyle, ...styleOptions };
    
    // Calculate dynamic font size based on video resolution
    const fontSize = this.calculateFontSize(videoMetadata, style.fontSize);
    style.fontSize = fontSize;

    const header = this.generateAssHeader(videoMetadata);
    const stylesSection = this.generateStylesSection(style);
    const eventsSection = this.generateEventsSection(segments);

    return `${header}\n${stylesSection}\n${eventsSection}`;
  }

  /**
   * Calculate optimal font size based on video metadata
   */
  calculateFontSize(metadata, baseFontSize) {
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

    // Erweiterte Grenzen für ASS
    return Math.max(24, Math.min(300, fontSize));
  }

  /**
   * Generate ASS file header
   */
  generateAssHeader(videoMetadata) {
    return `[Script Info]
Title: Gruenerator Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: ${videoMetadata.width}
PlayResY: ${videoMetadata.height}

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
   * Generate styles section
   */
  generateStylesSection(style) {
    const formatLine = [
      'Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour',
      'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut',
      'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline',
      'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV'
    ].join(',');

    // Ensure proper background box styling
    const enhancedStyle = {
      ...style,
      backColor: '&H80000000', // Semi-transparent black box
      borderStyle: 3, // Background box style
      outline: Math.max(1, style.outline), // Minimum outline
      primaryColor: '&Hffffff', // White text
      outlineColor: '&H000000' // Black outline
    };

    const styleLine = [
      'Default', enhancedStyle.fontName, enhancedStyle.fontSize, enhancedStyle.primaryColor,
      enhancedStyle.secondaryColor, enhancedStyle.outlineColor, enhancedStyle.backColor, enhancedStyle.bold,
      enhancedStyle.italic, enhancedStyle.underline, enhancedStyle.strikeOut, enhancedStyle.scaleX, enhancedStyle.scaleY,
      enhancedStyle.spacing, enhancedStyle.angle, enhancedStyle.borderStyle, enhancedStyle.outline, enhancedStyle.shadow,
      enhancedStyle.alignment, enhancedStyle.marginL, enhancedStyle.marginR, enhancedStyle.marginV
    ].join(',');

    return `[V4+ Styles]
Format: ${formatLine}
Style: ${styleLine}`;
  }

  /**
   * Generate events section with dialogue lines
   */
  generateEventsSection(segments) {
    const formatLine = 'Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text';
    
    const dialogueLines = segments.map((segment, index) => {
      const startTime = this.formatAssTime(segment.startTime);
      const endTime = this.formatAssTime(segment.endTime);
      const text = this.escapeAssText(segment.text);
      
      // DEBUG: Log ASS time formatting for last segments
      const isLastSegments = index >= segments.length - 5;
      if (isLastSegments) {
        console.log(`[DEBUG ASS] Segment ${index}: ${segment.startTime}s → ${startTime}, ${segment.endTime}s → ${endTime}, text="${text.substring(0, 30)}..."`);
      }
      
      return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}`;
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
   * Escape text for ASS format
   */
  escapeAssText(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\N')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}');
  }

  /**
   * Create temporary ASS file and return path
   */
  async createTempAssFile(assContent, uploadId) {
    const tempDir = path.join(__dirname, '../../../uploads/temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const assFilePath = path.join(tempDir, `subtitles_${uploadId}_${Date.now()}.ass`);
    await fs.writeFile(assFilePath, assContent, 'utf8');
    
    console.log(`[AssSubtitleService] Created ASS file: ${assFilePath}`);
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