import { type ConventionSpeechPublic } from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { HiArrowDownTray, HiCheck } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import { useSpeechDetail } from '../hooks/useParteitage';

import { formatDuration, formatResult, SEAT_LABEL, speechName } from './SpeechGrid';

interface SpeechDetailProps {
  speech: ConventionSpeechPublic | null;
  onClose: () => void;
}

export function SpeechDetail({ speech, onClose }: SpeechDetailProps) {
  return (
    <Dialog open={speech !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl gap-0 overflow-y-auto bg-background-pure p-0 sm:max-w-4xl md:overflow-hidden">
        {speech ? <SpeechDetailBody speech={speech} /> : null}
      </DialogContent>
    </Dialog>
  );
}

const pill =
  'rounded-full border border-grey-300 px-2.5 py-0.5 text-xs text-foreground dark:border-grey-600';

function SpeechDetailBody({ speech }: { speech: ConventionSpeechPublic }) {
  const { data, isLoading, isError } = useSpeechDetail(speech.id);
  const result = formatResult(speech);
  const downloadUrl = `${speech.reelUrl}${speech.reelUrl.includes('?') ? '&' : '?'}download=1`;
  const id = encodeURIComponent(speech.id);

  return (
    <div className="grid md:max-h-[calc(100dvh-2rem)] md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <video
        controls
        playsInline
        preload="metadata"
        poster={speech.posterUrl}
        src={speech.reelUrl}
        className="aspect-[9/16] max-h-[60dvh] w-full bg-black object-contain md:max-h-none md:h-full"
      >
        <track
          kind="captions"
          srcLang="de"
          label="Deutsch"
          src={`/api/parteitage/reden/${encodeURIComponent(speech.id)}/untertitel.vtt`}
          default
        />
      </video>

      <div className="flex min-h-0 flex-col md:overflow-hidden">
        <div className="flex flex-col gap-sm border-b border-grey-200 p-md pr-12 dark:border-grey-700">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="text-xl font-bold text-foreground-heading">
              {speechName(speech)}
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground-muted">
              {speech.kv}
            </DialogDescription>
          </DialogHeader>
          <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
            <li className={pill}>Platz {speech.listPlace}</li>
            <li className={pill}>{SEAT_LABEL[speech.seatType]}</li>
            <li className={pill}>{speech.dayLabel}</li>
            <li className={pill}>{formatDuration(speech.durationS)} Min.</li>
            {speech.contested ? <li className={pill}>Kampfkandidatur</li> : null}
            {result ? (
              <li className="flex items-center gap-1 text-sm font-medium text-primary-700 dark:text-primary-300">
                <HiCheck aria-hidden="true" />
                Gewählt mit {result}
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap gap-sm">
            <Button asChild variant="brand" size="brand-sm" className="h-10">
              <Link to={`/studio/videoeditor?parteitagRede=${id}`}>In Editor laden</Link>
            </Button>
            <Button asChild variant="brand-outline" size="brand-sm" className="h-10">
              <Link to={`/studio/video?parteitagRede=${id}`}>Nur untertiteln</Link>
            </Button>
            <Button asChild variant="brand-ghost" size="brand-sm" className="h-10">
              <a href={downloadUrl} download>
                <HiArrowDownTray aria-hidden="true" />
                Herunterladen
              </a>
            </Button>
          </div>
        </div>

        <section
          aria-labelledby={`transcript-${speech.id}`}
          className="flex min-h-0 flex-col gap-xs p-md md:overflow-y-auto"
        >
          <h3 id={`transcript-${speech.id}`} className="m-0 text-sm font-semibold text-foreground">
            Transkript
          </h3>
          {isLoading ? (
            <p className="m-0 text-sm text-foreground-muted">Lädt …</p>
          ) : isError || !data ? (
            <p className="m-0 text-sm text-foreground-muted">
              Das Transkript konnte nicht geladen werden.
            </p>
          ) : (
            <p className="m-0 max-w-[60ch] text-sm leading-relaxed whitespace-pre-line text-foreground">
              {data.transcript}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
