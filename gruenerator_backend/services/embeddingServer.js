import express from 'express';
import { FlagEmbedding, EmbeddingModel } from 'fastembed';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Standalone Embedding Server
 * Runs as a separate process to avoid loading the model multiple times
 * Provides REST API for embedding generation
 */
class EmbeddingServer {
  constructor() {
    this.app = express();
    this.port = process.env.EMBEDDING_SERVER_PORT || 3002;
    this.model = null;
    this.isInitialized = false;
    this.modelName = process.env.FASTEMBED_MODEL || EmbeddingModel.MLE5Large;
    this.maxSequenceLength = parseInt(process.env.FASTEMBED_MAX_LENGTH || '512');
    this.dimensions = parseInt(process.env.FASTEMBED_DIMENSIONS || '1024');
    this.maxRetries = 3;
    this.baseDelay = 1000;
    
    this.cacheDir = process.env.FASTEMBED_CACHE_DIR || path.resolve(process.cwd(), 'fastembed_cache');
    
    // Setup Express middleware
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // CORS for local communication
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[EmbeddingServer] ${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        initialized: this.isInitialized,
        model: this.modelName,
        dimensions: this.dimensions,
        timestamp: new Date().toISOString()
      });
    });

    // Generate single embedding
    this.app.post('/embed', async (req, res) => {
      try {
        const { text } = req.body;
        
        if (!text || typeof text !== 'string') {
          return res.status(400).json({ error: 'Text is required and must be a string' });
        }

        if (!this.isInitialized) {
          return res.status(503).json({ error: 'Model not initialized yet' });
        }

        const embedding = await this.generateEmbedding(text);
        res.json({ embedding });

      } catch (error) {
        console.error('[EmbeddingServer] Error generating embedding:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Generate batch embeddings
    this.app.post('/embed/batch', async (req, res) => {
      try {
        const { texts, inputType } = req.body;
        
        if (!Array.isArray(texts) || texts.length === 0) {
          return res.status(400).json({ error: 'Texts must be a non-empty array' });
        }

        if (!this.isInitialized) {
          return res.status(503).json({ error: 'Model not initialized yet' });
        }

        const embeddings = await this.generateBatchEmbeddings(texts, inputType);
        res.json({ embeddings });

      } catch (error) {
        console.error('[EmbeddingServer] Error generating batch embeddings:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get model info
    this.app.get('/model-info', (req, res) => {
      res.json({
        modelName: this.modelName,
        dimensions: this.dimensions,
        maxSequenceLength: this.maxSequenceLength,
        isInitialized: this.isInitialized,
        cacheDir: this.cacheDir
      });
    });
  }

  async ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      console.log(`[EmbeddingServer] Creating cache directory: ${this.cacheDir}`);
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async initializeModel() {
    if (this.isInitialized) return;

    try {
      await this.ensureCacheDirectory();
      
      console.log(`[EmbeddingServer] Initializing model: ${this.modelName}`);
      console.log(`[EmbeddingServer] Using cache directory: ${this.cacheDir}`);
      
      await this.initializeModelWithRetry();

      this.isInitialized = true;
      console.log(`[EmbeddingServer] Model initialized successfully`);
      console.log(`[EmbeddingServer] Dimensions: ${this.dimensions}, Max length: ${this.maxSequenceLength}`);
      
    } catch (error) {
      console.error('[EmbeddingServer] Failed to initialize model:', error);
      // No fallback: ensure a clean failure so operators can fix/download the primary model
      throw new Error(`Embedding model initialization failed (no fallback). ${error.message}`);
    }
  }

  async initializeModelWithRetry() {
    let lastError = null;
    let cacheCleared = false;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[EmbeddingServer] Model initialization attempt ${attempt}/${this.maxRetries}`);
        
        this.model = await FlagEmbedding.init({
          model: this.modelName,
          maxLength: this.maxSequenceLength,
          showDownloadProgress: true,
          cacheDir: this.cacheDir
        });
        
        return;
        
      } catch (error) {
        lastError = error;
        console.error(`[EmbeddingServer] Attempt ${attempt} failed:`, error.message);
        // If cache is corrupt or incomplete, clear the model folder once to force a fresh download
        const msg = String(error?.message || '').toLowerCase();
        const modelDir = path.join(this.cacheDir, this.modelName);
        const localCacheDir = path.join(process.cwd(), 'local_cache', this.modelName);
        const isCorruption = msg.includes('unexpected end of file') || msg.includes('file not found') || msg.includes('enoent');
        if (!cacheCleared && isCorruption && fs.existsSync(modelDir)) {
          try {
            console.warn(`[EmbeddingServer] Detected possible corrupt cache. Removing ${modelDir} to force re-download...`);
            fs.rmSync(modelDir, { recursive: true, force: true });
            cacheCleared = true;
          } catch (rmErr) {
            console.warn('[EmbeddingServer] Failed to remove corrupt cache folder:', rmErr.message);
          }
        }
        // Also clear legacy/local cache folder if present
        if (isCorruption && fs.existsSync(localCacheDir)) {
          try {
            console.warn(`[EmbeddingServer] Removing legacy local cache at ${localCacheDir}...`);
            fs.rmSync(localCacheDir, { recursive: true, force: true });
          } catch (rmErr2) {
            console.warn('[EmbeddingServer] Failed to remove legacy local cache folder:', rmErr2.message);
          }
        }

        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`[EmbeddingServer] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text is required and must be a string');
    }

    const truncatedText = this.truncateText(text);

    try {
      const embeddingGenerator = this.model.embed([truncatedText]);
      const batches = [];
      
      for await (const batch of embeddingGenerator) {
        batches.push(...batch);
      }
      
      if (!batches || batches.length === 0) {
        throw new Error('No embeddings returned from FastEmbed');
      }

      const embedding = Array.from(batches[0]);
      
      if (!this.validateEmbedding(embedding)) {
        throw new Error('Invalid embedding generated');
      }

      return this.normalizeVector(embedding);

    } catch (error) {
      console.error('[EmbeddingServer] Error generating embedding:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  async generateBatchEmbeddings(texts, inputType = 'search_document') {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    const truncatedTexts = texts.map(text => this.truncateText(text));

    try {
      console.log(`[EmbeddingServer] Generating embeddings for ${texts.length} texts`);
      
      const embeddingGenerator = this.model.embed(truncatedTexts);
      const allEmbeddings = [];
      
      for await (const batch of embeddingGenerator) {
        allEmbeddings.push(...batch);
      }
      
      if (!allEmbeddings || allEmbeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${allEmbeddings?.length || 0}`);
      }

      const result = allEmbeddings.map(embedding => Array.from(embedding));
      
      const normalizedResult = [];
      for (const embedding of result) {
        if (!this.validateEmbedding(embedding)) {
          throw new Error('Invalid embedding in batch');
        }
        normalizedResult.push(this.normalizeVector(embedding));
      }

      console.log(`[EmbeddingServer] Successfully generated and normalized ${normalizedResult.length} embeddings`);
      return normalizedResult;

    } catch (error) {
      console.error('[EmbeddingServer] Batch embedding generation failed:', error);
      throw new Error(`Batch embedding generation failed: ${error.message}`);
    }
  }

  truncateText(text) {
    if (!text) return '';
    
    const maxChars = this.maxSequenceLength * 4;
    
    if (text.length <= maxChars) {
      return text;
    }

    const truncated = text.substring(0, maxChars);
    const lastSentence = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentence > maxChars * 0.8) {
      return truncated.substring(0, lastSentence + 1);
    }

    return truncated;
  }

  validateEmbedding(embedding) {
    return Array.isArray(embedding) && 
           embedding.length === this.dimensions && 
           embedding.every(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
  }

  normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude === 0) {
      console.warn('[EmbeddingServer] Zero magnitude vector, returning original');
      return vector;
    }
    
    return vector.map(val => val / magnitude);
  }

  async start() {
    console.log('[EmbeddingServer] Starting embedding server...');
    
    // Initialize model first
    await this.initializeModel();
    
    // Start HTTP server
    this.server = this.app.listen(this.port, () => {
      console.log(`[EmbeddingServer] Server running on http://localhost:${this.port}`);
      console.log(`[EmbeddingServer] Model: ${this.modelName}`);
      console.log(`[EmbeddingServer] Dimensions: ${this.dimensions}`);
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    console.log('[EmbeddingServer] Shutting down...');
    
    if (this.server) {
      this.server.close(() => {
        console.log('[EmbeddingServer] HTTP server closed');
      });
    }

    if (this.model && this.model.dispose) {
      this.model.dispose();
    }

    process.exit(0);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const embeddingServer = new EmbeddingServer();
  embeddingServer.start().catch(error => {
    console.error('[EmbeddingServer] Failed to start:', error);
    process.exit(1);
  });
}

export default EmbeddingServer;
