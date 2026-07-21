/**
 * Hardware Acceleration Utilities
 *
 * Quality settings and subtitle helpers for video encoding.
 */

export const QUALITY_CONFIG = {
  CRF: { '4K': 18, '1440p': 19, '1080p': 20, '720p': 21, SD: 22, LARGE: 24 },
  PRESET: { STANDARD: 'medium', LARGE_FILE: 'fast' },
  AUDIO: { '4K': '192k', '1440p': '192k', '1080p': '160k', '720p': '128k', SD: '96k' },
  X264_EXTRAS: ['-bf', '3', '-refs', '4', '-aq-mode', '3', '-rc-lookahead', '40'],
} as const;

export interface QualitySettings {
  crf: number;
  preset: string;
  audioBitrate: string;
}

export function getQualitySettings(
  referenceDimension: number,
  isLargeFile = false
): QualitySettings {
  if (isLargeFile) {
    return {
      crf: QUALITY_CONFIG.CRF.LARGE,
      preset: QUALITY_CONFIG.PRESET.LARGE_FILE,
      audioBitrate: QUALITY_CONFIG.AUDIO['1080p'],
    };
  }
  if (referenceDimension >= 2160) {
    return {
      crf: QUALITY_CONFIG.CRF['4K'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['4K'],
    };
  } else if (referenceDimension >= 1440) {
    return {
      crf: QUALITY_CONFIG.CRF['1440p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['1440p'],
    };
  } else if (referenceDimension >= 1080) {
    return {
      crf: QUALITY_CONFIG.CRF['1080p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['1080p'],
    };
  } else if (referenceDimension >= 720) {
    return {
      crf: QUALITY_CONFIG.CRF['720p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['720p'],
    };
  }
  return {
    crf: QUALITY_CONFIG.CRF.SD,
    preset: QUALITY_CONFIG.PRESET.STANDARD,
    audioBitrate: QUALITY_CONFIG.AUDIO.SD,
  };
}

export function getX264QualityParams(): string[] {
  return [...QUALITY_CONFIG.X264_EXTRAS];
}

/**
 * Build a `subtitles=` video filter with paths escaped for ffmpeg filter
 * syntax (`:` is the option separator, `'` the quote char). Unescaped
 * paths containing either character break the filter graph.
 */
export function buildSubtitlesFilter(assFilePath: string, fontDir: string): string {
  const escapeFilterPath = (p: string): string =>
    p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  return `subtitles='${escapeFilterPath(assFilePath)}':fontsdir='${escapeFilterPath(fontDir)}'`;
}
