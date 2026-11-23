import { type GroupAudience, type LandesverbandId } from '@gruenerator/contracts';
import { landesverbandOptions, useUpdateGroupInfo } from '@gruenerator/shared/groups';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruenerator/ui';

import { useAuthStore } from '../../../stores/authStore';

const NONE = 'none';

interface ProjectLandesverbandSelectProps {
  groupId: string;
  audience: GroupAudience | null | undefined;
  current: LandesverbandId | null | undefined;
  onSuccessMessage?: (message: string) => void;
  onErrorMessage?: (message: string) => void;
}

/**
 * Der Landesverband eines Projekts (nur Admins). Speichert sofort: im Chat
 * schreibt der Grünerator dann im Stil dieses Verbands, nicht der aktiven Rolle.
 */
export function ProjectLandesverbandSelect({
  groupId,
  audience,
  current,
  onSuccessMessage,
  onErrorMessage,
}: ProjectLandesverbandSelectProps) {
  const locale = useAuthStore((s) => s.locale);
  const update = useUpdateGroupInfo(groupId);
  const options = landesverbandOptions(audience, locale, current);

  const handleChange = (value: string) => {
    const next = options.find((o) => o.id === value)?.id ?? null;
    update.mutate(
      { landesverband: next },
      {
        onSuccess: () => onSuccessMessage?.('Landesverband gespeichert.'),
        onError: (error: Error) => onErrorMessage?.(error.message),
      }
    );
  };

  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor="project-landesverband-select">Landesverband</Label>
      <Select value={current ?? NONE} onValueChange={handleChange} disabled={update.isPending}>
        <SelectTrigger id="project-landesverband-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Keiner</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="m-0 text-xs text-muted-foreground">
        Chats im Projekt nutzen die Rezepte dieses Landesverbands, auch wenn deine Rolle zu einem
        anderen gehört.
      </p>
    </div>
  );
}
