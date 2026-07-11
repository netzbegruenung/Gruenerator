import { templates, type TemplateType } from '@gruenerator/docs';
import { listUserTemplates, type UserTemplateSummary } from '@gruenerator/shared';
import { cn } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { boardTemplates } from '../boards/boardTemplates';
import { presentationTemplates } from '../presentations/presentationTemplates';
import { sheetTemplates } from '../sheets/sheetTemplates';

import { DOC_TYPE_META, type DocKind } from './docTypeMeta';

interface TemplateGalleryModalProps {
  onClose: () => void;
  onCreateBlank: (kind: DocKind) => void;
  onSelectDocTemplate: (id: TemplateType) => void;
  onSelectBoardTemplate: (id: string) => void;
  onSelectSheetTemplate: (id: string) => void;
  onSelectPresentationTemplate: (id: string) => void;
  onSelectUserTemplate: (tpl: UserTemplateSummary) => void;
}

type TabKey = 'all' | DocKind;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'Alle' },
  { key: 'doc', label: 'Dokumente' },
  { key: 'board', label: 'Boards' },
  { key: 'sheet', label: 'Tabellen' },
  { key: 'pres', label: 'Präsentationen' },
];

interface Entry {
  key: string;
  kind: DocKind;
  title: string;
  description: string;
  onSelect: () => void;
}

function TemplateCard({ entry }: { entry: Entry }) {
  const meta = DOC_TYPE_META[entry.kind];
  const Icon = meta.Icon;
  return (
    <button
      type="button"
      onClick={entry.onSelect}
      className="group text-left rounded-[14px] border border-[#E7EDE9] bg-white p-4 shadow-[0_1px_2px_rgba(31,63,51,.04)] transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-[#9DBDAE] hover:shadow-[0_12px_26px_rgba(95,133,117,.15)] dark:border-grey-700 dark:bg-grey-800"
    >
      <span
        className="mb-[34px] flex h-9 w-9 items-center justify-center rounded-[10px]"
        style={{ background: meta.bg, color: meta.color }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="text-sm font-bold text-[#22382E] dark:text-foreground">{entry.title}</div>
      <div className="mt-[3px] text-xs leading-snug text-[#9AA8A1]">{entry.description}</div>
    </button>
  );
}

function BlankCard({ kind, onSelect }: { kind: DocKind; onSelect: () => void }) {
  const label =
    kind === 'doc'
      ? 'Leeres Dokument'
      : kind === 'board'
        ? 'Leeres Board'
        : kind === 'sheet'
          ? 'Leere Tabelle'
          : 'Leere Präsentation';
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group text-left rounded-[14px] border border-dashed border-[#E7EDE9] bg-[#FBFCFB] p-4 shadow-[0_1px_2px_rgba(31,63,51,.04)] transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-[#9DBDAE] hover:shadow-[0_12px_26px_rgba(95,133,117,.15)] dark:border-grey-600 dark:bg-grey-800/60"
    >
      <span className="mb-[34px] flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#EEF3EF] text-[#5C6B63] dark:bg-grey-700 dark:text-grey-300">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </span>
      <div className="text-sm font-bold text-[#22382E] dark:text-foreground">{label}</div>
      <div className="mt-[3px] text-xs leading-snug text-[#9AA8A1]">Ohne Vorlage beginnen</div>
    </button>
  );
}

export default function TemplateGalleryModal({
  onClose,
  onCreateBlank,
  onSelectDocTemplate,
  onSelectBoardTemplate,
  onSelectSheetTemplate,
  onSelectPresentationTemplate,
  onSelectUserTemplate,
}: TemplateGalleryModalProps) {
  const [tab, setTab] = useState<TabKey>('all');

  const { data: userTemplates = [] } = useQuery<UserTemplateSummary[]>({
    queryKey: ['user-templates', 'docs-and-boards'],
    queryFn: async () => {
      const [docs, boards] = await Promise.all([
        listUserTemplates({ kind: 'doc' }),
        listUserTemplates({ kind: 'board' }),
      ]);
      return [...docs, ...boards];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const select = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const docEntries: Entry[] = templates
    .filter((t) => t.id !== 'blank')
    .map((t) => ({
      key: `doc-${t.id}`,
      kind: 'doc',
      title: t.name,
      description: t.description,
      onSelect: select(() => onSelectDocTemplate(t.id)),
    }));

  const boardEntries: Entry[] = boardTemplates.map((t) => ({
    key: `board-${t.id}`,
    kind: 'board',
    title: t.name,
    description: t.description,
    onSelect: select(() => onSelectBoardTemplate(t.id)),
  }));

  const sheetEntries: Entry[] = sheetTemplates.map((t) => ({
    key: `sheet-${t.id}`,
    kind: 'sheet',
    title: t.name,
    description: t.description,
    onSelect: select(() => onSelectSheetTemplate(t.id)),
  }));

  const presEntries: Entry[] = presentationTemplates.map((t) => ({
    key: `pres-${t.id}`,
    kind: 'pres',
    title: t.name,
    description: t.description,
    onSelect: select(() => onSelectPresentationTemplate(t.id)),
  }));

  const userEntries: Entry[] = userTemplates.map((t) => ({
    key: `user-${t.id}`,
    kind: t.template_type === 'board' ? 'board' : 'doc',
    title: t.title,
    description: 'Eigene Vorlage',
    onSelect: select(() => onSelectUserTemplate(t)),
  }));

  const byKind: Record<DocKind, Entry[]> = {
    doc: [...docEntries, ...userEntries.filter((e) => e.kind === 'doc')],
    board: [...boardEntries, ...userEntries.filter((e) => e.kind === 'board')],
    sheet: sheetEntries,
    pres: presEntries,
  };

  const blankKind: DocKind = tab === 'all' ? 'doc' : tab;
  const entries: Entry[] =
    tab === 'all' ? [...byKind.doc, ...byKind.board, ...byKind.sheet, ...byKind.pres] : byKind[tab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(24,40,33,.34)] px-6 py-16 backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vorlagen"
        className="flex max-h-full w-full max-w-[840px] flex-col overflow-hidden rounded-[22px] border border-[#E1E9E4] bg-white shadow-[0_30px_80px_rgba(31,63,51,.28)] dark:border-grey-700 dark:bg-grey-900"
      >
        <div className="flex items-center gap-[14px] border-b border-[#E7EDE9] px-[26px] pb-[18px] pt-[22px] dark:border-grey-700">
          <div>
            <h2 className="text-[19px] font-extrabold tracking-[-.01em] text-[#22382E] dark:text-foreground">
              Vorlage wählen
            </h2>
            <div className="mt-0.5 text-[13px] text-[#9AA8A1]">
              Starte mit einer fertigen Struktur — oder ganz leer.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F4F1] text-[#5C6B63] transition-colors hover:bg-[#E4EAE5] dark:bg-grey-700 dark:text-grey-300 dark:hover:bg-grey-600"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 px-[26px] pt-[14px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                tab === t.key
                  ? 'bg-[#E7F1EA] text-[#2C6149] dark:bg-secondary-900/40 dark:text-secondary-200'
                  : 'text-[#5C6B63] hover:bg-[#F2F6F3] dark:text-grey-300 dark:hover:bg-grey-800'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-[26px] pb-[26px] pt-[18px]">
          <div className="grid grid-cols-3 gap-[14px] max-sm:grid-cols-2">
            <BlankCard kind={blankKind} onSelect={select(() => onCreateBlank(blankKind))} />
            {entries.map((entry) => (
              <TemplateCard key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
