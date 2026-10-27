import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { selectCatalogImage } from './selectCatalogImage.js';

import type {
  ImageCatalog,
  ImageSelectionOptions,
  ImageSelectionResult,
  ImageSelectionServiceStats,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ImageSelectionService {
  private imageCatalog: ImageCatalog | null = null;
  private readonly basePath: string;

  constructor() {
    this.basePath = path.join(__dirname, '../../public/sharepic_example_bg/');
  }

  stockImagePath(filename: string): string {
    return path.join(this.basePath, path.basename(filename));
  }

  async initialize(): Promise<void> {
    if (!this.imageCatalog) {
      const catalogPath = path.join(this.basePath, 'image_alt_texts.json');
      const catalogData = await fs.readFile(catalogPath, 'utf8');
      this.imageCatalog = JSON.parse(catalogData) as ImageCatalog;
      console.log(
        `[ImageSelectionService] Loaded ${this.imageCatalog.images.length} images from catalog`
      );
    }
  }

  async selectBestImage(
    text: string,
    options: ImageSelectionOptions = {}
  ): Promise<ImageSelectionResult> {
    await this.initialize();

    const sharepicType = options.sharepicType || 'general';
    const images = this.imageCatalog!.images;

    try {
      const result = await selectCatalogImage(text, sharepicType, images);

      return {
        selectedImage: result.selectedImage,
        confidence: result.confidence,
        reasoning: result.reasoning,
        alternatives: result.alternatives,
        metadata: {
          totalImages: images.length,
          candidatesFound: images.length,
          themes: [],
          keywords: [],
          processingMethod: result.selectionMethod,
        },
      };
    } catch (error: unknown) {
      console.error('[ImageSelectionService] Image selection failed:', error);
      throw new Error(
        `Image selection failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  getImagePath(filename: string): string {
    return path.join(this.basePath, filename);
  }

  async validateImageExists(filename: string): Promise<boolean> {
    try {
      const imagePath = this.getImagePath(filename);
      await fs.access(imagePath);
      return true;
    } catch {
      return false;
    }
  }

  getStats(): ImageSelectionServiceStats {
    return {
      serviceName: 'AI Image Picker',
      method: 'two-step-ai-selection',
      initialized: !!this.imageCatalog,
    };
  }

  getCatalog(): ImageCatalog | null {
    return this.imageCatalog;
  }

  clearCache(): void {
    console.log('[ImageSelectionService] Cache clear requested (no cache)');
  }
}

const instance = new ImageSelectionService();
export default instance;
export { ImageSelectionService };
