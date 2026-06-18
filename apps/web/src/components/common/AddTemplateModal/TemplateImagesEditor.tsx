import { type TemplateImage } from '@gruenerator/contracts';
import { UploadZone } from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { HiOutlinePhotograph, HiOutlineStar, HiPlus } from 'react-icons/hi';

import { cn } from '../../../utils/cn';
import apiClient from '../../utils/apiClient';

// Binary uploads go through the (non-contracted, multipart) media endpoint,
// which returns a shareable URL we then store on the template.
interface MediaUploadResponse {
  success: boolean;
  data: { shareUrl: string };
}

/**
 * A single preview image inside the editor. `file` is set for images the user
 * just picked locally (not yet uploaded); `url` is then an object URL for the
 * thumbnail preview and gets replaced by the uploaded shareUrl on submit.
 */
export interface EditorImage {
  id: string;
  url: string;
  title?: string;
  file?: File;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `img-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

export const editorImageFromUrl = (url: string, title?: string): EditorImage => ({
  id: newId(),
  url,
  title,
});

export const editorImageFromFile = (file: File): EditorImage => ({
  id: newId(),
  url: URL.createObjectURL(file),
  file,
});

/**
 * Upload any local files and return the final `images` payload (ordered) plus
 * the primary `preview_image_url` (the first image). Remote images pass through
 * unchanged. Throws if a file upload fails.
 */
export async function resolveTemplateImages(
  images: EditorImage[]
): Promise<{ images: TemplateImage[]; preview_image_url: string | null }> {
  const resolved: TemplateImage[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    let url = img.url;
    if (img.file) {
      const formData = new FormData();
      formData.append('file', img.file);
      formData.append('uploadSource', 'template-upload');
      const upload = await apiClient.post<MediaUploadResponse>('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const shareUrl = upload.data?.data?.shareUrl;
      if (!shareUrl) throw new Error('Bild konnte nicht hochgeladen werden.');
      url = shareUrl;
    }
    resolved.push({ url, title: img.title, display_order: i });
  }
  return { images: resolved, preview_image_url: resolved[0]?.url ?? null };
}

/** Read a local file as a `data:` URL (for the on-demand description button). */
export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });

interface TemplateImagesEditorProps {
  images: EditorImage[];
  onChange: (images: EditorImage[]) => void;
  disabled?: boolean;
}

const TemplateImagesEditor = ({ images, onChange, disabled }: TemplateImagesEditorProps) => {
  const [urlInput, setUrlInput] = useState('');

  const addFiles = useCallback(
    (files: File[]) => {
      onChange([...images, ...files.map(editorImageFromFile)]);
    },
    [images, onChange]
  );

  const addUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onChange([...images, editorImageFromUrl(trimmed)]);
    setUrlInput('');
  }, [urlInput, images, onChange]);

  const removeAt = useCallback(
    (id: string) => {
      const target = images.find((img) => img.id === id);
      if (target?.file && target.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
      onChange(images.filter((img) => img.id !== id));
    },
    [images, onChange]
  );

  const makePrimary = useCallback(
    (id: string) => {
      const target = images.find((img) => img.id === id);
      if (!target) return;
      onChange([target, ...images.filter((img) => img.id !== id)]);
    },
    [images, onChange]
  );

  return (
    <div className="flex flex-col gap-sm">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-sm">
          {images.map((img, index) => (
            <div
              key={img.id}
              className="relative w-[88px] h-[88px] rounded-lg overflow-hidden bg-background-alt border border-grey-200 dark:border-grey-700 group"
            >
              <img
                src={img.url}
                alt={img.title || `Vorschau ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {index === 0 && (
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                  Vorschau
                </span>
              )}
              {!disabled && (
                <>
                  <button
                    type="button"
                    onClick={() => removeAt(img.id)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px] cursor-pointer border-none hover:bg-black/80 transition-colors"
                    aria-label="Bild entfernen"
                  >
                    ✕
                  </button>
                  {index !== 0 && (
                    <button
                      type="button"
                      onClick={() => makePrimary(img.id)}
                      className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer border-none hover:bg-black/80 transition-colors"
                      aria-label="Als Vorschau festlegen"
                      title="Als Vorschau festlegen"
                    >
                      <HiOutlineStar size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <>
          <UploadZone
            variant="minimal"
            multiple
            onFilesSelected={addFiles}
            accept={{
              'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
              'application/pdf': ['.pdf'],
            }}
            maxSizeMB={10}
            icon={<HiOutlinePhotograph className="text-xl" />}
            title="Bild(er) hinzufügen"
            subtitle="PNG, JPG, PDF oder WebP · Max. 10 MB · mehrere möglich"
            className="border border-dashed border-grey-200 dark:border-grey-700 rounded-lg py-6"
          />
          <div className="flex items-center gap-xs">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="...oder Bild-URL einfügen"
              className={cn(
                'flex-1 rounded-lg border border-grey-200 dark:border-grey-700 bg-background px-md py-sm text-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors'
              )}
            />
            <button
              type="button"
              onClick={addUrl}
              disabled={!urlInput.trim()}
              className="flex items-center gap-xs rounded-lg border border-grey-200 dark:border-grey-700 px-md py-sm text-sm text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 disabled:opacity-40 transition-colors cursor-pointer bg-transparent"
            >
              <HiPlus size={14} />
              Hinzufügen
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TemplateImagesEditor;
