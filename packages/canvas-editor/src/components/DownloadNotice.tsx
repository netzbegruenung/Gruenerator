import type { ReactNode } from 'react';

interface DownloadNoticeProps {
  tone?: 'error' | 'info';
  children: ReactNode;
}

export function DownloadNotice({ tone = 'error', children }: DownloadNoticeProps) {
  const toneClass =
    tone === 'error'
      ? 'text-editor-danger-fg bg-editor-danger-bg border-transparent'
      : 'text-foreground bg-editor-tile border-[var(--editor-border-strong)]';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`text-xs border rounded-md px-2 py-1 ${toneClass}`}
    >
      {children}
    </div>
  );
}
