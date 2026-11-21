/**
 * useMediaUpload hook
 *
 * Wraps the upload API in @tanstack/react-query's useMutation. On success,
 * invalidates the ['media-library'] query key so every consumer of
 * useMediaLibrary refreshes automatically. Progress is tracked in local state
 * since react-query's mutation status doesn't expose upload progress.
 */

import { MAX_AUDIO_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@gruenerator/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { mediaApi } from '../api/index.js';
import {
  MAX_FILE_SIZE,
  SUPPORTED_AUDIO_TYPES,
  SUPPORTED_MIME_LABEL,
  SUPPORTED_MIME_TYPES,
} from '../constants.js';

import { MEDIA_LIBRARY_QUERY_KEY } from './useMediaLibrary.js';

import type { MediaUploadResult, UploadSource } from '../types.js';

interface UploadOptions {
  title?: string;
  altText?: string;
  uploadSource?: UploadSource;
}

/**
 * Sends a video or audio file in resumable chunks and imports it into the
 * Mediathek. Injected by the app because the tus client is not a dependency of
 * this package (mobile consumes it too); without it the hook stays on the 50 MB
 * multipart route for everything.
 */
export type ResumableUpload = (
  file: File,
  options: { title?: string; onProgress: (percent: number) => void }
) => Promise<MediaUploadResult>;

interface UseMediaUploadOptions {
  resumableUpload?: ResumableUpload;
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

/** Video and audio go in chunks; images stay on the multipart route. */
function usesResumableUpload(file: File | Blob): boolean {
  return file.type.startsWith('video/') || file.type.startsWith('audio/');
}

function formatLimit(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function useMediaUpload(options: UseMediaUploadOptions = {}): UseMediaUploadReturn {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { resumableUpload } = options;

  const validateFile = useCallback(
    (file: File | Blob): { valid: boolean; error?: string } => {
      const resumable = resumableUpload !== undefined && usesResumableUpload(file);
      const isAudio = SUPPORTED_AUDIO_TYPES.includes(
        file.type as (typeof SUPPORTED_AUDIO_TYPES)[number]
      );
      if (
        !SUPPORTED_MIME_TYPES.includes(file.type as (typeof SUPPORTED_MIME_TYPES)[number]) &&
        !(resumableUpload !== undefined && isAudio)
      ) {
        return {
          valid: false,
          error: `Dateityp nicht unterstützt. Erlaubt: ${SUPPORTED_MIME_LABEL}`,
        };
      }
      const limit = !resumable
        ? MAX_FILE_SIZE
        : file.type.startsWith('video/')
          ? MAX_VIDEO_UPLOAD_BYTES
          : MAX_AUDIO_BYTES;
      if (file.size > limit) {
        return { valid: false, error: `Datei ist zu groß. Maximum: ${formatLimit(limit)}` };
      }
      return { valid: true };
    },
    [resumableUpload]
  );

  const mutation = useMutation<MediaUploadResult, Error, UploadVariables>({
    onMutate: () => {
      setProgress(0);
      setValidationError(null);
    },
    mutationFn: async ({ file, options: uploadOptions }) => {
      if (resumableUpload && file instanceof File && usesResumableUpload(file)) {
        return resumableUpload(file, {
          ...(uploadOptions.title != null && { title: uploadOptions.title }),
          onProgress: setProgress,
        });
      }
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
