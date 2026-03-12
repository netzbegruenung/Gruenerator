import { cn } from '@/utils/cn';

const groupLabels: Record<string, string> = {
  manual: 'Dokumente',
  wolke: 'Wolke Dokumente',
  url: 'Websites',
  gruenerierte_texte: 'Grünerierte Texte',
};

const groupIcons: Record<string, string> = {
  manual: '📁',
  wolke: '☁️',
  url: '🌐',
  gruenerierte_texte: '✨',
};

interface DocumentItem {
  id: string;
  [key: string]: unknown;
}

interface DocumentGroupedContentProps {
  groupedItems?: Record<string, DocumentItem[]>;
  expandedGroups: Set<string>;
  onToggleGroup: (groupKey: string) => void;
  cardRenderer?: (item: DocumentItem) => React.ReactNode;
  renderDefaultCard: (item: DocumentItem) => React.ReactNode;
}

const DocumentGroupedContent = ({
  groupedItems = {},
  expandedGroups,
  onToggleGroup,
  cardRenderer,
  renderDefaultCard,
}: DocumentGroupedContentProps) => {
  return (
    <div className="flex flex-col gap-lg">
      {Object.entries(groupedItems).map(([groupKey, items]) => {
        if (!items || items.length === 0) return null;
        const isExpanded = expandedGroups.has(groupKey);
        const groupLabel = groupLabels[groupKey] || groupKey;
        const groupIcon = groupIcons[groupKey] || '📄';

        return (
          <div
            key={groupKey}
            className={cn(
              'border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden',
              isExpanded && 'border-primary-400'
            )}
          >
            <div
              className="flex items-center gap-sm px-md py-sm cursor-pointer bg-grey-50 dark:bg-grey-800 hover:bg-grey-100 dark:hover:bg-grey-750 transition-colors duration-200 select-none"
              onClick={() => onToggleGroup(groupKey)}
            >
              <span aria-hidden>{groupIcon}</span>
              <h3 className="m-0 text-foreground-heading text-base font-semibold flex-1">
                {groupLabel}
              </h3>
              <span className="bg-grey-200 dark:bg-grey-700 text-grey-600 dark:text-grey-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                {items.length}
              </span>
              <button
                className="bg-transparent border-none cursor-pointer text-grey-500 dark:text-grey-400 text-sm p-xs rounded transition-transform duration-200"
                aria-expanded={isExpanded}
                aria-controls={`group-${groupKey}`}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            </div>

            {isExpanded && (
              <div id={`group-${groupKey}`} className="p-md">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-lg xl:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                  {items.map((item) =>
                    cardRenderer ? cardRenderer(item) : renderDefaultCard(item)
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DocumentGroupedContent;
