import { useEffect, useRef } from 'react';

interface WebSearchConfig {
  enabled: boolean;
}

interface PrivacyModeConfig {
  enabled: boolean;
}

interface UseFormStateSyncingParams {
  // Props to sync
  propLoading?: boolean;
  propSuccess?: boolean;
  propError?: string | Error | { message?: string } | null;
  propFormErrors?: Record<string, string>;
  useWebSearchFeatureToggle?: boolean;
  usePrivacyModeToggle?: boolean;
  propUseFeatureIcons?: boolean;
  propAttachedFiles?: unknown[];
  propUploadedImage?: unknown;

  // Store state (for comparison)
  storeFormErrors: Record<string, string>;
  storeWebSearchConfig: WebSearchConfig;
  storePrivacyModeConfig: PrivacyModeConfig;
  storeUseFeatureIcons: boolean;
  storeAttachedFiles: unknown[];
  storeUploadedImage: unknown;
  storeError: string | null;

  // Store actions
  setStoreLoading: (loading: boolean) => void;
  setStoreSuccess: (success: boolean) => void;
  setStoreError: (error: string | null) => void;
  setStoreFormErrors: (errors: Record<string, string>) => void;
  setStoreWebSearchEnabled: (enabled: boolean) => void;
  setStorePrivacyModeEnabled: (enabled: boolean) => void;
  setStoreUseFeatureIcons: (use: boolean) => void;
  setStoreAttachedFiles: (files: unknown[]) => void;
  setStoreUploadedImage: (image: unknown) => void;

  // Error handlers
  handleFormError: (error: string, field?: string) => void;
  setError: (error: string | Error | null) => void;
}

export function useFormStateSyncing(params: UseFormStateSyncingParams): void {
  const {
    propLoading,
    propSuccess,
    propError,
    propFormErrors,
    useWebSearchFeatureToggle,
    usePrivacyModeToggle,
    propUseFeatureIcons,
    propAttachedFiles,
    propUploadedImage,
    storeWebSearchConfig,
    storePrivacyModeConfig,
    storeUseFeatureIcons,
    setStoreLoading,
    setStoreSuccess,
    setStoreError,
    setStoreFormErrors,
    setStoreWebSearchEnabled,
    setStorePrivacyModeEnabled,
    setStoreUseFeatureIcons,
    setStoreAttachedFiles,
    setStoreUploadedImage,
    handleFormError,
    setError,
  } = params;

  // Sync loading
  useEffect(() => {
    if (propLoading !== undefined) {
      setStoreLoading(propLoading);
    }
  }, [propLoading, setStoreLoading]);

  // Sync success
  useEffect(() => {
    if (propSuccess !== undefined) {
      setStoreSuccess(propSuccess);
    }
  }, [propSuccess, setStoreSuccess]);

  // Sync form errors
  const prevFormErrorsRef = useRef(propFormErrors);
  useEffect(() => {
    const prev = prevFormErrorsRef.current;
    const next = propFormErrors;
    prevFormErrorsRef.current = next;

    if (!next || Object.keys(next).length === 0) return;
    if (prev === next) return;

    const prevKeys = prev ? Object.keys(prev) : [];
    const nextKeys = Object.keys(next);
    if (
      prevKeys.length === nextKeys.length &&
      nextKeys.every((key) => prev?.[key] === next[key])
    )
      return;

    setStoreFormErrors(next);
  }, [propFormErrors, setStoreFormErrors]);

  // Sync web search toggle
  useEffect(() => {
    if (
      useWebSearchFeatureToggle !== undefined &&
      useWebSearchFeatureToggle !== storeWebSearchConfig.enabled
    ) {
      setStoreWebSearchEnabled(useWebSearchFeatureToggle);
    }
  }, [useWebSearchFeatureToggle, storeWebSearchConfig.enabled, setStoreWebSearchEnabled]);

  // Sync privacy mode toggle
  useEffect(() => {
    if (
      usePrivacyModeToggle !== undefined &&
      usePrivacyModeToggle !== storePrivacyModeConfig.enabled
    ) {
      setStorePrivacyModeEnabled(usePrivacyModeToggle);
    }
  }, [usePrivacyModeToggle, storePrivacyModeConfig.enabled, setStorePrivacyModeEnabled]);

  // Sync feature icons
  useEffect(() => {
    if (propUseFeatureIcons !== undefined && propUseFeatureIcons !== storeUseFeatureIcons) {
      setStoreUseFeatureIcons(propUseFeatureIcons);
    }
  }, [propUseFeatureIcons, storeUseFeatureIcons, setStoreUseFeatureIcons]);

  // Sync attached files
  const prevAttachedFilesRef = useRef(propAttachedFiles);
  useEffect(() => {
    const prev = prevAttachedFilesRef.current;
    const next = propAttachedFiles;
    prevAttachedFilesRef.current = next;

    if (!next?.length) return;
    if (prev === next) return;
    if (prev?.length === next.length && prev.every((f, i) => f === next[i])) return;

    setStoreAttachedFiles(next);
  }, [propAttachedFiles, setStoreAttachedFiles]);

  // Sync uploaded image
  const prevUploadedImageRef = useRef(propUploadedImage);
  useEffect(() => {
    const prev = prevUploadedImageRef.current;
    const next = propUploadedImage;
    prevUploadedImageRef.current = next;

    if (!next) return;
    if (prev === next) return;

    setStoreUploadedImage(next);
  }, [propUploadedImage, setStoreUploadedImage]);

  // Handle errors separately
  const prevErrorRef = useRef(propError);
  useEffect(() => {
    const prev = prevErrorRef.current;
    const next = propError;
    prevErrorRef.current = next;

    if (!next) return;
    if (prev === next) return;

    let errorMessage = 'Ein Fehler ist aufgetreten';
    if (typeof next === 'string') {
      errorMessage = next;
    } else if (next instanceof Error) {
      errorMessage = next.message || errorMessage;
    } else if (next && typeof next === 'object' && 'message' in next) {
      errorMessage = (next as { message?: string }).message || errorMessage;
    }

    if (typeof next === 'string' || next instanceof Error) {
      setError(next);
    } else {
      setError(errorMessage);
    }
    setStoreError(errorMessage);
    handleFormError(errorMessage, 'form');
  }, [propError, setError, setStoreError, handleFormError]);
}
