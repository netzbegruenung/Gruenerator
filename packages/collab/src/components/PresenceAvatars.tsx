import { memo } from 'react';

import type { CollaborationUser } from '../types';

interface PresenceAvatarsProps {
  collaborators: CollaborationUser[];
  maxVisible?: number;
  compact?: boolean;
}

export const PresenceAvatars = memo(function PresenceAvatars({
  collaborators,
  maxVisible = 5,
  compact = false,
}: PresenceAvatarsProps) {
  if (collaborators.length === 0) return null;

  const size = compact ? 'w-5 h-5 text-[9px]' : 'w-7 h-7 text-xs';

  return (
    <div className="flex items-center -space-x-2">
      {collaborators.slice(0, maxVisible).map((user) => (
        <div
          key={user.id}
          className={`${size} rounded-full border-2 border-background flex items-center justify-center font-medium text-white`}
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {collaborators.length > maxVisible && (
        <div
          className={`${size} rounded-full border-2 border-background bg-grey-400 flex items-center justify-center font-medium text-white`}
        >
          +{collaborators.length - maxVisible}
        </div>
      )}
    </div>
  );
});
