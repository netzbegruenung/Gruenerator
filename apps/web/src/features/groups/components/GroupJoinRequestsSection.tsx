import { validateRobotId } from '@gruenerator/shared/avatar';
import { Button } from '@gruenerator/ui';
import { memo, useState } from 'react';
import { HiCheck, HiUserAdd, HiX } from 'react-icons/hi';

import { RobotAvatar } from '../../../components/common/RobotAvatar';
import {
  useGroupJoinRequests,
  useReviewJoinRequest,
  type JoinRequest,
} from '../hooks/useGroupRequests';

interface GroupJoinRequestsSectionProps {
  groupId: string;
  isAdmin: boolean;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

function requesterName(request: JoinRequest): string {
  return request.display_name || request.first_name || request.email || 'Nutzer*in';
}

const GroupJoinRequestsSection = memo(
  ({ groupId, isAdmin, onSuccessMessage, onErrorMessage }: GroupJoinRequestsSectionProps) => {
    const { data: requests } = useGroupJoinRequests(groupId, isAdmin);
    const { approve, deny } = useReviewJoinRequest(groupId);
    const [busyId, setBusyId] = useState<string | null>(null);

    if (!isAdmin || !requests || requests.length === 0) return null;

    const handleApprove = (request: JoinRequest) => {
      setBusyId(request.id);
      approve.mutate(request.id, {
        onSuccess: () => onSuccessMessage(`${requesterName(request)} wurde aufgenommen.`),
        onError: (error: Error) => onErrorMessage(error.message),
        onSettled: () => setBusyId(null),
      });
    };

    const handleDeny = (request: JoinRequest) => {
      setBusyId(request.id);
      deny.mutate(request.id, {
        onSuccess: () => onSuccessMessage(`Anfrage von ${requesterName(request)} abgelehnt.`),
        onError: (error: Error) => onErrorMessage(error.message),
        onSettled: () => setBusyId(null),
      });
    };

    return (
      <div>
        <div className="sticky top-0 z-10 bg-background-pure flex items-center justify-between py-xs -mx-sm px-sm">
          <h4 className="flex items-center gap-sm text-xs font-medium uppercase tracking-wide text-grey-500 m-0">
            <HiUserAdd className="text-base text-primary-500" />
            Beitrittsanfragen ({requests.length})
          </h4>
        </div>

        <div className="flex flex-col gap-xs">
          {requests.map((request) => {
            const profileImageNumber = validateRobotId(request.avatar_robot_id);
            const isBusy = busyId === request.id;
            return (
              <div
                key={request.id}
                className="flex items-center gap-sm px-sm py-xs rounded-md hover:bg-grey-50 dark:hover:bg-grey-800/50 transition-colors"
              >
                <RobotAvatar
                  robotId={profileImageNumber}
                  displayName={requesterName(request)}
                  sizePx={28}
                  className="w-7 h-7 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground-heading truncate block">
                    {requesterName(request)}
                  </span>
                </div>
                <div className="flex items-center gap-xxs shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => handleApprove(request)}
                    aria-label="Anfrage annehmen"
                  >
                    <HiCheck className="size-4 text-green-600" />
                    Annehmen
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => handleDeny(request)}
                    aria-label="Anfrage ablehnen"
                  >
                    <HiX className="size-4 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

GroupJoinRequestsSection.displayName = 'GroupJoinRequestsSection';

export default GroupJoinRequestsSection;
