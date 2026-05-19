/**
 * Branded empty-state for the three terminal failure modes of
 * `useNotebookCollection`:
 *
 *  - forbidden  → notebook exists but the viewer has no read access
 *  - not-found  → slug/UUID resolves to nothing
 *  - unknown    → network/server hiccup; retryable
 *
 * Uses the canonical `@gruenerator/ui` Empty primitive so the layout and
 * spacing match the rest of the workplace (admin "Kein Zugriff" page,
 * generic 404, etc.).
 */
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@gruenerator/ui';
import { FaExclamationTriangle, FaLock, FaSearch } from 'react-icons/fa';
import { Link } from 'react-router-dom';

import type { NotebookCollectionFetchError } from '../hooks/useNotebookCollection';

interface NotebookAccessErrorProps {
  variant: NotebookCollectionFetchError;
  onRetry?: () => void;
}

const COPY: Record<
  NotebookCollectionFetchError,
  { icon: React.ReactNode; title: string; description: string }
> = {
  forbidden: {
    icon: <FaLock aria-hidden />,
    title: 'Kein Zugriff auf dieses Notebook',
    description:
      'Du bist eingeloggt, aber dieses Notebook ist nicht für dich freigegeben. Frag die Person, die es geteilt hat, um Zugriff – oder schau in deinen eigenen Notebooks weiter.',
  },
  'not-found': {
    icon: <FaSearch aria-hidden />,
    title: 'Notebook nicht gefunden',
    description:
      'Den Link gibt es nicht (mehr). Vielleicht wurde das Notebook gelöscht oder die Adresse hat sich vertippt.',
  },
  unknown: {
    icon: <FaExclamationTriangle aria-hidden />,
    title: 'Notebook konnte nicht geladen werden',
    description:
      'Beim Laden ist etwas schiefgelaufen. Probier es gleich noch einmal – falls es weiter klemmt, schau später wieder rein.',
  },
};

export function NotebookAccessError({ variant, onRetry }: NotebookAccessErrorProps) {
  const { icon, title, description } = COPY[variant];
  return (
    <div className="flex flex-1 items-center justify-center p-md">
      <Empty className="max-w-lg border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-sm">
            {variant === 'unknown' && onRetry && (
              <Button variant="brand-outline" size="brand" onClick={onRetry}>
                Erneut versuchen
              </Button>
            )}
            <Button variant="brand" size="brand" asChild>
              <Link to="/notebooks">Zu deinen Notebooks</Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
