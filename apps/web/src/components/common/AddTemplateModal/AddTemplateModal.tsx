import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  UploadZone,
} from '@gruenerator/ui';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { HiArrowLeft, HiPhotograph } from 'react-icons/hi';

import { useAuthStore } from '../../../stores/authStore';
import { cn } from '../../../utils/cn';
import apiClient from '../../utils/apiClient';
import { useTagAutocomplete } from '../TemplateModal';

import { suggestTagsFromTemplate } from './tagSuggestions';

const READ_ONLY_PERMISSIONS = { read: true, write: false, collaborative: false };

const INPUT_CLASS =
  'w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-background px-md py-md text-base focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 disabled:opacity-50 transition-colors';

interface PreviewData {
  title?: string;
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

interface CanvaLinkValidation {
  isValid: boolean;
  isTemplate: boolean;
  designId: string | null;
  title: string;
  error: string | null;
}

function validateCanvaLink(url: string): CanvaLinkValidation {
  const empty: CanvaLinkValidation = {
    isValid: false,
    isTemplate: false,
    designId: null,
    title: '',
    error: null,
  };

  if (!url || !url.trim()) return empty;

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    return { ...empty, error: 'Keine gültige URL.' };
  }

  if (!/canva\.(com|cn|link|me)$/i.test(urlObj.hostname)) {
    return { ...empty, error: 'Das ist kein Canva-Link.' };
  }

