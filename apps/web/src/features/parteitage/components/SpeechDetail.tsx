import { type ConventionSpeechPublic } from '@gruenerator/contracts';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  buttonVariants,
} from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { useSpeechDetail } from '../hooks/useParteitage';

import { formatDuration, formatResult, speechName } from './SpeechGrid';

interface SpeechDetailProps {
  speech: ConventionSpeechPublic | null;
  onClose: () => void;
}

export function SpeechDetail({ speech, onClose }: SpeechDetailProps) {
  return (
    <Sheet open={speech !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-background-pure sm:max-w-md">
        {speech ? <SpeechDetailBody speech={speech} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SpeechDetailBody({ speech }: { speech: ConventionSpeechPublic }) {
  const { data, isLoading, isError } = useSpeechDetail(speech.id);
  const result = formatResult(speech);
  const downloadUrl = `${speech.reelUrl}${speech.reelUrl.includes('?') ? '&' : '?'}download=1`;
  const linkClass = buttonVariants({ variant: 'outline' });

  return (
    <div className="flex flex-col gap-md p-md">
      <SheetHeader>
        <SheetTitle>{speechName(speech)}</SheetTitle>
        <SheetDescription>
          Platz {speech.listPlace} · {speech.kv} · {formatDuration(speech.durationS)}
          {result ? ` · ${result}` : ''}
        </SheetDescription>
      </SheetHeader>

      {/* Untertitel sind im Reel eingebrannt; das Transkript steht darunter. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        controls
        preload="metadata"
        poster={speech.posterUrl}
        src={speech.reelUrl}
        className="aspect-[9/16] max-h-[60dvh] w-full rounded-md bg-black object-contain"
      />

      <div className="flex flex-wrap gap-sm">
        <Link
          className={buttonVariants()}
          to={`/studio/videoeditor?parteitagRede=${encodeURIComponent(speech.id)}`}
        >
          In Editor laden
        </Link>
        <Link
          className={linkClass}
          to={`/studio/video?parteitagRede=${encodeURIComponent(speech.id)}`}
        >
          Nur untertiteln
        </Link>
        <a className={linkClass} href={downloadUrl} download>
          Herunterladen
        </a>
      </div>

      <section aria-labelledby={`transcript-${speech.id}`} className="flex flex-col gap-xs">
        <h3 id={`transcript-${speech.id}`} className="m-0 text-sm font-semibold text-foreground">
          Transkript
        </h3>
        {isLoading ? (
          <p className="m-0 text-sm text-grey-500">Lädt …</p>
        ) : isError || !data ? (
          <p className="m-0 text-sm text-grey-500">Das Transkript konnte nicht geladen werden.</p>
        ) : (
          <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {data.transcript}
          </p>
        )}
      </section>
    </div>
  );
}
