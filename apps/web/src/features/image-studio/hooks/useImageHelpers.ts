import { useCallback, useMemo } from 'react';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { getTypeConfig } from '../utils/typeConfig';
import { blobToBase64 } from '../utils/templateResultUtils';
import type { ShareMetadata, ColorSchemeItem } from '../types/templateResultTypes';

interface UseImageHelpersReturn {
  blobToBase64: (blob: Blob) => Promise<string>;
  getOriginalImageBase64: () => Promise<string | null>;
  buildShareMetadata: () => ShareMetadata;
  currentImagePreview: string | null;
}

export const useImageHelpers = (): UseImageHelpersReturn => {
  const {
    type,
    uploadedImage,
    selectedImage,
    fontSize,
    colorScheme,
    balkenOffset,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    searchTerms,
    sloganAlternatives,
    quote,
    name,
    header,
    subheader,
    body,
    line1,
    line2,
    line3,
    eventTitle,
    weekday,
    date,
    time,
    locationName,
    address,
    purePrompt,
    precisionInstruction,
    sharepicPrompt,
    variant,
    imagineTitle
  } = useImageStudioStore();

  const typeConfig = useMemo(() => getTypeConfig(type || ''), [type]);

  const getOriginalImageBase64 = useCallback(async (): Promise<string | null> => {
    if (uploadedImage) {
      return await blobToBase64(uploadedImage);
    }
    // Handle Unsplash images (urls.regular)
    if (selectedImage?.urls?.regular) {
      try {
        const response = await fetch(selectedImage.urls.regular);
        const blob = await response.blob();
        return await blobToBase64(blob);
      } catch (error) {
        console.error('Failed to fetch original image from Unsplash:', error);
      }
    }
    // Handle stock images from server (path property)
    const imagePath = (selectedImage as unknown as { path?: string })?.path;
    if (imagePath) {
      try {
        const response = await fetch(imagePath);
        const blob = await response.blob();
        return await blobToBase64(blob);
      } catch (error) {
        console.error('Failed to fetch original stock image:', error);
      }
    }
    return null;
  }, [uploadedImage, selectedImage]);

  const buildShareMetadata = useCallback((): ShareMetadata => {
    const legacyType = typeConfig?.legacyType || type || '';
    const hasOriginal = !!(uploadedImage || selectedImage);

    const metadata: ShareMetadata = {
      sharepicType: legacyType,
      hasOriginalImage: hasOriginal,
      content: {},
      styling: {
        fontSize,
        colorScheme: colorScheme as unknown as ColorSchemeItem[],
        balkenOffset,
        balkenGruppenOffset,
        sunflowerOffset,
        credit,
      },
      searchTerms,
      sloganAlternatives,
    };

    if (typeConfig?.usesFluxApi) {
      metadata.kiConfig = {
        kiType: type || '',
        prompt: purePrompt || precisionInstruction || sharepicPrompt || null,
        variant: variant || null,
        imagineTitle: imagineTitle || null,
      };
      metadata.content = {};
    } else if (legacyType === 'Zitat' || legacyType === 'Zitat_Pure') {
      metadata.content = { quote, name };
    } else if (legacyType === 'Info') {
      metadata.content = { header, subheader, body };
    } else if (legacyType === 'Veranstaltung') {
      metadata.content = { eventTitle, line1, line2, line3, weekday, date, time, locationName, address };
    } else {
      metadata.content = { line1, line2, line3 };
    }

    return metadata;
  }, [typeConfig, type, fontSize, colorScheme, balkenOffset, balkenGruppenOffset,
    sunflowerOffset, credit, searchTerms, sloganAlternatives, quote, name,
    header, subheader, body, line1, line2, line3, uploadedImage, selectedImage,
    eventTitle, weekday, date, time, locationName, address,
    purePrompt, precisionInstruction, sharepicPrompt, variant, imagineTitle]);

  const currentImagePreview = useMemo((): string | null => {
    if (uploadedImage && uploadedImage instanceof Blob) {
      return URL.createObjectURL(uploadedImage);
    }
    if (selectedImage?.urls?.small) {
      return selectedImage.urls.small;
    }
    return null;
  }, [uploadedImage, selectedImage]);

  return {
    blobToBase64,
    getOriginalImageBase64,
    buildShareMetadata,
    currentImagePreview
  };
};

export default useImageHelpers;
