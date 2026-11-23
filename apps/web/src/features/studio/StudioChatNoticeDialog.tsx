import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@gruenerator/ui';
import { motion, MotionConfig } from 'motion/react';
import { HiArrowRight, HiOutlinePhoto } from 'react-icons/hi2';

const EASE = [0.22, 1, 0.36, 1] as const;

// Three drafts in the answer: the Studio's palette, each with its own headline length.
const DRAFTS = [
  { tone: 'bg-primary-600', lines: ['w-4/5', 'w-3/5'] },
  { tone: 'bg-secondary-400', lines: ['w-3/5', 'w-4/5'] },
  { tone: 'bg-[#F5DEE6] dark:bg-[#2B1620]', lines: ['w-2/3', 'w-1/2'], dark: true },
] as const;

/** A drawn chat: the request, then three Sharepic drafts sliding in one after another. */
function ChatMock() {
  return (
    <div className="flex w-full max-w-[380px] flex-col gap-3">
      <motion.p
        className="m-0 self-end rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-[13px] text-grey-900 shadow-md ring-1 ring-black/5 dark:bg-grey-900 dark:text-grey-100 dark:ring-white/10"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
      >
        Erstelle ein Sharepic zum Thema Radverkehr
      </motion.p>
      <div className="flex gap-2.5">
        {DRAFTS.map((draft, i) => (
          <motion.div
            key={draft.tone}
            className={`flex aspect-[4/5] flex-1 flex-col justify-end gap-1.5 rounded-lg p-2.5 shadow-lg ${draft.tone}`}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.55 + i * 0.14 }}
          >
            {draft.lines.map((width) => (
              <span
                key={width}
                className={`block h-1.5 rounded-full ${width} ${'dark' in draft ? 'bg-[#8A3E5C]/70' : 'bg-white/85'}`}
              />
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

interface StudioChatNoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the chat with a Sharepic request already typed. */
  onCreateInChat: () => void;
}

/**
 * Shown on the first visit to the Studio: Sharepics and KI-Bilder are now made in the
 * chat; the Studio keeps what was made, plus the video tools. Modelled on
 * VideoEditorBetaDialog.
 */
export default function StudioChatNoticeDialog({
  open,
  onOpenChange,
  onCreateInChat,
}: StudioChatNoticeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <MotionConfig reducedMotion="user">
          <div
            aria-hidden
            className="relative flex items-center justify-center bg-primary-100 px-8 pt-10 pb-8 dark:bg-primary-900/40"
          >
            <ChatMock />
          </div>
        </MotionConfig>

        <div className="flex flex-col gap-4 p-6 sm:p-7">
          <div className="flex flex-col gap-2 pr-6">
            <span className="self-start rounded-full bg-secondary-100 px-2.5 py-0.5 text-xs font-bold tracking-wider text-secondary-800 uppercase dark:bg-secondary-900/50 dark:text-secondary-200">
              Neu
            </span>
            <DialogTitle className="m-0 text-xl leading-tight font-bold sm:text-2xl">
              Sharepics entstehen jetzt im Chat
            </DialogTitle>
          </div>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
            Sharepics und KI-Bilder erstellst du ab sofort im Chat: Thema nennen, Entwürfe bekommen,
            im Editor weiter anpassen. Das Studio ist dein Ort für alles, was du schon erstellt
            hast, und für Videos mit dem Video-Editor und Auto-Untertiteln.
          </DialogDescription>
          <p className="flex gap-3 rounded-lg bg-grey-50 p-3 text-sm leading-relaxed text-foreground dark:bg-grey-800/60">
            <HiOutlinePhoto
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-primary-600 dark:text-primary-300"
            />
            <span>Was du im Chat erstellst, landet automatisch hier unter „Deine Inhalte“.</span>
          </p>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              variant="ghost"
              size="lg"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Verstanden
            </Button>
            <Button size="lg" className="rounded-full" onClick={onCreateInChat}>
              Sharepic im Chat erstellen
              <HiArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
