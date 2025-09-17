import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import path from 'path';
import os from 'os';
import { fastEmbedService } from './FastEmbedService.js';
import { smartChunkDocument } from '../utils/textChunker.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import { vectorConfig } from '../config/vectorConfig.js';

class OCRService {
  constructor() {
    this.isProcessing = new Map(); // Track processing status
    this.maxPages = 1000; // Increased limit for political documents and large PDFs
    this.postgres = getPostgresInstance();
    this.qdrant = getQdrantInstance();
  }

  async getPdfJs() {
    if (this._pdfjsLib) return this._pdfjsLib;
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
    this._pdfjsLib = pdfjsLib;
    return pdfjsLib;
  }

  async openPdfDocument(pdfPath) {
    const pdfjsLib = await this.getPdfJs();
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfUint8Array = new Uint8Array(pdfBuffer);
    const pdfDoc = await pdfjsLib.getDocument({
      data: pdfUint8Array,
      verbosity: 0
    }).promise;
    return pdfDoc;
  }

  /**
   * Process text directly (no file storage)
   * @param {string} userId - User ID
   * @param {string} documentId - Document ID in database
   * @param {string} text - Text content to process
   * @param {Object} metadata - Document metadata
   */
  async processText(userId, documentId, text, metadata = {}) {
    if (this.isProcessing.get(documentId)) {
      console.log(`[OCRService] Document ${documentId} is already being processed`);
      return;
    }

    this.isProcessing.set(documentId, true);
    console.log(`[OCRService] Starting text processing for document ${documentId}`);

    try {
      // Update status to processing
      await this.updateDocumentStatus(documentId, 'processing');

      const extractionInfo = {
        method: 'direct_text',
        textLength: text.length,
        processingTime: 0
      };
      
      console.log(`[OCRService] Successfully processed text document ${documentId}:`, extractionInfo);
      
      // Update document with results and generate vectors
      await this.updateDocumentWithResults(documentId, text, 1, extractionInfo);
      await this.generateAndStoreEmbeddings(userId, documentId, text, metadata);
      
      // Mark as completed
      await this.updateDocumentStatus(documentId, 'completed');

    } catch (error) {
      console.error(`[OCRService] Error processing document ${documentId}:`, error);
      await this.updateDocumentStatus(documentId, 'failed');
      throw error;
    } finally {
      this.isProcessing.delete(documentId);
    }
  }

