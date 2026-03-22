import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@gruenerator/ui';
import React, { useState, useCallback } from 'react';

import { useTagAutocomplete } from '../TemplateModal';

interface TemplateData {
  id?: string;
  title?: string;
  description?: string;
  external_url?: string;
  canva_url?: string;
  thumbnail_url?: string;
  preview_image_url?: string;
  is_private?: boolean;
  [key: string]: unknown;
}

interface SaveData {
  title: string;
  description: string;
  canva_url: string;
  is_private: boolean;
  [key: string]: unknown;
}

interface EditTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSave: (id: string, data: SaveData) => Promise<void>;
  template: TemplateData;
}

const EditTemplateModal = ({
  isOpen,
  onClose,
  onSuccess,
  onSave,
  template,
}: EditTemplateModalProps) => {
  const [title, setTitle] = useState(template?.title || '');
  const [description, setDescription] = useState(template?.description || '');
  const [externalUrl, setExternalUrl] = useState(
    template?.external_url || template?.canva_url || ''
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(
    template?.thumbnail_url || template?.preview_image_url || ''
  );
  const [isPrivate, setIsPrivate] = useState(template?.is_private !== false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const tagAutocomplete = useTagAutocomplete(description, setDescription);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!title.trim()) {
      setSubmitError('Titel ist erforderlich.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const saveData: SaveData = {
        title: title.trim(),
        description: description.trim(),
        canva_url: externalUrl.trim(),
        is_private: isPrivate,
      };
      await onSave(template.id || '', saveData);

      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      const err = error as { message?: string };
      setSubmitError(err.message || 'Fehler beim Speichern der Vorlage');
    } finally {
      setIsSubmitting(false);
    }
  }, [template, title, description, externalUrl, isPrivate, onSave, onSuccess, onClose]);

  if (!template) return null;

  const canSubmit = title.trim().length > 0;

  const fieldClass =
    'mb-md [&_label]:block [&_label]:mb-xs [&_label]:text-[0.875rem] [&_label]:font-medium [&_label]:text-foreground [&_input]:w-full [&_input]:py-sm [&_input]:px-md [&_input]:border [&_input]:border-grey-200 [&_input]:dark:border-grey-700 [&_input]:rounded-lg [&_input]:text-base [&_input]:text-foreground [&_input]:bg-background [&_input]:transition-colors [&_input]:duration-200 [&_input]:focus:outline-none [&_input]:focus:border-[var(--primary)] [&_textarea]:w-full [&_textarea]:py-sm [&_textarea]:px-md [&_textarea]:border [&_textarea]:border-grey-200 [&_textarea]:dark:border-grey-700 [&_textarea]:rounded-lg [&_textarea]:text-base [&_textarea]:text-foreground [&_textarea]:bg-background [&_textarea]:transition-colors [&_textarea]:duration-200 [&_textarea]:focus:outline-none [&_textarea]:focus:border-[var(--primary)] [&_textarea]:resize-y [&_textarea]:min-h-[60px]';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[550px] min-[900px]:max-w-[750px] max-md:max-w-none max-md:max-h-none max-md:h-full max-md:rounded-none max-h-[85vh] flex flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between py-md px-lg border-b border-grey-200 dark:border-grey-700">
          <DialogHeader>
            <DialogTitle className="text-[1.25rem]">Vorlage bearbeiten</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-lg">
          {thumbnailUrl && (
            <div className="w-full max-h-[200px] h-auto flex items-center justify-center mb-md [&_img]:max-w-full [&_img]:max-h-[200px] [&_img]:w-auto [&_img]:h-auto [&_img]:object-contain">
              <img
                src={thumbnailUrl}
                alt="Vorschau"
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          <div className={fieldClass}>
            <label htmlFor="edit-title">Titel *</label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="Titel der Vorlage"
              disabled={isSubmitting}
            />
          </div>

          <div className={fieldClass}>
            <label htmlFor="edit-description">Beschreibung</label>
            <div className="relative">
              {tagAutocomplete.suggestionSuffix && (
                <div className="absolute inset-0 py-sm px-md text-base font-[inherit] leading-normal pointer-events-none whitespace-pre-wrap break-words overflow-hidden border border-transparent rounded-lg">
                  <span className="invisible">{tagAutocomplete.ghostPrefix}</span>
                  <span className="text-grey-400">{tagAutocomplete.suggestionSuffix}</span>
                </div>
              )}
              <textarea
                id="edit-description"
                ref={tagAutocomplete.textareaRef}
                value={description}
                onChange={tagAutocomplete.handleChange}
                onKeyDown={tagAutocomplete.handleKeyDown}
                placeholder="Beschreibung der Vorlage..."
                rows={3}
                disabled={isSubmitting}
                className="bg-transparent relative z-[1]"
              />
            </div>
          </div>

          <div className={fieldClass}>
            <label htmlFor="edit-url">URL</label>
            <input
              id="edit-url"
              type="url"
              value={externalUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalUrl(e.target.value)}
              placeholder="https://..."
              disabled={isSubmitting}
            />
          </div>

          <div className="mb-md [&_label]:flex [&_label]:items-center [&_label]:gap-sm [&_label]:cursor-pointer [&_input[type=checkbox]]:w-auto [&_input[type=checkbox]]:cursor-pointer [&_span]:font-normal">
            <label>
              <input
                type="checkbox"
                checked={!isPrivate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setIsPrivate(!e.target.checked)
                }
                disabled={isSubmitting}
              />
              <span>Öffentlich (in Galerie sichtbar)</span>
            </label>
          </div>

          {submitError && (
            <p className="text-[var(--error-red)] text-[0.875rem] mt-xs mb-0">{submitError}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-sm py-md px-lg border-t border-grey-200 dark:border-grey-700">
          <button className="pabtn pabtn--m pabtn--ghost" onClick={onClose} disabled={isSubmitting}>
            Abbrechen
          </button>
          <button
            className="pabtn pabtn--m pabtn--primary"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? 'Wird gespeichert...' : 'Speichern'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditTemplateModal;
