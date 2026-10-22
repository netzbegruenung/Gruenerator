import { type MediathekFilter } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { type JSX } from 'react';
import { Link } from 'react-router-dom';

export const mediathekPath = (typ: MediathekFilter): string => `/studio/mediathek?typ=${typ}`;

/** „Alle anzeigen" on a Studio strip: the full list lives in the Mediathek, filtered. */
export function ShowAllInMediathek({ typ }: { typ: MediathekFilter }): JSX.Element {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to={mediathekPath(typ)}>Alle anzeigen</Link>
    </Button>
  );
}
