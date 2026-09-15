import {
  DEFAULT_TTS_VOICE_ID,
  SPEECH_MAX_CHUNK_CHARS,
  type SpeechFile,
  type SpeechOutputFormat,
  type SpeechPreset,
  type TtsVoiceId,
} from '@gruenerator/contracts';
import { slugifyName } from '@gruenerator/shared/utils';
import {
  Button,
  Checkbox,
  CollapsibleSection,
  CopyLinkRow,
  Label,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from '@gruenerator/ui';
import { Download, Pause } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import AudioPlayer from '../../components/common/AudioPlayer';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import Spinner from '../../components/common/Spinner';
import SubmitButton from '../../components/common/SubmitButton';
import apiClient from '../../components/utils/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { downloadBlob } from '../../utils/downloadFile';
import { formatAudioDuration } from '../../utils/formatAudioDuration';
import { formatFileSize } from '../../utils/formatFileSize';
import { getPublicAppOrigin } from '../../utils/platform';
import { formatCount } from '../../utils/usageFormat';

import ScriptAssistant from './components/ScriptAssistant';
import VoicePicker from './components/VoicePicker';
import { useGenerateSpeech } from './hooks/useGenerateSpeech';
import {
  FORMAT_LABELS,
  PAUSE_TAG,
  SPEED_OPTIONS,
  VOICE_PRESETS,
  VOICE_PRESET_ORDER,
} from './presets';

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
const FORMAT_ORDER: readonly SpeechOutputFormat[] = ['mp3', 'wav_phone'];

function fileNameFor(title: string, file: SpeechFile): string {
  return `${slugifyName(title, 'voice')}.${file.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`;
}

const VoicePage = () => {
  const profileVoice = useAuthStore((s) => s.user?.tts_voice_id ?? null);
  const [preset, setPreset] = useState<SpeechPreset>('vorlesefassung');
  const [text, setText] = useState('');
  const [formats, setFormats] = useState<readonly SpeechOutputFormat[]>(
    VOICE_PRESETS.vorlesefassung.defaultFormats
  );
  const [speed, setSpeed] = useState<number>(1);
  const [voiceId, setVoiceId] = useState<TtsVoiceId>(profileVoice ?? DEFAULT_TTS_VOICE_ID);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generate = useGenerateSpeech();

  const def = VOICE_PRESETS[preset];
  const chunkCount = Math.max(1, Math.ceil(text.length / SPEECH_MAX_CHUNK_CHARS));
  const canSubmit = text.trim().length > 0 && formats.length > 0 && !generate.isPending;
  const result = generate.data ?? null;
  const playable = result?.files.find((f) => f.format === 'mp3') ?? result?.files[0] ?? null;

  const choosePreset = (next: SpeechPreset) => {
    setPreset(next);
    setFormats(VOICE_PRESETS[next].defaultFormats);
    setText((current) => current.slice(0, VOICE_PRESETS[next].maxChars));
    generate.reset();
  };

  const toggleFormat = (format: SpeechOutputFormat, checked: boolean) => {
    setFormats((current) =>
      FORMAT_ORDER.filter((f) => (f === format ? checked : current.includes(f)))
    );
  };

  // Never truncate: a cut-off tag would be read aloud as text.
  const pauseFits = text.length + PAUSE_TAG.length <= def.maxChars;

  const insertPause = useCallback(() => {
    if (!pauseFits) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    setText(`${text.slice(0, start)}${PAUSE_TAG}${text.slice(end)}`);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + PAUSE_TAG.length;
      el.setSelectionRange(caret, caret);
    });
  }, [pauseFits, text]);

  const submit = () => {
    if (!canSubmit) return;
    generate.mutate({
      preset,
      text: text.trim(),
      voiceId,
      formats: [...formats],
      speed: speed === 1 ? null : speed,
    });
  };

  const download = async (file: SpeechFile) => {
    try {
      const response = await apiClient.get<Blob>(`/share/${file.shareToken}/download`, {
        responseType: 'blob',
      });
      await downloadBlob(response.data, fileNameFor(def.title, file));
    } catch {
      toast.error('Der Download ist fehlgeschlagen. Die Datei liegt weiterhin in der Mediathek.');
    }
  };

  return (
    <PageContainer
      title="Grünerator Voice"
      subtitle="Text in gesprochene Sprache verwandeln – als Datei zum Herunterladen."
      maxWidth="md"
    >
      <div className="flex flex-col gap-xl">
        <ScriptAssistant
          preset={preset}
          onDraft={(script) => {
            setText(script.slice(0, def.maxChars));
            generate.reset();
            textareaRef.current?.focus();
          }}
        />

        <div className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <Label htmlFor="voice-text">Text</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={insertPause}
              disabled={!pauseFits}
            >
              <Pause className="size-4" aria-hidden="true" />
              Pause einfügen
            </Button>
          </div>
          <p id="voice-text-hint" className="m-0 text-sm text-muted-foreground">
            {def.hint}
          </p>
          <Textarea
            id="voice-text"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, def.maxChars))}
            placeholder={def.placeholder}
            rows={preset === 'vorlesefassung' ? 14 : 8}
            maxLength={def.maxChars}
            aria-describedby="voice-text-hint voice-text-count"
          />
          <p id="voice-text-count" aria-live="polite" className="m-0 text-xs text-muted-foreground">
            {formatCount(text.length)} / {formatCount(def.maxChars)} Zeichen
            {chunkCount > 1
              ? ` · wird in ${chunkCount} Abschnitten erzeugt (je höchstens ${formatCount(SPEECH_MAX_CHUNK_CHARS)} Zeichen)`
              : ''}
          </p>
        </div>

        <CollapsibleSection bordered title="Mehr einstellen">
          <div className="flex flex-col gap-lg pt-sm">
            <div className="flex flex-col gap-sm">
              <span id="voice-preset-label" className="text-sm font-medium text-foreground">
                Art der Aufnahme
              </span>
              <ToggleGroup
                type="single"
                value={preset}
                onValueChange={(value) => {
                  if (value) choosePreset(value as SpeechPreset);
                }}
                aria-labelledby="voice-preset-label"
                className="justify-start"
              >
                {VOICE_PRESET_ORDER.map((id) => (
                  <ToggleGroupItem key={id} value={id}>
                    {VOICE_PRESETS[id].title}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="m-0 text-sm text-muted-foreground">{def.description}</p>
            </div>

            <div className="grid gap-lg sm:grid-cols-2">
              <div className="flex flex-col gap-sm">
                <span className="text-sm font-medium text-foreground">Stimme</span>
                <VoicePicker value={voiceId} onChange={setVoiceId} />
              </div>
              <div className="flex flex-col gap-sm">
                <span id="voice-speed-label" className="text-sm font-medium text-foreground">
                  Tempo
                </span>
                <ToggleGroup
                  type="single"
                  value={String(speed)}
                  onValueChange={(value) => {
                    if (value) setSpeed(Number(value));
                  }}
                  aria-labelledby="voice-speed-label"
                  className="justify-start"
                >
                  {SPEED_OPTIONS.map((option) => (
                    <ToggleGroupItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            <fieldset className="m-0 flex flex-col gap-sm border-0 p-0">
              <legend className="mb-sm text-sm font-medium text-foreground">Ausgabeformat</legend>
              {FORMAT_ORDER.map((format) => {
                const id = `voice-format-${format}`;
                return (
                  <div key={format} className="flex items-start gap-sm">
                    <Checkbox
                      id={id}
                      checked={formats.includes(format)}
                      onCheckedChange={(checked) => toggleFormat(format, checked === true)}
                    />
                    <Label htmlFor={id} className="flex flex-col gap-xxs font-normal">
                      <span className="font-medium">{FORMAT_LABELS[format].label}</span>
                      <span className="text-sm text-muted-foreground">
                        {FORMAT_LABELS[format].hint}
                      </span>
                    </Label>
                  </div>
                );
              })}
              {formats.length === 0 ? (
                <p className="m-0 text-sm text-destructive" role="alert">
                  Mindestens ein Format auswählen.
                </p>
              ) : null}
            </fieldset>
          </div>
        </CollapsibleSection>

        <div className="flex flex-col gap-md">
          <SubmitButton
            text="Vertonen"
            onClick={submit}
            loading={generate.isPending}
            disabled={!canSubmit}
          />
          {generate.isPending ? (
            <div role="status" aria-live="polite" className="flex items-center gap-sm text-sm">
              <Spinner />
              <span>
                Sprache wird erzeugt …
                {chunkCount > 1 ? ` (${chunkCount} Abschnitte, das dauert einen Moment)` : ''}
              </span>
            </div>
          ) : null}
          {generate.error ? (
            <p role="alert" className="m-0 text-sm text-destructive">
              {generate.error.message}
            </p>
          ) : null}
        </div>

        {result && playable ? (
          <section
            aria-labelledby="voice-result-heading"
            className="flex flex-col gap-md rounded-xl border border-grey-200 bg-background-pure p-md dark:border-grey-700"
          >
            <h2 id="voice-result-heading" className="m-0 text-lg text-foreground-heading">
              Fertig – {formatAudioDuration(result.durationSeconds)}
              {result.chunks > 1 ? ` · ${result.chunks} Abschnitte` : ''}
            </h2>
            <AudioPlayer
              src={`${baseURL}/share/${playable.shareToken}/stream`}
              title={`${def.title} – Vorschau`}
            />
            <div className="flex flex-wrap gap-sm">
              {result.files.map((file) => (
                <Button
                  key={file.shareToken}
                  type="button"
                  variant="outline"
                  onClick={() => void download(file)}
                >
                  <Download className="size-4" aria-hidden="true" />
                  {FORMAT_LABELS[file.format].label} herunterladen ({formatFileSize(file.fileSize)})
                </Button>
              ))}
            </div>
            <p className="m-0 text-sm text-muted-foreground">
              In der <Link to="/media-library">Mediathek</Link> gespeichert. Heute noch{' '}
              {Math.max(0, Math.floor((result.quota.limitSeconds - result.quota.usedSeconds) / 60))}{' '}
              Minuten Sprachausgabe übrig.
            </p>
            <CopyLinkRow
              value={`${getPublicAppOrigin()}${playable.shareUrl}`}
              copyLabel="Link kopieren"
              copiedLabel="Kopiert"
            />
          </section>
        ) : null}
      </div>
    </PageContainer>
  );
};

export default withAuthRequired(VoicePage, { title: 'Grünerator Voice' });
