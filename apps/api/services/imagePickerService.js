import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from 'fs/promises';

class ImagePickerService {
  constructor() {
    this.imageGraph = null;
    this.imageCatalog = null;
    this.basePath = path.join(__dirname, '../public/sharepic_example_bg/');
  }

  async initialize() {
    if (!this.imageGraph) {
      // Dynamic import for ES module
      const { createImageSelectionGraph } = await import('../agents/langgraph/imageSelectionGraph.mjs');
      this.imageGraph = createImageSelectionGraph();
      console.log('[ImagePicker] LangGraph service initialized');
    }

    if (!this.imageCatalog) {
      const catalogPath = path.join(this.basePath, 'image_alt_texts.json');
      const catalogData = await fs.readFile(catalogPath, 'utf8');
      this.imageCatalog = JSON.parse(catalogData);
      console.log(`[ImagePicker] Loaded ${this.imageCatalog.images.length} images from catalog`);
    }
  }

  async selectBestImage(text, aiWorkerPool, options = {}, req = null) {
    await this.initialize();

    const sharepicType = options.sharepicType || 'general';

    try {
      console.log(`[ImagePicker] Using LangGraph for image selection: "${text.substring(0, 50)}..."`);

      const result = await this.imageGraph.invoke({
        text,
        sharepicType,
        aiWorkerPool,
        req
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        selectedImage: result.selectedImage,
        confidence: result.confidence,
        reasoning: result.reasoning,
        alternatives: result.alternatives || [],
        metadata: {
          totalImages: result.metadata?.totalImages || 0,
          candidatesFound: result.metadata?.totalImagesConsidered || result.metadata?.totalImages || 0,
          themes: [], // No longer extract themes separately
          keywords: [], // Keywords now embedded in direct matching
          processingMethod: result.metadata?.selectionMethod || 'direct_description_matching'
        }
      };

    } catch (error) {
      console.error('[ImagePicker] LangGraph selection failed:', error);
      throw new Error(`Image selection failed: ${error.message}`);
    }
  }

  getImagePath(filename) {
    return path.join(this.basePath, filename);
  }

  async validateImageExists(filename) {
    try {
      const imagePath = this.getImagePath(filename);
      const { default: fs } = await import('fs/promises');
      await fs.access(imagePath);
      return true;
    } catch {
      return false;
    }
  }

  getStats() {
    return {
      serviceName: 'LangGraph Image Picker',
      method: 'two-step-ai-selection',
      initialized: !!this.imageGraph
    };
  }

  clearCache() {
    console.log('[ImagePicker] Cache clear requested (no cache in LangGraph version)');
  }
}

const instance = new ImagePickerService();
export default instance;