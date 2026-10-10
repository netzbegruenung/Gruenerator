import type { ReactNode } from 'react';

interface DownloadNoticeProps {
  tone?: 'error' | 'info';
  children: ReactNode;
}

export function DownloadNotice({ tone = 'error', children }: DownloadNoticeProps) {
  const toneClass =
    tone === 'error'
      ? 'text-red-600 bg-red-50 border-red-200'
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
