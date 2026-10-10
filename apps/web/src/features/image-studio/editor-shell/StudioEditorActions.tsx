import { Button } from '@gruenerator/ui';
import { Download, Loader2, PencilLine } from 'lucide-react';

interface DownloadButtonProps {
  onClick: () => void;
  disabled: boolean;
  exporting: boolean;
  /** „Herunterladen" unless a carousel goes out as a ZIP. */
  label?: string;
}

/** Header button: a pill from lg, an icon circle below. */
export function DownloadButton({
  onClick,
  disabled,
  exporting,
  label = 'Herunterladen',
}: DownloadButtonProps) {
  const Icon = exporting ? Loader2 : Download;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || exporting}
      aria-label={exporting ? 'Wird exportiert …' : label}
      title={label}
      className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/50 text-[13px] font-bold text-white transition-colors hover:bg-white/15 disabled:opacity-50 max-md:size-11 md:max-lg:w-9 lg:px-3.5"
    >
      <Icon className={exporting ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
      <span className="max-lg:hidden">{label}</span>
    </button>
  );
}

interface OpenInEditorButtonProps {
  onClick: () => void;
  disabled: boolean;
  opening: boolean;
}

export function OpenInEditorButton({ onClick, disabled, opening }: OpenInEditorButtonProps) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={opening || disabled}
      aria-label={opening ? 'Wird geöffnet …' : 'Im Editor öffnen'}
      title="Im Editor öffnen"
      className="bg-white text-primary-700 hover:bg-white/90 max-md:size-11 max-md:rounded-full max-md:p-0"
    >
      <PencilLine className="size-5 md:hidden" aria-hidden="true" />
      <span className="max-md:hidden lg:hidden">{opening ? '…' : 'Editor'}</span>
      <span className="max-lg:hidden">{opening ? 'Wird geöffnet …' : 'Im Editor öffnen'}</span>
    </Button>
  );
}
