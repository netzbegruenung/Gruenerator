import {
  Button,
  canRequestFeedback,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  requestFeedback,
} from '@gruenerator/ui';
import { motion, MotionConfig } from 'motion/react';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import { PiFilmSlate, PiMusicNotes, PiTextT } from 'react-icons/pi';

const EASE = [0.22, 1, 0.36, 1] as const;

// Clips je Spur als [Start, Breite] in Prozent der Zeitleiste.
const TRACKS = [
  {
    kind: 'video',
    icon: PiFilmSlate,
    clips: [
      [0, 34],
      [36, 26],
      [64, 36],
    ],
    tone: 'bg-primary-500',
  },
  {
    kind: 'text',
    icon: PiTextT,
    clips: [
      [8, 22],
      [44, 30],
    ],
    tone: 'bg-secondary-400',
  },
  {
    kind: 'audio',
    icon: PiMusicNotes,
    clips: [[0, 100]],
    tone: 'bg-primary-300 dark:bg-primary-700',
  },
] as const;

/** Nachbildung einer Schnitt-Zeitleiste: drei Spuren, die Clips gleiten nacheinander ein, der Abspielkopf läuft. */
function TimelineMock() {
  return (
    <div className="relative flex w-full max-w-[420px] flex-col gap-2 rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/10 dark:bg-grey-900 dark:ring-white/10">
      {TRACKS.map((track, row) => (
        <div key={track.kind} className="flex items-center gap-2">
          <track.icon className="size-4 shrink-0 text-grey-500" />
          <div className="relative h-6 flex-1 rounded-md bg-grey-100 dark:bg-grey-800">
            {track.clips.map(([left, width], i) => (
              <motion.span
                key={left}
                className={`absolute inset-y-0.5 rounded ${track.tone}`}
                style={{ left: `${left}%`, width: `${width}%`, originX: 0 }}
                initial={{ opacity: 0, scaleX: 0.6 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.45, ease: EASE, delay: 0.1 + row * 0.12 + i * 0.08 }}
              />
            ))}
          </div>
        </div>
      ))}
      {/* Abspielkopf über allen Spuren; die Spur-Icons belegen links 1,5rem. */}
      <div className="pointer-events-none absolute inset-y-1.5 right-3 left-[calc(0.75rem+1.5rem)]">
        <motion.span
          className="absolute inset-y-0 w-0.5 rounded-full bg-grey-900 dark:bg-white"
          initial={{ left: '0%' }}
          animate={{ left: '100%' }}
          transition={{ duration: 6, ease: 'linear', repeat: Infinity, delay: 0.8 }}
        />
      </div>
    </div>
  );
}

interface VideoEditorBetaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Hinweis beim ersten Öffnen: der Video-Editor ist in der Beta, Feedback bitte über den Feedback-Button. */
export default function VideoEditorBetaDialog({ open, onOpenChange }: VideoEditorBetaDialogProps) {
  // Erst schließen, dann das Feedback-Formular öffnen: es fotografiert offene Dialoge mit.
  const giveFeedback = canRequestFeedback()
    ? () => {
        onOpenChange(false);
        setTimeout(requestFeedback, 250);
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <MotionConfig reducedMotion="user">
          <div
            aria-hidden
            className="relative flex items-center justify-center bg-primary-100 px-8 pt-10 pb-8 dark:bg-primary-900/40"
          >
            <TimelineMock />
          </div>
        </MotionConfig>

        <div className="flex flex-col gap-4 p-6 sm:p-7">
          <div className="flex flex-col gap-2 pr-6">
            <span className="self-start rounded-full bg-secondary-100 px-2.5 py-0.5 text-xs font-bold tracking-wider text-secondary-800 uppercase dark:bg-secondary-900/50 dark:text-secondary-200">
              Beta
            </span>
            <DialogTitle className="m-0 text-xl leading-tight font-bold sm:text-2xl">
              Der neue Video-Editor
            </DialogTitle>
          </div>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
            Schneide Clips, setz Texte ins Bild und leg Musik darunter, alles im Browser. Der Editor
            ist ganz neu und noch in der Testphase: Manches hakt vielleicht noch oder ändert sich.
          </DialogDescription>
          <p className="flex gap-3 rounded-lg bg-grey-50 p-3 text-sm leading-relaxed text-foreground dark:bg-grey-800/60">
            <HiOutlineChatBubbleLeftRight
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-primary-600 dark:text-primary-300"
            />
            <span>
              Wenn etwas nicht klappt oder dir etwas fehlt, sag es uns über den Feedback-Button.
              Jede Meldung hilft, den Editor besser zu machen.
            </span>
          </p>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {giveFeedback ? (
              <Button variant="ghost" size="lg" className="rounded-full" onClick={giveFeedback}>
                Feedback geben
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground sm:mr-auto">
                Den Feedback-Button schaltest du unter Einstellungen → Allgemein ein.
              </span>
            )}
            <Button size="lg" className="rounded-full" onClick={() => onOpenChange(false)}>
              Los geht&apos;s
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
