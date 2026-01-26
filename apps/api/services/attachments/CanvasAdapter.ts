/**
 * Canvas Adapter for Sharepic Generation
 *
 * Bridges the gap between chat's base64 attachments and canvas routes' file requirements
 * - dreizeilen_canvas: expects multer memory buffer
 * - zitat_canvas: expects multer file with path
 */

import type { Attachment, ImageAttachment, MulterMemoryFile, MulterDiskFile } from './types.js';
import { extractBase64FromDataUrl } from './validation.js';
import { MIME_TO_EXTENSION, MAX_IMAGE_SIZE } from './constants.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * CanvasAdapter class
 * Handles conversion between attachment formats and multer file objects
 */
export class CanvasAdapter {
  /**
   * Get the first image attachment from attachments array
   * @param attachments - Array of attachment objects
   * @returns First image attachment or null
   */
  getFirstImageAttachment(attachments?: Attachment[]): ImageAttachment | null {
    if (!attachments || !Array.isArray(attachments)) {
      return null;
    }

    const imageAttachment = attachments.find(
      (attachment) => attachment.type && attachment.type.startsWith('image/')
    );

    if (!imageAttachment) {
      return null;
    }

    return imageAttachment as ImageAttachment;
  }

  /**
   * Convert base64 attachment to Buffer for dreizeilen_canvas
   * dreizeilen_canvas uses multer memory storage and expects req.file.buffer
   * @param attachment - Attachment object with base64 data
   * @returns Mock multer file object with buffer
   */
  convertToBuffer(attachment: ImageAttachment): MulterMemoryFile {
    if (!attachment || !attachment.data) {
      throw new Error('Invalid attachment: missing data');
    }

    if (!attachment.type.startsWith('image/')) {
      throw new Error(`Invalid file type for sharepic: ${attachment.type}. Expected image.`);
    }

    // Extract base64 from data URL if needed
    const base64Data = extractBase64FromDataUrl(attachment.data);
    console.log('[AttachmentAdapter] Extracted base64 from data URL');

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Return mock multer file object
    return {
      fieldname: 'image',
      originalname: attachment.name || 'uploaded-image.jpg',
      encoding: '7bit',
      mimetype: attachment.type,
      buffer: buffer,
      size: buffer.length,
    };
  }

  /**
   * Convert base64 attachment to temporary file for zitat_canvas
   * zitat_canvas uses multer disk storage and expects req.file.path
   * @param attachment - Attachment object with base64 data
   * @returns Mock multer file object with path and cleanup function
   */
  async convertToTempFile(attachment: ImageAttachment): Promise<MulterDiskFile> {
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
    const extension = this.getFileExtension(attachment.type);
    const filename = `sharepic_temp_${tempId}${extension}`;
    const tempPath = path.join(uploadsDir, filename);

    // Extract base64 from data URL if needed
    const base64Data = extractBase64FromDataUrl(attachment.data);
    console.log('[AttachmentAdapter] Extracted base64 from data URL for temp file');

    // Convert base64 to buffer and save to file
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(tempPath, buffer);

    console.log(`[AttachmentAdapter] Created temp file: ${tempPath} (${buffer.length} bytes)`);

    // Return mock multer file object with cleanup function
    return {
      fieldname: 'image',
      originalname: attachment.name || 'uploaded-image.jpg',
      encoding: '7bit',
      mimetype: attachment.type,
      buffer: buffer,
      destination: uploadsDir,
      filename: filename,
      path: tempPath,
      size: buffer.length,
      cleanup: async () => {
        try {
          await fs.unlink(tempPath);
          console.log(`[AttachmentAdapter] Cleaned up temp file: ${tempPath}`);
        } catch (error) {
          console.warn(
            `[AttachmentAdapter] Failed to cleanup temp file ${tempPath}:`,
            (error as Error).message
          );
        }
      },
    };
  }

  /**
   * Get file extension from MIME type
   * @param mimeType - MIME type (e.g., 'image/jpeg')
   * @returns File extension (e.g., '.jpg')
   */
  getFileExtension(mimeType: string): string {
    return MIME_TO_EXTENSION[mimeType] || '.jpg';
  }

  /**
   * Validate that an attachment can be used for sharepic generation
   * @param attachment - Attachment object
   * @throws {Error} If attachment is invalid
   */
  validateImageAttachment(attachment: ImageAttachment): void {
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
      throw new Error(
        `Unsupported image type: ${attachment.type}. Supported: ${supportedTypes.join(', ')}`
      );
    }

    // Basic size check (Buffer.from will validate the base64)
    try {
      // Extract base64 from data URL if needed
      const base64Data = extractBase64FromDataUrl(attachment.data);

      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0) {
        throw new Error('Empty image data');
      }

      // Check reasonable size limits (10MB max)
      if (buffer.length > MAX_IMAGE_SIZE) {
        throw new Error(
          `Image too large: ${Math.round(buffer.length / 1024 / 1024)}MB. Maximum: 10MB`
        );
      }
    } catch (error) {
      throw new Error(`Invalid image data: ${(error as Error).message}`);
    }
  }
}

// Export singleton instance
export const canvasAdapter = new CanvasAdapter();

// Export named functions for backward compatibility
export const getFirstImageAttachment = (attachments?: Attachment[]) =>
  canvasAdapter.getFirstImageAttachment(attachments);

export const convertToBuffer = (attachment: ImageAttachment) =>
  canvasAdapter.convertToBuffer(attachment);

export const convertToTempFile = (attachment: ImageAttachment) =>
  canvasAdapter.convertToTempFile(attachment);

export const validateImageAttachment = (attachment: ImageAttachment) =>
  canvasAdapter.validateImageAttachment(attachment);

export const getFileExtension = (mimeType: string) => canvasAdapter.getFileExtension(mimeType);
