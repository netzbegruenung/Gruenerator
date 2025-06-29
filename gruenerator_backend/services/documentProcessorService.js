import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from './embeddingService.js';
import { smartChunkDocument } from '../utils/textChunker.js';

class DocumentProcessorService {
  constructor() {
    this.isProcessing = new Map(); // Track processing status
    this.supportedTypes = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.oasis.opendocument.text': 'odt',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
    };
  }

  /**
   * Process a document based on its file type
   * @param {string} documentId - Document ID in database
   * @param {string} filePath - Path to file in Supabase storage
   * @param {string} mimeType - MIME type of the file
   * @param {string} ocrMethod - OCR method for PDFs ('tesseract' or 'mistral')
   */
  async processDocument(documentId, filePath, mimeType, ocrMethod = 'tesseract') {
    if (this.isProcessing.get(documentId)) {
      console.log(`[DocumentProcessor] Document ${documentId} is already being processed`);
      return;
    }

    this.isProcessing.set(documentId, true);
    console.log(`[DocumentProcessor] Starting processing for document ${documentId} (type: ${mimeType})`);

    try {
      // Update status to processing
      await this.updateDocumentStatus(documentId, 'processing');

      // Download file from storage
      const tempFilePath = await this.downloadFile(filePath);
      
      try {
        let extractionResult;
        const fileType = this.supportedTypes[mimeType];
        
        switch (fileType) {
          case 'pdf':
            // Use existing OCR service for PDFs
            const { ocrService } = await import('./ocrService.js');
            extractionResult = ocrMethod === 'mistral' 
              ? await ocrService.extractTextWithMistral(tempFilePath)
              : await ocrService.extractTextFromPDF(tempFilePath);
            break;
            
          case 'docx':
          case 'odt':
          case 'xls':
          case 'xlsx':
            extractionResult = await this.extractTextFromOfficeDocument(tempFilePath, fileType);
            break;
            
          default:
            throw new Error(`Unsupported file type: ${mimeType}`);
        }
        
        // Update document with extraction results
        await this.updateDocumentWithResults(documentId, extractionResult.text, extractionResult.pageCount);
        
        // Generate embeddings
        await this.generateDocumentEmbeddings(documentId, extractionResult.text);
        
        // Mark as completed
        await this.updateDocumentStatus(documentId, 'completed');
        
        console.log(`[DocumentProcessor] Successfully processed document ${documentId}`);
        
      } finally {
        // Clean up temp file
        await this.cleanupTempFile(tempFilePath);
      }
      
    } catch (error) {
      console.error(`[DocumentProcessor] Error processing document ${documentId}:`, error);
      await this.updateDocumentStatus(documentId, 'failed');
      throw error;
    } finally {
      this.isProcessing.delete(documentId);
    }
  }

  /**
   * Extract text from office documents using officeparser
   */
  async extractTextFromOfficeDocument(filePath, fileType) {
    try {
      const officeParser = await import('officeparser');
      
      // Read file buffer
      const buffer = await fs.readFile(filePath);
      
      // Configure parser options
      const config = {
        outputErrorToConsole: false,
        newlineDelimiter: '\n',
        ignoreNotes: false,
        putNotesAtLast: false
      };
      
      // Parse the document
      const text = await officeParser.parseOfficeAsync(buffer, config);
      
      if (!text || text.trim().length === 0) {
        throw new Error(`No text content found in ${fileType.toUpperCase()} file`);
      }

      // Estimate page count based on file type and content
      let pageCount;
      if (fileType === 'xlsx' || fileType === 'xls') {
        // For Excel files, estimate based on line breaks (rough approximation of sheets/sections)
        pageCount = Math.max(1, Math.ceil(text.split('\n').length / 50));
      } else {
        // For DOCX/ODT, estimate based on character count (roughly 2000 chars per page)
        pageCount = Math.max(1, Math.ceil(text.length / 2000));
      }
      
      console.log(`[DocumentProcessor] Extracted ${text.length} characters from ${fileType.toUpperCase()} (estimated ${pageCount} pages)`);
      
      return {
        text: text.trim(),
        pageCount
      };
    } catch (error) {
      console.error(`[DocumentProcessor] Error extracting text from ${fileType.toUpperCase()}:`, error);
      throw new Error(`Failed to extract text from ${fileType.toUpperCase()}: ${error.message}`);
    }
  }

  /**
   * Download file from Supabase storage to temporary location
   */
  async downloadFile(filePath) {
    try {
      const { data, error } = await supabaseService.storage
        .from('documents')
        .download(filePath);

      if (error) {
        throw new Error(`Failed to download file: ${error.message}`);
      }

      // Create temp file
      const tempDir = os.tmpdir();
      const tempFileName = `doc_processor_${Date.now()}_${path.basename(filePath)}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      // Convert blob to buffer and write to temp file
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(tempFilePath, buffer);

      console.log(`[DocumentProcessor] Downloaded file to temp location: ${tempFilePath}`);
      return tempFilePath;
    } catch (error) {
      console.error('[DocumentProcessor] Error downloading file:', error);
      throw error;
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`[DocumentProcessor] Cleaned up temp file: ${filePath}`);
    } catch (error) {
      console.warn(`[DocumentProcessor] Failed to clean up temp file ${filePath}:`, error.message);
    }
  }

  /**
   * Update document status in database
   */
  async updateDocumentStatus(documentId, status) {
    try {
      const { error } = await supabaseService
        .from('documents')
        .update({ status })
        .eq('id', documentId);

      if (error) {
        throw new Error(`Failed to update document status: ${error.message}`);
      }

      console.log(`[DocumentProcessor] Updated document ${documentId} status to: ${status}`);
    } catch (error) {
      console.error('[DocumentProcessor] Error updating document status:', error);
      throw error;
    }
  }

  /**
   * Update document with extraction results
   */
  async updateDocumentWithResults(documentId, text, pageCount) {
    try {
      const { error } = await supabaseService
        .from('documents')
        .update({
          status: 'processing_embeddings',
          ocr_text: text,
          page_count: pageCount
        })
        .eq('id', documentId);

      if (error) {
        throw new Error(`Failed to update document with results: ${error.message}`);
      }

      console.log(`[DocumentProcessor] Updated document ${documentId} with extracted text (${text.length} chars, ${pageCount} pages)`);
    } catch (error) {
      console.error('[DocumentProcessor] Error updating document with results:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for document chunks
   */
  async generateDocumentEmbeddings(documentId, text) {
    try {
      console.log(`[DocumentProcessor] Generating embeddings for document ${documentId}`);

      // Split document into chunks
      const chunks = smartChunkDocument(text, {
        maxTokens: 400,
        overlapTokens: 50,
        preserveStructure: true
      });

      if (chunks.length === 0) {
        console.warn(`[DocumentProcessor] No chunks generated for document ${documentId}`);
        return;
      }

      console.log(`[DocumentProcessor] Generated ${chunks.length} chunks for document ${documentId}`);

      // Generate embeddings for chunks in batches
      const batchSize = 10;
      const allChunkData = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        console.log(`[DocumentProcessor] Processing embedding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);

        try {
          // Generate embeddings for this batch
          const texts = batch.map(chunk => chunk.text);
          const embeddings = await embeddingService.generateBatchEmbeddings(texts, 'search_document');

          // Prepare chunk data for database insertion
          const batchChunkData = batch.map((chunk, index) => ({
            document_id: documentId,
            chunk_index: chunk.index,
            chunk_text: chunk.text,
            embedding: embeddings[index],
            token_count: chunk.tokens
          }));

          allChunkData.push(...batchChunkData);

        } catch (batchError) {
          console.error(`[DocumentProcessor] Error processing embedding batch:`, batchError);
          // Continue with other batches
        }
      }

      if (allChunkData.length === 0) {
        throw new Error('No embeddings were generated successfully');
      }

      // Insert all chunks into document_chunks table
      const { error: insertError } = await supabaseService
        .from('document_chunks')
        .insert(allChunkData);

      if (insertError) {
        throw new Error(`Failed to insert document chunks: ${insertError.message}`);
      }

      console.log(`[DocumentProcessor] Successfully generated embeddings for ${allChunkData.length} chunks in document ${documentId}`);

    } catch (error) {
      console.error(`[DocumentProcessor] Error generating embeddings for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a file type is supported
   */
  isSupported(mimeType) {
    return this.supportedTypes.hasOwnProperty(mimeType);
  }

  /**
   * Get file type from MIME type
   */
  getFileType(mimeType) {
    return this.supportedTypes[mimeType] || 'unknown';
  }
}

// Create and export singleton instance
export const documentProcessorService = new DocumentProcessorService();