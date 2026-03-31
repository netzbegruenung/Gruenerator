import { HocuspocusProvider } from '@hocuspocus/provider';
import { cn } from '@gruenerator/ui';
import { useCollaborators } from '@gruenerator/collab';

interface PresenceAvatarsProps {
  provider: HocuspocusProvider | null;
  compact?: boolean;
  maxVisible?: number;
}

export const PresenceAvatars = ({
  provider,
  compact = false,
  maxVisible = compact ? 2 : 5,
}: PresenceAvatarsProps) => {
  const collaborators = useCollaborators(provider);

  if (collaborators.length === 0) {
    return null;
  }

  const visibleCollaborators = collaborators.slice(0, maxVisible);
  const remainingCount = collaborators.length - maxVisible;
  const hasOverflow = remainingCount > 0;

  return (
    <div className={cn('flex items-center gap-2', compact && 'gap-1')}>
      <div className="flex items-center">
        {visibleCollaborators.map((collaborator, index) => (
          <div
            key={collaborator.id}
            className={cn(
              '-ml-2 flex shrink-0 items-center justify-center rounded-full border-2 border-background font-semibold text-white shadow-sm first:ml-0',
              compact ? 'h-7 w-7 text-xs first:ml-0 -ml-1.5' : 'h-8 w-8 text-sm'
            )}
            style={{
              backgroundColor: collaborator.color,
              zIndex: visibleCollaborators.length - index,
            }}
            title={collaborator.name}
          >
            {collaborator.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {hasOverflow && (
          <div
            className={cn(
              '-ml-2 flex shrink-0 items-center justify-center rounded-full border-2 border-background bg-grey-500 font-semibold text-white shadow-sm first:ml-0',
              compact ? 'h-7 w-7 text-[0.625rem] first:ml-0 -ml-1.5' : 'h-8 w-8 text-xs'
            )}
            title={`${remainingCount} weitere Personen`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
      {!compact && collaborators.length > 1 && (
        <span className="hidden whitespace-nowrap text-sm text-grey-500 md:inline">
          {collaborators.length} {collaborators.length === 1 ? 'Person' : 'Personen'} bearbeiten
        </span>
      )}
    </div>
  );
};
