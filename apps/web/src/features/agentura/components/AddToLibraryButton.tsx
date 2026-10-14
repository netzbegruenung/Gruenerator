import { type UserLibraryItemKind } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { PiCheck, PiPlus } from 'react-icons/pi';

import { useUserLibrary } from '../hooks/useUserLibrary';

/**
 * „Zu meinen Grüneratoren" — holt einen Agent oder ein Rezept aus der Agentura
 * auf die eigene Übersicht. Ein zweiter Klick nimmt es wieder heraus.
 */
export function AddToLibraryButton({
  kind,
  itemRef,
  size = 'default',
}: {
  kind: UserLibraryItemKind;
  /** agentRef bei Agents, Mention bei Rezepten. */
  itemRef: string;
  size?: 'default' | 'sm';
}) {
  const library = useUserLibrary();
  const added = library.has(kind, itemRef);

  return (
    <Button
      variant={added ? 'outline' : 'brand'}
      size={size}
      aria-pressed={added}
      onClick={() => (added ? library.remove(kind, itemRef) : library.add(kind, itemRef))}
    >
      {added ? <PiCheck aria-hidden /> : <PiPlus aria-hidden />}
      {added ? 'In meinen Grüneratoren' : 'Zu meinen Grüneratoren'}
    </Button>
  );
}
