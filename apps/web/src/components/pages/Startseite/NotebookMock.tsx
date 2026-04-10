import { Popover as PopoverPrimitive } from 'radix-ui';
import { memo, useState } from 'react';
import { FaBook } from 'react-icons/fa';

const CITATIONS = [
  {
    id: 1,
    title: '...für eine ökologische Verkehrswende',
    snippet:
      'Der Radverkehr ist ein zentraler Baustein der Verkehrswende. Wir setzen uns für sichere Radinfrastruktur ein.',
    collection: 'Grundsatzprogramm',
    color: '#059669',
  },
  {
    id: 2,
    title: 'Radverkehr in Kommunen fördern',
    snippet:
      'Kommunen sollen den Radverkehrsanteil auf mindestens 30% steigern. Geschützte Radstreifen sind prioritär.',
    collection: 'Kommunalwiki',
    color: '#7c3aed',
  },
  {
    id: 3,
    title: 'Antrag: Nationales Radverkehrsgesetz',
    snippet: 'Die Bundestagsfraktion fordert verbindliche Qualitätsstandards für Radwege.',
    collection: 'Bundestagsfraktion',
    color: '#2563eb',
  },
];

const CitationBubble = memo(function CitationBubble({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const citation = CITATIONS[id - 1];

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold rounded-full px-0.5 mx-0.5 align-super cursor-pointer transition-opacity hover:opacity-80 bg-secondary-600 text-white dark:bg-primary-400 dark:text-grey-950"
          aria-label={`Quelle ${id}`}
        >
          {id}
        </button>
      </PopoverPrimitive.Trigger>
      {open && citation && (
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="top"
            sideOffset={4}
            align="center"
            className="z-50 w-56 rounded-lg border border-grey-200 dark:border-grey-700 bg-background p-2.5 shadow-lg animate-in fade-in-0 zoom-in-95"
          >
            <p className="text-[11px] font-medium text-foreground leading-snug truncate">
              {citation.title}
            </p>
            <span
              className="inline-block mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
              style={{ backgroundColor: `${citation.color}20`, color: citation.color }}
            >
              {citation.collection}
            </span>
            <p className="text-[10px] text-grey-500 dark:text-grey-400 leading-relaxed mt-1.5 line-clamp-2">
              {citation.snippet}
            </p>
            <PopoverPrimitive.Arrow className="fill-background" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      )}
    </PopoverPrimitive.Root>
  );
});

const NotebookMock = memo(function NotebookMock() {
  return (
    <div className="w-full h-full flex items-center justify-center p-2 md:p-sm lg:p-md">
      <div className="w-full max-w-[500px] rounded-xl border border-grey-200 dark:border-grey-700 bg-background shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800/50">
          <FaBook className="w-3.5 h-3.5 text-primary-600" />
          <span className="text-xs font-semibold text-foreground">Grünerator Notebook</span>
          <span className="ml-auto text-[10px] text-grey-400">3 Quellen</span>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-3 max-h-[320px] md:max-h-[380px] overflow-hidden relative">
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary-500 text-white px-3.5 py-2.5 text-xs leading-relaxed">
              Was ist die Grüne Position zum Radverkehr?
            </div>
          </div>

          <div className="flex gap-2.5 items-start">
            <div className="shrink-0 w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <FaBook className="w-3 h-3 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs leading-relaxed text-foreground">
                <p className="mb-1.5">
                  Die Grünen setzen sich für eine konsequente Förderung des Radverkehrs als Baustein
                  der Verkehrswende ein.
                  <CitationBubble id={1} />
                  Ziel ist ein Radverkehrsanteil von mindestens 30%.
                  <CitationBubble id={2} />
                </p>
                <p>
                  Die Bundestagsfraktion hat dazu ein nationales Radverkehrsgesetz beantragt, das
                  verbindliche Standards für Radwege festlegt.
                  <CitationBubble id={3} />
                </p>
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800/30 px-3.5 py-2.5">
            <span className="text-xs text-grey-400 dark:text-grey-500 flex-1">
              Frage an die Quellen stellen...
            </span>
            <div className="w-6 h-6 rounded-lg bg-primary-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-white">
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default NotebookMock;
