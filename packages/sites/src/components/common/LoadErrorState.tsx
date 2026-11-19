import { Button } from '@gruenerator/ui';

interface LoadErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function LoadErrorState({
  title = 'Deine Website konnte nicht geladen werden',
  message = 'Bitte prüfe deine Verbindung und versuche es noch einmal.',
  onRetry,
}: LoadErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex min-h-full flex-col items-center justify-center gap-md p-lg text-center"
    >
      <h2 className="m-0 text-lg text-foreground">{title}</h2>
      <p className="m-0 text-grey-600 dark:text-grey-400">{message}</p>
      {onRetry && <Button onClick={onRetry}>Erneut versuchen</Button>}
    </div>
  );
}
