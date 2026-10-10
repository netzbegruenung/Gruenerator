import {
  sharepicFormLabel,
  sharepicFormStichworte,
  sharepicVorlageThumbPath,
  type SharepicVorlage,
} from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { MessageSquareText, Pencil } from 'lucide-react';
import { type JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { openSharepicCreator } from '../../image-studio/freitext/openSharepicCreator';

import { cn } from '@/utils/cn';
import { resolveApiAssetUrl } from '@/utils/platform';

const COUNTRY: Record<SharepicVorlage['locale'], string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

interface SharepicVorlageDialogProps {
  vorlage: SharepicVorlage;
  onClose: () => void;
}

/**
 * A Grünerator-Vorlage up close: copy it into an editable canvas, or have the
 * chat build one like it — with the requests and words that get there.
 */
export function SharepicVorlageDialog({
  vorlage,
  onClose,
}: SharepicVorlageDialogProps): JSX.Element {
  const navigate = useNavigate();
  const stichworte = sharepicFormStichworte(vorlage.form);
  const credits = vorlage.attributions.filter((a) => a !== null);
  const slides = vorlage.spec.slides.length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[52rem]">
        <DialogHeader>
          <DialogTitle>{vorlage.titel}</DialogTitle>
          <DialogDescription>{vorlage.beschreibung}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-2">
            {/* Every slide, in swipe order — a carousel is judged as a whole. */}
            <ol
              aria-label={slides > 1 ? `${slides} Seiten` : undefined}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto"
            >
              {Array.from({ length: slides }, (_, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex aspect-[4/5] shrink-0 snap-start items-center justify-center overflow-hidden rounded-md bg-background-alt',
                    slides > 1 ? 'w-[85%]' : 'w-full'
                  )}
                >
                  <img
                    src={resolveApiAssetUrl(
                      sharepicVorlageThumbPath(vorlage.id, i + 1, vorlage.thumbVersion)
                    )}
                    alt={
                      slides > 1
                        ? `Seite ${i + 1} von ${slides}: ${vorlage.titel}`
                        : `Vorschau: ${vorlage.titel}`
                    }
                    loading={i === 0 ? 'eager' : 'lazy'}
                    className="max-h-full max-w-full object-contain"
                  />
                </li>
              ))}
            </ol>
            <p className="text-xs text-grey-600 dark:text-grey-400">
              {sharepicFormLabel(vorlage.form)} · {COUNTRY[vorlage.locale]}
              {slides > 1 && ` · ${slides} Seiten`}
            </p>
            {credits.length > 0 && (
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
            )}
          </div>

          <div className="flex flex-col gap-5">
            <Button
              variant="brand"
              size="brand"
              onClick={() => void navigate(`/studio/vorlage/${vorlage.id}`)}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Kopie bearbeiten
            </Button>

            <section aria-labelledby="vorlage-chat-heading" className="flex flex-col gap-3">
              <h3
                id="vorlage-chat-heading"
                className="flex items-center gap-2 text-base font-semibold text-foreground-heading"
              >
                <MessageSquareText className="size-4" aria-hidden="true" />
                So erstellst du das im Chat
              </h3>
              <p className="text-sm text-foreground">
                Schreib dem Sharepic-Creator, was drauf soll. Zum Beispiel:
              </p>
              <ul className="flex flex-col gap-2">
                {vorlage.chat.prompts.map((prompt) => (
                  <li key={prompt}>
                    <button
                      type="button"
                      onClick={() => openSharepicCreator(navigate, prompt)}
                      className="w-full rounded-md border border-grey-300 px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary-500 hover:bg-primary-500/5 dark:border-grey-600"
                    >
                      „{prompt}“
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-foreground">
                  Mit diesen Wörtern bekommst du die Form „{sharepicFormLabel(vorlage.form)}“:
                </p>
                <ul className="flex flex-wrap gap-1.5" aria-label="Stichworte">
                  {stichworte.map((wort) => (
                    <li
                      key={wort}
                      className="rounded-full bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300"
                    >
                      {wort}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
