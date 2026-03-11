import { getGlobalApiClient } from '@gruenerator/shared/api';
import { File, Paths } from 'expo-file-system';

import { getErrorMessage } from '../utils/errors';

import type { StockImage } from '@gruenerator/shared/image-studio';

export interface MobileImageResult {
  uri: string;
  base64: string;
}

export async function fetchStockImageForMobile(image: StockImage): Promise<MobileImageResult> {
  try {
    const apiClient = getGlobalApiClient();
    const imageUrl = `${apiClient.defaults.baseURL}/image-picker/stock-image/${image.filename}`;

    const destination = new File(Paths.cache, `stock_${Date.now()}_${image.filename}`);
    const downloaded = await File.downloadFileAsync(imageUrl, destination);

    const base64 = await downloaded.base64();
    const mimeType = image.filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

    return {
      uri: downloaded.uri,
      base64: `data:${mimeType};base64,${base64}`,
    };
  } catch (error: unknown) {
    console.error('[imageSourceService] fetchStockImageForMobile error:', getErrorMessage(error));
    throw new Error('Das Stock-Bild konnte nicht geladen werden.');
  }
}

export async function fetchUnsplashImageForMobile(image: StockImage): Promise<MobileImageResult> {
  if (!image.url) {
    throw new Error('Image URL is required');
  }

  try {
    const destination = new File(Paths.cache, `unsplash_${Date.now()}.jpg`);
    const downloaded = await File.downloadFileAsync(image.url, destination);

    const base64 = await downloaded.base64();

    return {
      uri: downloaded.uri,
      base64: `data:image/jpeg;base64,${base64}`,
    };
  } catch (error: unknown) {
    console.error(
      '[imageSourceService] fetchUnsplashImageForMobile error:',
      getErrorMessage(error)
    );
    throw new Error('Das Unsplash-Bild konnte nicht geladen werden.');
  }
}