  // Short links (canva.link, canva.me) are always valid template links
  if (/canva\.(link|me)$/i.test(urlObj.hostname)) {
    const token = urlObj.pathname.replace(/^\//, '').split('/')[0] || '';
    if (token) {
      return { isValid: true, isTemplate: true, designId: token, title: '', error: null };
    }
  }

  const designMatch = urlObj.pathname.match(/\/design\/([A-Za-z0-9_-]+)/);
  const templateMatch = urlObj.pathname.match(/\/(?:p\/)?template\/([A-Za-z0-9_-]+)/);
  const match = designMatch || templateMatch;

  if (!match?.[1]) {
    return {
      ...empty,
      isValid: true,
      error: 'Dieser Link scheint keine Canva-Vorlage zu sein.',
    };
  }

  const segments = urlObj.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  const cleaned = last
    .replace(/^[A-Za-z0-9_-]{10,}--/, '')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .trim();
  const title = cleaned.length > 3 ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';

  return { isValid: true, isTemplate: true, designId: match[1], title, error: null };
}

const AddTemplateModal = ({
  isOpen,
  onClose,
  onSuccess,
  groupId = null,
  onShareContent = null,
}: AddTemplateModalProps) => {
  const [showFileUpload, setShowFileUpload] = useState(false);

  const [templateUrl, setTemplateUrl] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const titleRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDesignIdRef = useRef<string | null>(null);
  const tagAutocomplete = useTagAutocomplete(description, setDescription);

  const canvaValidation = validateCanvaLink(templateUrl);
  const isValidTemplate = canvaValidation.isValid && canvaValidation.isTemplate;

  useEffect(() => {
    if (!isOpen) {
      setShowFileUpload(false);
      setTemplateUrl('');
      setPreviewData(null);
      setUploadedFile(null);
      setUploadPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setTitle('');
      setDescription('');
      setSubmitError(null);
      setAuthorName('');
      setContactEmail('');
      prevDesignIdRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
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

  // Fetch preview when validation passes — form only shows after fetch completes
  useEffect(() => {
    if (isValidTemplate && canvaValidation.designId !== prevDesignIdRef.current) {
      prevDesignIdRef.current = canvaValidation.designId;
      setPreviewData(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchCanvaPreview(templateUrl, canvaValidation.title);
      }, 400);
    }
  }, [isValidTemplate, canvaValidation.designId, canvaValidation.title, templateUrl]);

  const fetchCanvaPreview = useCallback(async (url: string, fallbackTitle?: string) => {
    setIsLoadingPreview(true);
    try {
      const response = await apiClient.post<ApiResponse>('/auth/user-templates/from-url', {
        url: url.trim(),
        preview: true,
      });
      const data = response.data;
      if (data.preview) {
        setPreviewData(data.preview);
        const preview = data.preview;

        const crawledTitle = preview.title || fallbackTitle || '';
        setTitle(crawledTitle);

        const rawDesc = preview.description || '';
        const isGenericCanvaDesc = /^Check out this .* designed by /i.test(rawDesc);
        const meaningfulDesc = isGenericCanvaDesc ? '' : rawDesc;

        const suggestedTags = suggestTagsFromTemplate(
          preview as Parameters<typeof suggestTagsFromTemplate>[0],
          'canva'
        );
        setDescription(
          meaningfulDesc + (meaningfulDesc && suggestedTags ? '\n\n' : '') + suggestedTags
        );

        setTimeout(() => titleRef.current?.focus(), 50);
      }
    } catch {
      setPreviewData({});
      if (fallbackTitle) setTitle(fallbackTitle);
      const suggestedTags = suggestTagsFromTemplate(null, 'canva');
      if (suggestedTags) setDescription(suggestedTags);
      setTimeout(() => titleRef.current?.focus(), 50);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    setUploadedFile(file);
    setUploadPreviewUrl(URL.createObjectURL(file));
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    setTitle(nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1));
    setDescription(suggestTagsFromTemplate(null, 'file'));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (!title.trim()) throw new Error('Titel ist erforderlich.');

      let templateId: string | undefined;

      if (showFileUpload && uploadedFile) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('title', title.trim());
        formData.append('description', description.trim());
        formData.append('template_type', 'sharepic');
        formData.append(
          'metadata',
          JSON.stringify({
            author_name: authorName.trim() || null,
            contact_email: contactEmail.trim() || null,
          })
        );
        const response = await apiClient.post<ApiResponse>('/auth/user-templates', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (!response.data.success) throw new Error(response.data.message || 'Fehler');
        templateId = response.data.data?.id;
      } else if (previewData) {
        const response = await apiClient.post<ApiResponse>('/auth/user-templates/from-url', {
          url: templateUrl.trim(),
          title: title.trim(),
          description: description.trim(),
          metadata: {
            author_name: authorName.trim() || null,
            contact_email: contactEmail.trim() || null,
          },
        });
        if (!response.data.success) throw new Error(response.data.message || 'Fehler');
        templateId = response.data.data?.id;
      } else {
        const response = await apiClient.post<ApiResponse>('/auth/user-templates', {
          title: title.trim(),
          description: description.trim(),
          external_url: templateUrl.trim() || null,
          template_type: showFileUpload ? 'sharepic' : 'canva',
          is_private: false,
          metadata: {
            author_name: authorName.trim() || null,
            contact_email: contactEmail.trim() || null,
          },
        });
        if (!response.data.success) throw new Error(response.data.message || 'Fehler');
        templateId = response.data.data?.id;
      }

      if (groupId && onShareContent && templateId) {
        await onShareContent('database', templateId, {
          permissions: READ_ONLY_PERMISSIONS,
          targetGroupId: groupId,
        });
      }

      if (templateId) onSuccess?.({ id: templateId, title: title.trim() });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Fehler beim Erstellen der Vorlage');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    showFileUpload,
    previewData,
    uploadedFile,
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

  const canSubmit =
    title.trim() &&
    ((!showFileUpload && isValidTemplate && previewData) || (showFileUpload && uploadedFile));

  const renderGhostText = () =>
    tagAutocomplete.suggestionSuffix && (
      <div className="absolute inset-0 px-md py-md text-base font-[inherit] leading-normal pointer-events-none whitespace-pre-wrap break-words overflow-hidden border border-transparent rounded-lg">
        <span className="invisible">{tagAutocomplete.ghostPrefix}</span>
        <span className="text-grey-400">{tagAutocomplete.suggestionSuffix}</span>
      </div>
    );

  const renderDetailFields = () => (
    <div className="flex flex-col gap-md">
      {previewData?.thumbnail_url && (
        <div className="flex justify-center">
          <div className="w-[140px] h-[140px] rounded-lg overflow-hidden bg-background-alt border border-grey-200 dark:border-grey-700">
            <img
              src={previewData.thumbnail_url}
              alt="Vorschau"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      )}
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        placeholder="Titel der Vorlage *"
        className={INPUT_CLASS}
      />
      <div className="relative">
        {renderGhostText()}
        <textarea
          ref={tagAutocomplete.textareaRef}
          value={description}
          onChange={tagAutocomplete.handleChange}
          onKeyDown={tagAutocomplete.handleKeyDown}
          placeholder="Beschreibung... #tags werden erkannt"
          rows={3}
          className={cn(INPUT_CLASS, 'resize-y min-h-[80px] bg-transparent relative z-[1]')}
        />
      </div>
      <div className="grid grid-cols-2 gap-md max-sm:grid-cols-1">
        <input
          type="text"
          value={authorName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthorName(e.target.value)}
          placeholder="Autor*in"
          className={INPUT_CLASS}
        />
        <input
          type="email"
          value={contactEmail}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContactEmail(e.target.value)}
          placeholder="Kontakt E-Mail"
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );

  const modalTitle = groupId ? 'Vorlage zur Gruppe hinzufügen' : 'Neue Vorlage erstellen';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[550px] max-md:max-w-none max-md:max-h-none max-md:h-full max-md:rounded-none max-h-[85vh] flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-lg">
          <div className="flex items-center gap-sm mb-md">
            {showFileUpload && (
              <button
                type="button"
                onClick={() => {
                  setShowFileUpload(false);
                  setUploadedFile(null);
                  if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                  setUploadPreviewUrl(null);
                  setTitle('');
                  setDescription('');
                  setSubmitError(null);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 cursor-pointer border-none bg-transparent transition-colors shrink-0"
                aria-label="Zurück"
              >
                <HiArrowLeft size={18} />
              </button>
            )}
            <DialogHeader className="p-0">
              <DialogTitle className="text-[1.25rem]">{modalTitle}</DialogTitle>
            </DialogHeader>
          </div>

          {!showFileUpload ? (
            <div className="flex flex-col gap-md">
              <div className="flex flex-col gap-xxs">
                <input
                  type="url"
                  value={templateUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setTemplateUrl(e.target.value)
                  }
                  placeholder="Canva-Link einfügen..."
                  autoFocus
                  className={cn(INPUT_CLASS, isValidTemplate && 'border-primary-500')}
                />
                {isLoadingPreview && (
                  <span className="text-xs text-primary-600 flex items-center gap-xs">
                    <span className="inline-block w-3 h-3 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    Vorschau wird geladen...
                  </span>
                )}
                {canvaValidation.error && templateUrl.length > 0 && (
                  <span
                    className={cn(
                      'text-xs',
                      canvaValidation.isValid
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-grey-400'
                    )}
                  >
                    {canvaValidation.error}
                  </span>
                )}
                {!canvaValidation.error && !isValidTemplate && templateUrl.length > 0 && (
                  <span className="text-xs text-grey-400">
                    Das sieht nicht nach einem Canva-Vorlagen-Link aus
                  </span>
                )}
              </div>

              <div
                className={cn(
                  'grid transition-all duration-200 ease-out',
                  previewData ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                )}
              >
                <div className="overflow-hidden">{renderDetailFields()}</div>
              </div>

              <button
                type="button"
                onClick={() => setShowFileUpload(true)}
                className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 cursor-pointer bg-transparent border-none transition-colors flex items-center gap-xs p-0 self-start"
              >
                <HiPhotograph size={14} />
                Stattdessen eine Datei-Vorlage hochladen
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              {!uploadedFile ? (
                <UploadZone
                  onFileSelected={handleFileSelected}
                  accept={{
                    'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
                    'application/pdf': ['.pdf'],
                  }}
                  maxSizeMB={10}
                  icon={<HiPhotograph className="text-2xl" />}
                  title="Vorlage auswählen oder hierher ziehen"
                  subtitle="PNG, JPG, PDF oder WebP · Max. 10 MB"
                />
              ) : (
                <>
                  {uploadPreviewUrl && (
                    <div className="flex justify-center">
                      <div className="relative w-[140px] h-[140px] rounded-lg overflow-hidden bg-background-alt border border-grey-200 dark:border-grey-700">
                        <img
                          src={uploadPreviewUrl}
                          alt="Vorschau"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFile(null);
                            if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                            setUploadPreviewUrl(null);
                            setTitle('');
                            setDescription('');
                          }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs cursor-pointer border-none hover:bg-black/80 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                  {renderDetailFields()}
                </>
              )}
            </div>
          )}
        </div>

        {submitError && (
          <div className="px-lg">
            <span className="text-xs text-red-600 dark:text-red-400">{submitError}</span>
          </div>
        )}

        <div
          className={cn(
            'flex items-center justify-end gap-sm py-md px-lg border-t border-grey-200 dark:border-grey-700 transition-opacity',
            canSubmit ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting} size="sm">
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} size="sm">
            {isSubmitting
              ? 'Wird eingereicht...'
              : groupId
                ? 'Hinzufügen'
                : 'Zur Prüfung einreichen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddTemplateModal;
