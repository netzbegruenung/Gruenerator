import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';

import { cn } from '../lib/cn';
import { Button } from './button';

interface CopyLinkRowProps {
  /** The URL (or any text) shown read-only and copied to the clipboard. */
  value: string;
  /** Button text before copying. Omit for an icon-only button. */
  copyLabel?: string;
  /** Button text shown briefly after copying. Falls back to copyLabel. */
  copiedLabel?: string;
  className?: string;
}

/**
 * Read-only URL field with a copy-to-clipboard button. Shared share-link
 * primitive used by the notebook and docs share dialogs.
 */
export function CopyLinkRow({ value, copyLabel, copiedLabel, className }: CopyLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const label = copied ? (copiedLabel ?? copyLabel) : copyLabel;

  return (
    <div className={cn('flex gap-xs', className)}>
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 rounded-md border border-grey-200 bg-grey-50 px-sm py-xs text-xs text-grey-600 outline-none dark:border-grey-700 dark:bg-grey-800 dark:text-grey-300"
      />
      <Button size="sm" variant="outline" onClick={handleCopy} className={cn(label && 'gap-xs')}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {label}
      </Button>
    </div>
  );
}