  /**
   * Validate document limits before processing
   */
  async validateDocumentLimits(filePath, fileExtension) {
    try {
      // Check file size (50MB limit for all files)
      const stats = await fs.stat(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      const maxSizeMB = 50;

      if (fileSizeMB > maxSizeMB) {
        throw new Error(
          `Das Dokument ist zu groß. Maximale Dateigröße: ${maxSizeMB}MB. ` +
          `Ihre Datei: ${fileSizeMB.toFixed(1)}MB.`
        );
      }

      // Check page count only for PDFs (1000 pages limit)
      if (fileExtension === '.pdf') {
        const pdfDoc = await this.openPdfDocument(filePath);
        const pageCount = pdfDoc.numPages;
        const maxPages = 1000;

        if (pageCount > maxPages) {
          throw new Error(
            `Das Dokument hat zu viele Seiten. Maximum: ${maxPages} Seiten. ` +
            `Ihr Dokument: ${pageCount} Seiten.`
          );
        }

        console.log(`[OCRService] Document validation passed: ${pageCount} pages, ${fileSizeMB.toFixed(1)}MB`);
        return { pageCount, fileSizeMB };
      }

      console.log(`[OCRService] Document validation passed: ${fileSizeMB.toFixed(1)}MB`);
      return { fileSizeMB };
    } catch (error) {
      console.error(`[OCRService] Document validation failed:`, error.message);
      throw error;
    }
  }

  /**
   * Extract text from documents using Mistral OCR exclusively
   * Supports PDF, DOCX, PPTX, and image formats with markdown output
   */
  async extractTextFromDocument(filePath) {
    const startTime = Date.now();
    const fileExtension = path.extname(filePath).toLowerCase();
    console.log(`[OCRService] Starting document text extraction with Mistral OCR: ${filePath} (${fileExtension})`);

    try {
      // Validate document limits first
      await this.validateDocumentLimits(filePath, fileExtension);

      // Optional parseability check for PDFs only (for telemetry)
      let parseCheck = null;
      if (fileExtension === '.pdf') {
        parseCheck = await this.canExtractTextDirectly(filePath);
      }

      // Always use Mistral OCR - supports PDF, DOCX, PPTX, images
      console.log(`[OCRService] Using Mistral OCR for ${fileExtension} document`);
      const result = await this.extractTextWithMistralOCR(filePath);
      const totalTime = Date.now() - startTime;
      
      console.log(`[OCRService] Mistral OCR completed successfully in ${totalTime}ms`);
      
      return {
        ...result,
        extractionMethod: 'mistral-ocr',
        fileType: fileExtension,
        parseabilityStats: parseCheck?.stats || null,
        totalProcessingTimeMs: totalTime
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[OCRService] Mistral OCR extraction failed after ${totalTime}ms:`, error);
      throw error;
    }
  }

  /**
   * Use Mistral OCR to extract text as markdown for PDFs and images
   */
  async extractTextWithMistralOCR(filePath) {
    // Load CJS mistral client via dynamic import interop
    const mod = await import('../workers/mistralClient.js');
    const mistralClient = mod.default || mod;

    // Strategy A: try passing a data URL via document_url
    try {
      const fileBufferA = await fs.readFile(filePath);
      const base64A = fileBufferA.toString('base64');
      const mediaTypeA = this.#getMediaType(path.extname(filePath));
      const dataUrl = `data:${mediaTypeA};base64,${base64A}`;

      const ocrResponseA = await mistralClient.ocr.process({
        model: 'mistral-ocr-latest',
        document: { type: 'document_url', documentUrl: dataUrl },
        includeImageBase64: false
      });

      const pagesA = ocrResponseA?.pages || [];
      if (pagesA.length > 0) {
        const mdA = pagesA.map(p => (p.markdown || p.text || '').trim()).filter(Boolean).join('\n\n');
        return {
          text: mdA,
          pageCount: pagesA.length,
          method: 'mistral-ocr',
          confidence: ocrResponseA?.confidence ?? 1.0,
          stats: { pages: pagesA.length }
        };
      }
    } catch (e) {
      console.warn('[OCRService] Mistral OCR data-url attempt failed:', e.message);
    }
    // Upload file to Mistral Files API to obtain a fileId
    let fileId;
    try {
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const mediaType = this.#getMediaType(path.extname(filePath));

      // Prefer Blob when available, else Uint8Array
      let uploadPayload;
      try {
        const blob = new Blob([fileBuffer], { type: mediaType });
        uploadPayload = { file: { fileName, content: blob } };
      } catch {
        uploadPayload = { file: { fileName, content: new Uint8Array(fileBuffer) } };
      }

      let res;
      if (mistralClient.files && typeof mistralClient.files.upload === 'function') {
        res = await mistralClient.files.upload(uploadPayload);
      } else if (mistralClient.files && typeof mistralClient.files.create === 'function') {
        res = await mistralClient.files.create(uploadPayload);
      } else if (mistralClient.files && typeof mistralClient.files.add === 'function') {
        res = await mistralClient.files.add(uploadPayload);
      } else {
        throw new Error('Mistral client does not expose a files upload method');
      }

      fileId = res?.id || res?.file?.id || res?.data?.id;
      if (!fileId) {
        throw new Error('Missing fileId from Mistral file upload response');
      }
    } catch (e) {
      throw new Error(`Mistral file upload failed: ${e.message}`);
    }

    // Call OCR with the uploaded fileId
    const ocrResponse = await mistralClient.ocr.process({
      model: 'mistral-ocr-latest',
      document: { type: 'file', fileId },
      includeImageBase64: false
    });

    const pages = ocrResponse?.pages || [];
    const md = pages.map(p => (p.markdown || p.text || '').trim()).filter(Boolean).join('\n\n');
    return {
      text: md,
      pageCount: pages.length,
      method: 'mistral-ocr',
      confidence: ocrResponse?.confidence ?? 1.0,
      stats: { pages: pages.length }
    };
  }


  /**
   * Apply basic markdown formatting based on text patterns
   */
  applyMarkdownFormatting(text) {
    let formatted = text;
    const lines = formatted.split('\n');
    const processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      if (!line) {
        processedLines.push('');
        continue;
      }
      
      if (this.isLikelyHeading(line)) {
        const level = this.determineHeadingLevel(line, i, lines);
        line = `${'#'.repeat(level)} ${line}`;
      }
      
      processedLines.push(line);
    }
    
    formatted = processedLines.join('\n');
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    return formatted;
  }

  isLikelyHeading(line) {
    if (line.length < 60 && line === line.toUpperCase() && /[A-Z]/.test(line)) {
      return true;
    }
    if (line.endsWith(':') && line.length < 80) {
      return true;
    }
    if (/^\d+\.?\s+[A-Z]/.test(line) && line.length < 80) {
      return true;
    }
    return false;
  }

  determineHeadingLevel(line, index, allLines) {
    if (index < 3 && line.length < 50 && line === line.toUpperCase()) {
      return 1;
    }
    if (line.length < 40) {
      return 2;
    }
    return 3;
  }

  /**
   * Check if PDF has extractable text without OCR
   */
  async canExtractTextDirectly(pdfPath) {
    try {
      console.log(`[OCRService] Checking PDF parseability: ${pdfPath}`);
      const startTime = Date.now();
      
      await this.getPdfJs();
      const pdfDoc = await this.openPdfDocument(pdfPath);
      
      const totalPages = pdfDoc.numPages;
      const samplesToCheck = Math.min(3, totalPages);
      
      let totalTextLength = 0;
      let pagesWithText = 0;
      let sampleTexts = [];
      
      for (let pageNum = 1; pageNum <= samplesToCheck; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ').trim();
          
          if (pageText.length > 20) {
            totalTextLength += pageText.length;
            pagesWithText++;
            sampleTexts.push(pageText.substring(0, 200));
          }
        } catch (pageError) {
          console.warn(`[OCRService] Error sampling page ${pageNum}:`, pageError.message);
        }
      }
      
      const textDensity = totalTextLength / samplesToCheck;
      const pageSuccessRate = pagesWithText / samplesToCheck;
      
      let confidence = 0;
      if (textDensity > 500 && pageSuccessRate > 0.8) {
        confidence = 0.95;
      } else if (textDensity > 200 && pageSuccessRate > 0.6) {
        confidence = 0.85;
      } else if (textDensity > 100 && pageSuccessRate > 0.4) {
        confidence = 0.7;
      } else if (textDensity > 50 && pageSuccessRate > 0.2) {
        confidence = 0.5;
      } else {
        confidence = 0.1;
      }
      
      const isParseable = confidence >= 0.8;
      const processingTime = Date.now() - startTime;
      
      console.log(`[OCRService] Parseability check completed in ${processingTime}ms: parseable=${isParseable}, confidence=${confidence.toFixed(2)}, textDensity=${textDensity.toFixed(0)}, successRate=${pageSuccessRate.toFixed(2)}`);
      
      return {
        isParseable,
        confidence,
        sampleText: sampleTexts.join(' ').substring(0, 300),
        stats: {
          totalPages,
          sampledPages: samplesToCheck,
          pagesWithText,
          textDensity: Math.round(textDensity),
          pageSuccessRate: Math.round(pageSuccessRate * 100) / 100,
          processingTimeMs: processingTime
        }
      };
      
    } catch (error) {
      console.error(`[OCRService] Error checking PDF parseability:`, error.message);
      return {
        isParseable: false,
        confidence: 0.1,
        sampleText: '',
        stats: { error: error.message }
      };
    }
  }

  /**
   * Extract text directly from PDF using only pdf.js
   */
  async extractTextDirectlyFromPDF(pdfPath) {
    console.log(`[OCRService] Extracting text directly from PDF: ${pdfPath}`);
    const startTime = Date.now();
    
    try {
      await this.getPdfJs();
      const pdfDoc = await this.openPdfDocument(pdfPath);
      
      const totalPages = Math.min(pdfDoc.numPages, this.maxPages);
      const allText = [];
      let successfulPages = 0;
      
      const batchSize = 10;
      
      for (let batchStart = 1; batchStart <= totalPages; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize - 1, totalPages);
        const batchPromises = [];
        
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          batchPromises.push(this.extractPageTextDirectly(pdfDoc, pageNum));
        }
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          const pageNum = batchStart + index;
          if (result.status === 'fulfilled' && result.value.success) {
            allText.push(`## Seite ${pageNum}\n\n${result.value.text.trim()}`);
            successfulPages++;
          } else {
            console.warn(`[OCRService] Failed to extract text from page ${pageNum}:`, result.reason?.message || 'Unknown error');
          }
        });
        
        if (totalPages > 20 && batchEnd % 50 === 0) {
          console.log(`[OCRService] Direct extraction progress: ${batchEnd}/${totalPages} pages (${Math.round((batchEnd/totalPages)*100)}%)`);
        }
      }
      
