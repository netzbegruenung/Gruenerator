import imagePickerService from '../../../../services/image/ImageSelectionService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { FlyerToSiteState } from '../types.js';

const log = createLogger('FlyerToSite:images');

export async function selectImagesNode(
  state: FlyerToSiteState
): Promise<Partial<FlyerToSiteState>> {
  const startTime = Date.now();

  if (!state.websiteContent) {
    return {
      websiteContentWithImages: null,
      imageTimeMs: Date.now() - startTime,
      error: state.error || 'Kein Website-Inhalt vorhanden.',
    };
  }

  try {
    const content = { ...state.websiteContent };
    const aiWorkerPool = state.req.app.locals.aiWorkerPool;

    const pickImage = async (text: string): Promise<string> => {
      try {
        const result = await imagePickerService.selectBestImage(
          text,
          aiWorkerPool,
          { maxCandidates: 5 },
          state.req
        );
        return `/api/image-picker/stock-image/${result.selectedImage.filename}`;
      } catch (err) {
        log.warn('Image picker failed', { error: (err as Error).message });
        return '';
      }
    };

    const imagePromises = [
      pickImage(`${content.hero_image.title} ${content.hero_image.subtitle}`),
      ...content.themes.map((theme) => pickImage(`${theme.title} ${theme.content}`)),
      ...content.actions.map((action) => pickImage(action.text)),
      pickImage(`${content.contact.title} Kontakt Politik Grüne`),
    ];

    const imageResults = await Promise.all(imagePromises);

    content.hero_image = { ...content.hero_image, imageUrl: imageResults[0] };
    content.themes = content.themes.map((theme, i) => ({
      ...theme,
      imageUrl: imageResults[1 + i] || '',
    }));
    content.actions = content.actions.map((action, i) => ({
      ...action,
      imageUrl: imageResults[1 + content.themes.length + i] || '',
    }));
    content.contact = {
      ...content.contact,
      backgroundImageUrl: imageResults[imageResults.length - 1],
    };

    log.debug('Image selection complete', {
      heroImage: !!imageResults[0],
      themeImages: imageResults.slice(1, 4).filter(Boolean).length,
      contactImage: !!imageResults[imageResults.length - 1],
    });

    return {
      websiteContentWithImages: content,
      imageTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    log.error('Image selection failed', { error: (err as Error).message });
    return {
      websiteContentWithImages: state.websiteContent,
      imageTimeMs: Date.now() - startTime,
    };
  }
}
