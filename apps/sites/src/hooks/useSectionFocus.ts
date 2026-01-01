import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore, type SectionType, type FocusedField } from '../stores/editorStore';

interface FieldRef {
  section: SectionType;
  field: string;
  index?: number;
  element: HTMLInputElement | HTMLTextAreaElement;
}

export function useSectionFocus() {
  const { focusedField, clearFocus, setHighlightedElement } = useEditorStore();
  const fieldRefs = useRef<Map<string, FieldRef>>(new Map());
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getFieldKey = (section: SectionType, field: string, index?: number): string => {
    return index !== undefined ? `${section}.${index}.${field}` : `${section}.${field}`;
  };

  const registerField = useCallback((
    section: SectionType,
    field: string,
    element: HTMLInputElement | HTMLTextAreaElement | null,
    index?: number
  ) => {
    const key = getFieldKey(section, field, index);
    if (element) {
      fieldRefs.current.set(key, { section, field, index, element });
    } else {
      fieldRefs.current.delete(key);
    }
  }, []);

  const focusField = useCallback((section: SectionType, field: string, index?: number) => {
    const key = getFieldKey(section, field, index);
    const fieldRef = fieldRefs.current.get(key);

    if (!fieldRef) return false;

    fieldRef.element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }

    focusTimeoutRef.current = setTimeout(() => {
      fieldRef.element.focus();
      fieldRef.element.classList.add('highlight-pulse');
      setTimeout(() => {
        fieldRef.element.classList.remove('highlight-pulse');
      }, 600);
    }, 300);

    return true;
  }, []);

  useEffect(() => {
    if (!focusedField) return;

    const { section, field, index } = focusedField;
    focusField(section, field, index);

    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, [focusedField, focusField]);

  const handleFieldFocus = useCallback((section: SectionType, field: string, index?: number) => {
    setHighlightedElement({ section, field, index });
  }, [setHighlightedElement]);

  const handleFieldBlur = useCallback(() => {
    setTimeout(() => {
      const activeElement = document.activeElement;
      const isStillInEditor = activeElement?.closest('.section-editor-panel');
      if (!isStillInEditor) {
        clearFocus();
      }
    }, 100);
  }, [clearFocus]);

  return {
    registerField,
    focusField,
    handleFieldFocus,
    handleFieldBlur,
    getFieldKey,
  };
}

export function useClickToEdit() {
  const { focusField: storeFocusField, setActiveSection, setMobileEditorOpen } = useEditorStore();

  const handlePreviewClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const editableElement = target.closest('[data-section][data-field]') as HTMLElement;

    if (!editableElement) return;

    event.preventDefault();
    event.stopPropagation();

    const section = editableElement.getAttribute('data-section') as SectionType;
    const field = editableElement.getAttribute('data-field');
    const indexStr = editableElement.getAttribute('data-index');
    const index = indexStr ? parseInt(indexStr, 10) : undefined;

    if (section && field) {
      setActiveSection(section);
      storeFocusField(section, field, index);
      setMobileEditorOpen(true);
    }
  }, [storeFocusField, setActiveSection, setMobileEditorOpen]);

  const handleSectionClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const sectionElement = target.closest('[data-section-id]') as HTMLElement;

    if (!sectionElement) return;

    const hasEditableTarget = target.closest('[data-section][data-field]');
    if (hasEditableTarget) return;

    const section = sectionElement.getAttribute('data-section-id') as SectionType;
    if (section) {
      setActiveSection(section);
      setMobileEditorOpen(true);
    }
  }, [setActiveSection, setMobileEditorOpen]);

  return {
    handlePreviewClick,
    handleSectionClick,
  };
}
