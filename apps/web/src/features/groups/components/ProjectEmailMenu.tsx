import { type GroupEmailNotifications } from '@gruenerator/contracts';
import {
  DEFAULT_GROUP_EMAIL_NOTIFICATIONS,
  GROUP_EMAIL_NOTIFICATION_OPTIONS,
} from '@gruenerator/shared/groups';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { HiOutlineBell } from 'react-icons/hi';
import { HiOutlineBellSlash } from 'react-icons/hi2';

import { useSetGroupEmailNotifications } from '../hooks/useGroups';

interface ProjectEmailMenuProps {
  groupId: string;
  level: GroupEmailNotifications | null | undefined;
  onSuccessMessage?: (msg: string) => void;
  onErrorMessage?: (msg: string) => void;
}

/** The caller's own email setting for this project, right in its header. */
export function ProjectEmailMenu({
  groupId,
  level,
  onSuccessMessage,
  onErrorMessage,
}: ProjectEmailMenuProps) {
  const setLevel = useSetGroupEmailNotifications(groupId);
  const current =
    (setLevel.isPending ? setLevel.variables : level) ?? DEFAULT_GROUP_EMAIL_NOTIFICATIONS;

  const choose = (next: GroupEmailNotifications) => {
    if (next === current || setLevel.isPending) return;
    setLevel.mutate(next, {
      onSuccess: () => {
        const option = GROUP_EMAIL_NOTIFICATION_OPTIONS.find((o) => o.value === next);
        onSuccessMessage?.(`E-Mails aus diesem Projekt: ${option?.label ?? next}.`);
      },
      onError: (err: Error) =>
        onErrorMessage?.('Fehler beim Aktualisieren der Benachrichtigungen: ' + err.message),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          aria-label="E-Mail-Benachrichtigungen für dieses Projekt"
        >
          {current === 'none' ? <HiOutlineBellSlash aria-hidden /> : <HiOutlineBell aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>E-Mails aus diesem Projekt</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(next) => choose(next as GroupEmailNotifications)}
        >
          {GROUP_EMAIL_NOTIFICATION_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} disabled={setLevel.isPending}>
              <span className="flex flex-col">
                <span>{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
