import { type StudioAssetItem, type StudioAssetSource } from '@gruenerator/contracts';
import {
  STICKER_CREATOR_MODES,
  STICKER_CREATOR_STEPS,
  stickerCreatorModeTitle,
} from '@gruenerator/shared/stickers';
import {
  assetFormBody,
  emptyAssetForm,
  isAssetFormComplete,
  TITLE_MAX,
  useStudioAssetMutations,
  type StudioAssetFormValues,
} from '@gruenerator/shared/studio-assets';
import { slugifyName } from '@gruenerator/shared/utils';
import { Alert, AlertDescription, Button, toast } from '@gruenerator/ui';
import { useEffect, useRef, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { PiCheckCircle, PiImageSquare, PiScissors, PiTextAa } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { uploadBlobToMediaShare } from '../../image-studio/services/mediaUploadService';
import { TOOL_ACTIONS, TOOL_PANEL } from '../../studio-tools/components/ToolUi';
import { profilbildAssetHref } from '../../studio-tools/utils/galleryAsset';
import { StudioAssetFormFields } from '../StudioAssetFormFields';

import { BadgeDesigner } from './BadgeDesigner';
import { PreviewFrame, useObjectUrl, type StickerDraft } from './creatorParts';
import { ImageStickerDesigner } from './ImageStickerDesigner';

import { cn } from '@/utils/cn';

const GALLERY_PATH = '/studio/sticker';
const UPLOAD_ERROR = 'Das Hochladen hat nicht geklappt. Bitte versuche es erneut.';

type Step = 'mode' | 'design' | 'save' | 'done';
export type StickerCreatorReturn = 'profilbild' | 'canvas' | null;

const MODE_ICONS: Record<StudioAssetSource, ReactNode> = {
  upload: <PiImageSquare aria-hidden="true" className="size-7" />,
  cutout: <PiScissors aria-hidden="true" className="size-7" />,
  badge: <PiTextAa aria-hidden="true" className="size-7" />,
};

function Stepper({ step }: { step: Step }): JSX.Element {
  const active =
    step === 'done'
      ? STICKER_CREATOR_STEPS.length
      : STICKER_CREATOR_STEPS.findIndex((s) => s.key === step);
  return (
    <ol aria-label="Fortschritt" className="m-0 flex list-none flex-wrap gap-xs p-0 text-sm">
      {STICKER_CREATOR_STEPS.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === active ? 'step' : undefined}
          className={cn(
            'flex items-center gap-xs rounded-full border px-sm py-1',
            i === active
              ? 'border-transparent bg-secondary-600 font-semibold text-white'
              : i < active
                ? 'border-grey-200 text-foreground dark:border-grey-700'
                : 'border-grey-200 text-grey-600 dark:border-grey-700 dark:text-grey-400'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-5 items-center justify-center rounded-full text-xs tabular-nums',
              i === active ? 'bg-white/20' : 'bg-grey-100 dark:bg-grey-800'
            )}
          >
            {i < active ? '✓' : i + 1}
          </span>
          {s.label}
          {i < active && <span className="sr-only"> (erledigt)</span>}
        </li>
      ))}
    </ol>
  );
}

