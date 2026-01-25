import { useEffect } from 'react';

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
    storeFormErrors,
    storeWebSearchConfig,
    storePrivacyModeConfig,
    storeUseFeatureIcons,
    storeAttachedFiles,
    storeUploadedImage,
    storeError,
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
  useEffect(() => {
    if (propFormErrors && Object.keys(propFormErrors).length > 0) {
      const currentErrorsLength = Object.keys(storeFormErrors).length;
      if (Object.keys(propFormErrors).length !== currentErrorsLength) {
        setStoreFormErrors(propFormErrors);
      }
    }
  }, [propFormErrors, storeFormErrors, setStoreFormErrors]);

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
  useEffect(() => {
    if (propAttachedFiles?.length && propAttachedFiles.length !== storeAttachedFiles.length) {
      setStoreAttachedFiles(propAttachedFiles);
    }
  }, [propAttachedFiles, storeAttachedFiles.length, setStoreAttachedFiles]);

  // Sync uploaded image
  useEffect(() => {
    if (propUploadedImage && propUploadedImage !== storeUploadedImage) {
      setStoreUploadedImage(propUploadedImage);
    }
  }, [propUploadedImage, storeUploadedImage, setStoreUploadedImage]);

  // Handle errors separately
  useEffect(() => {
    if (propError && propError !== storeError) {
      let errorMessage = 'Ein Fehler ist aufgetreten';
      if (typeof propError === 'string') {
        errorMessage = propError;
      } else if (propError instanceof Error) {
        errorMessage = propError.message || errorMessage;
      } else if (propError && typeof propError === 'object' && 'message' in propError) {
        errorMessage = (propError as { message?: string }).message || errorMessage;
      }

      if (typeof propError === 'string' || propError instanceof Error) {
        setError(propError);
      } else {
        setError(errorMessage);
      }
      setStoreError(errorMessage);
      handleFormError(errorMessage, 'form');
    }
  }, [propError, storeError, setError, setStoreError, handleFormError]);
}
