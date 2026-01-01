/**
 * Mistral OCR API integration
 * Handles file upload and OCR processing with Mistral Vision API
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getMediaType } from './validation.js';
import type { ExtractionResult, MistralOCRResponse, MistralFileUploadResult } from './types.js';

/**
 * Extract text from document using Mistral OCR
 */
export async function extractTextWithMistralOCR(
  filePath: string,
  getMediaTypeFn: (ext: string) => string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    console.log(`[OcrService] Starting Mistral OCR extraction for: ${filePath}`);

    // Dynamic import of Mistral client (handles CJS/ESM interop)
    // @ts-ignore - mistralClient is a JavaScript module without type declarations
    const mod = await import('../workers/mistralClient.js');
    const mistralClient = mod.default || mod;

    // Try data URL approach first (simpler, no file upload)
    const dataUrlResult = await tryOCRWithDataUrl(filePath, mistralClient, getMediaTypeFn);
    if (dataUrlResult) {
      return dataUrlResult;
    }

    // Fallback to file upload approach
    console.log('[OcrService] Data URL approach failed, trying file upload...');
    const fileId = await uploadFileToMistral(filePath, mistralClient, getMediaTypeFn);
    const result = await processOCRWithFileId(fileId, mistralClient);

    const processingTimeMs = Date.now() - startTime;
    console.log(`[OcrService] Mistral OCR completed in ${processingTimeMs}ms`);

    return result;
  } catch (error) {
    console.error('[OcrService] Mistral OCR failed:', (error as Error).message);
    throw new Error(`Mistral OCR extraction failed: ${(error as Error).message}`);
  }
}

/**
 * Try OCR with data URL (simpler approach)
 */
async function tryOCRWithDataUrl(
  filePath: string,
  mistralClient: any,
  getMediaTypeFn: (ext: string) => string
): Promise<ExtractionResult | null> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const base64Data = fileBuffer.toString('base64');
    const fileExtension = path.extname(filePath);
    const mediaType = getMediaTypeFn(fileExtension);

    const dataUrl = `data:${mediaType};base64,${base64Data}`;

    console.log('[OcrService] Trying Mistral OCR with data URL...');

    const response: MistralOCRResponse = await mistralClient.chat.complete({
      model: 'pixtral-12b-2409',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: dataUrl
            },
            {
              type: 'text',
              text: 'Extract all text from this document. Return the text in markdown format, preserving structure and formatting.'
            }
          ]
        }
      ]
    });

    if (!response?.pages || response.pages.length === 0) {
      return null;
    }

    // Extract text from all pages
    const allText = response.pages
      .map((page: any) => page.markdown || page.text || '')
      .filter((text: string) => text.trim())
      .join('\n\n');

    if (!allText.trim()) {
      return null;
    }

    console.log(`[OcrService] Data URL OCR successful: ${allText.length} characters`);

    return {
      text: allText,
      pageCount: response.pages.length,
      method: 'mistral-ocr',
      confidence: response.confidence || 0.9
    };
  } catch (error) {
    console.warn('[OcrService] Data URL OCR failed:', (error as Error).message);
    return null;
  }
}

/**
 * Upload file to Mistral Files API
 */
async function uploadFileToMistral(
  filePath: string,
  mistralClient: any,
  getMediaTypeFn: (ext: string) => string
): Promise<string> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const filename = path.basename(filePath);
    const fileExtension = path.extname(filePath);
    const mediaType = getMediaTypeFn(fileExtension);

    console.log(`[OcrService] Uploading file to Mistral: ${filename} (${mediaType})`);

    // Try multiple upload strategies (Mistral API has varying support)
    let uploadResult: MistralFileUploadResult | null = null;

    // Strategy 1: files.upload() with Blob
    if (mistralClient.files?.upload) {
      try {
        const blob = new Blob([fileBuffer], { type: mediaType });
        uploadResult = await mistralClient.files.upload({
          file: blob,
          filename: filename
        });
      } catch (error) {
        console.warn('[OcrService] files.upload() failed:', (error as Error).message);
      }
    }

    // Strategy 2: files.create() with Uint8Array
    if (!uploadResult && mistralClient.files?.create) {
      try {
        const uint8Array = new Uint8Array(fileBuffer);
        uploadResult = await mistralClient.files.create({
          file: uint8Array,
          filename: filename,
          contentType: mediaType
        });
      } catch (error) {
        console.warn('[OcrService] files.create() failed:', (error as Error).message);
      }
    }

    // Strategy 3: files.add() with Buffer
    if (!uploadResult && mistralClient.files?.add) {
      try {
        uploadResult = await mistralClient.files.add({
          file: fileBuffer,
          filename: filename
        });
      } catch (error) {
        console.warn('[OcrService] files.add() failed:', (error as Error).message);
      }
    }

    if (!uploadResult) {
      throw new Error('All file upload strategies failed');
    }

    // Extract file ID from various response structures
    const fileId = uploadResult.id || uploadResult.file?.id || uploadResult.data?.id;

    if (!fileId) {
      throw new Error('No file ID returned from upload');
    }

    console.log(`[OcrService] File uploaded successfully: ${fileId}`);
    return fileId;
  } catch (error) {
    console.error('[OcrService] File upload failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Process OCR with uploaded file ID
 */
async function processOCRWithFileId(
  fileId: string,
  mistralClient: any
): Promise<ExtractionResult> {
  try {
    console.log(`[OcrService] Processing OCR with file ID: ${fileId}`);

    const response: MistralOCRResponse = await mistralClient.chat.complete({
      model: 'pixtral-12b-2409',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file_id: fileId
            },
            {
              type: 'text',
              text: 'Extract all text from this document. Return the text in markdown format, preserving structure and formatting.'
            }
          ]
        }
      ]
    });

    if (!response?.pages || response.pages.length === 0) {
      throw new Error('No pages returned from Mistral OCR');
    }

    // Extract markdown text from all pages
    const allText = response.pages
      .map((page: any) => page.markdown || page.text || '')
      .filter((text: string) => text.trim())
      .join('\n\n');

    if (!allText.trim()) {
      throw new Error('No text extracted from document');
    }

    console.log(`[OcrService] OCR processing successful: ${response.pages.length} pages, ${allText.length} characters`);

    return {
      text: allText,
      pageCount: response.pages.length,
      method: 'mistral-ocr',
      confidence: response.confidence || 0.9,
      stats: {
        pages: response.pages.length,
        method: 'mistral-pixtral'
      }
    };
  } catch (error) {
    console.error('[OcrService] OCR processing failed:', (error as Error).message);
    throw error;
  }
}
