import Tesseract from 'tesseract.js';
import { createCanvas } from 'canvas';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fastEmbedService } from './FastEmbedService.js';
import { smartChunkDocument } from '../utils/textChunker.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';

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
   * Extract text from PDF using the optimal method based on content type
   * First attempts direct text extraction for parseable PDFs, falls back to OCR if needed
   */
  async extractTextFromPDF(pdfPath) {
    const startTime = Date.now();
    console.log(`[OCRService] Starting PDF text extraction: ${pdfPath}`);

    try {
      // Step 1: Quick parseability check
      const parseCheck = await this.canExtractTextDirectly(pdfPath);
      
      if (parseCheck.isParseable && parseCheck.confidence >= 0.8) {
        // Fast path: Direct text extraction
        console.log(`[OCRService] Using direct text extraction (confidence: ${parseCheck.confidence.toFixed(2)})`);
        const result = await this.extractTextDirectlyFromPDF(pdfPath);
        const totalTime = Date.now() - startTime;
        
        console.log(`[OCRService] PDF extraction completed via direct method in ${totalTime}ms`);
        return {
          ...result,
          extractionMethod: 'direct',
          parseabilityStats: parseCheck.stats,
          totalProcessingTimeMs: totalTime
        };
      } else {
        // Slow path: OCR extraction
        console.log(`[OCRService] Using OCR extraction (confidence: ${parseCheck.confidence.toFixed(2)}, reason: ${parseCheck.isParseable ? 'low confidence' : 'not parseable'})`);
        const result = await this.extractTextWithOCR(pdfPath);
        const totalTime = Date.now() - startTime;
        
        console.log(`[OCRService] PDF extraction completed via OCR method in ${totalTime}ms`);
        return {
          ...result,
          extractionMethod: 'ocr',
          parseabilityStats: parseCheck.stats,
          totalProcessingTimeMs: totalTime
        };
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[OCRService] PDF extraction failed after ${totalTime}ms:`, error);
      throw error;
    }
  }

  /**
   * Extract text from PDF using OCR pipeline (pdf.js + Tesseract)
   */
  async extractTextWithOCR(pdfPath) {
    console.log(`[OCRService] Converting PDF to images: ${pdfPath}`);
    
    // Ensure pdf.js is loaded and configured
    await this.getPdfJs();
    
    // Get PDF info to determine page count
    const pdfInfo = await this.getPDFInfo(pdfPath);
    const actualPageCount = Math.min(pdfInfo.pageCount, this.maxPages);
    
    if (pdfInfo.pageCount > this.maxPages) {
      console.log(`[OCRService] PDF has ${pdfInfo.pageCount} pages, limiting to ${this.maxPages}`);
    }

    console.log(`[OCRService] Processing ${actualPageCount} pages with OCR (${pdfInfo.pageCount > this.maxPages ? 'limited from ' + pdfInfo.pageCount : 'all'} pages)`);

    const allText = [];
    const imagePaths = [];
    const tempDir = os.tmpdir();

    try {
      const pdfDoc = await this.openPdfDocument(pdfPath);

      // Process each page
      let pagesWithText = 0;
      let pagesWithOCR = 0;
      
      for (let pageNum = 1; pageNum <= actualPageCount; pageNum++) {
        if (pageNum % 25 === 0 || pageNum === 1 || pageNum === actualPageCount) {
          console.log(`[OCRService] Processing page ${pageNum}/${actualPageCount} (${Math.round((pageNum/actualPageCount)*100)}%)`);
        }
        
        try {
          const page = await pdfDoc.getPage(pageNum);
          let text = '';
          
          // Strategy 1: Direct PDF text extraction
          try {
            const textContent = await page.getTextContent();
            const directText = textContent.items.map(item => item.str).join(' ');
            
            if (directText.trim().length > 10) {
              text = this.applyMarkdownFormatting(directText);
              pagesWithText++;
            }
          } catch (directError) {
            console.warn(`[OCRService] Direct text extraction failed for page ${pageNum}:`, directError.message);
          }
          
          // Strategy 2: Canvas-based OCR (only if direct text extraction failed)
          if (!text.trim()) {
            try {
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
              const context = canvas.getContext('2d');
              
              context.fillStyle = 'white';
              context.fillRect(0, 0, canvas.width, canvas.height);
              
              const renderContext = {
                canvasContext: context,
                viewport: viewport,
                enableWebGL: false,
                renderInteractiveForms: false,
                annotationMode: 0
              };
              
              await page.render(renderContext).promise;
              
              const imagePath = path.join(tempDir, `ocr_page_${pageNum}_${Date.now()}.png`);
              const buffer = canvas.toBuffer('image/png');
              await fs.writeFile(imagePath, buffer);
              imagePaths.push(imagePath);
              
              const { data: ocrResult } = await Tesseract.recognize(imagePath, 'eng', {
                logger: () => {},
                tessedit_pageseg_mode: '1',
                tessedit_ocr_engine_mode: '2'
              });
              
              if (ocrResult.text.trim()) {
                text = this.applyMarkdownFormatting(ocrResult.text);
                pagesWithOCR++;
              }
              
            } catch (canvasError) {
              console.error(`[OCRService] Canvas OCR failed for page ${pageNum}:`, canvasError.message);
            }
          }

          if (text.trim()) {
            allText.push(`## Seite ${pageNum}\n\n${text.trim()}`);
          } else {
            console.warn(`[OCRService] No text extracted from page ${pageNum}`);
          }
        } catch (pageError) {
          console.error(`[OCRService] Error processing page ${pageNum}:`, pageError);
        }
      }
      
      console.log(`[OCRService] Completed OCR processing: ${pagesWithText} pages via direct extraction, ${pagesWithOCR} pages via OCR`);

      const finalText = allText.join('\n\n');
      
      return {
        text: finalText,
        pageCount: actualPageCount,
        stats: {
          pagesWithDirectText: pagesWithText,
          pagesWithOCR: pagesWithOCR,
          method: 'ocr'
        }
      };

    } finally {
      for (const imagePath of imagePaths) {
        try {
          await fs.unlink(imagePath);
        } catch (error) {
          console.warn(`[OCRService] Failed to clean up image file ${imagePath}:`, error);
        }
      }
    }
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
      const chunks = smartChunkDocument(text, {
        maxTokens: 512,
        overlapTokens: 50,
        preserveSentences: true,
        removeEmptyChunks: true
      });

      if (chunks.length === 0) {
        throw new Error('No chunks created from document text');
      }

      // Generate embeddings
      const chunkTexts = chunks.map(chunk => chunk.text);
      const embeddings = await fastEmbedService.generateEmbeddings(chunkTexts);

      if (embeddings.length !== chunks.length) {
        throw new Error(`Embedding count mismatch: ${embeddings.length} embeddings for ${chunks.length} chunks`);
      }

      // Store vectors in Qdrant
      await this.qdrant.init();
      const points = chunks.map((chunk, index) => ({
        id: `${documentId}_${index}`,
        vector: embeddings[index],
        payload: {
          user_id: userId,
          document_id: documentId,
          chunk_index: index,
          chunk_text: chunk.text,
          token_count: chunk.tokens || 0,
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
        { vector_count: chunks.length }, 
        { id: documentId }
      );

      console.log(`[OCRService] Generated ${embeddings.length} embeddings for document ${documentId}`);
      return { chunksProcessed: chunks.length, embeddings: embeddings.length };

    } catch (error) {
      console.error(`[OCRService] Failed to generate embeddings for document ${documentId}:`, error);
      throw error;
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