import {
  sharepicFormLabel,
  sharepicFormStichworte,
  sharepicVorlageThumbPath,
  type SharepicVorlage,
} from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { Pencil } from 'lucide-react';
import { Fragment, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { openSharepicCreator } from '../../image-studio/freitext/openSharepicCreator';

import { VorlageDetailDialog, type VorlageInteractionProps } from './VorlageDetailDialog';

import { resolveApiAssetUrl } from '@/utils/platform';
import { copyToClipboard } from '@/utils/shareUtils';

const COUNTRY: Record<SharepicVorlage['locale'], string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

type SharepicVorlageDialogProps = VorlageInteractionProps & {
  vorlage: SharepicVorlage;
  onClose: () => void;
};

/**
 * A Grünerator-Vorlage up close: copy it into an editable canvas, or have the
 * chat build one like it — with the requests and words that get there.
 */
export function SharepicVorlageDialog({
  vorlage,
  onClose,
  ...interactions
}: SharepicVorlageDialogProps): JSX.Element {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const stichworte = sharepicFormStichworte(vorlage.form);
  const credits = vorlage.attributions.filter((a) => a !== null);
  const slides = vorlage.spec.slides.length;

  const copyPrompt = (prompt: string) => {
    void copyToClipboard(prompt).then(() => {
      setCopied(prompt);
      setTimeout(() => setCopied((c) => (c === prompt ? null : c)), 1600);
    });
  };

  return (
    <VorlageDetailDialog
      {...interactions}
      onClose={onClose}
      title={vorlage.titel}
      description={vorlage.beschreibung}
      meta={[
        sharepicFormLabel(vorlage.form),
        COUNTRY[vorlage.locale],
        slides > 1 && `${slides} Seiten`,
      ]
        .filter(Boolean)
        .join(' · ')}
      pages={Array.from({ length: slides }, (_, i) => ({
        src: resolveApiAssetUrl(sharepicVorlageThumbPath(vorlage.id, i + 1, vorlage.thumbVersion)),
        alt:
          slides > 1
            ? `Seite ${i + 1} von ${slides}: ${vorlage.titel}`
            : `Vorschau: ${vorlage.titel}`,
      }))}
      credits={
        credits.length > 0 && (
          <p className="text-xs text-grey-600 dark:text-grey-400">
            Foto:{' '}
            {credits.map((c, i) => (
              <span key={c.photoUrl}>
                {i > 0 && ', '}
                <a href={c.photoUrl} target="_blank" rel="noreferrer" className="underline">
                  {c.photographer}
                </a>
              </span>
            ))}{' '}
            auf Unsplash
          </p>
        )
      }
      primaryAction={
        <Button
          variant="brand"
          size="brand-md"
          className="w-full"
          onClick={() => void navigate(`/studio/vorlage/${vorlage.id}`)}
        >
          <Pencil className="size-4" aria-hidden="true" />
          Kopie bearbeiten
        </Button>
      }
      share={{
        title: vorlage.titel,
        url: `${window.location.origin}/vorlagen?vorlage=${encodeURIComponent(vorlage.id)}`,
      }}
    >
      <section aria-labelledby="vorlage-chat-heading" className="flex flex-col gap-4">
        <h3 id="vorlage-chat-heading" className="m-0 text-[17px] font-bold text-foreground-heading">
          Im Chat erstellen
        </h3>
        <p className="m-0 text-[15px] text-grey-600 dark:text-grey-400">
          Schreib dem Sharepic-Creator zum Beispiel –{' '}
          {stichworte.length === 1 ? 'das Wort' : 'die Wörter'}{' '}
          {stichworte.map((wort, i) => (
            <Fragment key={wort}>
              {i > 0 && ', '}
              <strong className="text-foreground">{wort}</strong>
            </Fragment>
          ))}{' '}
          {stichworte.length === 1 ? 'wählt' : 'wählen'} diese Form:
        </p>
        <ul className="flex flex-col gap-2">
          {vorlage.chat.prompts.map((prompt) => (
            <li
              key={prompt}
              className="flex items-center gap-2 rounded-xl border border-grey-200 py-2.5 pr-2 pl-3.5 dark:border-grey-700"
            >
              <button
                type="button"
                onClick={() => openSharepicCreator(navigate, prompt)}
                title="Im Sharepic-Creator öffnen"
                className="min-w-0 flex-1 text-left text-[15px] text-foreground underline-offset-2 hover:underline"
              >
                {prompt}
              </button>
              <Button variant="ghost" size="sm" onClick={() => copyPrompt(prompt)}>
                {copied === prompt ? 'Kopiert' : 'Kopieren'}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </VorlageDetailDialog>
  );
}
