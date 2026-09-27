import { PiPaperPlaneRight } from 'react-icons/pi';

import { AgentAvatar } from './icons/AgentAvatar';

import { Markdown } from '@/components/common/Markdown';

interface AgentPreviewProps {
  iconKey: string;
  /** Legacy emoji fallback when no iconKey is set. */
  avatar: string;
  backgroundColor: string;
  title: string;
  description: string;
  openingMessage: string;
  openingQuestions: string[];
}

/**
 * Static, runtime-free preview of how a chat with this agent opens — its avatar,
 * name, description, opening message and suggested-question pills. Updates live
 * as the editor form changes. Mirrors the Gemini "Gem" preview pane (incl. the
 * empty state and a decorative, non-functional input); no backend wiring.
 */
export function AgentPreview({
  iconKey,
  avatar,
  backgroundColor,
  title,
  description,
  openingMessage,
  openingQuestions,
}: AgentPreviewProps) {
  const hasName = title.trim().length > 0;

  return (
    <div className="flex h-[600px] flex-col rounded-xl border border-grey-200 bg-hover-alt dark:border-grey-700 dark:bg-grey-800/40">
      <div className="border-b border-grey-200 px-md py-sm text-xs font-medium text-foreground-muted dark:border-grey-700">
        Vorschau
      </div>

      {hasName ? (
        <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto p-md">
          <div className="flex flex-col items-center gap-sm pt-md text-center">
            <AgentAvatar
              iconKey={iconKey}
              avatar={avatar}
              backgroundColor={backgroundColor}
              size="lg"
            />
            <div>
              <p className="text-lg font-semibold text-foreground-heading">{title}</p>
              {description && <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>}
            </div>
          </div>

          {openingMessage && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-background px-md py-sm text-sm text-foreground shadow-sm dark:bg-grey-800">
                <Markdown fallback={<span>{openingMessage}</span>}>{openingMessage}</Markdown>
              </div>
            </div>
          )}

          {openingQuestions.length > 0 && (
            <div className="mt-auto flex flex-wrap gap-xs">
              {openingQuestions.map((q) => (
                <span
                  key={q}
                  className="rounded-full border border-grey-200 bg-background px-sm py-1 text-xs text-foreground-muted dark:border-grey-700 dark:bg-grey-800"
                >
                  {q}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-lg text-center text-sm text-foreground-muted">
          Um eine Vorschau anzuzeigen, gib deinem Agenten erst einen Namen.
        </div>
      )}

      {/* Decorative, non-functional composer — mirrors the Gemini preview pane. */}
      <div className="border-t border-grey-200 p-sm dark:border-grey-700">
        <div className="flex items-center gap-sm rounded-lg border border-grey-200 bg-background px-md py-sm text-sm text-foreground-muted dark:border-grey-700 dark:bg-grey-800">
          <span className="flex-1">Agent fragen…</span>
          <PiPaperPlaneRight size={18} aria-hidden />
        </div>
      </div>
    </div>
  );
}
