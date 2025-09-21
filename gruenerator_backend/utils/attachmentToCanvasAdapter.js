/**
 * Attachment to Canvas Adapter
 *
 * Bridges the gap between chat's base64 attachments and canvas routes' file requirements
 * - dreizeilen_canvas: expects multer memory buffer
 * - zitat_canvas: expects multer file with path
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Get the first image attachment from attachments array
 * @param {Array} attachments - Array of attachment objects
 * @returns {Object|null} First image attachment or null
 */
function getFirstImageAttachment(attachments) {
  if (!attachments || !Array.isArray(attachments)) {
    return null;
  }

  return attachments.find(attachment =>
    attachment.type && attachment.type.startsWith('image/')
  ) || null;
}

/**
 * Convert base64 attachment to Buffer for dreizeilen_canvas
 * dreizeilen_canvas uses multer memory storage and expects req.file.buffer
 * @param {Object} attachment - Attachment object with base64 data
 * @returns {Object} Mock multer file object with buffer
 */
function convertToBuffer(attachment) {
  if (!attachment || !attachment.data) {
    throw new Error('Invalid attachment: missing data');
  }

  if (!attachment.type.startsWith('image/')) {
    throw new Error(`Invalid file type for sharepic: ${attachment.type}. Expected image.`);
  }

  // Convert base64 to buffer
  const buffer = Buffer.from(attachment.data, 'base64');

  // Return mock multer file object
  return {
    fieldname: 'image',
    originalname: attachment.name || 'uploaded-image.jpg',
    encoding: '7bit',
    mimetype: attachment.type,
    buffer: buffer,
    size: buffer.length
  };
}

/**
 * Convert base64 attachment to temporary file for zitat_canvas
 * zitat_canvas uses multer disk storage and expects req.file.path
 * @param {Object} attachment - Attachment object with base64 data
 * @returns {Promise<Object>} Mock multer file object with path and cleanup function
 */
async function convertToTempFile(attachment) {
  if (!attachment || !attachment.data) {
    throw new Error('Invalid attachment: missing data');
  }

  if (!attachment.type.startsWith('image/')) {
    throw new Error(`Invalid file type for sharepic: ${attachment.type}. Expected image.`);
  }

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }

  // Create unique filename
  const tempId = crypto.randomBytes(8).toString('hex');
  const extension = getFileExtension(attachment.type);
  const filename = `sharepic_temp_${tempId}${extension}`;
  const tempPath = path.join(uploadsDir, filename);

  // Convert base64 to buffer and save to file
  const buffer = Buffer.from(attachment.data, 'base64');
  await fs.writeFile(tempPath, buffer);

  console.log(`[AttachmentAdapter] Created temp file: ${tempPath} (${buffer.length} bytes)`);

  // Return mock multer file object with cleanup function
  return {
    fieldname: 'image',
    originalname: attachment.name || 'uploaded-image.jpg',
    encoding: '7bit',
    mimetype: attachment.type,
    destination: uploadsDir,
    filename: filename,
    path: tempPath,
    size: buffer.length,
    // Cleanup function to delete temp file
    cleanup: async () => {
      try {
        await fs.unlink(tempPath);
        console.log(`[AttachmentAdapter] Cleaned up temp file: ${tempPath}`);
      } catch (error) {
        console.warn(`[AttachmentAdapter] Failed to cleanup temp file ${tempPath}:`, error.message);
      }
    }
  };
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type (e.g., 'image/jpeg')
 * @returns {string} File extension (e.g., '.jpg')
 */
function getFileExtension(mimeType) {
  const extensions = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
  };

  return extensions[mimeType] || '.jpg';
}

/**
 * Validate that an attachment can be used for sharepic generation
 * @param {Object} attachment - Attachment object
 * @throws {Error} If attachment is invalid
 */
function validateImageAttachment(attachment) {
  if (!attachment) {
    throw new Error('No image attachment provided');
  }

  if (!attachment.type || !attachment.type.startsWith('image/')) {
    throw new Error(`Invalid file type: ${attachment.type}. Sharepics require image files.`);
  }

  if (!attachment.data) {
    throw new Error('Attachment missing data');
  }

  // Check supported image types
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(attachment.type)) {
    throw new Error(`Unsupported image type: ${attachment.type}. Supported: ${supportedTypes.join(', ')}`);
  }

  // Basic size check (Buffer.from will validate the base64)
  try {
    const buffer = Buffer.from(attachment.data, 'base64');
    if (buffer.length === 0) {
      throw new Error('Empty image data');
    }

    // Check reasonable size limits (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new Error(`Image too large: ${Math.round(buffer.length / 1024 / 1024)}MB. Maximum: 10MB`);
    }
  } catch (error) {
    throw new Error(`Invalid image data: ${error.message}`);
  }
}

module.exports = {
  getFirstImageAttachment,
  convertToBuffer,
  convertToTempFile,
  validateImageAttachment,
  getFileExtension
};