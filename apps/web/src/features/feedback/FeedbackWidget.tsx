import { getContractsClient } from '@gruenerator/shared/api';
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
import { Loader2, MessageSquare } from 'lucide-react';
import { domToJpeg } from 'modern-screenshot';
import { useCallback, useState, type JSX } from 'react';

import type { FeedbackPageContext } from '@gruenerator/contracts';

import FloatingActionButton from '@/components/common/UI/FloatingActionButton';

interface FeedbackWidgetProps {
  /** Optional scope label sent with the feedback (e.g. a phase or feature name). */
  feature?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  visible?: boolean;
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
}: FeedbackWidgetProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [capturing, setCapturing] = useState(false);

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
      toast.success('Danke für dein Feedback!');
      setOpen(false);
      setMessage('');
      setScreenshot(null);
    },
  });

  // Capture the page *before* opening the dialog so the screenshot shows the
  // page the user is giving feedback on, not the modal overlaying it.
  const handleLauncherClick = useCallback(async () => {
    setCapturing(true);
    const shot = await capturePageScreenshot();
    setScreenshot(shot);
    setIncludeScreenshot(shot != null);
    setCapturing(false);
    setOpen(true);
  }, []);

  if (!visible) return null;

  return (
    <>
      <FloatingActionButton
        icon={capturing ? <Loader2 className="animate-spin" /> : <MessageSquare />}
        onClick={() => {
          void handleLauncherClick();
        }}
        position={position}
        className="bg-primary-600 dark:bg-primary-600"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Feedback geben</DialogTitle>
            <DialogDescription>
              Was ist dir aufgefallen? Automatisch mitgesendet werden die aktuelle Seite (URL),
              Browser-Informationen{screenshot ? ' und – falls aktiviert – ein Screenshot' : ''}.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Dein Feedback…"
            rows={5}
            autoFocus
          />

          {screenshot && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={includeScreenshot}
                  onCheckedChange={(v) => setIncludeScreenshot(v === true)}
                />
                Screenshot der Seite anhängen
              </label>
              {includeScreenshot && (
                <img
                  src={screenshot}
                  alt="Vorschau des mitgesendeten Screenshots"
                  className="w-full max-h-56 object-contain rounded-md border border-border bg-muted"
                />
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
    </>
  );
}
