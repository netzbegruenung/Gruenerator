import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/logger.js';

import type {
  ImageCatalog,
  ImageCatalogEntry,
  ImageSelectionOptions,
  ImageSelectionResult,
  ImageSelectionServiceStats,
} from './types.js';

const log = createLogger('ImageSelectionService');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ImageGraphResult {
  error?: string;
  selectedImage: ImageCatalogEntry;
  confidence: number;
  reasoning: string;
  alternatives: ImageCatalogEntry[];
  metadata?: {
    totalImages?: number;
    totalImagesConsidered?: number;
    selectionMethod?: string;
  };
}

class ImageSelectionService {
  private imageGraph: { invoke: (input: unknown) => Promise<ImageGraphResult> } | null = null;
  private imageCatalog: ImageCatalog | null = null;
  private readonly basePath: string;

  constructor() {
    this.basePath = path.join(__dirname, '../../public/sharepic_example_bg/');
  }

  async initialize(): Promise<void> {
    if (!this.imageGraph) {
      const { imageSelectionGraph } =
        await import('../../agents/langgraph/ImageSelectionGraph/index.js');
      this.imageGraph = imageSelectionGraph as unknown as typeof this.imageGraph;
      log.debug('[ImageSelectionService] LangGraph service initialized');
    }

    if (!this.imageCatalog) {
      const catalogPath = path.join(this.basePath, 'image_alt_texts.json');
      const catalogData = await fs.readFile(catalogPath, 'utf8');
      this.imageCatalog = JSON.parse(catalogData) as ImageCatalog;
      log.debug(
        `[ImageSelectionService] Loaded ${this.imageCatalog.images.length} images from catalog`
      );
    }
  }

  async selectBestImage(
    text: string,
    aiWorkerPool: unknown,
    options: ImageSelectionOptions = {},
    req: unknown = null
  ): Promise<ImageSelectionResult> {
    await this.initialize();

    const sharepicType = options.sharepicType || 'general';

    try {
      log.debug(
        `[ImageSelectionService] Using LangGraph for image selection: "${text.substring(0, 50)}..."`
      );

      const result = await this.imageGraph!.invoke({
        text,
        sharepicType,
        aiWorkerPool,
        req,
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
          candidatesFound:
            result.metadata?.totalImagesConsidered || result.metadata?.totalImages || 0,
          themes: [],
          keywords: [],
          processingMethod: result.metadata?.selectionMethod || 'direct_description_matching',
        },
      };
    } catch (error: unknown) {
      log.error('[ImageSelectionService] LangGraph selection failed:', { error });
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
      serviceName: 'LangGraph Image Picker',
      method: 'two-step-ai-selection',
      initialized: !!this.imageGraph,
    };
  }

  getCatalog(): ImageCatalog | null {
    return this.imageCatalog;
  }

  clearCache(): void {
    log.debug('[ImageSelectionService] Cache clear requested (no cache in LangGraph version)');
  }
}

const instance = new ImageSelectionService();
export default instance;
export { ImageSelectionService };
