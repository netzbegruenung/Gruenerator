import { memo } from 'react';

import type { CollaborationUser } from '@gruenerator/collab';

import { RobotAvatar } from '@/components/common/RobotAvatar';

const MAX_VISIBLE = 5;

interface PresenceAvatarsProps {
  collaborators: CollaborationUser[];
}

export const PresenceAvatars = memo(function PresenceAvatars({
  collaborators,
}: PresenceAvatarsProps) {
  if (collaborators.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {collaborators.slice(0, MAX_VISIBLE).map((user) => (
        <div
          key={user.id}
          className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium text-white overflow-hidden"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          <RobotAvatar
            robotId={user.avatarRobotId ?? 1}
            displayName={user.name}
            sizePx={28}
            className="w-full h-full"
            fallbackClassName="bg-transparent text-white"
            alt=""
          />
        </div>
      ))}
      {collaborators.length > MAX_VISIBLE && (
        <div className="w-7 h-7 rounded-full border-2 border-background bg-grey-400 flex items-center justify-center text-xs font-medium text-white">
          +{collaborators.length - MAX_VISIBLE}
        </div>
      )}
    </div>
  );
});
