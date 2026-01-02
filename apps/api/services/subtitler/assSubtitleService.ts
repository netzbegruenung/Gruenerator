/**
 * ASS Subtitle Service
 *
 * Generates Advanced SubStation Alpha (ASS) subtitle files with styling support.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { redisClient } from '../../utils/redis/index.js';
import { sanitizeFilename } from '../../utils/validation/index.js';
import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('assSubtitle');

interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
}

interface VideoMetadata {
  width: number;
  height: number;
  duration?: number;
}

interface StyleOptions {
  fontSize?: number;
  marginL?: number;
  marginR?: number;
  marginV?: number;
  alignment?: number;
}

interface TextOverlay {
  text: string;
  startTime: number;
  endTime: number;
  type?: 'header' | 'sub';
  xPosition: number;
  yPosition: number;
}

interface AssStyle {
  fontName: string;
  fontSize: number;
  primaryColor: string;
  secondaryColor: string;
  outlineColor: string;
  backColor: string;
  bold: number;
  italic: number;
  underline: number;
  strikeOut: number;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
}

interface AssResult {
  content: string;
  effectiveStyle: string;
}

interface LocaleStyleMapping {
  [locale: string]: {
    [style: string]: string;
  };
}

class AssSubtitleService {
  private grueneTypeFontPath: string;
  private gjFontPath: string;
  private montserratFontPath: string;
  private localeStyleMapping: LocaleStyleMapping;

  constructor() {
    this.grueneTypeFontPath = path.resolve(__dirname, '../../public/fonts/GrueneTypeNeue-Regular.ttf');
    this.gjFontPath = path.resolve(__dirname, '../../public/fonts/GJFontRegular.ttf');
    this.montserratFontPath = path.resolve(__dirname, '../../public/fonts/Montserrat-Bold.ttf');

    this.localeStyleMapping = {
      'de-AT': {
        'standard': 'at_standard',
        'clean': 'at_clean',
        'shadow': 'at_shadow',
        'tanne': 'at_gruen'
      }
    };
  }

  getFontPathForStyle(stylePreference: string): string {
    if (stylePreference?.startsWith('gj_')) {
      return this.gjFontPath;
    }
    if (stylePreference?.startsWith('at_')) {
      return this.montserratFontPath;
    }
    return this.grueneTypeFontPath;
  }

  mapStyleForLocale(stylePreference: string, locale: string): string {
    if (locale === 'de-AT' && this.localeStyleMapping['de-AT'][stylePreference]) {
      const mappedStyle = this.localeStyleMapping['de-AT'][stylePreference];
      log.debug(`Locale mapping: ${stylePreference} → ${mappedStyle} for locale ${locale}`);
      return mappedStyle;
    }
    return stylePreference;
  }

  get defaultStyle(): AssStyle {
    return {
      fontName: 'GrueneType Neue',
      fontSize: 20,
      primaryColor: '&Hffffff',
      secondaryColor: '&Hffffff',
      outlineColor: '&H000000',
      backColor: '&H80000000',
      bold: 0,
      italic: 0,
      underline: 0,
      strikeOut: 0,
      scaleX: 100,
      scaleY: 100,
      spacing: 0,
      angle: 0,
      borderStyle: 3,
      outline: 2,
      shadow: 0,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 30
    };
  }

  convertRgbToAssBgr(hexColor: string, alpha: number = 0x00): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    return `&H${alpha.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  getStylePreset(stylePreference: string = 'standard'): AssStyle {
    const baseStyle = { ...this.defaultStyle };

    switch (stylePreference) {
      case 'standard':
        return {
          ...baseStyle,
          backColor: '&HCC000000',
          borderStyle: 3,
          outline: 1,
          outlineColor: '&H000000',
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff',
          spacing: 1
        };

      case 'clean':
        return {
          ...baseStyle,
          backColor: '&H00000000',
          borderStyle: 0,
          outline: 0,
          outlineColor: '&H00000000',
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff'
        };

      case 'shadow':
        return {
          ...baseStyle,
          backColor: '&H00000000',
          borderStyle: 0,
          outline: 0,
          shadow: 3,
          outlineColor: '&H80000000',
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff'
        };

      case 'tanne': {
        const tanneColor = this.convertRgbToAssBgr('#005538', 0x00);
        const tanneOutline = this.convertRgbToAssBgr('#003825', 0x00);
        return {
          ...baseStyle,
          backColor: tanneColor,
          borderStyle: 3,
          outline: 1,
          outlineColor: tanneOutline,
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff',
          spacing: 1
        };
      }

      case 'gj_clean':
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display',
          backColor: '&H00000000',
          borderStyle: 0,
          outline: 0,
          outlineColor: '&H00000000',
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff'
        };

      case 'gj_shadow':
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display',
          backColor: '&H00000000',
          borderStyle: 0,
          outline: 0,
          shadow: 3,
          outlineColor: '&H80000000',
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff'
        };

      case 'gj_lavendel': {
        const lavendelColor = this.convertRgbToAssBgr('#9f88ff', 0x00);
        const lavendelOutline = this.convertRgbToAssBgr('#7d66cc', 0x00);
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display',
          backColor: lavendelColor,
          borderStyle: 3,
          outline: 1,
          outlineColor: lavendelOutline,
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff',
          spacing: 1
        };
      }

      case 'gj_hellgruen': {
        const hellgruenColor = this.convertRgbToAssBgr('#c7ff7a', 0x00);
        const hellgruenOutline = this.convertRgbToAssBgr('#9fcc5f', 0x00);
        return {
          ...baseStyle,
          fontName: 'Wix Madefor Display',
          backColor: hellgruenColor,
          borderStyle: 3,
          outline: 1,
          outlineColor: hellgruenOutline,
          shadow: 0,
          primaryColor: '&H000000',
          secondaryColor: '&H000000',
          spacing: 1
        };
      }

      case 'at_standard':
        return {
          ...baseStyle,
          fontName: 'Montserrat',
          backColor: '&HCC000000',
          borderStyle: 3,
          outline: 1,
          outlineColor: '&H000000',
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff',
          spacing: 1
        };

      case 'at_clean':
        return {
          ...baseStyle,
          fontName: 'Montserrat',
          backColor: '&H00000000',
          borderStyle: 0,
          outline: 0,
          outlineColor: '&H00000000',
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff'
        };

      case 'at_shadow':
        return {
          ...baseStyle,
          fontName: 'Montserrat',
          backColor: '&H00000000',
          borderStyle: 0,
          outline: 0,
          shadow: 3,
          outlineColor: '&H80000000',
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff'
        };

      case 'at_gruen': {
        const atGruenColor = this.convertRgbToAssBgr('#6baa25', 0x00);
        const atGruenOutline = this.convertRgbToAssBgr('#4d7f1b', 0x00);
        return {
          ...baseStyle,
          fontName: 'Montserrat',
          backColor: atGruenColor,
          borderStyle: 3,
          outline: 1,
          outlineColor: atGruenOutline,
          shadow: 0,
          primaryColor: '&Hffffff',
          secondaryColor: '&Hffffff',
          spacing: 1
        };
      }

      default:
        return this.getStylePreset('standard');
    }
  }

  generateAssContent(
    segments: SubtitleSegment[],
    videoMetadata: VideoMetadata,
    styleOptions: StyleOptions = {},
    subtitlePreference: string = 'manual',
    stylePreference: string = 'standard',
    locale: string = 'de-DE',
    heightPreference: string = 'standard',
    textOverlays: TextOverlay[] = []
  ): AssResult {
    const effectiveStyle = this.mapStyleForLocale(stylePreference, locale);
    const presetStyle = this.getStylePreset(effectiveStyle);
    const style: AssStyle = { ...presetStyle, ...styleOptions };

    const fontSize = this.calculateFontSize(videoMetadata, style.fontSize, subtitlePreference, effectiveStyle);
    style.fontSize = fontSize;

    log.debug(`Using style preset: ${effectiveStyle} (original: ${stylePreference}, locale: ${locale})`);

    const header = this.generateAssHeader(videoMetadata);
    const stylesSection = this.generateStylesSection(style, textOverlays && textOverlays.length > 0);
    const eventsSection = this.generateEventsSection(segments, subtitlePreference, effectiveStyle, videoMetadata, heightPreference);

    let overlayEvents = '';
    if (textOverlays && textOverlays.length > 0) {
      overlayEvents = this.generateTextOverlayEvents(textOverlays, videoMetadata);
      log.debug(`Generated ${textOverlays.length} text overlay events`);
    }

    return {
      content: `${header}\n${stylesSection}\n${eventsSection}${overlayEvents}`,
      effectiveStyle
    };
  }

  calculateFontSize(
    metadata: VideoMetadata,
    baseFontSize: number,
    subtitlePreference: string = 'manual',
    stylePreference: string = 'standard'
  ): number {
    const { width, height } = metadata;
    const referenceDimension = Math.min(width, height);

    let fontSize: number;
    if (referenceDimension >= 2160) {
      fontSize = Math.floor(baseFontSize * 2.88);
    } else if (referenceDimension >= 1440) {
      fontSize = Math.floor(baseFontSize * 2.32);
    } else if (referenceDimension >= 1080) {
      fontSize = Math.floor(baseFontSize * 2.25);
    } else if (referenceDimension >= 720) {
      fontSize = Math.floor(baseFontSize * 1.8);
    } else {
      fontSize = Math.floor(baseFontSize * 2.0);
    }

    if (subtitlePreference === 'manual') {
      fontSize = Math.floor(fontSize * 1.2);
    }

    const isGjStyle = stylePreference?.startsWith('gj_');
    if (isGjStyle) {
      fontSize = Math.floor(fontSize * 0.70);
    }

    const isAtStyle = stylePreference?.startsWith('at_');
    if (isAtStyle) {
      fontSize = Math.floor(fontSize * 0.85);
    }

    return Math.max(24, Math.min(300, fontSize));
  }

  generateAssHeader(videoMetadata: VideoMetadata): string {
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

  generateStylesSection(style: AssStyle, includeOverlayStyles: boolean = false): string {
    const formatLine = [
      'Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour',
      'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut',
      'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline',
      'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV'
    ].join(',');

    const finalStyle = { ...style };

    const styleLine = [
      'Default', finalStyle.fontName, finalStyle.fontSize, finalStyle.primaryColor,
      finalStyle.secondaryColor, finalStyle.outlineColor, finalStyle.backColor, finalStyle.bold,
      finalStyle.italic, finalStyle.underline, finalStyle.strikeOut, finalStyle.scaleX, finalStyle.scaleY,
      finalStyle.spacing, finalStyle.angle, finalStyle.borderStyle, finalStyle.outline, finalStyle.shadow,
      finalStyle.alignment, finalStyle.marginL, finalStyle.marginR, finalStyle.marginV
    ].join(',');

    let styles = `[V4+ Styles]
Format: ${formatLine}
Style: ${styleLine}`;

    if (includeOverlayStyles) {
      const overlayHeaderStyle = [
        'OverlayHeader', 'GrueneType Neue', finalStyle.fontSize, '&H00FFFFFF',
        '&H00FFFFFF', '&H80000000', '&H00000000', -1,
        0, 0, 0, 100, 100,
        0, 0, 0, 0, 2,
        5, 10, 10, 10
      ].join(',');

      const overlaySubStyle = [
        'OverlaySub', 'PT Sans', Math.round(finalStyle.fontSize * 0.67), '&H00FFFFFF',
        '&H00FFFFFF', '&H80000000', '&H00000000', 0,
        0, 0, 0, 100, 100,
        0, 0, 0, 0, 2,
        5, 10, 10, 10
      ].join(',');

      styles += `\nStyle: ${overlayHeaderStyle}`;
      styles += `\nStyle: ${overlaySubStyle}`;
    }

    return styles;
  }

  addHorizontalPadding(text: string, stylePreference: string): string {
    if (stylePreference === 'standard' || stylePreference === 'tanne' ||
        stylePreference === 'gj_lavendel' || stylePreference === 'gj_hellgruen' ||
        stylePreference === 'at_standard' || stylePreference === 'at_gruen') {
      return `\u2009${text}\u2009`;
    }
    return text;
  }

  generateEventsSection(
    segments: SubtitleSegment[],
    subtitlePreference: string = 'manual',
    stylePreference: string = 'standard',
    videoMetadata: VideoMetadata = { width: 1920, height: 1080 },
    heightPreference: string = 'standard'
  ): string {
    const { width: videoWidth = 1920, height: videoHeight = 1080 } = videoMetadata;

    const centerX = Math.round(videoWidth / 2);
    const subtitleY = heightPreference === 'tief'
      ? Math.round(videoHeight * 0.80)
      : Math.round(videoHeight * 0.67);
    const formatLine = 'Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text';

    const dialogueLines = segments.map((segment) => {
      const startTime = this.formatAssTime(segment.startTime);
      const endTime = this.formatAssTime(segment.endTime);
      let text = segment.text;

      if (subtitlePreference === 'manual') {
        text = this.addLineBreaksForManualMode(text);
      }

      text = this.addHorizontalPadding(text, stylePreference);

      const escapedText = this.escapeAssText(text);
      const positionedText = `{\\an5\\pos(${centerX},${subtitleY})}${escapedText}`;

      return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${positionedText}`;
    }).join('\n');

    return `[Events]
Format: ${formatLine}
${dialogueLines}`;
  }

  generateTextOverlayEvents(textOverlays: TextOverlay[], videoMetadata: VideoMetadata): string {
    if (!textOverlays || textOverlays.length === 0) {
      return '';
    }

    const { width: videoWidth = 1920, height: videoHeight = 1080 } = videoMetadata;

    const overlayLines = textOverlays.map((overlay) => {
      const startTime = this.formatAssTime(overlay.startTime);
      const endTime = this.formatAssTime(overlay.endTime);

      const styleName = overlay.type === 'header' ? 'OverlayHeader' : 'OverlaySub';

      const posX = Math.round((overlay.xPosition / 100) * videoWidth);
      const posY = Math.round((overlay.yPosition / 100) * videoHeight);

      const escapedText = this.escapeAssText(overlay.text);
      const positionedText = `{\\an5\\pos(${posX},${posY})}${escapedText}`;

      return `Dialogue: 1,${startTime},${endTime},${styleName},,0,0,0,,${positionedText}`;
    }).join('\n');

    return `\n${overlayLines}`;
  }

  formatAssTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);

    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }

  addLineBreaksForManualMode(text: string): string {
    const shouldBreak = text.length > 30 || text.split(' ').length >= 4;

    if (!shouldBreak) {
      return text;
    }

    const words = text.split(' ');
    if (words.length <= 2) {
      return text;
    }

    const breakResult = this.findOptimalLineBreak(words, text);

    if (breakResult.shouldBreak) {
      const firstLine = words.slice(0, breakResult.breakIndex).join(' ');
      const secondLine = words.slice(breakResult.breakIndex).join(' ');
      return `${firstLine}\n${secondLine}`;
    }

    return text;
  }

  findOptimalLineBreak(words: string[], text: string): { shouldBreak: boolean; breakIndex?: number; reason: string } {
    const totalLength = text.length;
    const targetSplitPoint = totalLength / 2;

    let bestBreakIndex = -1;
    let bestDistance = Infinity;

    let charCount = 0;
    for (let i = 0; i < words.length - 1; i++) {
      charCount += words[i].length + 1;
      const distance = Math.abs(charCount - targetSplitPoint);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestBreakIndex = i + 1;
      }
    }

    if (bestBreakIndex <= 0 || bestBreakIndex >= words.length) {
      return { shouldBreak: false, reason: 'invalid break index' };
    }

    const finalFirstLine = words.slice(0, bestBreakIndex).join(' ');
    const finalSecondLine = words.slice(bestBreakIndex).join(' ');

    if (finalFirstLine.length < 3 || finalSecondLine.length < 3) {
      return { shouldBreak: false, reason: 'lines too short' };
    }

    return {
      shouldBreak: true,
      breakIndex: bestBreakIndex,
      reason: 'balanced split'
    };
  }

  escapeAssText(text: string): string {
    const utf8Text = Buffer.from(text, 'utf8').toString('utf8');

    return utf8Text
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\N')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/ä/g, 'ä')
      .replace(/ö/g, 'ö')
      .replace(/ü/g, 'ü')
      .replace(/Ä/g, 'Ä')
      .replace(/Ö/g, 'Ö')
      .replace(/Ü/g, 'Ü')
      .replace(/ß/g, 'ß');
  }

  async createTempAssFile(assContent: string, uploadId: string): Promise<string> {
    const tempDir = path.join(__dirname, '../../uploads/temp');
    await fs.mkdir(tempDir, { recursive: true });

    const safeUploadId = sanitizeFilename(uploadId, 'unknown');
    const assFilePath = path.join(tempDir, `subtitles_${safeUploadId}_${Date.now()}.ass`);

    const utf8BOM = '\uFEFF';
    const contentWithBOM = utf8BOM + assContent;

    await fs.writeFile(assFilePath, contentWithBOM, { encoding: 'utf8' });

    log.debug(`Created ASS file: ${assFilePath}`);

    return assFilePath;
  }

  async getCachedAssContent(cacheKey: string): Promise<string | null> {
    return null;
  }

  async cacheAssContent(cacheKey: string, assContent: string): Promise<void> {
    log.debug(`Cache disabled - skipping cache for: ass:${cacheKey}`);
  }

  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      log.debug(`Cleaned up temp file: ${filePath}`);
    } catch (error: any) {
      log.warn(`Cleanup warning: ${error.message}`);
    }
  }
}

export default AssSubtitleService;
export type { SubtitleSegment, VideoMetadata, StyleOptions, TextOverlay, AssStyle, AssResult };
