import { AgentAvatar } from '../../agents/icons/AgentAvatar';

import { Markdown } from '@/components/common/Markdown';

interface RecipePreviewProps {
  iconKey: string;
  title: string;
  description: string;
  styleBlock: string;
}

/**
 * Static, runtime-free preview of a recipe's avatar, name, description and
 * rendered instruction. Updates live as the editor form changes. Mirrors
 * `agents/AgentPreview.tsx`'s empty/name-first structure.
 */
export function RecipePreview({ iconKey, title, description, styleBlock }: RecipePreviewProps) {
  const hasName = title.trim().length > 0;

  return (
    <div className="flex h-[600px] flex-col rounded-xl border border-grey-200 bg-hover-alt dark:border-grey-700 dark:bg-grey-800/40">
      <div className="border-b border-grey-200 px-md py-sm text-xs font-medium text-foreground-muted dark:border-grey-700">
        Vorschau
      </div>

      {hasName ? (
        <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto p-md">
          <div className="flex flex-col items-center gap-sm pt-md text-center">
            <AgentAvatar iconKey={iconKey} size="lg" />
            <div>
              <p className="text-lg font-semibold text-foreground-heading">{title}</p>
              {description && <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>}
            </div>
          </div>

          {styleBlock.trim() ? (
            <div className="rounded-lg bg-background p-md text-sm text-foreground shadow-sm dark:bg-grey-800">
              <Markdown fallback={<span>{styleBlock}</span>}>{styleBlock}</Markdown>
            </div>
          ) : (
            <p className="mt-auto text-center text-sm text-foreground-muted">
              Noch keine Anleitung hinterlegt.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-lg text-center text-sm text-foreground-muted">
          Um eine Vorschau anzuzeigen, gib deinem Rezept erst einen Namen.
        </div>
      )}
    </div>
  );
}
