import { useMediaLibrary, useMediaUpload, type MediaItem } from '@gruenerator/shared/media-library';
import { useEffect, useRef, useState } from 'react';
import { FiUploadCloud, FiX } from 'react-icons/fi';

export interface SlideImage {
  src: string;
  alt: string;
}

export interface SlideImageDialogProps {
  onInsert: (image: SlideImage) => void;
  onClose: () => void;
}

/** Item URLs are relative on some instances; the PPTX export fetches them
 * server-side, where a relative path resolves to nothing. */
function toAbsolute(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function itemSrc(item: MediaItem): string {
  return item.mediaUrl || `/api/share/${item.shareToken}/preview`;
}

/**
 * Picks a body image from the media library — or uploads one — and demands an
 * alternative text before it can be inserted. The requirement is not a nicety:
 * a slide image with no alt text is invisible to a screen reader and to the
 * exported PPTX, and decks get published (BFSG/BaFG).
 */
export function SlideImageDialog({ onInsert, onClose }: SlideImageDialogProps) {
  const { items, isLoading, error, setFilters } = useMediaLibrary({
    initialFilters: { type: 'image' },
  });
  const { upload, isUploading, error: uploadError } = useMediaUpload();

  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (item: MediaItem) => {
    setSrc(itemSrc(item));
    // Library alt text is a starting point, never the final word — the same
    // image says something different on a different slide.
    if (item.altText) setAlt(item.altText);
    altRef.current?.focus();
  };

  const handleFile = async (file: File) => {
    const result = await upload(file, { uploadSource: 'upload' });
    if (result) setSrc(`/api/share/${result.shareToken}/preview`);
  };

  const ready = src.trim() !== '' && alt.trim() !== '';

  const submit = () => {
    if (!ready) return;
    onInsert({ src: toAbsolute(src.trim()), alt: alt.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bild einfügen"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-grey-900"
      >
        <div className="flex flex-none items-center gap-3 border-b border-[#E2E8E4] px-5 py-4 dark:border-grey-700">
          <h2 className="flex-1 text-base font-bold text-[#1B2A22] dark:text-grey-100">
            Bild einfügen
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#4A5A51] hover:bg-[#F4F7F5] dark:text-grey-300 dark:hover:bg-grey-800"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFilters({ search: e.target.value });
              }}
              placeholder="Mediathek durchsuchen …"
              aria-label="Mediathek durchsuchen"
              className="h-10 min-w-[12rem] flex-1 rounded-full border border-[#D4DDD7] bg-white px-4 text-sm text-[#1B2A22] outline-none focus:border-primary-500 dark:border-grey-600 dark:bg-grey-800 dark:text-grey-100"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="flex h-10 flex-none items-center gap-2 rounded-full border border-[#D4DDD7] px-4 text-sm font-bold text-[#2F4238] hover:bg-[#F4F7F5] disabled:opacity-50 dark:border-grey-600 dark:text-grey-200 dark:hover:bg-grey-800"
            >
              <FiUploadCloud size={16} />
              {isUploading ? 'Lädt hoch …' : 'Hochladen'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              aria-label="Bilddatei auswählen"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {(error || uploadError) && (
            <p role="alert" className="pb-3 text-sm text-red-600">
              {uploadError ?? error}
            </p>
          )}

          {isLoading ? (
            <p className="py-6 text-center text-sm text-[#6E7E74]">Mediathek wird geladen …</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#6E7E74]">
              Keine Bilder in der Mediathek – lade eines hoch oder trage unten eine Adresse ein.
            </p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
              {items.map((item) => {
                const url = itemSrc(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pick(item)}
                      aria-pressed={src === url}
                      className={`block w-full overflow-hidden rounded-lg border-2 ${
                        src === url ? 'border-primary-500' : 'border-transparent'
                      }`}
                    >
                      <img
                        src={item.thumbnailUrl ?? url}
                        alt={item.altText ?? item.title ?? item.originalFilename ?? 'Bild'}
                        loading="lazy"
                        className="aspect-[4/3] w-full bg-[#EFF3F0] object-cover dark:bg-grey-800"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-none flex-col gap-3 border-t border-[#E2E8E4] px-5 py-4 dark:border-grey-700">
          <label className="text-sm font-bold text-[#2F4238] dark:text-grey-200">
            Bildadresse
            <input
              type="url"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder="https://…"
              className="mt-1 h-11 w-full rounded-xl border border-[#D4DDD7] bg-white px-3 text-base font-normal text-[#1B2A22] outline-none focus:border-primary-500 dark:border-grey-600 dark:bg-grey-800 dark:text-grey-100"
            />
          </label>
          <label className="text-sm font-bold text-[#2F4238] dark:text-grey-200">
            Alternativtext <span aria-hidden="true">*</span>
            <input
              ref={altRef}
              type="text"
              required
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Was ist auf dem Bild zu sehen?"
              aria-describedby="slide-image-alt-hint"
              className="mt-1 h-11 w-full rounded-xl border border-[#D4DDD7] bg-white px-3 text-base font-normal text-[#1B2A22] outline-none focus:border-primary-500 dark:border-grey-600 dark:bg-grey-800 dark:text-grey-100"
            />
          </label>
          <p id="slide-image-alt-hint" className="text-xs text-[#6E7E74] dark:text-grey-400">
            Pflichtfeld – ohne Alternativtext bleibt das Bild für Screenreader stumm.
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className="h-12 w-full rounded-full bg-primary-600 text-sm font-bold text-white hover:brightness-110 disabled:opacity-45"
          >
            Einfügen
          </button>
        </div>
      </div>
    </div>
  );
}
