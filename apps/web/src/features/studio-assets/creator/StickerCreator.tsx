import { type StudioAssetItem } from '@gruenerator/contracts';
import { Button, ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';
import { useCallback, useState, type JSX, type ReactNode } from 'react';
import { PiImageSquare, PiPaintBrush, PiTextAa } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';

import { BadgeDesigner } from './BadgeDesigner';
import { useObjectUrl, type DesignerParts, type StickerDraft } from './creatorParts';
import { ImageStickerDesigner } from './ImageStickerDesigner';
import { StickerDoneCard } from './StickerDoneCard';
import { StickerSaveDialog } from './StickerSaveDialog';

import { cn } from '@/utils/cn';

export type StickerCreatorReturn = 'profilbild' | 'canvas' | null;

/** Upload and cut-out share one way in: the creator decides by the picture. */
type CreatorKind = 'image' | 'badge';

const KINDS: { value: CreatorKind; label: string; icon: typeof PiImageSquare }[] = [
  { value: 'image', label: 'Bild', icon: PiImageSquare },
  { value: 'badge', label: 'Text-Badge', icon: PiTextAa },
];

export interface StickerCreatorProps {
  /** The visible title, e.g. the page's h1 or the dialog's title. */
  heading: ReactNode;
  description?: string;
  /** Extra header controls after the save button, e.g. the dialog's close button. */
  headerEnd?: ReactNode;
  className?: string;
  /** Where the person came from; shapes the closing step. */
  returnTo?: StickerCreatorReturn;
  /** Takes the new sticker instead of the closing step — e.g. straight onto a Profilbild. */
  onCreated?: (item: StudioAssetItem) => void;
}

/**
 * Stage in the middle, everything else in the side panel — the Profilbild
 * editor's layout. Fills its parent; the page gives it the viewport, the dialog its box.
 */
export function StickerCreator({
  heading,
  description,
  headerEnd,
  className,
  returnTo = null,
  onCreated,
}: StickerCreatorProps): JSX.Element {
  const locale = useAuthStore((s) => s.locale);
  const [kind, setKind] = useState<CreatorKind>('image');
  const [session, setSession] = useState(0);
  const [draft, setDraft] = useState<StickerDraft | null>(null);
  const [created, setCreated] = useState<StudioAssetItem | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const draftUrl = useObjectUrl(draft?.blob ?? null);

  const takeDraft = useCallback((next: StickerDraft | null) => setDraft(next), []);

  const switchKind = (next: CreatorKind) => {
    setKind(next);
    setDraft(null);
  };

  const startOver = () => {
    setSession((n) => n + 1);
    setDraft(null);
    setCreated(null);
  };

  const saved = (item: StudioAssetItem) => {
    if (onCreated) onCreated(item);
    else setCreated(item);
  };

  const shell = ({ stage, controls }: DesignerParts) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
      <main
        // Die Bühne bemisst sich an dieser Fläche (Container-Einheiten), wie im Profilbild.
        className="flex min-w-0 flex-none flex-col items-center justify-center bg-background-alt px-6 py-4 md:flex-1 md:p-6 md:[container-type:size] lg:p-8"
      >
        <div className="w-full max-w-[420px] md:w-[min(560px,100cqw_-_48px,100cqh_-_48px)] md:max-w-none">
          {stage}
        </div>
      </main>
      <aside className="flex flex-col gap-5 p-5 md:w-[340px] md:flex-none md:overflow-y-auto md:border-l md:border-border md:p-6 lg:w-[400px] lg:p-7">
        <div className="flex flex-col gap-lg">{controls}</div>
      </aside>
    </div>
  );

  const doneCard = created ? (
    <StickerDoneCard
      item={created}
      previewUrl={draftUrl}
      returnTo={returnTo}
      onStartOver={startOver}
    />
  ) : null;

  return (
    <div className={cn('flex min-h-0 flex-col bg-background text-foreground', className)}>
      <header className="flex flex-none items-center justify-between gap-sm border-b border-border py-2.5 pr-4 pl-14 md:grid md:h-[72px] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-md md:px-6 md:py-0 lg:px-8">
        <div className="flex min-w-0 items-baseline gap-3.5">
          {heading}
          {description ? (
            <span className="hidden truncate text-[15px] text-muted-foreground xl:inline">
              {description}
            </span>
          ) : null}
        </div>
        {created ? (
          <span aria-hidden="true" />
        ) : (
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Art des Stickers"
            value={kind}
            onValueChange={(v) => {
              if (v && v !== kind) switchKind(v as CreatorKind);
            }}
          >
            {KINDS.map((k) => (
              <ToggleGroupItem key={k.value} value={k.value} className="h-9 gap-1.5 px-3">
                <k.icon aria-hidden="true" className="size-[18px]" />
                <span className="max-sm:sr-only">{k.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="flex flex-none items-center justify-end gap-2">
          {created || onCreated ? null : (
            <Button asChild variant="outline" className="max-md:hidden">
              <Link to={`/studio/sticker/gestalten${returnTo ? `?return=${returnTo}` : ''}`}>
                <PiPaintBrush aria-hidden="true" className="size-[18px]" />
                Im Editor gestalten
              </Link>
            </Button>
          )}
          {created ? null : (
            <Button
              type="button"
              variant="brand"
              disabled={!draft}
              onClick={() => setSaveOpen(true)}
            >
              Sticker speichern
            </Button>
          )}
          {headerEnd}
        </div>
      </header>
      {doneCard ??
        (kind === 'badge' ? (
          <BadgeDesigner key={`badge-${session}`} locale={locale} onDraft={takeDraft}>
            {shell}
          </BadgeDesigner>
        ) : (
          <ImageStickerDesigner key={`image-${session}`} locale={locale} onDraft={takeDraft}>
            {shell}
          </ImageStickerDesigner>
        ))}
      <StickerSaveDialog
        key={session}
        draft={draft}
        open={saveOpen && !created}
        onOpenChange={setSaveOpen}
        onSaved={saved}
      />
    </div>
  );
}
