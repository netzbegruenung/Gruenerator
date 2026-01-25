/**
 * LoadCatalogNode - Loads image catalog from JSON file
 */

import fs from 'fs/promises';
import path from 'path';
import type { ImageSelectionState, ImageCatalog } from '../types.js';

/**
 * Load image catalog from file system
 */
export async function loadCatalogNode(
  state: ImageSelectionState
): Promise<Partial<ImageSelectionState>> {
  try {
    const catalogPath = path.join(process.cwd(), 'public/sharepic_example_bg/image_alt_texts.json');
    const catalogData = await fs.readFile(catalogPath, 'utf8');
    const imageCatalog: ImageCatalog = JSON.parse(catalogData);

    console.log(`[ImageSelection] Loaded ${imageCatalog.images.length} images from catalog`);

    return {
      imageCatalog,
      metadata: {
        ...state.metadata,
        totalImages: imageCatalog.images.length,
        selectionMethod: 'direct_description_matching',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ImageSelection] Failed to load image catalog:', errorMessage);

    return {
      error: 'Failed to load image catalog',
    };
  }
}
