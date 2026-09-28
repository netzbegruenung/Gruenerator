import {
  fetchResearchDocument,
  researchDocumentQueryKey,
  type ResearchDocumentParams,
} from '@gruenerator/shared/api';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowLeft, LuChevronDown, LuChevronUp, LuExternalLink } from 'react-icons/lu';

import { NOTEBOOK_PASSAGE, NOTEBOOK_PASSAGE_ACTIVE } from '../notebookTheme';

import { formatPublishedDate } from './ResearchHitCard';

import type { ResearchDocumentPart, ResearchDocumentResponse } from '@gruenerator/contracts';

import { cn } from '@/utils/cn';

export type ReaderTarget = ResearchDocumentParams & {
  /** The hit's title, shown while the document loads. */
  title: string;
};

const PROSE =
  'm-0 text-base leading-[1.75] text-foreground [overflow-wrap:anywhere] sm:text-[1.0625rem]';

function Parts({ parts }: { parts: ResearchDocumentPart[] }) {
  return parts.map((p, i) =>
    p.term ? (
      <strong key={i} className="font-bold">
        {p.text}
      </strong>
    ) : (
      p.text
    )
  );
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function PassageNav({
  active,
  count,
  onStep,
  className,
}: {
  active: number;
  count: number;
  onStep: (delta: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span
        className="mr-1 text-sm whitespace-nowrap text-grey-600 dark:text-grey-300"
        aria-live="polite"
      >
        Stelle {active + 1} von {count}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-9"
        aria-label="Vorherige Stelle"
        onClick={() => onStep(-1)}
      >
        <LuChevronUp aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-9"
        aria-label="Nächste Stelle"
        onClick={() => onStep(1)}
      >
        <LuChevronDown aria-hidden />
      </Button>
    </div>
  );
}

/** Nothing for an uploaded file, which has no original on the web. */
function WebLink({ href, className }: { href: string | null; className?: string }) {
  if (!href) return null;
  return (
    <Button asChild variant="brand-outline" size="brand-sm" className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <LuExternalLink aria-hidden />
        Im Web öffnen
      </a>
    </Button>
  );
}

function ReaderBody({
  doc,
  active,
  onJump,
  registerPassage,
}: {
  doc: ResearchDocumentResponse;
  active: number;
  onJump: (index: number) => void;
  registerPassage: (index: number, el: HTMLElement | null) => void;
}) {
  const hasPassages = doc.passages.length > 0;
  const date = doc.publishedAt ? formatPublishedDate(doc.publishedAt) : null;

  return (
    <div className="mx-auto grid max-w-[1120px] gap-8 px-4 pt-6 pb-28 sm:px-8 sm:pt-12 md:grid-cols-[minmax(0,1fr)_240px] md:pb-24 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
      <article className="flex max-w-[680px] min-w-0 flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-grey-600 dark:text-grey-300">
          {doc.contentTypeLabel && (
            <Badge variant="outline" className="font-medium">
              {doc.contentTypeLabel}
            </Badge>
          )}
          <span>{[doc.sourceName, date].filter(Boolean).join(' · ')}</span>
        </div>
        <DialogTitle className="m-0 font-[Raleway,sans-serif] text-2xl leading-tight font-bold [text-wrap:balance] text-foreground-heading [overflow-wrap:anywhere] sm:text-[2rem]">
          {doc.title}
        </DialogTitle>

        {/* Phones get the passage list as a strip under the title. */}
        {hasPassages && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden" role="list">
            {doc.passages.map((p) => (
              <div role="listitem" key={p.index} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onJump(p.index)}
                  aria-current={p.index === active ? 'true' : undefined}
                  aria-label={`Stelle ${p.index + 1}${p.heading ? `: ${p.heading}` : ''}`}
                  className={cn(
                    'flex min-h-11 max-w-[14rem] items-center gap-2 rounded-full border px-3 text-sm',
                    p.index === active
                      ? 'border-[#D6006E] font-semibold text-foreground'
                      : 'border-grey-200 text-grey-700 dark:border-grey-700 dark:text-grey-200'
                  )}
                >
                  <span className="font-bold">{p.index + 1}</span>
                  <span className="truncate">{p.heading ?? p.text}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4 pt-2">
          {doc.blocks.map((block, bi) =>
            block.kind === 'heading' ? (
              <h2
                key={bi}
                className="m-0 pt-4 font-[Raleway,sans-serif] text-xl font-bold text-foreground-heading [overflow-wrap:anywhere]"
              >
                {block.segments.map((s, si) => (
                  <Parts key={si} parts={s.parts} />
                ))}
              </h2>
            ) : (
              <p key={bi} className={PROSE}>
                {block.segments.map((s, si) => {
                  const passage = s.passage;
                  if (passage === null) return <Parts key={si} parts={s.parts} />;
                  return (
                    <mark
                      key={si}
                      ref={(el) => registerPassage(passage, el)}
                      className={cn(
                        'rounded px-0.5 py-[3px] text-foreground transition-colors [box-decoration-break:clone]',
                        passage === active ? NOTEBOOK_PASSAGE_ACTIVE : NOTEBOOK_PASSAGE
                      )}
                    >
                      <Parts parts={s.parts} />
                    </mark>
                  );
                })}
              </p>
            )
          )}
        </div>

        <WebLink href={doc.sourceUrl} className="mt-6 self-start md:hidden" />
      </article>

      <aside className="hidden md:block">
        <div className="sticky top-6 flex flex-col gap-3">
          {hasPassages ? (
            <>
              <h2 className="m-0 text-xs font-bold tracking-[0.06em] text-grey-600 uppercase dark:text-grey-300">
                {doc.passages.length} relevante {doc.passages.length === 1 ? 'Stelle' : 'Stellen'}
              </h2>
              <ol className="m-0 flex max-h-[calc(100dvh-14rem)] list-none flex-col gap-1.5 overflow-y-auto p-0">
                {doc.passages.map((p) => {
                  const on = p.index === active;
                  return (
                    <li key={p.index}>
                      <button
                        type="button"
                        onClick={() => onJump(p.index)}
                        aria-current={on ? 'true' : undefined}
                        className={cn(
                          'grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 rounded-xl border p-3 text-left transition-colors hover:border-[#F2A9CE] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          on
                            ? cn('border-[#F2A9CE]', NOTEBOOK_PASSAGE)
                            : 'border-grey-200 dark:border-grey-700'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-6 items-center justify-center rounded-full text-xs font-bold',
                            on
                              ? 'bg-[#B4005C] text-white dark:bg-[#F2A9CE] dark:text-[#14090E]'
                              : cn(NOTEBOOK_PASSAGE, 'text-[#B4005C] dark:text-[#F2A9CE]')
                          )}
                        >
                          {p.index + 1}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          {p.heading && (
                            <span className="truncate text-xs font-bold text-grey-600 dark:text-grey-300">
                              {p.heading}
                            </span>
                          )}
                          <span className="line-clamp-2 text-sm leading-snug text-foreground">
                            {p.text}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="m-0 text-sm text-grey-600 dark:text-grey-300">
              Keine einzelnen Textstellen markiert – das Dokument passt insgesamt zur Suche.
            </p>
          )}
          <WebLink href={doc.sourceUrl} className="mt-2 self-start" />
        </div>
      </aside>
    </div>
  );
}

/**
 * A search hit opened inside the notebook: the document's full text with the
 * passages that match the search marked and numbered. Full screen on every
 * width; the passage list sits beside the text from `md`, above it on phones,
 * where the step controls move to a bar at the bottom within thumb reach.
 */
export function ResearchDocumentReader({
  target,
  onClose,
}: {
  target: ReaderTarget;
  onClose: () => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: researchDocumentQueryKey(target),
    queryFn: () => fetchResearchDocument(target),
    staleTime: 5 * 60 * 1000,
  });

  const [active, setActive] = useState(0);
  const passages = useRef(new Map<number, HTMLElement>());
  const registerPassage = useCallback((index: number, el: HTMLElement | null) => {
    if (el) passages.current.set(index, el);
    else passages.current.delete(index);
  }, []);

  const scrollTo = useCallback((index: number) => {
    passages.current.get(index)?.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, []);
  const jump = (index: number) => {
    setActive(index);
    scrollTo(index);
  };

  const count = data?.passages.length ?? 0;
  const step = (delta: number) => jump((active + delta + count) % count);

  // Opens on the first passage, where the reason for the hit is. `active`
  // already starts there — the list mounts one reader per document.
  useEffect(() => {
    if (count > 0) scrollTo(0);
  }, [count, scrollTo]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:max-w-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
      >
        <DialogDescription className="sr-only">
          Volltext des Dokuments mit den Stellen, die zur Suche passen.
        </DialogDescription>
        <div className="flex min-h-14 items-center gap-2 border-b border-grey-200 px-2 sm:px-5 dark:border-grey-700">
          <Button variant="ghost" onClick={onClose} className="min-h-11 md:min-h-9">
            <LuArrowLeft aria-hidden />
            Ergebnisse
          </Button>
          <div className="flex-1" />
          {count > 0 && (
            <PassageNav active={active} count={count} onStep={step} className="hidden md:flex" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {data ? (
            <ReaderBody
              doc={data}
              active={active}
              onJump={jump}
              registerPassage={registerPassage}
            />
          ) : (
            <div className="mx-auto flex max-w-[680px] flex-col gap-4 px-4 pt-6 sm:px-8 sm:pt-12">
              <DialogTitle className="m-0 font-[Raleway,sans-serif] text-2xl leading-tight font-bold text-foreground-heading sm:text-[2rem]">
                {target.title}
              </DialogTitle>
              {isPending && (
                <div
                  className="flex flex-col gap-3"
                  aria-label="Dokument wird geladen"
                  role="status"
                >
                  {[92, 100, 85, 97, 60].map((w, i) => (
                    <div
                      key={i}
                      className="h-4 animate-pulse rounded bg-grey-100 dark:bg-grey-800"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              )}
              {isError && (
                <div className="flex flex-col items-start gap-3">
                  <p className="m-0 text-base text-grey-700 dark:text-grey-200">
                    Das Dokument konnte nicht geladen werden.
                  </p>
                  <WebLink href={'sourceUrl' in target ? target.sourceUrl : null} />
                </div>
              )}
            </div>
          )}
        </div>

        {count > 0 && (
          <div className="flex items-center justify-end border-t border-grey-200 bg-background px-2 pb-[env(safe-area-inset-bottom)] md:hidden dark:border-grey-700">
            <PassageNav active={active} count={count} onStep={step} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
