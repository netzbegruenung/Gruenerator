const sharp = require('sharp');

/**
 * Optimizes a canvas buffer using sharp for better compression
 * @param {Buffer} canvasBuffer - Raw PNG buffer from canvas.toBuffer()
 * @param {Object} options - Optimization options
 * @param {string} options.format - Output format: 'png' or 'webp' (default: 'png')
 * @param {number} options.quality - Quality for webp (1-100, default: 85)
 * @param {number} options.compressionLevel - PNG compression level (0-9, default: 9)
 * @returns {Promise<Buffer>} Optimized image buffer
 */
async function optimizeCanvasBuffer(canvasBuffer, options = {}) {
  const {
    format = 'png',
    quality = 85,
    compressionLevel = 9
  } = options;

  if (format === 'webp') {
    return sharp(canvasBuffer)
      .webp({ quality })
      .toBuffer();
  }

  return sharp(canvasBuffer)
    .png({ compressionLevel })
    .toBuffer();
}

/**
 * Converts a buffer to base64 data URL
 * @param {Buffer} buffer - Image buffer
 * @param {string} format - Image format: 'png' or 'webp' (default: 'png')
 * @returns {string} Base64 data URL
 */
function bufferToBase64(buffer, format = 'png') {
  const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

module.exports = { optimizeCanvasBuffer, bufferToBase64 };
