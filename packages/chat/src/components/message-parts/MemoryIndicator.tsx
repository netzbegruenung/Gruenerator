import { Brain } from 'lucide-react';
import { memo, useState } from 'react';

import type { MemoryContextInfo } from '../../hooks/useChatGraphStream';

// Kept inline because packages/chat cannot import from apps/api.
// Matches `memoryKindSchema` in @gruenerator/contracts (schemas/memory.ts).
const CATEGORY_LABEL: Record<string, string> = {
  anweisung: 'Anweisung',
  fakt: 'Fakt',
};

interface MemoryIndicatorProps {
  memoryContext: MemoryContextInfo;
}

export const MemoryIndicator = memo(function MemoryIndicator({
  memoryContext,
}: MemoryIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const { memoryCount, memories, isPersona } = memoryContext;

  if (memoryCount === 0) return null;

  const label = isPersona
    ? 'Nutzerprofil berücksichtigt'
    : `${memoryCount} Erinnerung${memoryCount > 1 ? 'en' : ''} berücksichtigt`;

  return (
    <div className="mt-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-grey-400 transition-colors hover:bg-background-alt hover:text-grey-600 dark:hover:text-grey-300"
      >
        <Brain className="size-3.5" />
        <span>{label}</span>
      </button>

      {expanded && !isPersona && memories.length > 0 && (
        <div className="mt-xs ml-1 space-y-1 border-l-2 border-grey-200 pl-3 dark:border-grey-700">
          {memories.map((m, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-grey-500">
              {m.category && (
                <span className="shrink-0 rounded bg-grey-100 px-1.5 py-0.5 text-[10px] font-medium text-grey-600 dark:bg-grey-800 dark:text-grey-400">
                  {CATEGORY_LABEL[m.category] ?? m.category}
                </span>
              )}
              <span className="text-grey-500 dark:text-grey-400">{m.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
