import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@gruenerator/ui';
import React, { useState, useCallback, useEffect } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import { cn } from '../../../utils/cn';
import apiClient from '../../utils/apiClient';
import { useTagAutocomplete } from '../TemplateModal';

import { suggestTagsFromTemplate } from './tagSuggestions';

import type { AxiosError } from 'axios';

const READ_ONLY_PERMISSIONS = { read: true, write: false, collaborative: false };

interface PreviewData {
  thumbnail_url?: string;
  description?: string;
  [key: string]: unknown;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  preview?: PreviewData;
  data?: { id: string };
}

interface AddTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (data: { id: string; title: string }) => void;
  groupId?: string | null;
  onShareContent?:
    | ((
        type: string,
        id: string,
        options: { permissions: Record<string, boolean>; targetGroupId: string | null }
      ) => Promise<void>)
    | null;
}

const AddTemplateModal = ({
  isOpen,
  onClose,
  onSuccess,
  groupId = null,
  onShareContent = null,
}: AddTemplateModalProps) => {
  const [templateUrl, setTemplateUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [authorName, setAuthorName] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');

  const tagAutocomplete = useTagAutocomplete(description, setDescription);

  useEffect(() => {
    if (!isOpen) {
      setTemplateUrl('');
      setPreviewData(null);
      setPreviewError(null);
      setTitle('');
      setDescription('');
      setSubmitError(null);
      setAuthorName('');
      setContactEmail('');
      tagAutocomplete.reset();
    } else {
      const user = useAuthStore.getState().user;
      if (user) {
        const name =
          user.display_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || '';
        setAuthorName(name);
        setContactEmail(user.email || '');
      }
    }
  }, [isOpen]);

  const handleLoadPreview = useCallback(async () => {
    if (!templateUrl.trim()) {
      setPreviewError('Bitte eine URL eingeben.');
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError(null);
    setPreviewData(null);

    try {
      const response = await apiClient.post<ApiResponse>('/auth/user-templates/from-url', {
        url: templateUrl.trim(),
        preview: true,
      });
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || 'Fehler beim Laden der Vorschau');
      }

      if (data.preview) {
        setPreviewData(data.preview);
        const existingDesc = data.preview.description || '';
        const suggestedTags = suggestTagsFromTemplate(data.preview, 'url');
        setDescription(
          existingDesc + (existingDesc && suggestedTags ? '\n\n' : '') + suggestedTags
        );
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setPreviewError(
        axiosError.response?.data?.message ||
          (error instanceof Error ? error.message : 'Fehler beim Laden der Vorschau')
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [templateUrl]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (!title.trim()) {
        throw new Error('Titel ist erforderlich.');
      }

      let templateId: string | undefined;

      if (previewData) {
        const response = await apiClient.post<ApiResponse>('/auth/user-templates/from-url', {
          url: templateUrl.trim(),
          title: title.trim(),
          description: description.trim(),
          metadata: {
            author_name: authorName.trim() || null,
            contact_email: contactEmail.trim() || null,
          },
        });

        const data = response.data;

        if (!data.success) {
          throw new Error(data.message || 'Fehler beim Erstellen der Vorlage');
        }

        templateId = data.data?.id;
      } else {
        if (!templateUrl.trim()) {
          throw new Error('URL ist erforderlich.');
        }

        const response = await apiClient.post<ApiResponse>('/auth/user-templates', {
          title: title.trim(),
          description: description.trim(),
          canva_url: templateUrl.trim(),
          template_type: 'external',
          metadata: {
            author_name: authorName.trim() || null,
            contact_email: contactEmail.trim() || null,
          },
        });

        const data = response.data;

        if (!data.success) {
          throw new Error(data.message || 'Fehler beim Erstellen der Vorlage');
        }

        templateId = data.data?.id;
      }

      if (groupId && onShareContent && templateId) {
        await onShareContent('database', templateId, {
          permissions: READ_ONLY_PERMISSIONS,
          targetGroupId: groupId,
        });
      }

      if (templateId) {
        onSuccess?.({ id: templateId, title: title.trim() });
      }
      onClose();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Fehler beim Erstellen der Vorlage';
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    previewData,
    title,
    description,
    templateUrl,
    groupId,
    onShareContent,
    onSuccess,
    onClose,
    authorName,
    contactEmail,
  ]);

  const canSubmit = previewData ? title.trim() : title.trim() && templateUrl.trim();

  const fieldClass =
    'mb-md [&_label]:block [&_label]:mb-xs [&_label]:text-[0.875rem] [&_label]:font-medium [&_label]:text-foreground [&_input]:w-full [&_input]:py-sm [&_input]:px-md [&_input]:border [&_input]:border-grey-200 [&_input]:dark:border-grey-700 [&_input]:rounded-lg [&_input]:text-base [&_input]:text-foreground [&_input]:bg-background [&_input]:transition-colors [&_input]:duration-200 [&_input]:focus:outline-none [&_input]:focus:border-[var(--primary)] [&_textarea]:w-full [&_textarea]:py-sm [&_textarea]:px-md [&_textarea]:border [&_textarea]:border-grey-200 [&_textarea]:dark:border-grey-700 [&_textarea]:rounded-lg [&_textarea]:text-base [&_textarea]:text-foreground [&_textarea]:bg-background [&_textarea]:transition-colors [&_textarea]:duration-200 [&_textarea]:focus:outline-none [&_textarea]:focus:border-[var(--primary)] [&_textarea]:resize-y [&_textarea]:min-h-[60px]';

  const renderGhostText = () =>
    tagAutocomplete.suggestionSuffix && (
      <div className="absolute inset-0 py-sm px-md text-base font-[inherit] leading-normal pointer-events-none whitespace-pre-wrap break-words overflow-hidden border border-transparent rounded-lg">
        <span className="invisible">{tagAutocomplete.ghostPrefix}</span>
        <span className="text-grey-400">{tagAutocomplete.suggestionSuffix}</span>
      </div>
    );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[550px] min-[900px]:max-w-[750px] max-md:max-w-none max-md:max-h-none max-md:h-full max-md:rounded-none max-h-[85vh] flex flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between py-md px-lg border-b border-grey-200 dark:border-grey-700">
          <DialogHeader>
            <DialogTitle className="text-[1.25rem]">
              {groupId ? 'Vorlage zur Gruppe hinzufügen' : 'Neue Vorlage erstellen'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-lg">
          <div className={fieldClass}>
            <label>URL</label>
            <div className="flex gap-sm">
              <input
                type="url"
                value={templateUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTemplateUrl(e.target.value)
                }
                placeholder="https://..."
                disabled={isLoadingPreview}
                className="flex-1"
              />
              <button
                className="pabtn pabtn--s pabtn--secondary"
                onClick={handleLoadPreview}
                disabled={isLoadingPreview || !templateUrl.trim()}
              >
                {isLoadingPreview ? 'Lädt...' : 'Vorschau laden'}
              </button>
            </div>
            {previewError && (
              <p className="text-[var(--error-red)] text-[0.875rem] mt-xs mb-0">{previewError}</p>
            )}
          </div>

          {previewData && (
            <div className="flex gap-md p-md bg-background-alt rounded-lg mt-md max-md:flex-col">
              {previewData.thumbnail_url && (
                <div className="shrink-0 w-[120px] h-[120px] rounded-lg overflow-hidden bg-background border border-grey-200 dark:border-grey-700 min-[900px]:w-[160px] min-[900px]:h-[160px] max-md:w-full max-md:h-[150px] [&_img]:w-full [&_img]:h-full [&_img]:object-cover">
                  <img
                    src={previewData.thumbnail_url}
                    alt="Vorschau"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0 min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:gap-sm [&>div:nth-child(1)]:min-[900px]:col-span-full [&>div:nth-child(2)]:min-[900px]:col-span-full [&>div]:min-[900px]:mb-0">
                <div className={cn(fieldClass, 'mb-sm')}>
                  <label>Titel *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                    placeholder="Titel der Vorlage"
                  />
                </div>
                <div className={cn(fieldClass, 'mb-sm')}>
                  <label>Beschreibung</label>
                  <div className="relative">
                    {renderGhostText()}
                    <textarea
                      ref={tagAutocomplete.textareaRef}
                      value={description}
                      onChange={tagAutocomplete.handleChange}
                      onKeyDown={tagAutocomplete.handleKeyDown}
                      placeholder="Beschreibung der Vorlage..."
                      rows={3}
                      className="bg-transparent relative z-[1]"
                    />
                  </div>
                </div>
                <div className={cn(fieldClass, 'mb-sm')}>
                  <label>Autor*in</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setAuthorName(e.target.value)
                    }
                    placeholder="Name der erstellenden Person"
                  />
                </div>
                <div className={cn(fieldClass, 'mb-sm last:mb-0')}>
                  <label>Kontakt E-Mail</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setContactEmail(e.target.value)
                    }
                    placeholder="email@example.com"
                  />
                </div>
              </div>
            </div>
          )}

          {!previewData && (
            <>
              <div className={fieldClass}>
                <label>Titel *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                  placeholder="Titel der Vorlage"
                />
              </div>
              <div className={fieldClass}>
                <label>Beschreibung</label>
                <div className="relative">
                  {renderGhostText()}
                  <textarea
                    ref={tagAutocomplete.textareaRef}
                    value={description}
                    onChange={tagAutocomplete.handleChange}
                    onKeyDown={tagAutocomplete.handleKeyDown}
                    placeholder="Beschreibung der Vorlage..."
                    rows={3}
                    className="bg-transparent relative z-[1]"
                  />
                </div>
              </div>
              <div className={fieldClass}>
                <label>Autor*in</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setAuthorName(e.target.value)
                  }
                  placeholder="Name der erstellenden Person"
                />
              </div>
              <div className={fieldClass}>
                <label>Kontakt E-Mail</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setContactEmail(e.target.value)
                  }
                  placeholder="email@example.com"
                />
              </div>
            </>
          )}

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
            {isSubmitting ? 'Wird erstellt...' : groupId ? 'Hinzufügen' : 'Erstellen'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddTemplateModal;
