/**
 * Document Processing Service
 * Centralizes common document processing logic for upload, text addition, and URL crawling
 */

import { fastEmbedService } from './FastEmbedService.js';
import { smartChunkDocument } from '../utils/textChunker.js';
import { getPostgresDocumentService } from './postgresDocumentService.js';
import { getQdrantDocumentService } from './DocumentSearchService.js';
import { ocrService } from './ocrService.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class DocumentProcessingService {
    constructor() {
        this.postgresDocumentService = getPostgresDocumentService();
        this.qdrantDocumentService = getQdrantDocumentService();
    }

    /**
     * Generate a short, sentence-aware content preview
     */
    generateContentPreview(text, limit = 600) {
        if (!text || typeof text !== 'string') return '';
        if (text.length <= limit) return text;
        const truncated = text.slice(0, limit);
        const sentenceEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
        if (sentenceEnd > limit * 0.5) return truncated.slice(0, sentenceEnd + 1);
        const lastSpace = truncated.lastIndexOf(' ');
        return lastSpace > limit * 0.6 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
    }

    /**
     * Extract text from file buffer based on MIME type
     */
    async extractTextFromFile(file) {
        const supportedMistralTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/avif'
        ];

        if (supportedMistralTypes.includes(file.mimetype)) {
            const tempDir = os.tmpdir();
            const tempFileName = `manual_upload_${Date.now()}_${file.originalname}`;
            const tempFilePath = path.join(tempDir, tempFileName);

            await fs.writeFile(tempFilePath, file.buffer);

            try {
                const ocrResult = await ocrService.extractTextFromDocument(tempFilePath);
                return ocrResult.text;
            } catch (validationError) {
                if (validationError.message.includes('zu groß') ||
                    validationError.message.includes('zu viele Seiten')) {
                    throw validationError;
                }
                throw validationError;
            } finally {
                await fs.unlink(tempFilePath);
            }
        } else if (file.mimetype.startsWith('text/')) {
            return file.buffer.toString('utf-8');
        } else {
            throw new Error(`Dateityp nicht unterstützt: ${file.mimetype}. Unterstützt werden: PDF, Word (DOCX), PowerPoint (PPTX), Bilder (PNG, JPG, AVIF) und Textdateien.`);
        }
    }

    /**
     * Process text content into chunks and embeddings
     */
    async chunkAndEmbedText(text, options = {}) {
        const {
            maxTokens = 400,
            overlapTokens = 50,
            preserveStructure = true
        } = options;

        if (!text || text.trim().length === 0) {
            throw new Error('No text content provided');
        }

        const chunks = await smartChunkDocument(text, {
            maxTokens,
            overlapTokens,
            preserveStructure
        });

        if (chunks.length === 0) {
            throw new Error('Text could not be processed into chunks');
        }

        const texts = chunks.map(chunk => chunk.text);
        const embeddings = await fastEmbedService.generateBatchEmbeddings(texts, 'search_document');

        return {
            chunks,
            embeddings,
            vectorCount: chunks.length
        };
    }

    /**
     * Process a file upload (handles extraction and processing)
     */
    async processFileUpload(userId, file, title, sourceType = 'manual') {
        console.log(`[DocumentProcessingService] Processing file upload: ${title}`);

        const extractedText = await this.extractTextFromFile(file);

        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text could be extracted from the document');
        }

        const { chunks, embeddings } = await this.chunkAndEmbedText(extractedText);

        const documentMetadata = await this.postgresDocumentService.saveDocumentMetadata(userId, {
            title: title.trim(),
            filename: file.originalname,
            sourceType: sourceType,
            vectorCount: chunks.length,
            fileSize: file.size,
            status: 'completed',
            additionalMetadata: {
                content_preview: this.generateContentPreview(extractedText)
            }
        });

        await this.qdrantDocumentService.storeDocumentVectors(
            userId,
            documentMetadata.id,
            chunks,
            embeddings,
            {
                sourceType: sourceType,
                title: title.trim(),
                filename: file.originalname
            }
        );

        console.log(`[DocumentProcessingService] Successfully processed: ${title} (${chunks.length} vectors)`);

        return {
            id: documentMetadata.id,
            title: documentMetadata.title,
            vectorCount: chunks.length,
            sourceType: sourceType
        };
    }

    /**
     * Process text content directly (no file upload)
     */
    async processTextContent(userId, title, content, sourceType = 'manual') {
        console.log(`[DocumentProcessingService] Processing text: ${title} (${content.length} chars)`);

        if (!content || content.trim().length === 0) {
            throw new Error('Text content is required');
        }

        if (!title || title.trim().length === 0) {
            throw new Error('Title is required');
        }

        const { chunks, embeddings } = await this.chunkAndEmbedText(content.trim());

        const documentMetadata = await this.postgresDocumentService.saveDocumentMetadata(userId, {
            title: title.trim(),
            filename: 'manual_text_input.txt',
            sourceType: sourceType,
            vectorCount: chunks.length,
            fileSize: content.length,
            status: 'completed',
            additionalMetadata: {
                content_preview: this.generateContentPreview(content)
            }
        });

        await this.qdrantDocumentService.storeDocumentVectors(
            userId,
            documentMetadata.id,
            chunks,
            embeddings,
            {
                sourceType: sourceType,
                title: title.trim(),
                filename: 'manual_text_input.txt'
            }
        );

        console.log(`[DocumentProcessingService] Successfully processed: ${title} (${chunks.length} vectors)`);

        return {
            id: documentMetadata.id,
            title: documentMetadata.title,
            vectorCount: chunks.length,
            sourceType: sourceType
        };
    }

    /**
     * Process crawled URL content
     */
    async processUrlContent(userId, url, title, content, sourceType = 'manual') {
        console.log(`[DocumentProcessingService] Processing URL content: ${title}`);

        const { chunks, embeddings } = await this.chunkAndEmbedText(content);

        const documentMetadata = await this.postgresDocumentService.saveDocumentMetadata(userId, {
            title: title.trim(),
            filename: `crawled_${Date.now()}.txt`,
            sourceType: sourceType,
            vectorCount: chunks.length,
            fileSize: content.length,
            status: 'completed',
            additionalMetadata: {
                originalUrl: url.trim(),
                wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
                characterCount: content.length
            }
        });

        await this.qdrantDocumentService.storeDocumentVectors(
            userId,
            documentMetadata.id,
            chunks,
            embeddings,
            {
                sourceType: sourceType,
                title: title.trim(),
                filename: `crawled_${Date.now()}.txt`,
                additionalPayload: {
                    source_url: url.trim(),
                    word_count: content.split(/\s+/).filter(word => word.length > 0).length,
                    crawled_at: new Date().toISOString()
                }
            }
        );

        console.log(`[DocumentProcessingService] Successfully processed: ${title} (${chunks.length} vectors)`);

        return {
            id: documentMetadata.id,
            title: documentMetadata.title,
            vectorCount: chunks.length,
            sourceUrl: url.trim(),
            status: 'completed',
            created_at: documentMetadata.created_at
        };
    }
}

let documentProcessingServiceInstance = null;

export function getDocumentProcessingService() {
    if (!documentProcessingServiceInstance) {
        documentProcessingServiceInstance = new DocumentProcessingService();
    }
    return documentProcessingServiceInstance;
}

export { DocumentProcessingService };