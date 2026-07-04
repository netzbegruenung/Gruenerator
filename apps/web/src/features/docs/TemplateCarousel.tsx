import { templates, type TemplateType } from '@gruenerator/docs';
import { listUserTemplates, type UserTemplateSummary } from '@gruenerator/shared';
import { cn } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { FiChevronDown, FiFileText, FiGrid, FiMoreVertical, FiPlus } from 'react-icons/fi';
import { PiBookmarkSimple, PiKanban, PiPencilLine } from 'react-icons/pi';

import { boardTemplates } from '../boards/boardTemplates';
import { sheetTemplates } from '../sheets/sheetTemplates';

const STORAGE_KEY = 'gruenerator_web_templates_hidden';

// Standard kanban doubles as the "Leeres Board" tile, so it is not repeated in
// the board-template row.
const EMPTY_BOARD_TEMPLATE_ID = 'board-standard';

type CardType = 'doc' | 'board' | 'sheet';
type SegmentKey = 'all' | CardType;

// Per-type accent tokens. The design uses green / amber / blue for doc / board /
// sheet; mapped here to theme palette tokens with dark-mode variants.
const TYPE_TOKENS: Record<
  CardType,
  { label: string; dot: string; chip: string; accent: string; dashed: string }
> = {
  doc: {
    label: 'Dokumente',
    dot: 'bg-secondary-500',
    chip: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300',
    accent: 'text-secondary-600 dark:text-secondary-400',
    dashed: 'border-secondary-300 dark:border-secondary-700',
  },
  board: {
    label: 'Boards',
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    accent: 'text-amber-600 dark:text-amber-400',
    dashed: 'border-amber-300 dark:border-amber-700',
  },
  sheet: {
    label: 'Tabellen',
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    accent: 'text-blue-600 dark:text-blue-400',
    dashed: 'border-blue-300 dark:border-blue-700',
  },
};

const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'doc', label: 'Dokumente' },
  { key: 'board', label: 'Boards' },
  { key: 'sheet', label: 'Tabellen' },
];

// Scaled-down HTML render of a doc template's content (top-anchored, clipped).
const DOC_PREVIEW_CLASS =
  'w-[590px] p-[32px_40px] scale-[0.2] origin-top-left pointer-events-none select-none text-foreground font-[PT_Sans,Arial,sans-serif] leading-normal [&_h1]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-0 [&_h1]:leading-tight [&_h2]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:mt-3.5 [&_h2]:mb-1.5 [&_h2]:leading-snug [&_h3]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1 [&_p]:text-[0.8rem] [&_p]:mb-2 [&_p]:mt-0 [&_p]:leading-normal [&_ul]:text-[0.8rem] [&_ul]:mb-2 [&_ul]:mt-0 [&_ul]:pl-5 [&_ol]:text-[0.8rem] [&_ol]:mb-2 [&_ol]:mt-0 [&_ol]:pl-5 [&_li]:mb-0.5 [&_blockquote]:border-l-[3px] [&_blockquote]:border-grey-300 dark:[&_blockquote]:border-grey-500 [&_blockquote]:my-2 [&_blockquote]:mx-0 [&_blockquote]:py-1 [&_blockquote]:px-3 [&_blockquote]:text-grey-500 [&_hr]:border-none [&_hr]:border-t [&_hr]:border-grey-200 dark:[&_hr]:border-grey-600 [&_hr]:my-2.5 [&_strong]:font-semibold [&_em]:italic [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.7rem] [&_th]:border [&_th]:border-grey-200 dark:[&_th]:border-grey-600 [&_th]:bg-grey-100 dark:[&_th]:bg-grey-600 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-grey-200 dark:[&_td]:border-grey-600 [&_td]:px-1.5 [&_td]:py-1';

function KanbanThumb() {
  return (
    <div className="flex h-full gap-1.5 p-3">
      {[0, 1, 2].map((col) => (
        <div
          key={col}
          className="flex flex-1 flex-col gap-1 rounded bg-grey-100 p-1 dark:bg-grey-800"
        >
          <div
            className={cn(
              'h-1 rounded',
              col === 0
                ? 'bg-amber-400'
                : col === 1
                  ? 'bg-amber-300'
                  : 'bg-grey-300 dark:bg-grey-600'
            )}
            style={{ width: '70%' }}
          />
          <div className="h-4 rounded bg-background-pure dark:bg-grey-700" />
          {col !== 1 && <div className="h-4 rounded bg-background-pure dark:bg-grey-700" />}
        </div>
      ))}
    </div>
  );
}

function GridThumb() {
  return (
    <div className="flex h-full items-start p-3">
      <div className="grid w-full grid-cols-3 overflow-hidden rounded border border-grey-200 dark:border-grey-600">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 border-b border-r border-grey-100 dark:border-grey-700',
              i < 3 && 'bg-blue-100 dark:bg-blue-900/30'
            )}
          />
        ))}
      </div>
    </div>
  );
}

