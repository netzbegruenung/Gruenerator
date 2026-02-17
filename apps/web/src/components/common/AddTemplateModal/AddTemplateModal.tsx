import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';

import { useAuthStore } from '../../../stores/authStore';
import { useTagAutocomplete } from '../TemplateModal';

import { suggestTagsFromTemplate } from './tagSuggestions';

import '../TemplateModal/template-modal.css';
import apiClient from '../../utils/apiClient';

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

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const canSubmit = previewData ? title.trim() : title.trim() && templateUrl.trim();

  const renderGhostText = () =>
    tagAutocomplete.suggestionSuffix && (
      <div className="template-modal-ghost-text">
        <span className="template-modal-ghost-prefix">{tagAutocomplete.ghostPrefix}</span>
        <span className="template-modal-ghost-suffix">{tagAutocomplete.suggestionSuffix}</span>
      </div>
    );

  const modalContent = (
    <div className="template-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-modal-title"
      >
        <div className="template-modal-header">
          <h2 id="template-modal-title">
            {groupId ? 'Vorlage zur Gruppe hinzufügen' : 'Neue Vorlage erstellen'}
          </h2>
          <button className="template-modal-close" onClick={onClose} aria-label="Schließen">
            <HiX />
          </button>
        </div>

        <div className="template-modal-body">
          <div className="template-modal-field">
            <label>URL</label>
            <div className="template-modal-url-row">
              <input
                type="url"
                value={templateUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTemplateUrl(e.target.value)
                }
                placeholder="https://..."
                disabled={isLoadingPreview}
              />
              <button
                className="pabtn pabtn--s pabtn--secondary"
                onClick={handleLoadPreview}
                disabled={isLoadingPreview || !templateUrl.trim()}
              >
                {isLoadingPreview ? 'Lädt...' : 'Vorschau laden'}
              </button>
            </div>
            {previewError && <p className="template-modal-error">{previewError}</p>}
          </div>

          {previewData && (
            <div className="template-modal-preview">
              {previewData.thumbnail_url && (
                <div className="template-modal-preview-image">
                  <img
                    src={previewData.thumbnail_url}
                    alt="Vorschau"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="template-modal-preview-fields">
                <div className="template-modal-field">
                  <label>Titel *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                    placeholder="Titel der Vorlage"
                  />
                </div>
                <div className="template-modal-field">
                  <label>Beschreibung</label>
                  <div className="template-modal-textarea-wrapper">
                    {renderGhostText()}
                    <textarea
                      ref={tagAutocomplete.textareaRef}
                      value={description}
                      onChange={tagAutocomplete.handleChange}
                      onKeyDown={tagAutocomplete.handleKeyDown}
                      placeholder="Beschreibung der Vorlage..."
                      rows={3}
                    />
                  </div>
                </div>
                <div className="template-modal-field">
                  <label>Autor*in</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setAuthorName(e.target.value)
                    }
                    placeholder="Name des Erstellers"
                  />
                </div>
                <div className="template-modal-field">
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
              <div className="template-modal-field">
                <label>Titel *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                  placeholder="Titel der Vorlage"
                />
              </div>
              <div className="template-modal-field">
                <label>Beschreibung</label>
                <div className="template-modal-textarea-wrapper">
                  {renderGhostText()}
                  <textarea
                    ref={tagAutocomplete.textareaRef}
                    value={description}
                    onChange={tagAutocomplete.handleChange}
                    onKeyDown={tagAutocomplete.handleKeyDown}
                    placeholder="Beschreibung der Vorlage..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="template-modal-field">
                <label>Autor*in</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setAuthorName(e.target.value)
                  }
                  placeholder="Name des Erstellers"
                />
              </div>
              <div className="template-modal-field">
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

          {submitError && <p className="template-modal-error">{submitError}</p>}
        </div>

        <div className="template-modal-footer">
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
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default AddTemplateModal;
