const { execSync } = require('child_process');
const fs = require('fs');
const { createLogger } = require('../../../utils/logger.js');

const log = createLogger('HWAccel');

let hwaccelAvailable = null;
let hwaccelTested = false;

const VAAPI_DEVICE = '/dev/dri/renderD128';

const CRF_TO_QP = {
  18: 17,
  19: 18,
  20: 19,
  21: 20,
  22: 21,
  23: 22,
  24: 23
};

const QUALITY_CONFIG = {
  CRF: {
    '4K': 18,
    '1440p': 19,
    '1080p': 20,
    '720p': 21,
    'SD': 22,
    'LARGE': 24
  },
  QP: {
    '4K': 17,
    '1440p': 18,
    '1080p': 19,
    '720p': 20,
    'SD': 21,
    'LARGE': 23
  },
  PRESET: {
    STANDARD: 'medium',
    LARGE_FILE: 'fast'
  },
  AUDIO: {
    '4K': '192k',
    '1440p': '192k',
    '1080p': '160k',
    '720p': '128k',
    'SD': '96k'
  },
  X264_EXTRAS: ['-bf', '3', '-refs', '4', '-aq-mode', '3', '-rc-lookahead', '40']
};

function crfToQp(crf) {
  return CRF_TO_QP[crf] || Math.round(crf - 1);
}

function getQualitySettings(referenceDimension, isLargeFile = false) {
  if (isLargeFile) {
    return {
      crf: QUALITY_CONFIG.CRF.LARGE,
      qp: QUALITY_CONFIG.QP.LARGE,
      preset: QUALITY_CONFIG.PRESET.LARGE_FILE,
      audioBitrate: QUALITY_CONFIG.AUDIO['1080p']
    };
  }

  if (referenceDimension >= 2160) {
    return {
      crf: QUALITY_CONFIG.CRF['4K'],
      qp: QUALITY_CONFIG.QP['4K'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['4K']
    };
  } else if (referenceDimension >= 1440) {
    return {
      crf: QUALITY_CONFIG.CRF['1440p'],
      qp: QUALITY_CONFIG.QP['1440p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['1440p']
    };
  } else if (referenceDimension >= 1080) {
    return {
      crf: QUALITY_CONFIG.CRF['1080p'],
      qp: QUALITY_CONFIG.QP['1080p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['1080p']
    };
  } else if (referenceDimension >= 720) {
    return {
      crf: QUALITY_CONFIG.CRF['720p'],
      qp: QUALITY_CONFIG.QP['720p'],
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO['720p']
    };
  } else {
    return {
      crf: QUALITY_CONFIG.CRF.SD,
      qp: QUALITY_CONFIG.QP.SD,
      preset: QUALITY_CONFIG.PRESET.STANDARD,
      audioBitrate: QUALITY_CONFIG.AUDIO.SD
    };
  }
}

function getX264QualityParams() {
  return QUALITY_CONFIG.X264_EXTRAS;
}

async function detectVaapi() {
  if (hwaccelTested) return hwaccelAvailable;

  if (!fs.existsSync(VAAPI_DEVICE)) {
    log.warn(`VAAPI device ${VAAPI_DEVICE} not found, using CPU encoding`);
    hwaccelAvailable = false;
    hwaccelTested = true;
    return false;
  }

  try {
    fs.accessSync(VAAPI_DEVICE, fs.constants.R_OK | fs.constants.W_OK);
  } catch (permErr) {
    log.warn(`VAAPI device ${VAAPI_DEVICE} permission denied, using CPU encoding. Add user to 'render' or 'video' group.`);
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
  } catch (err) {
    hwaccelAvailable = false;
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    const output = stderr || stdout || err.message || 'unknown error';
    log.warn(`VAAPI test failed: ${output}, using CPU encoding`);
  }

  hwaccelTested = true;
  return hwaccelAvailable;
}

function getVaapiInputOptions() {
  return ['-vaapi_device', VAAPI_DEVICE];
}

function getVaapiEncoder(is4K, isHevcSource = false) {
  if (is4K || isHevcSource) {
    return 'hevc_vaapi';
  }
  return 'h264_vaapi';
}

function getVaapiOutputOptions(qp, encoder) {
  const profile = encoder === 'hevc_vaapi' ? 'main' : 'high';
  return [
    '-c:v', encoder,
    '-qp', qp.toString(),
    '-profile:v', profile
  ];
}

function getSubtitleFilterChain(assFilePath, fontDir, scaleFilter = null) {
  const cpuFilters = [];

  if (scaleFilter) {
    cpuFilters.push(scaleFilter);
  }

  if (assFilePath && fontDir) {
    const escapedAssPath = assFilePath.replace(/:/g, '\\:').replace(/'/g, "\\'");
    const escapedFontDir = fontDir.replace(/:/g, '\\:').replace(/'/g, "\\'");
    cpuFilters.push(`subtitles='${escapedAssPath}':fontsdir='${escapedFontDir}'`);
  }

  cpuFilters.push('format=nv12');
  cpuFilters.push('hwupload');

  return cpuFilters.join(',');
}

function getCompressionFilterChain(scaleFilter = null) {
  const filters = [];

  if (scaleFilter) {
    filters.push(scaleFilter);
  }

  filters.push('format=nv12');
  filters.push('hwupload');

  return filters.join(',');
}

function resetDetection() {
  hwaccelAvailable = null;
  hwaccelTested = false;
}

function isHwAccelAvailable() {
  return hwaccelAvailable;
}

module.exports = {
  detectVaapi,
  getVaapiInputOptions,
  getVaapiEncoder,
  getVaapiOutputOptions,
  getSubtitleFilterChain,
  getCompressionFilterChain,
  crfToQp,
  resetDetection,
  isHwAccelAvailable,
  getQualitySettings,
  getX264QualityParams,
  VAAPI_DEVICE,
  QUALITY_CONFIG
};
