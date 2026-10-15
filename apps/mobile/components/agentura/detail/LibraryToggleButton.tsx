import { type UserLibraryItemKind } from '@gruenerator/contracts';

import { useUserLibrary } from '../../../hooks/agents/useUserLibrary';
import { Button } from '../../common';

/** „Zu meinen Grüneratoren" — holt einen Agent oder ein Rezept auf die Übersicht. */
export function LibraryToggleButton({
  kind,
  itemRef,
}: {
  kind: UserLibraryItemKind;
  itemRef: string;
}) {
  const library = useUserLibrary();
  const added = library.has(kind, itemRef);
  return (
    <Button
      variant="outline"
      disabled={!library.loaded}
      onPress={() => library.toggle(kind, itemRef)}
    >
      {added ? 'In meinen Grüneratoren' : 'Zu meinen Grüneratoren'}
    </Button>
  );
}
