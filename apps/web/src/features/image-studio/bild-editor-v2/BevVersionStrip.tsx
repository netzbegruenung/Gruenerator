import { cn } from '../../../utils/cn';

import { captionFor } from './BevChat';
import { type BildEditorV2 } from './useBildEditorV2';

/** Under the preview: every version as a thumbnail; the one picked is what the next turn edits. */
export function BevVersionStrip({ bev }: { bev: BildEditorV2 }) {
  const { versions, active, activeHasChildren, generating, selectVersion } = bev;
  if (versions.length < 2 && !activeHasChildren) return null;
  return (
    <div className="flex w-full shrink-0 flex-col items-center gap-2">
      {versions.length > 1 && (
        <div
          role="group"
          aria-label="Versionen"
          className="flex max-w-full gap-2.5 overflow-x-auto p-1"
        >
          {versions.map((v) => {
            const current = v.id === active?.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => selectVersion(v.id)}
                aria-pressed={current}
                aria-label={captionFor(v, versions)}
                title={v.prompt}
                className={cn(
                  'relative shrink-0 rounded-xl border-2 bg-card p-[3px] shadow-sm transition-colors',
                  current ? 'border-primary' : 'border-border hover:border-primary/50'
                )}
              >
                <img src={v.image} alt="" className="block h-12 w-[72px] rounded-lg object-cover" />
                <span
                  aria-hidden="true"
                  className="absolute bottom-1.5 left-[7px] rounded-[5px] bg-black/60 px-[5px] py-px text-[10px] font-bold text-white"
                >
                  V{v.num}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {activeHasChildren && !generating && active && (
        <span className="rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-bold text-primary-700 dark:text-primary-300">
          Änderungen an V{active.num} erstellen einen neuen Zweig
        </span>
      )}
    </div>
  );
}
