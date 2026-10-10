import { useIsMobile } from '@gruenerator/ui';
import { ArrowLeft } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '../../../utils/cn';

import './editor-shell.css';

const VIEWS = [
  { id: 'chat', label: 'Chat' },
  { id: 'vorschau', label: 'Vorschau' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

interface StudioEditorShellProps {
  title: string;
  /** Prefix of the tab and panel ids, so two editors never share one. */
  idPrefix: string;
  /** Right side of the header. */
  actions?: ReactNode;
  /** Between the header and the panels, e.g. the Feinschliff bar. */
  belowHeader?: ReactNode;
  chat: ReactNode;
  preview: ReactNode;
  /** A new value opens the preview tab below md. */
  revealKey: string | number | null;
}

/**
 * The studio's editor page: a header, the conversation on the left and the preview on the right.
 * Below md the two are tabs. The tab strip and panel hiding are CSS (`md:`); the tab roles only
 * apply where the tabs show, so ≥md keeps its plain aside/main landmarks.
 */
export function StudioEditorShell({
  title,
  idPrefix,
  actions,
  belowHeader,
  chat,
  preview,
  revealKey,
}: StudioEditorShellProps) {
  const navigate = useNavigate();
  const tabbed = useIsMobile();
  // Exactly one main landmark at every width: the panel container below md, the preview above.
  const Shell = tabbed ? 'main' : 'div';
  const Preview = tabbed ? 'div' : 'main';
  const [view, setView] = useState<ViewId>('chat');
  const [seenKey, setSeenKey] = useState(revealKey);
  if (seenKey !== revealKey) {
    if (revealKey !== null) setView('vorschau');
    setSeenKey(revealKey);
  }
  const tabRefs = useRef<Partial<Record<ViewId, HTMLButtonElement | null>>>({});
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = view === 'chat' ? 'vorschau' : 'chat';
    setView(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-sm bg-[image:var(--editor-menubar-gradient,linear-gradient(90deg,#00553B_0%,#3E7D63_55%,#6BA88C_100%))] px-md text-white">
        <button
          type="button"
          onClick={() => void navigate('/studio')}
          aria-label="Zurück zum Studio"
          title="Zurück zum Studio"
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-white/90 transition-colors hover:bg-white/15 hover:text-white max-md:size-11"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="m-0 truncate text-[15px] font-semibold leading-none text-white [font-family:inherit]">
            {title}
          </h1>
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </header>

      {belowHeader}

      <div
        role="tablist"
        aria-label="Ansicht"
        className="flex shrink-0 justify-center gap-6 border-b border-border bg-card md:hidden"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            ref={(el) => {
              tabRefs.current[v.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${v.id}`}
            aria-selected={view === v.id}
            aria-controls={`${idPrefix}-panel-${v.id}`}
            tabIndex={view === v.id ? 0 : -1}
            onClick={() => setView(v.id)}
            onKeyDown={onTabKey}
            className={cn(
              'min-h-11 rounded-sm border-b-2 px-1 py-2.5 text-sm font-bold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
              view === v.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <Shell className="flex min-h-0 flex-1 max-md:flex-col">
        <aside
          id={`${idPrefix}-panel-chat`}
          {...(tabbed
            ? { role: 'tabpanel', 'aria-labelledby': `${idPrefix}-tab-chat` }
            : { 'aria-label': 'Unterhaltung' })}
          className={cn(
            'flex w-[360px] shrink-0 flex-col [container-type:size] border-r border-grey-200 max-md:h-auto max-md:min-h-0 max-md:w-full max-md:flex-1 max-md:border-r-0 dark:border-grey-700',
            view !== 'chat' && 'max-md:hidden'
          )}
        >
          {chat}
        </aside>

        <Preview
          id={`${idPrefix}-panel-vorschau`}
          {...(tabbed ? { role: 'tabpanel', 'aria-labelledby': `${idPrefix}-tab-vorschau` } : {})}
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-sm bg-grey-50 p-lg max-md:p-md dark:bg-grey-900',
            view !== 'vorschau' && 'max-md:hidden'
          )}
        >
          {preview}
        </Preview>
      </Shell>
    </div>
  );
}
