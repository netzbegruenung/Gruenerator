import { type GenerateSpeechResponse, type SpeechFile } from '@gruenerator/contracts';
import { Button, CopyLinkRow } from '@gruenerator/ui';
import { Download } from 'lucide-react';
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
  onDownload: (file: SpeechFile) => void;
}

export default function VoiceResult({ result, playable, title, onDownload }: VoiceResultProps) {
  return (
    <section
      aria-labelledby="voice-result-heading"
      className="flex flex-col gap-md rounded-xl border border-grey-200 bg-background-pure p-md shadow-sm dark:border-grey-700"
    >
      <h2 id="voice-result-heading" className="m-0 text-lg text-foreground-heading">
        Fertig – {formatAudioDuration(result.durationSeconds)}
        {result.chunks > 1 ? ` · ${result.chunks} Abschnitte` : ''}
      </h2>
      <AudioPlayer
        src={`${baseURL}/share/${playable.shareToken}/stream`}
        title={`${title} – Vorschau`}
      />
      <div className="flex flex-wrap gap-sm">
        {result.files.map((file) => (
          <Button
            key={file.shareToken}
            type="button"
            variant="outline"
            onClick={() => onDownload(file)}
          >
            <Download aria-hidden="true" />
            {FORMAT_LABELS[file.format].label} herunterladen ({formatFileSize(file.fileSize)})
          </Button>
        ))}
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        In der <Link to="/media-library">Mediathek</Link> gespeichert.
      </p>
      <TreeBudgetLine status={result.quota} className="text-sm text-muted-foreground" />
      <CopyLinkRow
        value={`${getPublicAppOrigin()}${playable.shareUrl}`}
        copyLabel="Link kopieren"
        copiedLabel="Kopiert"
      />
    </section>
  );
}
