import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { extractEditableText } from '../../../../stores/hooks/useTextEditActions';
import ActionButtons from '../../ActionButtons';
import { Markdown } from '../../Markdown';
import useResponsive from '../hooks/useResponsive';

import UniversalEditForm from './UniversalEditForm';

import '../../../../assets/styles/components/edit-mode/edit-overlay.css';

interface EditOverlayProps {
  componentName: string;
  onClose: () => void;
}

export default function EditOverlay({ componentName, onClose }: EditOverlayProps) {
  const { isMobileView } = useResponsive(768);
  const storeContent = useGeneratedTextStore(
    (state) => state.generatedTexts[componentName] || null
  );
  const text = extractEditableText(storeContent) || '';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (isMobileView) {
    return createPortal(
      <UniversalEditForm componentName={componentName} onClose={onClose} />,
      document.body
    );
  }

  return createPortal(
    <div className="edit-overlay" role="dialog" aria-modal="true" aria-label="Text bearbeiten">
      <div className="edit-overlay-split">
        <div className="edit-overlay-chat">
          <UniversalEditForm componentName={componentName} onClose={null} />
        </div>
        <div className="edit-overlay-preview">
          <div className="display-header">
            <ActionButtons
              componentName={componentName}
              showUndo={true}
              showRedo={true}
              showExport={true}
              showExportDropdown={true}
              showDownload={true}
              showRegenerate={false}
              showSave={false}
              showSaveToLibrary={false}
              showEditMode={true}
              showReset={false}
              isEditModeActive={true}
              onEditModeToggle={onClose}
              generatedContent={text}
              exportableContent={text}
            />
          </div>
          <div className="edit-overlay-preview-content">
            <Markdown>{text}</Markdown>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
