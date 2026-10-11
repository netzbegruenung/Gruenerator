import { type MediaItem } from '@gruenerator/shared/media-library';
import { MediaPickerGrid } from '@gruenerator/shared/media-library/ui';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@gruenerator/ui';
import { useId, useRef, useState } from 'react';

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

/** What gets inserted is the full-resolution original, never a tile variant. */
function itemSrc(item: { mediaUrl?: string; shareToken: string }): string {
  return item.mediaUrl || `/api/share/${item.shareToken}/preview`;
}

/**
 * Picks a body image from the media library — or uploads one — and demands an
 * alternative text before it can be inserted. The requirement is not a nicety:
 * a slide image with no alt text is invisible to a screen reader and to the
 * exported PPTX, and decks get published (BFSG/BaFG).
 */
export function SlideImageDialog({ onInsert, onClose }: SlideImageDialogProps) {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const srcId = useId();
  const altId = useId();
  const hintId = useId();

  const pick = (item: MediaItem) => {
    setPickedId(item.id);
    setSrc(itemSrc(item));
    // Library alt text is a starting point, never the final word — the same
    // image says something different on a different slide.
    if (item.altText) setAlt(item.altText);
    altRef.current?.focus();
  };

  const ready = src.trim() !== '' && alt.trim() !== '';

  const submit = () => {
    if (!ready) return;
    onInsert({ src: toAbsolute(src.trim()), alt: alt.trim() });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-[720px]"
      >
        <DialogHeader className="border-b border-grey-200 px-5 py-4 dark:border-grey-700">
          <DialogTitle>Bild einfügen</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <MediaPickerGrid
            type="image"
            selectedIds={pickedId ? [pickedId] : []}
            onPick={pick}
            onUploaded={(result) => {
              setPickedId(result.id);
              setSrc(itemSrc(result));
              altRef.current?.focus();
            }}
            emptyHint="Lade ein Bild hoch oder trage unten eine Adresse ein."
            sizes="120px"
          />
        </div>

        {/* noValidate: a library pick is a relative `/api/share/…` path, which
            `type="url"` would reject; `ready` is the gate. */}
        <form
          noValidate
          className="flex flex-col gap-3 border-t border-grey-200 px-5 py-4 dark:border-grey-700"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={srcId}>Bildadresse</Label>
            <Input
              id={srcId}
              type="url"
              value={src}
              onChange={(e) => {
                setSrc(e.target.value);
                setPickedId(null);
              }}
              placeholder="https://…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={altId}>
              Alternativtext <span aria-hidden="true">*</span>
            </Label>
            <Input
              id={altId}
              ref={altRef}
              required
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Was ist auf dem Bild zu sehen?"
              aria-describedby={hintId}
            />
            <p id={hintId} className="m-0 text-xs text-foreground/60">
              Pflichtfeld – ohne Alternativtext bleibt das Bild für Screenreader stumm.
            </p>
          </div>
          <Button type="submit" disabled={!ready}>
            Einfügen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
