import { ocrService } from './ocrService.js';
import mammoth from 'mammoth';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * DocumentTextExtractor - Unified service for extracting text from various document types
 * Leverages existing OCR service and adds support for Office documents
 */
class DocumentTextExtractor {
    constructor() {
        this.supportedExtensions = [
            '.pdf',   // PDF files - via OCR service
            '.docx',  // Word documents - via mammoth
            '.txt',   // Plain text files - direct
            '.md',    // Markdown files - direct
            '.rtf'    // Rich Text Format - basic parsing
        ];
    }

    /**
     * Extract text from file buffer
     * @param {Buffer} buffer - File content as buffer
     * @param {string} filename - Original filename with extension
     * @returns {Promise<string>} - Extracted text content
     */
    async extractTextFromBuffer(buffer, filename) {
        const ext = path.extname(filename).toLowerCase();
        
        if (!this.supportedExtensions.includes(ext)) {
            throw new Error(`Unsupported file type: ${ext}. Supported types: ${this.supportedExtensions.join(', ')}`);
        }

        console.log(`[DocumentTextExtractor] Extracting text from ${filename} (${ext}, ${buffer.length} bytes)`);
        
        const tempDir = os.tmpdir();
        const tempFileName = `extract_${Date.now()}_${path.basename(filename)}`;
        const tempPath = path.join(tempDir, tempFileName);
        
        try {
            let extractedText = '';
            
            switch(ext) {
                case '.pdf':
                    // PDF processing needs a temp file for OCR service
                    await fs.writeFile(tempPath, buffer);
                    extractedText = await this.extractFromPDF(tempPath);
                    break;
                    
                case '.docx':
                    // Pass buffer and filename to office document processor
                    extractedText = await this.extractFromOfficeDocument(buffer, filename);
                    break;
                    
                case '.txt':
                case '.md':
                    extractedText = await this.extractFromTextFile(buffer);
                    break;
                    
                case '.rtf':
                    extractedText = await this.extractFromRTF(buffer);
                    break;
                    
                default:
                    throw new Error(`Extraction method not implemented for: ${ext}`);
            }

            if (!extractedText || extractedText.trim().length === 0) {
                throw new Error(`No text content could be extracted from ${filename}`);
            }

            console.log(`[DocumentTextExtractor] Successfully extracted ${extractedText.length} characters from ${filename}`);
            return extractedText.trim();
            
        } catch (error) {
            console.error(`[DocumentTextExtractor] Failed to extract text from ${filename}:`, error.message);
            throw new Error(`Text extraction failed for ${filename}: ${error.message}`);
        } finally {
            // Clean up temporary file only if it was created (for PDFs)
            if (ext === '.pdf') {
                try {
                    await fs.unlink(tempPath);
                } catch (cleanupError) {
                    console.warn(`[DocumentTextExtractor] Failed to cleanup temp file: ${tempPath}`);
                }
            }
        }
    }

    /**
     * Extract text from PDF using existing OCR service
     */
    async extractFromPDF(tempPath) {
        try {
            console.log(`[DocumentTextExtractor] Using OCR service for PDF: ${tempPath}`);
            const result = await ocrService.extractTextFromPDF(tempPath);
            return result.text || '';
        } catch (error) {
            console.error(`[DocumentTextExtractor] PDF extraction failed:`, error.message);
            throw new Error(`PDF text extraction failed: ${error.message}`);
        }
    }

    /**
     * Extract text from Office documents using mammoth for .docx
     */
    async extractFromOfficeDocument(buffer, filename) {
        try {
            // Use mammoth for .docx files - works with buffers directly
            console.log(`[DocumentTextExtractor] Using mammoth for .docx: ${filename}`);
            const result = await mammoth.extractRawText({buffer: buffer});
            return result.value || '';
        } catch (error) {
            console.error(`[DocumentTextExtractor] Office document extraction failed for ${filename}:`, error.message);
            throw new Error(`Office document extraction failed: ${error.message}`);
        }
    }

    /**
     * Extract text from plain text files
     */
    async extractFromTextFile(buffer) {
        try {
            // Try UTF-8 first
            let text = buffer.toString('utf-8');
            
            // Basic validation - check for invalid UTF-8 characters
            if (text.includes('�')) {
                // Try other encodings if UTF-8 produces replacement characters
                text = buffer.toString('latin1');
            }
            
            return text;
        } catch (error) {
            console.error(`[DocumentTextExtractor] Text file extraction failed:`, error.message);
            throw new Error(`Text file extraction failed: ${error.message}`);
        }
    }

    /**
     * Extract text from RTF files (basic implementation)
     */
    async extractFromRTF(buffer) {
        try {
            const rtfContent = buffer.toString('utf-8');
            
            // Basic RTF parsing - remove RTF control codes
            let text = rtfContent
                // Remove RTF header
                .replace(/^{\\rtf\d+[^}]*}?/i, '')
                // Remove control words
                .replace(/\\[a-z]+\d*\s?/gi, '')
                // Remove control symbols
                .replace(/\\[^a-z]/gi, '')
                // Remove braces
                .replace(/[{}]/g, '')
                // Clean up whitespace
                .replace(/\s+/g, ' ')
                .trim();
            
            return text;
        } catch (error) {
            console.error(`[DocumentTextExtractor] RTF extraction failed:`, error.message);
            throw new Error(`RTF extraction failed: ${error.message}`);
        }
    }

    /**
     * Check if file type is supported
     */
    isSupported(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.supportedExtensions.includes(ext);
    }

    /**
     * Get supported file extensions
     */
    getSupportedExtensions() {
        return [...this.supportedExtensions];
    }

    /**
     * Helper method to save buffer to temporary file
     * @param {Buffer} buffer - File content buffer
     * @param {string} filename - Original filename
     * @returns {string} - Path to temporary file
     */
    async saveBufferToTemp(buffer, filename) {
        const tempDir = os.tmpdir();
        const tempFileName = `extract_${Date.now()}_${path.basename(filename)}`;
        const tempPath = path.join(tempDir, tempFileName);
        
        await fs.writeFile(tempPath, buffer);
        return tempPath;
    }
}

// Export singleton instance
export const documentTextExtractor = new DocumentTextExtractor();
export { DocumentTextExtractor };
export default DocumentTextExtractor;