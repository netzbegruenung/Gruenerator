import { type GenerateSpeechResponse, type SpeechFile } from '@gruenerator/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@gruenerator/ui';
import { ChevronDown, Download, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import AudioPlayer from '../../../components/common/AudioPlayer';
import { TreeBudgetLine } from '../../../components/common/TreeBudgetLine';
import { formatAudioDuration } from '../../../utils/formatAudioDuration';
import { formatFileSize } from '../../../utils/formatFileSize';
import { getPublicAppOrigin } from '../../../utils/platform';
import { FORMAT_LABELS } from '../presets';

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export interface VoiceResultProps {
  result: GenerateSpeechResponse;
  /** What the preview plays — the MP3 where there is one. */
  playable: SpeechFile;
  title: string;
  /** Text or settings changed since this file was made. */
  stale: boolean;
  onDownload: (file: SpeechFile) => void;
}

export default function VoiceResult({
  result,
  playable,
  title,
  stale,
  onDownload,
}: VoiceResultProps) {
  const copyLink = () => {
    navigator.clipboard.writeText(`${getPublicAppOrigin()}${playable.shareUrl}`).then(
      () => toast.success('Link kopiert'),
      () => toast.error('Der Link konnte nicht kopiert werden.')
    );
  };

  return (
    <section
      aria-labelledby="voice-result-heading"
      className="flex flex-col gap-md rounded-xl border border-grey-200 bg-background-pure p-md shadow-sm dark:border-grey-700"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 id="voice-result-heading" className="m-0 text-lg text-foreground-heading">
          {title}
        </h2>
        <span className="text-sm text-muted-foreground">
          {formatAudioDuration(result.durationSeconds)} Min.
          {result.chunks > 1 ? ` · ${result.chunks} Abschnitte` : ''}
        </span>
      </div>

      <AudioPlayer
        src={`${baseURL}/share/${playable.shareToken}/stream`}
        title={`${title} – Vorschau`}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="self-start">
            <Download aria-hidden="true" />
            Herunterladen
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-72">
          {result.files.map((file) => (
            <DropdownMenuItem
              key={file.shareToken}
              onSelect={() => onDownload(file)}
              className="flex-col items-start gap-0"
            >
              <span className="font-medium">
                {FORMAT_LABELS[file.format].label} ({formatFileSize(file.fileSize)})
              </span>
              <span className="text-xs text-muted-foreground">
                {FORMAT_LABELS[file.format].hint}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {stale ? (
        <p className="m-0 text-sm text-muted-foreground">
          Text oder Einstellungen geändert – erneut vertonen, um die Datei zu aktualisieren.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-md gap-y-xs border-t border-grey-200 pt-sm text-sm text-muted-foreground dark:border-grey-700">
        <span>
          In der <Link to="/media-library">Mediathek</Link> gespeichert
        </span>
        <TreeBudgetLine status={result.quota} className="text-sm text-muted-foreground" />
        <Button type="button" variant="ghost" size="sm" onClick={copyLink} className="ml-auto">
          <Link2 aria-hidden="true" />
          Link kopieren
        </Button>
      </div>
    </section>
  );
}
