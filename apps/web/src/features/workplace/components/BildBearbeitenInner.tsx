import { useShareStore } from '@gruenerator/shared/share';
import { AIPromptInput, Button } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ImagePlus, X } from 'lucide-react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Lightbox } from '../../image-studio/components/Lightbox';
import { useLightbox } from '../../image-studio/hooks/useLightbox';
import { editAiImage } from '../../image-studio/services/imageEditingService';
import { MODE_MAP } from '../../texte/modes';

const MODE_ID = 'bild-bearbeiten';

const BildBearbeitenInner: React.FC = memo(() => {
  const [prompt, setPrompt] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { createImageShare } = useShareStore();
  const { isOpen, openLightbox, closeLightbox } = useLightbox();

  const def = MODE_MAP[MODE_ID];

  useEffect(() => {
    return () => {
      if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
      if (editedImage) URL.revokeObjectURL(editedImage);
    };
  }, [sourcePreviewUrl, editedImage]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
      setSourceFile(file);
      setSourcePreviewUrl(URL.createObjectURL(file));
      setError(null);
    },
    [sourcePreviewUrl]
  );

  const clearSource = useCallback(() => {
    if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
    setSourceFile(null);
    setSourcePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [sourcePreviewUrl]);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!sourceFile || !trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { objectUrl, base64 } = await editAiImage(sourceFile, trimmed);
      if (editedImage) URL.revokeObjectURL(editedImage);
      setEditedImage(objectUrl);
      createImageShare({
        imageData: base64,
        title: trimmed.slice(0, 100),
        imageType: 'edit',
        status: 'ready',
        metadata: { prompt: trimmed, sourceFilename: sourceFile.name },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
        .catch(() => {});
    } catch (err) {
      console.error('[BildBearbeitenInner] Edit failed:', err);
      setError(err instanceof Error ? err.message : 'Bearbeitung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [prompt, sourceFile, loading, editedImage, createImageShare, queryClient]);

  const onSubmit = useCallback(() => void handleSubmit(), [handleSubmit]);

  const handleDownload = useCallback(() => {
    if (!editedImage) return;
    const link = document.createElement('a');
    link.href = editedImage;
    link.download = `gruenerator-bearbeitet-${Date.now()}.png`;
    link.click();
  }, [editedImage]);

  const toolbar = useMemo(
    () =>
      sourcePreviewUrl ? (
        <div className="flex items-center gap-1.5 rounded-md border border-grey-200 dark:border-grey-700 bg-background-pure pl-1 pr-1.5 py-0.5">
          <img src={sourcePreviewUrl} alt="" className="size-6 object-cover rounded" />
          <span className="text-xs text-grey-600 dark:text-grey-300 max-w-[120px] truncate">
            {sourceFile?.name ?? 'Bild'}
          </span>
          <button
            type="button"
            onClick={clearSource}
            className="text-grey-400 hover:text-grey-600 dark:hover:text-grey-200"
            aria-label="Bild entfernen"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs text-grey-500 dark:text-grey-400 hover:text-grey-700 dark:hover:text-grey-200 px-2 py-1 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors"
        >
          <ImagePlus className="size-3.5" />
          Bild hochladen
        </button>
      ),
    [sourcePreviewUrl, sourceFile, clearSource]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <AIPromptInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={onSubmit}
        isLoading={loading}
        error={error}
        placeholder={def?.placeholder ?? 'Beschreibe, was am Bild geändert werden soll...'}
        examples={def?.examples}
        toolbar={toolbar}
      />

      {editedImage && (
        <div className="relative rounded-xl overflow-hidden border border-grey-200 dark:border-grey-700 bg-background-pure shadow-sm">
          <button
            onClick={() => {
              if (editedImage) URL.revokeObjectURL(editedImage);
              setEditedImage(null);
            }}
            className="absolute top-2 right-2 z-10 rounded-full bg-black/50 hover:bg-black/70 text-white p-1 transition-colors"
            aria-label="Bild schließen"
            type="button"
          >
            <X className="size-4" />
          </button>
          <div className="flex justify-center bg-grey-50 dark:bg-grey-900">
            <img
              src={editedImage}
              alt="Bearbeitetes Bild"
              className="max-h-[60vh] w-auto h-auto object-contain cursor-zoom-in"
              onClick={openLightbox}
            />
          </div>
          <div className="flex items-center gap-2 p-3 border-t border-grey-100 dark:border-grey-800">
            <Button variant="brand-outline" size="sm" onClick={handleDownload}>
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        </div>
      )}

      {editedImage && (
        <Lightbox
          isOpen={isOpen}
          onClose={closeLightbox}
          imageSrc={editedImage}
          altText="Bearbeitetes Bild"
        />
      )}
    </>
  );
});

BildBearbeitenInner.displayName = 'BildBearbeitenInner';

export default BildBearbeitenInner;
