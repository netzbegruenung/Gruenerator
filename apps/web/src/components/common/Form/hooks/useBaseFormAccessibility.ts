import { useEffect, type RefObject, type ReactNode } from 'react';

import type { GeneratedContent, FormControl } from '@/types/baseform';

import useAccessibility from '@/components/hooks/useAccessibility';
import {
  addAriaLabelsToElements,
  enhanceFocusVisibility,
} from '@/components/utils/accessibilityHelpers';
import { BUTTON_LABELS } from '@/components/utils/constants';

interface UseBaseFormAccessibilityParams {
  baseFormRef: RefObject<HTMLDivElement | null>;
  generatedContent?: GeneratedContent;
  children?: ReactNode | ((formControl: FormControl) => ReactNode);
  accessibilityOptions?: Record<string, unknown>;
}

export function useBaseFormAccessibility(params: UseBaseFormAccessibilityParams) {
  const { baseFormRef, generatedContent, children, accessibilityOptions = {} } = params;

  const { handleFormError, handleFormSuccess, registerFormElement, testAccessibility } =
    useAccessibility({
      enableEnhancedNavigation: true,
      enableAriaSupport: true,
      enableErrorAnnouncements: true,
      enableSuccessAnnouncements: true,
      keyboardNavigationOptions: {
        onEnterSubmit: true,
        onEscapeCancel: true,
        skipLinkText: 'Zum Hauptinhalt springen',
        enableTabManagement: true,
        ...accessibilityOptions,
      },
    });

  // Register form element for accessibility
  useEffect(() => {
    if (baseFormRef.current) {
      registerFormElement(baseFormRef.current);
    }
  }, [registerFormElement, baseFormRef]);

  // Improve accessibility
  useEffect(() => {
    enhanceFocusVisibility();

    const labelledElements = [
      {
        element: document.querySelector('.submit-button') as HTMLElement | null,
        label: BUTTON_LABELS.SUBMIT,
      },
      {
        element: document.querySelector('.generate-post-button') as HTMLElement | null,
        label: BUTTON_LABELS.GENERATE_TEXT,
      },
      {
        element: document.querySelector('.copy-button') as HTMLElement | null,
        label: BUTTON_LABELS.COPY,
      },
      {
        element: document.querySelector('.edit-button') as HTMLElement | null,
        label: BUTTON_LABELS.EDIT,
      },
    ].filter((item): item is { element: HTMLElement; label: string } => item.element !== null);

    if (labelledElements.length > 0) {
      addAriaLabelsToElements(labelledElements);
    }
  }, [generatedContent]);

  // Development accessibility testing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && baseFormRef.current) {
      const timer = setTimeout(() => {
        testAccessibility();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [testAccessibility, children, baseFormRef]);

  return {
    handleFormError,
    handleFormSuccess,
  };
}
