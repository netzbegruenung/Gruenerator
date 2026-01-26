/**
 * EditCategoryModal Component
 * Bottom sheet modal for editing a specific image studio category
 *
 * Note: Controls handle their own state via Zustand selectors for performance
 * Uses shared EditorModal for consistent modal behavior across editors
 */

import { useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { TextFieldsSection } from './editing';
import {
  FontSizeControl,
  ColorSchemeSelector,
  BalkenOffsetControl,
  BalkenGruppeControl,
  SonnenblumenControl,
  CreditInput,
} from '../image-modification';
import { EditorModal, type EditorModalRef } from '../common/editor-toolbar';
import { getEditSheetConfig, type EditCategory } from '../../config/editSheetConfig';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import type { FormFieldValue } from '@gruenerator/shared/image-studio';

export interface EditCategoryModalRef {
  open: () => void;
  close: () => void;
}

interface EditCategoryModalProps {
  category: EditCategory | null;
  onClose: () => void;
  disabled?: boolean;
}

export const EditCategoryModal = forwardRef<EditCategoryModalRef, EditCategoryModalProps>(
  function EditCategoryModal({ category, onClose, disabled = false }, ref) {
    const editorModalRef = useRef<EditorModalRef>(null);

    const type = useImageStudioStore((s) => s.type);
    const formData = useImageStudioStore((s) => s.formData);
    const updateField = useImageStudioStore((s) => s.updateField);

    const snapPoints = useMemo(() => {
      if (category === 'text') return ['60%', '85%'];
      return ['35%', '50%'];
    }, [category]);

    const config = useMemo(() => (type ? getEditSheetConfig(type) : null), [type]);

    useImperativeHandle(ref, () => ({
      open: () => {
        editorModalRef.current?.open();
      },
      close: () => {
        editorModalRef.current?.close();
      },
    }));

    const handleFieldChange = useCallback(
      (key: string, value: FormFieldValue) => {
        updateField(key, value);
      },
      [updateField]
    );

    if (!type || !config || !category) {
      return null;
    }

    const renderContent = () => {
      switch (category) {
        case 'text':
          return (
            <TextFieldsSection
              fields={config.textFields}
              formData={formData}
              onFieldChange={handleFieldChange}
              disabled={disabled}
            />
          );
        case 'fontSize':
          return <FontSizeControl disabled={disabled} />;
        case 'colorScheme':
          return <ColorSchemeSelector disabled={disabled} />;
        case 'balkenOffset':
          return <BalkenOffsetControl disabled={disabled} />;
        case 'balkenGruppe':
          return <BalkenGruppeControl disabled={disabled} />;
        case 'sonnenblume':
          return <SonnenblumenControl disabled={disabled} />;
        case 'credit':
          return <CreditInput disabled={disabled} />;
        default:
          return null;
      }
    };

    return (
      <EditorModal ref={editorModalRef} onClose={onClose} snapPoints={snapPoints}>
        {renderContent()}
      </EditorModal>
    );
  }
);
