import {
  DEFAULT_TTS_VOICE_ID,
  type GenerateSpeechBody,
  type SpeechFile,
  type SpeechPreset,
  type TtsVoiceId,
} from '@gruenerator/contracts';
import { useMediaQuery } from '@gruenerator/shared/hooks';
import { ttsVoiceLabel } from '@gruenerator/shared/settings';
import { slugifyName } from '@gruenerator/shared/utils';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@gruenerator/ui';
import { AudioLines, ChevronDown, ChevronRight, History, SlidersHorizontal } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import Spinner from '../../components/common/Spinner';
import SubmitButton from '../../components/common/SubmitButton';
import apiClient from '../../components/utils/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { cn } from '../../utils/cn';
import { downloadBlob } from '../../utils/downloadFile';
import { formatAudioDuration } from '../../utils/formatAudioDuration';

import ScriptAssistant from './components/ScriptAssistant';
import VoiceEditor from './components/VoiceEditor';
import VoiceResult from './components/VoiceResult';
import VoiceSettings from './components/VoiceSettings';
import { useGenerateSpeech } from './hooks/useGenerateSpeech';
import {
  ALL_FORMATS,
  PAUSE_TAG,
  PAUSE_TOKEN,
  SPEED_OPTIONS,
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

/** Below Tailwind's `sm`: settings move from the card into a bottom sheet. */
const PHONE_QUERY = '(max-width: 639px)';

/**
 * Grünerator Voice: one column, the text first.
 *
 * Writing the words is the long part of the job, so the editor gets the page.
 * The recording settings are three decisions with sensible defaults — they sit
 * folded behind a one-line summary (in the card's toolbar, or a bottom sheet on
 * a phone) and only open when someone wants to change them.
 */
const VoicePage = () => {
  const profileVoice = useAuthStore((s) => s.user?.tts_voice_id ?? null);
  const [preset, setPreset] = useState<SpeechPreset>('vorlesefassung');
  const [text, setText] = useState('');
  const [speed, setSpeed] = useState<number>(1);
  const [voiceId, setVoiceId] = useState<TtsVoiceId>(profileVoice ?? DEFAULT_TTS_VOICE_ID);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generate = useGenerateSpeech();

  const def = VOICE_PRESETS[preset];
  const canSubmit = text.trim().length > 0 && !generate.isPending;
  const result = generate.data ?? null;
  const playable = result?.files.find((f) => f.format === 'mp3') ?? result?.files[0] ?? null;
  const estimatedSeconds = estimateSpeechSeconds(text, speed);

  const request: GenerateSpeechBody = {
    preset,
    text: toWire(text.trim()),
    voiceId,
    formats: [...ALL_FORMATS],
    speed: speed === 1 ? null : speed,
  };
  const sent = generate.variables;
  const stale =
    !!sent &&
    (sent.preset !== request.preset ||
      sent.text !== request.text ||
      sent.voiceId !== request.voiceId ||
      sent.speed !== request.speed);

  const speedLabel = SPEED_OPTIONS.find((o) => o.value === speed)?.label ?? 'Normal';
  const summary = [def.title, ttsVoiceLabel(voiceId).replace(' gelesen', ''), speedLabel].join(
    ' · '
  );

  const choosePreset = (next: SpeechPreset) => {
    setPreset(next);
    setText((current) => clampToWire(current, VOICE_PRESETS[next].maxChars));
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
    generate.mutate(request);
  };

  const download = async (file: SpeechFile) => {
    try {
      const response = await apiClient.get<Blob>(`/share/${file.shareToken}/download`, {
        responseType: 'blob',
      });
      await downloadBlob(
        response.data,
        fileNameFor(VOICE_PRESETS[sent?.preset ?? preset].title, file)
      );
    } catch {
      toast.error('Der Download ist fehlgeschlagen. Die Datei liegt weiterhin in der Mediathek.');
    }
  };

  const settings = (variant: 'inline' | 'sheet') => (
    <VoiceSettings
      variant={variant}
      preset={preset}
      onPresetChange={choosePreset}
      voiceId={voiceId}
      onVoiceChange={setVoiceId}
      speed={speed}
      onSpeedChange={setSpeed}
    />
  );

  return (
    <PageContainer maxWidth="sm" noPadTop className="max-sm:pb-28">
      <header className="mb-lg flex items-start justify-between gap-md">
        <div className="min-w-0">
          <h1 className="m-0 text-3xl font-semibold text-foreground-heading max-md:text-2xl">
            Grünerator Voice
          </h1>
          <p className="m-0 mt-xxs text-base text-muted-foreground">
            Text in gesprochene Sprache verwandeln – als Datei zum Herunterladen.
          </p>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="shrink-0 text-primary-600 dark:text-primary-400 max-sm:size-11 max-sm:rounded-full max-sm:border max-sm:border-grey-200 dark:max-sm:border-grey-700"
        >
          <Link to="/media-library">
            <History aria-hidden="true" />
            <span className="max-sm:sr-only">Zuletzt vertont</span>
          </Link>
        </Button>
      </header>

      <div className="flex flex-col gap-md">
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
                textareaRef.current?.focus();
              }}
            />
          }
          settingsToggle={
            isPhone ? undefined : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen((open) => !open)}
                aria-expanded={settingsOpen}
                aria-controls="voice-settings"
                aria-label={`Einstellungen: ${summary}`}
                className={cn(
                  'min-w-0 max-w-sm shrink',
                  settingsOpen && 'bg-primary-500/10 text-primary-700 dark:text-primary-300'
                )}
              >
                <SlidersHorizontal aria-hidden="true" />
                <span className="truncate">{summary}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('transition-transform', settingsOpen && 'rotate-180')}
                />
              </Button>
            )
          }
          settingsPanel={
            !isPhone && settingsOpen ? (
              <div id="voice-settings">{settings('inline')}</div>
            ) : undefined
          }
        />

        {isPhone ? (
          <>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-haspopup="dialog"
              className="flex min-h-15 w-full items-center gap-sm rounded-xl border border-grey-200 bg-background-pure px-md py-sm text-left dark:border-grey-700"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-primary-700 dark:text-primary-300">
                <SlidersHorizontal aria-hidden="true" className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">Einstellungen</span>
                <span className="truncate text-xs text-muted-foreground">{summary}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </button>
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetContent
                side="bottom"
                className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-2xl"
              >
                <SheetHeader>
                  <SheetTitle className="text-lg">Einstellungen</SheetTitle>
                  <SheetDescription className="sr-only">
                    Art der Aufnahme, Stimme und Tempo
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-lg px-md pb-md">
                  {settings('sheet')}
                  <Button
                    type="button"
                    variant="brand"
                    className="h-12 w-full text-base"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Fertig
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : null}

        {/* On a phone the button is pinned to the bottom edge, so it stays in
            reach while the text scrolls; the page pads for it. */}
        <div className="flex items-center justify-end gap-md max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-20 max-sm:flex-col-reverse max-sm:gap-xxs max-sm:border-t max-sm:border-grey-200 max-sm:bg-background-pure max-sm:px-md max-sm:pt-sm max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:max-sm:border-grey-700">
          <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
            {estimatedSeconds > 0
              ? `≈ ${formatAudioDuration(estimatedSeconds)} Min. Audio`
              : 'Dauer wird beim Eintippen geschätzt'}
          </p>
          <SubmitButton
            type="button"
            text={result ? 'Neu vertonen' : 'Vertonen'}
            icon={<AudioLines aria-hidden="true" />}
            onClick={submit}
            loading={generate.isPending}
            disabled={!canSubmit}
            className="h-12 px-lg text-base max-sm:w-full"
          />
        </div>

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
        {result && playable && !generate.isPending ? (
          <VoiceResult
            result={result}
            playable={playable}
            title={VOICE_PRESETS[sent?.preset ?? preset].title}
            stale={stale}
            onDownload={(file) => void download(file)}
          />
        ) : null}
      </div>
    </PageContainer>
  );
};

export default withAuthRequired(VoicePage, { title: 'Grünerator Voice' });
