import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Clipboard button with transient "copied" feedback. Shared by the social
 * post card and the artifact panel's post section so the feedback behavior
 * can't drift between surfaces.
 */
export function CopyTextButton({
  text,
  ariaLabel,
  className,
  showLabel = false,
}: {
  text: string;
  ariaLabel: string;
  className?: string;
  /** Render "Kopieren"/"Kopiert" next to the icon (card header style). */
  showLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button onClick={copy} className={className} aria-label={ariaLabel}>
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      {showLabel && <span>{copied ? 'Kopiert' : 'Kopieren'}</span>}
    </button>
  );
}