function ModeCards({ onPick }: { onPick: (mode: StudioAssetSource) => void }): JSX.Element {
  return (
    <ul className="m-0 grid list-none gap-md p-0 sm:grid-cols-3">
      {STICKER_CREATOR_MODES.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m.id)}
            className={cn(
              TOOL_PANEL,
              'group flex size-full cursor-pointer flex-col items-start gap-sm p-lg text-left transition-all',
              'hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-lg motion-reduce:hover:translate-y-0',
              'outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2'
            )}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary-600/10 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white dark:text-primary-400">
              {MODE_ICONS[m.id]}
            </span>
            <span className="text-base font-semibold text-foreground-heading">{m.title}</span>
            <span className="text-sm text-grey-600 dark:text-grey-400">{m.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface StickerCreatorProps {
  /** Where the person came from; shapes the closing step. */
  returnTo?: StickerCreatorReturn;
  /** Takes the new sticker instead of the closing step — e.g. straight onto a Profilbild. */
  onCreated?: (item: StudioAssetItem) => void;
}

/** Modus wählen, gestalten, speichern – ohne Seitenrahmen, für Seite und Dialog. */
export function StickerCreator({ returnTo = null, onCreated }: StickerCreatorProps): JSX.Element {
  const locale = useAuthStore((s) => s.locale);
  const { create } = useStudioAssetMutations();

  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<StudioAssetSource | null>(null);
  const [draft, setDraft] = useState<StickerDraft | null>(null);
  const [created, setCreated] = useState<StudioAssetItem | null>(null);
  const emptyForm = () => emptyAssetForm(locale);
  const [form, setForm] = useState<StudioAssetFormValues>(emptyForm);
  const uploaded = useRef<{ blob: Blob; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftUrl = useObjectUrl(draft?.blob ?? null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const pickMode = (next: StudioAssetSource) => {
    setMode(next);
    setDraft(null);
    setStep('design');
  };

  const toSave = () => {
    if (!draft) return;
    if (!form.title.trim())
      setForm((f) => ({ ...f, title: draft.suggestedTitle.slice(0, TITLE_MAX) }));
    setError(null);
    setStep('save');
  };

  const startOver = () => {
    setMode(null);
    setDraft(null);
    setCreated(null);
    setForm(emptyForm());
    setError(null);
    setStep('mode');
  };

  const canSave = !!draft && !!mode && isAssetFormComplete(form) && !busy;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !mode || !canSave) return;
    setBusy(true);
    setError(null);
    // A retry after a failed create reuses the upload instead of orphaning another file.
    const shareToken =
      uploaded.current?.blob === draft.blob
        ? uploaded.current.token
        : await uploadBlobToMediaShare(draft.blob, {
            filename: `${slugifyName(form.title, 'sticker')}.png`,
            uploadSource: 'studio-asset',
          }).catch(() => null);
    if (!shareToken) {
      setError(UPLOAD_ERROR);
      setBusy(false);
      return;
    }
    uploaded.current = { blob: draft.blob, token: shareToken };
    try {
      const item = await create.mutateAsync({
        shareToken,
        kind: 'sticker',
        source: mode,
        ...assetFormBody(form),
      });
      toast.success(`„${item.title}“ ist gespeichert.`);
      if (onCreated) {
        onCreated(item);
        return;
      }
      setCreated(item);
      setStep('done');
    } catch {
      // The create error is toasted by the global mutation handler.
    } finally {
      setBusy(false);
    }
  };

  const heading = {
    mode: 'Wie soll dein Sticker entstehen?',
    design: mode ? stickerCreatorModeTitle(mode) : 'Gestalten',
    save: 'Speichern',
    done: 'Fertig!',
  }[step];

  return (
    <div className="flex flex-col gap-md">
      <Stepper step={step} />

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="m-0 text-lg font-semibold text-foreground-heading outline-none"
      >
        {heading}
      </h2>

      {step === 'mode' && <ModeCards onPick={pickMode} />}

      {mode && (
        <div hidden={step !== 'design'} className="flex flex-col gap-md">
          {mode === 'badge' ? (
            <BadgeDesigner locale={locale} onDraft={setDraft} />
          ) : (
            <ImageStickerDesigner key={mode} mode={mode} locale={locale} onDraft={setDraft} />
          )}
          <div className={TOOL_ACTIONS}>
            <Button type="button" variant="ghost" onClick={startOver}>
              Zurück
            </Button>
            <Button
              type="button"
              variant="brand"
              className="ml-auto"
              disabled={!draft}
              onClick={toSave}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}

      {step === 'save' && draft && (
        <form
          onSubmit={(e) => void save(e)}
          className="grid gap-md md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] md:items-start"
        >
          <PreviewFrame>
            {draftUrl && (
              <img
                src={draftUrl}
                alt="Vorschau deines Stickers"
                className="max-h-full max-w-full object-contain"
              />
            )}
          </PreviewFrame>
          <div className={cn(TOOL_PANEL, 'flex min-w-0 flex-col gap-md')}>
            <StudioAssetFormFields
              values={form}
              onChange={setForm}
              locale={locale}
              disabled={busy}
            />
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className={TOOL_ACTIONS}>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setStep('design')}
              >
                Zurück
              </Button>
              <Button type="submit" variant="brand" className="ml-auto" disabled={!canSave}>
                {busy ? 'Wird gespeichert …' : 'Sticker speichern'}
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === 'done' && created && (
        <div className={cn(TOOL_PANEL, 'flex flex-col items-center gap-md p-lg text-center')}>
          <PiCheckCircle aria-hidden="true" className="size-12 text-primary-600" />
          {draftUrl && (
            <img src={draftUrl} alt="" className="max-h-[200px] max-w-full object-contain" />
          )}
          {returnTo === 'canvas' ? (
            <p className="m-0 max-w-[32rem] text-pretty text-foreground">
              „{created.title}“ ist gespeichert. Du findest ihn im Canvas in der Seitenleiste unter
              „Meine“ – du kannst diesen Tab jetzt schließen.
            </p>
          ) : (
            <p className="m-0 max-w-[32rem] text-pretty text-foreground">
              „{created.title}“ ist gespeichert und liegt in der Galerie unter „Meine“.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-sm">
            {returnTo !== 'canvas' && (
              <Button asChild variant="brand">
                <Link to={profilbildAssetHref(created)}>Im Profilbild verwenden</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to={GALLERY_PATH}>Zur Galerie</Link>
            </Button>
            <Button type="button" variant="ghost" onClick={startOver}>
              Noch einen Sticker
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
