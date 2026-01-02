/**
 * useMediaUpload hook
 * Handles media upload with progress tracking
 */

import { useState, useCallback } from 'react';
import { mediaApi } from '../api/index.js';
import { SUPPORTED_MIME_TYPES, MAX_FILE_SIZE } from '../constants.js';
import type { MediaUploadResult, UploadSource } from '../types.js';

interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  result: MediaUploadResult | null;
}

interface UseMediaUploadOptions {
  onSuccess?: (result: MediaUploadResult) => void;
  onError?: (error: string) => void;
}

interface UseMediaUploadReturn extends UploadState {
  upload: (file: File | Blob, options?: UploadOptions) => Promise<MediaUploadResult | null>;
  reset: () => void;
  validateFile: (file: File | Blob) => { valid: boolean; error?: string };
}

interface UploadOptions {
  title?: string;
  altText?: string;
  uploadSource?: UploadSource;
}

const initialState: UploadState = {
  isUploading: false,
  progress: 0,
  error: null,
  result: null,
};

export function useMediaUpload(options: UseMediaUploadOptions = {}): UseMediaUploadReturn {
  const [state, setState] = useState<UploadState>(initialState);

  const validateFile = useCallback((file: File | Blob): { valid: boolean; error?: string } => {
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Datei ist zu groß. Maximum: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
      };
    }

    if (!SUPPORTED_MIME_TYPES.includes(file.type as typeof SUPPORTED_MIME_TYPES[number])) {
      return {
        valid: false,
        error: 'Dateityp nicht unterstützt. Erlaubt: JPEG, PNG, WebP, GIF, MP4, WebM',
      };
    }

    return { valid: true };
  }, []);

  const upload = useCallback(async (
    file: File | Blob,
    uploadOptions: UploadOptions = {}
  ): Promise<MediaUploadResult | null> => {
    const validation = validateFile(file);
    if (!validation.valid) {
      setState(prev => ({ ...prev, error: validation.error || 'Invalid file' }));
      options.onError?.(validation.error || 'Invalid file');
      return null;
    }

    setState({
      isUploading: true,
      progress: 0,
      error: null,
      result: null,
    });

    try {
      const response = await mediaApi.uploadMedia(file, {
        title: uploadOptions.title,
        altText: uploadOptions.altText,
        uploadSource: uploadOptions.uploadSource,
        onProgress: (progress) => {
          setState(prev => ({ ...prev, progress }));
        },
      });

      if (response.success && response.data) {
        setState({
          isUploading: false,
          progress: 100,
          error: null,
          result: response.data,
        });
        options.onSuccess?.(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setState({
        isUploading: false,
        progress: 0,
        error: errorMessage,
        result: null,
      });
      options.onError?.(errorMessage);
      return null;
    }
  }, [validateFile, options]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    ...state,
    upload,
    reset,
    validateFile,
  };
}
