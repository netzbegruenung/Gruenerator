import { createLogger } from '../../../utils/logger.js';
const log = createLogger('subtitleSizing');

function calculateScaleFactor(avgChars, avgWords) {
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

function getBaseFontSettings(referenceDimension, isVertical) {
    if (referenceDimension >= 2160) {
        return {
            minFontSize: 80,
            maxFontSize: 180,
            basePercentage: isVertical ? 0.070 : 0.065
        };
    } else if (referenceDimension >= 1440) {
        return {
            minFontSize: 60,
            maxFontSize: 140,
            basePercentage: isVertical ? 0.065 : 0.060
        };
    } else if (referenceDimension >= 1080) {
        return {
            minFontSize: 40,
            maxFontSize: 90,
            basePercentage: isVertical ? 0.054 : 0.0495
        };
    } else if (referenceDimension >= 720) {
        return {
            minFontSize: 32,
            maxFontSize: 63,
            basePercentage: isVertical ? 0.0495 : 0.045
        };
    } else {
        return {
            minFontSize: 29,
            maxFontSize: 58,
            basePercentage: isVertical ? 0.0585 : 0.054
        };
    }
}

function calculateFontSizing(metadata, segments) {
    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const totalPixels = metadata.width * metadata.height;

    const { minFontSize, maxFontSize, basePercentage } = getBaseFontSettings(referenceDimension, isVertical);

    const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1;
    const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4);

    const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(referenceDimension * adjustedPercentage)));

    const minSpacing = 40;
    const maxSpacing = fontSize * 1.25;
    const spacing = Math.max(minSpacing, Math.min(maxSpacing, fontSize * (1.5 + (1 - fontSize/48))));

    let totalChars = 0;
    let totalWords = 0;
    segments.forEach(segment => {
        const text = segment.text || segment.rawText || '';
        totalChars += text.length;
        totalWords += text.split(' ').length;
    });
    const avgLength = segments.length > 0 ? totalChars / segments.length : 30;
    const avgWords = segments.length > 0 ? totalWords / segments.length : 5;

    const scaleFactor = calculateScaleFactor(avgLength, avgWords);

    const finalFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(fontSize * scaleFactor)));
    const scaledMaxSpacing = maxSpacing * (scaleFactor > 1 ? scaleFactor : 1);
    const finalSpacing = Math.max(minSpacing, Math.min(scaledMaxSpacing, Math.floor(spacing * scaleFactor)));

    log.debug(`Font: ${finalFontSize}px, spacing: ${finalSpacing}px`);

    return {
        finalFontSize,
        finalSpacing,
        minFontSize,
        maxFontSize,
        scaleFactor
    };
}

export { calculateFontSizing, calculateScaleFactor, getBaseFontSettings };