      const finalText = allText.join('\n\n');
      const processingTime = Date.now() - startTime;
      
      console.log(`[OCRService] Direct text extraction completed in ${processingTime}ms: ${successfulPages}/${totalPages} pages successful, ${finalText.length} characters extracted`);
      
      return {
        text: finalText,
        pageCount: totalPages,
        stats: {
          successfulPages,
          processingTimeMs: processingTime,
          method: 'direct'
        }
      };
      
    } catch (error) {
      console.error(`[OCRService] Error in direct text extraction:`, error.message);
      throw error;
    }
  }

  async extractPageTextDirectly(pdfDoc, pageNum) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const rawText = textContent.items.map(item => item.str).join(' ');
      
      if (rawText.trim().length < 10) {
        return { success: false, text: '', error: 'Insufficient text content' };
      }
      
      const formattedText = this.applyMarkdownFormatting(rawText.trim());
      
      return {
        success: true,
        text: formattedText
      };
      
    } catch (error) {
      return { success: false, text: '', error: error.message };
    }
  }

  /**
   * Get PDF information using pdf.js
   */
  async getPDFInfo(pdfPath) {
    try {
      await this.getPdfJs();
      const pdfDoc = await this.openPdfDocument(pdfPath);
      
      const pageCount = pdfDoc.numPages;
      console.log(`[OCRService] PDF has ${pageCount} pages (from pdf.js)`);
      return { pageCount };
    } catch (error) {
      console.warn(`[OCRService] Error getting PDF info with pdf.js:`, error.message);
      return { pageCount: 1 };
    }
  }

  /**
   * Update document status in PostgreSQL
   */
  async updateDocumentStatus(documentId, status) {
    try {
      await this.postgres.ensureInitialized();
      await this.postgres.update('documents', { status }, { id: documentId });
      console.log(`[OCRService] Updated document ${documentId} status to: ${status}`);
    } catch (error) {
      console.error(`[OCRService] Failed to update document status:`, error);
      throw error;
    }
  }

  /**
   * Update document with extraction results
   */
  async updateDocumentWithResults(documentId, text, pageCount, extractionInfo) {
    try {
      await this.postgres.ensureInitialized();
      const updates = {
        status: 'processing_embeddings',
        vector_count: 0, // Will be updated after embedding generation
        updated_at: new Date().toISOString()
      };
      
      if (extractionInfo) {
        updates.metadata = JSON.stringify(extractionInfo);
      }

      await this.postgres.update('documents', updates, { id: documentId });
      console.log(`[OCRService] Updated document ${documentId} with extraction results`);
    } catch (error) {
      console.error(`[OCRService] Failed to update document with results:`, error);
      throw error;
    }
  }

  /**
   * Generate and store embeddings for document text
   */
  async generateAndStoreEmbeddings(userId, documentId, text, metadata = {}) {
    try {
      console.log(`[OCRService] Generating embeddings for document ${documentId}`);

      // Smart chunk the text
      const chunks = await smartChunkDocument(text, {
        maxTokens: 512,
        overlapTokens: 50,
        preserveSentences: true,
        removeEmptyChunks: true
      });

      if (chunks.length === 0) {
        throw new Error('No chunks created from document text');
      }

      // Quality filtering
      const qualityCfg = vectorConfig.get('quality');
      let processedChunks = chunks;
      if (qualityCfg.retrieval.enableQualityFilter) {
        const minQ = qualityCfg.retrieval.minRetrievalQuality;
        processedChunks = chunks.filter(c => {
          const q = c?.metadata?.quality_score;
          return typeof q === 'number' ? q >= minQ : true; // keep legacy
        });
        if (processedChunks.length === 0) {
          console.warn('[OCRService] All chunks filtered out by quality; relaxing filter for this document');
          processedChunks = chunks; // avoid empty storage
        }
      }

      // Generate embeddings
      const chunkTexts = processedChunks.map(chunk => chunk.text);
      const embeddings = await fastEmbedService.generateEmbeddings(chunkTexts);

      if (embeddings.length !== processedChunks.length) {
        throw new Error(`Embedding count mismatch: ${embeddings.length} embeddings for ${processedChunks.length} chunks`);
      }

      // Store vectors in Qdrant
      await this.qdrant.init();
      const points = processedChunks.map((chunk, index) => ({
        id: `${documentId}_${index}`,
        vector: embeddings[index],
        payload: {
          user_id: userId,
          document_id: documentId,
          chunk_index: index,
          chunk_text: chunk.text,
          token_count: chunk.tokens || 0,
          // Enriched metadata
          content_type: chunk.metadata?.content_type,
          markdown_headers: chunk.metadata?.markdown?.headers,
          markdown_lists: chunk.metadata?.markdown?.lists,
          markdown_tables: chunk.metadata?.markdown?.tables,
          markdown_code_blocks: chunk.metadata?.markdown?.code_blocks,
          page_number: chunk.metadata?.page_number,
          quality_score: chunk.metadata?.quality_score,
          source_type: metadata.sourceType || 'manual',
          title: metadata.title || null,
          filename: metadata.filename || null,
          created_at: new Date().toISOString()
        }
      }));

      await this.qdrant.client.upsert('documents', {
        wait: true,
        points: points
      });

      // Update document with vector count
      await this.postgres.update('documents', 
        { vector_count: processedChunks.length }, 
        { id: documentId }
      );

      console.log(`[OCRService] Generated ${embeddings.length} embeddings for document ${documentId}`);
      return { chunksProcessed: processedChunks.length, embeddings: embeddings.length };

    } catch (error) {
      console.error(`[OCRService] Failed to generate embeddings for document ${documentId}:`, error);
      throw error;
    }
  }


  #getMediaType(ext) {
    const e = (ext || '').toLowerCase();
    if (e === '.pdf') return 'application/pdf';
    if (e === '.png') return 'image/png';
    if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
    if (e === '.webp') return 'image/webp';
    if (e === '.avif') return 'image/avif';
    if (e === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (e === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return 'application/octet-stream';
  }

  /**
   * Extract text from base64 PDF data using pdfjs-dist (reliable method)
   * This method is used for Mistral and privacy mode where we need text extraction without Canvas dependencies
   * @param {string} base64Data - Base64 encoded PDF data
   * @param {string} filename - Original filename for logging
   * @returns {Promise<Object>} Object with text, pageCount, method, and processingTime
   */
  async extractTextFromBase64PDF(base64Data, filename = 'unknown.pdf') {
    const startTime = Date.now();
    console.log(`[OCRService] Extracting text from base64 PDF using pdfjs-dist: ${filename}`);

    try {
      // Use existing pdfjs setup
      const pdfjsLib = await this.getPdfJs();
      
      // Convert base64 to Uint8Array
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      const pdfUint8Array = new Uint8Array(pdfBuffer);
      
      // Load PDF document
      const pdfDoc = await pdfjsLib.getDocument({
        data: pdfUint8Array,
        verbosity: 0
      }).promise;
      
      const totalPages = pdfDoc.numPages;
      const allText = [];
      
      // Extract text from all pages
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ').trim();
          
          if (pageText.length > 0) {
            allText.push(`## Seite ${pageNum}\n\n${pageText}`);
          }
        } catch (pageError) {
          console.warn(`[OCRService] Failed to extract text from page ${pageNum}:`, pageError.message);
        }
      }
      
      const finalText = allText.join('\n\n').trim();
      const processingTime = Date.now() - startTime;
      
      console.log(`[OCRService] PDF text extraction completed: ${finalText.length} characters, ${totalPages} pages, ${processingTime}ms`);
      
      return {
        text: finalText,
        pageCount: totalPages,
        method: 'pdfjs-dist',
        processingTime: processingTime
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`[OCRService] Failed to extract text from base64 PDF ${filename}:`, error);
      
      throw new Error(`PDF text extraction failed: ${error.message}`);
    }
  }

  /**
   * Get all currently processing documents
   */
  getProcessingDocuments() {
    return Array.from(this.isProcessing.keys());
  }
}

// Export singleton instance
export const ocrService = new OCRService();
