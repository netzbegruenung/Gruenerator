/**
 * Subtitle styling calculations for live preview
 * Ported from backend subtitlerController.js and AssSubtitleService.js
 */

export class SubtitleStylingService {
  static calculateFontSize(videoMetadata, baseFontSize = 20) {
    const { width, height } = videoMetadata;
    const referenceDimension = Math.min(width, height);
    
    let fontSize;
    if (referenceDimension >= 2160) {
      fontSize = Math.floor(baseFontSize * 5.0); // 4K
    } else if (referenceDimension >= 1440) {
      fontSize = Math.floor(baseFontSize * 4.0); // 2K
    } else if (referenceDimension >= 1080) {
      fontSize = Math.floor(baseFontSize * 3.5); // FullHD
    } else if (referenceDimension >= 720) {
      fontSize = Math.floor(baseFontSize * 2.5); // HD
    } else {
      fontSize = Math.floor(baseFontSize * 2.0); // SD
    }

    return Math.max(24, Math.min(300, fontSize));
  }

  static calculateScaleFactor(avgChars, avgWords) {
    const shortCharThreshold = 20;
    const longCharThreshold = 40;
    const shortWordThreshold = 3;
    const longWordThreshold = 7;
    
    let charFactor;
    if (avgChars <= shortCharThreshold) {
      charFactor = 1.35;
    } else if (avgChars >= longCharThreshold) {
      charFactor = 0.95;
    } else {
      const range = longCharThreshold - shortCharThreshold;
      const position = avgChars - shortCharThreshold;
      charFactor = 1.35 - ((1.35 - 0.95) * (position / range));
    }
    
    let wordFactor;
    if (avgWords <= shortWordThreshold) {
      wordFactor = 1.25;
    } else if (avgWords >= longWordThreshold) {
      wordFactor = 0.95;
    } else {
      const range = longWordThreshold - shortWordThreshold;
      const position = avgWords - shortWordThreshold;
      wordFactor = 1.25 - ((1.25 - 0.95) * (position / range));
    }
    
    return (charFactor * 0.7) + (wordFactor * 0.3);
  }

  static calculateAverageTextMetrics(segments) {
    if (!segments || segments.length === 0) {
      return { avgLength: 30, avgWords: 5 };
    }

    let totalChars = 0;
    let totalWords = 0;
    
    segments.forEach(segment => {
      totalChars += segment.text.length;
      totalWords += segment.text.split(' ').length;
    });
    
    return {
      avgLength: totalChars / segments.length,
      avgWords: totalWords / segments.length
    };
  }

  static calculateStyles(videoMetadata, segments) {
    if (!videoMetadata || !videoMetadata.width || !videoMetadata.height) {
      return this.getDefaultStyles();
    }

    const { width, height } = videoMetadata;
    const isVertical = width < height;
    const referenceDimension = isVertical ? width : height;
    
    // Calculate base font size
    let minFontSize, maxFontSize, basePercentage;
    
    if (referenceDimension >= 2160) {
      minFontSize = 80;
      maxFontSize = 180;
      basePercentage = isVertical ? 0.070 : 0.065;
    } else if (referenceDimension >= 1440) {
      minFontSize = 60;
      maxFontSize = 140;
      basePercentage = isVertical ? 0.065 : 0.060;
    } else if (referenceDimension >= 1080) {
      minFontSize = 45;
      maxFontSize = 100;
      basePercentage = isVertical ? 0.060 : 0.055;
    } else if (referenceDimension >= 720) {
      minFontSize = 35;
      maxFontSize = 70;
      basePercentage = isVertical ? 0.055 : 0.050;
    } else {
      minFontSize = 32;
      maxFontSize = 65;
      basePercentage = isVertical ? 0.065 : 0.060;
    }
    
    // Pixel factor adjustment
    const totalPixels = width * height;
    const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1;
    const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4);
    
    const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(referenceDimension * adjustedPercentage)));

    // Calculate text metrics and scale factor
    const { avgLength, avgWords } = this.calculateAverageTextMetrics(segments);
    const scaleFactor = this.calculateScaleFactor(avgLength, avgWords);
    
    const finalFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(fontSize * scaleFactor)));
    
    // Calculate positioning
    const marginV = Math.floor(height * 0.33); // 1/3 from bottom for Instagram Reels
    const marginL = 10;
    const marginR = 10;
    
    // Calculate outline width
    const outline = Math.max(2, Math.floor(finalFontSize / 25));
    
    return {
      fontSize: finalFontSize,
      marginV,
      marginL,
      marginR,
      outline,
      width,
      height,
      isVertical
    };
  }

  static getDefaultStyles() {
    return {
      fontSize: 45,
      marginV: 200,
      marginL: 10,
      marginR: 10,
      outline: 2,
      width: 1080,
      height: 1920,
      isVertical: true
    };
  }

  static findActiveSegment(segments, currentTime) {
    if (!segments || segments.length === 0) {
      return null;
    }

    return segments.find(segment => 
      currentTime >= segment.startTime && currentTime <= segment.endTime
    );
  }
}

export default SubtitleStylingService; 