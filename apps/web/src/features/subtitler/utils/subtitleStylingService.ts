/**
 * Subtitle styling calculations for live preview
 * Ported from backend subtitlerController.js and AssSubtitleService.js
 */

import type {
  VideoMetadata,
  SubtitleSegment,
  StylePreference,
  SubtitlePreference,
  StyleCalculationResult,
} from '../types';

interface AverageTextMetrics {
  avgLength: number;
  avgWords: number;
}

export class SubtitleStylingService {
  static calculateFontSize(
    videoMetadata: VideoMetadata,
    baseFontSize = 20,
    subtitlePreference: SubtitlePreference = 'manual',
    stylePreference: StylePreference = 'standard'
  ): number {
    const { width, height } = videoMetadata;
    const referenceDimension = Math.min(width, height);

    let fontSize: number;
    // Multipliers matching backend assSubtitleService.js
    if (referenceDimension >= 2160) {
      fontSize = Math.floor(baseFontSize * 2.88); // 4K
    } else if (referenceDimension >= 1440) {
      fontSize = Math.floor(baseFontSize * 2.32); // 2K
    } else if (referenceDimension >= 1080) {
      fontSize = Math.floor(baseFontSize * 2.25); // FullHD
    } else if (referenceDimension >= 720) {
      fontSize = Math.floor(baseFontSize * 1.8); // HD
    } else {
      fontSize = Math.floor(baseFontSize * 2.0); // SD
    }

    // Mode-specific adjustments matching backend
    if (subtitlePreference === 'manual') {
      fontSize = Math.floor(fontSize * 1.2); // +20% for manual mode
    }
    if (stylePreference?.startsWith('gj_')) {
      fontSize = Math.floor(fontSize * 0.7); // -30% for GJ styles
    }
    if (stylePreference?.startsWith('at_')) {
      fontSize = Math.floor(fontSize * 0.85); // -15% for AT styles
    }

    return Math.max(24, Math.min(300, fontSize));
  }

  static calculateScaleFactor(avgChars: number, avgWords: number): number {
    const shortCharThreshold = 20;
    const longCharThreshold = 40;
    const shortWordThreshold = 3;
    const longWordThreshold = 7;

    let charFactor: number;
    if (avgChars <= shortCharThreshold) {
      charFactor = 1.35;
    } else if (avgChars >= longCharThreshold) {
      charFactor = 0.95;
    } else {
      const range = longCharThreshold - shortCharThreshold;
      const position = avgChars - shortCharThreshold;
      charFactor = 1.35 - (1.35 - 0.95) * (position / range);
    }

    let wordFactor: number;
    if (avgWords <= shortWordThreshold) {
      wordFactor = 1.25;
    } else if (avgWords >= longWordThreshold) {
      wordFactor = 0.95;
    } else {
      const range = longWordThreshold - shortWordThreshold;
      const position = avgWords - shortWordThreshold;
      wordFactor = 1.25 - (1.25 - 0.95) * (position / range);
    }

    return charFactor * 0.7 + wordFactor * 0.3;
  }

  static calculateAverageTextMetrics(segments: SubtitleSegment[]): AverageTextMetrics {
    if (!segments || segments.length === 0) {
      return { avgLength: 30, avgWords: 5 };
    }

    let totalChars = 0;
    let totalWords = 0;

    segments.forEach((segment) => {
      totalChars += segment.text.length;
      totalWords += segment.text.split(' ').length;
    });

    return {
      avgLength: totalChars / segments.length,
      avgWords: totalWords / segments.length,
    };
  }

  static calculateStyles(
    videoMetadata: VideoMetadata | null,
    segments: SubtitleSegment[],
    subtitlePreference: SubtitlePreference = 'manual',
    stylePreference: StylePreference = 'standard'
  ): StyleCalculationResult {
    if (!videoMetadata || !videoMetadata.width || !videoMetadata.height) {
      return this.getDefaultStyles();
    }

    const { width, height } = videoMetadata;
    const isVertical = width < height;
    const referenceDimension = isVertical ? width : height;

    // Calculate base font size limits
    let minFontSize: number;
    let maxFontSize: number;
    let basePercentage: number;

    if (referenceDimension >= 2160) {
      minFontSize = 80;
      maxFontSize = 180;
      basePercentage = isVertical ? 0.07 : 0.065;
    } else if (referenceDimension >= 1440) {
      minFontSize = 60;
      maxFontSize = 140;
      basePercentage = isVertical ? 0.065 : 0.06;
    } else if (referenceDimension >= 1080) {
      minFontSize = 45;
      maxFontSize = 100;
      basePercentage = isVertical ? 0.06 : 0.055;
    } else if (referenceDimension >= 720) {
      minFontSize = 35;
      maxFontSize = 70;
      basePercentage = isVertical ? 0.055 : 0.05;
    } else {
      minFontSize = 32;
      maxFontSize = 65;
      basePercentage = isVertical ? 0.065 : 0.06;
    }

    // Pixel factor adjustment
    const totalPixels = width * height;
    const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1;
    const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4);

    const baseFontSize = Math.floor(referenceDimension * adjustedPercentage);

    // Calculate text metrics and scale factor
    const { avgLength, avgWords } = this.calculateAverageTextMetrics(segments);
    const scaleFactor = this.calculateScaleFactor(avgLength, avgWords);

    const scaledFontSize = Math.floor(baseFontSize * scaleFactor);

    // Apply mode/style adjustments via calculateFontSize
    const finalFontSize = Math.max(
      minFontSize,
      Math.min(
        maxFontSize,
        this.calculateFontSize(
          { width, height },
          scaledFontSize / 20,
          subtitlePreference,
          stylePreference
        )
      )
    );

    const marginL = 10;
    const marginR = 10;

    // Calculate outline width
    const outline = Math.max(2, Math.floor(finalFontSize / 25));

    return {
      fontSize: finalFontSize,
      marginL,
      marginR,
      outline,
      width,
      height,
      isVertical,
    };
  }

  static getDefaultStyles(): StyleCalculationResult {
    return {
      fontSize: 45,
      marginL: 10,
      marginR: 10,
      outline: 2,
      width: 1080,
      height: 1920,
      isVertical: true,
    };
  }

  static findActiveSegment(
    segments: SubtitleSegment[],
    currentTime: number
  ): SubtitleSegment | null {
    if (!segments || segments.length === 0) {
      return null;
    }

    return (
      segments.find(
        (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
      ) ?? null
    );
  }
}

export default SubtitleStylingService;