interface GalleryCard {
  key: string;
  type: CardType;
  title: string;
  subtitle: string;
  onClick: () => void;
  thumb: ReactNode;
  /** Dashed "empty" tile — no type chip. */
  empty?: boolean;
}

function TemplateCard({ card }: { card: GalleryCard }) {
  const token = TYPE_TOKENS[card.type];
  const ChipIcon = card.type === 'board' ? PiKanban : card.type === 'sheet' ? FiGrid : FiFileText;

  return (
    <button
      className="group/item w-[124px] shrink-0 cursor-pointer border-none bg-transparent p-0 text-left font-[inherit]"
      onClick={card.onClick}
      title={card.subtitle}
    >
      <div
        className={cn(
          'relative h-[168px] w-[124px] overflow-hidden rounded-lg border bg-background-pure transition-[box-shadow,border-color] duration-150 ease-out group-hover/item:shadow-md dark:bg-grey-700',
          card.empty
            ? cn('flex items-center justify-center border-dashed', token.dashed)
            : 'border-grey-200 group-hover/item:border-grey-300 dark:border-grey-600 dark:group-hover/item:border-grey-500'
        )}
      >
        {card.empty ? (
          <FiPlus size={30} className={token.accent} />
        ) : (
          <>
            <span
              className={cn(
                'absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-md',
                token.chip
              )}
            >
              <ChipIcon size={12} />
            </span>
            {card.thumb}
          </>
        )}
      </div>
      <div className="px-1 pt-1.5">
        <span className="block truncate text-[0.8125rem] font-medium text-foreground">
          {card.title}
        </span>
        <span className="block truncate text-xs font-light text-grey-500">{card.subtitle}</span>
      </div>
    </button>
  );
}

interface TemplateCarouselProps {
  onTemplateSelect: (templateType: TemplateType) => void;
  onShowGallery: () => void;
  onCreateBoardFromTemplate: (templateId: string) => void;
  onCreateWhiteboard: () => void;
  /** Renders the spreadsheet tiles when provided (feature-flagged by DocsPage). */
  onCreateSheet?: () => void;
  onCreateSheetFromTemplate?: (templateId: string) => void;
  onUserTemplateSelect: (template: UserTemplateSummary) => void;
}

