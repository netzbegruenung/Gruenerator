import Tesseract from 'tesseract.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createCanvas } from 'canvas';
import { supabaseService } from '../utils/supabaseClient.js';
import { fileURLToPath } from 'url';
import { embeddingService } from './embeddingService.js';
import { smartChunkDocument } from '../utils/textChunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OCRService {
  constructor() {
    this.isProcessing = new Map(); // Track processing status
    this.maxPages = 1000; // Increased limit for political documents and large PDFs
  }

  /**
   * Process a document with OCR
   * @param {string} documentId - Document ID in database
   * @param {string} filePath - Path to file in Supabase storage
   * @param {string} ocrMethod - OCR method to use ('tesseract' or 'mistral')
   */
  async processDocument(documentId, filePath, ocrMethod = 'tesseract') {
    if (this.isProcessing.get(documentId)) {
      console.log(`[OCRService] Document ${documentId} is already being processed`);
      return;
    }

    this.isProcessing.set(documentId, true);
    console.log(`[OCRService] Starting OCR processing for document ${documentId}`);

    try {
      // Update status to processing
      await this.updateDocumentStatus(documentId, 'processing');

      // Download file from storage
      const tempFilePath = await this.downloadFile(filePath);
      
      try {
        // Choose extraction method and extract text
        const extractionResult = ocrMethod === 'mistral' 
          ? await this.extractTextWithMistral(tempFilePath)
          : await this.extractTextFromPDF(tempFilePath);
        
        const { text, pageCount, extractionMethod, parseabilityStats, totalProcessingTimeMs, stats } = extractionResult;
        
        // Log performance metrics
        const extractionInfo = {
          method: extractionMethod || (ocrMethod === 'mistral' ? 'mistral' : 'unknown'),
          processingTime: totalProcessingTimeMs,
          pageCount,
          textLength: text.length
        };
        
        if (parseabilityStats) {
          extractionInfo.parseability = parseabilityStats;
        }
        
        if (stats) {
          extractionInfo.extractionStats = stats;
        }
        
        console.log(`[OCRService] Successfully processed document ${documentId}:`, extractionInfo);
        
        // Update document with extraction results
        await this.updateDocumentWithResults(documentId, text, pageCount, extractionInfo);
        
      } finally {
        // Clean up temp file
        await this.cleanupTempFile(tempFilePath);
      }

    } catch (error) {
      console.error(`[OCRService] Error processing document ${documentId}:`, error);
      await this.updateDocumentStatus(documentId, 'failed');
      throw error;
    } finally {
      this.isProcessing.delete(documentId);
    }
  }

  /**
   * Download file from Supabase storage to temp directory
   */
  async downloadFile(filePath) {
    const { data, error } = await supabaseService.storage
      .from('documents')
      .download(filePath);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    // Create temp file
    const tempDir = os.tmpdir();
    const tempFileName = `ocr_${Date.now()}_${path.basename(filePath)}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    // Convert blob to buffer and write to temp file
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tempFilePath, buffer);

    return tempFilePath;
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
   * This is the original extractTextFromPDF logic, now renamed for clarity
   */
  async extractTextWithOCR(pdfPath) {
    console.log(`[OCRService] Converting PDF to images: ${pdfPath}`);
    
    // Dynamically import pdf.js (legacy build for Node.js)
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    // Set worker source using absolute path
    const workerPath = path.resolve(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
    
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
      // Read PDF file
      const pdfBuffer = await fs.readFile(pdfPath);
      // Convert Buffer to Uint8Array for PDF.js
      const pdfUint8Array = new Uint8Array(pdfBuffer);
      const pdfDoc = await pdfjsLib.getDocument({
        data: pdfUint8Array,
        verbosity: 0  // Reduce warnings
      }).promise;

      // Process each page
      let pagesWithText = 0;
      let pagesWithOCR = 0;
      
      for (let pageNum = 1; pageNum <= actualPageCount; pageNum++) {
        // Log progress every 25 pages
        if (pageNum % 25 === 0 || pageNum === 1 || pageNum === actualPageCount) {
          console.log(`[OCRService] Processing page ${pageNum}/${actualPageCount} (${Math.round((pageNum/actualPageCount)*100)}%)`);
        }
        
        try {
          const page = await pdfDoc.getPage(pageNum);
          let text = '';
          
          // Strategy 1: Direct PDF text extraction (fastest and most reliable)
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
              const viewport = page.getViewport({ scale: 1.5 }); // Reduced scale to prevent memory issues
              
              // Create canvas with proper dimensions
              const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
              const context = canvas.getContext('2d');
              
              // Initialize canvas with white background
              context.fillStyle = 'white';
              context.fillRect(0, 0, canvas.width, canvas.height);
              
              // Render with minimal options to prevent crashes
              const renderContext = {
                canvasContext: context,
                viewport: viewport,
                enableWebGL: false,
                renderInteractiveForms: false,
                annotationMode: 0 // Disable annotations
              };
              
              await page.render(renderContext).promise;
              
              // Save canvas as PNG for Tesseract
              const imagePath = path.join(tempDir, `ocr_page_${pageNum}_${Date.now()}.png`);
              const buffer = canvas.toBuffer('image/png');
              await fs.writeFile(imagePath, buffer);
              imagePaths.push(imagePath);
              
              // Run OCR on canvas image
              const { data: ocrResult } = await Tesseract.recognize(imagePath, 'eng', {
                logger: () => {}, // Disable Tesseract logging
                tessedit_pageseg_mode: '1',
                tessedit_ocr_engine_mode: '2'
              });
              
              if (ocrResult.text.trim()) {
                text = this.formatOcrToMarkdown(ocrResult.text, ocrResult.hocr, pageNum);
                pagesWithOCR++;
              }
              
            } catch (canvasError) {
              console.error(`[OCRService] Canvas OCR failed for page ${pageNum}:`, canvasError.message);
            }
          }

          // Add text if extracted
          if (text.trim()) {
            allText.push(`## Seite ${pageNum}\n\n${text.trim()}`);
          } else {
            console.warn(`[OCRService] No text extracted from page ${pageNum}`);
          }
        } catch (pageError) {
          console.error(`[OCRService] Error processing page ${pageNum}:`, pageError);
          // Continue with other pages
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
      // Clean up image files
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
   * Format OCR text to markdown with better structure
   */
  formatOcrToMarkdown(ocrText, hocrData, pageNum) {
    if (!ocrText || !ocrText.trim()) return '';
    
    let formattedText = ocrText.trim();
    
    // Basic markdown formatting based on text patterns
    formattedText = this.applyMarkdownFormatting(formattedText);
    
    // If HOCR data is available, use it for better structure
    if (hocrData) {
      try {
        formattedText = this.parseHocrForStructure(hocrData, formattedText);
      } catch (error) {
        console.log(`[OCRService] HOCR parsing failed for page ${pageNum}, using basic formatting:`, error.message);
      }
    }
    
    return formattedText;
  }

  /**
   * Apply basic markdown formatting based on text patterns
   */
  applyMarkdownFormatting(text) {
    let formatted = text;
    
    // Split into lines for processing
    const lines = formatted.split('\n');
    const processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Skip empty lines
      if (!line) {
        processedLines.push('');
        continue;
      }
      
      // Detect headings (lines that are all caps, or start with numbers/bullets)
      if (this.isLikelyHeading(line)) {
        // Determine heading level based on length and context
        const level = this.determineHeadingLevel(line, i, lines);
        line = `${'#'.repeat(level)} ${line}`;
      }
      
      // Detect list items
      else if (this.isListItem(line)) {
        // Ensure proper markdown list formatting
        if (!line.startsWith('- ') && !line.startsWith('* ') && !/^\d+\.\s/.test(line)) {
          line = `- ${line.replace(/^[•·‣⁃▪▫‣]/, '').trim()}`;
        }
      }
      
      // Detect potential bold text (all caps words)
      line = this.formatBoldText(line);
      
      processedLines.push(line);
    }
    
    // Join lines and clean up spacing
    formatted = processedLines.join('\n');
    
    // Clean up multiple empty lines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    return formatted;
  }

  /**
   * Check if a line is likely a heading
   */
  isLikelyHeading(line) {
    // Short lines that are all caps
    if (line.length < 60 && line === line.toUpperCase() && /[A-Z]/.test(line)) {
      return true;
    }
    
    // Lines ending with colon
    if (line.endsWith(':') && line.length < 80) {
      return true;
    }
    
    // Lines starting with numbers (like "1. Introduction")
    if (/^\d+\.?\s+[A-Z]/.test(line) && line.length < 80) {
      return true;
    }
    
    return false;
  }

  /**
   * Determine heading level
   */
  determineHeadingLevel(line, index, allLines) {
    // Main document title (first heading, all caps, short)
    if (index < 3 && line.length < 50 && line === line.toUpperCase()) {
      return 1;
    }
    
    // Section headings
    if (line.length < 40) {
      return 2;
    }
    
    // Subsection headings
    return 3;
  }

  /**
   * Check if line is a list item
   */
  isListItem(line) {
    // Starts with common bullet characters
    if (/^[•·‣⁃▪▫‣-]\s/.test(line)) {
      return true;
    }
    
    // Numbered lists
    if (/^\d+[.)]\s/.test(line)) {
      return true;
    }
    
    // Starts with dash or asterisk
    if (/^[-*]\s/.test(line)) {
      return true;
    }
    
    return false;
  }

  /**
   * Format potential bold text
   */
  formatBoldText(line) {
    // Look for words in all caps (but not entire line)
    return line.replace(/\b[A-Z]{2,}\b/g, (match) => {
      // Skip if it's a common abbreviation or single letters
      if (match.length <= 2 || ['PDF', 'OCR', 'API', 'URL', 'HTTP', 'HTML'].includes(match)) {
        return match;
      }
      return `**${match}**`;
    });
  }

  /**
   * Parse HOCR data for structural information (optional enhancement)
   */
  parseHocrForStructure(hocrData, fallbackText) {
    // For now, return the basic formatted text
    // This could be enhanced to parse HOCR XML for better structure detection
    return fallbackText;
  }

  /**
   * Quick check to determine if PDF has extractable text without OCR
   * Samples first few pages to determine parseability
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<{isParseable: boolean, confidence: number, sampleText: string}>}
   */
  async canExtractTextDirectly(pdfPath) {
    try {
      console.log(`[OCRService] Checking PDF parseability: ${pdfPath}`);
      const startTime = Date.now();
      
      // Use pdf.js to load document
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const workerPath = path.resolve(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
      
      const pdfBuffer = await fs.readFile(pdfPath);
      const pdfUint8Array = new Uint8Array(pdfBuffer);
      const pdfDoc = await pdfjsLib.getDocument({
        data: pdfUint8Array,
        verbosity: 0
      }).promise;
      
      const totalPages = pdfDoc.numPages;
      // Sample up to first 3 pages or all pages if fewer
      const samplesToCheck = Math.min(3, totalPages);
      
      let totalTextLength = 0;
      let pagesWithText = 0;
      let sampleTexts = [];
      
      for (let pageNum = 1; pageNum <= samplesToCheck; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ').trim();
          
          if (pageText.length > 20) { // Minimum meaningful text threshold
            totalTextLength += pageText.length;
            pagesWithText++;
            sampleTexts.push(pageText.substring(0, 200)); // Keep sample for analysis
          }
        } catch (pageError) {
          console.warn(`[OCRService] Error sampling page ${pageNum}:`, pageError.message);
        }
      }
      
      // Calculate confidence score
      const textDensity = totalTextLength / samplesToCheck;
      const pageSuccessRate = pagesWithText / samplesToCheck;
      
      // Confidence calculation: combination of text density and success rate
      let confidence = 0;
      
      if (textDensity > 500 && pageSuccessRate > 0.8) {
        confidence = 0.95; // Very high confidence
      } else if (textDensity > 200 && pageSuccessRate > 0.6) {
        confidence = 0.85; // High confidence
      } else if (textDensity > 100 && pageSuccessRate > 0.4) {
        confidence = 0.7; // Medium confidence
      } else if (textDensity > 50 && pageSuccessRate > 0.2) {
        confidence = 0.5; // Low confidence
      } else {
        confidence = 0.1; // Very low confidence, likely scanned
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
      // On error, assume OCR is needed
      return {
        isParseable: false,
        confidence: 0.1,
        sampleText: '',
        stats: {
          error: error.message
        }
      };
    }
  }

  /**
   * Extract text directly from PDF using only pdf.js (fast path for parseable PDFs)
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<{text: string, pageCount: number}>}
   */
  async extractTextDirectlyFromPDF(pdfPath) {
    console.log(`[OCRService] Extracting text directly from PDF: ${pdfPath}`);
    const startTime = Date.now();
    
    try {
      // Use pdf.js to load document
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const workerPath = path.resolve(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
      
      const pdfBuffer = await fs.readFile(pdfPath);
      const pdfUint8Array = new Uint8Array(pdfBuffer);
      const pdfDoc = await pdfjsLib.getDocument({
        data: pdfUint8Array,
        verbosity: 0
      }).promise;
      
      const totalPages = Math.min(pdfDoc.numPages, this.maxPages);
      const allText = [];
      let successfulPages = 0;
      
      // Process pages in batches for better performance
      const batchSize = 10;
      
      for (let batchStart = 1; batchStart <= totalPages; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize - 1, totalPages);
        const batchPromises = [];
        
        // Create batch of page processing promises
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          batchPromises.push(this.extractPageTextDirectly(pdfDoc, pageNum));
        }
        
        // Process batch in parallel
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect results
        batchResults.forEach((result, index) => {
          const pageNum = batchStart + index;
          if (result.status === 'fulfilled' && result.value.success) {
            allText.push(`## Seite ${pageNum}\n\n${result.value.text.trim()}`);
            successfulPages++;
          } else {
            console.warn(`[OCRService] Failed to extract text from page ${pageNum}:`, result.reason?.message || 'Unknown error');
            allText.push(`## Seite ${pageNum}\n\n[Text extraction failed for this page]`);
          }
        });
        
        // Log progress for large documents
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

  /**
   * Extract text from a single page directly (helper method)
   * @private
   */
  async extractPageTextDirectly(pdfDoc, pageNum) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const rawText = textContent.items.map(item => item.str).join(' ');
      
      if (rawText.trim().length < 10) {
        return { success: false, text: '', error: 'Insufficient text content' };
      }
      
      // Apply markdown formatting
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
   * Get PDF information (page count, etc.) using pdf.js
   */
  async getPDFInfo(pdfPath) {
    try {
      // Use pdf.js to get page count (legacy build for Node.js)
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdfBuffer = await fs.readFile(pdfPath);
      // Convert Buffer to Uint8Array for PDF.js
      const pdfUint8Array = new Uint8Array(pdfBuffer);
      const pdfDoc = await pdfjsLib.getDocument({
        data: pdfUint8Array,
        verbosity: 0  // Reduce warnings
      }).promise;
      
      const pageCount = pdfDoc.numPages;
      console.log(`[OCRService] PDF has ${pageCount} pages (from pdf.js)`);
      return { pageCount };
    } catch (error) {
      console.warn(`[OCRService] Error getting PDF info with pdf.js:`, error.message);
      
      // Fallback: try to use pdf-parse
      try {
        const pdfParse = await import('pdf-parse');
        const buffer = await fs.readFile(pdfPath);
        const data = await pdfParse.default(buffer);
        
        console.log(`[OCRService] PDF has ${data.numpages} pages (from pdf-parse fallback)`);
        return { pageCount: data.numpages || 1 };
      } catch (parseError) {
        console.warn(`[OCRService] Error with pdf-parse fallback:`, parseError.message);
        return { pageCount: 1 }; // Ultimate fallback
      }
    }
  }

  /**
   * Update document status in database
   */
  async updateDocumentStatus(documentId, status) {
    const { error } = await supabaseService
      .from('documents')
      .update({ status })
      .eq('id', documentId);

    if (error) {
      console.error(`[OCRService] Failed to update document status to ${status}:`, error);
    }
  }

  /**
   * Update document with extraction results and generate embeddings
   */
  async updateDocumentWithResults(documentId, text, pageCount, extractionInfo = null) {
    try {
      // Prepare update data
      const updateData = {
        status: 'processing_embeddings',
        ocr_text: text,
        page_count: pageCount
      };

      // Add extraction metadata if available (for future database schema enhancement)
      if (extractionInfo) {
        // Note: These fields would need to be added to the database schema
        // For now, we'll just log the information
        console.log(`[OCRService] Extraction metadata for document ${documentId}:`, {
          method: extractionInfo.method,
          processingTime: extractionInfo.processingTime,
          parseability: extractionInfo.parseability,
          stats: extractionInfo.extractionStats
        });
      }

      // First update the document with extraction results
      const { error: updateError } = await supabaseService
        .from('documents')
        .update(updateData)
        .eq('id', documentId);

      if (updateError) {
        throw new Error(`Failed to update document with extraction results: ${updateError.message}`);
      }

      const methodName = extractionInfo?.method || 'unknown';
      console.log(`[OCRService] ${methodName} extraction completed for document ${documentId}, starting embedding generation`);

      // Generate embeddings for the document
      await this.generateDocumentEmbeddings(documentId, text);

      // Mark document as fully completed
      const { error: finalError } = await supabaseService
        .from('documents')
        .update({ status: 'completed' })
        .eq('id', documentId);

      if (finalError) {
        console.error(`[OCRService] Failed to mark document as completed:`, finalError);
      }

    } catch (error) {
      console.error(`[OCRService] Error in updateDocumentWithResults:`, error);
      // Mark document as failed
      await supabaseService
        .from('documents')
        .update({ status: 'failed' })
        .eq('id', documentId);
      throw error;
    }
  }

  /**
   * Generate embeddings for document chunks
   */
  async generateDocumentEmbeddings(documentId, text) {
    try {
      console.log(`[OCRService] Generating embeddings for document ${documentId}`);

      // Split document into chunks
      const chunks = smartChunkDocument(text, {
        maxTokens: 400,
        overlapTokens: 50,
        preserveStructure: true
      });

      if (chunks.length === 0) {
        console.warn(`[OCRService] No chunks generated for document ${documentId}`);
        return;
      }

      console.log(`[OCRService] Generated ${chunks.length} chunks for document ${documentId}`);

      // Generate embeddings for chunks in batches
      const batchSize = 10; // Process chunks in smaller batches to avoid timeouts
      const allChunkData = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        console.log(`[OCRService] Processing embedding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);

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
          console.error(`[OCRService] Error processing embedding batch:`, batchError);
          // Continue with other batches
        }
      }

      if (allChunkData.length === 0) {
        throw new Error('No embeddings were generated successfully');
      }

      // Insert all chunks into database
      const { error: insertError } = await supabaseService
        .from('document_chunks')
        .insert(allChunkData);

      if (insertError) {
        throw new Error(`Failed to insert document chunks: ${insertError.message}`);
      }

      console.log(`[OCRService] Successfully generated embeddings for ${allChunkData.length} chunks in document ${documentId}`);

    } catch (error) {
      console.error(`[OCRService] Error generating embeddings for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`[OCRService] Cleaned up temp file: ${filePath}`);
    } catch (error) {
      console.warn(`[OCRService] Failed to clean up temp file ${filePath}:`, error);
    }
  }

  /**
   * Get processing status for a document
   */
  isDocumentProcessing(documentId) {
    return this.isProcessing.has(documentId);
  }

  /**
   * Extract text from PDF using Mistral AI OCR API
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<{text: string, pageCount: number}>} Extracted text and page count
   */
  async extractTextWithMistral(pdfPath) {
    console.log(`[OCRService] Processing PDF with Mistral AI: ${pdfPath}`);
    
    try {
      // Dynamic import of Mistral SDK
      const { Mistral } = await import('@mistralai/mistralai');
      
      if (!process.env.MISTRAL_API_KEY) {
        throw new Error('MISTRAL_API_KEY environment variable not set');
      }
      
      const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      
      // Read PDF file
      const pdfBuffer = await fs.readFile(pdfPath);
      console.log(`[OCRService] Uploading ${Math.round(pdfBuffer.length / 1024)} KB PDF to Mistral`);
      
      // Upload PDF file to Mistral for OCR processing
      const uploadedFile = await client.files.upload({
        file: {
          fileName: path.basename(pdfPath),
          content: pdfBuffer,
        },
        purpose: "ocr"
      });
      
      // Get signed URL for the uploaded file
      const signedUrl = await client.files.getSignedUrl({
        fileId: uploadedFile.id,
        expiry: 1 // 1 hour expiry
      });
      
      console.log(`[OCRService] File uploaded, processing with Mistral OCR API`);
      
      // Process with dedicated OCR endpoint
      const response = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: signedUrl.url,
          documentName: path.basename(pdfPath)
        },
        includeImageBase64: true // Include images for comprehensive extraction
      });
      
      // Extract markdown content from OCR response
      let markdownText = '';
      if (response.pages && response.pages.length > 0) {
        markdownText = response.pages.map((page, index) => {
          let pageContent = `## Seite ${page.index || index + 1}\n\n`;
          if (page.markdown) {
            pageContent += page.markdown;
          }
          return pageContent;
        }).join('\n\n');
      }
      
      console.log(`[OCRService] Mistral OCR completed: ${markdownText.length} characters extracted from ${response.pages?.length || 0} pages`);
      
      // Get actual page count from response
      const pageCount = response.pages?.length || this.estimatePageCountFromMarkdown(markdownText);
      
      // Clean up the uploaded file (optional, Mistral will auto-delete after some time)
      try {
        await client.files.delete(uploadedFile.id);
      } catch (cleanupError) {
        console.warn(`[OCRService] Failed to cleanup Mistral file: ${cleanupError.message}`);
      }
      
      return {
        text: markdownText,
        pageCount: Math.min(pageCount, this.maxPages)
      };
      
    } catch (error) {
      console.error(`[OCRService] Mistral OCR failed:`, error.message);
      
      // Fallback to Tesseract if Mistral fails
      console.log(`[OCRService] Falling back to Tesseract OCR`);
      return await this.extractTextFromPDF(pdfPath);
    }
  }

  /**
   * Estimate page count from markdown content
   * @param {string} markdownText - Markdown text content
   * @returns {number} Estimated page count
   * @private
   */
  estimatePageCountFromMarkdown(markdownText) {
    // Count explicit page markers
    const pageMarkers = markdownText.match(/##\s*Seite\s*\d+/gi);
    if (pageMarkers && pageMarkers.length > 0) {
      return pageMarkers.length;
    }
    
    // Fallback: estimate based on content length
    // Rough estimate: 2000 characters per page for political documents
    const estimatedPages = Math.ceil(markdownText.length / 2000);
    return Math.max(1, estimatedPages);
  }

  /**
   * Extract text from base64 PDF for privacy mode processing
   * @param {string} base64Data - Base64 encoded PDF data
   * @param {string} filename - Original filename for logging
   * @returns {Promise<{text: string, pageCount: number, method: string}>}
   */
  async extractTextFromBase64PDF(base64Data, filename = 'unknown.pdf') {
    console.log(`[OCRService] Extracting text from base64 PDF for privacy mode: ${filename}`);
    
    const tempDir = os.tmpdir();
    const tempFileName = `privacy_pdf_${Date.now()}_${path.basename(filename)}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    try {
      // Write base64 data to temporary file
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(tempFilePath, buffer);
      
      console.log(`[OCRService] Created temp file: ${tempFilePath} (${Math.round(buffer.length / 1024)} KB)`);
      
      // Use existing PDF extraction logic
      const result = await this.extractTextFromPDF(tempFilePath);
      
      // Return simplified result for privacy mode
      return {
        text: result.text,
        pageCount: result.pageCount,
        method: result.extractionMethod || 'unknown',
        processingTime: result.totalProcessingTimeMs
      };
      
    } catch (error) {
      console.error(`[OCRService] Error extracting text from base64 PDF ${filename}:`, error);
      throw new Error(`PDF text extraction failed for ${filename}: ${error.message}`);
    } finally {
      // Clean up temporary file
      try {
        await fs.unlink(tempFilePath);
        console.log(`[OCRService] Cleaned up temp file: ${tempFilePath}`);
      } catch (cleanupError) {
        console.warn(`[OCRService] Failed to cleanup temp file ${tempFilePath}:`, cleanupError.message);
      }
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