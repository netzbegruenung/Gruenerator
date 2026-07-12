import { type ReactNode } from 'react';

export function DetailBox({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-sm rounded-md border border-border p-md">
      <span className="text-sm font-semibold">
        <span className="mr-xs text-lg">{emoji}</span>
        {title}
      </span>
      {children}
    </div>
  );
}
