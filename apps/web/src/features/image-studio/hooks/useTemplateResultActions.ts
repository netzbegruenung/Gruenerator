import { useShareStore } from '@gruenerator/shared/share';
import { useState, useCallback } from 'react';

import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import { useGenerateSocialPost } from '../../../components/hooks/useGenerateSocialPost';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { formatDownloadFilename } from '../utils/templateResultUtils';
import { getTypeConfig } from '../utils/typeConfig';

import { useImageHelpers } from './useImageHelpers';


interface GeneratedPosts {
  instagram?: string;
  [key: string]: string | undefined;
}

interface UseTemplateResultActionsReturn {
  handleDownload: () => void;
  handleShareToInstagram: () => Promise<void>;
  handleGenerateAltText: () => Promise<void>;
  handleGenerateInstagramText: () => Promise<void>;
  handleTextButtonClick: () => Promise<void>;
  handleGalleryUpdate: () => Promise<void>;
  isSharing: boolean;
  copied: boolean;
  updateSuccess: boolean;
  altText: string;
  isAltTextLoading: boolean;
  generatedPosts: GeneratedPosts;
  socialLoading: boolean;
  hasGeneratedText: boolean;
}

export const useTemplateResultActions = (): UseTemplateResultActionsReturn => {
  const {
    type,
    generatedImageSrc,
    line1,
    line2,
    line3,
    quote,
    header,
    subheader,
    body,
    galleryEditMode,
    editShareToken,
    editTitle,
  } = useImageStudioStore();

  const { updateImageShare, isCreating: isUpdating } = useShareStore();
  const { getOriginalImageBase64, buildShareMetadata } = useImageHelpers();
  const { generateAltTextForImage } = useAltTextGeneration();
  const socialPostHook = useGenerateSocialPost() as unknown as {
    generatedPosts: GeneratedPosts;
    generatePost: (
      thema: string,
      details: string,
      platforms: string[],
      includeActionIdeas: boolean
    ) => Promise<unknown>;
    loading: boolean;
  };
  const { generatedPosts, generatePost, loading: socialLoading } = socialPostHook;

  const typeConfig = getTypeConfig(type || '');

  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [altText, setAltText] = useState('');
  const [isAltTextLoading, setIsAltTextLoading] = useState(false);

  const hasGeneratedText = !!(altText || generatedPosts?.instagram);

  const handleDownload = useCallback(() => {
    if (!generatedImageSrc) return;
    const link = document.createElement('a');
    link.href = generatedImageSrc;
    link.download = formatDownloadFilename(type);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generatedImageSrc, type]);

  const handleShareToInstagram = useCallback(async () => {
    if (!generatedImageSrc) return;
    setIsSharing(true);
    try {
      const response = await fetch(generatedImageSrc);
      const blob = await response.blob();
      const file = new File([blob], 'sharepic.png', { type: 'image/png' });

      await navigator.share({
        files: [file],
        title: 'Grünerator Sharepic',
        text: generatedPosts?.instagram || '',
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    } finally {
      setIsSharing(false);
    }
  }, [generatedImageSrc, generatedPosts?.instagram]);

  const handleGenerateAltText = useCallback(async () => {
    if (isAltTextLoading || !generatedImageSrc) return;

    setIsAltTextLoading(true);
    try {
      const imageBase64 = generatedImageSrc.replace(/^data:image\/[^;]+;base64,/, '');
      const contextText = `${line1} ${line2} ${line3}`.trim();
      const response = await generateAltTextForImage(imageBase64, contextText || null);
      if (response?.altText && typeof response.altText === 'string') {
        setAltText(response.altText);
      }
    } catch (error) {
      console.error('[useTemplateResultActions] Alt text generation failed:', error);
    } finally {
      setIsAltTextLoading(false);
    }
  }, [generatedImageSrc, generateAltTextForImage, line1, line2, line3, isAltTextLoading]);

  const handleGenerateInstagramText = useCallback(async () => {
    if (socialLoading || generatedPosts?.instagram) return;

    const sharepicContent = [line1, line2, line3, quote, header, subheader, body]
      .filter(Boolean)
      .join(' ');

    if (!sharepicContent.trim()) return;

    await generatePost(sharepicContent, `Sharepic Typ: ${type}`, ['instagram'], false);
  }, [
    line1,
    line2,
    line3,
    quote,
    header,
    subheader,
    body,
    type,
    generatePost,
    socialLoading,
    generatedPosts?.instagram,
  ]);

  const handleTextButtonClick = useCallback(async () => {
    if (hasGeneratedText) {
      const textToCopy = [altText ? `Alt-Text: ${altText}` : '', generatedPosts?.instagram || '']
        .filter(Boolean)
        .join('\n\n');

      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
    } else {
      handleGenerateInstagramText();
      handleGenerateAltText();
    }
  }, [
    hasGeneratedText,
    altText,
    generatedPosts?.instagram,
    handleGenerateInstagramText,
    handleGenerateAltText,
  ]);

  const handleGalleryUpdate = useCallback(async () => {
    if (!galleryEditMode || !editShareToken || !generatedImageSrc) return;

    try {
      const originalImage = await getOriginalImageBase64();
      const metadata = buildShareMetadata();

      await updateImageShare({
        shareToken: editShareToken,
        imageBase64: generatedImageSrc,
        title: editTitle || undefined,
        metadata,
        originalImage: originalImage || undefined,
      });

      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update sharepic:', error);
      alert(
        'Fehler beim Aktualisieren: ' +
          (error instanceof Error ? error.message : 'Unbekannter Fehler')
      );
    }
  }, [
    galleryEditMode,
    editShareToken,
    editTitle,
    generatedImageSrc,
    getOriginalImageBase64,
    buildShareMetadata,
    updateImageShare,
  ]);

  return {
    handleDownload,
    handleShareToInstagram,
    handleGenerateAltText,
    handleGenerateInstagramText,
    handleTextButtonClick,
    handleGalleryUpdate,
    isSharing,
    copied,
    updateSuccess,
    altText,
    isAltTextLoading,
    generatedPosts,
    socialLoading,
    hasGeneratedText,
  };
};

export default useTemplateResultActions;
