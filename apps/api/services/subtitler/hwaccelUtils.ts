/**
 * Hardware Acceleration Utilities
 *
 * VAAPI detection and encoding options for Linux GPU acceleration.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('HWAccel');

let hwaccelAvailable: boolean | null = null;
let hwaccelTested = false;

export const VAAPI_DEVICE = '/dev/dri/renderD128';

const CRF_TO_QP: Record<number, number> = {
  18: 17,
  19: 18,
  20: 19,
  21: 20,
  22: 21,
  23: 22,
  24: 23,
};

export const QUALITY_CONFIG = {
  CRF: { '4K': 18, '1440p': 19, '1080p': 20, '720p': 21, SD: 22, LARGE: 24 },
  QP: { '4K': 17, '1440p': 18, '1080p': 19, '720p': 20, SD: 21, LARGE: 23 },
  PRESET: { STANDARD: 'medium', LARGE_FILE: 'fast' },
  AUDIO: { '4K': '192k', '1440p': '192k', '1080p': '160k', '720p': '128k', SD: '96k' },
  X264_EXTRAS: ['-bf', '3', '-refs', '4', '-aq-mode', '3', '-rc-lookahead', '40'],
} as const;

interface QualitySettings {
  crf: number;
  qp: number;
  preset: string;
  audioBitrate: string;
}

export function crfToQp(crf: number): number {
  return CRF_TO_QP[crf] || Math.round(crf - 1);
}

export function getQualitySettings(
  referenceDimension: number,
  isLargeFile = false
): QualitySettings {
  if (isLargeFile) {
    return {
      crf: QUALITY_CONFIG.CRF.LARGE,
      qp: QUALITY_CONFIG.QP.LARGE,
      preset: QUALITY_CONFIG.PRESET.LARGE_FILE,
      audioBitrate: QUALITY_CONFIG.AUDIO['1080p'],
    };
  }

  if (referenceDimension >= 2160) {
    return {
      crf: QUALITY_CONFIG.CRF['4K'],
      qp: QUALITY_CONFIG.QP['4K'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['4K'],
    };
  } else if (referenceDimension >= 1440) {
    return {
      crf: QUALITY_CONFIG.CRF['1440p'],
      qp: QUALITY_CONFIG.QP['1440p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['1440p'],
    };
  } else if (referenceDimension >= 1080) {
    return {
      crf: QUALITY_CONFIG.CRF['1080p'],
      qp: QUALITY_CONFIG.QP['1080p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['1080p'],
    };
  } else if (referenceDimension >= 720) {
    return {
      crf: QUALITY_CONFIG.CRF['720p'],
      qp: QUALITY_CONFIG.QP['720p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['720p'],
    };
  }
  return {
    crf: QUALITY_CONFIG.CRF.SD,
    qp: QUALITY_CONFIG.QP.SD,
    preset: QUALITY_CONFIG.PRESET.STANDARD,
    audioBitrate: QUALITY_CONFIG.AUDIO.SD,
  };
}

export function getX264QualityParams(): string[] {
  return [...QUALITY_CONFIG.X264_EXTRAS];
}

export async function detectVaapi(): Promise<boolean> {
  if (hwaccelTested) return hwaccelAvailable!;

  if (!fs.existsSync(VAAPI_DEVICE)) {
    log.warn(`VAAPI device ${VAAPI_DEVICE} not found, using CPU encoding`);
    hwaccelAvailable = false;
    hwaccelTested = true;
    return false;
  }

  try {
    fs.accessSync(VAAPI_DEVICE, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    log.warn(`VAAPI device ${VAAPI_DEVICE} permission denied, using CPU encoding`);
    hwaccelAvailable = false;
    hwaccelTested = true;
    return false;
  }

  try {
    execSync(
      `ffmpeg -hide_banner -vaapi_device ${VAAPI_DEVICE} -f lavfi -i testsrc=duration=0.1:size=320x240 -vf 'format=nv12,hwupload' -c:v h264_vaapi -f null - 2>&1`,
      { timeout: 15000, stdio: 'pipe' }
    );
    hwaccelAvailable = true;
    log.info('VAAPI hardware acceleration detected and working');
  } catch (err: any) {
    hwaccelAvailable = false;
    const output =
      err.stderr?.toString()?.trim() ||
      err.stdout?.toString()?.trim() ||
      err.message ||
      'unknown error';
    log.warn(`VAAPI test failed: ${output}, using CPU encoding`);
  }

  hwaccelTested = true;
  return hwaccelAvailable!;
}

export function getVaapiInputOptions(): string[] {
  return ['-vaapi_device', VAAPI_DEVICE];
}

export function getVaapiEncoder(is4K: boolean, isHevcSource = false): string {
  return is4K || isHevcSource ? 'hevc_vaapi' : 'h264_vaapi';
}

export function getVaapiOutputOptions(qp: number, encoder: string): string[] {
  const profile = encoder === 'hevc_vaapi' ? 'main' : 'high';
  return ['-c:v', encoder, '-qp', qp.toString(), '-profile:v', profile];
}

export function getSubtitleFilterChain(
  assFilePath: string | null,
  fontDir: string | null,
  scaleFilter: string | null = null
): string {
  const cpuFilters: string[] = [];

  if (assFilePath && fontDir) {
    const escapedAssPath = assFilePath.replace(/:/g, '\\:').replace(/'/g, "\\'");
    const escapedFontDir = fontDir.replace(/:/g, '\\:').replace(/'/g, "\\'");
    cpuFilters.push(`subtitles='${escapedAssPath}':fontsdir='${escapedFontDir}'`);
  }

  if (scaleFilter) cpuFilters.push(scaleFilter);
  cpuFilters.push('format=nv12', 'hwupload');

  return cpuFilters.join(',');
}

export function getCompressionFilterChain(scaleFilter: string | null = null): string {
  const filters: string[] = [];
  if (scaleFilter) filters.push(scaleFilter);
  filters.push('format=nv12', 'hwupload');
  return filters.join(',');
}

export function resetDetection(): void {
  hwaccelAvailable = null;
  hwaccelTested = false;
}

export function isHwAccelAvailable(): boolean | null {
  return hwaccelAvailable;
}

export type { QualitySettings };
