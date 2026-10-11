import {
  MEDIA_LIMITS,
  type MediaItem,
  type MediaUpdateParams,
} from '@gruenerator/shared/media-library';
import { MediaPreview, mediaStreamUrl } from '@gruenerator/shared/media-library/ui';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@gruenerator/ui';
import { Download, Share2, Trash2, X } from 'lucide-react';
import { useId, useState, type JSX } from 'react';
import { toast } from 'sonner';

import AudioPlayer from '../../../components/common/AudioPlayer';
import { useSharedMediaUrlOptions } from '../../../components/common/SharedMediaImage';
import { formatFileSize, formatMediaDate, mediaKindLabel, mediaTitle } from '../mediaFormat';

const ICON = 'size-[18px]';

export interface MediaDetailDialogProps {
  item: MediaItem;
  onClose: () => void;
  onSave: (id: string, updates: MediaUpdateParams) => Promise<boolean>;
  onDownload: (item: MediaItem) => void;
  /** Omitted for items that cannot be shared (audio). */
  onShare?: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}

/**
 * Detail view of one library item, laid out like the Vorlagen detail: the
 * preview on the left; kind, title and the editable metadata on the right;
 * download, share and delete as quiet icons next to close.
 */
export function MediaDetailDialog({
  item,
  onClose,
  onSave,
  onDownload,
  onShare,
  onDelete,
}: MediaDetailDialogProps): JSX.Element {
  const urlOptions = useSharedMediaUrlOptions(item.shareToken);
  const [title, setTitle] = useState(item.title ?? '');
  const [altText, setAltText] = useState(item.altText ?? '');
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const altId = useId();
  const dirty = title !== (item.title ?? '') || altText !== (item.altText ?? '');

  const save = async () => {
    setSaving(true);
    const ok = await onSave(item.id, { title: title.trim(), altText: altText.trim() });
    setSaving(false);
    if (ok) {
      toast.success('Gespeichert');
      onClose();
    } else {
      toast.error('Speichern fehlgeschlagen. Bitte versuche es erneut.');
    }
  };

  const meta = [
    mediaKindLabel(item),
    formatMediaDate(item.createdAt),
    formatFileSize(item.fileSize),
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[90dvh] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-8 overflow-y-auto rounded-[20px] p-8 pt-16 max-sm:gap-6 max-sm:p-5 max-sm:pt-16 sm:max-w-[1000px] md:pt-8"
      >
        <div className="absolute top-4 right-4 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Herunterladen"
            title="Herunterladen"
            onClick={() => onDownload(item)}
          >
            <Download aria-hidden className={ICON} />
          </Button>
          {onShare && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Teilen"
              title="Teilen"
              onClick={() => onShare(item)}
            >
              <Share2 aria-hidden className={ICON} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="In den Papierkorb"
            title="In den Papierkorb"
            onClick={() => onDelete(item)}
          >
            <Trash2 aria-hidden className={ICON} />
          </Button>
          <div aria-hidden className="mx-2 h-5 w-px bg-grey-200 dark:bg-grey-700" />
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Schließen">
              <X aria-hidden className="size-5" />
            </Button>
          </DialogClose>
        </div>

        <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl bg-background-alt max-sm:aspect-square">
          {item.mediaType === 'audio' ? (
            <div className="w-full p-md">
              <AudioPlayer src={mediaStreamUrl(item, urlOptions)} title={mediaTitle(item)} />
            </div>
          ) : (
            <MediaPreview
              item={item}
              detail
              priority
              sizes="(max-width: 640px) 100vw, 480px"
              {...urlOptions}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:pt-2">
          <span className="text-sm text-grey-600 dark:text-grey-400">{meta.join(' · ')}</span>
          <DialogTitle className="m-0 text-[28px] leading-tight font-bold break-words text-foreground-heading">
            {mediaTitle(item)}
          </DialogTitle>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={titleId}>Titel</Label>
              <Input
                id={titleId}
                value={title}
                maxLength={MEDIA_LIMITS.maxTitleLength}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titel eingeben …"
              />
            </div>
            {item.mediaType !== 'audio' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={altId}>Alt-Text</Label>
                <Textarea
                  id={altId}
                  value={altText}
                  maxLength={MEDIA_LIMITS.maxAltTextLength}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Was ist zu sehen? Für Screenreader und Barrierefreiheit."
                  rows={4}
                />
              </div>
            )}
            <Button
              type="submit"
              variant="brand"
              size="brand-md"
              className="self-start"
              disabled={!dirty || saving}
            >
              {saving ? 'Speichern …' : 'Speichern'}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