export const TemplateCarousel = memo(
  ({
    onTemplateSelect,
    onShowGallery,
    onCreateBoardFromTemplate,
    onCreateWhiteboard,
    onCreateSheet,
    onCreateSheetFromTemplate,
    onUserTemplateSelect,
  }: TemplateCarouselProps) => {
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
    const [isHidden, setIsHidden] = useState(() => {
      try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
      } catch {
        return false;
      }
    });
    const [segment, setSegment] = useState<SegmentKey>('all');
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!showMenu) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setShowMenu(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMenu]);

    const toggleHidden = () => {
      const next = !isHidden;
      setIsHidden(next);
      setShowMenu(false);
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
    };

    // ── Build the unified card list (empty tiles → templates, per type) ────────
    const cards: GalleryCard[] = [];

    // Empty tiles
    cards.push({
      key: 'empty-doc',
      type: 'doc',
      title: 'Leeres Dokument',
      subtitle: 'Starte mit einem leeren Blatt',
      onClick: () => onTemplateSelect('blank'),
      thumb: null,
      empty: true,
    });
    cards.push({
      key: 'empty-board',
      type: 'board',
      title: 'Leeres Board',
      subtitle: 'Kanban mit leeren Spalten',
      onClick: () => onCreateBoardFromTemplate(EMPTY_BOARD_TEMPLATE_ID),
      thumb: null,
      empty: true,
    });
    if (onCreateSheet) {
      cards.push({
        key: 'empty-sheet',
        type: 'sheet',
        title: 'Leere Tabelle',
        subtitle: 'Leeres Zeilen-Raster',
        onClick: onCreateSheet,
        thumb: null,
        empty: true,
      });
    }

    // Doc templates (blank is the empty tile; tabelle superseded by real sheets)
    for (const template of templates) {
      if (template.id === 'blank' || template.id === 'tabelle') continue;
      cards.push({
        key: `doc-${template.id}`,
        type: 'doc',
        title: template.name,
        subtitle: template.description,
        onClick: () => onTemplateSelect(template.id),
        thumb: (
          <>
            <div
              className={DOC_PREVIEW_CLASS}
              dangerouslySetInnerHTML={{ __html: template.content }}
            />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-grey-700" />
          </>
        ),
      });
    }

    // Board templates (standard kanban is the empty tile) + whiteboard
    for (const bt of boardTemplates) {
      if (bt.id === EMPTY_BOARD_TEMPLATE_ID) continue;
      cards.push({
        key: `board-${bt.id}`,
        type: 'board',
        title: bt.name,
        subtitle: bt.description,
        onClick: () => onCreateBoardFromTemplate(bt.id),
        thumb: <KanbanThumb />,
      });
    }
    cards.push({
      key: 'board-whiteboard',
      type: 'board',
      title: 'Whiteboard',
      subtitle: 'Freie Zeichenfläche',
      onClick: onCreateWhiteboard,
      thumb: (
        <div className="flex h-full items-center justify-center">
          <PiPencilLine size={34} className="text-amber-500 dark:text-amber-400" />
        </div>
      ),
    });

    // Sheet templates
    if (onCreateSheetFromTemplate) {
      for (const st of sheetTemplates) {
        cards.push({
          key: `sheet-${st.id}`,
          type: 'sheet',
          title: st.name,
          subtitle: st.description,
          onClick: () => onCreateSheetFromTemplate(st.id),
          thumb: <GridThumb />,
        });
      }
    }

    const visibleCards = segment === 'all' ? cards : cards.filter((c) => c.type === segment);

    return (
      <div className="mb-lg rounded-xl bg-grey-50 px-md pb-md pt-sm max-sm:hidden dark:bg-grey-800">
        <div className="flex h-[52px] items-center justify-between">
          <h2 className="m-0 text-base font-medium text-foreground">Neu erstellen</h2>

          <div className="flex items-center gap-sm">
            <button
              className="flex items-center gap-1 rounded-lg border-none bg-transparent px-xs py-xxs text-sm font-medium text-grey-500 hover:bg-hover-alt hover:text-foreground font-[inherit]"
              onClick={onShowGallery}
            >
              Vorlagengalerie <FiChevronDown size={14} />
            </button>

            <div className="h-6 w-px shrink-0 bg-grey-300/50 dark:bg-grey-600" />

            <div className="relative" ref={menuRef}>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent text-lg text-grey-500 hover:bg-hover-alt hover:text-foreground"
                onClick={() => setShowMenu((prev) => !prev)}
                aria-label="Weitere Optionen"
              >
                <FiMoreVertical size={18} />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full z-10 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-grey-200 bg-background-pure shadow-md dark:border-grey-600 dark:bg-grey-700">
                  <button
                    className="block w-full border-none bg-transparent px-4 py-2.5 text-left text-sm text-foreground hover:bg-grey-100 font-[inherit] dark:hover:bg-grey-600"
                    onClick={toggleHidden}
                  >
                    {isHidden ? 'Vorlagen anzeigen' : 'Vorlagen ausblenden'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isHidden && (
          <>
            <div className="mb-3 inline-flex gap-0.5 rounded-full bg-grey-200/70 p-0.5 dark:bg-grey-700/70">
              {SEGMENTS.map((seg) => (
                <button
                  key={seg.key}
                  onClick={() => setSegment(seg.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors font-[inherit]',
                    segment === seg.key
                      ? 'bg-background-pure text-foreground shadow-sm dark:bg-grey-600'
                      : 'text-grey-500 hover:text-foreground'
                  )}
                >
                  {seg.key !== 'all' && (
                    <span className={cn('size-[7px] rounded-full', TYPE_TOKENS[seg.key].dot)} />
                  )}
                  {seg.label}
                </button>
              ))}
            </div>

            <div className="flex gap-4 overflow-x-auto py-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleCards.map((card) => (
                <TemplateCard key={card.key} card={card} />
              ))}

              {segment === 'all' && userTemplates.length > 0 && (
                <>
                  <div className="my-1 w-px shrink-0 self-stretch bg-grey-200 dark:bg-grey-600" />
                  {userTemplates.map((tpl) => {
                    const isBoard = tpl.template_type === 'board';
                    return (
                      <button
                        key={tpl.id}
                        className="group/item w-[124px] shrink-0 cursor-pointer border-none bg-transparent p-0 text-left font-[inherit]"
                        onClick={() => onUserTemplateSelect(tpl)}
                        title={tpl.description ?? tpl.title}
                      >
                        <div
                          className={cn(
                            'flex h-[168px] w-[124px] items-center justify-center overflow-hidden rounded-lg border transition-[box-shadow,border-color] duration-150 ease-out group-hover/item:shadow-md',
                            isBoard
                              ? 'border-amber-200 bg-amber-50 group-hover/item:border-amber-300 dark:border-amber-900/40 dark:bg-amber-900/10'
                              : 'border-grey-200 bg-background-pure group-hover/item:border-grey-300 dark:border-grey-600 dark:bg-grey-700 dark:group-hover/item:border-grey-500'
                          )}
                        >
                          {isBoard ? (
                            <PiKanban size={32} className="text-amber-500 dark:text-amber-400" />
                          ) : (
                            <PiBookmarkSimple size={32} className="text-grey-400" />
                          )}
                        </div>
                        <div className="px-1 pt-1.5">
                          <span className="block truncate text-[0.8125rem] font-medium text-foreground">
                            {tpl.title}
                          </span>
                          <span className="block truncate text-xs font-light text-grey-500">
                            Eigene Vorlage
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {visibleCards.length === 0 && (
                <p className="py-8 text-sm text-grey-500">Keine Vorlagen in dieser Kategorie.</p>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);

TemplateCarousel.displayName = 'TemplateCarousel';
