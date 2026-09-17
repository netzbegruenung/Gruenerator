import {
  DEFAULT_TTS_VOICE_ID,
  type SpeechFile,
  type SpeechOutputFormat,
  type SpeechPreset,
  type TtsVoiceId,
} from '@gruenerator/contracts';
import { slugifyName } from '@gruenerator/shared/utils';
import { Button, toast } from '@gruenerator/ui';
import { AudioLines, History } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import Spinner from '../../components/common/Spinner';
import SubmitButton from '../../components/common/SubmitButton';
import apiClient from '../../components/utils/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { downloadBlob } from '../../utils/downloadFile';
import { formatAudioDuration } from '../../utils/formatAudioDuration';

import ScriptAssistant from './components/ScriptAssistant';
import VoiceEditor from './components/VoiceEditor';
import VoiceResult from './components/VoiceResult';
import VoiceSettings from './components/VoiceSettings';
import { useGenerateSpeech } from './hooks/useGenerateSpeech';
import {
  PAUSE_TAG,
  PAUSE_TOKEN,
  VOICE_PRESETS,
  clampToWire,
  estimateSpeechSeconds,
  fromWire,
  toWire,
  wireLength,
} from './presets';

function fileNameFor(title: string, file: SpeechFile): string {
  return `${slugifyName(title, 'voice')}.${file.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`;
}

/**
 * Grünerator Voice: the text on the left, what to do with it on the right.
 *
 * The split is the point. Writing and reviewing the words is the long part of
 * the job and gets the room; the recording settings are a handful of decisions
 * that stay visible without competing for attention. Below `lg` the rail
 * becomes the second half of one column, which puts the button last.
 */
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
  const canSubmit = text.trim().length > 0 && formats.length > 0 && !generate.isPending;
  const result = generate.data ?? null;
  const playable = result?.files.find((f) => f.format === 'mp3') ?? result?.files[0] ?? null;
  const estimatedSeconds = estimateSpeechSeconds(text, speed);

  const choosePreset = (next: SpeechPreset) => {
    setPreset(next);
    setFormats(VOICE_PRESETS[next].defaultFormats);
    setText((current) => clampToWire(current, VOICE_PRESETS[next].maxChars));
    generate.reset();
  };

  // The budget is spent in the wire form, where a pause costs the full tag.
  const pauseFits = wireLength(text) + PAUSE_TAG.length <= def.maxChars;

  const insertPause = useCallback(() => {
    if (!pauseFits) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    setText(`${text.slice(0, start)}${PAUSE_TOKEN}${text.slice(end)}`);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + PAUSE_TOKEN.length;
      el.setSelectionRange(caret, caret);
    });
  }, [pauseFits, text]);

  const submit = () => {
    if (!canSubmit) return;
    generate.mutate({
      preset,
      text: toWire(text.trim()),
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
    <PageContainer maxWidth="lg" noPadTop>
      <header className="mb-lg flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="m-0 text-3xl font-semibold text-foreground-heading max-md:text-2xl">
            Grünerator Voice
          </h1>
          <p className="m-0 mt-xxs text-base text-muted-foreground">
            Text in gesprochene Sprache verwandeln – als Datei zum Herunterladen.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary-600">
          <Link to="/media-library">
            <History aria-hidden="true" />
            Zuletzt vertont
          </Link>
        </Button>
      </header>

      <div className="grid items-start gap-lg lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <VoiceEditor
          text={text}
          onChange={setText}
          def={def}
          onInsertPause={insertPause}
          pauseFits={pauseFits}
          textareaRef={textareaRef}
          assistant={
            <ScriptAssistant
              preset={preset}
              onDraft={(script) => {
                setText(clampToWire(fromWire(script), def.maxChars));
                generate.reset();
                textareaRef.current?.focus();
              }}
            />
          }
        />

        <VoiceSettings
          preset={preset}
          onPresetChange={choosePreset}
          voiceId={voiceId}
          onVoiceChange={setVoiceId}
          speed={speed}
          onSpeedChange={setSpeed}
          formats={formats}
          onFormatsChange={setFormats}
          footer={
            <>
              <SubmitButton
                type="button"
                text="Vertonen"
                icon={<AudioLines aria-hidden="true" />}
                onClick={submit}
                loading={generate.isPending}
                disabled={!canSubmit}
                className="h-12 w-full text-base"
              />
              <p className="m-0 text-center text-xs text-muted-foreground" aria-live="polite">
                {estimatedSeconds > 0
                  ? `≈ ${formatAudioDuration(estimatedSeconds)} Min. Audio`
                  : 'Dauer wird beim Eintippen geschätzt'}
              </p>
            </>
          }
        />

        {generate.isPending || generate.error || (result && playable) ? (
          <div className="flex flex-col gap-md lg:col-span-2">
            {generate.isPending ? (
              <div role="status" aria-live="polite" className="flex items-center gap-sm text-sm">
                <Spinner />
                <span>Sprache wird erzeugt … das dauert einen Moment.</span>
              </div>
            ) : null}
            {generate.error ? (
              <p role="alert" className="m-0 text-sm text-destructive">
                {generate.error.message}
              </p>
            ) : null}
            {result && playable ? (
              <VoiceResult
                result={result}
                playable={playable}
                title={def.title}
                onDownload={(file) => void download(file)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
};

export default withAuthRequired(VoicePage, { title: 'Grünerator Voice' });
