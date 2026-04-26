/**
 * useMediaUpload hook
 *
 * Wraps the upload API in @tanstack/react-query's useMutation. On success,
 * invalidates the ['media-library'] query key so every consumer of
 * useMediaLibrary refreshes automatically. Progress is tracked in local state
 * since react-query's mutation status doesn't expose upload progress.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { mediaApi } from '../api/index.js';
import { MAX_FILE_SIZE, SUPPORTED_MIME_TYPES } from '../constants.js';

import { MEDIA_LIBRARY_QUERY_KEY } from './useMediaLibrary.js';

import type { MediaUploadResult, UploadSource } from '../types.js';

interface UploadOptions {
  title?: string;
  altText?: string;
  uploadSource?: UploadSource;
}

interface UseMediaUploadOptions {
  onSuccess?: (result: MediaUploadResult) => void;
  onError?: (error: string) => void;
}

interface UseMediaUploadReturn {
  upload: (file: File | Blob, options?: UploadOptions) => Promise<MediaUploadResult | null>;
  reset: () => void;
  validateFile: (file: File | Blob) => { valid: boolean; error?: string };
  isUploading: boolean;
  progress: number;
  error: string | null;
  result: MediaUploadResult | null;
}

interface UploadVariables {
  file: File | Blob;
  options: UploadOptions;
}

export function useMediaUpload(options: UseMediaUploadOptions = {}): UseMediaUploadReturn {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateFile = useCallback((file: File | Blob): { valid: boolean; error?: string } => {
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Datei ist zu groß. Maximum: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
      };
    }
    if (!SUPPORTED_MIME_TYPES.includes(file.type as (typeof SUPPORTED_MIME_TYPES)[number])) {
      return {
        valid: false,
        error: 'Dateityp nicht unterstützt. Erlaubt: JPEG, PNG, WebP, GIF, MP4, WebM',
      };
    }
    return { valid: true };
  }, []);

  const mutation = useMutation<MediaUploadResult, Error, UploadVariables>({
    onMutate: () => {
      setProgress(0);
      setValidationError(null);
    },
    mutationFn: async ({ file, options: uploadOptions }) => {
      const response = await mediaApi.uploadMedia(file, {
        ...(uploadOptions.title != null && { title: uploadOptions.title }),
        ...(uploadOptions.altText != null && { altText: uploadOptions.altText }),
        ...(uploadOptions.uploadSource != null && { uploadSource: uploadOptions.uploadSource }),
        onProgress: setProgress,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Upload failed');
      }
      return response.data;
    },
    onSuccess: (data) => {
      setProgress(100);
      void queryClient.invalidateQueries({ queryKey: MEDIA_LIBRARY_QUERY_KEY });
      options.onSuccess?.(data);
    },
    onError: (err) => {
      setProgress(0);
      options.onError?.(err.message);
    },
  });

  const upload = useCallback(
    async (
      file: File | Blob,
      uploadOptions: UploadOptions = {}
    ): Promise<MediaUploadResult | null> => {
      const validation = validateFile(file);
      if (!validation.valid) {
        const errorMessage = validation.error ?? 'Invalid file';
        setValidationError(errorMessage);
        options.onError?.(errorMessage);
        return null;
      }
      try {
        return await mutation.mutateAsync({ file, options: uploadOptions });
      } catch {
        return null;
      }
    },
    [validateFile, mutation, options]
  );

  const reset = useCallback(() => {
    mutation.reset();
    setProgress(0);
    setValidationError(null);
  }, [mutation]);

  return {
    upload,
    reset,
    validateFile,
    isUploading: mutation.isPending,
    progress,
    error: validationError ?? mutation.error?.message ?? null,
    result: mutation.data ?? null,
  };
}
