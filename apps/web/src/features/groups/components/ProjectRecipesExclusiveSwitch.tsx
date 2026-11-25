import { useUpdateGroupInfo } from '@gruenerator/shared/groups';
import { Switch } from '@gruenerator/ui';
import { useId } from 'react';

interface ProjectRecipesExclusiveSwitchProps {
  groupId: string;
  checked: boolean;
  onSuccessMessage?: (message: string) => void;
  onErrorMessage?: (message: string) => void;
}

/**
 * „Nur Projekt-Rezepte verwenden" (nur Admins, speichert sofort): Chats im
 * Projekt laden von sich aus nur die Rezepte des Projekts. Recherche-Methoden
 * und ein ausdrücklich gewähltes @Rezept gehen weiter.
 */
export function ProjectRecipesExclusiveSwitch({
  groupId,
  checked,
  onSuccessMessage,
  onErrorMessage,
}: ProjectRecipesExclusiveSwitchProps) {
  const update = useUpdateGroupInfo(groupId);
  const switchId = useId();
  const hintId = useId();

  const handleChange = (next: boolean) => {
    update.mutate(
      { recipesExclusive: next },
      {
        onSuccess: () =>
          onSuccessMessage?.(
            next ? 'Chats nutzen nur noch die Projekt-Rezepte.' : 'Alle Rezepte wieder verfügbar.'
          ),
        onError: (error: Error) => onErrorMessage?.(error.message),
      }
    );
  };

  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={switchId} className="flex items-center justify-between gap-sm text-sm">
        <span className="font-medium">Nur Projekt-Rezepte verwenden</span>
        <Switch
          id={switchId}
          checked={checked}
          onCheckedChange={handleChange}
          disabled={update.isPending}
          aria-describedby={hintId}
        />
      </label>
      <p id={hintId} className="m-0 text-xs text-muted-foreground">
        Chats im Projekt schreiben nur mit den Rezepten dieses Projekts. Ohne den Schalter ersetzt
        ein Projekt-Rezept nur die Rezepte derselben Textsorte.
      </p>
    </div>
  );
}
