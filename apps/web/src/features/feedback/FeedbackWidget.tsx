import { type FeedbackPageContext } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMediaQuery } from '@gruenerator/shared/hooks';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from '@gruenerator/ui';
import { useMutation } from '@tanstack/react-query';
import { Info, Loader2, Maximize2 } from 'lucide-react';
import { domToJpeg } from 'modern-screenshot';
import { useCallback, useState, type JSX } from 'react';

import DraggableFeedbackLauncher, { type LauncherCorner } from './DraggableFeedbackLauncher';

// Unterhalb von Tailwinds `lg:` — Handys und Tablets. Dort ist die Textpille
// (~110px) breit genug, um Bedienelemente am Rand zu überdecken, und der Platz
// zum Ausweichen fehlt; das Icon (48px) tut dasselbe auf einem Sechstel der
// Fläche. Die Einstellung bleibt unangetastet, nur ihre Darstellung schrumpft.
const COMPACT_LAUNCHER_QUERY = '(width < 64rem)';

interface FeedbackWidgetProps {
  /** Optional scope label sent with the feedback (e.g. a phase or feature name). */
  feature?: string;
  position?: LauncherCorner;
  visible?: boolean;
  /** Launcher appearance — text pill (default) or compact icon button. */
  variant?: 'text' | 'icon';
}

function collectPageContext(): FeedbackPageContext {
  return {
    url: window.location.href,
    pathname: window.location.pathname,
    routeName: document.title || null,
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    locale: navigator.language || null,
    appVersion: null,
  };
}

async function capturePageScreenshot(): Promise<string | null> {
  try {
    const w = document.documentElement.scrollWidth;
    const h = document.documentElement.scrollHeight;
    const scale = Math.min(1, 2000 / Math.max(w, h));
    return await domToJpeg(document.body, {
      quality: 0.8,
      scale,
      backgroundColor: '#ffffff',
      // Exclude the (already open) feedback dialog and its own launcher so the
      // screenshot shows the page the user is giving feedback on, not the modal
      // overlaying it. Radix portals overlay + content as direct <body>
      // children without a wrapper element, so both carry data-feedback-dialog
      // themselves (content via DialogContent props, overlay via overlayProps).
      // Other open dialogs the user may be reporting on stay in the shot.
      filter: (node) => {
        if (node instanceof Element) {
          if (node.hasAttribute('data-feedback-dialog')) return false;
          if (node.classList.contains('feedback-widget-fab')) return false;
        }
        return true;
      },
    });
  } catch (err) {
    console.warn('[FeedbackWidget] Screenshot capture failed', err);
    return null;
  }
}

export default function FeedbackWidget({
  feature,
  position = 'bottom-right',
  visible = true,
  variant = 'text',
}: FeedbackWidgetProps): JSX.Element | null {
  const compactLauncher = useMediaQuery(COMPACT_LAUNCHER_QUERY);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().feedback.submit({
        body: {
          message: message.trim(),
          feature: feature ?? null,
          pageContext: collectPageContext(),
          screenshot: includeScreenshot ? screenshot : null,
        },
      });
      if (res.status !== 200) {
        throw new Error(`Feedback konnte nicht gesendet werden (HTTP ${res.status})`);
      }
      return res.body;
    },
    onSuccess: () => {
      toast.success('Danke! Dein Feedback ist bei der Entwicklung gelandet.');
      setOpen(false);
      setMessage('');
      setScreenshot(null);
    },
  });

  // Open the dialog immediately and capture the screenshot in the background —
  // the open dialog is filtered out of the capture, so the interface feels
  // instant and the preview fills in when ready.
  const handleLauncherClick = useCallback(() => {
    setScreenshot(null);
    setIncludeScreenshot(true);
    setCapturing(true);
    setOpen(true);
    void capturePageScreenshot().then((shot) => {
      setScreenshot(shot);
      // Only force-off when capture failed; otherwise keep the user's choice
      // (they may have already unchecked "attach" while it was still capturing).
      if (shot == null) setIncludeScreenshot(false);
      setCapturing(false);
    });
  }, []);

  if (!visible) return null;

  return (
    <>
      <DraggableFeedbackLauncher
        onOpen={handleLauncherClick}
        defaultCorner={position}
        variant={compactLauncher ? 'icon' : variant}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-feedback-dialog=""
          overlayProps={{ 'data-feedback-dialog': '' }}
          className="sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Feedback an die Entwicklung</DialogTitle>
            <DialogDescription>
              Was ist dir aufgefallen? Automatisch mitgesendet werden die aktuelle Seite (URL),
              Browser-Informationen und – falls verfügbar – ein Screenshot.
            </DialogDescription>
          </DialogHeader>

          {/* Der Knopf schwebt auf jeder Seite, auch über dem Chat — viele
              tippen hier hinein, als wäre es ein weiteres Chatfenster. Der
              Hinweis sagt vor dem Schreiben, wo der Text landet und dass hier
              keine Antwort kommt. */}
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-medium text-foreground">Das hier ist kein Chat:</span> Deine
              Nachricht geht per E-Mail an die Entwicklung des Grünerators und wird dort von einem
              Menschen gelesen. In diesem Fenster kommt keine Antwort — bei Rückfragen melden wir
              uns per E-Mail. Fragen an die KI stellst du im Chat.
            </p>
          </div>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Dein Feedback an die Entwicklung…"
            rows={5}
            autoFocus
          />

          {(capturing || screenshot) && (
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
                <Checkbox
                  checked={includeScreenshot}
                  onCheckedChange={(v) => setIncludeScreenshot(v === true)}
                />
                Screenshot anhängen
              </label>

              {capturing && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  wird erstellt…
                </span>
              )}

              {!capturing && screenshot && (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className={`group relative shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted transition ${
                    includeScreenshot ? '' : 'opacity-40'
                  }`}
                  title="Zum Vergrößern klicken"
                >
                  <img
                    src={screenshot}
                    alt="Vorschau des mitgesendeten Screenshots"
                    className="h-16 w-auto max-w-[7rem] object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                    <Maximize2 className="size-4" />
                  </span>
                </button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submit.isPending}>
              Abbrechen
            </Button>
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || message.trim().length === 0}
            >
              {submit.isPending ? 'Wird gesendet…' : 'Feedback senden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {screenshot && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-w-[95vw] border-0 bg-transparent p-2 shadow-none sm:max-w-[95vw]">
            <DialogTitle className="sr-only">Screenshot-Vorschau</DialogTitle>
            <img
              src={screenshot}
              alt="Screenshot der Seite in voller Größe"
              className="mx-auto max-h-[88vh] w-auto max-w-full rounded-md object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
